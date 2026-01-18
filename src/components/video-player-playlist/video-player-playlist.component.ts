import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  computed,
  signal,
  inject,
  Renderer2,
  PLATFORM_ID,
  effect,
  OnDestroy,
} from "@angular/core";
import {
  CommonModule,
  NgOptimizedImage,
  isPlatformBrowser,
} from "@angular/common";
import { Playlist } from "../../models/playlist.model";
import { MediaType, Movie } from "../../models/movie.model";
import {
  DragDropModule,
  CdkDragDrop,
  moveItemInArray,
} from "@angular/cdk/drag-drop";
import { PlaylistService } from "../../services/playlist.service";
import { WatchlistService } from "../../services/watchlist.service";
import { NavigationService } from "../../services/navigation.service";
import { AddToPlaylistModalComponent } from "../add-to-playlist-modal/add-to-playlist-modal.component";
import { MediaDetailModalComponent } from "../media-detail-modal/media-detail-modal.component";

const isMovie = (media: MediaType): media is Movie =>
  media.media_type === "movie";

@Component({
  selector: "app-video-player-playlist",
  standalone: true,
  imports: [
    CommonModule,
    NgOptimizedImage,
    DragDropModule,
    AddToPlaylistModalComponent,
    MediaDetailModalComponent,
  ],
  templateUrl: "./video-player-playlist.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VideoPlayerPlaylistComponent implements OnDestroy {
  private playlistService = inject(PlaylistService);
  private watchlistService = inject(WatchlistService);
  private navigationService = inject(NavigationService);
  private renderer = inject(Renderer2);
  private platformId = inject(PLATFORM_ID);

  playlist = input.required<Playlist>();
  currentMediaId = input.required<number>();
  selectMedia = output<MediaType>();
  close = output<void>();

  isExpanded = signal(true);
  isShuffled = signal(false);
  originalItems: MediaType[] = [];

  // Menu state
  menuStyle = signal<{ top: string; right: string } | null>(null);
  activeMenuMedia = signal<MediaType | null>(null);

  // Modals state
  showPlaylistModal = signal(false);
  showDetailsModal = signal(false);
  selectedModalMedia = signal<MediaType | null>(null);

  currentIndex = computed(() => {
    return this.playlist().items.findIndex(
      (item) => item.id === this.currentMediaId(),
    );
  });

  constructor() {
    // Menu Closer Effect
    effect((onCleanup) => {
      if (this.menuStyle() && isPlatformBrowser(this.platformId)) {
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

  ngOnDestroy() {
    if (this.isShuffled()) {
      this.playlistService.updatePlaylistItems(
        this.playlist().id,
        this.originalItems,
      );
    }
  }

  getMediaTitle(media: MediaType): string {
    return isMovie(media) ? (media as any).title : (media as any).name;
  }

  getMediaSubtitle(media: MediaType): string {
    const date = isMovie(media) ? media.release_date : media.first_air_date;
    const year = date ? new Date(date).getFullYear() : "";
    const type = isMovie(media) ? "Movie" : "TV Show";
    return year ? `${year} • ${type}` : type;
  }

  toggleExpand() {
    this.isExpanded.update((v) => !v);
  }

  closePlaylist() {
    this.close.emit();
  }

  shufflePlaylist() {
    if (this.isShuffled()) {
      // Restore
      this.playlistService.updatePlaylistItems(
        this.playlist().id,
        this.originalItems,
      );
      this.isShuffled.set(false);
      this.originalItems = [];
    } else {
      // Shuffle
      this.originalItems = [...this.playlist().items];
      const items = [...this.playlist().items];
      for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
      }
      this.playlistService.updatePlaylistItems(this.playlist().id, items);
      this.isShuffled.set(true);
    }
  }

  removeItem(event: Event, item: MediaType) {
    event.stopPropagation();
    this.playlistService.removeFromPlaylist(this.playlist().id, item.id);

    if (this.isShuffled()) {
      this.originalItems = this.originalItems.filter((i) => i.id !== item.id);
    }
    this.closeMenus();
  }

  drop(event: CdkDragDrop<MediaType[]>) {
    const items = [...this.playlist().items];
    moveItemInArray(items, event.previousIndex, event.currentIndex);
    this.playlistService.updatePlaylistItems(this.playlist().id, items);
  }

  // Menu Actions
  toggleOptionsMenu(event: MouseEvent, item: MediaType): void {
    event.stopPropagation();

    if (this.menuStyle() && this.activeMenuMedia()?.id === item.id) {
      this.closeMenus();
      return;
    }

    this.activeMenuMedia.set(item);
    const button = event.currentTarget as HTMLElement;
    const rect = button.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;

    this.menuStyle.set({
      top: `${rect.bottom + 4}px`,
      right: `${viewportWidth - (rect.left + rect.width / 2)}px`,
    });
  }

  closeMenus(): void {
    this.menuStyle.set(null);
    this.activeMenuMedia.set(null);
  }

  isOnWatchlist(media: MediaType): boolean {
    return this.watchlistService.isOnWatchlist(media.id);
  }

  toggleWatchlist(event: Event) {
    event.stopPropagation();
    const media = this.activeMenuMedia();
    if (!media) return;

    if (this.isOnWatchlist(media)) {
      this.watchlistService.removeFromWatchlist(media.id);
    } else {
      this.watchlistService.addToWatchlist(media);
    }
    this.closeMenus();
  }

  openPlaylistModal(event: Event) {
    event.stopPropagation();
    const media = this.activeMenuMedia();
    if (media) {
      this.selectedModalMedia.set(media);
      this.showPlaylistModal.set(true);
    }
    this.closeMenus();
  }

  openDetailsModal(event: Event) {
    event.stopPropagation();
    const media = this.activeMenuMedia();
    if (media) {
      this.selectedModalMedia.set(media);
      this.showDetailsModal.set(true);
    }
    this.closeMenus();
  }

  isInPlaylist(media: MediaType): boolean {
    return this.playlistService.isMediaInAnyPlaylist(media.id);
  }
}
