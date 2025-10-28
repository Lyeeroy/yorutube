import { Injectable, signal, effect } from '@angular/core';

export type PlayerType = 'YouTube' | 'VIDEASY';
const PLAYER_STORAGE_KEY = 'yorutube-player';
const AUTO_NEXT_STORAGE_KEY = 'yorutube-auto-next';

@Injectable({
  providedIn: 'root'
})
export class PlayerService {
  players: PlayerType[] = ['YouTube', 'VIDEASY'];
  selectedPlayer = signal<PlayerType>('VIDEASY');
  autoNextEnabled = signal<boolean>(true);

  constructor() {
    this.loadFromStorage();
    effect(() => {
      this.saveToStorage();
    });
  }

  private loadFromStorage(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
        const storedPlayer = localStorage.getItem(PLAYER_STORAGE_KEY) as PlayerType;
        if (storedPlayer && this.players.includes(storedPlayer)) {
            this.selectedPlayer.set(storedPlayer);
        }
        const storedAutoNext = localStorage.getItem(AUTO_NEXT_STORAGE_KEY);
        if (storedAutoNext !== null) {
          this.autoNextEnabled.set(storedAutoNext === 'true');
        }
    }
  }

  private saveToStorage(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(PLAYER_STORAGE_KEY, this.selectedPlayer());
        localStorage.setItem(AUTO_NEXT_STORAGE_KEY, String(this.autoNextEnabled()));
    }
  }

  selectPlayer(player: PlayerType): void {
    this.selectedPlayer.set(player);
  }

  toggleAutoNext(): void {
    this.autoNextEnabled.update(v => !v);
  }
}