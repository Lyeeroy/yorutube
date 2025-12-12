import { Component, ChangeDetectionStrategy, signal, inject, computed, DestroyRef, HostListener, ElementRef, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MovieService } from '../../services/movie.service';
import { DiscoverParams, MediaType, Network, ProductionCompany } from '../../models/movie.model';
import { VideoGridComponent } from '../video-grid/video-grid.component';
import { InfiniteScrollTriggerComponent } from '../infinite-scroll-trigger/infinite-scroll-trigger.component';
import { toSignal, takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { NavigationService } from '../../services/navigation.service';
import { debounceTime, distinctUntilChanged, switchMap, of, startWith, map } from 'rxjs';

const LANGUAGES = [
  { code: "en", name: "English" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
  { code: "zh", name: "Chinese" },
  { code: "fr", name: "French" },
  { code: "es", name: "Spanish" },
  { code: "de", name: "German" },
  { code: "it", name: "Italian" },
  { code: "pt", name: "Portuguese" },
  { code: "ru", name: "Russian" },
  { code: "hi", name: "Hindi" },
];

type DiscoverType = 'movie' | 'tv' | 'anime';

type StudioOption = {
  id: number | string;
  name: string;
  logo_path: string | null;
};

const normalizeStudioName = (name: string): string =>
  name.toLowerCase().replace(/[^a-z0-9]/g, '');

const hasValidPath = (p: any): p is string =>
  typeof p === 'string' && 
  p.trim() !== '' && 
  !['null', 'undefined'].includes(p.trim().toLowerCase());

const mergeStudiosByName = (studios: Array<{ id: number; name: string; logo_path: string | null }>): StudioOption[] => {
  const merged = new Map<string, { name: string; ids: number[]; logo_path: string | null }>();

  for (const studio of studios) {
    const key = normalizeStudioName(studio.name);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, {
        name: studio.name.trim(),
        ids: [studio.id],
        logo_path: studio.logo_path ?? null,
      });
      continue;
    }

    existing.ids.push(studio.id);
    if (!existing.logo_path && studio.logo_path) {
      existing.logo_path = studio.logo_path;
    }
  }

  return Array.from(merged.values())
    .map((entry) => ({
      id: entry.ids.length === 1 ? entry.ids[0] : entry.ids.join('|'),
      name: entry.name,
      logo_path: entry.logo_path,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
};

@Component({
  selector: 'app-discover',
  standalone: true,
  imports: [CommonModule, VideoGridComponent, InfiniteScrollTriggerComponent],
  templateUrl: './discover.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DiscoverComponent implements OnInit {
  private movieService = inject(MovieService);
  private navigationService = inject(NavigationService);
  private destroyRef = inject(DestroyRef);
  private elementRef = inject(ElementRef);

  genreMap = toSignal(this.movieService.getCombinedGenreMap(), { initialValue: new Map() });
  
  // View state
  activeType = signal<DiscoverType>('movie');
  activeDropdown = signal<'sort' | 'genre' | 'year' | 'channel' | 'language' | 'age' | null>(null);
  
  // Data & Pagination
  mediaItems = signal<MediaType[]>([]);
  page = signal(1);
  totalPages = signal(1);
  loading = signal(true);
  loadingMore = signal(false);

  // Filter options
  private movieGenres = toSignal(this.movieService.getMovieGenreMap());
  private tvGenres = toSignal(this.movieService.getTvGenreMap());
  private _allAvailableNetworks = toSignal(this.movieService.getPopularNetworks(), { initialValue: [] as Network[] });
  private _allAvailableMovieStudios = toSignal(this.movieService.getPopularMovieStudios(), { initialValue: [] as ProductionCompany[] });
  private _allAvailableAnimeStudios = toSignal(this.movieService.getPopularAnimeStudios(), { initialValue: [] as ProductionCompany[] });

  // Selected filters
  selectedGenres = signal<number[]>([]);
  excludedGenres = signal<number[]>([]);
  selectedNetwork = signal<number | string | null>(null);
  selectedCompany = signal<number | string | null>(null);
  selectedSortBy = signal<string>('popularity.desc');
  selectedYear = signal<number | null>(null);
  selectedLanguage = signal<string | null>(null);
  maxAge = signal<number | null>(null);
  
  languages = signal(LANGUAGES);

  // Channel search filter
  channelSearchQuery = signal('');

  // Async search results for studios
  private searchedStudios$ = toSignal(
    toObservable(this.channelSearchQuery).pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(query => {
        if (!query || query.length < 2) return of(null);
        return this.movieService.searchCompanies(query, 1).pipe(
          map(r => mergeStudiosByName(r.results))
        );
      })
    ),
    { initialValue: null }
  );

  private readonly popularNetworkIds = new Set([213, 49, 2739, 1024, 453, 2552, 3353]);

  availableNetworks = computed(() => {
    const networks = this._allAvailableNetworks();
    const merged = mergeStudiosByName(networks);
    
    const popular: StudioOption[] = [];
    const other: StudioOption[] = [];

    for (const m of merged) {
        const ids = m.id.toString().split('|').map(Number);
        if (ids.some(id => this.popularNetworkIds.has(id))) {
            popular.push(m);
        } else {
            other.push(m);
        }
    }
    return { popular, other };
  });

  private availableMovieStudios = computed<{ popular: StudioOption[]; other: StudioOption[] }>(() => {
    const merged = mergeStudiosByName(this._allAvailableMovieStudios());
    return { popular: merged, other: [] };
  });

  private availableAnimeStudios = computed<{ popular: StudioOption[]; other: StudioOption[] }>(() => {
    const merged = mergeStudiosByName(this._allAvailableAnimeStudios());
    return { popular: merged, other: [] };
  });

  filteredNetworks = computed(() => {
    const networks = this.availableNetworks();
    const query = this.channelSearchQuery().toLowerCase().trim();
    if (!query) return networks;

    return {
      popular: networks.popular.filter(n => n.name.toLowerCase().includes(query)),
      other: networks.other.filter(n => n.name.toLowerCase().includes(query))
    };
  });
  
  filteredStudios = computed(() => {
    const studios = this.availableStudios();
    if (!studios) return { popular: [], other: [] };
    
    const query = this.channelSearchQuery().toLowerCase().trim();
    const searchResults = this.searchedStudios$();

    // If we have search results from API, prioritize them
    if (searchResults) {
        return {
            popular: [],
            other: searchResults
        };
    }

    // Otherwise filter local list
    if (!query) return studios;
    
    return {
      popular: studios.popular.filter(c => c.name.toLowerCase().includes(query)),
      other: studios.other.filter(c => c.name.toLowerCase().includes(query))
    };
  });

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.activeDropdown() && !this.elementRef.nativeElement.contains(event.target)) {
      if (this.activeDropdown() === 'genre') {
        // For genre, clicking outside should be like clicking "Apply"
        this.applyFilters();
      } else {
        this.activeDropdown.set(null);
      }
    }
  }

  hasMore = computed(() => this.page() < this.totalPages());
  
  availableGenres = computed(() => {
    const type = this.activeType();
    const map = type === 'movie' || type === 'anime' ? this.movieGenres() : this.tvGenres();
    if (!map) return [];
    const genres = Array.from(map.entries()).map(([id, name]) => ({ id, name }));
    genres.sort((a,b) => a.name.localeCompare(b.name));
    return genres;
  });
  
  availableStudios = computed(() => {
    const type = this.activeType();
    if (type === 'movie') {
      return this.availableMovieStudios();
    }
    if (type === 'anime') {
      return this.availableAnimeStudios();
    }
    return null;
  });

  years = computed(() => {
    const currentYear = new Date().getFullYear();
    const years: number[] = [];
    for (let i = currentYear; i >= 1900; i--) {
      years.push(i);
    }
    return years;
  });

  filtersActive = computed(() => {
    return this.selectedGenres().length > 0 ||
           this.excludedGenres().length > 0 ||
           this.selectedNetwork() !== null ||
           this.selectedCompany() !== null ||
           this.selectedSortBy() !== 'popularity.desc' ||
           this.selectedYear() !== null ||
           this.selectedLanguage() !== null ||
           this.maxAge() !== null;
  });

  selectedSortByLabel = computed(() => {
    const sortBy = this.selectedSortBy();
    if (sortBy === 'popularity.desc') return 'Popularity';
    if (sortBy === 'vote_average.desc') return 'Top Rated';
    if (sortBy.includes('release_date') || sortBy.includes('first_air_date')) return 'Newest';
    return 'Popularity';
  });

  selectedChannelName = computed(() => {
    const networkId = this.selectedNetwork();
    const companyId = this.selectedCompany();

    if (networkId) {
        const networks = this.availableNetworks();
        return [...networks.popular, ...networks.other].find(n => n.id === networkId)?.name;
    }
    if (companyId) {
        const studios = this.availableStudios();
        if (studios) {
          const combined = [...studios.popular, ...studios.other];
          const found = combined.find(c => c.id.toString() === companyId.toString());
          if (found) return found.name;
        }

        // If it's from search results (or not in local list), try there.
        const searchResults = this.searchedStudios$();
        if (searchResults) {
          const found = searchResults.find(c => c.id.toString() === companyId.toString());
          if (found) return found.name;
        }

        return "Selected Studio";
    }
    return null;
  });

  constructor() {
  }

  ngOnInit(): void {
    this.resetAndLoad();
  }

  setActiveType(type: DiscoverType): void {
    if (this.activeType() === type) return;
    
    // Reset all filters on type change
    this.selectedGenres.set([]);
    this.excludedGenres.set([]);
    this.selectedNetwork.set(null);
    this.selectedCompany.set(null);
    this.selectedSortBy.set('popularity.desc');
    this.selectedYear.set(null);
    this.selectedLanguage.set(null);
    this.maxAge.set(null);

    this.activeType.set(type);
    this.resetAndLoad();
  }

  resetAndLoad(): void {
    this.mediaItems.set([]);
    this.page.set(1);
    this.totalPages.set(1);
    this.loadMedia();
  }

  loadMedia(loadMore = false): void {
    if (!loadMore) {
        this.loading.set(true);
    } else {
        this.loadingMore.set(true);
    }
    
    let sortBy = this.selectedSortBy();
    if (sortBy === 'release_date.desc') {
        if (this.activeType() === 'movie') {
            sortBy = 'primary_release_date.desc';
        } else if (this.activeType() === 'tv') {
            sortBy = 'first_air_date.desc';
        } else { // anime
            sortBy = 'popularity.desc'; // Fallback for anime
        }
    }

    const maxAge = this.maxAge();
    let releaseDateGte: string | undefined;
    if (maxAge !== null) {
        const currentYear = new Date().getFullYear();
        const minYear = currentYear - maxAge;
        releaseDateGte = `${minYear}-01-01`;
    }

    const params: DiscoverParams = {
        type: this.activeType(),
        page: this.page(),
        with_genres: this.selectedGenres(),
        without_genres: this.excludedGenres().length > 0 ? this.excludedGenres().join(',') : undefined,
        with_network: this.selectedNetwork() ?? undefined,
        with_company: this.selectedCompany() ?? undefined,
        sort_by: sortBy,
        primary_release_year: this.activeType() !== 'tv' ? this.selectedYear() ?? undefined : undefined,
        first_air_date_year: this.activeType() !== 'movie' ? this.selectedYear() ?? undefined : undefined,
        with_original_language: this.selectedLanguage() ?? undefined,
        release_date_gte: releaseDateGte,
    };

    this.movieService.discoverMedia(params).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (data) => {
        const withBackdrops = data.results.filter(m => hasValidPath(m.backdrop_path));
        this.mediaItems.update(current => loadMore ? [...current, ...withBackdrops] : withBackdrops);
            this.totalPages.set(data.total_pages);
        },
        complete: () => {
            this.loading.set(false);
            this.loadingMore.set(false);
        }
    });
  }

  loadMoreMedia(): void {
    if (this.loading() || this.loadingMore() || !this.hasMore()) {
        return;
    }
    this.page.update(p => p + 1);
    this.loadMedia(true);
  }

  applyFilters(): void {
    this.resetAndLoad();
    this.activeDropdown.set(null);
  }

  resetAndApplyFilters(): void {
    this.selectedGenres.set([]);
    this.excludedGenres.set([]);
    this.selectedNetwork.set(null);
    this.selectedCompany.set(null);
    this.selectedSortBy.set('popularity.desc');
    this.selectedYear.set(null);
    this.selectedLanguage.set(null);
    this.maxAge.set(null);
    this.applyFilters();
  }
  
  toggleDropdown(dropdown: 'sort' | 'genre' | 'year' | 'channel' | 'language' | 'age', event: MouseEvent): void {
    event.stopPropagation();
    if (this.activeDropdown() === 'genre' && this.activeDropdown() !== dropdown) {
      this.applyFilters();
    }
    if (dropdown === 'channel' && this.activeDropdown() !== 'channel') {
      this.channelSearchQuery.set('');
    }
    this.activeDropdown.update(current => current === dropdown ? null : dropdown);
  }

  updateChannelSearch(event: Event) {
    this.channelSearchQuery.set((event.target as HTMLInputElement).value);
  }

  toggleGenre(genreId: number): void {
    const selected = this.selectedGenres();
    const excluded = this.excludedGenres();

    if (selected.includes(genreId)) {
      // Was selected, move to excluded
      this.selectedGenres.update(g => g.filter(id => id !== genreId));
      this.excludedGenres.update(g => [...g, genreId]);
    } else if (excluded.includes(genreId)) {
      // Was excluded, move to neutral
      this.excludedGenres.update(g => g.filter(id => id !== genreId));
    } else {
      // Was neutral, move to selected
      this.selectedGenres.update(g => [...g, genreId]);
    }
  }

  getGenreState(genreId: number): 'selected' | 'excluded' | 'neutral' {
    if (this.selectedGenres().includes(genreId)) return 'selected';
    if (this.excludedGenres().includes(genreId)) return 'excluded';
    return 'neutral';
  }

  clearSelectedGenres() {
    this.selectedGenres.set([]);
    this.excludedGenres.set([]);
  }

  selectSort(sortBy: string): void {
    this.selectedSortBy.set(sortBy);
    this.applyFilters();
  }

  selectLanguage(code: string | null): void {
    this.selectedLanguage.set(code);
    this.applyFilters();
  }

  setMaxAge(age: any): void {
    const num = Number(age);
    if (!isNaN(num)) {
        this.maxAge.set(num);
    } else {
        this.maxAge.set(null);
    }
  }

  selectYear(year: number | null): void {
    this.selectedYear.set(year);
    this.applyFilters();
  }

  selectNetwork(id: number | string | null): void {
    this.selectedNetwork.set(id);
    this.selectedCompany.set(null); // Ensure only one is active
    this.applyFilters();
  }
  
  selectCompany(id: number | string | null): void {
    this.selectedCompany.set(id);
    this.selectedNetwork.set(null); // Ensure only one is active
    this.applyFilters();
  }

  onMediaClicked(media: MediaType): void {
    this.navigationService.navigateTo('watch', { mediaType: media.media_type, id: media.id });
  }
}
