import { Injectable, signal, effect } from '@angular/core';
import { HistoryItem } from '../models/history.model';
import { MediaType, Episode } from '../models/movie.model';

const STORAGE_KEY = 'yorutube-history';

@Injectable({
  providedIn: 'root'
})
export class HistoryService {
  history = signal<HistoryItem[]>([]);

  constructor() {
    this.loadFromStorage();
    effect(() => {
      this.saveToStorage(this.history());
    });
  }

  private loadFromStorage(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            try {
                this.history.set(JSON.parse(stored));
            } catch (e) {
                console.error('Error parsing history from localStorage', e);
                this.history.set([]);
            }
        }
    }
  }

  private saveToStorage(items: HistoryItem[]): void {
    if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    }
  }

  addToHistory(media: MediaType, episode?: Episode): void {
    const id = episode 
        ? `tv-${media.id}-${episode.id}` 
        : `${media.media_type}-${media.id}`;

    const newItem: HistoryItem = {
      id,
      media,
      episode,
      watchedAt: Date.now()
    };

    this.history.update(current => {
      // Remove any existing instance of the item and add the new one to the top
      const filtered = current.filter(item => item.id !== id);
      return [newItem, ...filtered];
    });
  }

  removeFromHistory(id: string): void {
    this.history.update(current => current.filter(item => item.id !== id));
  }

  clearHistory(): void {
    this.history.set([]);
  }
}