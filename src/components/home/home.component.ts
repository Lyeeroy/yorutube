import {
  Component,
  ChangeDetectionStrategy,
  inject,
  computed,
  signal,
  viewChild,
  ElementRef,
  effect,
  OnInit,
  DestroyRef,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { Observable, of, forkJoin, fromEvent } from "rxjs";
import { map, catchError, debounceTime } from "rxjs/operators";
import { ContentCategoryComponent } from "../content-category/content-category.component";
import { MovieService } from "../../services/movie.service";
import { MediaType, Movie, TvShow } from "../../models/movie.model";
import { NavigationService } from "../../services/navigation.service";
import { toSignal, takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { HistoryService } from "../../services/history.service";
import { SubscriptionService } from "../../services/subscription.service";
import { InfiniteScrollTriggerComponent } from "../infinite-scroll-trigger/infinite-scroll-trigger.component";

interface ContentCategory {
  title: string;
  fetchFn$: Observable<MediaType[]>;
}

type FilterType =
  | "all"
  | "movies"
  | "tv"
  | "anime"
  | "action"
  | "comedy"
  | "scifi";

interface Filter {
  id: FilterType;
  label: string;
}

@Component({
  selector: "app-home",
  standalone: true,
  imports: [
    CommonModule,
    ContentCategoryComponent,
    InfiniteScrollTriggerComponent,
  ],
  templateUrl: "./home.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent implements OnInit {
  private movieService = inject(MovieService);
  private navigationService = inject(NavigationService);
  private historyService = inject(HistoryService);
  private subscriptionService = inject(SubscriptionService);
  private destroyRef = inject(DestroyRef);

  private history = this.historyService.history;
  subscriptions = this.subscriptionService.subscriptions;

  readonly filters: Filter[] = [
    { id: "all", label: "All" },
    { id: "movies", label: "Movies" },
    { id: "tv", label: "TV Shows" },
    { id: "anime", label: "Anime" },
    { id: "action", label: "Action" },
    { id: "comedy", label: "Comedy" },
    { id: "scifi", label: "Sci-Fi & Fantasy" },
  ];

  activeFilter = signal<FilterType>("all");

  filterContainer = viewChild<ElementRef<HTMLElement>>("filterContainer");
  canScrollFilterLeft = signal(false);
  canScrollFilterRight = signal(false);

  // Infinite Scrolling State
  displayedCategories = signal<ContentCategory[]>([]);
  private categoryPageIndex = signal(0);
  private readonly CATEGORIES_PER_PAGE = 5;
  loadingMore = signal(false);

  private baseCategories: ContentCategory[] = [
    {
      title: "Trending This Week",
      fetchFn$: this.movieService.getTrendingAll(),
    },
    {
      title: "Popular TV Shows",
      fetchFn$: this.movieService.getPopularTvShows(),
    },
    {
      title: "Popular on Netflix",
      fetchFn$: this.movieService.getPopularOnNetflix(),
    },
    {
      title: "Top Rated Movies",
      fetchFn$: this.movieService.getTopRatedMovies(),
    },
    {
      title: "Upcoming Movies",
      fetchFn$: this.movieService.getUpcomingMovies(),
    },
  ];

  private allCategories = computed(() => {
    const historyItems = this.history();
    const subs = this.subscriptions();

    const all: ContentCategory[] = [];
    if (historyItems.length > 0) {
      const mostRecent = historyItems[0];
      const media = mostRecent.media;
      const title = media.media_type === "movie" ? media.title : media.name;
      all.push({
        title: `Because you watched ${title}`,
        fetchFn$: this.movieService.getRecommendationsForMedia(media),
      });
    }
    if (subs.length > 0) {
      all.push({
        title: "From your subscriptions",
        fetchFn$: this.getSubscriptionFeed(),
      });
    }
    all.push(...this.baseCategories);
    all.push(
      {
        title: "Critically Acclaimed TV Dramas",
        fetchFn$: this.movieService
          .discoverMedia({ type: "tv", with_genres: [18], vote_average_gte: 8 })
          .pipe(map((r) => r.results)),
      },
      {
        title: "Animated Movies For The Family",
        fetchFn$: this.movieService
          .discoverMedia({ type: "movie", with_genres: [16, 10751] })
          .pipe(map((r) => r.results)),
      },
      {
        title: "Sci-Fi & Fantasy TV",
        fetchFn$: this.movieService
          .discoverMedia({ type: "tv", with_genres: [10765] })
          .pipe(map((r) => r.results)),
      },
      {
        title: "Top Rated Documentaries",
        fetchFn$: this.movieService
          .discoverMedia({
            type: "movie",
            with_genres: [99],
            sort_by: "vote_average.desc",
          })
          .pipe(map((r) => r.results)),
      },
      {
        title: "Popular Westerns",
        fetchFn$: this.movieService
          .discoverMedia({ type: "movie", with_genres: [37] })
          .pipe(map((r) => r.results)),
      }
    );

    const movies: ContentCategory[] = [
      {
        title: "Top Rated Movies",
        fetchFn$: this.movieService.getTopRatedMovies(),
      },
      {
        title: "Upcoming Movies",
        fetchFn$: this.movieService.getUpcomingMovies(),
      },
      {
        title: "Popular Action Movies",
        fetchFn$: this.movieService
          .discoverMedia({ type: "movie", with_genres: [28] })
          .pipe(map((r) => r.results)),
      },
      {
        title: "Critically Acclaimed Comedies",
        fetchFn$: this.movieService
          .discoverMedia({
            type: "movie",
            with_genres: [35],
            vote_average_gte: 7.5,
          })
          .pipe(map((r) => r.results)),
      },
      {
        title: "Mind-Bending Sci-Fi",
        fetchFn$: this.movieService
          .discoverMedia({ type: "movie", with_genres: [878] })
          .pipe(map((r) => r.results)),
      },
      {
        title: "Thrillers That Will Keep You on Edge",
        fetchFn$: this.movieService
          .discoverMedia({ type: "movie", with_genres: [53] })
          .pipe(map((r) => r.results)),
      },
      {
        title: "Heartwarming Dramas",
        fetchFn$: this.movieService
          .discoverMedia({ type: "movie", with_genres: [18] })
          .pipe(map((r) => r.results)),
      },
      {
        title: "Award-Winning Animated Features",
        fetchFn$: this.movieService
          .discoverMedia({
            type: "movie",
            with_genres: [16],
            vote_average_gte: 8,
          })
          .pipe(map((r) => r.results)),
      },
      {
        title: "Terrifying Horror Movies",
        fetchFn$: this.movieService
          .discoverMedia({ type: "movie", with_genres: [27] })
          .pipe(map((r) => r.results)),
      },
      {
        title: "Epic War Movies",
        fetchFn$: this.movieService
          .discoverMedia({ type: "movie", with_genres: [10752] })
          .pipe(map((r) => r.results)),
      },
      {
        title: "Must-Watch Documentaries",
        fetchFn$: this.movieService
          .discoverMedia({ type: "movie", with_genres: [99] })
          .pipe(map((r) => r.results)),
      },
    ];

    const tv: ContentCategory[] = [
      {
        title: "Popular TV Shows",
        fetchFn$: this.movieService.getPopularTvShows(),
      },
      {
        title: "Popular on Netflix",
        fetchFn$: this.movieService.getPopularOnNetflix(),
      },
      {
        title: "Top Rated TV Dramas",
        fetchFn$: this.movieService
          .discoverMedia({ type: "tv", with_genres: [18], vote_average_gte: 8 })
          .pipe(map((r) => r.results)),
      },
      {
        title: "Binge-worthy Comedies",
        fetchFn$: this.movieService
          .discoverMedia({ type: "tv", with_genres: [35] })
          .pipe(map((r) => r.results)),
      },
      {
        title: "Gripping Crime TV Shows",
        fetchFn$: this.movieService
          .discoverMedia({ type: "tv", with_genres: [80] })
          .pipe(map((r) => r.results)),
      },
      {
        title: "Sci-Fi & Fantasy Worlds",
        fetchFn$: this.movieService
          .discoverMedia({ type: "tv", with_genres: [10765] })
          .pipe(map((r) => r.results)),
      },
      {
        title: "Reality TV Hits",
        fetchFn$: this.movieService
          .discoverMedia({ type: "tv", with_genres: [10764] })
          .pipe(map((r) => r.results)),
      },
      {
        title: "Animated TV for Adults",
        fetchFn$: this.movieService
          .discoverMedia({ type: "tv", with_genres: [16], vote_average_gte: 7 })
          .pipe(map((r) => r.results)),
      },
      {
        title: "Kids TV Favorites",
        fetchFn$: this.movieService
          .discoverMedia({ type: "tv", with_genres: [10762] })
          .pipe(map((r) => r.results)),
      },
      {
        title: "Top Rated Western TV Shows",
        fetchFn$: this.movieService
          .discoverMedia({
            type: "tv",
            with_genres: [37],
            vote_average_gte: 7.5,
          })
          .pipe(map((r) => r.results)),
      },
    ];

    const anime: ContentCategory[] = [
      {
        title: "Popular Anime",
        fetchFn$: this.movieService
          .discoverMedia({ type: "anime", sort_by: "popularity.desc" })
          .pipe(map((r) => r.results)),
      },
      {
        title: "Top Rated Anime",
        fetchFn$: this.movieService
          .discoverMedia({
            type: "anime",
            sort_by: "vote_average.desc",
            vote_average_gte: 8,
          })
          .pipe(map((r) => r.results)),
      },
      {
        title: "From Studio Ghibli",
        fetchFn$: this.movieService
          .getMoviesByCompany(10342)
          .pipe(map((r) => r.results)),
      },
      {
        title: "From MAPPA",
        fetchFn$: this.movieService
          .getMoviesByCompany(91409)
          .pipe(map((r) => r.results)),
      },
      {
        title: "From Toei Animation",
        fetchFn$: this.movieService
          .getMoviesByCompany(5542)
          .pipe(map((r) => r.results)),
      },
      {
        title: "From ufotable",
        fetchFn$: this.movieService
          .getMoviesByCompany(4323)
          .pipe(map((r) => r.results)),
      },
      {
        title: "From CoMix Wave Films",
        fetchFn$: this.movieService
          .getMoviesByCompany(11018)
          .pipe(map((r) => r.results)),
      },
    ];

    const action: ContentCategory[] = [
      {
        title: "Popular Action Movies",
        fetchFn$: this.movieService
          .discoverMedia({ type: "movie", with_genres: [28] })
          .pipe(map((r) => r.results)),
      },
      {
        title: "Top Rated Action Movies",
        fetchFn$: this.movieService
          .discoverMedia({
            type: "movie",
            with_genres: [28],
            sort_by: "vote_average.desc",
          })
          .pipe(map((r) => r.results)),
      },
      {
        title: "Popular Action & Adventure TV",
        fetchFn$: this.movieService
          .discoverMedia({ type: "tv", with_genres: [10759] })
          .pipe(map((r) => r.results)),
      },
      // FIX: Corrected property name from 'with_companies' to 'with_company' to match the DiscoverParams interface.
      {
        title: "Superhero Blockbusters",
        fetchFn$: this.movieService
          .discoverMedia({ type: "movie", with_company: "420|9993" })
          .pipe(map((r) => r.results)),
      },
      {
        title: "Action Thrillers",
        fetchFn$: this.movieService
          .discoverMedia({ type: "movie", with_genres: [28, 53] })
          .pipe(map((r) => r.results)),
      },
    ];

    const comedy: ContentCategory[] = [
      {
        title: "Popular Movie Comedies",
        fetchFn$: this.movieService
          .discoverMedia({ type: "movie", with_genres: [35] })
          .pipe(map((r) => r.results)),
      },
      {
        title: "Top Rated Movie Comedies",
        fetchFn$: this.movieService
          .discoverMedia({
            type: "movie",
            with_genres: [35],
            sort_by: "vote_average.desc",
          })
          .pipe(map((r) => r.results)),
      },
      {
        title: "Popular Comedy Shows",
        fetchFn$: this.movieService
          .discoverMedia({ type: "tv", with_genres: [35] })
          .pipe(map((r) => r.results)),
      },
      {
        title: "Romantic Comedies",
        fetchFn$: this.movieService
          .discoverMedia({ type: "movie", with_genres: [10749, 35] })
          .pipe(map((r) => r.results)),
      },
      {
        title: "Animated Comedies",
        fetchFn$: this.movieService
          .discoverMedia({ type: "movie", with_genres: [16, 35] })
          .pipe(map((r) => r.results)),
      },
    ];

    const scifi: ContentCategory[] = [
      {
        title: "Popular Sci-Fi Movies",
        fetchFn$: this.movieService
          .discoverMedia({ type: "movie", with_genres: [878] })
          .pipe(map((r) => r.results)),
      },
      {
        title: "Top Rated Sci-Fi Movies",
        fetchFn$: this.movieService
          .discoverMedia({
            type: "movie",
            with_genres: [878],
            sort_by: "vote_average.desc",
          })
          .pipe(map((r) => r.results)),
      },
      {
        title: "Popular Sci-Fi & Fantasy TV",
        fetchFn$: this.movieService
          .discoverMedia({ type: "tv", with_genres: [10765] })
          .pipe(map((r) => r.results)),
      },
      {
        title: "Epic Fantasy Movies",
        fetchFn$: this.movieService
          .discoverMedia({ type: "movie", with_genres: [14] })
          .pipe(map((r) => r.results)),
      },
    ];

    return { all, movies, tv, anime, action, comedy, scifi };
  });

  hasMoreCategories = computed(() => {
    const filter = this.activeFilter();
    const all = this.allCategories()[filter];
    const displayed = this.displayedCategories();
    return displayed.length < all.length;
  });

  genreMap = toSignal(this.movieService.getCombinedGenreMap(), {
    initialValue: new Map<number, string>(),
  });

  constructor() {
    effect(
      () => {
        const filter = this.activeFilter();
        this.categoryPageIndex.set(0);
        const initialCategories = this.allCategories()[filter].slice(
          0,
          this.CATEGORIES_PER_PAGE
        );
        this.displayedCategories.set(initialCategories);
      },
      { allowSignalWrites: true }
    );

    effect(() => {
      this.filterContainer();
      setTimeout(() => this.checkFilterScroll(), 100);
    });
  }

  ngOnInit() {
    fromEvent(window, "resize")
      .pipe(debounceTime(200), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.checkFilterScroll());
  }

  private getSubscriptionFeed(): Observable<MediaType[]> {
    const subs = this.subscriptions();
    if (subs.length === 0) {
      return of([]);
    }

    const requests$: Observable<MediaType[]>[] = [];

    subs.forEach((sub) => {
      if (sub.type === "network" || sub.type === "merged") {
        const networkId = sub.type === "merged" ? sub.networkId : sub.id;
        if (networkId) {
          requests$.push(
            this.movieService
              .discoverMedia({
                type: "tv",
                with_network: networkId,
                sort_by: "first_air_date.desc",
              })
              .pipe(
                map((res) => res.results.slice(0, 5)),
                catchError(() => of([] as MediaType[]))
              )
          );
        }
      }
      if (sub.type === "company" || sub.type === "merged") {
        const companyId = sub.type === "merged" ? sub.companyId : sub.id;
        if (companyId) {
          requests$.push(
            this.movieService
              .discoverMedia({
                type: "movie",
                with_company: companyId,
                sort_by: "primary_release_date.desc",
              })
              .pipe(
                map((res) => res.results.slice(0, 5)),
                catchError(() => of([] as MediaType[]))
              )
          );
        }
      }
    });

    if (requests$.length === 0) {
      return of([]);
    }

    return forkJoin(requests$).pipe(
      map((results) => {
        const flattened = results.flat();
        const unique = Array.from(
          new Map(flattened.map((item) => [item.id, item])).values()
        );
        // FIX: Explicitly type `a` and `b` to `MediaType` to allow access to `media_type` and other properties for sorting.
        unique.sort((a: MediaType, b: MediaType) => {
          const dateAStr =
            a.media_type === "movie" ? a.release_date : a.first_air_date;
          const dateBStr =
            b.media_type === "movie" ? b.release_date : b.first_air_date;
          const dateA = dateAStr ? new Date(dateAStr).getTime() : 0;
          const dateB = dateBStr ? new Date(dateBStr).getTime() : 0;
          return dateB - dateA;
        });
        return unique.slice(0, 20);
      })
    );
  }

  checkFilterScroll(): void {
    const element = this.filterContainer()?.nativeElement;
    if (!element) return;

    const hasOverflow = element.scrollWidth > element.clientWidth;
    const atStart = element.scrollLeft < 5;
    const atEnd =
      element.scrollWidth - element.clientWidth - element.scrollLeft < 5;

    this.canScrollFilterLeft.set(hasOverflow && !atStart);
    this.canScrollFilterRight.set(hasOverflow && !atEnd);
  }

  scrollFilters(direction: "left" | "right"): void {
    const element = this.filterContainer()?.nativeElement;
    if (!element) return;

    const scrollAmount = element.clientWidth * 0.75;
    const scrollValue = direction === "left" ? -scrollAmount : scrollAmount;

    element.scrollBy({
      left: scrollValue,
      behavior: "smooth",
    });
  }

  setActiveFilter(filterId: FilterType): void {
    this.activeFilter.set(filterId);
    document.querySelector("main")?.scrollTo(0, 0);
  }

  loadMoreCategories(): void {
    if (!this.hasMoreCategories() || this.loadingMore()) return;

    this.loadingMore.set(true);

    // Simulate a network delay for better UX, since the data is already in memory
    setTimeout(() => {
      this.categoryPageIndex.update((i) => i + 1);
      const pageIndex = this.categoryPageIndex();
      const start = pageIndex * this.CATEGORIES_PER_PAGE;
      const end = start + this.CATEGORIES_PER_PAGE;

      const filter = this.activeFilter();
      const nextCategories = this.allCategories()[filter].slice(start, end);

      this.displayedCategories.update((current) => [
        ...current,
        ...nextCategories,
      ]);
      this.loadingMore.set(false);
    }, 500);
  }

  onMediaClicked(media: MediaType): void {
    this.navigationService.navigateTo("watch", {
      mediaType: media.media_type,
      id: media.id,
    });
  }
}
