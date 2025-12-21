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
  readonly supportsAutoNext = false; // V3 doesn't send episode change events
  readonly note = "Selecting episodes within the embedded player will not sync with the main site. Use native episode selector!";

  generateUrl(config: PlayerUrlConfig): string | null {
    const { media, episode, autoplay, resumeTime } = config;

    // Base URL construction
    let baseUrl: string;
    if (media.media_type === "movie") {
      baseUrl = `${this.origin}/v3/embed/movie/${media.id}`;
    } else if (media.media_type === "tv" && episode) {
      baseUrl = `${this.origin}/v3/embed/tv/${media.id}/${episode.season_number}/${episode.episode_number}`;
    } else if (media.media_type === "tv") {
      // Fallback to first season/episode if specific episode not provided
      const tvDetails = media as TvShowDetails;
      const firstSeason =
        tvDetails.seasons.find((s) => s.season_number > 0) ||
        tvDetails.seasons[0];
      if (firstSeason) {
        baseUrl = `${this.origin}/v3/embed/tv/${media.id}/${firstSeason.season_number}/1`;
      } else {
        return null;
      }
    } else {
      return null;
    }

    const params = new URLSearchParams();
    params.set("color", "ff0000"); // Default accent color
    params.set("episodes", "false"); // Default accent color

    if (typeof autoplay === "boolean") {
        params.set("autoPlay", autoplay ? "true" : "false");
    }

    if (resumeTime && resumeTime > 0) {
        params.set("startAt", Math.floor(resumeTime).toString());
    }

    const queryString = params.toString();
    return queryString ? `${baseUrl}?${queryString}` : baseUrl;
  }

  handleMessage(
    input: any,
    currentEpisode: Episode | null
  ): PlayerMessageResult {
    const result: PlayerMessageResult = {};

    if (!input) return result;

    // VideoPlayerComponent might have already unwrapped 'data'.
    // We handle both cases: input IS the data, or input.data IS the data.
    const data = input.data || input;

    // Handle playback progress
    if (
      (data.event === "timeupdate" || data.event === "time") &&
      typeof data.currentTime === "number" &&
      typeof data.duration === "number" &&
      data.duration > 0
    ) {
        let finalTime = data.currentTime;
        // Fix floating point issues near the end
        if (data.duration - finalTime < 0.5) {
            finalTime = data.duration;
        }

      result.playbackProgress = {
        currentTime: finalTime,
        duration: data.duration,
        progressPercent: (finalTime / data.duration) * 100,
      };

      // Mark player as started if we have meaningful playback
      if (finalTime > 0.5) {
        result.playerStarted = true;
      }
    }

    // Handle play event
    if (data.event === "play") {
      result.playerStarted = true;
    }

    // Handle episode changes
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
