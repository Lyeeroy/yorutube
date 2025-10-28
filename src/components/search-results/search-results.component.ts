import { Component, ChangeDetectionStrategy, inject, signal, computed, input, effect, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MediaType, SubscribableChannel, SearchResult } from '../../models/movie.model';
import { SearchResultCardComponent } from '../search-result-card/search-result-card.component';
import { InfiniteScrollTriggerComponent } from '../infinite-scroll-trigger/infinite-scroll-trigger.component';
import { NavigationService } from '../../services/navigation.service';
import { MovieService } from '../../services/movie.service';
import { toSignal, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SearchResultChannelCardComponent } from '../search-result-channel-card/search-result-channel-card.component';
import { SubscriptionService } from '../../services/subscription.service';

@Component({
  selector: 'app-search-results',
  standalone: true,
  imports: [CommonModule, SearchResultCardComponent, InfiniteScrollTriggerComponent, SearchResultChannelCardComponent],
  templateUrl: './search-results.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchResultsComponent {
  private movieService = inject(MovieService);
  private navigationService = inject(NavigationService);
  private subscriptionService = inject(SubscriptionService);
  private destroyRef = inject(DestroyRef);
  
  params = input.required<any>();
  genreMap = toSignal(this.movieService.getCombinedGenreMap(), { initialValue: new Map() });
  
  searchResults = signal<SearchResult[] | null>(null);
  loading = signal(true);
  loadingMore = signal(false);
  searchPage = signal(1);
  totalPages = signal(1);
  searchQuery = signal('');

  // New signals for filtering and sorting
  activeFilter = signal<'all' | 'movie' | 'tv' | 'channel'>('all');
  sortBy = signal<'relevance' | 'newest' | 'rating'>('relevance');

  hasMore = computed(() => this.searchPage() < this.totalPages());

  filteredAndSortedResults = computed(() => {
    const results = this.searchResults();
    if (!results) {
      return [];
    }

    // 1. Filter
    const filter = this.activeFilter();
    let filtered = results;
    if (filter !== 'all') {
      filtered = results.filter(item => {
        if (filter === 'movie') return this.isMedia(item) && item.media_type === 'movie';
        if (filter === 'tv') return this.isMedia(item) && item.media_type === 'tv';
        if (filter === 'channel') return this.isChannel(item);
        return false;
      });
    }

    // 2. Sort
    const sortByValue = this.sortBy();
    if (sortByValue === 'relevance') {
      return filtered; // API result is already sorted by relevance
    }

    return [...filtered].sort((a, b) => {
      const aIsMedia = this.isMedia(a);
      const bIsMedia = this.isMedia(b);

      if (aIsMedia && !bIsMedia) return -1;
      if (!bIsMedia && aIsMedia) return 1;
      if (!aIsMedia && !bIsMedia) return 0; // Both are channels, keep original order

      const mediaA = a as MediaType;
      const mediaB = b as MediaType;

      if (sortByValue === 'newest') {
        const dateAStr = mediaA.media_type === 'movie' ? mediaA.release_date : mediaA.first_air_date;
        const dateBStr = mediaB.media_type === 'movie' ? mediaB.release_date : mediaB.first_air_date;
        // Handle cases where date might be missing
        if (!dateAStr) return 1;
        if (!dateBStr) return -1;
        const dateA = new Date(dateAStr).getTime();
        const dateB = new Date(dateBStr).getTime();
        return dateB - dateA;
      }

      if (sortByValue === 'rating') {
        return mediaB.vote_average - mediaA.vote_average;
      }

      return 0;
    });
  });

  constructor() {
    effect((onCleanup) => {
      const query = this.params().q;
      this.searchQuery.set(query || '');
      this.searchResults.set(null); // Clear for skeleton
      this.loading.set(true);
      this.searchPage.set(1);
       // Reset filters on new search
      this.activeFilter.set('all');
      this.sortBy.set('relevance');
      
      if (!query) {
        this.searchResults.set([]);
        this.totalPages.set(1);
        this.loading.set(false);
        return;
      }

      const sub = this.movieService.searchAll(query, 1).subscribe({
        next: data => {
          this.searchResults.set(data.results);
          this.totalPages.set(data.total_pages);
          this.loading.set(false);
        },
        error: () => {
          this.searchResults.set([]);
          this.totalPages.set(1);
          this.loading.set(false);
        }
      });
      onCleanup(() => sub.unsubscribe());
    });
  }

  loadMore() {
    if (this.loading() || this.loadingMore() || !this.hasMore()) {
      return;
    }

    this.loadingMore.set(true);
    this.searchPage.update(p => p + 1);

    this.movieService.searchAll(this.searchQuery(), this.searchPage()).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (data) => {
        this.searchResults.update(currentResults => [...(currentResults || []), ...data.results]);
        this.totalPages.set(data.total_pages);
        this.loadingMore.set(false);
      },
      error: () => {
        this.loadingMore.set(false);
      }
    });
  }

  isMedia(item: SearchResult): item is MediaType {
    return 'media_type' in item;
  }

  isChannel(item: SearchResult): item is SubscribableChannel {
    return 'type' in item;
  }

  toggleSubscription(channel: SubscribableChannel) {
    if (this.subscriptionService.isSubscribed(channel.id)) {
      this.subscriptionService.removeSubscription(channel.id);
    } else {
      this.subscriptionService.addSubscription(channel);
    }
  }

  onMediaClicked(media: MediaType) {
    this.navigationService.navigateTo('watch', { mediaType: media.media_type, id: media.id });
  }

  onChannelResultClicked(channel: SubscribableChannel): void {
    this.navigationService.navigateTo('channel', channel);
  }

  onSortChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.sortBy.set(value as 'relevance' | 'newest' | 'rating');
  }
}
