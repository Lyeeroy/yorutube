import {
  IPlayerProvider,
  PlayerUrlConfig,
  PlayerEventData,
  PlayerMessageResult,
  EpisodeState,
} from "../../models/player-provider.model";
import { TvShowDetails, Episode } from "../../models/movie.model";

/**
 * Player provider for Vidsrc (https://vidsrc.cc)
 * Minimal configuration options, supports color customization and autoplay
 */
export class VidsrcPlayerProvider implements IPlayerProvider {
  readonly id = "VIDSRC";
  readonly name = "Vidsrc";
  readonly origin = "https://vidsrc.cc";

  generateUrl(config: PlayerUrlConfig): string | null {
    const { media, episode, autoplay } = config;

    const queryParams: string[] = ["color=ff0000"];

    if (autoplay) {
      queryParams.push("autoPlay=true");
    }

    const queryString = queryParams.join("&");

    let baseUrl: string;
    if (media.media_type === "movie") {
      baseUrl = `${this.origin}/v2/embed/movie/${media.id}`;
    } else if (media.media_type === "tv" && episode) {
      baseUrl = `${this.origin}/v2/embed/tv/${media.id}/${episode.season_number}/${episode.episode_number}`;
    } else if (media.media_type === "tv") {
      const tvDetails = media as TvShowDetails;
      const firstSeason =
        tvDetails.seasons.find((s) => s.season_number > 0) ||
        tvDetails.seasons[0];
      if (firstSeason) {
        baseUrl = `${this.origin}/v2/embed/tv/${media.id}/${firstSeason.season_number}/1`;
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

    // Handle episode changes
    if (typeof data.season === "number" && typeof data.episode === "number") {
      result.episodeChange = {
        season: data.season,
        episode: data.episode,
      };
    }

    return result;
  }

  normalizeEpisode(rawEpisode: any): number {
    const parsed = parseInt(String(rawEpisode), 10);
    return isNaN(parsed) ? NaN : parsed;
  }
}
