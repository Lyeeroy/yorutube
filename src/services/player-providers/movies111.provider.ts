import {
  IPlayerProvider,
  PlayerUrlConfig,
  PlayerMessageResult,
  EpisodeState,
} from "../../models/player-provider.model";
import { Episode } from "../../models/movie.model";

export class Movies111PlayerProvider implements IPlayerProvider {
  readonly id = "MOVIES111";
  readonly name = "Movies111";
  readonly origin = "https://111movies.com";
  readonly supportsAutoNext = true;

  generateUrl(config: PlayerUrlConfig): string | null {
    const { media, episode, autoplay, resumeTime } = config;

    // Base URL construction
    let baseUrl = "";
    if (media.media_type === "movie") {
      baseUrl = `https://111movies.com/movie/${media.id}`;
    } else if (media.media_type === "tv" && episode) {
      baseUrl = `https://111movies.com/tv/${media.id}/${episode.season_number}/${episode.episode_number}`;
    } else {
      return null;
    }

    // Query Parameter Deduplication and constructing
    const params = new URLSearchParams();

    // Handle autoplay
    if (typeof autoplay === "boolean") {
      params.set("autoplay", autoplay ? "true" : "false");
    } else if (autoplay) {
        params.set("autoplay", "true");
    }

    // Handle resumeTime
    if (resumeTime && resumeTime > 0) {
        params.set("progress", Math.floor(resumeTime).toString());
    }

    const queryString = params.toString();
    return queryString ? `${baseUrl}?${queryString}` : baseUrl;
  }

  handleMessage(
    data: any,
    currentEpisode: Episode | null
  ): PlayerMessageResult {
    const result: PlayerMessageResult = {};

    // Ignore angular devtools and other noise
    if (!data || data.source?.includes("angular-devtools") || data.isIvy) {
      return result;
    }

    // Determine event type
    const eventType = data.event || data.type;
    
    // Attempt to extract time data from multiple possible locations
    // 1. data.data (Nested - per sample)
    // 2. data (Flat)
    const payload = data.data || data;

    const rawCurrentTime = payload?.currentTime ?? payload?.time;
    const rawDuration = payload?.duration || payload?.totalTime;
    
    // Helper to safely parse numbers
    const parseTime = (val: any): number | undefined => {
        if (typeof val === 'number') return val;
        if (typeof val === 'string') {
            const parsed = parseFloat(val);
            return isNaN(parsed) ? undefined : parsed;
        }
        return undefined;
    };

    const currentTime = parseTime(rawCurrentTime);
    const duration = parseTime(rawDuration);

    // 1. Progress Handling
    if (
        (eventType === "timeupdate" || eventType === "time" || eventType === "pause" || currentTime !== undefined) &&
        currentTime !== undefined &&
        duration !== undefined &&
        duration > 0
    ) {
        let finalTime = currentTime;
        
        // Fix floating point issues near the end
        if (duration - finalTime < 1.0) {
            finalTime = duration;
        }

        result.playbackProgress = {
            currentTime: finalTime,
            duration: duration,
            progressPercent: (finalTime / duration) * 100,
        };

        // Mark as started if we have valid time
        if (finalTime > 0.5) {
            result.playerStarted = true;
        }
    }

    // 2. Status Handling
    if (eventType === "play" || eventType === "playing") {
        result.playerStarted = true;
    }

    // 3. Episode Changes
    // Check inside payload
    const season = parseTime(payload?.season);
    const episode = parseTime(payload?.episode);

    if (season !== undefined && episode !== undefined) {
         // Check against current episode
         if (currentEpisode) {
            const isSame =
                currentEpisode.season_number === season &&
                currentEpisode.episode_number === episode;
            
            if (!isSame) {
                result.episodeChange = {
                    season,
                    episode
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
