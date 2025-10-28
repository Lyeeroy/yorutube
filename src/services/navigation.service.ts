import { Injectable, signal } from '@angular/core';

export type View = 'home' | 'watch' | 'search' | 'discover' | 'channels' | 'channel' | 'watchlist' | 'subscriptions' | 'history' | 'collections' | 'collection-detail' | 'playlists' | 'playlist-detail' | 'calendar';

export interface NavigationState {
  view: View;
  params: any;
}

@Injectable({
  providedIn: 'root'
})
export class NavigationService {
  currentView = signal<NavigationState>({ view: 'home', params: null });

  navigateTo(view: View, params: any = null) {
    this.currentView.set({ view, params });
  }

  goHome() {
    this.navigateTo('home');
  }
}
