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

  readonly supportsAutoNext = true;
  readonly note =
    "Selecting episodes within the embedded player will not sync with the main site. Use native episode selector!";

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
    currentEpisode: Episode | null,
  ): PlayerMessageResult {
    const result: PlayerMessageResult = {};

    if (!input) return result;

    // Normalize data structure. Some events are in {type: "PLAYER_EVENT", data: {...}}
    // VideoPlayerComponent might have already unwrapped 'data', but we handle both for robustness.
    let data = input.data || input;

    // If we have a nested type wrapper we didn't catch
    if (data.type === "PLAYER_EVENT" && data.data) {
      data = data.data;
    }

    // Safety: ignore events about different media if IDs are provided
    // V3 includes tmdbId and mediaType in its messages
    // const tmdbId = data.tmdbId || data.id;
    // const mediaType = data.mediaType;
    // if (tmdbId && currentMediaItem && String(tmdbId) !== String(currentMediaItem.id)) return result;

    // Handle playback progress
    // V3 uses 'time' event, but we keep 'timeupdate' for compatibility
    const isProgressEvent =
      data.event === "timeupdate" || data.event === "time";

    // Coerce to numbers as some players might send strings
    const currentTime =
      data.currentTime !== undefined
        ? parseFloat(String(data.currentTime))
        : NaN;
    const duration =
      data.duration !== undefined ? parseFloat(String(data.duration)) : NaN;

    if (
      isProgressEvent &&
      !isNaN(currentTime) &&
      !isNaN(duration) &&
      duration > 0
    ) {
      let finalTime = currentTime;
      // Fix floating point issues near the end
      if (duration - finalTime < 0.5) {
        finalTime = duration;
      }

      const rawProgress = (finalTime / duration) * 100;

      result.playbackProgress = {
        currentTime: finalTime,
        duration: duration,
        progressPercent: Math.min(Math.max(rawProgress, 0), 100),
      };

      // Mark player as started if we have meaningful playback
      if (finalTime > 0.5) {
        result.playerStarted = true;
      }
    }

    // Handle play event
    if (data.event === "play" || data.playing === true) {
      result.playerStarted = true;
    }

    // Handle episode changes
    // V3 sends season and episode as numbers or strings
    const season = this.normalizeEpisode(data.season);
    const episode = this.normalizeEpisode(data.episode);

    if (!isNaN(season) && !isNaN(episode)) {
      const episodeDiffers =
        !currentEpisode ||
        currentEpisode.season_number !== season ||
        currentEpisode.episode_number !== episode;

      if (episodeDiffers) {
        const hasPlaybackTime = !isNaN(currentTime);
        const isNonRoutineEvent =
          data.event &&
          !["timeupdate", "time", "seeking", "seeked"].includes(data.event);

        // Report episode change if we have playback data (meaning we are actually playing that episode)
        // or a non-routine event (like an explicit navigation)
        if (hasPlaybackTime || isNonRoutineEvent) {
          result.episodeChange = {
            season: season,
            episode: episode,
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
