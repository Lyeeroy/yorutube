import { Injectable, signal } from "@angular/core";

export type View =
  | "home"
  | "watch"
  | "search"
  | "discover"
  | "channels"
  | "channel"
  | "watchlist"
  | "subscriptions"
  | "history"
  | "collections"
  | "collection-detail"
  | "playlists"
  | "playlist-detail"
  | "calendar";

export interface NavigationState {
  view: View;
  params: any;
}

@Injectable({
  providedIn: "root",
})
export class NavigationService {
  currentView = signal<NavigationState>({ view: "home", params: null });

  navigateTo(
    view: View,
    params: any = null,
    options?: { skipHistory?: boolean }
  ) {
    // Update internal state immediately
    this.currentView.set({ view, params });

    // Update the browser URL to match the navigation state unless explicitly skipped
    if (!options?.skipHistory && typeof window !== "undefined") {
      try {
        const url = this.buildUrl(view, params);
        window.history.pushState({}, "", url);
      } catch (e) {
        // ignore pushState errors (e.g., in constrained environments)
        console.error("Failed to push history state", e);
      }
    }
  }

  goHome() {
    this.navigateTo("home");
  }

  // Build user-facing URLs for views to allow direct linking.
  private buildUrl(view: View, params: any = null): string {
    switch (view) {
      case "home":
        return "/";
      case "watch": {
        // Use YouTube-like query format: /watch?v=Oeo2VCCtUZQ
        // We'll encode app media info into a short v=<code> string. This keeps
        // urls compact and similar to YouTube, while we still accept legacy
        // formats for compatibility.
        const qp = new URLSearchParams();
        if (params?.id && params?.mediaType)
          qp.set("v", this.encodeWatchId(params));
        else if (params?.id) qp.set("v", String(params.id)); // backward compat
        if (params?.playlistId) qp.set("list", String(params.playlistId));
        if (params?.autoplay) qp.set("autoplay", "1");
        if (params?.startAt && params.startAt > 0)
          qp.set("startAt", String(params.startAt));
        const q = qp.toString();
        return q ? `/watch?${q}` : "/watch";
      }
      case "search": {
        const qp = new URLSearchParams();
        // Support `q` param as the canonical query key. Also accept `query`
        // for back-compat but prefer `q` in URLs.
        if (params?.q ?? params?.query)
          qp.set("q", String(params.q ?? params.query));
        return qp.toString() ? `/search?${qp.toString()}` : "/search";
      }
      case "channel":
        return params?.id ? `/channel/${params.id}` : "/channels";
      case "discover":
        return "/discover";
      case "watchlist":
        return "/watchlist";
      case "channels":
        return "/channels";
      case "history":
        return "/history";
      case "collections":
        return "/collections";
      case "collection-detail":
        return params?.id ? `/collection/${params.id}` : "/collections";
      case "playlists":
        return "/playlists";
      case "playlist-detail":
        return params?.id ? `/playlists/${params.id}` : "/playlists";
      case "subscriptions":
        return "/subscriptions";
      case "calendar":
        return "/calendar";
      default:
        return "/";
    }
  }

  // Public helper for getting absolute URL for sharing or linking from outside the app
  getUrl(view: View, params: any = null): string {
    const path = this.buildUrl(view, params);
    if (typeof window !== "undefined" && window.location) {
      return `${window.location.origin}${path}`;
    }
    return path;
  }

  // Public helper for getting relative URL path
  getPath(view: View, params: any = null): string {
    return this.buildUrl(view, params);
  }

  // Parse current browser URL and update navigation state (used on startup and popstate)
  private parseUrlAndUpdateState(skipHistoryUpdate: boolean = true) {
    if (typeof window === "undefined") return;

    const pathname = window.location.pathname || "/";
    const search = window.location.search || "";
    const params = new URLSearchParams(search);

    // Parse watch URLs
    if (pathname.startsWith("/watch")) {
      // Query style: /watch?v=123&type=movie
      const v = params.get("v");
      const type = params.get("type");
      const playlistId = params.get("list");
      let season = params.get("season");
      let episode = params.get("episode");
      const autoplay = params.get("autoplay");
      const startAt = params.get("startAt");

      // Backwards compat: /watch/:mediaType/:id
      const legacyMatch = pathname.match(/^\/watch\/([^\/]+)\/(\d+)/);
      const legacyMediaType = legacyMatch?.[1];
      const legacyId = legacyMatch?.[2];

      // If v is encoded, decode it. Support legacy numeric v strings and
      // legacy path-based route (/watch/:mediaType/:id).
      let mediaType = type ?? legacyMediaType ?? "movie";
      let id: string | undefined = legacyId;
      if (v && v.length) {
        const decoded = this.decodeWatchId(v);
        if (decoded) {
          mediaType = decoded.mediaType;
          id = String(decoded.id);

          // If caller sent season/episode in route, keep them; otherwise pull
          // them from v for tv shows.
          if (decoded.season && !season) season = String(decoded.season);
          if (decoded.episode && !episode) episode = String(decoded.episode);
        } else {
          // If v is numeric, use as id and fallback to type param or legacy
          // detection.
          if (/^\d+$/.test(v)) id = v;
        }
      }

      if (id) {
        this.currentView.set({
          view: "watch",
          params: {
            mediaType,
            id: Number(id),
            playlistId: playlistId ? Number(playlistId) : undefined,
            season: season ? Number(season) : undefined,
            episode: episode ? Number(episode) : undefined,
            autoplay: !!autoplay,
            startAt: startAt ? Number(startAt) : undefined,
          },
        });
        return;
      }
    }

    // Parse search
    if (pathname.startsWith("/search")) {
      const query = params.get("q");
      // Store search params using the `q` key to match what the UI uses
      // (header and search results expect `params.q`). This keeps the
      // route param in the URL and makes reloads return the user to the
      // same search results.
      this.currentView.set({ view: "search", params: { q: query } });
      return;
    }

    // Parse channel
    const channelMatch = pathname.match(/^\/channel\/(\d+)/);
    if (channelMatch) {
      this.currentView.set({
        view: "channel",
        params: { id: Number(channelMatch[1]) },
      });
      return;
    }

    // Simple path mapping
    switch (pathname) {
      case "/discover":
        this.currentView.set({ view: "discover", params: null });
        return;
      case "/watchlist":
        this.currentView.set({ view: "watchlist", params: null });
        return;
      case "/channels":
        this.currentView.set({ view: "channels", params: null });
        return;
      case "/history":
        this.currentView.set({ view: "history", params: null });
        return;
      case "/collections":
        this.currentView.set({ view: "collections", params: null });
        return;
      case "/playlists":
        this.currentView.set({ view: "playlists", params: null });
        return;
      case "/subscriptions":
        this.currentView.set({ view: "subscriptions", params: null });
        return;
      case "/calendar":
        this.currentView.set({ view: "calendar", params: null });
        return;
      default:
        this.currentView.set({ view: "home", params: null });
        return;
    }
  }

  // --------- Helpers to encode/decode 'v' param (short opaque id) ----------
  private encodeWatchId(params: any): string {
    if (!params?.id) return "";
    if (params.mediaType === "tv") {
      // format: t<showId>-s<season>-e<episode> (using regular numbers for readability)
      let out = `t${params.id}`;
      if (params.season) out += `-s${params.season}`;
      if (params.episode) out += `-e${params.episode}`;
      return out;
    }
    // default to movie
    return `m${params.id}`;
  }

  private decodeWatchId(code: string): {
    mediaType: "movie" | "tv";
    id: number;
    season?: number;
    episode?: number;
  } | null {
    if (!code) return null;
    try {
      if (code.startsWith("m")) {
        const idPart = code.slice(1);
        const id = parseInt(idPart, 10);
        if (!isNaN(id)) return { mediaType: "movie", id };
        return null;
      }

      if (code.startsWith("t")) {
        // t<id>-s<season>-e<episode>
        const parts = code.slice(1).split("-");
        const id = parseInt(parts[0], 10);
        let season: number | undefined;
        let episode: number | undefined;

        for (let i = 1; i < parts.length; i++) {
          const p = parts[i];
          if (p.startsWith("s")) {
            season = parseInt(p.slice(1), 10);
          } else if (p.startsWith("e")) {
            episode = parseInt(p.slice(1), 10);
          }
        }
        if (!isNaN(id)) return { mediaType: "tv", id, season, episode };
        return null;
      }

      return null;
    } catch (e) {
      return null;
    }
  }

  constructor() {
    // On service init, try to hydrate from URL so direct links work.
    this.parseUrlAndUpdateState(true);

    // Sync on back/forward
    if (typeof window !== "undefined") {
      window.addEventListener("popstate", () =>
        this.parseUrlAndUpdateState(true)
      );
    }
  }
}
