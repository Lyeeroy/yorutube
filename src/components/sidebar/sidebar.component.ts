import { Component, ChangeDetectionStrategy, signal, input, output, inject, effect } from '@angular/core';
import { SubscribableChannel } from '../../models/movie.model';
import { NavigationService } from '../../services/navigation.service';
import { NgOptimizedImage } from '@angular/common';

@Component({
  selector: 'app-sidebar',
  templateUrl: './sidebar.component.html',
  standalone: true,
  imports: [NgOptimizedImage],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidebarComponent {
  private navigationService = inject(NavigationService);
  activeItem = signal('Home');
  isMini = input(false);
  subscriptions = input<SubscribableChannel[]>([]);
  closeSidebar = output<void>();

  constructor() {
    effect(() => {
      const state = this.navigationService.currentView();
      let newActiveItem = ''; // Default to nothing active

      if (state.view === 'home') {
        newActiveItem = 'Home';
      } else if (state.view === 'discover') {
        newActiveItem = 'Discover';
      } else if (state.view === 'calendar') {
        newActiveItem = 'Calendar';
      } else if (state.view === 'channels') {
        newActiveItem = 'Channels';
      } else if (state.view === 'collections' || state.view === 'collection-detail') {
        newActiveItem = 'Collections';
      } else if (state.view === 'history') {
        newActiveItem = 'History';
      } else if (state.view === 'watchlist') {
        newActiveItem = 'Watchlist';
      } else if (state.view === 'playlists' || state.view === 'playlist-detail') {
        newActiveItem = 'Playlists';
      } else if (state.view === 'subscriptions') {
        newActiveItem = 'Subscriptions';
      } else if (state.view === 'channel') {
        const channelId = state.params?.id;
        if (channelId) {
            const sub = this.subscriptions().find(s => s.id === channelId);
            if (sub) {
              newActiveItem = sub.name;
            }
        }
      }
      
      this.activeItem.set(newActiveItem);
    });
  }

  onHomeClick(): void {
    this.navigationService.navigateTo('home');
    this.closeSidebar.emit();
  }

  onDiscoverClick(): void {
    this.navigationService.navigateTo('discover');
    this.closeSidebar.emit();
  }

  onCalendarClick(): void {
    this.navigationService.navigateTo('calendar');
    this.closeSidebar.emit();
  }

  onChannelsClick(): void {
    this.navigationService.navigateTo('channels');
    this.closeSidebar.emit();
  }

  onCollectionsClick(): void {
    this.navigationService.navigateTo('collections');
    this.closeSidebar.emit();
  }

  onSubscriptionsClick(): void {
    this.navigationService.navigateTo('subscriptions');
    this.closeSidebar.emit();
  }

  onHistoryClick(): void {
    this.navigationService.navigateTo('history');
    this.closeSidebar.emit();
  }

  onWatchlistClick(): void {
    this.navigationService.navigateTo('watchlist');
    this.closeSidebar.emit();
  }

  onPlaylistsClick(): void {
    this.navigationService.navigateTo('playlists');
    this.closeSidebar.emit();
  }

  onSubscriptionClick(channel: SubscribableChannel): void {
      this.activeItem.set(channel.name);
      this.navigationService.navigateTo('channel', channel);
      this.closeSidebar.emit();
  }
}