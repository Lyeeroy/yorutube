import { Component, ChangeDetectionStrategy, output, input, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule, NgOptimizedImage } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { MovieService } from '../../services/movie.service';
import { MediaType, MovieDetails, TvShowDetails } from '../../models/movie.model';
import { WatchlistService } from '../../services/watchlist.service';
import { AddToPlaylistModalComponent } from '../add-to-playlist-modal/add-to-playlist-modal.component';
import { NavigationService } from '../../services/navigation.service';

@Component({
  selector: 'app-media-detail-modal',
  standalone: true,
  imports: [CommonModule, NgOptimizedImage, AddToPlaylistModalComponent],
  templateUrl: './media-detail-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MediaDetailModalComponent implements OnInit, OnDestroy {
  media = input.required<MediaType>();
  close = output<void>();

  private movieService = inject(MovieService);
  private watchlistService = inject(WatchlistService);
  private sanitizer = inject(DomSanitizer);
  private navigationService = inject(NavigationService);

  details = signal<MovieDetails | TvShowDetails | null>(null);
  trailerUrl = signal<SafeResourceUrl | null>(null);
  loading = signal(true);
  showPlaylistModal = signal(false);

  backdropUrl = computed(() => {
    const path = this.details()?.backdrop_path;
    return path ? `https://image.tmdb.org/t/p/w1280${path}` : null;
  });

  posterUrl = computed(() => {
    const path = this.details()?.poster_path;
    return path ? `https://image.tmdb.org/t/p/w500${path}` : 'https://picsum.photos/500/750';
  });
  
  isOnWatchlist = computed(() => this.watchlistService.isOnWatchlist(this.media().id));

  ngOnInit() {
    this.loading.set(true);
    document.body.style.overflow = 'hidden';

    const mediaItem = this.media();
    const details$ = mediaItem.media_type === 'movie'
      ? this.movieService.getMovieDetails(mediaItem.id)
      : this.movieService.getTvShowDetails(mediaItem.id);
      
    details$.subscribe(d => {
      this.details.set(d);
      this.loadTrailer();
      this.loading.set(false);
    });
  }

  ngOnDestroy() {
    document.body.style.overflow = 'auto';
  }

  loadTrailer() {
    const d = this.details();
    if (!d) return;

    const videos = (d as any).videos?.results || [];
    const trailer = videos.find((v: any) => v.site === 'YouTube' && v.type === 'Trailer');
    
    if (trailer) {
      this.trailerUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(`https://www.youtube.com/embed/${trailer.key}`));
    }
  }

  playMedia(): void {
    const mediaItem = this.media();
    this.navigationService.navigateTo('watch', {
      mediaType: mediaItem.media_type,
      id: mediaItem.id,
      autoplay: true
    });
    this.close.emit();
  }

  toggleWatchlist(event: Event) {
    event.stopPropagation();
    const currentMedia = this.media();
    if (this.isOnWatchlist()) {
      this.watchlistService.removeFromWatchlist(currentMedia.id);
    } else {
      this.watchlistService.addToWatchlist(currentMedia);
    }
  }

  getYear(dateString: string | undefined): string {
    if (!dateString) return '';
    return new Date(dateString).getFullYear().toString();
  }
}
