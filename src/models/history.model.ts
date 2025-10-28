import { MediaType, Episode } from './movie.model';

export interface HistoryItem {
  id: string; // Unique ID for the history entry, e.g., 'movie-12345'
  media: MediaType;
  episode?: Episode;
  watchedAt: number; // Timestamp of when it was watched
}
