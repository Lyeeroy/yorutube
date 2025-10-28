import { Component, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable } from 'rxjs';
import { ContentCategoryComponent } from '../content-category/content-category.component';
import { MovieService } from '../../services/movie.service';
import { MediaType, SubscribableChannel } from '../../models/movie.model';
import { NavigationService } from '../../services/navigation.service';
import { toSignal } from '@angular/core/rxjs-interop';
import { HistoryService } from '../../services/history.service';

interface ContentCategory {
  title: string;
  fetchFn$: Observable<MediaType[]>;
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, ContentCategoryComponent],
  templateUrl: './home.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent {
  private movieService = inject(MovieService);
  private navigationService = inject(NavigationService);
  private historyService = inject(HistoryService);

  private history = this.historyService.history;

  private baseCategories: ContentCategory[] = [
    { title: 'Trending This Week', fetchFn$: this.movieService.getTrendingAll() },
    { title: 'Popular TV Shows', fetchFn$: this.movieService.getPopularTvShows() },
    { title: 'Popular on Netflix', fetchFn$: this.movieService.getPopularOnNetflix() },
    { title: 'Top Rated Movies', fetchFn$: this.movieService.getTopRatedMovies() },
    { title: 'Upcoming Movies', fetchFn$: this.movieService.getUpcomingMovies() },
  ];

  categories = computed(() => {
    const historyItems = this.history();
    if (historyItems.length > 0) {
      const mostRecent = historyItems[0];
      const media = mostRecent.media;
      const title = media.media_type === 'movie' ? media.title : media.name;

      const recommendationsCategory: ContentCategory = {
        title: `Because you watched ${title}`,
        fetchFn$: this.movieService.getRecommendationsForMedia(media)
      };

      return [recommendationsCategory, ...this.baseCategories];
    }
    return this.baseCategories;
  });

  genreMap = toSignal(this.movieService.getCombinedGenreMap(), { initialValue: new Map<number, string>() });

  onMediaClicked(media: MediaType): void {
    this.navigationService.navigateTo('watch', { mediaType: media.media_type, id: media.id });
  }
}
