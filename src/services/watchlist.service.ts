import { Injectable, signal, effect } from '@angular/core';
import { MediaType } from '../models/movie.model';

const STORAGE_KEY = 'yorutube-watchlist';

@Injectable({
  providedIn: 'root'
})
export class WatchlistService {
  watchlist = signal<MediaType[]>([]);

  constructor() {
    this.loadFromStorage();
    effect(() => {
      this.saveToStorage(this.watchlist());
    });
  }

  private loadFromStorage(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            try {
                this.watchlist.set(JSON.parse(stored));
            } catch (e) {
                console.error('Error parsing watchlist from localStorage', e);
                this.watchlist.set([]);
            }
        }
    }
  }

  private saveToStorage(items: MediaType[]): void {
    if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    }
  }

  addToWatchlist(media: MediaType): void {
    this.watchlist.update(list => {
      if (!list.some(item => item.id === media.id && item.media_type === media.media_type)) {
        return [media, ...list]; // Add to the beginning
      }
      return list;
    });
  }

  removeFromWatchlist(mediaId: number): void {
    this.watchlist.update(list => list.filter(item => item.id !== mediaId));
  }

  isOnWatchlist(mediaId: number): boolean {
    return this.watchlist().some(item => item.id === mediaId);
  }

  clearWatchlist(): void {
    this.watchlist.set([]);
  }
}
