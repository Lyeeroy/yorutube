import { Component, ChangeDetectionStrategy, input, output, signal, inject, effect, DestroyRef } from '@angular/core';
import { MediaType, Movie, TvShow, TvShowDetails, SubscribableChannel } from '../../models/movie.model';
import { CommonModule } from '@angular/common';
import { MovieService } from '../../services/movie.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { VideoCardComponent } from '../video-card/video-card.component';
import { Observable } from 'rxjs';

const isMovie = (media: MediaType | TvShowDetails): media is Movie => media.media_type === 'movie';

@Component({
  selector: 'app-related-videos',
  standalone: true,
  imports: [CommonModule, VideoCardComponent],
  templateUrl: './related-videos.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RelatedVideosComponent {
  currentMedia = input.required<MediaType | TvShowDetails>();
  genreMap = input.required<Map<number, string>>();
  selectMedia = output<MediaType>();

  private movieService = inject(MovieService);
  private destroyRef = inject(DestroyRef);
  
  mediaItems = signal<MediaType[]>([]);
  loading = signal(true);

  constructor() {
    effect(() => {
      const media = this.currentMedia();
      this.loadRecommendations(media);
    });
  }

  loadRecommendations(media: MediaType | TvShowDetails): void {
    this.loading.set(true);
    this.mediaItems.set([]);

    // FIX: Explicitly typing `recommendations$` resolves an issue where its type was inferred as `unknown` by TypeScript.
    const recommendations$: Observable<MediaType[]> = isMovie(media)
      ? this.movieService.getMovieRecommendations(media.id)
      : this.movieService.getTvShowRecommendations(media.id);

    recommendations$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (data) => {
        this.mediaItems.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.mediaItems.set([]);
        this.loading.set(false);
      }
    });
  }

  onMediaClicked(media: MediaType) {
    this.selectMedia.emit(media);
  }
}
