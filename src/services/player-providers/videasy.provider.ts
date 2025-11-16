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

  generateUrl(config: PlayerUrlConfig): string | null {
    const { media, episode, autoplay, autoNext, resumeTime } = config;

    const queryParams: string[] = [
      "color=FF0000",
      "nextEpisode=true",
      "episodeSelector=true",
    ];

    if (autoNext) {
      queryParams.push("autoplayNextEpisode=true");
    }

    if (resumeTime && resumeTime > 5) {
      queryParams.push(`progress=${Math.floor(resumeTime)}`);
    }

    if (autoplay) {
      queryParams.push("autoplay=1");
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

    // Handle episode changes - only for actual navigation events, not routine updates
    // This prevents spurious reloads if the player sends episode info during timeupdate
    if (
      typeof data.season === "number" &&
      typeof data.episode === "number" &&
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
      // Only report if it differs from current episode
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
    const parsed = parseInt(String(rawEpisode), 10);
    return isNaN(parsed) ? NaN : parsed;
  }
}
