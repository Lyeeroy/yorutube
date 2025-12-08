import { Injectable, signal, effect, untracked } from '@angular/core';
import { HistoryItem } from '../models/history.model';
import { MediaType, Episode } from '../models/movie.model';

const STORAGE_KEY = 'yorutube-history';
const PAUSED_KEY = 'yorutube-history-paused';

@Injectable({
  providedIn: 'root'
})
export class HistoryService {
  history = signal<HistoryItem[]>([]);
  isPaused = signal<boolean>(false);

  constructor() {
    this.loadFromStorage();
    this.loadPausedState();
    effect(() => {
      const items = this.history();
      untracked(() => this.saveToStorage(items));
    });
    effect(() => {
      const paused = this.isPaused();
      untracked(() => this.savePausedState(paused));
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

  private loadPausedState(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
        const stored = localStorage.getItem(PAUSED_KEY);
        if (stored) {
            try {
                this.isPaused.set(JSON.parse(stored));
            } catch (e) {
                console.error('Error parsing history paused state from localStorage', e);
                this.isPaused.set(false);
            }
        }
    }
  }

  private savePausedState(paused: boolean): void {
    if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(PAUSED_KEY, JSON.stringify(paused));
    }
  }

  addToHistory(media: MediaType, episode?: Episode): void {
    // Don't add to history if paused
    if (this.isPaused()) {
      return;
    }

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

  togglePaused(): void {
    this.isPaused.update(v => !v);
  }
}