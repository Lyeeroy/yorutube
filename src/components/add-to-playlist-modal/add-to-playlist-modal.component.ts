import { Component, ChangeDetectionStrategy, output, input, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PlaylistService } from '../../services/playlist.service';
import { Playlist } from '../../models/playlist.model';
import { MediaType } from '../../models/movie.model';

@Component({
  selector: 'app-add-to-playlist-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './add-to-playlist-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddToPlaylistModalComponent {
  private playlistService = inject(PlaylistService);
  
  media = input.required<MediaType>();
  close = output<void>();

  playlists = this.playlistService.playlists;
  showCreateForm = signal(false);
  newPlaylistName = signal('');

  isMediaInPlaylist(playlist: Playlist): boolean {
    return this.playlistService.isMediaInPlaylist(playlist.id, this.media().id);
  }

  togglePlaylist(event: Event, playlistId: string): void {
    const checkbox = event.target as HTMLInputElement;
    const currentMedia = this.media();
    if (checkbox.checked) {
      this.playlistService.addToPlaylist(playlistId, currentMedia);
    } else {
      this.playlistService.removeFromPlaylist(playlistId, currentMedia.id);
    }
  }

  createNewPlaylist(): void {
    const name = this.newPlaylistName().trim();
    if (name) {
      this.playlistService.createPlaylist(name, '', this.media());
      this.newPlaylistName.set('');
      this.showCreateForm.set(false);
    }
  }
}
