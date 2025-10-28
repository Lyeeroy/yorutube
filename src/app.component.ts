import { Component, ChangeDetectionStrategy, inject, signal, OnInit, HostListener, effect, viewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';

import { HeaderComponent } from './components/header/header.component';
import { SidebarComponent } from './components/sidebar/sidebar.component';
import { SubscriptionService } from './services/subscription.service';
import { NavigationService } from './services/navigation.service';
import { NotificationService } from './services/notification.service';

// Import page components
import { HomeComponent } from './components/home/home.component';
import { VideoPlayerComponent } from './components/video-player/video-player.component';
import { SearchResultsComponent } from './components/search-results/search-results.component';
import { ChannelsComponent } from './components/channels/channels.component';
import { ChannelDetailComponent } from './components/channel-detail/channel-detail.component';
import { DiscoverComponent } from './components/discover/discover.component';
import { WatchlistComponent } from './components/watchlist/watchlist.component';
import { SubscriptionsComponent } from './components/subscriptions/subscriptions.component';
import { HistoryComponent } from './components/history/history.component';
import { CollectionsComponent } from './components/collections/collections.component';
import { CollectionDetailComponent } from './components/collection-detail/collection-detail.component';
import { PlaylistsComponent } from './components/playlists/playlists.component';
import { PlaylistDetailComponent } from './components/playlist-detail/playlist-detail.component';
import { LoginModalComponent } from './components/login-modal/login-modal.component';
import { CalendarComponent } from './components/calendar/calendar.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule, 
    HeaderComponent, 
    SidebarComponent,
    HomeComponent,
    VideoPlayerComponent,
    SearchResultsComponent,
    ChannelsComponent,
    ChannelDetailComponent,
    DiscoverComponent,
    WatchlistComponent,
    SubscriptionsComponent,
    HistoryComponent,
    CollectionsComponent,
    CollectionDetailComponent,
    PlaylistsComponent,
    PlaylistDetailComponent,
    LoginModalComponent,
    CalendarComponent
  ],
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent implements OnInit {
  private subscriptionService = inject(SubscriptionService);
  private navigationService = inject(NavigationService);
  private notificationService = inject(NotificationService);

  isSidebarOpen = signal(false);
  isSidebarMini = signal(false);
  showLoginModal = signal(false);

  subscriptions = this.subscriptionService.subscriptions;
  
  navigationState = this.navigationService.currentView;
  
  private readonly mobileBreakpoint = 768;

  private mainContent = viewChild<ElementRef<HTMLElement>>('mainContent');

  constructor() {
    effect(() => {
      // This effect runs whenever navigationState changes.
      this.navigationState();
      this.mainContent()?.nativeElement.scrollTo(0, 0);
    });
  }

  ngOnInit() {
    this.checkViewport();
    this.notificationService.checkForUpdates();
  }

  @HostListener('window:resize')
  onResize() {
    this.checkViewport();
  }

  private checkViewport() {
    if (window.innerWidth >= this.mobileBreakpoint) {
      this.isSidebarOpen.set(false);
    }
  }

  toggleSidebar() {
    if (window.innerWidth < this.mobileBreakpoint) {
      this.isSidebarOpen.update(value => !value);
    } else {
      this.isSidebarMini.update(value => !value);
    }
  }

  closeSidebar() {
    this.isSidebarOpen.set(false);
  }
}
