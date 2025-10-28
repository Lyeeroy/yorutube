import { Component, ChangeDetectionStrategy, input, output, computed } from '@angular/core';
import { CommonModule, NgOptimizedImage } from '@angular/common';
import { Playlist } from '../../models/playlist.model';
import { MediaType } from '../../models/movie.model';

const isMovie = (media: MediaType) => media.media_type === 'movie';

@Component({
  selector: 'app-video-player-playlist',
  standalone: true,
  imports: [CommonModule, NgOptimizedImage],
  templateUrl: './video-player-playlist.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VideoPlayerPlaylistComponent {
  playlist = input.required<Playlist>();
  currentMediaId = input.required<number>();
  selectMedia = output<MediaType>();

  currentIndex = computed(() => {
    return this.playlist().items.findIndex(item => item.id === this.currentMediaId());
  });

  getMediaTitle(media: MediaType): string {
    return isMovie(media) ? (media as any).title : (media as any).name;
  }
}
