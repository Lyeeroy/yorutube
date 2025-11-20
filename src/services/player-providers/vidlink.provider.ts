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

    // Auto-next is handled by the application's custom logic, not the provider

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
    data: PlayerEventData,
    currentEpisode: Episode | null
  ): PlayerMessageResult {
    const result: PlayerMessageResult = {};

    // Vidlink sends MEDIA_DATA messages
    if (data) {
      result.playerStarted = true;
    }

    // Handle playback progress from PLAYER_EVENT messages
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

  onMediaData(rawData: any): void {
    try {
      localStorage.setItem("vidLinkProgress", JSON.stringify(rawData));
    } catch (e) {
      console.error("Failed to store Vidlink progress (provider):", e);
    }
  }
}
