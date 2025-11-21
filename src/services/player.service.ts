import { Injectable, signal, effect, inject } from "@angular/core";
import { PlayerProviderService } from "./player-provider.service";

/**
 * PlayerType is automatically generated from registered providers.
 * No need to manually update this when adding new providers!
 */
export type PlayerType = string;

const PLAYER_STORAGE_KEY = "yorutube-player";
const AUTO_NEXT_STORAGE_KEY = "yorutube-auto-next";
const AUTOPLAY_STORAGE_KEY = "yorutube-autoplay";
const AUTO_NEXT_THRESHOLD_KEY = "yorutube-auto-next-threshold";
const NEXT_BUTTON_STORAGE_KEY = "yorutube-next-button";

@Injectable({
  providedIn: "root",
})
export class PlayerService {
  private playerProviderService = inject(PlayerProviderService);

  /**
   * Dynamic list of available players.
   * Automatically includes all providers registered in player-providers/index.ts
   */
  players = signal<PlayerType[]>(
    this.playerProviderService.getAllProviderIds()
  );

  selectedPlayer = signal<PlayerType>("VIDLINK");
  autoNextEnabled = signal<boolean>(true);
  // Percentage threshold (0-100) at which the app will auto-advance to the next episode
  autoNextThreshold = signal<number>(100);
  // Default to enabled so new users get autoplay as a sane default; stored
  // preference (localStorage) will still override if present.
  autoplayEnabled = signal<boolean>(true);
  // Toggle for the "Next Episode" button overlay visibility
  nextButtonEnabled = signal<boolean>(true);
  
  // Lock to prevent duplicate auto-next navigations (progress vs player events)
  private autoNextLock = signal(false);
  private autoNextLockTimeoutId: any | null = null;

  constructor() {
    this.loadFromStorage();
    effect(() => {
      this.saveToStorage();
    });
  }

  private loadFromStorage(): void {
    if (typeof window !== "undefined" && window.localStorage) {
      const storedPlayer = localStorage.getItem(
        PLAYER_STORAGE_KEY
      ) as PlayerType;
      if (storedPlayer && this.players().includes(storedPlayer)) {
        this.selectedPlayer.set(storedPlayer);
      }
      const storedAutoNext = localStorage.getItem(AUTO_NEXT_STORAGE_KEY);
      if (storedAutoNext !== null) {
        this.autoNextEnabled.set(storedAutoNext === "true");
      }
      const storedAutoplay = localStorage.getItem(AUTOPLAY_STORAGE_KEY);
      if (storedAutoplay !== null) {
        this.autoplayEnabled.set(storedAutoplay === "true");
      }
      const storedNextButton = localStorage.getItem(NEXT_BUTTON_STORAGE_KEY);
      if (storedNextButton !== null) {
        this.nextButtonEnabled.set(storedNextButton === "true");
      }
      const storedAutoNextThreshold = localStorage.getItem(
        AUTO_NEXT_THRESHOLD_KEY
      );
      if (storedAutoNextThreshold !== null) {
        const parsed = parseInt(storedAutoNextThreshold, 10);
        if (!isNaN(parsed)) {
          this.autoNextThreshold.set(Math.max(0, Math.min(100, parsed)));
        }
      }
    }
  }

  private saveToStorage(): void {
    if (typeof window !== "undefined" && window.localStorage) {
      localStorage.setItem(PLAYER_STORAGE_KEY, this.selectedPlayer());
      localStorage.setItem(
        AUTO_NEXT_STORAGE_KEY,
        String(this.autoNextEnabled())
      );
      localStorage.setItem(
        AUTOPLAY_STORAGE_KEY,
        String(this.autoplayEnabled())
      );
      localStorage.setItem(
        NEXT_BUTTON_STORAGE_KEY,
        String(this.nextButtonEnabled())
      );
      localStorage.setItem(
        AUTO_NEXT_THRESHOLD_KEY,
        String(this.autoNextThreshold())
      );
    }
  }

  selectPlayer(player: PlayerType): void {
    this.selectedPlayer.set(player);
  }

  toggleAutoNext(): void {
    this.autoNextEnabled.update((v) => !v);
  }

  toggleAutoplay(): void {
    this.autoplayEnabled.update((v) => !v);
  }

  toggleNextButton(): void {
    this.nextButtonEnabled.update((v) => !v);
  }

  setAutoNextThreshold(value: number): void {
    const clamped = Math.max(0, Math.min(100, Math.round(value)));
    this.autoNextThreshold.set(clamped);
  }

  // Try to acquire the auto-next lock. Returns true if lock acquired, false if already locked.
  tryLockAutoNext(timeoutMs = 10000): boolean {
    if (this.autoNextLock()) return false;
    this.autoNextLock.set(true);
    // Fallback in case something goes wrong: auto release the lock after timeoutMs
    if (this.autoNextLockTimeoutId) {
      clearTimeout(this.autoNextLockTimeoutId);
    }
    this.autoNextLockTimeoutId = setTimeout(() => {
      this.autoNextLock.set(false);
      this.autoNextLockTimeoutId = null;
    }, timeoutMs);
    return true;
  }

  unlockAutoNext(): void {
    if (this.autoNextLockTimeoutId) {
      clearTimeout(this.autoNextLockTimeoutId);
      this.autoNextLockTimeoutId = null;
    }
    this.autoNextLock.set(false);
  }
}
