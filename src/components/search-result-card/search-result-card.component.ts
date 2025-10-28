import { Component, ChangeDetectionStrategy, input, computed, output, inject, signal, effect, ElementRef, HostListener } from '@angular/core';
import { MediaType, Movie, TvShow, MovieDetails, TvShowDetails, ProductionCompany, Network, SubscribableChannel } from '../../models/movie.model';
import { NgOptimizedImage, CommonModule } from '@angular/common';
import { MovieService } from '../../services/movie.service';
import { WatchlistService } from '../../services/watchlist.service';
import { NavigationService } from '../../services/navigation.service';
import { AddToPlaylistModalComponent } from '../add-to-playlist-modal/add-to-playlist-modal.component';
import { PlaylistService } from '../../services/playlist.service';
import { Observable } from 'rxjs';
import { PlaybackProgressService } from '../../services/playback-progress.service';
import { MediaDetailModalComponent } from '../media-detail-modal/media-detail-modal.component';

const isMovie = (media: MediaType): media is Movie => media.media_type === 'movie';

@Component({
  selector: 'app-search-result-card',
  standalone: true,
  imports: [NgOptimizedImage, CommonModule, AddToPlaylistModalComponent, MediaDetailModalComponent],
  templateUrl: './search-result-card.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchResultCardComponent {
  media = input.required<MediaType>();
  genreMap = input.required<Map<number, string>>();
  isPriority = input<boolean>(false);
  mediaClicked = output<void>();

  private movieService = inject(MovieService);
  private watchlistService = inject(WatchlistService);
  private playlistService = inject(PlaylistService);
  private navigationService = inject(NavigationService);
  private playbackProgressService = inject(PlaybackProgressService);
  private elementRef = inject(ElementRef);
  details = signal<MovieDetails | TvShowDetails | null>(null);
  showOptionsMenu = signal(false);
  showPlaylistModal = signal(false);
  showDetailsModal = signal(false);

  progress = computed(() => {
    const mediaId = this.media().id;
    const progressData = this.playbackProgressService.getProgress(mediaId);
    if (progressData) {
      return progressData.progress;
    }
    return 0;
  });

  constructor() {
    effect((onCleanup) => {
      const currentMedia = this.media();
      this.details.set(null); // Reset before fetching new details
      
      // FIX: The `subscribe` method cannot be called on a union of observables (Observable<MovieDetails> | Observable<TvShowDetails>)
      // due to incompatible signatures. Explicitly typing `details$` as `Observable<MovieDetails | TvShowDetails>` resolves this.
      const details$: Observable<MovieDetails | TvShowDetails> = isMovie(currentMedia)
        ? this.movieService.getMovieDetails(currentMedia.id)
        : this.movieService.getTvShowDetails(currentMedia.id);
        
      const sub = details$.subscribe(details => {
          this.details.set(details);
        });
      
      onCleanup(() => {
        sub.unsubscribe();
      });
    });
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.showOptionsMenu() && !this.elementRef.nativeElement.contains(event.target)) {
      this.showOptionsMenu.set(false);
    }
  }

  toggleOptionsMenu(event: Event): void {
    event.stopPropagation();
    this.showOptionsMenu.update(v => !v);
  }

  openPlaylistModal(event: Event): void {
    event.stopPropagation();
    this.showPlaylistModal.set(true);
    this.showOptionsMenu.set(false);
  }

  openDetailsModal(event: Event): void {
    event.stopPropagation();
    this.showDetailsModal.set(true);
    this.showOptionsMenu.set(false);
  }

  isOnWatchlist = computed(() => this.watchlistService.isOnWatchlist(this.media().id));
  isInPlaylist = computed(() => this.playlistService.isMediaInAnyPlaylist(this.media().id));

  toggleWatchlist(event: Event) {
    event.stopPropagation();
    const currentMedia = this.media();
    if (this.isOnWatchlist()) {
      this.watchlistService.removeFromWatchlist(currentMedia.id);
    } else {
      this.watchlistService.addToWatchlist(currentMedia);
    }
  }

  onChannelClick(event: Event): void {
    event.stopPropagation();
    const channel = this.subscribableChannel();
    if (channel) {
      this.navigationService.navigateTo('channel', channel);
    }
  }

  subscribableChannel = computed<SubscribableChannel | null>(() => {
    const details = this.details();
    if (!details) return null;

    const mediaType = this.media().media_type;

    if (mediaType === 'tv' && 'networks' in details && details.networks.length > 0) {
      const network = details.networks[0];
      if (network) {
        return { ...network, type: 'network' };
      }
    } else if (mediaType === 'movie' && 'production_companies' in details && details.production_companies.length > 0) {
      const company = details.production_companies.find(c => c.logo_path) ?? details.production_companies[0];
      if (company) {
        return { ...company, type: 'company' };
      }
    }
    
    return null;
  });

  channelLogoUrl = computed(() => {
    const details = this.details();
    if (!details) return null;

    let companyOrNetwork: ProductionCompany | Network | undefined;
    const mediaType = this.media().media_type;

    if (mediaType === 'movie' && 'production_companies' in details && details.production_companies.length > 0) {
        companyOrNetwork = details.production_companies.find(c => c.logo_path);
    } else if (mediaType === 'tv' && 'networks' in details && details.networks.length > 0) {
        companyOrNetwork = details.networks[0];
    }
    
    return companyOrNetwork?.logo_path ? `https://image.tmdb.org/t/p/w92${companyOrNetwork.logo_path}` : null;
  });

  thumbnailUrl = computed(() => {
    const path = this.media().backdrop_path;
    return path
      ? `https://image.tmdb.org/t/p/w500${path}`
      : 'https://picsum.photos/480/270?grayscale';
  });

  mediaTitle = computed(() => {
    const currentMedia = this.media();
    return isMovie(currentMedia) ? currentMedia.title : currentMedia.name;
  });
  
  channelName = computed(() => {
    const details = this.details();
    if (details) {
        const mediaType = this.media().media_type;
        if (mediaType === 'movie' && 'production_companies' in details && details.production_companies.length > 0) {
            const company = details.production_companies.find(c => c.logo_path) ?? details.production_companies[0];
            if (company) return company.name;
        } else if (mediaType === 'tv' && 'networks' in details && details.networks.length > 0) {
            const network = details.networks[0];
            if (network) return network.name;
        }
    }

    return null;
  });

  relativeTime = computed(() => {
    // FIX: Use a local variable for the media item to ensure correct type narrowing.
    const currentMedia = this.media();
    const dateString = isMovie(currentMedia) ? currentMedia.release_date : currentMedia.first_air_date;
    if (!dateString) {
      return 'N/A';
    }
    try {
      const date = new Date(dateString);
      const now = new Date();
      const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

      if (seconds < 0) {
        const futureSeconds = -seconds;
        const days = Math.floor(futureSeconds / 86400);
        if (days > 365) {
          const years = Math.floor(days / 365);
          return `Releasing in ${years} year${years > 1 ? 's' : ''}`;
        }
        if (days > 30) {
          const months = Math.floor(days / 30);
          return `Releasing in ${months} month${months > 1 ? 's' : ''}`;
        }
        if (days > 0) {
          return `Releasing in ${days} day${days > 1 ? 's' : ''}`;
        }
        return 'Releasing soon';
      }
      
      let interval = seconds / 31536000;
      if (interval > 1) {
        return Math.floor(interval) + " years ago";
      }
      interval = seconds / 2592000;
      if (interval > 1) {
        return Math.floor(interval) + " months ago";
      }
      interval = seconds / 86400;
      if (interval > 1) {
        return Math.floor(interval) + " days ago";
      }
      return 'Recently';
    } catch (e) {
      return 'N/A';
    }
  });

  primaryGenre = computed(() => {
    const map = this.genreMap();
    const ids = this.media().genre_ids;
    if (!map || !ids || ids.length === 0) {
      return null;
    }
    return map.get(ids[0]) || null;
  });
}
