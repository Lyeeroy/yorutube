import { Injectable, signal, effect } from '@angular/core';

const STORAGE_KEY = 'yorutube-search-history';
const MAX_HISTORY_SIZE = 15;

@Injectable({
  providedIn: 'root'
})
export class SearchHistoryService {
  history = signal<string[]>([]);

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
                console.error('Error parsing search history from localStorage', e);
                this.history.set([]);
            }
        }
    }
  }

  private saveToStorage(history: string[]): void {
    if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    }
  }

  addSearchTerm(term: string): void {
    const trimmedTerm = term.trim();
    if (!trimmedTerm) {
      return;
    }

    this.history.update(currentHistory => {
      // Remove any existing instance of the term (case-insensitive)
      const filteredHistory = currentHistory.filter(item => item.toLowerCase() !== trimmedTerm.toLowerCase());
      // Add the new term to the beginning and limit the history size
      const newHistory = [trimmedTerm, ...filteredHistory].slice(0, MAX_HISTORY_SIZE);
      return newHistory;
    });
  }

  removeSearchTerm(term: string): void {
    this.history.update(currentHistory => currentHistory.filter(item => item !== term));
  }
}
