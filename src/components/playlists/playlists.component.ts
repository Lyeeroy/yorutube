import {
  Component,
  ChangeDetectionStrategy,
  HostListener,
  inject,
  signal,
  computed,
} from "@angular/core";
import {
  CdkDragDrop,
  CdkDrag,
  CdkDropList,
  moveItemInArray,
} from "@angular/cdk/drag-drop";
import { CommonModule, NgOptimizedImage } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { PlaylistService } from "../../services/playlist.service";
import { Playlist } from "../../models/playlist.model";
import { NavigationService } from "../../services/navigation.service";

@Component({
  selector: "app-playlists",
  standalone: true,
  imports: [CommonModule, NgOptimizedImage, FormsModule, CdkDropList, CdkDrag],
  templateUrl: "./playlists.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlaylistsComponent {
  private playlistService = inject(PlaylistService);
  private navigationService = inject(NavigationService);

  playlists = this.playlistService.playlists;

  // Menu state for three dots on playlist tile
  playlistMenuStyle = signal<{ top: string; right: string } | null>(null);
  playlistMenuTarget = signal<string | null>(null);
  selectedPlaylist = computed(() =>
    this.playlists().find((p) => p.id === this.playlistMenuTarget())
  );

  showCreateForm = signal(false);
  newPlaylistName = signal("");
  newPlaylistDescription = signal("");

  onPlaylistClicked(playlist: Playlist): void {
    this.navigationService.navigateTo("playlist-detail", { id: playlist.id });
  }

  cancelCreate(): void {
    this.showCreateForm.set(false);
    this.newPlaylistName.set("");
    this.newPlaylistDescription.set("");
  }

  createNewPlaylist(): void {
    const name = this.newPlaylistName().trim();
    if (name) {
      this.playlistService.createPlaylist(
        name,
        this.newPlaylistDescription().trim()
      );
      this.cancelCreate();
    }
  }

  togglePlaylistMenu(event: MouseEvent, playlistId: string): void {
    event.stopPropagation();
    if (this.playlistMenuTarget() === playlistId && this.playlistMenuStyle()) {
      this.playlistMenuStyle.set(null);
      this.playlistMenuTarget.set(null);
      return;
    }

    const button = event.currentTarget as HTMLElement;
    const rect = button.getBoundingClientRect();
    const viewportWidth = window.innerWidth;

    const style = {
      top: `${rect.bottom + 4}px`,
      right: `${viewportWidth - (rect.left + rect.width / 2)}px`,
    };
    this.playlistMenuTarget.set(playlistId);
    this.playlistMenuStyle.set(style);
  }

  @HostListener("document:click")
  onDocumentClick(): void {
    if (this.playlistMenuStyle()) {
      this.playlistMenuStyle.set(null);
      this.playlistMenuTarget.set(null);
    }
  }

  deletePlaylistFromMenu(event: Event, playlistId: string): void {
    event.stopPropagation();
    this.playlistService.deletePlaylist(playlistId);
    // close menu
    this.playlistMenuStyle.set(null);
    this.playlistMenuStyle.set(null);
    this.playlistMenuTarget.set(null);
  }

  drop(event: CdkDragDrop<Playlist[]>) {
    const currentPlaylists = this.playlists();
    moveItemInArray(currentPlaylists, event.previousIndex, event.currentIndex);
    this.playlists.set([...currentPlaylists]);
  }
}
