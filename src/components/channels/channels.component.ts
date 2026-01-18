import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  DestroyRef,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import {
  Subject,
  debounceTime,
  distinctUntilChanged,
  switchMap,
  of,
  tap,
} from "rxjs";
import { MovieService } from "../../services/movie.service";
import { SubscriptionService } from "../../services/subscription.service";
import { Network, ProductionCompany } from "../../models/movie.model";
import { ChannelCardComponent } from "../channel-card/channel-card.component";
import { NavigationService } from "../../services/navigation.service";

@Component({
  selector: "app-channels",
  standalone: true,
  imports: [CommonModule, ChannelCardComponent],
  templateUrl: "./channels.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChannelsComponent {
  private movieService = inject(MovieService);
  private subscriptionService = inject(SubscriptionService);
  private navigationService = inject(NavigationService);
  private destroyRef = inject(DestroyRef);

  activeTab = signal<"networks" | "movieStudios" | "animeStudios">("networks");

  // Filters
  searchQuery = signal("");
  sortBy = signal<"relevance" | "name_asc" | "name_desc">("relevance");
  selectedCountry = signal<string>("all");

  loading = signal({ networks: true, movieStudios: true, animeStudios: true });

  networks = signal<Network[]>([]);
  movieStudios = signal<ProductionCompany[]>([]);
  animeStudios = signal<ProductionCompany[]>([]);

  // API Search
  private searchSubject = new Subject<string>();
  apiSearchResults = signal<ProductionCompany[]>([]);
  isSearchingApi = signal(false);

  availableCountries = computed(() => {
    const tab = this.activeTab();
    let channels: (Network | ProductionCompany)[] = [];
    if (tab === "networks") channels = this.networks();
    else if (tab === "movieStudios") channels = this.movieStudios();
    else if (tab === "animeStudios") channels = this.animeStudios();

    // Also include countries from API search results
    const apiResults = this.apiSearchResults();
    channels = [...channels, ...apiResults];

    const countryCodes = new Set(
      channels.map((c) => c.origin_country).filter(Boolean),
    );

    try {
      const displayNames = new Intl.DisplayNames(["en"], { type: "region" });
      const countries = Array.from(countryCodes)
        .map((code) => ({
          code,
          name: displayNames.of(code) || code,
        }))
        .filter((c) => c.name !== c.code);

      return countries.sort((a, b) => a.name.localeCompare(b.name));
    } catch (e) {
      console.error("Intl.DisplayNames not supported or error:", e);
      return [];
    }
  });

  filteredChannels = computed(() => {
    const tab = this.activeTab();
    const query = this.searchQuery().toLowerCase().trim();
    const country = this.selectedCountry();
    const sort = this.sortBy();
    const apiResults = this.apiSearchResults();

    // Get local channels based on active tab
    let localChannels: (Network | ProductionCompany)[] = [];
    if (tab === "networks") localChannels = this.networks();
    else if (tab === "movieStudios") localChannels = this.movieStudios();
    else localChannels = this.animeStudios();

    // 1. Filter local channels
    let filtered = localChannels;
    if (query) {
      filtered = filtered.filter((item) =>
        item.name.toLowerCase().includes(query),
      );
    }
    if (country !== "all") {
      filtered = filtered.filter((item) => item.origin_country === country);
    }

    // 2. Merge with API results if searching (avoid duplicates)
    if (query.length >= 2 && apiResults.length > 0) {
      const existingIds = new Set(filtered.map((c) => c.id));
      const existingNames = new Set(
        filtered.map((c) => c.name.toLowerCase().trim()),
      );

      const newFromApi = apiResults.filter((result) => {
        // Skip if already in local results by ID
        if (existingIds.has(result.id)) return false;

        // Skip if same name already exists (networks/companies can have different IDs but same name)
        if (existingNames.has(result.name.toLowerCase().trim())) return false;

        // Filter by country if selected
        if (country !== "all" && result.origin_country !== country)
          return false;

        // Make sure it matches the search query
        if (!result.name.toLowerCase().includes(query)) return false;

        // Must have a logo for display
        if (!result.logo_path) return false;

        return true;
      });

      filtered = [...filtered, ...newFromApi];
    }

    // 3. Sort
    if (sort === "relevance") {
      // For relevance, prioritize exact matches and starts-with matches
      if (query) {
        return [...filtered].sort((a, b) => {
          const aName = a.name.toLowerCase();
          const bName = b.name.toLowerCase();
          const aExact = aName === query;
          const bExact = bName === query;
          const aStarts = aName.startsWith(query);
          const bStarts = bName.startsWith(query);

          // Exact matches first
          if (aExact && !bExact) return -1;
          if (bExact && !aExact) return 1;

          // Then starts-with matches
          if (aStarts && !bStarts) return -1;
          if (bStarts && !aStarts) return 1;

          // Then alphabetical
          return aName.localeCompare(bName);
        });
      }
      return filtered;
    }

    return [...filtered].sort((a, b) => {
      if (sort === "name_asc") {
        return a.name.localeCompare(b.name);
      } else {
        return b.name.localeCompare(a.name);
      }
    });
  });

  constructor() {
    this.loadInitialData();
    this.setupApiSearch();
  }

  private loadInitialData(): void {
    this.movieService
      .getPopularNetworks()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((data) => {
        this.networks.set(data);
        this.loading.update((l) => ({ ...l, networks: false }));
      });

    this.movieService
      .getPopularMovieStudios()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((data) => {
        this.movieStudios.set(data);
        this.loading.update((l) => ({ ...l, movieStudios: false }));
      });

    this.movieService
      .getPopularAnimeStudios()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((data) => {
        this.animeStudios.set(data);
        this.loading.update((l) => ({ ...l, animeStudios: false }));
      });
  }

  private setupApiSearch(): void {
    this.searchSubject
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        tap((query) => {
          if (query.length >= 2) {
            this.isSearchingApi.set(true);
          } else {
            this.apiSearchResults.set([]);
          }
        }),
        switchMap((query) => {
          if (query.length < 2) {
            return of({ results: [], total_pages: 0 });
          }
          return this.movieService.searchCompanies(query);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((response) => {
        // Convert SubscribableChannel back to ProductionCompany format
        const companies: ProductionCompany[] = response.results.map((c) => ({
          id: c.id,
          name: c.name,
          logo_path: c.logo_path || "",
          origin_country: c.origin_country || "",
        }));
        this.apiSearchResults.set(companies);
        this.isSearchingApi.set(false);
      });
  }

  setActiveTab(tab: "networks" | "movieStudios" | "animeStudios"): void {
    if (this.activeTab() === tab) return;
    this.activeTab.set(tab);
    this.searchQuery.set("");
    this.sortBy.set("relevance");
    this.selectedCountry.set("all");
    this.apiSearchResults.set([]);
  }

  updateSearchQuery(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchQuery.set(value);
    this.searchSubject.next(value);
  }

  clearSearchQuery(): void {
    this.searchQuery.set("");
    this.apiSearchResults.set([]);
    this.searchSubject.next("");
  }

  onSortChange(event: Event): void {
    this.sortBy.set(
      (event.target as HTMLSelectElement).value as
        | "relevance"
        | "name_asc"
        | "name_desc",
    );
  }

  onCountryChange(event: Event): void {
    this.selectedCountry.set((event.target as HTMLSelectElement).value);
  }

  isSubscribed(networkId: number): boolean {
    return this.subscriptionService.isSubscribed(networkId);
  }

  toggleSubscription(
    channel: Network | ProductionCompany,
    type: "network" | "company",
  ): void {
    if (this.isSubscribed(channel.id)) {
      this.subscriptionService.removeSubscription(channel.id);
    } else {
      this.subscriptionService.addSubscription({ ...channel, type });
    }
  }

  onChannelSelected(
    channel: Network | ProductionCompany,
    type: "network" | "company",
  ): void {
    this.navigationService.navigateTo("channel", { ...channel, type });
  }
}
