import { Injectable, signal, effect } from '@angular/core';
import { ContinueWatchingItem } from '../models/continue-watching.model';

const STORAGE_KEY = 'yorutube-continue-watching';

@Injectable({
  providedIn: 'root'
})
export class ContinueWatchingService {
  items = signal<ContinueWatchingItem[]>([]);

  constructor() {
    this.loadFromStorage();
    effect(() => {
      this.saveToStorage(this.items());
    });
  }

  private loadFromStorage(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            try {
                this.items.set(JSON.parse(stored));
            } catch (e) {
                console.error('Error parsing continue watching from localStorage', e);
                this.items.set([]);
            }
        }
    }
  }

  private saveToStorage(items: ContinueWatchingItem[]): void {
    if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    }
  }

  addItem(item: Omit<ContinueWatchingItem, 'updatedAt'>): void {
    const newItem: ContinueWatchingItem = {
      ...item,
      updatedAt: Date.now()
    };

    this.items.update(currentItems => {
      // Remove any existing item with the same media ID
      const filtered = currentItems.filter(i => i.id !== newItem.id);
      // Add the new/updated item to the beginning
      return [newItem, ...filtered];
    });
  }

  removeItem(mediaId: number): void {
    this.items.update(currentItems => currentItems.filter(i => i.id !== mediaId));
  }
}
