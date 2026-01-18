import {
  IPlayerProvider,
  PlayerUrlConfig,
  PlayerEventData,
  PlayerMessageResult,
  EpisodeState,
} from "../../models/player-provider.model";
import { TvShowDetails, Episode } from "../../models/movie.model";

/**
 * Player provider for Vidlink (https://vidlink.pro)
 * Supports customizable UI colors and next episode button
 * Note: Vidlink uses 0-based episode indexing for the first episode
 */
export class VidlinkPlayerProvider implements IPlayerProvider {
  readonly id = "VIDLINK";
  readonly name = "Vidlink";
  readonly origin = "https://vidlink.pro";
  // Vidlink supports auto-next via internal controls
  readonly supportsAutoNext = true;

  generateUrl(config: PlayerUrlConfig): string | null {
    const { media, episode, autoplay, resumeTime } = config;

    const queryParams: string[] = [
      "primaryColor=ff0000",
      "secondaryColor=a2a2a2",
      "iconColor=eefdec",
      "icons=default",
      "player=jw",
      "title=true",
      "poster=true",
    ];

    // Explicitly disable Vidlink's built-in auto-next - we handle it with our custom logic
    queryParams.push("nextbutton=false");

    // Pass explicit autoplay value so providers that default to autoplay
    // when the param is missing are overridden by a user-controlled setting.
    if (autoplay) {
      queryParams.push("autoplay=true");
    } else {
      queryParams.push("autoplay=false");
    }

    // Support resuming playback from a specific time (seconds) for Vidlink
    if (resumeTime && resumeTime > 5) {
      queryParams.push(`startAt=${Math.floor(resumeTime)}`);
    }

    const queryString = queryParams.join("&");

    let baseUrl: string;
    if (media.media_type === "movie") {
      baseUrl = `${this.origin}/movie/${media.id}`;
    } else if (media.media_type === "tv" && episode) {
      baseUrl = `${this.origin}/tv/${media.id}/${episode.season_number}/${episode.episode_number}`;
    } else if (media.media_type === "tv") {
      const tvDetails = media as TvShowDetails;
      const firstSeason =
        tvDetails.seasons.find((s) => s.season_number > 0) ||
        tvDetails.seasons[0];
      if (firstSeason) {
        baseUrl = `${this.origin}/tv/${media.id}/${firstSeason.season_number}/1`;
      } else {
        return null;
      }
    } else {
      return null;
    }

    return `${baseUrl}?${queryString}`;
  }

  handleMessage(
    input: any,
    currentEpisode: Episode | null,
  ): PlayerMessageResult {
    const result: PlayerMessageResult = {};

    if (!input) return result;

    // Support both direct data and nested { data: ... } structure
    let data = input;
    if (input.data && typeof input.data === "object") {
      data = input.data;
    }

    // Vidlink sends MEDIA_DATA messages
    if (data) {
      result.playerStarted = true;
    }

    // Handle playback progress from PLAYER_EVENT messages
    // STRICT CHECK: Ensure duration exists and is positive
    if (
      (data.event === "timeupdate" || data.event === "time") &&
      typeof data.currentTime === "number" &&
      typeof data.duration === "number" &&
      data.duration > 0
    ) {
      const progressPercent = this.calculateProgressPercent(
        data.currentTime,
        data.duration,
      );

      result.playbackProgress = {
        currentTime: data.currentTime,
        duration: data.duration,
        progressPercent,
      };
    }

    // Handle ended event explicitly to ensure we hit 100%
    if (data.event === "ended") {
      // For 'ended', we can trust it's done, but we need a valid duration to report
      const duration = data.duration || 0;
      if (duration > 0) {
        result.playbackProgress = {
          currentTime: duration,
          duration: duration,
          progressPercent: 100,
        };
      }
    }

    // Handle episode changes - Vidlink sends strings, so parse them
    // Allow changes when episode differs (catches both manual navigation and auto-next)
    if (data.season !== undefined && data.episode !== undefined) {
      const season = parseInt(String(data.season), 10);
      const episode = this.normalizeEpisode(data.episode);

      if (!isNaN(season) && !isNaN(episode)) {
        const episodeDiffers =
          !currentEpisode ||
          currentEpisode.season_number !== season ||
          currentEpisode.episode_number !== episode;

        if (episodeDiffers) {
          const hasPlaybackTime = typeof data.currentTime === "number";
          const isNonRoutineEvent =
            data.event &&
            !["timeupdate", "time", "seeking", "seeked"].includes(data.event);

          // Report episode change if we have playback data or non-routine event
          if (hasPlaybackTime || isNonRoutineEvent) {
            result.episodeChange = {
              season,
              episode,
            };
          }
        }
      }
    }

    // Handle episode changes from MEDIA_DATA messages (last_season_watched/last_episode_watched)
    if (
      (data as any).last_season_watched !== undefined &&
      (data as any).last_episode_watched !== undefined
    ) {
      const season = parseInt(String((data as any).last_season_watched), 10);
      const episode = this.normalizeEpisode((data as any).last_episode_watched);

      if (!isNaN(season) && !isNaN(episode)) {
        // Only report if it differs from current episode
        if (
          !currentEpisode ||
          currentEpisode.season_number !== season ||
          currentEpisode.episode_number !== episode
        ) {
          result.episodeChange = {
            season,
            episode,
          };
        }
      }
    }

    return result;
  }

  /**
   * Normalize Vidlink episode numbers
   * Vidlink uses 0-based indexing (episode 0 = episode 1, episode 1 = episode 2, etc.)
   * Always add 1 to the episode number
   */
  normalizeEpisode(rawEpisode: any): number {
    const candidate = parseInt(String(rawEpisode), 10);
    if (isNaN(candidate)) return NaN;
    // Vidlink uses 0-based indexing, so always add 1
    return candidate + 1;
  }

  /** Safe progress calculation with division by zero protection */
  private calculateProgressPercent(
    currentTime: number,
    duration: number,
  ): number {
    if (typeof duration !== "number" || duration <= 0) return 0;
    if (typeof currentTime !== "number" || currentTime < 0) return 0;

    // Safety: If duration is extremely small (e.g. 0.1s), it's likely invalid/loading data.
    // Don't calculate progress for trivial durations.
    if (duration < 1) return 0;

    const timeRemaining = duration - currentTime;

    // Only snap to 100% if:
    // 1. We are within 2 seconds of the end
    // 2. AND we haven't overshot significantly (which implies bad data)
    // 3. AND the content is substantial (>30s) to avoid glitches on short clips/trailers
    if (duration > 30 && timeRemaining < 2 && timeRemaining > -1) {
      return 100;
    }

    const progress = (currentTime / duration) * 100;

    // Handle edge cases
    if (isNaN(progress) || !isFinite(progress)) return 0;

    // Hard clamp between 0 and 100
    return Math.min(Math.max(progress, 0), 100);
  }

  onMediaData(rawData: any): void {
    try {
      const sanitizedData = this.sanitizeStorageData(rawData);
      localStorage.setItem("vidLinkProgress", JSON.stringify(sanitizedData));
    } catch (e) {
      console.error("Failed to store Vidlink progress (provider):", e);
    }
  }

  /** Sanitize storage data to prevent injection attacks */
  private sanitizeStorageData(data: any): any {
    if (!data || typeof data !== "object") return {};

    // Only allow known safe properties
    const sanitized: any = {};
    const allowedKeys = [
      "currentTime",
      "duration",
      "episode",
      "season",
      "progressPercent",
    ];

    for (const key of allowedKeys) {
      if (key in data && typeof data[key] === "number") {
        sanitized[key] = data[key];
      }
    }

    return sanitized;
  }
}
