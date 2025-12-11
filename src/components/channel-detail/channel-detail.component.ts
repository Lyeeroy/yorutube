import { Component, ChangeDetectionStrategy, signal, inject, computed, effect, input, DestroyRef } from '@angular/core';
import { CommonModule, NgOptimizedImage } from '@angular/common';
import { MovieService } from '../../services/movie.service';
import { SubscriptionService } from '../../services/subscription.service';
import { Network, MediaType, SubscribableChannel, ProductionCompany } from '../../models/movie.model';
import { VideoGridComponent } from '../video-grid/video-grid.component';
import { InfiniteScrollTriggerComponent } from '../infinite-scroll-trigger/infinite-scroll-trigger.component';
import { NavigationService } from '../../services/navigation.service';
import { toSignal, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { of, forkJoin, catchError, map, Observable, Subscription } from 'rxjs';
import { ContentCategoryComponent } from '../content-category/content-category.component';

@Component({
  selector: 'app-channel-detail',
  standalone: true,
  imports: [CommonModule, NgOptimizedImage, VideoGridComponent, InfiniteScrollTriggerComponent, ContentCategoryComponent],
  templateUrl: './channel-detail.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChannelDetailComponent {
  private movieService = inject(MovieService);
  private subscriptionService = inject(SubscriptionService);
  private navigationService = inject(NavigationService);
  private destroyRef = inject(DestroyRef);

  params = input.required<any>();
  effectiveParams = signal<any>(null);
  channelDetails = signal<Network | ProductionCompany | null>(null);
  genreMap = toSignal(this.movieService.getCombinedGenreMap(), { initialValue: new Map() });
  private movieGenres = toSignal(this.movieService.getMovieGenreMap());
  private tvGenres = toSignal(this.movieService.getTvGenreMap());

  // Page state
  loadingChannel = signal(true);
  activeTab = signal<'home' | 'videos' | 'about'>('home');
  descriptionExpanded = signal(false);

  // Home tab state
  popularMedia = signal<MediaType[]>([]);
  latestMedia = signal<MediaType[]>([]);
  loadingHome = signal(true);
  popularMedia$ = computed<Observable<MediaType[]>>(() => of(this.popularMedia()));
  latestMedia$ = computed<Observable<MediaType[]>>(() => of(this.latestMedia()));
  
  // Videos tab state
  mediaItems = signal<MediaType[]>([]);
  page = signal(1);
  totalPages = signal(1);
  loadingVideos = signal(true);
  loadingMore = signal(false);
  sortBy = signal('popularity.desc');
  selectedYear = signal<number | null>(null);
  selectedMinRating = signal<number | null>(null);
  selectedGenre = signal<number | null>(null);
  contentFilter = signal<'all' | 'movie' | 'tv'>('all');
  providerId = signal<number | null>(null);

  // Computed Properties
  channelType = computed(() => this.effectiveParams()?.type as 'network' | 'company' | 'merged');
  hasMore = computed(() => this.page() < this.totalPages());
  isSubscribed = computed(() => {
    const channel = this.channelDetails();
    return channel ? this.subscriptionService.isSubscribed(channel.id) : false;
  });
  logoUrl = computed(() => {
    const channel = this.channelDetails();
    return channel?.logo_path ? `https://image.tmdb.org/t/p/h60${channel.logo_path}` : null;
  });
  bannerUrl = computed(() => {
    const popular = this.popularMedia();
    const itemWithBackdrop = popular.find(i => i.backdrop_path);
    if (itemWithBackdrop) {
        return `https://image.tmdb.org/t/p/w1280${itemWithBackdrop.backdrop_path}`;
    }
    return null;
  });
  channelDescription = computed(() => {
    const details = this.channelDetails();
    if (details && 'description' in details && details.description) {
      return details.description;
    }
    return null;
  });

  countryName = computed(() => {
    const countryCode = this.channelDetails()?.origin_country;
    if (!countryCode) {
        return '';
    }
    try {
        return new Intl.DisplayNames(['en'], { type: 'region' }).of(countryCode) || countryCode;
    } catch (e) {
        return countryCode;
    }
  });

  isMixedContent = computed(() => {
    const type = this.channelType();
    if (type === "merged") return true;
    if (type === "network") {
      return !!this.providerId();
    }
    return false;
  });

  availableGenres = computed(() => {
    const type = this.channelType();
    let genreMap: Map<number, string> | undefined;

    if (this.isMixedContent()) {
      // FIX: Explicitly type the new Map to avoid 'unknown' type inference when combining.
      const combined = new Map<number, string>([
        ...(this.movieGenres() ?? []),
        ...(this.tvGenres() ?? []),
      ]);
      genreMap = combined;
    } else if (type === "company") {
      genreMap = this.movieGenres();
    } else if (type === "network") {
      genreMap = this.tvGenres();
    }

    if (!genreMap) return [];

    const genres = Array.from(genreMap.entries()).map(([id, name]) => ({
      id,
      name,
    }));
    genres.sort((a, b) => a.name.localeCompare(b.name));
    return genres;
  });

  filteredMediaItems = computed(() => {
    const items = this.mediaItems();
    const filter = this.contentFilter();
    if (filter === "all" || !this.isMixedContent()) {
      return items;
    }
    return items.filter((item) => item.media_type === filter);
  });

  sortOptions = computed(() => {
    const type = this.channelType();
    if (type === "company" && !this.isMixedContent()) {
      // Movie sorting
      return [
        { value: "popularity.desc", label: "Most Popular" },
        { value: "primary_release_date.desc", label: "Newest" },
        { value: "primary_release_date.asc", label: "Oldest" },
        { value: "vote_average.desc", label: "Top Rated" },
        { value: "vote_average.asc", label: "Lowest Rated" },
      ];
    }
    // Default to TV sorting (also for merged/mixed)
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
    const years: number[] = [];
    for (let i = currentYear; i >= 1950; i--) {
      years.push(i);
    }
    return years;
  });

  ratings = [9, 8, 7, 6, 5];

  constructor() {
    effect((onCleanup) => {
        const p = this.params();
        this.loadingChannel.set(true);
        this.channelDetails.set(null);
        this.effectiveParams.set(null);
        this.mediaItems.set([]);
        this.activeTab.set('home');

        const { id, type, name } = p;
        if (!id || !type) {
            this.loadingChannel.set(false);
            return;
        }

        const loadChannelHeader = (finalParams: any) => {
            this.effectiveParams.set(finalParams);
            const { id: finalId, type: finalType, networkId } = finalParams;
            const detailId = finalType === 'merged' ? (networkId || finalId) : finalId;
            const detailType = finalType === 'merged' ? 'network' : finalType;

            const details$ = detailType === 'network'
                ? this.movieService.getNetworkDetails(+detailId)
                : this.movieService.getCompanyDetails(+detailId);
            
            const detailSub = details$.subscribe(details => {
                this.channelDetails.set(details);
                this.loadingChannel.set(false);
            });
            onCleanup(() => detailSub.unsubscribe());
        };

        if (type === 'merged' || !name) {
            loadChannelHeader(p);
            return;
        }

        // Handle aliases for merging (e.g. Prime Video network <-> Amazon Studios company)
        const alias = this.getAlias(name, type);
        const searchName = alias || name;

        let mergeCheckSub: any;
        if (type === 'network') {
            mergeCheckSub = this.movieService.searchCompanies(searchName, 1).pipe(
                map(response => response.results.find(c => 
                    c.name.toLowerCase() === searchName.toLowerCase() || 
                    c.name.toLowerCase() === name.toLowerCase()
                )),
                catchError(() => of(undefined))
            ).subscribe(company => {
                if (company) {
                    loadChannelHeader({ ...p, type: 'merged', networkId: id, companyId: company.id });
                } else {
                    loadChannelHeader(p);
                }
            });
        } else { // type === 'company'
            mergeCheckSub = this.movieService.getPopularNetworks().pipe(
                map(networks => networks.find(n => 
                    n.name.toLowerCase() === searchName.toLowerCase() || 
                    n.name.toLowerCase() === name.toLowerCase()
                )),
                catchError(() => of(undefined))
            ).subscribe(network => {
                if (network) {
                    loadChannelHeader({ ...p, type: 'merged', networkId: network.id, companyId: id });
                } else {
                    loadChannelHeader(p);
                }
            });
        }
        onCleanup(() => mergeCheckSub?.unsubscribe());
    }, { allowSignalWrites: true });

    // Effect to resolve provider ID dynamically
    effect((onCleanup) => {
        const details = this.channelDetails();
        const type = this.channelType();
        const params = this.effectiveParams();
        
        // Reset provider ID when channel changes
        if (!details) {
            this.providerId.set(null);
            return;
        }

        if (type === 'network' && params) {
            const hardcoded = this.movieService.getProviderIdForNetwork(params.id);
            if (hardcoded) {
                this.providerId.set(hardcoded);
            } else {
                // Try dynamic search
                const sub = this.movieService.searchWatchProvider(details.name).subscribe(id => {
                    if (id) this.providerId.set(id);
                });
                onCleanup(() => sub.unsubscribe());
            }
        } else if (type === 'merged' && params) {
             const hardcoded = this.movieService.getProviderIdForNetwork(params.networkId);
             if (hardcoded) this.providerId.set(hardcoded);
        }
    }, { allowSignalWrites: true });

    effect((onCleanup) => {
        if (this.channelDetails()) {
            // Trigger load when providerId is resolved (or not)
            this.providerId(); 
            const homeSub = this.loadHomeContent();
            onCleanup(() => homeSub.unsubscribe());
            this.resetVideosTab();
        }
    });
  }

  resetVideosTab(): void {
    this.mediaItems.set([]);
    this.page.set(1);
    this.totalPages.set(1);
    this.contentFilter.set('all');
    this.loadingVideos.set(true);
    this.selectedGenre.set(null);
  }

  loadHomeContent(): Subscription {
    this.loadingHome.set(true);
    const type = this.channelType();
    const params = this.effectiveParams();
    if (!type || !params) {
      this.loadingHome.set(false);
      return new Subscription();
    }

    const commonParams = { page: 1, vote_average_gte: undefined };
    const popularSort = "popularity.desc";
    const latestSortMovie = "primary_release_date.desc";
    const latestSortTv = "first_air_date.desc";

    const providerId = this.getProviderId(type, params);
    const isMixed = type === "merged" || (type === "network" && !!providerId);

    let popular$: Observable<MediaType[]>;
    let latest$: Observable<MediaType[]>;

    if (isMixed) {
      const networkId = type === "merged" ? params.networkId : params.id;
      const movieQuery = this.getMovieQuery(params, providerId);

      const fetch = (type: "tv" | "movie", sort: string) =>
        this.movieService
          .discoverMedia({
            type,
            ...commonParams,
            sort_by: sort,
            ...(type === "tv" ? { with_network: networkId } : movieQuery),
          })
          .pipe(
            map((res) => res.results),
            catchError(() => of([]))
          );

      popular$ = forkJoin([
        fetch("tv", popularSort),
        fetch("movie", popularSort),
      ]).pipe(
        map(([tv, movies]) => this.sortMedia([...tv, ...movies], popularSort))
      );

      latest$ = forkJoin([
        fetch("tv", latestSortTv),
        fetch("movie", latestSortMovie),
      ]).pipe(
        map(([tv, movies]) =>
          this.sortMedia([...tv, ...movies], "primary_release_date.desc")
        )
      );
    } else {
      const discoverType = type === "network" ? "tv" : "movie";
      const idParam =
        type === "network"
          ? { with_network: params.id }
          : { with_company: params.id };
      const latestSort = type === "network" ? latestSortTv : latestSortMovie;

      const fetch = (sort: string) =>
        this.movieService
          .discoverMedia({
            type: discoverType,
            ...commonParams,
            sort_by: sort,
            ...idParam,
          })
          .pipe(
            map((res) => res.results),
            catchError(() => of([]))
          );

      popular$ = fetch(popularSort);
      latest$ = fetch(latestSort);
    }

    return forkJoin({ pop: popular$, lat: latest$ }).subscribe(
      ({ pop, lat }) => {
        this.popularMedia.set(pop);
        this.latestMedia.set(lat);
        this.loadingHome.set(false);
      }
    );
  }

  applyVideosFiltersAndLoad(): void {
    this.mediaItems.set([]);
    this.page.set(1);
    this.totalPages.set(1);
    this.loadVideos();
  }

  loadVideos(loadMore = false): void {
    const currentChannel = this.channelDetails();
    if (!currentChannel) return;

    if (!loadMore) {
      this.loadingVideos.set(true);
    } else {
      this.loadingMore.set(true);
    }

    const type = this.channelType();
    const params = this.effectiveParams();
    const providerId = this.getProviderId(type, params);
    const isMixed = type === "merged" || (type === "network" && !!providerId);

    const commonParams = {
      page: this.page(),
      vote_average_gte: this.selectedMinRating() ?? undefined,
      with_genres: this.selectedGenre() ? [this.selectedGenre()!] : undefined,
    };

    let request$: Observable<{ results: MediaType[]; total_pages: number }>;

    if (isMixed) {
      const networkId = type === "merged" ? params.networkId : params.id;
      const movieQuery = this.getMovieQuery(params, providerId);

      // Sort params for individual requests (approximate)
      const movieSort = this.sortBy().replace(
        "first_air_date",
        "primary_release_date"
      );
      const tvSort = this.sortBy().replace(
        "primary_release_date",
        "first_air_date"
      );

      const tvRequest$ = this.movieService
        .discoverMedia({
          type: "tv",
          ...commonParams,
          sort_by: tvSort,
          with_network: networkId,
          first_air_date_year: this.selectedYear() ?? undefined,
        })
        .pipe(catchError(() => of({ results: [], total_pages: 0 })));

      const movieRequest$ = this.movieService
        .discoverMedia({
          type: "movie",
          ...commonParams,
          sort_by: movieSort,
          ...movieQuery,
          primary_release_year: this.selectedYear() ?? undefined,
        })
        .pipe(catchError(() => of({ results: [], total_pages: 0 })));

      request$ = forkJoin({ tv: tvRequest$, movie: movieRequest$ }).pipe(
        map(({ tv, movie }) => ({
          results: this.sortMedia(
            [...tv.results, ...movie.results],
            this.sortBy()
          ),
          total_pages: Math.max(tv.total_pages, movie.total_pages),
        }))
      );
    } else {
      const discoverType = type === "network" ? "tv" : "movie";
      const idParam =
        type === "network"
          ? { with_network: params.id }
          : { with_company: params.id };

      request$ = this.movieService.discoverMedia({
        type: discoverType,
        ...commonParams,
        sort_by: this.sortBy(),
        ...idParam,
        primary_release_year:
          type === "company" ? this.selectedYear() ?? undefined : undefined,
        first_air_date_year:
          type === "network" ? this.selectedYear() ?? undefined : undefined,
      });
    }

    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (data) => {
        this.mediaItems.update((current) =>
          loadMore ? [...current, ...data.results] : data.results
        );
        this.totalPages.set(data.total_pages);
      },
      complete: () => {
        this.loadingVideos.set(false);
        this.loadingMore.set(false);
      },
    });
  }

  private getProviderId(type: string, params: any): number | null {
    // Use the resolved provider ID signal
    return this.providerId();
  }

  private getMovieQuery(params: any, providerId: number | null): any {
    return providerId
      ? { with_watch_providers: providerId, watch_region: "US" }
      : { with_company: params.companyId };
  }

  private sortMedia(items: MediaType[], sortBy: string): MediaType[] {
    // Filter out items without backdrop_path to ensure quality
    const validItems = items.filter(item => !!item.backdrop_path);
    const sorted = [...validItems];
    if (sortBy.includes("date")) {
      const getDate = (item: MediaType): number => {
        const dateStr =
          item.media_type === "movie"
            ? item.release_date
            : item.first_air_date;
        return dateStr ? new Date(dateStr).getTime() : 0;
      };
      if (sortBy.endsWith(".desc")) {
        // Newest
        sorted.sort((a, b) => getDate(b) - getDate(a));
      } else {
        // Oldest
        sorted.sort((a, b) => getDate(a) - getDate(b));
      }
    } else if (sortBy.includes("vote_average")) {
      if (sortBy.endsWith(".desc")) {
        // Top Rated
        sorted.sort((a, b) => b.vote_average - a.vote_average);
      } else {
        // Lowest Rated
        sorted.sort((a, b) => a.vote_average - b.vote_average);
      }
    } else {
      // Default to popularity
      sorted.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
    }
    return sorted;
  }

  loadMoreMedia(): void {
    if (this.loadingVideos() || this.loadingMore() || !this.hasMore()) {
        return;
    }
    this.page.update(p => p + 1);
    this.loadVideos(true);
  }

  toggleSubscription(): void {
    const currentChannel = this.channelDetails();
    if (!currentChannel) return;

    if (this.isSubscribed()) {
      this.subscriptionService.removeSubscription(currentChannel.id);
    } else {
      const channelToSubscribe: SubscribableChannel = {
        ...currentChannel,
        type: this.channelType() === 'merged' ? 'network' : this.channelType() // Subscribe as network for merged
      };
      this.subscriptionService.addSubscription(channelToSubscribe);
    }
  }

  onMediaClicked(media: MediaType): void {
    this.navigationService.navigateTo('watch', { mediaType: media.media_type, id: media.id });
  }

  onTabClick(tab: 'home' | 'videos' | 'about'): void {
    if (this.activeTab() === tab) return;
    this.activeTab.set(tab);
    if (tab === 'videos' && this.mediaItems().length === 0) {
        this.loadVideos();
    }
  }
  
  onSortChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    this.sortBy.set(select.value);
    this.applyVideosFiltersAndLoad();
  }

  onYearChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    this.selectedYear.set(Number(select.value) || null);
    this.applyVideosFiltersAndLoad();
  }

  onRatingChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    this.selectedMinRating.set(Number(select.value) || null);
    this.applyVideosFiltersAndLoad();
  }

  onGenreChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    this.selectedGenre.set(Number(select.value) || null);
    this.applyVideosFiltersAndLoad();
  }

  private getAlias(name: string, currentType: 'network' | 'company'): string | null {
    const lowerName = name.toLowerCase();
    if (currentType === 'network') {
        // Legacy Broadcast Networks -> Movie Studios
        // These need manual mapping because they don't have a direct 1:1 streaming provider with the same name
        // or the provider (like "Fox Now") doesn't have the full movie back-catalog.
        if (lowerName === 'fox') return '20th Century Studios';
        if (lowerName === 'nbc') return 'Universal Pictures';
        if (lowerName === 'abc') return 'ABC Studios';
        if (lowerName === 'cbs') return 'CBS Studios';
        
        // Note: Streaming services (Disney+, Prime Video, Apple TV+) are now handled 
        // automatically by the dynamic Provider Search, so they don't need aliases here.
    } else {
        // Searching for network counterpart
        if (lowerName === '20th century studios') return 'Fox';
        if (lowerName === 'universal pictures') return 'NBC';
    }
    return null;
  }
}
