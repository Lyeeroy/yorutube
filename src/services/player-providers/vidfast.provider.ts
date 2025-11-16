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

  generateUrl(config: PlayerUrlConfig): string | null {
    const { media, episode, autoplay, autoNext, resumeTime } = config;

    // Default to showing title/poster but don't force autoplay unless
    // explicitly enabled via the config. VidFast treats duplicate query
    // parameters oddly and some combinations can lead to 500s, so avoid
    // adding `autoPlay=true` twice.
    const params: string[] = ["title=true", "poster=true"];

    if (autoplay) {
      // Add both variants to improve compatibility (some embed domains use
      // `autoPlay`, others `autoplay`). We'll deduplicate case-insensitively
      // so only one ends up in the final URL.
      params.push("autoPlay=true");
      params.push("autoplay=true");
    }
    if (autoNext) params.push("autoNext=true", "nextButton=true");

    if (resumeTime && resumeTime > 5) {
      params.push(`startAt=${Math.floor(resumeTime)}`);
    }

    // Theme support: some VidFast embeds support a `theme` query parameter
    // which should be a hex string WITHOUT the leading '#'. Accept both 'abc' and 'abcdef'.
    if (config.playerTheme) {
      const sanitized = config.playerTheme.replace(/^#/, "").trim();
      // Simple validation: accept 3 or 6 hex chars
      if (
        /^[0-9a-fA-F]{3}$/.test(sanitized) ||
        /^[0-9a-fA-F]{6}$/.test(sanitized)
      ) {
        params.push(`theme=${sanitized}`);
      }
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

    // VidFast includes season/episode info in many message types, but we should
    // ONLY report episode changes for actual navigation events, not routine
    // timeupdate/progress events. This prevents spurious reloads and navigation
    // conflicts when VidFast sends episode metadata during normal playback.
    //
    // Episode changes should only be reported for events like:
    // - 'ended' followed by auto-next
    // - explicit user navigation within the player
    // - NOT on 'timeupdate', 'time', 'play', 'pause', etc.
    if (
      typeof data.season === "number" &&
      typeof data.episode === "number" &&
      // Only process episode changes for specific events, not routine updates
      data.event &&
      ![
        "timeupdate",
        "time",
        "play",
        "pause",
        "playing",
        "seeking",
        "seeked",
      ].includes(data.event)
    ) {
      // Only report an episode change if it differs from the current episode
      if (
        !currentEpisode ||
        currentEpisode.season_number !== data.season ||
        currentEpisode.episode_number !== data.episode
      ) {
        result.episodeChange = {
          season: data.season,
          episode: data.episode,
        };
      }
    }

    return result;
  }

  normalizeEpisode(rawEpisode: any): number {
    const candidate = parseInt(String(rawEpisode), 10);
    return isNaN(candidate) ? NaN : candidate;
  }
}
