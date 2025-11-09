import { Component, ChangeDetectionStrategy, input, computed, signal, inject, effect, output, untracked, viewChild, ElementRef, DestroyRef } from '@angular/core';
import { TvShowDetails, Season, Episode, SeasonDetails } from '../../models/movie.model';
import { CommonModule, NgOptimizedImage } from '@angular/common';
import { MovieService } from '../../services/movie.service';
import { PlaybackProgressService } from '../../services/playback-progress.service';
import { fromEvent } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-episode-selector',
  standalone: true,
  imports: [CommonModule, NgOptimizedImage],
  templateUrl: './episode-selector.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EpisodeSelectorComponent {
  // Inputs & Outputs
  tvShowDetails = input.required<TvShowDetails>();
  currentEpisode = input<Episode | null>(null);
  episodeSelected = output<{ episode: Episode, seasonNumber: number }>();

  // Injected Services
  private movieService = inject(MovieService);
  private playbackProgressService = inject(PlaybackProgressService);
  private destroyRef = inject(DestroyRef);

  // UI State Signals
  expandedEpisodeId = signal<number | null>(null);

  // Reactive season details loading
  private selectedSeasonTrigger = signal<{ tvId: number; seasonNumber: number } | null>(null);
  seasonDetailsResource = signal<{ loading: boolean; data: (SeasonDetails & { tvId: number; }) | null; error: any }>({ loading: false, data: null, error: null });
  
  // Signals for template compatibility
  loadingSeason = computed(() => this.seasonDetailsResource().loading);
  selectedSeasonDetails = computed(() => this.seasonDetailsResource().data);

  // Horizontal Scrolling for Seasons
  scrollContainer = viewChild<ElementRef<HTMLElement>>('scrollContainer');
  canScrollLeft = signal(false);
  canScrollRight = signal(false);
  private checkScrollTimeout: number | null = null;
  
  // Drag-to-scroll properties
  private isMouseDown = false;
  private startX = 0;
  private scrollLeft = 0;
  private hasDragged = false;
  isGrabbing = signal(false);


  constructor() {
    // This effect fetches season details whenever the trigger changes.
    // The trigger is updated by user clicks or by the second effect syncing with inputs.
    effect((onCleanup) => {
      const trigger = this.selectedSeasonTrigger();

      if (!trigger) {
        this.seasonDetailsResource.set({ loading: false, data: null, error: null });
        return;
      }

      // Avoid re-fetching if we already have the correct data for this show
      const currentData = untracked(() => this.seasonDetailsResource().data);
      if (currentData && currentData.season_number === trigger.seasonNumber && currentData.tvId === trigger.tvId) {
          return;
      }

      this.seasonDetailsResource.set({ loading: true, data: null, error: null });
      const sub = this.movieService.getSeasonDetails(trigger.tvId, trigger.seasonNumber)
        .subscribe({
          next: data => {
            const augmentedData = data ? { ...data, tvId: trigger.tvId } : null;
            this.seasonDetailsResource.set({ loading: false, data: augmentedData, error: null });
          },
          error: err => this.seasonDetailsResource.set({ loading: false, data: null, error: err })
        });

      onCleanup(() => sub.unsubscribe());
    });

    // This effect syncs the selected season with the component inputs (`tvShowDetails` and `currentEpisode`).
    effect(() => {
      const tvDetails = this.tvShowDetails();
      const currentEp = this.currentEpisode();
      
      if (!tvDetails) {
        return;
      }

      let seasonToSelect: Season | undefined;
      if (currentEp) {
        seasonToSelect = tvDetails.seasons.find(s => s.season_number === currentEp.season_number);
      } else if (tvDetails.seasons.length > 0) {
        seasonToSelect = tvDetails.seasons.find(s => s.season_number > 0) || tvDetails.seasons[0];
      }

      if (seasonToSelect) {
        this.selectSeason(seasonToSelect);
      }
    }, { allowSignalWrites: true });

    // This effect checks for scrollbar visibility when the view updates
    effect(() => {
      this.tvShowDetails(); 
      this.scrollContainer();
      if (this.checkScrollTimeout !== null) {
        clearTimeout(this.checkScrollTimeout);
      }
      this.checkScrollTimeout = window.setTimeout(() => {
        this.checkScroll();
        this.checkScrollTimeout = null;
      }, 100);
    });

    fromEvent(window, 'resize').pipe(
      debounceTime(200),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(() => this.checkScroll());
  }

  getProgress(mediaId: number): number {
    const progressData = this.playbackProgressService.getProgress(mediaId);
    if (progressData) {
      return progressData.progress;
    }
    return 0;
  }

  selectSeason(season: Season): void {
    const tvId = this.tvShowDetails()?.id;
    if (tvId) {
      this.selectedSeasonTrigger.set({ tvId, seasonNumber: season.season_number });
    }
  }

  selectEpisode(episode: Episode, seasonNumber: number): void {
    this.episodeSelected.emit({ episode, seasonNumber });
  }

  toggleEpisodeDescription(episodeId: number): void {
    this.expandedEpisodeId.update(current => current === episodeId ? null : episodeId);
  }

  getRelativeTime(dateString?: string | null): string {
    if (!dateString) { return ''; }
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return '';
      const now = new Date();
      const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

      if (seconds < 0) {
        return 'Upcoming';
      }
      
      const years = Math.floor(seconds / 31536000);
      if (years > 0) {
        return `${years} year${years > 1 ? 's' : ''} ago`;
      }
      
      const months = Math.floor(seconds / 2592000);
      if (months > 0) {
          return `${months} month${months > 1 ? 's' : ''} ago`;
      }

      const days = Math.floor(seconds / 86400);
      if (days > 1) {
          return `${days} days ago`;
      }
      if (days === 1) {
          return 'Yesterday';
      }
      
      return 'Today';
    } catch (e) {
      return '';
    }
  }

  // --- Scroll Logic ---
  onSeasonClick(season: Season): void {
    if (this.hasDragged) {
      return;
    }
    this.selectSeason(season);
  }

  checkScroll(): void {
    const element = this.scrollContainer()?.nativeElement;
    if (!element) return;
    
    const hasOverflow = element.scrollWidth > element.clientWidth;
    const atStart = element.scrollLeft < 5;
    const atEnd = element.scrollWidth - element.clientWidth - element.scrollLeft < 5;
    
    this.canScrollLeft.set(hasOverflow && !atStart);
    this.canScrollRight.set(hasOverflow && !atEnd);
  }

  scroll(direction: 'left' | 'right'): void {
    const element = this.scrollContainer()?.nativeElement;
    if (!element) return;

    const scrollAmount = element.clientWidth * 0.75;
    const scrollValue = direction === 'left' ? -scrollAmount : scrollAmount;
    
    element.scrollBy({
      left: scrollValue,
      behavior: 'smooth'
    });
  }

  onMouseDown(e: MouseEvent): void {
    const element = this.scrollContainer()?.nativeElement;
    if (!element) return;
    
    e.preventDefault();
    
    this.isMouseDown = true;
    this.hasDragged = false;
    this.isGrabbing.set(true);
    this.startX = e.pageX - element.offsetLeft;
    this.scrollLeft = element.scrollLeft;
  }

  onMouseLeave(): void {
    this.isMouseDown = false;
    this.isGrabbing.set(false);
  }

  onMouseUp(): void {
    this.isMouseDown = false;
    this.isGrabbing.set(false);
  }

  onMouseMove(e: MouseEvent): void {
    if (!this.isMouseDown) return;
    e.preventDefault();
    const element = this.scrollContainer()?.nativeElement;
    if (!element) return;

    const x = e.pageX - element.offsetLeft;
    const walk = x - this.startX;
    
    if (Math.abs(walk) > 5) {
        this.hasDragged = true;
    }

    element.scrollLeft = this.scrollLeft - walk;
  }
}
