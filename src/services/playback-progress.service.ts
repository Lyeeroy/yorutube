import { Injectable, signal, effect, untracked } from '@angular/core';
import { PlaybackProgress } from '../models/playback-progress.model';

const STORAGE_KEY = 'yorutube-playback-progress';
const SAVE_THROTTLE_MS = 1000; // Throttle saves to once per second

@Injectable({
  providedIn: 'root'
})
export class PlaybackProgressService {
  // Store progress as a map of mediaId -> PlaybackProgress
  progressData = signal<Record<number, PlaybackProgress>>({});
  private saveTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.loadFromStorage();
    effect(() => {
      const data = this.progressData();
      // Throttle saves to localStorage
      if (this.saveTimeout) {
        clearTimeout(this.saveTimeout);
      }
      this.saveTimeout = setTimeout(() => {
        untracked(() => this.saveToStorage(data));
      }, SAVE_THROTTLE_MS);
    });
  }

  private loadFromStorage(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          this.progressData.set(JSON.parse(stored));
        } catch (e) {
          console.error('Error parsing playback progress from localStorage', e);
          this.progressData.set({});
        }
      }
    }
  }

  private saveToStorage(data: Record<number, PlaybackProgress>): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }
  }

  updateProgress(mediaId: number, progress: Omit<PlaybackProgress, 'updatedAt'>): void {
    this.progressData.update(currentData => ({
      ...currentData,
      [mediaId]: {
        ...progress,
        updatedAt: Date.now()
      }
    }));
  }

  getProgress(mediaId: number): PlaybackProgress | undefined {
    return this.progressData()[mediaId];
  }

  clearProgress(mediaId: number): void {
    this.progressData.update(currentData => {
      const newData = { ...currentData };
      delete newData[mediaId];
      return newData;
    });
  }

  clearAll(): void {
    this.progressData.set({});
  }
}
