import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { CommonModule, NgOptimizedImage } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PlaylistService } from '../../services/playlist.service';
import { Playlist } from '../../models/playlist.model';
import { NavigationService } from '../../services/navigation.service';

@Component({
  selector: 'app-playlists',
  standalone: true,
  imports: [CommonModule, NgOptimizedImage, FormsModule],
  templateUrl: './playlists.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlaylistsComponent {
  private playlistService = inject(PlaylistService);
  private navigationService = inject(NavigationService);
  
  playlists = this.playlistService.playlists;
  
  showCreateForm = signal(false);
  newPlaylistName = signal('');
  newPlaylistDescription = signal('');

  onPlaylistClicked(playlist: Playlist): void {
    this.navigationService.navigateTo('playlist-detail', { id: playlist.id });
  }

  cancelCreate(): void {
    this.showCreateForm.set(false);
    this.newPlaylistName.set('');
    this.newPlaylistDescription.set('');
  }

  createNewPlaylist(): void {
    const name = this.newPlaylistName().trim();
    if (name) {
      this.playlistService.createPlaylist(name, this.newPlaylistDescription().trim());
      this.cancelCreate();
    }
  }
}
