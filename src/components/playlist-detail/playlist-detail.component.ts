import { Component, ChangeDetectionStrategy, inject, signal, effect, input, computed } from '@angular/core';
import { CommonModule, NgOptimizedImage } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PlaylistService } from '../../services/playlist.service';
import { Playlist } from '../../models/playlist.model';
import { MediaType } from '../../models/movie.model';
import { NavigationService } from '../../services/navigation.service';

const isMovie = (media: MediaType) => media.media_type === 'movie';

@Component({
  selector: 'app-playlist-detail',
  standalone: true,
  imports: [CommonModule, NgOptimizedImage, FormsModule],
  templateUrl: './playlist-detail.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlaylistDetailComponent {
  private playlistService = inject(PlaylistService);
  private navigationService = inject(NavigationService);

  params = input.required<any>();
  playlist = signal<Playlist | null>(null);
  
  isEditing = signal(false);
  editedName = signal('');
  editedDescription = signal('');

  playlistItems = signal<MediaType[]>([]);

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
    if (!p) return 'https://picsum.photos/480/270?grayscale';

    const item = p.items[index];
    if (item?.backdrop_path) {
      return `https://image.tmdb.org/t/p/w1280${item.backdrop_path}`;
    }
    return 'https://picsum.photos/480/270?grayscale';
  }

  onMediaClicked(media: MediaType): void {
    this.navigationService.navigateTo('watch', { 
      mediaType: media.media_type, 
      id: media.id,
      playlistId: this.playlist()?.id,
      autoplay: true
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
      const year = isMovie(media) ? (media as any).release_date?.split('-')[0] : (media as any).first_air_date?.split('-')[0];
      return `${media.vote_average.toFixed(1)} Rating • ${year || 'N/A'}`;
  }

  removeFromPlaylist(event: Event, mediaId: number): void {
    event.stopPropagation();
    const p = this.playlist();
    if (p) {
      this.playlistService.removeFromPlaylist(p.id, mediaId);
      // update local signal to reflect change immediately
      this.playlistItems.update(items => items.filter(i => i.id !== mediaId));
    }
  }
  
  deletePlaylist(): void {
    const p = this.playlist();
    if (p) {
      this.playlistService.deletePlaylist(p.id);
      this.navigationService.navigateTo('playlists');
    }
  }

  saveDetails(): void {
    const p = this.playlist();
    if (p) {
      this.playlistService.updatePlaylistDetails(p.id, this.editedName(), this.editedDescription());
      this.isEditing.set(false);
    }
  }
}
