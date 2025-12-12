export interface UnifiedGenre {
  name: string;
  movieIds: number[];
  tvIds: number[];
  animeIds: number[];
}

export const UNIFIED_GENRES: UnifiedGenre[] = [
  { name: "Action", movieIds: [28], tvIds: [10759], animeIds: [28, 10759] },
  { name: "Adventure", movieIds: [12], tvIds: [10759], animeIds: [12, 10759] },
  { name: "Animation", movieIds: [16], tvIds: [16], animeIds: [16] },
  { name: "Comedy", movieIds: [35], tvIds: [35], animeIds: [35] },
  { name: "Crime", movieIds: [80], tvIds: [80], animeIds: [80] },
  { name: "Documentary", movieIds: [99], tvIds: [99], animeIds: [99] },
  { name: "Drama", movieIds: [18], tvIds: [18], animeIds: [18] },
  { name: "Family", movieIds: [10751], tvIds: [10751, 10762], animeIds: [10751, 10751, 10762] }, // 10762 is Kids
  { name: "Fantasy", movieIds: [14], tvIds: [10765], animeIds: [14, 10765] },
  { name: "History", movieIds: [36], tvIds: [36], animeIds: [36] },
  { name: "Horror", movieIds: [27], tvIds: [27], animeIds: [27] },
  { name: "Music", movieIds: [10402], tvIds: [10402], animeIds: [10402] },
  { name: "Mystery", movieIds: [9648], tvIds: [9648], animeIds: [9648] },
  { name: "Romance", movieIds: [10749], tvIds: [10749], animeIds: [10749] },
  { name: "Sci-Fi", movieIds: [878], tvIds: [10765], animeIds: [878, 10765] },
  { name: "Thriller", movieIds: [53], tvIds: [53], animeIds: [53] },
  { name: "War", movieIds: [10752], tvIds: [10768], animeIds: [10752, 10768] },
  { name: "Western", movieIds: [37], tvIds: [37], animeIds: [37] },
];
