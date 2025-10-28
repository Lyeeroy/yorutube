import { MediaType } from './movie.model';

export interface Playlist {
  id: string; // uuid
  name: string;
  description: string;
  items: MediaType[];
  createdAt: number;
  updatedAt: number;
}
