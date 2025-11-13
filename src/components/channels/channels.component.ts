import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MovieService } from '../../services/movie.service';
import { SubscriptionService } from '../../services/subscription.service';
import { Network, ProductionCompany } from '../../models/movie.model';
import { ChannelCardComponent } from '../channel-card/channel-card.component';
import { NavigationService } from '../../services/navigation.service';

@Component({
  selector: 'app-channels',
  standalone: true,
  imports: [CommonModule, ChannelCardComponent],
  templateUrl: './channels.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChannelsComponent {
  private movieService = inject(MovieService);
  private subscriptionService = inject(SubscriptionService);
  private navigationService = inject(NavigationService);

  activeTab = signal<'networks' | 'movieStudios' | 'animeStudios'>('networks');
  
  // Filters
  searchQuery = signal('');
  sortBy = signal<'relevance' | 'name_asc' | 'name_desc'>('relevance');
  selectedCountry = signal<string>('all');

  loading = signal({ networks: true, movieStudios: true, animeStudios: true });
  
  networks = signal<Network[]>([]);
  movieStudios = signal<ProductionCompany[]>([]);
  animeStudios = signal<ProductionCompany[]>([]);
  
  availableCountries = computed(() => {
    const tab = this.activeTab();
    let channels: (Network | ProductionCompany)[] = [];
    if (tab === 'networks') channels = this.networks();
    else if (tab === 'movieStudios') channels = this.movieStudios();
    else if (tab === 'animeStudios') channels = this.animeStudios();

    const countryCodes = new Set(channels.map(c => c.origin_country).filter(Boolean));
    
    try {
        const displayNames = new Intl.DisplayNames(['en'], { type: 'region' });
        const countries = Array.from(countryCodes).map(code => ({
            code,
            name: displayNames.of(code) || code
        })).filter(c => c.name !== c.code); // Filter out codes that couldn't be converted

        return countries.sort((a, b) => a.name.localeCompare(b.name));
    } catch (e) {
        console.error('Intl.DisplayNames not supported or error:', e);
        return [];
    }
  });

  filteredChannels = computed(() => {
    const tab = this.activeTab();
    const query = this.searchQuery().toLowerCase().trim();
    const country = this.selectedCountry();
    const sort = this.sortBy();

    let channels: (Network | ProductionCompany)[] = [];
    if (tab === 'networks') channels = this.networks();
    else if (tab === 'movieStudios') channels = this.movieStudios();
    else channels = this.animeStudios();
    
    // 1. Filter
    let filtered = channels;
    if (query) {
      filtered = filtered.filter(item => item.name.toLowerCase().includes(query));
    }
    if (country !== 'all') {
      filtered = filtered.filter(item => item.origin_country === country);
    }
    
    // 2. Sort
    if (sort === 'relevance') {
      return filtered; // Use default order from service
    }

    return [...filtered].sort((a, b) => {
      if (sort === 'name_asc') {
        return a.name.localeCompare(b.name);
      } else { // name_desc
        return b.name.localeCompare(a.name);
      }
    });
  });

  constructor() {
    this.movieService.getPopularNetworks().subscribe(data => {
        this.networks.set(data);
        this.loading.update(l => ({ ...l, networks: false }));
    });
    this.movieService.getPopularMovieStudios().subscribe(data => {
        this.movieStudios.set(data);
        this.loading.update(l => ({ ...l, movieStudios: false }));
    });
    this.movieService.getPopularAnimeStudios().subscribe(data => {
        this.animeStudios.set(data);
        this.loading.update(l => ({ ...l, animeStudios: false }));
    });
  }
  
  setActiveTab(tab: 'networks' | 'movieStudios' | 'animeStudios'): void {
    if (this.activeTab() === tab) return;
    this.activeTab.set(tab);
    this.searchQuery.set('');
    this.sortBy.set('relevance');
    this.selectedCountry.set('all');
  }

  updateSearchQuery(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
  }

  clearSearchQuery(): void {
    this.searchQuery.set('');
  }

  onSortChange(event: Event): void {
    this.sortBy.set((event.target as HTMLSelectElement).value as 'relevance' | 'name_asc' | 'name_desc');
  }
  
  onCountryChange(event: Event): void {
    this.selectedCountry.set((event.target as HTMLSelectElement).value);
  }

  isSubscribed(networkId: number): boolean {
    return this.subscriptionService.isSubscribed(networkId);
  }

  toggleSubscription(channel: Network | ProductionCompany, type: 'network' | 'company'): void {
    if (this.isSubscribed(channel.id)) {
      this.subscriptionService.removeSubscription(channel.id);
    } else {
      this.subscriptionService.addSubscription({ ...channel, type });
    }
  }

  onChannelSelected(channel: Network | ProductionCompany, type: 'network' | 'company'): void {
    this.navigationService.navigateTo('channel', { ...channel, type });
  }
}