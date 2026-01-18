import {
  Component,
  ChangeDetectionStrategy,
  signal,
  inject,
  computed,
  effect,
  input,
  DestroyRef,
} from "@angular/core";
import { CommonModule, NgOptimizedImage } from "@angular/common";
import { MovieService } from "../../services/movie.service";
import { SubscriptionService } from "../../services/subscription.service";
import {
  Network,
  MediaType,
  SubscribableChannel,
  ProductionCompany,
} from "../../models/movie.model";
import { VideoGridComponent } from "../video-grid/video-grid.component";
import { InfiniteScrollTriggerComponent } from "../infinite-scroll-trigger/infinite-scroll-trigger.component";
import { NavigationService } from "../../services/navigation.service";
import { toSignal, takeUntilDestroyed } from "@angular/core/rxjs-interop";
import {
  of,
  forkJoin,
  catchError,
  map,
  Observable,
  Subscription,
  combineLatest,
  switchMap,
  tap,
  EMPTY,
} from "rxjs";
import { ContentCategoryComponent } from "../content-category/content-category.component";

// Explicit mappings for known network/company/provider relationships
interface ChannelMapping {
  networkId?: number;
  companyId?: number;
  providerId?: number;
}

const CHANNEL_MAPPINGS: Record<string, ChannelMapping> = {
  netflix: { networkId: 213, companyId: 1, providerId: 8 },
  amazon: { networkId: 1024, companyId: 20580, providerId: 9 },
  "prime video": { networkId: 1024, companyId: 20580, providerId: 9 },
  "disney+": { networkId: 2739, companyId: 2, providerId: 337 },
  hbo: { networkId: 49, companyId: 7, providerId: 384 },
  "apple tv+": { networkId: 2552, companyId: 2, providerId: 350 },
  "paramount+": { networkId: 4330, companyId: 4, providerId: 531 },
  hulu: { networkId: 453, providerId: 15 },
  peacock: { networkId: 3353, companyId: 33, providerId: 386 },
  // Add more as needed
};

type ContentType = "all" | "movie" | "tv";

interface ChannelConfig {
  type: "network" | "company" | "hybrid";
  networkId?: number;
  companyId?: number;
  providerId?: number;
  details: Network | ProductionCompany;
}

@Component({
  selector: "app-channel-detail",
  standalone: true,
  imports: [
    CommonModule,
    NgOptimizedImage,
    VideoGridComponent,
    InfiniteScrollTriggerComponent,
    ContentCategoryComponent,
  ],
  templateUrl: "./channel-detail.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChannelDetailComponent {
  private movieService = inject(MovieService);
  private subscriptionService = inject(SubscriptionService);
  private navigationService = inject(NavigationService);
  private destroyRef = inject(DestroyRef);

  params = input.required<any>();

  // Core channel state
  channelConfig = signal<ChannelConfig | null>(null);
  loadingChannel = signal(true);

  // Derived from channelConfig for template compatibility
  channelDetails = computed(() => this.channelConfig()?.details ?? null);
  channelType = computed(() => this.channelConfig()?.type ?? null);

  genreMap = toSignal(this.movieService.getCombinedGenreMap(), {
    initialValue: new Map(),
  });
  private movieGenres = toSignal(this.movieService.getMovieGenreMap());
  private tvGenres = toSignal(this.movieService.getTvGenreMap());

  // Page state
  activeTab = signal<"home" | "videos" | "about">("home");
  descriptionExpanded = signal(false);

  // Home tab state
  popularMedia = signal<MediaType[]>([]);
  latestMedia = signal<MediaType[]>([]);
  loadingHome = signal(true);
  popularMedia$ = computed<Observable<MediaType[]>>(() =>
    of(this.popularMedia()),
  );
  latestMedia$ = computed<Observable<MediaType[]>>(() =>
    of(this.latestMedia()),
  );

  // Videos tab state
  allMediaItems = signal<MediaType[]>([]);
  tvPage = signal(1);
  moviePage = signal(1);
  tvTotalPages = signal(0);
  movieTotalPages = signal(0);
  loadingVideos = signal(true);
  loadingMore = signal(false);
  sortBy = signal("popularity.desc");
  selectedYear = signal<number | null>(null);
  selectedMinRating = signal<number | null>(null);
  selectedGenre = signal<number | null>(null);
  contentFilter = signal<ContentType>("all");

  // Computed Properties
  isHybridContent = computed(() => this.channelConfig()?.type === "hybrid");

  hasMore = computed(() => {
    const config = this.channelConfig();
    if (!config) return false;

    const filter = this.contentFilter();
    const hasMoreTv = config.networkId && this.tvPage() < this.tvTotalPages();
    const hasMoreMovies =
      (config.companyId || config.providerId) &&
      this.moviePage() < this.movieTotalPages();

    if (filter === "tv") return !!hasMoreTv;
    if (filter === "movie") return !!hasMoreMovies;
    return !!hasMoreTv || !!hasMoreMovies;
  });

  filteredMediaItems = computed(() => {
    const items = this.allMediaItems();
    const filter = this.contentFilter();
    if (filter === "all") return items;
    return items.filter((item) => item.media_type === filter);
  });

  // Keep existing computed properties...
  isSubscribed = computed(() => {
    const channel = this.channelDetails();
    return channel ? this.subscriptionService.isSubscribed(channel.id) : false;
  });

  logoUrl = computed(() => {
    const channel = this.channelDetails();
    return channel?.logo_path
      ? `https://image.tmdb.org/t/p/h60${channel.logo_path}`
      : null;
  });

  bannerUrl = computed(() => {
    const popular = this.popularMedia();
    const itemWithBackdrop = popular.find((i) => i.backdrop_path);
    return itemWithBackdrop
      ? `https://image.tmdb.org/t/p/w1280${itemWithBackdrop.backdrop_path}`
      : null;
  });

  channelDescription = computed(() => {
    const details = this.channelDetails();
    if (details && "description" in details && details.description) {
      return details.description;
    }
    return null;
  });

  countryName = computed(() => {
    const countryCode = this.channelDetails()?.origin_country;
    if (!countryCode) return "";
    try {
      return (
        new Intl.DisplayNames(["en"], { type: "region" }).of(countryCode) ||
        countryCode
      );
    } catch {
      return countryCode;
    }
  });

  availableGenres = computed(() => {
    const config = this.channelConfig();
    if (!config) return [];

    let genreMap: Map<number, string> | undefined;

    if (config.type === "hybrid") {
      genreMap = new Map<number, string>([
        ...(this.movieGenres() ?? []),
        ...(this.tvGenres() ?? []),
      ]);
    } else if (config.type === "company") {
      genreMap = this.movieGenres();
    } else {
      genreMap = this.tvGenres();
    }

    if (!genreMap) return [];

    return Array.from(genreMap.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  sortOptions = computed(() => {
    const config = this.channelConfig();
    if (config?.type === "company") {
      return [
        { value: "popularity.desc", label: "Most Popular" },
        { value: "primary_release_date.desc", label: "Newest" },
        { value: "primary_release_date.asc", label: "Oldest" },
        { value: "vote_average.desc", label: "Top Rated" },
        { value: "vote_average.asc", label: "Lowest Rated" },
      ];
    }
    return [
      { value: "popularity.desc", label: "Most Popular" },
      { value: "first_air_date.desc", label: "Newest" },
      { value: "first_air_date.asc", label: "Oldest" },
      { value: "vote_average.desc", label: "Top Rated" },
      { value: "vote_average.asc", label: "Lowest Rated" },
    ];
  });

  years = computed(() => {
    const currentYear = new Date().getFullYear();
    return Array.from(
      { length: currentYear - 1949 },
      (_, i) => currentYear - i,
    );
  });

  ratings = [9, 8, 7, 6, 5];

  // Alias for template compatibility
  isMixedContent = this.isHybridContent;
  mediaItems = this.filteredMediaItems;

  constructor() {
    // Single effect that handles the entire initialization chain
    effect(
      (onCleanup) => {
        const p = this.params();
        this.resetAllState();

        const { id, type, name } = p;
        if (!id || !type) {
          this.loadingChannel.set(false);
          return;
        }

        const sub = this.initializeChannel(+id, type, name)
          .pipe(
            takeUntilDestroyed(this.destroyRef),
            switchMap((config) => {
              this.channelConfig.set(config);
              this.loadingChannel.set(false);
              return this.loadHomeContentInternal(config);
            }),
          )
          .subscribe({
            next: ({ popular, latest }) => {
              this.popularMedia.set(popular);
              this.latestMedia.set(latest);
              this.loadingHome.set(false);
            },
            error: () => {
              this.loadingChannel.set(false);
              this.loadingHome.set(false);
            },
          });

        onCleanup(() => sub.unsubscribe());
      },
      { allowSignalWrites: true },
    );
  }

  private resetAllState(): void {
    this.loadingChannel.set(true);
    this.loadingHome.set(true);
    this.channelConfig.set(null);
    this.allMediaItems.set([]);
    this.popularMedia.set([]);
    this.latestMedia.set([]);
    this.activeTab.set("home");
    this.tvPage.set(1);
    this.moviePage.set(1);
    this.tvTotalPages.set(0);
    this.movieTotalPages.set(0);
    this.contentFilter.set("all");
    this.selectedGenre.set(null);
    this.selectedYear.set(null);
    this.selectedMinRating.set(null);
  }

  private initializeChannel(
    id: number,
    type: "network" | "company",
    name?: string,
  ): Observable<ChannelConfig> {
    // Check for known mappings first
    const normalizedName = name?.toLowerCase().trim() ?? "";
    const knownMapping = this.findKnownMapping(normalizedName);

    if (knownMapping) {
      return this.buildConfigFromMapping(knownMapping, type, id);
    }

    // Fallback to simple config
    return this.buildSimpleConfig(id, type);
  }

  private findKnownMapping(name: string): ChannelMapping | null {
    // Check direct match
    if (CHANNEL_MAPPINGS[name]) {
      return CHANNEL_MAPPINGS[name];
    }

    // Check partial matches
    for (const [key, mapping] of Object.entries(CHANNEL_MAPPINGS)) {
      if (name.includes(key) || key.includes(name)) {
        return mapping;
      }
    }

    return null;
  }

  private buildConfigFromMapping(
    mapping: ChannelMapping,
    originalType: "network" | "company",
    originalId: number,
  ): Observable<ChannelConfig> {
    // Use the appropriate ID from the mapping, or fall back to original
    const networkId = mapping.networkId;
    const companyId = mapping.companyId;
    const providerId = mapping.providerId;

    // Determine if this is a hybrid channel
    const isHybrid = !!networkId && (!!companyId || !!providerId);

    // Fetch details from the original type/id passed in
    const details$ =
      originalType === "network"
        ? this.movieService.getNetworkDetails(originalId)
        : this.movieService.getCompanyDetails(originalId);

    return details$.pipe(
      map((details) => ({
        type: isHybrid ? ("hybrid" as const) : originalType,
        networkId: originalType === "network" ? originalId : networkId,
        companyId: originalType === "company" ? originalId : companyId,
        providerId,
        details,
      })),
    );
  }

  private buildSimpleConfig(
    id: number,
    type: "network" | "company",
  ): Observable<ChannelConfig> {
    const details$ =
      type === "network"
        ? this.movieService.getNetworkDetails(id)
        : this.movieService.getCompanyDetails(id);

    return details$.pipe(
      switchMap((details) => {
        // Try to find a provider ID for networks dynamically
        if (type === "network") {
          return this.movieService.searchWatchProvider(details.name).pipe(
            map((providerId) => ({
              type: providerId ? ("hybrid" as const) : ("network" as const),
              networkId: id,
              providerId: providerId ?? undefined,
              details,
            })),
            catchError(() =>
              of({
                type: "network" as const,
                networkId: id,
                details,
              }),
            ),
          );
        }

        return of({
          type: "company" as const,
          companyId: id,
          details,
        });
      }),
    );
  }

  private loadHomeContentInternal(
    config: ChannelConfig,
  ): Observable<{ popular: MediaType[]; latest: MediaType[] }> {
    const requests: Observable<MediaType[]>[] = [];
    const latestRequests: Observable<MediaType[]>[] = [];

    // TV content from network
    if (config.networkId) {
      requests.push(
        this.movieService
          .discoverMedia({
            type: "tv",
            page: 1,
            sort_by: "popularity.desc",
            with_network: config.networkId,
          })
          .pipe(
            map((res) => res.results),
            catchError(() => of([])),
          ),
      );

      latestRequests.push(
        this.movieService
          .discoverMedia({
            type: "tv",
            page: 1,
            sort_by: "first_air_date.desc",
            with_network: config.networkId,
          })
          .pipe(
            map((res) => res.results),
            catchError(() => of([])),
          ),
      );
    }

    // Movie content from provider or company
    if (config.providerId) {
      requests.push(
        this.movieService
          .discoverMedia({
            type: "movie",
            page: 1,
            sort_by: "popularity.desc",
            with_watch_providers: config.providerId,
            watch_region: "US",
          })
          .pipe(
            map((res) => res.results),
            catchError(() => of([])),
          ),
      );

      latestRequests.push(
        this.movieService
          .discoverMedia({
            type: "movie",
            page: 1,
            sort_by: "primary_release_date.desc",
            with_watch_providers: config.providerId,
            watch_region: "US",
          })
          .pipe(
            map((res) => res.results),
            catchError(() => of([])),
          ),
      );
    } else if (config.companyId) {
      requests.push(
        this.movieService
          .discoverMedia({
            type: "movie",
            page: 1,
            sort_by: "popularity.desc",
            with_company: config.companyId,
          })
          .pipe(
            map((res) => res.results),
            catchError(() => of([])),
          ),
      );

      latestRequests.push(
        this.movieService
          .discoverMedia({
            type: "movie",
            page: 1,
            sort_by: "primary_release_date.desc",
            with_company: config.companyId,
          })
          .pipe(
            map((res) => res.results),
            catchError(() => of([])),
          ),
      );
    }

    if (requests.length === 0) {
      return of({ popular: [], latest: [] });
    }

    return forkJoin({
      popular: forkJoin(requests).pipe(
        map((results) => this.mergeAndSort(results.flat(), "popularity.desc")),
      ),
      latest: forkJoin(latestRequests).pipe(
        map((results) => this.mergeAndSort(results.flat(), "date.desc")),
      ),
    });
  }

  loadVideos(loadMore = false): void {
    const config = this.channelConfig();
    if (!config) return;

    if (!loadMore) {
      this.loadingVideos.set(true);
      this.allMediaItems.set([]);
      this.tvPage.set(1);
      this.moviePage.set(1);
    } else {
      this.loadingMore.set(true);
    }

    const filter = this.contentFilter();
    const requests: Observable<{
      type: ContentType;
      results: MediaType[];
      totalPages: number;
    }>[] = [];

    const baseParams = {
      vote_average_gte: this.selectedMinRating() ?? undefined,
      with_genres: this.selectedGenre() ? [this.selectedGenre()!] : undefined,
    };

    // TV request
    if (config.networkId && (filter === "all" || filter === "tv")) {
      const shouldLoadTv = !loadMore || this.tvPage() <= this.tvTotalPages();
      if (shouldLoadTv) {
        requests.push(
          this.movieService
            .discoverMedia({
              type: "tv",
              page: this.tvPage(),
              sort_by: this.getTvSortBy(),
              with_network: config.networkId,
              first_air_date_year: this.selectedYear() ?? undefined,
              ...baseParams,
            })
            .pipe(
              map((res) => ({
                type: "tv" as ContentType,
                results: res.results,
                totalPages: res.total_pages,
              })),
              catchError(() =>
                of({ type: "tv" as ContentType, results: [], totalPages: 0 }),
              ),
            ),
        );
      }
    }

    // Movie request
    const hasMovieSource = config.providerId || config.companyId;
    if (hasMovieSource && (filter === "all" || filter === "movie")) {
      const shouldLoadMovies =
        !loadMore || this.moviePage() <= this.movieTotalPages();
      if (shouldLoadMovies) {
        const movieParams = config.providerId
          ? { with_watch_providers: config.providerId, watch_region: "US" }
          : { with_company: config.companyId };

        requests.push(
          this.movieService
            .discoverMedia({
              type: "movie",
              page: this.moviePage(),
              sort_by: this.getMovieSortBy(),
              primary_release_year: this.selectedYear() ?? undefined,
              ...baseParams,
              ...movieParams,
            })
            .pipe(
              map((res) => ({
                type: "movie" as ContentType,
                results: res.results,
                totalPages: res.total_pages,
              })),
              catchError(() =>
                of({
                  type: "movie" as ContentType,
                  results: [],
                  totalPages: 0,
                }),
              ),
            ),
        );
      }
    }

    if (requests.length === 0) {
      this.loadingVideos.set(false);
      this.loadingMore.set(false);
      return;
    }

    forkJoin(requests)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (results) => {
          let newItems: MediaType[] = [];

          for (const result of results) {
            if (result.type === "tv") {
              this.tvTotalPages.set(result.totalPages);
            } else {
              this.movieTotalPages.set(result.totalPages);
            }
            newItems = [...newItems, ...result.results];
          }

          // Sort the combined results
          const sortedItems = this.mergeAndSort(newItems, this.sortBy());

          if (loadMore) {
            this.allMediaItems.update((current) => [
              ...current,
              ...sortedItems,
            ]);
          } else {
            this.allMediaItems.set(sortedItems);
          }
        },
        complete: () => {
          this.loadingVideos.set(false);
          this.loadingMore.set(false);
        },
      });
  }

  loadMoreMedia(): void {
    if (this.loadingVideos() || this.loadingMore() || !this.hasMore()) return;

    const config = this.channelConfig();
    const filter = this.contentFilter();

    // Increment pages for sources that still have more
    if (config?.networkId && (filter === "all" || filter === "tv")) {
      if (this.tvPage() < this.tvTotalPages()) {
        this.tvPage.update((p) => p + 1);
      }
    }

    if (
      (config?.providerId || config?.companyId) &&
      (filter === "all" || filter === "movie")
    ) {
      if (this.moviePage() < this.movieTotalPages()) {
        this.moviePage.update((p) => p + 1);
      }
    }

    this.loadVideos(true);
  }

  private mergeAndSort(items: MediaType[], sortBy: string): MediaType[] {
    // Remove duplicates by id + media_type
    const seen = new Set<string>();
    const unique = items.filter((item) => {
      const key = `${item.media_type}-${item.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const sorted = [...unique];

    if (
      sortBy.includes("date") ||
      sortBy.includes("release") ||
      sortBy.includes("air")
    ) {
      const getDate = (item: MediaType): number => {
        const dateStr =
          item.media_type === "movie" ? item.release_date : item.first_air_date;
        return dateStr ? new Date(dateStr).getTime() : 0;
      };
      sorted.sort((a, b) =>
        sortBy.includes(".asc")
          ? getDate(a) - getDate(b)
          : getDate(b) - getDate(a),
      );
    } else if (sortBy.includes("vote_average")) {
      sorted.sort((a, b) =>
        sortBy.includes(".asc")
          ? a.vote_average - b.vote_average
          : b.vote_average - a.vote_average,
      );
    } else {
      sorted.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
    }

    return sorted;
  }

  private getTvSortBy(): string {
    return this.sortBy().replace("primary_release_date", "first_air_date");
  }

  private getMovieSortBy(): string {
    return this.sortBy().replace("first_air_date", "primary_release_date");
  }

  applyVideosFiltersAndLoad(): void {
    this.loadVideos();
  }

  toggleSubscription(): void {
    const currentChannel = this.channelDetails();
    if (!currentChannel) return;

    if (this.isSubscribed()) {
      this.subscriptionService.removeSubscription(currentChannel.id);
    } else {
      const config = this.channelConfig();
      const channelToSubscribe: SubscribableChannel = {
        ...currentChannel,
        type:
          config?.type === "hybrid" ? "network" : (config?.type ?? "network"),
      };
      this.subscriptionService.addSubscription(channelToSubscribe);
    }
  }

  onMediaClicked(media: MediaType): void {
    this.navigationService.navigateTo("watch", {
      mediaType: media.media_type,
      id: media.id,
    });
  }

  onTabClick(tab: "home" | "videos" | "about"): void {
    if (this.activeTab() === tab) return;
    this.activeTab.set(tab);
    if (tab === "videos" && this.allMediaItems().length === 0) {
      this.loadVideos();
    }
  }

  onSortChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.sortBy.set(select.value);
    this.applyVideosFiltersAndLoad();
  }

  onYearChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.selectedYear.set(Number(select.value) || null);
    this.applyVideosFiltersAndLoad();
  }

  onRatingChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.selectedMinRating.set(Number(select.value) || null);
    this.applyVideosFiltersAndLoad();
  }

  onGenreChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.selectedGenre.set(Number(select.value) || null);
    this.applyVideosFiltersAndLoad();
  }
}
