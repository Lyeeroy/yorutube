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
      if (state.view === 'home') {
        this.activeItem.set('Home');
      } else if (state.view === 'discover') {
        this.activeItem.set('Discover');
      } else if (state.view === 'calendar') {
        this.activeItem.set('Calendar');
      } else if (state.view === 'channels') {
        this.activeItem.set('Channels');
      } else if (state.view === 'collections' || state.view === 'collection-detail') {
        this.activeItem.set('Collections');
      } else if (state.view === 'history') {
        this.activeItem.set('History');
      } else if (state.view === 'watchlist') {
        this.activeItem.set('Watchlist');
      } else if (state.view === 'playlists' || state.view === 'playlist-detail') {
        this.activeItem.set('Playlists');
      } else if (state.view === 'subscriptions') {
        this.activeItem.set('Subscriptions');
      } else if (state.view === 'channel') {
        const channelId = state.params?.id;
        if (channelId) {
            const sub = this.subscriptions().find(s => s.id === channelId);
            if (sub) {
              this.activeItem.set(sub.name);
            }
        }
      }
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
