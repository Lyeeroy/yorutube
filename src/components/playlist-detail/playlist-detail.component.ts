import {
  Component,
  ChangeDetectionStrategy,
  HostListener,
  inject,
  signal,
  effect,
  input,
  computed,
} from "@angular/core";
import {
  CdkDragDrop,
  CdkDrag,
  CdkDropList,
  CdkDragHandle,
  moveItemInArray,
} from "@angular/cdk/drag-drop";
import { CommonModule, NgOptimizedImage } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { PlaylistService } from "../../services/playlist.service";
import { Playlist } from "../../models/playlist.model";
import { MediaType } from "../../models/movie.model";
import { NavigationService } from "../../services/navigation.service";
import { WatchlistService } from "../../services/watchlist.service";
import { ContinueWatchingService } from "../../services/continue-watching.service";
import { AddToPlaylistModalComponent } from "../add-to-playlist-modal/add-to-playlist-modal.component";
import { MediaDetailModalComponent } from "../media-detail-modal/media-detail-modal.component";

const isMovie = (media: MediaType) => media.media_type === "movie";

@Component({
  selector: "app-playlist-detail",
  standalone: true,
  imports: [
    CommonModule,
    NgOptimizedImage,
    FormsModule,
    AddToPlaylistModalComponent,
    MediaDetailModalComponent,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
  ],
  templateUrl: "./playlist-detail.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlaylistDetailComponent {
  private playlistService = inject(PlaylistService);
  private navigationService = inject(NavigationService);
  watchlistService = inject(WatchlistService);
  private continueWatchingService = inject(ContinueWatchingService);

  params = input.required<any>();
  playlist = signal<Playlist | null>(null);

  isEditing = signal(false);
  editedName = signal("");
  editedDescription = signal("");

  playlistItems = signal<MediaType[]>([]);

  // menu state for items
  menuStyle = signal<{ top: string; right: string } | null>(null);
  menuMediaId = signal<number | null>(null);
  menuMedia = signal<MediaType | null>(null);
  showPlaylistModal = signal(false);
  showDetailsModal = signal(false);

  constructor() {
    effect(() => {
      const { id } = this.params();
      if (!id) {
        this.playlist.set(null);
        return;
      }
      const foundPlaylist = this.playlistService.getPlaylistById(id);
      this.playlist.set(foundPlaylist || null);
      if (foundPlaylist) {
        this.playlistItems.set(foundPlaylist.items);
        this.editedName.set(foundPlaylist.name);
        this.editedDescription.set(foundPlaylist.description);
      }
    });
  }

  getThumbnail(index: number): string {
    const p = this.playlist();
    if (!p) return "https://picsum.photos/480/270?grayscale";

    const item = p.items[index];
    if (item?.backdrop_path) {
      return `https://image.tmdb.org/t/p/w1280${item.backdrop_path}`;
    }
    return "https://picsum.photos/480/270?grayscale";
  }

  onMediaClicked(media: MediaType): void {
    this.navigationService.navigateTo("watch", {
      mediaType: media.media_type,
      id: media.id,
      playlistId: this.playlist()?.id,
      autoplay: true,
    });
  }

  playAll(): void {
    const p = this.playlist();
    if (p && p.items.length > 0) {
      this.onMediaClicked(p.items[0]);
    }
  }

  getMediaTitle(media: MediaType): string {
    return isMovie(media) ? (media as any).title : (media as any).name;
  }

  getMediaInfo(media: MediaType): string {
    const year = isMovie(media)
      ? (media as any).release_date?.split("-")[0]
      : (media as any).first_air_date?.split("-")[0];
    return `${media.vote_average.toFixed(1)} Rating • ${year || "N/A"}`;
  }

  removeFromPlaylist(event: Event, mediaId: number): void {
    event.stopPropagation();
    const p = this.playlist();
    if (p) {
      this.playlistService.removeFromPlaylist(p.id, mediaId);
      // update local signal to reflect change immediately
      this.playlistItems.update((items) =>
        items.filter((i) => i.id !== mediaId)
      );
      // close menu if it was opened for this media
      if (this.menuMediaId() === mediaId) {
        this.menuStyle.set(null);
        this.menuMediaId.set(null);
        this.menuMedia.set(null);
      }
    }
  }

  // deletePlaylist already implemented above

  deletePlaylist(): void {
    const p = this.playlist();
    if (p) {
      this.playlistService.deletePlaylist(p.id);
      this.navigationService.navigateTo("playlists");
    }
  }

  saveDetails(): void {
    const p = this.playlist();
    if (p) {
      this.playlistService.updatePlaylistDetails(
        p.id,
        this.editedName(),
        this.editedDescription()
      );
      this.isEditing.set(false);
    }
  }

  @HostListener("document:click")
  onDocumentClick(): void {
    if (this.menuStyle()) {
      this.menuStyle.set(null);
      this.menuMediaId.set(null);
      this.menuMedia.set(null);
    }
  }

  toggleOptionsMenu(event: MouseEvent, media: MediaType): void {
    event.stopPropagation();
    if (this.menuStyle() && this.menuMediaId() === media.id) {
      this.menuStyle.set(null);
      this.menuMediaId.set(null);
      this.menuMedia.set(null);
      return;
    }

    const button = event.currentTarget as HTMLElement;
    const rect = button.getBoundingClientRect();
    const viewportWidth = window.innerWidth;

    const style = {
      top: `${rect.bottom + 4}px`,
      right: `${viewportWidth - (rect.left + rect.width / 2)}px`,
    };

    this.menuMedia.set(media);
    this.menuMediaId.set(media.id);
    this.menuStyle.set(style);
  }

  openPlaylistModal(event: Event): void {
    event.stopPropagation();
    this.showPlaylistModal.set(true);
    this.menuStyle.set(null);
    this.menuMediaId.set(null);
  }

  openDetailsModal(event: Event): void {
    event.stopPropagation();
    this.showDetailsModal.set(true);
    this.menuStyle.set(null);
    this.menuMediaId.set(null);
  }

  onRemoveFromContinueWatching(event: Event, mediaId: number): void {
    event.stopPropagation();
    this.continueWatchingService.removeItem(mediaId);
    this.menuStyle.set(null);
    this.menuMediaId.set(null);
  }

  toggleWatchlist(event: Event, media: MediaType) {
    event.stopPropagation();
    const mediaId = media.id;
    if (this.watchlistService.isOnWatchlist(mediaId)) {
      this.watchlistService.removeFromWatchlist(mediaId);
    } else {
      this.watchlistService.addToWatchlist(media);
    }
    this.menuStyle.set(null);
    this.menuMediaId.set(null);
  }

  drop(event: CdkDragDrop<MediaType[]>) {
    const p = this.playlist();
    if (!p) return;

    const currentItems = this.playlistItems();
    moveItemInArray(currentItems, event.previousIndex, event.currentIndex);
    
    // Update local signal to show change immediately
    this.playlistItems.set([...currentItems]);
    
    // Persist to service
    this.playlistService.updatePlaylistItems(p.id, currentItems);
  }
}
