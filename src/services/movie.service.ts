import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable, shareReplay, forkJoin, switchMap, of, catchError } from 'rxjs';
import { MediaResponse, VideoResponse, GenreResponse, MediaType, TvShowDetails, SeasonDetails, Movie, TvShow, MovieDetails, Episode, Network, DiscoverParams, ProductionCompany, GroupedNetworks, GroupedProductionCompanies, SubscribableChannel, SearchResult, Collection } from '../models/movie.model';

@Injectable({
  providedIn: 'root'
})
export class MovieService {
  private readonly http = inject(HttpClient);
  
  private readonly API_KEY = '2c6781f841ce2ad1608de96743a62eb9';
  private readonly BASE_URL = 'https://api.themoviedb.org/3';

  private movieGenreMapCache$: Observable<Map<number, string>> | null = null;
  private tvGenreMapCache$: Observable<Map<number, string>> | null = null;
  private movieDetailsCache = new Map<number, Observable<MovieDetails>>();
  private tvShowDetailsCache = new Map<number, Observable<TvShowDetails>>();
  private popularNetworksCache$: Observable<GroupedNetworks> | null = null;
  private popularMovieStudiosCache$: Observable<GroupedProductionCompanies> | null = null;
  private popularAnimeStudiosCache$: Observable<GroupedProductionCompanies> | null = null;

  private createGenreMapObservable(url: string): Observable<Map<number, string>> {
    return this.http.get<GenreResponse>(url).pipe(
      map(response => {
        const genreMap = new Map<number, string>();
        response.genres.forEach(genre => {
          genreMap.set(genre.id, genre.name);
        });
        return genreMap;
      }),
      shareReplay(1)
    );
  }
  
  getMovieGenreMap(): Observable<Map<number, string>> {
    if (!this.movieGenreMapCache$) {
      const url = `${this.BASE_URL}/genre/movie/list?api_key=${this.API_KEY}`;
      this.movieGenreMapCache$ = this.createGenreMapObservable(url);
    }
    return this.movieGenreMapCache$;
  }
  
  getTvGenreMap(): Observable<Map<number, string>> {
    if (!this.tvGenreMapCache$) {
      const url = `${this.BASE_URL}/genre/tv/list?api_key=${this.API_KEY}`;
      this.tvGenreMapCache$ = this.createGenreMapObservable(url);
    }
    return this.tvGenreMapCache$;
  }

  getCombinedGenreMap(): Observable<Map<number, string>> {
    return forkJoin([this.getMovieGenreMap(), this.getTvGenreMap()]).pipe(
      map(([movieGenres, tvGenres]) => new Map([...movieGenres, ...tvGenres]))
    );
  }

  getTrendingAll(): Observable<MediaType[]> {
    const url = `${this.BASE_URL}/trending/all/week?api_key=${this.API_KEY}`;
    return this.http.get<MediaResponse>(url).pipe(
      map(response => response.results.filter(r => r.media_type === 'movie' || r.media_type === 'tv'))
    );
  }

  getPopularTvShows(): Observable<MediaType[]> {
    const url = `${this.BASE_URL}/tv/popular?api_key=${this.API_KEY}`;
    // FIX: Use a specific type for the response from /tv/popular endpoint to avoid type errors.
    // The API returns TV Show objects which may not have a `media_type` field.
    return this.http.get<{ results: Omit<TvShow, 'media_type'>[] }>(url).pipe(
      map(response => response.results.map(r => ({ ...r, media_type: 'tv' })))
    );
  }
  
  getTopRatedMovies(): Observable<MediaType[]> {
    const url = `${this.BASE_URL}/movie/top_rated?api_key=${this.API_KEY}`;
    // FIX: Use a specific type for the response from /movie/top_rated endpoint to avoid type errors.
    // The API returns Movie objects which may not have a `media_type` field.
    return this.http.get<{ results: Omit<Movie, 'media_type'>[] }>(url).pipe(
      map(response => response.results.map(r => ({ ...r, media_type: 'movie' })))
    );
  }

  getUpcomingMovies(): Observable<MediaType[]> {
    const url = `${this.BASE_URL}/movie/upcoming?api_key=${this.API_KEY}`;
    // FIX: Use a specific type for the response from /movie/upcoming endpoint to avoid type errors.
    // The API returns Movie objects which may not have a `media_type` field.
    return this.http.get<{ results: Omit<Movie, 'media_type'>[] }>(url).pipe(
      map(response => response.results.map(r => ({ ...r, media_type: 'movie' })))
    );
  }

  discoverMedia(params: DiscoverParams): Observable<{ results: MediaType[], total_pages: number }> {
    const { type, page = 1, with_genres, with_network, with_company, sort_by, primary_release_year, first_air_date_year, vote_average_gte } = params;
    
    const sortByQuery = `&sort_by=${sort_by || 'popularity.desc'}`;
    let baseQueryParams = `api_key=${this.API_KEY}&page=${page}${sortByQuery}`;

    if (vote_average_gte) {
        baseQueryParams += `&vote_average.gte=${vote_average_gte}`;
    }

    if (type === 'anime') {
        const animeGenres = [16, ...(with_genres || [])];
        const genreQuery = `&with_genres=${[...new Set(animeGenres)].join(',')}`;
        const langQuery = '&with_original_language=ja';

        let movieQueryParams = `${baseQueryParams}${genreQuery}${langQuery}`;
        if (with_company) movieQueryParams += `&with_companies=${with_company}`;
        if (primary_release_year) movieQueryParams += `&primary_release_year=${primary_release_year}`;

        let tvQueryParams = `${baseQueryParams}${genreQuery}${langQuery}`;
        if (with_network) tvQueryParams += `&with_networks=${with_network}`;
        if (first_air_date_year) tvQueryParams += `&first_air_date_year=${first_air_date_year}`;

        const movieUrl = `${this.BASE_URL}/discover/movie?${movieQueryParams}`;
        const tvUrl = `${this.BASE_URL}/discover/tv?${tvQueryParams}`;
        
        const movieRequest = this.http.get<{ results: Omit<Movie, 'media_type'>[], total_pages: number }>(movieUrl).pipe(
          map(res => ({ ...res, results: res.results.map(r => ({ ...r, media_type: 'movie' as const })) }))
        );
        const tvRequest = this.http.get<{ results: Omit<TvShow, 'media_type'>[], total_pages: number }>(tvUrl).pipe(
          map(res => ({ ...res, results: res.results.map(r => ({ ...r, media_type: 'tv' as const })) }))
        );

        return forkJoin([movieRequest, tvRequest]).pipe(
          map(([movieRes, tvRes]) => {
            const combined = [...movieRes.results, ...tvRes.results];
            const final_sort_by = sort_by || 'popularity.desc';

            if (final_sort_by.startsWith('popularity')) {
                combined.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
            } else if (final_sort_by.startsWith('vote_average')) {
                combined.sort((a, b) => b.vote_average - a.vote_average);
            }
            // Release date sorting is disabled for anime in the UI, so we don't need to handle it here.
            
            return {
              results: combined,
              total_pages: Math.max(movieRes.total_pages, tvRes.total_pages)
            };
          })
        );
    } 
    
    let queryParams = baseQueryParams;
    if (with_genres?.length) {
        queryParams += `&with_genres=${with_genres.join(',')}`;
    }

    const today = new Date().toISOString().split('T')[0];

    if (type === 'movie') {
        if (with_company) {
            queryParams += `&with_companies=${with_company}`;
        }
        if (primary_release_year) {
            queryParams += `&primary_release_year=${primary_release_year}`;
        }
        if (sort_by?.startsWith('primary_release_date.desc')) {
            queryParams += `&primary_release_date.lte=${today}`;
        }
        const url = `${this.BASE_URL}/discover/movie?${queryParams}`;
        return this.http.get<{ results: Omit<Movie, 'media_type'>[], total_pages: number }>(url).pipe(
            map(response => ({
                results: response.results.map(r => ({ ...r, media_type: 'movie' as const })),
                total_pages: response.total_pages
            }))
        );
    } else { // type === 'tv'
        if (with_network) {
            queryParams += `&with_networks=${with_network}`;
        }
        if (first_air_date_year) {
            queryParams += `&first_air_date_year=${first_air_date_year}`;
        }
        if (sort_by?.startsWith('first_air_date.desc')) {
            queryParams += `&first_air_date.lte=${today}`;
        }
        const url = `${this.BASE_URL}/discover/tv?${queryParams}`;
        return this.http.get<{ results: Omit<TvShow, 'media_type'>[], total_pages: number }>(url).pipe(
            map(response => ({
                results: response.results.map(r => ({ ...r, media_type: 'tv' as const })),
                total_pages: response.total_pages
            }))
        );
    }
  }

  getReleasesInRange(startDate: Date, endDate: Date): Observable<MediaType[]> {
    const start = startDate.toISOString().split('T')[0];
    const end = endDate.toISOString().split('T')[0];
    const pageLimit = 5; // Fetch up to 5 pages for a decent amount of data
    
    const movieRequests = Array.from({ length: pageLimit }, (_, i) => 
        this.http.get<{ results: Omit<Movie, 'media_type'>[] }>(
            `${this.BASE_URL}/discover/movie?api_key=${this.API_KEY}&primary_release_date.gte=${start}&primary_release_date.lte=${end}&sort_by=popularity.desc&page=${i + 1}`
        ).pipe(
            map(res => res.results.map(r => ({ ...r, media_type: 'movie' as const }))),
            catchError(() => of([] as Movie[]))
        )
    );

    const tvRequests = Array.from({ length: pageLimit }, (_, i) =>
        this.http.get<{ results: Omit<TvShow, 'media_type'>[] }>(
            `${this.BASE_URL}/discover/tv?api_key=${this.API_KEY}&first_air_date.gte=${start}&first_air_date.lte=${end}&sort_by=popularity.desc&page=${i + 1}`
        ).pipe(
            map(res => res.results.map(r => ({ ...r, media_type: 'tv' as const }))),
            catchError(() => of([] as TvShow[]))
        )
    );

    return forkJoin([...movieRequests, ...tvRequests]).pipe(
        map(results => {
            const allMedia = results.flat();
            const mediaMap = new Map<string, MediaType>();
            allMedia.forEach(media => {
                const key = `${media.media_type}-${media.id}`;
                if (!mediaMap.has(key)) {
                    mediaMap.set(key, media);
                }
            });
            return Array.from(mediaMap.values());
        })
    );
  }

  searchMulti(query: string, page: number = 1): Observable<{ results: MediaType[], total_pages: number }> {
    const url = `${this.BASE_URL}/search/multi?api_key=${this.API_KEY}&query=${encodeURIComponent(query)}&page=${page}`;
    return this.http.get<MediaResponse>(url).pipe(
      map(response => ({
        results: response.results.filter(r => (r.media_type === 'movie' || r.media_type === 'tv') && r.poster_path),
        total_pages: response.total_pages
      }))
    );
  }

  searchCompanies(query: string, page: number = 1): Observable<{ results: SubscribableChannel[], total_pages: number }> {
    const url = `${this.BASE_URL}/search/company?api_key=${this.API_KEY}&query=${encodeURIComponent(query)}&page=${page}`;
    return this.http.get<{ results: ProductionCompany[], total_pages: number }>(url).pipe(
        map(response => ({
            results: response.results
                .filter(c => c.logo_path) // Only companies with logos for better UI
                .map(c => ({ ...c, type: 'company' as const })),
            total_pages: response.total_pages
        }))
    );
  }

  searchAll(query: string, page: number = 1): Observable<{ results: SearchResult[], total_pages: number }> {
      const media$ = this.searchMulti(query, page).pipe(catchError(() => of({ results: [], total_pages: 0 })));
      const companies$ = this.searchCompanies(query, page).pipe(catchError(() => of({ results: [], total_pages: 0 })));

      let networks$: Observable<SubscribableChannel[]> = of([]);
      if (page === 1) { // Only search networks on the first page
          networks$ = this.getPopularNetworks().pipe(
              map(groupedNetworks => {
                  const allNetworks = [...groupedNetworks.popular, ...groupedNetworks.other];
                  return allNetworks
                      .filter(n => n.name.toLowerCase().includes(query.toLowerCase()))
                      .map(n => ({ ...n, type: 'network' as const }));
              }),
              catchError(() => of([])) // In case of error, return empty array
          );
      }

      return forkJoin({
          media: media$,
          companies: companies$,
          networks: networks$
      }).pipe(
          map(({ media, companies, networks }) => {
              const queryLower = query.toLowerCase();

              // Merge channels with the same name (e.g., Netflix network and company)
              const mergedChannelMap = new Map<string, { network?: SubscribableChannel, company?: SubscribableChannel }>();

              networks.forEach(n => {
                  const key = n.name.toLowerCase().trim();
                  const existing = mergedChannelMap.get(key) || {};
                  mergedChannelMap.set(key, { ...existing, network: n });
              });
              
              companies.results.forEach(c => {
                  const key = c.name.toLowerCase().trim();
                  const existing = mergedChannelMap.get(key) || {};
                  mergedChannelMap.set(key, { ...existing, company: c });
              });

              const uniqueChannels: SubscribableChannel[] = Array.from(mergedChannelMap.values()).map(entry => {
                  if (entry.network && entry.company) {
                      // Merged channel, prioritize network for primary info
                      return {
                          id: entry.network.id,
                          name: entry.network.name,
                          logo_path: entry.network.logo_path || entry.company.logo_path,
                          origin_country: entry.network.origin_country,
                          // FIX: Use 'as const' to prevent type widening to string, ensuring compatibility with SubscribableChannel type.
                          type: 'merged' as const,
                          networkId: entry.network.id,
                          companyId: entry.company.id,
                      };
                  }
                  // Return network or company if they exist alone
                  return (entry.network || entry.company)!;
              }).filter(c => c.logo_path); // Ensure all channels have a logo for better UI

              const getItemName = (item: SearchResult): string => {
                if ('media_type' in item) { // It's MediaType
                    return item.media_type === 'movie' ? item.title : item.name;
                }
                return item.name; // It's SubscribableChannel
              };

              const calculateRelevance = (name: string): number => {
                  const nameLower = name.toLowerCase();
                  if (nameLower === queryLower) return 3; // Exact match
                  if (nameLower.startsWith(queryLower)) return 2; // Starts with
                  return 1; // Contains
              };
              
              const allResults: SearchResult[] = [
                  ...media.results,
                  ...uniqueChannels,
              ];

              allResults.sort((a, b) => {
                  const nameA = getItemName(a);
                  const nameB = getItemName(b);
                  
                  const scoreA = calculateRelevance(nameA);
                  const scoreB = calculateRelevance(nameB);

                  // Primary sort: by relevance score
                  if (scoreA !== scoreB) {
                      return scoreB - scoreA;
                  }

                  // Secondary sort: for media items, use popularity as a tie-breaker.
                  // Channels will have popularity 0 and be sorted after media of same relevance.
                  const popA = ('popularity' in a && a.popularity) ? a.popularity : 0;
                  const popB = ('popularity' in b && b.popularity) ? b.popularity : 0;

                  return popB - popA;
              });

              const total_pages = Math.max(media.total_pages, companies.total_pages);

              return { results: allResults, total_pages };
          })
      );
  }

  getMovieVideos(movieId: number): Observable<VideoResponse> {
    const url = `${this.BASE_URL}/movie/${movieId}/videos?api_key=${this.API_KEY}`;
    return this.http.get<VideoResponse>(url);
  }

  getTvShowVideos(tvId: number): Observable<VideoResponse> {
    const url = `${this.BASE_URL}/tv/${tvId}/videos?api_key=${this.API_KEY}`;
    return this.http.get<VideoResponse>(url);
  }
  
  getEpisodeVideos(tvId: number, seasonNumber: number, episodeNumber: number): Observable<VideoResponse> {
    const url = `${this.BASE_URL}/tv/${tvId}/season/${seasonNumber}/episode/${episodeNumber}/videos?api_key=${this.API_KEY}`;
    return this.http.get<VideoResponse>(url);
  }

  getMovieDetails(movieId: number): Observable<MovieDetails> {
    if (this.movieDetailsCache.has(movieId)) {
      return this.movieDetailsCache.get(movieId)!;
    }
    const url = `${this.BASE_URL}/movie/${movieId}?api_key=${this.API_KEY}&append_to_response=videos,credits`;
    const details$ = this.http.get<Omit<MovieDetails, 'media_type'>>(url).pipe(
        map(movie => ({ ...movie, media_type: 'movie' as const })),
        shareReplay(1)
    );
    this.movieDetailsCache.set(movieId, details$);
    return details$;
  }

  getTvShowDetails(tvId: number): Observable<TvShowDetails> {
    if (this.tvShowDetailsCache.has(tvId)) {
      return this.tvShowDetailsCache.get(tvId)!;
    }
    const url = `${this.BASE_URL}/tv/${tvId}?api_key=${this.API_KEY}&append_to_response=videos,credits`;
    const details$ = this.http.get<Omit<TvShowDetails, 'media_type'>>(url).pipe(
        map(tvShow => ({ ...tvShow, media_type: 'tv' as const })),
        shareReplay(1)
    );
    this.tvShowDetailsCache.set(tvId, details$);
    return details$;
  }
  
  getSeasonDetails(tvId: number, seasonNumber: number): Observable<SeasonDetails> {
    const url = `${this.BASE_URL}/tv/${tvId}/season/${seasonNumber}?api_key=${this.API_KEY}`;
    return this.http.get<SeasonDetails>(url);
  }

  getMovieRecommendations(movieId: number): Observable<MediaType[]> {
    const url = `${this.BASE_URL}/movie/${movieId}/recommendations?api_key=${this.API_KEY}`;
    return this.http.get<{ results: Omit<Movie, 'media_type'>[] }>(url).pipe(
      map(response => response.results.map(r => ({ ...r, media_type: 'movie' })))
    );
  }

  getTvShowRecommendations(tvId: number): Observable<MediaType[]> {
    const url = `${this.BASE_URL}/tv/${tvId}/recommendations?api_key=${this.API_KEY}`;
    return this.http.get<{ results: Omit<TvShow, 'media_type'>[] }>(url).pipe(
      map(response => response.results.map(r => ({ ...r, media_type: 'tv' })))
    );
  }

  getRecommendationsForMedia(media: MediaType): Observable<MediaType[]> {
    if (media.media_type === 'movie') {
      return this.getMovieRecommendations(media.id);
    } else {
      return this.getTvShowRecommendations(media.id);
    }
  }

  getPopularNetworks(): Observable<GroupedNetworks> {
    if (this.popularNetworksCache$) {
      return this.popularNetworksCache$;
    }

    const popularNetworkIds = new Set([213, 49, 2739, 1024, 453, 2552, 3353]); // Netflix, HBO, Disney+, Amazon, Hulu, Apple TV+, Peacock
    
    // 1. Directly fetch popular networks to guarantee their inclusion
    const popularNetworkRequests = Array.from(popularNetworkIds).map(id => 
        this.getNetworkDetails(id).pipe(catchError(() => of(null))) // return null if a network fails to load
    );

    // 2. Discover other networks from popular shows
    const pageRequests = [1, 2, 3, 4, 5].map(page =>
      this.http.get<{ results: TvShow[] }>(`${this.BASE_URL}/tv/popular?api_key=${this.API_KEY}&page=${page}`)
    );

    const discoveredNetworks$ = forkJoin(pageRequests).pipe(
      map(responses => responses.flatMap(response => response.results)),
      switchMap(allShows => {
        // Fetch details, but ignore errors for individual shows
        const detailRequests = allShows.map(tv => this.getTvShowDetails(tv.id).pipe(catchError(() => of(null))));
        return forkJoin(detailRequests);
      }),
      map(detailedShows => {
        // Filter out nulls from failed requests
        const validShows = detailedShows.filter((d): d is TvShowDetails => d !== null);
        const networks = validShows.flatMap(show => show.networks || []);
        // Return a unique list of discovered networks
        return Array.from(new Map(networks.map((n: Network) => [n.id, n])).values());
      })
    );

    this.popularNetworksCache$ = forkJoin({
        guaranteedPopular: forkJoin(popularNetworkRequests),
        discovered: discoveredNetworks$
    }).pipe(
      map(({ guaranteedPopular, discovered }) => {
        const validPopularNetworks = guaranteedPopular.filter((n): n is Network => n !== null);
        
        // Combine and de-duplicate, prioritizing networks with logos
        const allNetworksMap = new Map<number, Network>();
        [...validPopularNetworks, ...discovered].forEach(network => {
            if (network.logo_path) {
                allNetworksMap.set(network.id, network);
            }
        });

        const uniqueNetworksWithLogos = Array.from(allNetworksMap.values());
        
        // Group into popular and other
        const popular = uniqueNetworksWithLogos.filter((n: Network) => popularNetworkIds.has(n.id));
        const other = uniqueNetworksWithLogos.filter((n: Network) => !popularNetworkIds.has(n.id));

        // Sort both groups alphabetically
        popular.sort((a: Network, b: Network) => a.name.localeCompare(b.name));
        other.sort((a: Network, b: Network) => a.name.localeCompare(b.name));
        
        return { popular, other };
      }),
      shareReplay(1)
    );
    return this.popularNetworksCache$;
  }

  getPopularMovieStudios(): Observable<GroupedProductionCompanies> {
    if (this.popularMovieStudiosCache$) {
      return this.popularMovieStudiosCache$;
    }
    const popularStudioIds = new Set([174, 2, 33, 4, 5, 420, 3, 1]); // Warner, Disney, Universal, Paramount, Columbia, Marvel, Pixar, Lucasfilm
    const pageRequests = [1, 2, 3, 4, 5].map(page =>
      this.http.get<{ results: Movie[] }>(`${this.BASE_URL}/movie/popular?api_key=${this.API_KEY}&page=${page}`)
    );

    this.popularMovieStudiosCache$ = forkJoin(pageRequests).pipe(
      map(responses => responses.flatMap(response => response.results)),
      switchMap(allMovies => {
        const detailRequests = allMovies.map(movie => this.getMovieDetails(movie.id));
        return forkJoin(detailRequests);
      }),
      map(detailedMovies => {
        const companies = detailedMovies.flatMap(movie => movie.production_companies || []);
        const uniqueCompanies = Array.from(new Map(companies.map(c => [c.id, c])).values());
        const withLogos = uniqueCompanies.filter((c: ProductionCompany) => c.logo_path);

        const popular = withLogos.filter((c: ProductionCompany) => popularStudioIds.has(c.id));
        const other = withLogos.filter((c: ProductionCompany) => !popularStudioIds.has(c.id));

        popular.sort((a: ProductionCompany, b: ProductionCompany) => a.name.localeCompare(b.name));
        other.sort((a: ProductionCompany, b: ProductionCompany) => a.name.localeCompare(b.name));
        
        return { popular, other };
      }),
      shareReplay(1)
    );
    return this.popularMovieStudiosCache$;
  }

  getPopularAnimeStudios(): Observable<GroupedProductionCompanies> {
    if (this.popularAnimeStudiosCache$) {
      return this.popularAnimeStudiosCache$;
    }
    const popularStudioIds = new Set([10342, 5542, 91409, 4323, 4141, 3391, 9557, 1258, 529, 537, 2289, 11018]); // Ghibli, Toei, MAPPA, ufotable, Bones, Madhouse, Wit, Sunrise, Production I.G, Kyoto Animation, A-1 Pictures, CoMix Wave Films
    const pageRequests = [1, 2, 3, 4, 5].map(page =>
      this.http.get<{ results: Movie[] }>(`${this.BASE_URL}/discover/movie?api_key=${this.API_KEY}&with_genres=16&with_original_language=ja&sort_by=popularity.desc&page=${page}`)
    );

    this.popularAnimeStudiosCache$ = forkJoin(pageRequests).pipe(
      map(responses => responses.flatMap(response => response.results)),
      switchMap(allAnimes => {
        const detailRequests = allAnimes.map(anime => this.getMovieDetails(anime.id));
        return forkJoin(detailRequests);
      }),
      map(detailedAnimes => {
        const companies = detailedAnimes.flatMap(anime => anime.production_companies || []);
        const uniqueCompanies = Array.from(new Map(companies.map(c => [c.id, c])).values());
        const withLogos = uniqueCompanies.filter((c: ProductionCompany) => c.logo_path);

        const popular = withLogos.filter((c: ProductionCompany) => popularStudioIds.has(c.id));
        const other = withLogos.filter((c: ProductionCompany) => !popularStudioIds.has(c.id));

        popular.sort((a: ProductionCompany, b: ProductionCompany) => a.name.localeCompare(b.name));
        other.sort((a: ProductionCompany, b: ProductionCompany) => a.name.localeCompare(b.name));
        
        return { popular, other };
      }),
      shareReplay(1)
    );
    return this.popularAnimeStudiosCache$;
  }

  getNetworkDetails(networkId: number): Observable<Network> {
      const url = `${this.BASE_URL}/network/${networkId}?api_key=${this.API_KEY}`;
      return this.http.get<Network>(url);
  }

  getCompanyDetails(companyId: number): Observable<ProductionCompany> {
    const url = `${this.BASE_URL}/company/${companyId}?api_key=${this.API_KEY}`;
    return this.http.get<ProductionCompany>(url);
  }

  getTvShowsByNetwork(networkId: number, page: number = 1, sortBy = 'popularity.desc', year?: number, minRating?: number): Observable<{ results: MediaType[], total_pages: number }> {
    return this.discoverMedia({
      type: 'tv',
      page,
      sort_by: sortBy,
      with_network: networkId,
      first_air_date_year: year,
      vote_average_gte: minRating
    });
  }

  getMoviesByCompany(companyId: number, page: number = 1, sortBy = 'popularity.desc', year?: number, minRating?: number): Observable<{ results: MediaType[], total_pages: number }> {
    return this.discoverMedia({
      type: 'movie',
      page,
      sort_by: sortBy,
      with_company: companyId,
      primary_release_year: year,
      vote_average_gte: minRating
    });
  }

  getPopularOnNetflix(): Observable<MediaType[]> {
    const netflixId = 213;
    return this.getTvShowsByNetwork(netflixId, 1, 'popularity.desc').pipe(
      map(response => response.results)
    );
  }

  getCollectionDetails(id: number): Observable<Collection> {
    const url = `${this.BASE_URL}/collection/${id}?api_key=${this.API_KEY}`;
    return this.http.get<{ parts: Omit<Movie, 'media_type'>[] } & Omit<Collection, 'parts'>>(url).pipe(
      map(collection => ({
        ...collection,
        parts: collection.parts.map(p => ({ ...p, media_type: 'movie' as const }))
      }))
    );
  }
}