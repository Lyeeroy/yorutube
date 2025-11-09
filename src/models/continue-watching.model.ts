import { MediaType, Episode } from './movie.model';

export interface ContinueWatchingItem {
  id: number; // The media ID (for movies) or TV Show ID (for tv)
  media: MediaType;
  episode?: Episode;
  updatedAt: number; // Timestamp for sorting
}
