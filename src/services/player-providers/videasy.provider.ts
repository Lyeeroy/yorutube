import {
  IPlayerProvider,
  PlayerUrlConfig,
  PlayerEventData,
  PlayerMessageResult,
  EpisodeState,
} from "../../models/player-provider.model";
import { TvShowDetails, Episode } from "../../models/movie.model";

/**
 * Player provider for Videasy (https://player.videasy.net)
 * Supports episode selector, auto-next, and resume functionality
 */
export class VideasyPlayerProvider implements IPlayerProvider {
  readonly id = "VIDEASY";
  readonly name = "Videasy";
  readonly origin = "https://player.videasy.net";
  readonly supportsAutoNext = true;

  generateUrl(config: PlayerUrlConfig): string | null {
    const { media, episode, autoplay, resumeTime } = config;

    const queryParams: string[] = [
      "color=FF0000",
      "nextEpisode=true",
      "episodeSelector=true",
    ];

    // Auto-next is handled by the application's custom logic, not the provider

    if (resumeTime && resumeTime > 5) {
      queryParams.push(`progress=${Math.floor(resumeTime)}`);
    }

    // Explicitly set autoplay (1/0) so we can disable autoplay reliably
    // when the app or user turns it off.
    queryParams.push(`autoplay=${autoplay ? "1" : "0"}`);

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

    // Handle playback progress
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

      // Mark player as started if we have meaningful playback
      if (data.currentTime > 0) {
        result.playerStarted = true;
      }
    }

    // Handle play event
    if (data.event === "play") {
      result.playerStarted = true;
    }

    // Handle episode changes - detect when player navigates internally
    // Allow changes when episode differs (catches both manual navigation and auto-next)
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
        const hasPlaybackTime = typeof data.currentTime === "number";
        const isNonRoutineEvent =
          data.event &&
          !["timeupdate", "time", "seeking", "seeked"].includes(data.event);

        // Report episode change if we have playback data or non-routine event
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
    const parsed = parseInt(String(rawEpisode), 10);
    return isNaN(parsed) ? NaN : parsed;
  }
}
