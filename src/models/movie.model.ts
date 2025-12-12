// =======================================
// Base Media Types
// =======================================

export interface BaseMedia {
  id: number;
  poster_path: string | null;
  vote_average: number;
  overview: string;
  genre_ids: number[];
  backdrop_path?: string | null;
  popularity?: number;
  original_language: string;
}

export interface Movie extends BaseMedia {
  title: string;
  release_date: string;
  media_type: "movie";
}

export interface TvShow extends BaseMedia {
  name: string;
  first_air_date: string;
  media_type: "tv";
}

export type MediaType = Movie | TvShow;

// =======================================
// Detailed Media Types
// =======================================

export interface BelongsToCollection {
  id: number;
  name: string;
  poster_path: string | null;
  backdrop_path: string | null;
}

export interface CollectionSearchResult extends BelongsToCollection {
  media_type: "collection";
  overview: string;
}

export interface CastMember {
  id: number;
  name: string;
  character: string;
  profile_path: string | null;
  order: number;
}

export interface CrewMember {
  id: number;
  name: string;
  job: string;
  department: string;
  profile_path: string | null;
}

export interface Credits {
  cast: CastMember[];
  crew: CrewMember[];
}

export interface MovieDetails extends Movie {
  runtime: number | null;
  production_companies: ProductionCompany[];
  tagline: string | null;
  belongs_to_collection: BelongsToCollection | null;
  // FIX: Add homepage property to align with the TMDB API.
  homepage: string | null;
  credits?: Credits;
}

export interface Episode {
  id: number;
  name: string;
  overview: string;
  vote_average: number;
  episode_number: number;
  air_date: string | null;
  still_path: string | null;
  season_number: number;
}

export interface Season {
  air_date: string | null;
  episode_count: number;
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  season_number: number;
}

export interface SeasonDetails extends Season {
  episodes: Episode[];
}

export interface TvShowDetails extends TvShow {
  seasons: Season[];
  number_of_seasons: number;
  number_of_episodes: number;
  created_by: { id: number; name: string }[];
  last_air_date: string | null;
  networks: Network[];
  last_episode_to_air?: Episode | null;
  // FIX: Add homepage property to align with the TMDB API.
  homepage: string | null;
  credits?: Credits;
}

// =======================================
// Channel/Company Types
// =======================================

export interface ChannelEntity {
  id: number;
  logo_path: string | null;
  name: string;
  origin_country: string;
  description?: string;
  homepage?: string;
  headquarters?: string;
}

export interface ProductionCompany extends ChannelEntity {}
export interface Network extends ChannelEntity {}

export interface SubscribableChannel extends ChannelEntity {
  type: "network" | "company" | "merged";
  networkId?: number;
  companyId?: number;
}

// =======================================
// API Response & Search Types
// =======================================

export type SearchResult =
  | MediaType
  | SubscribableChannel
  | CollectionSearchResult;

export interface MediaResponse {
  page: number;
  results: MediaType[];
  total_pages: number;
  total_results: number;
}

export interface Video {
  iso_639_1: string;
  iso_3166_1: string;
  name: string;
  key: string;
  site: string;
  size: number;
  type: string;
  official: boolean;
  published_at: string;
  id: string;
}

export interface VideoResponse {
  id: number;
  results: Video[];
}

export interface Genre {
  id: number;
  name: string;
}

export interface GenreResponse {
  genres: Genre[];
}

export interface Collection {
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  parts: Movie[];
}

// =======================================
// Service Parameter Types
// =======================================

export interface DiscoverParams {
  type: "movie" | "tv" | "anime";
  page?: number;
  with_genres?: number[] | string;
  without_genres?: number[] | string;
  with_network?: number | string;
  // FIX: Allow string for pipe-separated company IDs to enable OR queries.
  with_company?: number | string;
  with_watch_providers?: number | string;
  watch_region?: string;
  sort_by?: string;
  primary_release_year?: number;
  first_air_date_year?: number;
  vote_average_gte?: number;
  release_date_gte?: string;
  with_original_language?: string;
}
