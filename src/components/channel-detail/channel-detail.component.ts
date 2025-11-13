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

  availableGenres = computed(() => {
    const type = this.channelType();
    let genreMap: Map<number, string> | undefined;

    if (type === 'company') {
        genreMap = this.movieGenres();
    } else if (type === 'network') {
        genreMap = this.tvGenres();
    } else {
        // FIX: Explicitly type the new Map to avoid 'unknown' type inference when combining.
        const combined = new Map<number, string>([
            ...(this.movieGenres() ?? []),
            ...(this.tvGenres() ?? [])
        ]);
        genreMap = combined;
    }
    
    if (!genreMap) return [];
    
    const genres = Array.from(genreMap.entries()).map(([id, name]) => ({ id, name }));
    genres.sort((a, b) => a.name.localeCompare(b.name));
    return genres;
  });

  filteredMediaItems = computed(() => {
    const items = this.mediaItems();
    const filter = this.contentFilter();
    if (filter === 'all' || this.channelType() !== 'merged') {
        return items;
    }
    return items.filter(item => item.media_type === filter);
  });

  sortOptions = computed(() => {
    const type = this.channelType();
    if (type === 'company') { // Movie sorting
      return [
        { value: 'popularity.desc', label: 'Most Popular' },
        { value: 'primary_release_date.desc', label: 'Newest' },
        { value: 'primary_release_date.asc', label: 'Oldest' },
        { value: 'vote_average.desc', label: 'Top Rated' },
        { value: 'vote_average.asc', label: 'Lowest Rated' }
      ];
    }
    // Default to TV sorting (also for merged)
    return [
      { value: 'popularity.desc', label: 'Most Popular' },
      { value: 'first_air_date.desc', label: 'Newest' },
      { value: 'first_air_date.asc', label: 'Oldest' },
      { value: 'vote_average.desc', label: 'Top Rated' },
      { value: 'vote_average.asc', label: 'Lowest Rated' }
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

        let mergeCheckSub: any;
        if (type === 'network') {
            mergeCheckSub = this.movieService.searchCompanies(name, 1).pipe(
                map(response => response.results.find(c => c.name.toLowerCase() === name.toLowerCase())),
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
                map(networks => networks.find(n => n.name.toLowerCase() === name.toLowerCase())),
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

    effect((onCleanup) => {
        if (this.channelDetails()) {
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
    const popularSort = 'popularity.desc';
    const latestSortMovie = 'primary_release_date.desc';
    const latestSortTv = 'first_air_date.desc';

    let popular$: Observable<MediaType[]>;
    let latest$: Observable<MediaType[]>;

    if (type === 'merged') {
        const popularTV$ = this.movieService.discoverMedia({ type: 'tv', ...commonParams, sort_by: popularSort, with_network: params.networkId }).pipe(map(res => res.results), catchError(() => of([])));
        const popularMovies$ = this.movieService.discoverMedia({ type: 'movie', ...commonParams, sort_by: popularSort, with_company: params.companyId }).pipe(map(res => res.results), catchError(() => of([])));
        const latestTV$ = this.movieService.discoverMedia({ type: 'tv', ...commonParams, sort_by: latestSortTv, with_network: params.networkId }).pipe(map(res => res.results), catchError(() => of([])));
        const latestMovies$ = this.movieService.discoverMedia({ type: 'movie', ...commonParams, sort_by: latestSortMovie, with_company: params.companyId }).pipe(map(res => res.results), catchError(() => of([])));
        
        popular$ = forkJoin([popularTV$, popularMovies$]).pipe(map(([tv, movies]) => [...tv, ...movies].sort((a,b) => (b.popularity ?? 0) - (a.popularity ?? 0))));
        latest$ = forkJoin([latestTV$, latestMovies$]).pipe(map(([tv, movies]) => [...tv, ...movies].sort((a,b) => (b.popularity ?? 0) - (a.popularity ?? 0))));
    } else {
        const discoverType = type === 'network' ? 'tv' : 'movie';
        const idParam = type === 'network' ? { with_network: params.id } : { with_company: params.id };
        const latestSort = type === 'network' ? latestSortTv : latestSortMovie;

        popular$ = this.movieService.discoverMedia({ type: discoverType, ...commonParams, sort_by: popularSort, ...idParam }).pipe(map(res => res.results), catchError(() => of([])));
        latest$ = this.movieService.discoverMedia({ type: discoverType, ...commonParams, sort_by: latestSort, ...idParam }).pipe(map(res => res.results), catchError(() => of([])));
    }
    
    return forkJoin({ pop: popular$, lat: latest$ }).subscribe(({pop, lat}) => {
      this.popularMedia.set(pop);
      this.latestMedia.set(lat);
      this.loadingHome.set(false);
    });
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

    if (type === 'merged' && params.networkId && params.companyId) {
        const movieSort = this.sortBy().replace('first_air_date', 'primary_release_date');
        const tvSort = this.sortBy().replace('primary_release_date', 'first_air_date');

        const commonParams = {
            page: this.page(),
            vote_average_gte: this.selectedMinRating() ?? undefined,
            with_genres: this.selectedGenre() ? [this.selectedGenre()!] : undefined,
        };

        const tvRequest$ = this.movieService.discoverMedia({
            type: 'tv',
            ...commonParams,
            sort_by: tvSort,
            with_network: params.networkId,
            first_air_date_year: this.selectedYear() ?? undefined,
        }).pipe(catchError(() => of({ results: [], total_pages: 0 })));

        const movieRequest$ = this.movieService.discoverMedia({
            type: 'movie',
            ...commonParams,
            sort_by: movieSort,
            with_company: params.companyId,
            primary_release_year: this.selectedYear() ?? undefined,
        }).pipe(catchError(() => of({ results: [], total_pages: 0 })));

        forkJoin({ tv: tvRequest$, movie: movieRequest$ }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
            // FIX: Explicitly type the response from forkJoin to resolve an issue where properties were being accessed on an 'unknown' type.
            next: (response: { tv: { results: MediaType[], total_pages: number }, movie: { results: MediaType[], total_pages: number } }) => {
                const { tv, movie } = response;
                let combined = [...tv.results, ...movie.results];
                const sortByValue = this.sortBy();
                
                if (sortByValue.includes('date')) {
                    const getDate = (item: MediaType): number => {
                        const dateStr = item.media_type === 'movie' ? item.release_date : item.first_air_date;
                        return dateStr ? new Date(dateStr).getTime() : 0;
                    };
                    if (sortByValue.endsWith('.desc')) { // Newest
                        combined.sort((a, b) => getDate(b) - getDate(a));
                    } else { // Oldest
                        combined.sort((a, b) => getDate(a) - getDate(b));
                    }
                } else if (sortByValue.includes('vote_average')) {
                     if (sortByValue.endsWith('.desc')) { // Top Rated
                        combined.sort((a, b) => b.vote_average - a.vote_average);
                    } else { // Lowest Rated
                        combined.sort((a, b) => a.vote_average - b.vote_average);
                    }
                } else { // Default to popularity
                    combined.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
                }

                this.mediaItems.update(current => loadMore ? [...current, ...combined] : combined);
                this.totalPages.set(Math.max(tv.total_pages, movie.total_pages));
            },
            complete: () => {
                this.loadingVideos.set(false);
                this.loadingMore.set(false);
            }
        });

    } else {
        this.movieService.discoverMedia({
          type: type === 'network' ? 'tv' : 'movie',
          page: this.page(),
          sort_by: this.sortBy(),
          with_genres: this.selectedGenre() ? [this.selectedGenre()!] : undefined,
          with_network: type === 'network' ? currentChannel.id : undefined,
          with_company: type === 'company' ? currentChannel.id : undefined,
          primary_release_year: type === 'company' ? this.selectedYear() ?? undefined : undefined,
          first_air_date_year: type === 'network' ? this.selectedYear() ?? undefined : undefined,
          vote_average_gte: this.selectedMinRating() ?? undefined
        }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
            next: (data) => {
                this.mediaItems.update(current => loadMore ? [...current, ...data.results] : data.results);
                this.totalPages.set(data.total_pages);
            },
            complete: () => {
                this.loadingVideos.set(false);
                this.loadingMore.set(false);
            }
        });
    }
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
}
