import {
  IPlayerProvider,
  PlayerUrlConfig,
  PlayerEventData,
  PlayerMessageResult,
} from "../../models/player-provider.model";
import { TvShowDetails, Episode } from "../../models/movie.model";

/**
 * Player provider for VidFast (https://vidfast.pro)
 *
 * Implements URL generation and message handling for playback progress
 * and episode changes. This provider also supports reading MEDIA_DATA that
 * VidFast sends via postMessage so the host app can persist progress.
 */
export class VidfastPlayerProvider implements IPlayerProvider {
  readonly id = "VIDFAST";
  readonly name = "VidFast";

  // Use the canonical domain for event origin mapping. We only map one origin
  // here - if you embed VidFast from other domains listed in the docs, you can
  // add additional checks in the video player message handler.
  readonly origin = "https://vidfast.pro";
  readonly supportsAutoNext = true;
  // VidFast supports an internal next button — the provider emits episode
  // metadata often, so host-level thresholds should be used to avoid loops.

  generateUrl(config: PlayerUrlConfig): string | null {
    const { media, episode, autoplay, resumeTime } = config;

    // Default to showing title/poster but don't force autoplay unless
    // explicitly enabled via the config. VidFast treats duplicate query
    // parameters oddly and some combinations can lead to 500s, so avoid
    // adding `autoPlay=true` twice.
    const params: string[] = ["title=true", "poster=true"];

    // Always set an explicit autoplay param so the provider receives an
    // explicit true/false value. Some embed domains treat the absence of the
    // parameter as 'true' by default; to ensure deterministic behavior we
    // always send a value when the app explicitly decides autoplay state.
    if (autoplay) {
      params.push("autoPlay=true");
      params.push("autoplay=true");
    } else {
      params.push("autoPlay=false");
      params.push("autoplay=false");
    }
    
    // Explicitly disable VidFast's built-in auto-next - we handle it with our custom logic
    params.push("autoNext=false");

    if (resumeTime && resumeTime > 5) {
      params.push(`startAt=${Math.floor(resumeTime)}`);
    }

    // Theme support: VidFast supports a `theme` query parameter which should be a
    // hex string WITHOUT the leading '#'. Accept both 'abc' and 'abcdef'. If
    // no theme was provided by the host, use the provider's default accent.
    const defaultTheme = "dc2626"; // default app accent for VidFast
    const rawTheme = (config.playerTheme ?? defaultTheme) as string;
    const sanitized = String(rawTheme).replace(/^#/, "").trim();
    // Simple validation: accept 3 or 6 hex chars
    if (
      /^[0-9a-fA-F]{3}$/.test(sanitized) ||
      /^[0-9a-fA-F]{6}$/.test(sanitized)
    ) {
      params.push(`theme=${sanitized}`);
    }

    // Deduplicate params by key to avoid repeated keys (some servers react badly
    // to duplicate query params). This protects against accidental duplicate
    // values such as 'autoPlay=true' occurring twice.
    // Deduplicate parameter keys case-insensitively and preserve the last
    // occurrence of each key (so explicit values like `autoplay` will override
    // any earlier `autoPlay`). This avoids duplicate query params which can
    // cause server-side errors.
    const uniqueParams = Array.from(
      new Map(params.map((p) => [p.split("=")[0].toLowerCase(), p])).values()
    );

    const query = uniqueParams.join("&");

    if (media.media_type === "movie") {
      return `${this.origin}/movie/${media.id}?${query}`;
    }

    if (media.media_type === "tv" && episode) {
      return `${this.origin}/tv/${media.id}/${episode.season_number}/${episode.episode_number}?${query}`;
    }

    if (media.media_type === "tv") {
      const tvDetails = media as TvShowDetails;
      const firstSeason =
        tvDetails.seasons.find((s) => s.season_number > 0) ||
        tvDetails.seasons[0];
      if (!firstSeason) return null;
      return `${this.origin}/tv/${media.id}/${firstSeason.season_number}/1?${query}`;
    }

    return null;
  }

  handleMessage(
    data: PlayerEventData,
    currentEpisode: Episode | null
  ): PlayerMessageResult {
    const result: PlayerMessageResult = {};

    if (data.event === "play") {
      result.playerStarted = true;
    }

    // Time updates and duration handling
    if (
      (data.event === "timeupdate" || data.event === "time") &&
      typeof data.currentTime === "number" &&
      typeof data.duration === "number" &&
      data.duration > 0
    ) {
      result.playbackProgress = {
        currentTime: data.currentTime,
        duration: data.duration,
        progressPercent: (data.currentTime / data.duration) * 100,
      };

      if (data.currentTime > 0) result.playerStarted = true;
    }

    // VidFast includes season/episode info in many message types.
    // We need to detect when the player navigates internally (e.g., user clicked
    // the next episode button or auto-next triggered), but avoid false positives
    // from initial load when the episode hasn't changed.
    //
    // Strategy: Report episode changes when:
    // 1. Episode differs AND has meaningful playback (>5s) - user navigation during playback
    // 2. Episode differs AND has low playback (<5s) - auto-next reset to new episode start
    // 3. Episode differs AND non-routine event - explicit navigation event
    //
    // What we DON'T want: reporting changes at 0s for the SAME episode during initial load
    if (
      typeof data.season === "number" &&
      typeof data.episode === "number" &&
      !isNaN(data.season) &&
      !isNaN(data.episode)
    ) {
      const episodeDiffers =
        !currentEpisode ||
        currentEpisode.season_number !== data.season ||
        currentEpisode.episode_number !== data.episode;

      if (episodeDiffers) {
        const currentTime = data.currentTime;
        const hasPlaybackTime = typeof currentTime === "number";
        const isNonRoutineEvent =
          data.event &&
          !["timeupdate", "time", "seeking", "seeked"].includes(data.event);

        // Allow episode change if:
        // - We have playback time data (either high for navigation, or low for auto-next reset)
        // - OR it's a non-routine event
        if (hasPlaybackTime || isNonRoutineEvent) {
          result.episodeChange = {
            season: data.season,
            episode: data.episode,
          };
        }
      }
    }

    return result;
  }

  normalizeEpisode(rawEpisode: any): number {
    const candidate = parseInt(String(rawEpisode), 10);
    return isNaN(candidate) ? NaN : candidate;
  }

  onMediaData(rawData: any): void {
    try {
      localStorage.setItem("vidFastProgress", JSON.stringify(rawData));
    } catch (e) {
      console.error("Failed to store VidFast progress (provider):", e);
    }
  }
}
