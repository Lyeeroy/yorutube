import { MovieDetails, TvShowDetails, Episode } from "./movie.model";

/**
 * Player event types received from embedded players via postMessage
 */
export interface PlayerEventData {
  event?: string;
  currentTime?: number;
  duration?: number;
  season?: number;
  episode?: number;
  [key: string]: any;
}

/**
 * Normalized episode state used internally
 */
export interface EpisodeState {
  season: number;
  episode: number;
}

/**
 * Configuration for generating player URLs
 */
export interface PlayerUrlConfig {
  media: MovieDetails | TvShowDetails;
  episode?: Episode;
  autoplay?: boolean;
  autoNext?: boolean;
  resumeTime?: number;
  /** Optional hex theme color (without '#') for players that support custom theming */
  playerTheme?: string;
}

/**
 * Result from handling a postMessage event
 */
export interface PlayerMessageResult {
  /** Whether the player has started playing */
  playerStarted?: boolean;
  /** Playback progress data if available */
  playbackProgress?: {
    currentTime: number;
    duration: number;
    progressPercent: number;
  };
  /** Episode change detected */
  episodeChange?: EpisodeState;
}

/**
 * Base interface for all player providers
 * Each player source (Videasy, Vidlink, Vidsrc) implements this interface
 */
export interface IPlayerProvider {
  /** Unique identifier for this player */
  readonly id: string;

  /** Display name for this player */
  readonly name: string;

  /** Origin URL for postMessage security validation */
  readonly origin: string;

  /**
   * Generate the embed URL for this player
   * @param config Configuration including media, episode, and playback settings
   * @returns The complete embed URL or null if unable to generate
   */
  generateUrl(config: PlayerUrlConfig): string | null;

  /**
   * Handle postMessage events from this player
   * @param data The message data received
   * @param currentEpisode The currently playing episode (if any)
   * @returns Normalized result with playback progress and episode changes
   */
  handleMessage(
    data: PlayerEventData,
    currentEpisode: Episode | null
  ): PlayerMessageResult;

  /**
   * Normalize episode data from this player's format
   * Some players may use 0-based indexing or other quirks
   * @param rawEpisode Raw episode data from player
   * @returns Normalized episode number
   */
  normalizeEpisode(rawEpisode: any): number;

  /** Optional hook for handling MEDIA_DATA or other provider-specific side-effects
   * For example some providers ask the host page to persist provider-specific
   * progress using a storage key. Providers that want to persist such data
   * can implement this hook and the router will call it.
   */
  onMediaData?(rawData: any): void;

  /** Optional flag indicating this provider manages or supports auto-next
   * behavior. Use this instead of comparing provider IDs in UI code.
   */
  supportsAutoNext?: boolean;

  /** Optional user-facing note/message about this provider's limitations or features
   * If present, an info icon will be shown in the UI to display this note.
   */
  note?: string;
}
