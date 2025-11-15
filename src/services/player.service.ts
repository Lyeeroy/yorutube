import { Injectable, signal, effect, inject } from "@angular/core";
import { PlayerProviderService } from "./player-provider.service";

/**
 * PlayerType is automatically generated from registered providers.
 * No need to manually update this when adding new providers!
 */
export type PlayerType = string;

const PLAYER_STORAGE_KEY = "yorutube-player";
const AUTO_NEXT_STORAGE_KEY = "yorutube-auto-next";

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
    }
  }

  private saveToStorage(): void {
    if (typeof window !== "undefined" && window.localStorage) {
      localStorage.setItem(PLAYER_STORAGE_KEY, this.selectedPlayer());
      localStorage.setItem(
        AUTO_NEXT_STORAGE_KEY,
        String(this.autoNextEnabled())
      );
    }
  }

  selectPlayer(player: PlayerType): void {
    this.selectedPlayer.set(player);
  }

  toggleAutoNext(): void {
    this.autoNextEnabled.update((v) => !v);
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
