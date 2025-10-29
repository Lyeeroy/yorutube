import { Component, ChangeDetectionStrategy, input, computed, signal, inject, output, HostListener, ElementRef } from '@angular/core';
import { MediaType, Movie, TvShowDetails, MovieDetails, Network, SubscribableChannel, ProductionCompany, Video, BelongsToCollection, Episode } from '../../models/movie.model';
import { CommonModule, NgOptimizedImage } from '@angular/common';
import { MovieService } from '../../services/movie.service';
import { SubscriptionService } from '../../services/subscription.service';
import { WatchlistService } from '../../services/watchlist.service';
import { NavigationService } from '../../services/navigation.service';
import { AddToPlaylistModalComponent } from '../add-to-playlist-modal/add-to-playlist-modal.component';
import { PlaylistService } from '../../services/playlist.service';
import { PlayerService, PlayerType } from '../../services/player.service';
import { EpisodeSelectorComponent } from '../episode-selector/episode-selector.component';

const isMovie = (media: MediaType | TvShowDetails | MovieDetails): media is Movie | MovieDetails => media.media_type === 'movie';
const isTvShowDetails = (media: MediaType | TvShowDetails | MovieDetails): media is TvShowDetails => media.media_type === 'tv' && 'seasons' in media;

@Component({
  selector: 'app-video-info',
  standalone: true,
  imports: [CommonModule, NgOptimizedImage, AddToPlaylistModalComponent, EpisodeSelectorComponent],
  templateUrl: './video-info.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VideoInfoComponent {
  // Inputs & Outputs
  media = input.required<MovieDetails | TvShowDetails>();
  genreMap = input.required<Map<number, string>>();
  currentEpisode = input<Episode | null>(null);
  videoDetails = input<Video | null>(null);
  episodeSelected = output<{ episode: Episode, seasonNumber: number }>();
  refreshPlayer = output<void>();

  // Injected Services
  private movieService = inject(MovieService);
  private subscriptionService = inject(SubscriptionService);
  private watchlistService = inject(WatchlistService);
  private playlistService = inject(PlaylistService);
  private navigationService = inject(NavigationService);
  private playerService = inject(PlayerService);
  private elementRef = inject(ElementRef);

  // UI State Signals
  descriptionExpanded = signal(false);
  showPlaylistModal = signal(false);
  showMoreOptionsMenu = signal(false);
  showSourcesDropdown = signal(false);

  // --- DERIVED & ASYNC STATE ---
  selectedPlayer = this.playerService.selectedPlayer;
  autoNextEnabled = this.playerService.autoNextEnabled;

  // Media type-specific details derived from input
  movieDetails = computed(() => isMovie(this.media()) ? this.media() as MovieDetails : null);
  tvShowDetails = computed(() => isTvShowDetails(this.media()) ? this.media() as TvShowDetails : null);

  // Computed properties for display
  mediaTitle = computed(() => {
    const currentMedia = this.media();
    return isMovie(currentMedia) ? currentMedia.title : currentMedia.name;
  });

  releaseDateInfo = computed(() => {
    const media = this.media();
    const dateString = isMovie(media) ? media.release_date : media.first_air_date;
    if (!dateString) {
      return '';
    }
    try {
      const date = new Date(dateString);
      const now = new Date();
      const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

      if (seconds < 0) {
        return 'Upcoming';
      }
      
      let interval = seconds / 31536000;
      if (interval > 1) {
        const years = Math.floor(interval);
        return `${years} year${years > 1 ? 's' : ''} ago`;
      }
      interval = seconds / 2592000;
      if (interval > 1) {
        const months = Math.floor(interval);
        return `${months} month${months > 1 ? 's' : ''} ago`;
      }
      interval = seconds / 86400;
      if (interval > 1) {
        const days = Math.floor(interval);
        return `${days} day${days > 1 ? 's' : ''} ago`;
      }
      return 'Recently';
    } catch (e) {
      return '';
    }
  });

  releaseYear = computed(() => {
    const media = this.media();
    const dateStr = isMovie(media) ? media.release_date : media.first_air_date;
    if (!dateStr) return '';
    return new Date(dateStr).getFullYear().toString();
  });

  runtimeInfo = computed(() => {
    const media = this.media();
    if (isMovie(media)) {
      const runtime = (media as MovieDetails).runtime;
      if (!runtime || runtime <= 0) return '';
      const hours = Math.floor(runtime / 60);
      const minutes = runtime % 60;
      let result = '';
      if (hours > 0) result += `${hours}h `;
      if (minutes > 0) result += `${minutes}m`;
      return result.trim();
    } else if (isTvShowDetails(media)) {
      const seasons = media.number_of_seasons;
      return `${seasons} Season${seasons > 1 ? 's' : ''}`;
    }
    return '';
  });
  
  genres = computed(() => {
    const media = this.media();
    const genreMap = this.genreMap();
    if (!media.genre_ids || !genreMap) return [];
    return media.genre_ids
      .map(id => genreMap.get(id))
      .filter((name): name is string => !!name);
  });
  
  genresString = computed(() => {
    return this.genres().join(', ');
  });

  overview = computed(() => {
    return this.currentEpisode()?.overview || this.media().overview;
  });

  topCast = computed(() => {
    const credits = (this.media() as MovieDetails | TvShowDetails).credits;
    if (!credits || !credits.cast) return [];
    return credits.cast.slice(0, 10);
  });

  castString = computed(() => {
    const cast = this.topCast().slice(0, 5);
    if (cast.length === 0) return '';
    const totalCast = (this.media() as MovieDetails | TvShowDetails).credits?.cast.length ?? 0;
    const names = cast.map(c => c.name).join(', ');
    if (totalCast > 5) {
      return `${names}, and more`;
    }
    return names;
  });

  director = computed(() => {
    const media = this.media();
    if (isMovie(media)) {
        const credits = (media as MovieDetails).credits;
        const director = credits?.crew.find(member => member.job === 'Director');
        return director ? director.name : null;
    }
    return null;
  });
  
  creators = computed(() => {
      const media = this.media();
      if(isTvShowDetails(media)) {
          return media.created_by;
      }
      return [];
  });

  creatorsString = computed(() => {
    return this.creators().map(c => c.name).join(', ');
  });

  writers = computed(() => {
    const credits = (this.media() as MovieDetails | TvShowDetails).credits;
    if (!credits || !credits.crew) return [];
    const writers = credits.crew.filter(member => member.department === 'Writing');
    return [...new Set(writers.map(w => w.name))].slice(0, 3);
  });
  
  writersString = computed(() => {
    return this.writers().join(', ');
  });

  subscribableChannel = computed<SubscribableChannel | null>(() => {
    const media = this.media();
    if (isTvShowDetails(media) && media.networks?.[0]) {
      return { ...media.networks[0], type: 'network' };
    }
    if (isMovie(media) && 'production_companies' in media && media.production_companies?.[0]) {
      const company = media.production_companies.find(c => c.logo_path) ?? media.production_companies[0];
      return { ...company, type: 'company' };
    }
    return null;
  });

  channelInfo = computed(() => {
    const channel = this.subscribableChannel();
    if (!channel) return null;
    return {
      name: channel.name,
      logoUrl: channel.logo_path ? `https://image.tmdb.org/t/p/h60${channel.logo_path}` : null
    };
  });

  isSubscribed = computed(() => {
    const channel = this.subscribableChannel();
    return channel ? this.subscriptionService.isSubscribed(channel.id) : false;
  });

  isOnWatchlist = computed(() => this.watchlistService.isOnWatchlist(this.media().id));

  isInPlaylist = computed(() => this.playlistService.isMediaInAnyPlaylist(this.media().id));

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.showMoreOptionsMenu.set(false);
      this.showSourcesDropdown.set(false);
    }
  }

  toggleMoreOptionsMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.showSourcesDropdown.set(false);
    this.showMoreOptionsMenu.update(v => !v);
  }

  toggleSourcesDropdown(event: MouseEvent): void {
    event.stopPropagation();
    this.showMoreOptionsMenu.set(false);
    this.showSourcesDropdown.update(v => !v);
  }

  toggleDescription(): void {
    if (this.overview()) {
      this.descriptionExpanded.update(v => !v);
    }
  }

  onChannelClick(): void {
    const channel = this.subscribableChannel();
    if (channel) {
      this.navigationService.navigateTo('channel', channel);
    }
  }

  toggleSubscription(): void {
    const channel = this.subscribableChannel();
    if (!channel) return;

    if (this.isSubscribed()) {
      this.subscriptionService.removeSubscription(channel.id);
    } else {
      this.subscriptionService.addSubscription(channel);
    }
  }

  toggleWatchlist(): void {
    const currentMedia = this.media();
    if (this.isOnWatchlist()) {
      this.watchlistService.removeFromWatchlist(currentMedia.id);
    } else {
      this.watchlistService.addToWatchlist(currentMedia);
    }
  }

  selectPlayer(player: PlayerType): void {
    this.playerService.selectPlayer(player);
    this.showSourcesDropdown.set(false);
  }

  onWatchTrailerClick(): void {
    this.playerService.selectPlayer('YouTube');
    this.showMoreOptionsMenu.set(false);
  }

  toggleAutoNext(): void {
    this.playerService.toggleAutoNext();
  }

  onRefreshPlayerClick(): void {
    this.refreshPlayer.emit();
    this.showMoreOptionsMenu.set(false);
  }

  goToCollection(collection: BelongsToCollection): void {
    this.navigationService.navigateTo('collection-detail', { id: collection.id });
  }
}
