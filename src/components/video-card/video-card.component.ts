import {
  Component,
  ChangeDetectionStrategy,
  input,
  computed,
  output,
  inject,
  signal,
  effect,
  ElementRef,
  Renderer2,
  PLATFORM_ID,
} from "@angular/core";
import { isPlatformBrowser, NgClass, NgOptimizedImage } from "@angular/common";
import {
  MediaType,
  Movie,
  TvShow,
  MovieDetails,
  TvShowDetails,
  ProductionCompany,
  Network,
  SubscribableChannel,
} from "../../models/movie.model";
import { MovieService } from "../../services/movie.service";
import { WatchlistService } from "../../services/watchlist.service";
import { NavigationService } from "../../services/navigation.service";
import { AddToPlaylistModalComponent } from "../add-to-playlist-modal/add-to-playlist-modal.component";
import { PlaylistService } from "../../services/playlist.service";
import { Observable, Subscription } from "rxjs";
import { PlaybackProgressService } from "../../services/playback-progress.service";
import { MediaDetailModalComponent } from "../media-detail-modal/media-detail-modal.component";

// Pure helper function moved outside component to avoid re-creation
const getRelativeTime = (dateString?: string): string => {
  if (!dateString) return "N/A";
  try {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (seconds < 0) {
      const days = Math.floor(-seconds / 86400);
      if (days > 365)
        return `Releasing in ${Math.floor(days / 365)} year${
          days > 730 ? "s" : ""
        }`;
      if (days > 30)
        return `Releasing in ${Math.floor(days / 30)} month${
          days > 60 ? "s" : ""
        }`;
      if (days > 0) return `Releasing in ${days} day${days > 1 ? "s" : ""}`;
      return "Releasing soon";
    }

    const intervals = [
      { s: 31536000, label: "year" },
      { s: 2592000, label: "month" },
      { s: 86400, label: "day" },
      { s: 3600, label: "hour" },
      { s: 60, label: "minute" },
    ];

    for (const i of intervals) {
      const count = Math.floor(seconds / i.s);
      if (count >= 1) return `${count} ${i.label}${count > 1 ? "s" : ""} ago`;
    }
    return Math.floor(seconds) + " seconds ago";
  } catch {
    return "N/A";
  }
};

const isMovie = (media: MediaType): media is Movie =>
  media.media_type === "movie";

@Component({
  selector: "app-video-card",
  standalone: true,
  imports: [
    NgOptimizedImage,
    NgClass, // Replaces CommonModule for better tree-shaking
    AddToPlaylistModalComponent,
    MediaDetailModalComponent,
  ],
  templateUrl: "./video-card.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VideoCardComponent {
  media = input.required<MediaType>();
  genreMap = input.required<Map<number, string>>();
  isPriority = input<boolean>(false);
  layout = input<"grid" | "list">("grid");
  showRemoveFromContinueWatching = input<boolean>(false);
  progressMediaId = input<number | null>(null);

  mediaClicked = output<void>();
  removeFromContinueWatching = output<void>();

  private movieService = inject(MovieService);
  private watchlistService = inject(WatchlistService);
  private playlistService = inject(PlaylistService);
  private navigationService = inject(NavigationService);
  private playbackProgressService = inject(PlaybackProgressService);
  private renderer = inject(Renderer2);
  private platformId = inject(PLATFORM_ID);

  details = signal<MovieDetails | TvShowDetails | null>(null);
  menuStyle = signal<{ top: string; right: string } | null>(null);
  showPlaylistModal = signal(false);
  showDetailsModal = signal(false);
  tapRevealed = signal(false);

  // Cache device capability once
  isTouch =
    isPlatformBrowser(this.platformId) &&
    (navigator.maxTouchPoints > 0 || "ontouchstart" in window);

  // --- Computed Layout Signals ---

  isMovie = computed(() => this.media().media_type === "movie");

  containerClasses = computed(() => {
    return this.layout() === "grid"
      ? "flex flex-col w-full"
      : "flex flex-row space-x-3 w-full items-start";
  });

  imageContainerClasses = computed(() => {
    // Common aspect-video
    return this.layout() === "grid"
      ? "w-full aspect-video"
      : "w-2/5 aspect-video";
  });

  progress = computed(() => {
    const mediaId = this.progressMediaId() ?? this.media().id;
    const progressData = this.playbackProgressService.getProgress(mediaId);
    return progressData ? progressData.progress : 0;
  });

  constructor() {
    console.log('[VideoCard] Constructor - isTouch:', this.isTouch, {
      isPlatformBrowser: isPlatformBrowser(this.platformId),
      maxTouchPoints: isPlatformBrowser(this.platformId) ? navigator.maxTouchPoints : 'N/A',
      hasOntouchstart: isPlatformBrowser(this.platformId) ? 'ontouchstart' in window : 'N/A'
    });
    
    // Data Fetching Effect
    effect((onCleanup) => {
      // Only fetch if priority is true to save bandwidth
      // Only fetch if priority is true to save bandwidth
      // REMOVED: Fetching details for all cards to ensure Channel/Network is displayed instead of Genre
      // if (!this.isPriority()) {
      //   this.details.set(null);
      //   return;
      // }

      const currentMedia = this.media();
      this.details.set(null);

      const details$: Observable<MovieDetails | TvShowDetails> = isMovie(
        currentMedia
      )
        ? this.movieService.getMovieDetails(currentMedia.id)
        : this.movieService.getTvShowDetails(currentMedia.id);

      const sub: Subscription = details$.subscribe((res) =>
        this.details.set(res)
      );

      onCleanup(() => sub.unsubscribe());
    });

    // Menu Closer Effect
    effect((onCleanup) => {
      if (
        (this.menuStyle() || this.tapRevealed()) &&
        isPlatformBrowser(this.platformId)
      ) {
        const listeners = [
          this.renderer.listen("window", "scroll", () => this.closeMenus()),
          this.renderer.listen("window", "wheel", () => this.closeMenus()),
          this.renderer.listen("window", "touchmove", () => this.closeMenus()),
          this.renderer.listen("document", "click", () => this.closeMenus()),
        ];

        onCleanup(() => listeners.forEach((unlisten) => unlisten()));
      }
    });
  }

  closeMenus(): void {
    if (this.menuStyle()) this.menuStyle.set(null);
    if (this.tapRevealed()) this.tapRevealed.set(false);
  }

  onCardClick(event: Event): void {
    const target = event.target as HTMLElement;
    console.log('[VideoCard] Click detected', { 
      isTouch: this.isTouch, 
      tapRevealed: this.tapRevealed(),
      target: target.tagName,
      closestButton: target?.closest("button, a")
    });
    
    if (target?.closest("button, a")) {
      console.log('[VideoCard] Click on button/link, ignoring');
      return;
    }

    if (!this.isTouch) {
      console.log('[VideoCard] Non-touch device, playing immediately');
      this.mediaClicked.emit();
      return;
    }

    if (this.tapRevealed()) {
      console.log('[VideoCard] Second tap detected, playing video');
      this.mediaClicked.emit();
      return;
    }

    console.log('[VideoCard] First tap detected, revealing buttons');
    this.tapRevealed.set(true);
    setTimeout(() => this.tapRevealed.set(false), 3000);
  }

  toggleOptionsMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.tapRevealed.set(false);

    if (this.menuStyle()) {
      this.menuStyle.set(null);
      return;
    }

    const button = event.currentTarget as HTMLElement;
    const rect = button.getBoundingClientRect();
    // Use document.documentElement.clientWidth for better accuracy across browsers
    const viewportWidth = document.documentElement.clientWidth;

    this.menuStyle.set({
      top: `${rect.bottom + 4}px`,
      right: `${viewportWidth - (rect.left + rect.width / 2)}px`,
    });
  }

  // Unified helper to open modals
  private openModal(modalSignal: typeof this.showPlaylistModal): void {
    modalSignal.set(true);
    this.menuStyle.set(null);
    this.tapRevealed.set(false);
  }

  openPlaylistModal(event: Event): void {
    event.stopPropagation();
    this.openModal(this.showPlaylistModal);
  }

  openDetailsModal(event: Event): void {
    event.stopPropagation();
    this.openModal(this.showDetailsModal);
  }

  onRemoveFromContinueWatching(event: Event): void {
    event.stopPropagation();
    this.removeFromContinueWatching.emit();
    this.closeMenus();
  }

  toggleWatchlist(event: Event) {
    event.stopPropagation();
    const id = this.media().id;
    if (this.isOnWatchlist()) {
      this.watchlistService.removeFromWatchlist(id);
    } else {
      this.watchlistService.addToWatchlist(this.media());
    }
    this.tapRevealed.set(false);
  }

  // --- Computed Data Properties ---

  isOnWatchlist = computed(() =>
    this.watchlistService.isOnWatchlist(this.media().id)
  );

  isInPlaylist = computed(() =>
    this.playlistService.isMediaInAnyPlaylist(this.media().id)
  );

  subscribableChannel = computed<SubscribableChannel | null>(() => {
    const details = this.details();
    if (!details) return null;

    const isMov = this.isMovie();

    if (!isMov && "networks" in details && details.networks.length) {
      return { ...details.networks[0], type: "network" };
    }

    if (
      isMov &&
      "production_companies" in details &&
      details.production_companies.length
    ) {
      const company =
        details.production_companies.find((c) => c.logo_path) ??
        details.production_companies[0];
      if (company) return { ...company, type: "company" };
    }

    return null;
  });

  channelLogoUrl = computed(() => {
    const channel = this.subscribableChannel();
    return channel?.logo_path
      ? `https://image.tmdb.org/t/p/w92${channel.logo_path}`
      : null;
  });

  channelName = computed(() => {
    const channel = this.subscribableChannel();
    if (channel) return channel.name;

    // Fallback to Genre map
    const ids = this.media().genre_ids;
    if (ids?.length) {
      return this.genreMap().get(ids[0]) ?? "Unknown";
    }
    return "Unknown";
  });

  thumbnailUrl = computed(() => {
    const path = this.media().backdrop_path;
    return path
      ? `https://image.tmdb.org/t/p/w780${path}`
      : "https://picsum.photos/480/270?grayscale";
  });

  mediaTitle = computed(() => {
    const m = this.media();
    return isMovie(m) ? m.title : m.name;
  });

  videoInfoLine = computed(() => {
    const m = this.media();
    const rating = m.vote_average.toFixed(1);
    const date = isMovie(m) ? m.release_date : m.first_air_date;
    return `${rating} Rating • ${getRelativeTime(date)}`;
  });

  onChannelClick(event: Event): void {
    event.stopPropagation();
    const channel = this.subscribableChannel();
    if (channel) {
      this.navigationService.navigateTo("channel", channel);
    }
  }
}
