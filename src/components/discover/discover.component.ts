import { Component, ChangeDetectionStrategy, signal, inject, computed, DestroyRef, HostListener, ElementRef, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MovieService } from '../../services/movie.service';
import { DiscoverParams, MediaType } from '../../models/movie.model';
import { VideoGridComponent } from '../video-grid/video-grid.component';
import { InfiniteScrollTriggerComponent } from '../infinite-scroll-trigger/infinite-scroll-trigger.component';
import { toSignal, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationService } from '../../services/navigation.service';

type DiscoverType = 'movie' | 'tv' | 'anime';

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
  activeDropdown = signal<'sort' | 'genre' | 'year' | 'channel' | null>(null);
  
  // Data & Pagination
  mediaItems = signal<MediaType[]>([]);
  page = signal(1);
  totalPages = signal(1);
  loading = signal(true);
  loadingMore = signal(false);

  // Filter options
  private movieGenres = toSignal(this.movieService.getMovieGenreMap());
  private tvGenres = toSignal(this.movieService.getTvGenreMap());
  availableNetworks = toSignal(this.movieService.getPopularNetworks());
  availableMovieStudios = toSignal(this.movieService.getPopularMovieStudios(), { initialValue: { popular: [], other: [] } });
  availableAnimeStudios = toSignal(this.movieService.getPopularAnimeStudios(), { initialValue: { popular: [], other: [] } });

  // Selected filters
  selectedGenres = signal<number[]>([]);
  selectedNetwork = signal<number | null>(null);
  selectedCompany = signal<number | null>(null);
  selectedSortBy = signal<string>('popularity.desc');
  selectedYear = signal<number | null>(null);

  // Channel search filter
  channelSearchQuery = signal('');

  filteredNetworks = computed(() => {
    const networks = this.availableNetworks();
    if (!networks) return { popular: [], other: [] };
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
           this.selectedNetwork() !== null ||
           this.selectedCompany() !== null ||
           this.selectedSortBy() !== 'popularity.desc' ||
           this.selectedYear() !== null;
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
        return [...(networks?.popular ?? []), ...(networks?.other ?? [])].find(n => n.id === networkId)?.name;
    }
    if (companyId) {
        const studios = this.availableStudios();
        return [...(studios?.popular ?? []), ...(studios?.other ?? [])].find(c => c.id === companyId)?.name;
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
    this.selectedNetwork.set(null);
    this.selectedCompany.set(null);
    this.selectedSortBy.set('popularity.desc');
    this.selectedYear.set(null);

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

    const params: DiscoverParams = {
        type: this.activeType(),
        page: this.page(),
        with_genres: this.selectedGenres(),
        with_network: this.selectedNetwork() ?? undefined,
        with_company: this.selectedCompany() ?? undefined,
        sort_by: sortBy,
        primary_release_year: this.activeType() !== 'tv' ? this.selectedYear() ?? undefined : undefined,
        first_air_date_year: this.activeType() !== 'movie' ? this.selectedYear() ?? undefined : undefined,
    };

    this.movieService.discoverMedia(params).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (data) => {
            this.mediaItems.update(current => loadMore ? [...current, ...data.results] : data.results);
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
    this.selectedNetwork.set(null);
    this.selectedCompany.set(null);
    this.selectedSortBy.set('popularity.desc');
    this.selectedYear.set(null);
    this.applyFilters();
  }
  
  toggleDropdown(dropdown: 'sort' | 'genre' | 'year' | 'channel', event: MouseEvent): void {
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
    this.selectedGenres.update(genres => {
      const index = genres.indexOf(genreId);
      if (index > -1) {
        return genres.filter(g => g !== genreId);
      } else {
        return [...genres, genreId];
      }
    });
  }

  isSelectedGenre(genreId: number): boolean {
    return this.selectedGenres().includes(genreId);
  }

  clearSelectedGenres() {
    this.selectedGenres.set([]);
  }

  selectSort(sortBy: string): void {
    this.selectedSortBy.set(sortBy);
    this.applyFilters();
  }

  selectYear(year: number | null): void {
    this.selectedYear.set(year);
    this.applyFilters();
  }

  selectNetwork(id: number | null): void {
    this.selectedNetwork.set(id);
    this.selectedCompany.set(null); // Ensure only one is active
    this.applyFilters();
  }
  
  selectCompany(id: number | null): void {
    this.selectedCompany.set(id);
    this.selectedNetwork.set(null); // Ensure only one is active
    this.applyFilters();
  }

  onMediaClicked(media: MediaType): void {
    this.navigationService.navigateTo('watch', { mediaType: media.media_type, id: media.id });
  }
}