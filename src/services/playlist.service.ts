import { Injectable, signal, effect } from "@angular/core";
import { Playlist } from "../models/playlist.model";
import { MediaType } from "../models/movie.model";

const STORAGE_KEY = "yorutube-playlists";

@Injectable({
  providedIn: "root",
})
export class PlaylistService {
  playlists = signal<Playlist[]>([]);

  constructor() {
    this.loadFromStorage();
    effect(() => {
      this.saveToStorage(this.playlists());
    });
  }

  private loadFromStorage(): void {
    if (typeof window !== "undefined" && window.localStorage) {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          this.playlists.set(JSON.parse(stored));
        } catch (e) {
          console.error("Error parsing playlists from localStorage", e);
          this.playlists.set([]);
        }
      }
    }
  }

  private saveToStorage(playlists: Playlist[]): void {
    if (typeof window !== "undefined" && window.localStorage) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(playlists));
    }
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  getPlaylistById(id: string): Playlist | undefined {
    return this.playlists().find((p) => p.id === id);
  }

  /**
   * Return the next item in the playlist after the mediaId provided, or undefined if none.
   */
  getNextItemFromPlaylist(
    playlistId: string,
    mediaId: number
  ): MediaType | undefined {
    const playlist = this.getPlaylistById(playlistId);
    if (!playlist) return undefined;
    const idx = playlist.items.findIndex((i) => i.id === mediaId);
    if (idx === -1 || idx === playlist.items.length - 1) return undefined;
    return playlist.items[idx + 1];
  }

  createPlaylist(
    name: string,
    description: string = "",
    initialMedia?: MediaType | MediaType[]
  ): string {
    let initialItems: MediaType[] = [];
    if (initialMedia) {
      if (Array.isArray(initialMedia)) {
        initialItems = initialMedia;
      } else {
        initialItems = [initialMedia];
      }
    }

    const newPlaylist: Playlist = {
      id: this.generateId(),
      name,
      description,
      items: initialItems,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.playlists.update((playlists) => [...playlists, newPlaylist]);
    return newPlaylist.id;
  }

  deletePlaylist(id: string): void {
    this.playlists.update((playlists) => playlists.filter((p) => p.id !== id));
  }

  updatePlaylistDetails(id: string, name: string, description: string): void {
    this.playlists.update((playlists) =>
      playlists.map((p) =>
        p.id === id ? { ...p, name, description, updatedAt: Date.now() } : p
      )
    );
  }

  addToPlaylist(playlistId: string, media: MediaType): void {
    this.playlists.update((playlists) =>
      playlists.map((p) => {
        if (
          p.id === playlistId &&
          !p.items.some((item) => item.id === media.id)
        ) {
          return { ...p, items: [...p.items, media], updatedAt: Date.now() };
        }
        return p;
      })
    );
  }

  removeFromPlaylist(playlistId: string, mediaId: number): void {
    this.playlists.update((playlists) =>
      playlists.map((p) => {
        if (p.id === playlistId) {
          return {
            ...p,
            items: p.items.filter((item) => item.id !== mediaId),
            updatedAt: Date.now(),
          };
        }
        return p;
      })
    );
  }

  isMediaInPlaylist(playlistId: string, mediaId: number): boolean {
    const playlist = this.getPlaylistById(playlistId);
    return playlist
      ? playlist.items.some((item) => item.id === mediaId)
      : false;
  }

  isMediaInAnyPlaylist(mediaId: number): boolean {
    return this.playlists().some((p) =>
      p.items.some((item) => item.id === mediaId)
    );
  }

  getPlaylistsForMedia(mediaId: number): Playlist[] {
    return this.playlists().filter((p) =>
      p.items.some((item) => item.id === mediaId)
    );
  }
}
