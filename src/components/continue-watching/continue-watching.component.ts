import { Component, ChangeDetectionStrategy, signal, inject, computed, effect, viewChild, ElementRef, DestroyRef, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { fromEvent } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { toSignal, takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { ContinueWatchingService } from '../../services/continue-watching.service';
import { MovieService } from '../../services/movie.service';
import { NavigationService } from '../../services/navigation.service';
import { VideoCardComponent } from '../video-card/video-card.component';

import { ContinueWatchingItem } from '../../models/continue-watching.model';
import { MediaType, Episode, TvShow } from '../../models/movie.model';

@Component({
  selector: 'app-continue-watching',
  standalone: true,
  imports: [CommonModule, VideoCardComponent],
  templateUrl: './continue-watching.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContinueWatchingComponent {
  private continueWatchingService = inject(ContinueWatchingService);
  private movieService = inject(MovieService);
  private navigationService = inject(NavigationService);
  private destroyRef = inject(DestroyRef);
  private platformId = inject(PLATFORM_ID);

  suggestions = this.continueWatchingService.items;
  isLoading = signal(false);
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
  
  protected isTouch =
    isPlatformBrowser(this.platformId) &&
    (navigator.maxTouchPoints > 0 ||
      "ontouchstart" in window ||
      (typeof window !== "undefined" &&
        window.matchMedia &&
        window.matchMedia("(pointer: coarse)").matches));
  // --- End Scrolling Logic ---

  constructor() {
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
  
  getCardMedia(suggestion: ContinueWatchingItem): MediaType {
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

  onMediaClicked(suggestion: ContinueWatchingItem): void {
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

  onRemove(suggestion: ContinueWatchingItem): void {
    this.continueWatchingService.removeItem(suggestion.id);
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
    // FIX: Check if the click originated inside a modal or other fixed element.
    // This prevents the drag-scroll from interfering with modal interactions.
    let targetElement = e.target as HTMLElement | null;
    while (targetElement && targetElement !== e.currentTarget) {
        if (window.getComputedStyle(targetElement).position === 'fixed') {
            return; // It's a modal, don't start drag.
        }
        targetElement = targetElement.parentElement;
    }

    const element = this.scrollContainer()?.nativeElement;
    if (!element || this.isTouch) return;
    
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