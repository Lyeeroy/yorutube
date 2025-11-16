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

    const params: string[] = ["autoPlay=true", "title=true", "poster=true"];

    if (autoplay) params.push("autoPlay=true");
    if (autoNext) params.push("autoNext=true", "nextButton=true");

    if (resumeTime && resumeTime > 5) {
      params.push(`startAt=${Math.floor(resumeTime)}`);
    }

    const query = params.join("&");

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

    // VidFast may include season/episode info
    if (typeof data.season === "number" && typeof data.episode === "number") {
      result.episodeChange = {
        season: data.season,
        episode: data.episode,
      };
    }

    return result;
  }

  normalizeEpisode(rawEpisode: any): number {
    const candidate = parseInt(String(rawEpisode), 10);
    return isNaN(candidate) ? NaN : candidate;
  }
}
