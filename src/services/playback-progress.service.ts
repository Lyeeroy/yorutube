import { Injectable, signal, effect, untracked } from "@angular/core";
import { PlaybackProgress } from "../models/playback-progress.model";

const STORAGE_KEY = "yorutube-playback-progress";
const SAVE_THROTTLE_MS = 1000; // Throttle saves to once per second

@Injectable({
  providedIn: "root",
})
export class PlaybackProgressService {
  // Store progress as a map of mediaId -> PlaybackProgress
  progressData = signal<Record<number, PlaybackProgress>>({});
  private saveTimeout: ReturnType<typeof setTimeout> | null = null;
  private pendingSave = false;
  private lastSavedData: Record<number, PlaybackProgress> = {};

  constructor() {
    this.loadFromStorage();
    effect(() => {
      const data = this.progressData();
      
      if (this.saveTimeout) {
        clearTimeout(this.saveTimeout);
      }
      
      // Store reference for save and mark as pending
      this.pendingSave = true;
      
      this.saveTimeout = setTimeout(() => {
        if (this.pendingSave) {
          this.lastSavedData = { ...data };
          untracked(() => this.saveToStorage(data));
          this.pendingSave = false;
        }
      }, SAVE_THROTTLE_MS);
    });
  }

  private loadFromStorage(): void {
    if (!this.isLocalStorageAvailable()) return;

    try {
      const stored = this.safeStorageGet(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === 'object') {
          this.progressData.set(parsed);
        } else {
          this.progressData.set({});
        }
      }
    } catch (e) {
      console.error("Error parsing playback progress from localStorage", e);
      this.progressData.set({});
    }
  }

  private saveToStorage(data: Record<number, PlaybackProgress>): void {
    this.safeStorageSet(STORAGE_KEY, JSON.stringify(data));
  }

  /** Comprehensive localStorage availability check */
  private isLocalStorageAvailable(): boolean {
    try {
      const test = '__localStorage_test__';
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      return true;
    } catch {
      return false;
    }
  }

  /** Safe localStorage read with error handling */
  private safeStorageGet(key: string): string | null {
    try {
      if (this.isLocalStorageAvailable()) {
        return localStorage.getItem(key);
      }
      return null;
    } catch (error) {
      console.warn(`Failed to read localStorage key "${key}":`, error);
      return null;
    }
  }

  /** Safe localStorage write with error handling */
  private safeStorageSet(key: string, value: string): void {
    try {
      if (this.isLocalStorageAvailable()) {
        localStorage.setItem(key, value);
      }
    } catch (error) {
      console.warn(`Failed to save localStorage key "${key}":`, error);
    }
  }

  updateProgress(
    mediaId: number,
    progress: Omit<PlaybackProgress, "updatedAt">
  ): void {
    this.progressData.update((currentData) => ({
      ...currentData,
      [mediaId]: {
        ...progress,
        updatedAt: Date.now(),
      },
    }));
  }

  getProgress(mediaId: number): PlaybackProgress | undefined {
    return this.progressData()[mediaId];
  }

  clearProgress(mediaId: number): void {
    this.progressData.update((currentData) => {
      const newData = { ...currentData };
      delete newData[mediaId];
      return newData;
    });
  }

  clearAll(): void {
    this.progressData.set({});
  }
}
