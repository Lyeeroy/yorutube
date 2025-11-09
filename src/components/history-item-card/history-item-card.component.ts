import { Component, ChangeDetectionStrategy, input, computed, output, inject, signal, effect, ElementRef, HostListener } from '@angular/core';
import { NgOptimizedImage, CommonModule } from '@angular/common';
import { HistoryItem } from '../../models/history.model';
import { SubscribableChannel, MovieDetails, TvShowDetails, ProductionCompany, Network, Movie, TvShow, MediaType } from '../../models/movie.model';
import { MovieService } from '../../services/movie.service';
import { AddToPlaylistModalComponent } from '../add-to-playlist-modal/add-to-playlist-modal.component';
import { WatchlistService } from '../../services/watchlist.service';
import { PlaylistService } from '../../services/playlist.service';
import { Observable } from 'rxjs';
import { PlaybackProgressService } from '../../services/playback-progress.service';
import { MediaDetailModalComponent } from '../media-detail-modal/media-detail-modal.component';

const isMovie = (media: MediaType): media is Movie => media.media_type === 'movie';

@Component({
  selector: 'app-history-item-card',
  standalone: true,
  imports: [NgOptimizedImage, CommonModule, AddToPlaylistModalComponent, MediaDetailModalComponent],
  templateUrl: './history-item-card.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HistoryItemCardComponent {
  item = input.required<HistoryItem>();
  isPriority = input<boolean>(false);
  
  remove = output<string>();
  mediaClicked = output<void>();
  channelClicked = output<SubscribableChannel>();

  private movieService = inject(MovieService);
  private watchlistService = inject(WatchlistService);
  private playlistService = inject(PlaylistService);
  private playbackProgressService = inject(PlaybackProgressService);
  private elementRef = inject(ElementRef);
  details = signal<MovieDetails | TvShowDetails | null>(null);
  showPlaylistModal = signal(false);
  menuStyle = signal<{ top: string; right: string } | null>(null);
  showDetailsModal = signal(false);

  isOnWatchlist = computed(() => this.watchlistService.isOnWatchlist(this.item().media.id));
  isInPlaylist = computed(() => this.playlistService.isMediaInAnyPlaylist(this.item().media.id));
  
  progress = computed(() => {
    const historyItem = this.item();
    const progressId = historyItem.episode ? historyItem.episode.id : historyItem.media.id;
    const progressData = this.playbackProgressService.getProgress(progressId);
    if (progressData) {
      return progressData.progress;
    }
    return 0;
  });

  constructor() {
    effect((onCleanup) => {
      const currentMedia = this.item().media;
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

  @HostListener('document:click')
  onDocumentClick(): void {
    if (this.menuStyle()) {
      this.menuStyle.set(null);
    }
  }

  toggleOptionsMenu(event: MouseEvent): void {
    event.stopPropagation();
    if (this.menuStyle()) {
      this.menuStyle.set(null);
      return;
    }

    const button = event.currentTarget as HTMLElement;
    const rect = button.getBoundingClientRect();
    const viewportWidth = window.innerWidth;

    const style = {
      top: `${rect.bottom + 4}px`,
      right: `${viewportWidth - (rect.left + rect.width / 2)}px`,
    };
    
    this.menuStyle.set(style);
  }

  toggleWatchlist(event: Event) {
    event.stopPropagation();
    const currentMedia = this.item().media;
    if (this.isOnWatchlist()) {
      this.watchlistService.removeFromWatchlist(currentMedia.id);
    } else {
      this.watchlistService.addToWatchlist(currentMedia);
    }
    this.menuStyle.set(null);
  }

  openPlaylistModal(event: Event): void {
    event.stopPropagation();
    this.showPlaylistModal.set(true);
    this.menuStyle.set(null);
  }

  openDetailsModal(event: Event): void {
    event.stopPropagation();
    this.showDetailsModal.set(true);
    this.menuStyle.set(null);
  }

  onRemove(event: Event): void {
    event.stopPropagation();
    this.remove.emit(this.item().id);
    this.menuStyle.set(null);
  }

  onChannelClick(event: Event): void {
    event.stopPropagation();
    const channel = this.subscribableChannel();
    if (channel) {
      this.channelClicked.emit(channel);
    }
  }

  subscribableChannel = computed<SubscribableChannel | null>(() => {
    const details = this.details();
    if (!details) return null;

    const mediaType = this.item().media.media_type;

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
    const mediaType = this.item().media.media_type;

    if (mediaType === 'movie' && 'production_companies' in details && details.production_companies.length > 0) {
        companyOrNetwork = details.production_companies.find(c => c.logo_path);
    } else if (mediaType === 'tv' && 'networks' in details && details.networks.length > 0) {
        companyOrNetwork = details.networks[0];
    }
    
    return companyOrNetwork?.logo_path ? `https://image.tmdb.org/t/p/w92${companyOrNetwork.logo_path}` : null;
  });

  thumbnailUrl = computed(() => {
    const episode = this.item().episode;
    if (episode?.still_path) {
      return `https://image.tmdb.org/t/p/w500${episode.still_path}`;
    }
    const path = this.item().media.backdrop_path;
    return path
      ? `https://image.tmdb.org/t/p/w500${path}`
      : 'https://picsum.photos/480/270?grayscale';
  });

  mediaTitle = computed(() => {
    const media = this.item().media;
    const episode = this.item().episode;
    const baseTitle = isMovie(media) ? media.title : media.name;
    if (episode) {
      return `${baseTitle}: S${episode.season_number}E${episode.episode_number} ${episode.name}`;
    }
    return baseTitle;
  });
  
  channelName = computed(() => {
    const details = this.details();
    if (details) {
        const mediaType = this.item().media.media_type;
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

  overview = computed(() => {
    const episode = this.item().episode;
    if (episode?.overview) {
      return episode.overview;
    }
    return this.item().media.overview;
  });
}
