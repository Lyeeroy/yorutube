import {
  IPlayerProvider,
  PlayerUrlConfig,
  PlayerEventData,
  PlayerMessageResult,
} from "../../models/player-provider.model";

/**
 * Mock provider example for anyone who wants to add a new player source.
 *
 * Notes:
 * - This file is intentionally a mock/example implementation. Do NOT include this
 *   provider in `REGISTERED_PROVIDERS` (see `player-providers/index.ts`).
 * - Copy this file to create a new provider implementation, then adjust the
 *   `id`, `name`, `origin` and the `generateUrl`/`handleMessage` logic for the
 *   specific provider API.
 *
 * A real provider should implement:
 *  - `generateUrl(config)` to return the embed URL including query params
 *  - `handleMessage(data, currentEpisode)` to normalize postMessage events
 *  - `normalizeEpisode(rawEpisode)` to fix indexing quirks (0-based vs 1-based)
 */
export class YouTubePlayerProvider implements IPlayerProvider {
  // Unique ID used by PlayerService and UI. Keep UPPERCASE to match the other providers
  readonly id = "YOUTUBE";

  // Human-friendly name shown in UI (optional)
  readonly name = "YouTube (Mock Example)";

  // Origin used for postMessage security validation
  readonly origin = "https://www.youtube.com";

  // --- Example: How to implement generateUrl ---
  // PlayerUrlConfig includes: media (movie or tv details), episode (optional),
  // autoplay, autoNext, resumeTime.
  generateUrl(config: PlayerUrlConfig): string | null {
    // This is a sample implementation that shows common patterns.
    // Replace with provider-specific URL generation.

    const { media, episode, autoplay, resumeTime } = config;

    // Example: YouTube needs a video key — our app usually loads videoDetails first
    // If we don't have a key, return null to fall back to other players.
    // In practice, you'd build a URL like https://www.youtube.com/embed/<id>?autoplay=1
    const exampleVideoKey = "EXAMPLE_KEY"; // Replace after fetching real video id
    const query = [];
    // Always set explicit autoplay flag. Some embed contexts assume autoplay
    // by default; setting autoplay=0 ensures autoplay is disabled when the
    // app requests it.
    query.push(`autoplay=${autoplay ? "1" : "0"}`);
    if (typeof resumeTime === "number" && resumeTime > 5) {
      // YouTube accepts `start` param in seconds
      query.push(`start=${Math.floor(resumeTime)}`);
    }

    const queryString = query.length ? `?${query.join("&")}` : "";

    return `https://www.youtube.com/embed/${exampleVideoKey}${queryString}`;
  }

  // --- Example: How to map postMessage events to PlayerMessageResult ---
  handleMessage(
    data: PlayerEventData,
    currentEpisode: any
  ): PlayerMessageResult {
    // YouTube iframe API doesn't send the same message shape as our other
    // providers. This example demonstrates a simple conversion.

    const result: PlayerMessageResult = {};

    // Mark the player as started when `play` event occurs
    if (data.event === "play") {
      result.playerStarted = true;
    }

    // Convert timeupdate to normalized playback object
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
      // If the player has played a meaningful amount of time, consider started
      if (data.currentTime > 0) result.playerStarted = true;
    }

    // Some players also report `season`/`episode` changes
    if (typeof data.season === "number" && typeof data.episode === "number") {
      result.episodeChange = {
        season: data.season,
        episode: this.normalizeEpisode(data.episode),
      };
    }

    return result;
  }

  // --- Example: Normalize episodes ---
  // If a provider uses 0-based indexing for episodes, convert 0 => 1 here.
  normalizeEpisode(rawEpisode: any): number {
    const parsed = parseInt(String(rawEpisode), 10);
    if (isNaN(parsed)) return NaN;
    // Example: YouTube would usually not send episodes, but a custom embed might
    return parsed === 0 ? 1 : parsed;
  }
}
