import {
  IPlayerProvider,
  PlayerUrlConfig,
  PlayerEventData,
  PlayerMessageResult,
  EpisodeState,
} from "../../models/player-provider.model";
import { Episode } from "../../models/movie.model";

/**
 * Player provider for VidUp
 * Handles new URL patterns and nested event structure.
 */
export class VidUpPlayerProvider implements IPlayerProvider {
  readonly id = "VIDUP";
  readonly name = "VidUp";
  readonly origin = "https://vidup.to";
  readonly supportsAutoNext = true;

  generateUrl(config: PlayerUrlConfig): string | null {
    const { media, episode, autoplay, resumeTime } = config;

    if (media.media_type === "movie") {
      // Movie URL: https://vidup.to/movie/{id}?autoPlay=true
      const funcAutoPlay = autoplay ? "true" : "false"; 
      let url = `https://vidup.to/movie/${media.id}?autoPlay=${funcAutoPlay}`;
      // Append startAt if provided
      if (resumeTime && resumeTime > 5) {
        url += `&startAt=${Math.floor(resumeTime)}`;
      }
      return url;
    } else if (media.media_type === "tv" && episode) {
      // TV Show URL: https://vidup.to/tv/{id}/{season}/{episode}?autoPlay=true
      const funcAutoPlay = autoplay ? "true" : "false"; 
      let url = `https://vidup.to/tv/${media.id}/${episode.season_number}/${episode.episode_number}?autoPlay=${funcAutoPlay}`;
      // Append startAt if provided
      if (resumeTime && resumeTime > 5) {
        url += `&startAt=${Math.floor(resumeTime)}`;
      }
      return url;
    }

    return null;
  }

  handleMessage(
    data: any,
    currentEpisode: Episode | null
  ): PlayerMessageResult {
    const result: PlayerMessageResult = {};
    
    // The user provided events are wrapped in { type: "PLAYER_EVENT", data: { ... } }
    // or { type: "MEDIA_DATA", data: { ... } }
    
    // Check if we have the nested structure
    let eventData: PlayerEventData | null = null;
    
    if (data && data.type === "PLAYER_EVENT" && data.data) {
        eventData = data.data;
    } else if (data && data.event) {
        // Fallback for flat structure if mixed
        eventData = data;
    }

    if (!eventData) {
        return result;
    }

    // Handle playback progress
    if (
      eventData.event === "timeupdate" &&
      typeof eventData.currentTime === "number" &&
      typeof eventData.duration === "number"
    ) {
      result.playbackProgress = {
        currentTime: eventData.currentTime,
        duration: eventData.duration,
        progressPercent: (eventData.currentTime / eventData.duration) * 100,
      };

      if (eventData.currentTime > 0) {
        result.playerStarted = true;
      }
    }

    // Handle play status
    if (eventData.playing === true) {
        result.playerStarted = true;
        // In the sample, "playing": true is sent with timeupdate
    }

    // Handle episode changes
    // The sample "timeupdate" includes "season", "episode", "tmdbId".
    if (
        typeof eventData.season === "number" && 
        typeof eventData.episode === "number"
    ) {
         const episodeDiffers =
        !currentEpisode ||
        currentEpisode.season_number !== eventData.season ||
        currentEpisode.episode_number !== eventData.episode;

        if (episodeDiffers) {
             // Only report change if we are confident it's a new episode
             result.episodeChange = {
                season: eventData.season,
                episode: eventData.episode
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
