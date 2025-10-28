import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { MediaType, SubscribableChannel } from '../../models/movie.model';
import { VideoCardComponent } from '../video-card/video-card.component';

@Component({
  selector: 'app-video-grid',
  standalone: true,
  imports: [VideoCardComponent],
  templateUrl: './video-grid.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VideoGridComponent {
  mediaItems = input.required<MediaType[] | null>();
  loading = input<boolean>(false);
  genreMap = input.required<Map<number, string>>();
  prioritizeFirstItems = input<boolean>(false);
  mediaClicked = output<MediaType>();

  onMediaClicked(media: MediaType) {
    this.mediaClicked.emit(media);
  }
}
