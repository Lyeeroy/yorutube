import { Component, ChangeDetectionStrategy, inject, signal, effect, input, DestroyRef, computed } from '@angular/core';
import { CommonModule, NgOptimizedImage } from '@angular/common';
import { MovieService } from '../../services/movie.service';
import { Collection, MediaType, SubscribableChannel } from '../../models/movie.model';
import { NavigationService } from '../../services/navigation.service';
import { VideoGridComponent } from '../video-grid/video-grid.component';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { PlaylistService } from '../../services/playlist.service';

@Component({
  selector: 'app-collection-detail',
  standalone: true,
  imports: [CommonModule, NgOptimizedImage, VideoGridComponent],
  templateUrl: './collection-detail.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CollectionDetailComponent {
  private movieService = inject(MovieService);
  private navigationService = inject(NavigationService);
  private destroyRef = inject(DestroyRef);
  private playlistService = inject(PlaylistService);

  params = input.required<any>();
  collection = signal<Collection | null>(null);
  loading = signal(true);

  genreMap = toSignal(this.movieService.getCombinedGenreMap(), { initialValue: new Map() });

  backdropUrl = computed(() => {
    const path = this.collection()?.backdrop_path;
    return path ? `https://image.tmdb.org/t/p/w1280${path}` : null;
  });

  posterUrl = computed(() => {
    const path = this.collection()?.poster_path;
    return path ? `https://image.tmdb.org/t/p/w500${path}` : 'https://picsum.photos/500/750?grayscale';
  });
  
  // Sort movies by release date
  sortedMovies = computed(() => {
    const parts = this.collection()?.parts;
    if (!parts) return [];
    return [...parts].sort((a, b) => {
      const dateA = a.release_date ? new Date(a.release_date).getTime() : 0;
      const dateB = b.release_date ? new Date(b.release_date).getTime() : 0;
      return dateA - dateB;
    });
  });

  constructor() {
    effect(() => {
      const { id } = this.params();
      if (!id) {
        this.loading.set(false);
        this.collection.set(null);
        return;
      }
      
      this.loading.set(true);
      this.movieService.getCollectionDetails(+id)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (data) => {
            this.collection.set(data);
            this.loading.set(false);
          },
          error: () => {
            this.collection.set(null);
            this.loading.set(false);
          }
        });
    });
  }
  
  onMediaClicked(media: MediaType): void {
    this.navigationService.navigateTo('watch', { mediaType: media.media_type, id: media.id });
  }

  createPlaylistFromCollection(): void {
    const collection = this.collection();
    if (!collection || !collection.parts || collection.parts.length === 0) {
      return;
    }

    const movies = this.sortedMovies();

    const playlistId = this.playlistService.createPlaylist(
      collection.name,
      collection.overview,
      movies
    );
  
    // After creating, navigate to the new playlist detail page.
    this.navigationService.navigateTo('playlist-detail', { id: playlistId });
  }
}
