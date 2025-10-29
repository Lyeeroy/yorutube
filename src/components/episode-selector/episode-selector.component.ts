import { Component, ChangeDetectionStrategy, input, computed, signal, inject, effect, output, untracked } from '@angular/core';
import { TvShowDetails, Season, Episode, SeasonDetails } from '../../models/movie.model';
import { CommonModule, NgOptimizedImage } from '@angular/common';
import { MovieService } from '../../services/movie.service';
import { PlaybackProgressService } from '../../services/playback-progress.service';

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

  // UI State Signals
  expandedEpisodeId = signal<number | null>(null);

  // Reactive season details loading
  private selectedSeasonTrigger = signal<{ tvId: number; seasonNumber: number } | null>(null);
  seasonDetailsResource = signal<{ loading: boolean; data: SeasonDetails | null; error: any }>({ loading: false, data: null, error: null });
  
  // Signals for template compatibility
  loadingSeason = computed(() => this.seasonDetailsResource().loading);
  selectedSeasonDetails = computed(() => this.seasonDetailsResource().data);

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
      if (currentData && currentData.season_number === trigger.seasonNumber && untracked(this.tvShowDetails)?.id === trigger.tvId) {
          return;
      }

      this.seasonDetailsResource.set({ loading: true, data: null, error: null });
      const sub = this.movieService.getSeasonDetails(trigger.tvId, trigger.seasonNumber)
        .subscribe({
          next: data => this.seasonDetailsResource.set({ loading: false, data, error: null }),
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
}