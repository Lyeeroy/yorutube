import { Component, ChangeDetectionStrategy, signal, inject, computed, effect, viewChild, ElementRef, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { firstValueFrom, fromEvent } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { toSignal, takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { HistoryService } from '../../services/history.service';
import { PlaybackProgressService } from '../../services/playback-progress.service';
import { MovieService } from '../../services/movie.service';
import { NavigationService } from '../../services/navigation.service';
import { VideoCardComponent } from '../video-card/video-card.component';

import { HistoryItem } from '../../models/history.model';
import { MediaType, Episode, TvShow } from '../../models/movie.model';
import { PlaybackProgress } from '../../models/playback-progress.model';

interface ContinueWatchingSuggestion {
  media: MediaType;
  episode?: Episode;
}

@Component({
  selector: 'app-continue-watching',
  standalone: true,
  imports: [CommonModule, VideoCardComponent],
  templateUrl: './continue-watching.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContinueWatchingComponent {
  private historyService = inject(HistoryService);
  private playbackProgressService = inject(PlaybackProgressService);
  private movieService = inject(MovieService);
  private navigationService = inject(NavigationService);
  private destroyRef = inject(DestroyRef);

  suggestions = signal<ContinueWatchingSuggestion[] | null>(null);
  isLoading = signal(true);
  genreMap = toSignal(this.movieService.getCombinedGenreMap(), { initialValue: new Map() });

  // --- Scrolling Logic ---
  scrollContainer = viewChild<ElementRef<HTMLElement>>('scrollContainer');
  canScrollLeft = signal(false);
  canScrollRight = signal(false);
  private checkScrollTimeout: number | null = null;
  private isMouseDown = false;
  private startX = 0;
  private scrollLeft = 0;
  private hasDragged = false;
  isGrabbing = signal(false);
  // --- End Scrolling Logic ---

  constructor() {
    effect(() => {
      const history = this.historyService.history();
      const progressData = this.playbackProgressService.progressData();
      this.findSuggestions(history, progressData);
    });

    // --- Scrolling Effect ---
    effect(() => {
      this.suggestions(); 
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
    // --- End Scrolling Effect ---
  }

  private async findSuggestions(history: HistoryItem[], progressData: Record<number, PlaybackProgress>): Promise<void> {
    this.isLoading.set(true);
    const newSuggestions: ContinueWatchingSuggestion[] = [];
    const processedTvShows = new Set<number>();

    for (const historyItem of history) {
      if (historyItem.media.media_type === 'movie') {
        const progress = progressData[historyItem.media.id];
        if (progress && progress.progress < 95) {
          newSuggestions.push({ media: historyItem.media });
        }
      } else if (historyItem.media.media_type === 'tv') {
        const tvShowId = historyItem.media.id;
        if (processedTvShows.has(tvShowId)) {
          continue;
        }

        const progressId = historyItem.episode ? historyItem.episode.id : historyItem.media.id;
        const progress = progressData[progressId];
        const progressPercent = progress ? progress.progress : 0;

        if (progressPercent < 95) {
          if (historyItem.episode) { // Only add if there is a specific episode
            newSuggestions.push({ media: historyItem.media, episode: historyItem.episode });
            processedTvShows.add(tvShowId);
          }
        } else {
          if (historyItem.episode) {
            const nextEpisodeSuggestion = await this.findNextEpisode(historyItem.media, historyItem.episode);
            if (nextEpisodeSuggestion) {
              newSuggestions.push(nextEpisodeSuggestion);
              processedTvShows.add(tvShowId);
            }
          }
        }
      }
    }
    
    this.suggestions.set(newSuggestions);
    this.isLoading.set(false);
  }

  private async findNextEpisode(tvShow: MediaType, currentEpisode: Episode): Promise<ContinueWatchingSuggestion | null> {
    try {
      const tvShowDetails = await firstValueFrom(this.movieService.getTvShowDetails(tvShow.id));
      const seasonDetails = await firstValueFrom(this.movieService.getSeasonDetails(tvShow.id, currentEpisode.season_number));
      const currentIndex = seasonDetails.episodes.findIndex(e => e.id === currentEpisode.id);

      if (currentIndex > -1 && currentIndex < seasonDetails.episodes.length - 1) {
        return { media: tvShow, episode: seasonDetails.episodes[currentIndex + 1] };
      }

      const nextSeason = tvShowDetails.seasons.find(s => s.season_number === currentEpisode.season_number + 1);
      if (nextSeason?.episode_count > 0) {
        const nextSeasonDetails = await firstValueFrom(this.movieService.getSeasonDetails(tvShow.id, nextSeason.season_number));
        if (nextSeasonDetails.episodes.length > 0) {
          return { media: tvShow, episode: nextSeasonDetails.episodes[0] };
        }
      }
      
      return null;
    } catch (error) {
      console.error(`Error finding next episode for TV show ID ${tvShow.id}:`, error);
      return null;
    }
  }
  
  getCardMedia(suggestion: ContinueWatchingSuggestion): MediaType {
    if (suggestion.episode) {
      const tvShow = suggestion.media as TvShow;
      const episode = suggestion.episode;
      
      return {
        ...tvShow,
        name: `${tvShow.name}: S${episode.season_number}E${episode.episode_number} - ${episode.name}`,
        backdrop_path: episode.still_path ?? tvShow.backdrop_path,
        overview: episode.overview,
        vote_average: episode.vote_average > 0 ? episode.vote_average : tvShow.vote_average,
        first_air_date: episode.air_date ?? tvShow.first_air_date,
      };
    }
    return suggestion.media;
  }

  onMediaClicked(suggestion: ContinueWatchingSuggestion): void {
    if (this.hasDragged) return;

    const params: any = {
      mediaType: suggestion.media.media_type,
      id: suggestion.media.id,
      autoplay: true,
    };
    if (suggestion.episode) {
      params.season = suggestion.episode.season_number;
      params.episode = suggestion.episode.episode_number;
    }
    this.navigationService.navigateTo('watch', params);
  }

  // --- Scrolling Methods ---
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
    element.scrollBy({ left: direction === 'left' ? -scrollAmount : scrollAmount, behavior: 'smooth' });
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
  // --- End Scrolling Methods ---
}
