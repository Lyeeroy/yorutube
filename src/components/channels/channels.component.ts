import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
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

  loading = signal({ networks: true, movieStudios: true, animeStudios: true });
  
  networks = signal<{ popular: Network[], other: Network[] }>({ popular: [], other: [] });
  movieStudios = signal<{ popular: ProductionCompany[], other: ProductionCompany[] }>({ popular: [], other: [] });
  animeStudios = signal<{ popular: ProductionCompany[], other: ProductionCompany[] }>({ popular: [], other: [] });

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
