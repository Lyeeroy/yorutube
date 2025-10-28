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

  getThumbnail(playlist: Playlist): string {
    if (playlist.items.length > 0) {
      const firstItem = playlist.items[0];
      if (firstItem.backdrop_path) {
        return `https://image.tmdb.org/t/p/w780${firstItem.backdrop_path}`;
      }
    }
    return 'https://picsum.photos/480/270?grayscale';
  }

  onPlaylistClicked(playlist: Playlist): void {
    this.navigationService.navigateTo('playlist-detail', { id: playlist.id });
  }

  createNewPlaylist(): void {
    const name = this.newPlaylistName().trim();
    if (name) {
      this.playlistService.createPlaylist(name, this.newPlaylistDescription().trim());
      this.newPlaylistName.set('');
      this.newPlaylistDescription.set('');
      this.showCreateForm.set(false);
    }
  }
}
