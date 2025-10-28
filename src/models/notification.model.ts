import { MediaType } from './movie.model';

export interface Notification {
  id: string; // Unique ID, e.g., 'movie-12345' or 'tv-67890-2024-05-20'
  media: MediaType;
  message: string;
  timestamp: number;
  isRead: boolean;
}
