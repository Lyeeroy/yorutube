import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  input,
  effect,
  DestroyRef,
} from "@angular/core";
import { forkJoin } from "rxjs";
import { CommonModule } from "@angular/common";
import {
  MediaType,
  SubscribableChannel,
  SearchResult,
  CollectionSearchResult,
} from "../../models/movie.model";
import { SearchResultCardComponent } from "../search-result-card/search-result-card.component";
import { SearchResultCollectionCardComponent } from "../search-result-collection-card/search-result-collection-card.component";
import { InfiniteScrollTriggerComponent } from "../infinite-scroll-trigger/infinite-scroll-trigger.component";
import { NavigationService } from "../../services/navigation.service";
import { MovieService } from "../../services/movie.service";
import { toSignal, takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { SearchResultChannelCardComponent } from "../search-result-channel-card/search-result-channel-card.component";
import { SubscriptionService } from "../../services/subscription.service";

@Component({
  selector: "app-search-results",
  standalone: true,
  imports: [
    CommonModule,
    SearchResultCardComponent,
    SearchResultCollectionCardComponent,
    InfiniteScrollTriggerComponent,
    SearchResultChannelCardComponent,
  ],
  templateUrl: "./search-results.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchResultsComponent {
  private movieService = inject(MovieService);
  private navigationService = inject(NavigationService);
  private subscriptionService = inject(SubscriptionService);
  private destroyRef = inject(DestroyRef);

  params = input.required<any>();
  genreMap = toSignal(this.movieService.getCombinedGenreMap(), {
    initialValue: new Map(),
  });

  searchResults = signal<SearchResult[] | null>(null);
  loading = signal(true);
  loadingMore = signal(false);
  searchPage = signal(1);
  totalPages = signal(1);
  searchQuery = signal("");
  hiddenCount = signal(0);
  showingHidden = signal(false);

  // New signals for filtering and sorting
  activeFilter = signal<"all" | "movie" | "tv" | "channel" | "collection">(
    "all"
  );
  sortBy = signal<"relevance" | "newest" | "rating">("relevance");

  hasMore = computed(() => this.searchPage() < this.totalPages());

  filteredAndSortedResults = computed(() => {
    const results = this.searchResults();
    if (!results) {
      return [];
    }

    // 1. Filter
    const filter = this.activeFilter();
    let filtered = results;
    if (filter !== "all") {
      filtered = results.filter((item) => {
        if (filter === "movie")
          return this.isMedia(item) && item.media_type === "movie";
        if (filter === "tv")
          return this.isMedia(item) && item.media_type === "tv";
        if (filter === "channel") return this.isChannel(item);
        if (filter === "collection") return this.isCollection(item);
        return false;
      });
    }

    // 2. Sort
    const sortByValue = this.sortBy();
    if (sortByValue === "relevance") {
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

      if (sortByValue === "newest") {
        const dateAStr =
          mediaA.media_type === "movie"
            ? mediaA.release_date
            : mediaA.first_air_date;
        const dateBStr =
          mediaB.media_type === "movie"
            ? mediaB.release_date
            : mediaB.first_air_date;
        // Handle cases where date might be missing
        if (!dateAStr) return 1;
        if (!dateBStr) return -1;
        const dateA = new Date(dateAStr).getTime();
        const dateB = new Date(dateBStr).getTime();
        return dateB - dateA;
      }

      if (sortByValue === "rating") {
        return mediaB.vote_average - mediaA.vote_average;
      }

      return 0;
    });
  });

  constructor() {
    effect((onCleanup) => {
      // Accept either `q` or `query` in params for compatibility. We prefer
      // `q` as the canonical query key because it's used in the browser URL
      // (e.g., /search?q=funny). This makes it easy to preserve search state
      // across page reloads.
      const query =
        this.params().q ?? (this.params().query as string | undefined);
      this.searchQuery.set(query || "");
      this.searchResults.set(null); // Clear for skeleton
      this.loading.set(true);
      this.searchPage.set(1);
      // Reset filters on new search
      this.activeFilter.set("all");
      this.sortBy.set("relevance");

      if (!query) {
        this.searchResults.set([]);
        this.totalPages.set(1);
        this.loading.set(false);
        return;
      }

      const sub = this.movieService.searchAll(query, 1, false).subscribe({
        next: (data) => {
          this.searchResults.set(data.results);
          this.totalPages.set(data.total_pages);
          this.hiddenCount.set(data.hidden_count || 0);
          this.showingHidden.set(false);
          this.loading.set(false);
        },
        error: () => {
          this.searchResults.set([]);
          this.totalPages.set(1);
          this.hiddenCount.set(0);
          this.loading.set(false);
        },
      });
      onCleanup(() => sub.unsubscribe());
    });
  }

  loadMore() {
    if (this.loading() || this.loadingMore() || !this.hasMore()) {
      return;
    }

    this.loadingMore.set(true);
    this.searchPage.update((p) => p + 1);

    this.movieService
      .searchAll(this.searchQuery(), this.searchPage(), this.showingHidden())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.searchResults.update((currentResults) => [
            ...(currentResults || []),
            ...data.results,
          ]);
          this.totalPages.set(data.total_pages);
          this.hiddenCount.update((count) => count + (data.hidden_count || 0));
          this.loadingMore.set(false);
        },
        error: () => {
          this.loadingMore.set(false);
        },
      });
  }

  loadHiddenResults() {
    if (this.loading() || this.loadingMore() || this.showingHidden()) {
      return;
    }

    this.loadingMore.set(true);
    this.showingHidden.set(true);

    // Reload all pages with includeNoPoster = true
    const currentPage = this.searchPage();
    const requests = Array.from({ length: currentPage }, (_, i) =>
      this.movieService.searchAll(this.searchQuery(), i + 1, true)
    );

    // Helper for de-duplicating items across the visible list and the full list
    const keyFor = (item: SearchResult) => {
      if (this.isMedia(item)) return `${item.media_type}-${item.id}`;
      if (this.isCollection(item)) return `collection-${item.id}`;
      // channel/other
      return `channel-${(item as any).id}`;
    };

    forkJoin(requests)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (results) => {
          const allResults = results.flatMap((r) => r.results);

          // Start with currently visible results (unchanged order)
          const current = this.searchResults() || [];
          const existingKeys = new Set(current.map(keyFor));

          // Hidden-only = items present in allResults that are NOT in current visible set
          const hiddenOnly = allResults.filter(
            (it) => !existingKeys.has(keyFor(it))
          );

          // Append hidden-only results to bottom rather than re-inserting into the main ordering
          const merged = [...current, ...hiddenOnly];

          this.searchResults.set(merged);
          this.hiddenCount.set(0);
          this.loadingMore.set(false);
        },
        error: () => {
          this.loadingMore.set(false);
        },
      });
  }

  isMedia(item: SearchResult): item is MediaType {
    return "media_type" in item && item.media_type !== "collection";
  }

  isCollection(item: SearchResult): item is CollectionSearchResult {
    return "media_type" in item && item.media_type === "collection";
  }

  isChannel(item: SearchResult): item is SubscribableChannel {
    return "type" in item;
  }

  toggleSubscription(channel: SubscribableChannel) {
    if (this.subscriptionService.isSubscribed(channel.id)) {
      this.subscriptionService.removeSubscription(channel.id);
    } else {
      this.subscriptionService.addSubscription(channel);
    }
  }

  onMediaClicked(media: MediaType) {
    // Use history navigation with URL update so sharing / deep linking works
    this.navigationService.navigateTo("watch", {
      mediaType: media.media_type,
      id: media.id,
    });
  }

  onChannelResultClicked(channel: SubscribableChannel): void {
    this.navigationService.navigateTo("channel", channel);
  }

  onSortChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.sortBy.set(value as "relevance" | "newest" | "rating");
  }
}
