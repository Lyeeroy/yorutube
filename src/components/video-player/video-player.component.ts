import {
  Component,
  ChangeDetectionStrategy,
  output,
  effect,
  signal,
  inject,
  computed,
  input,
  DestroyRef,
  OnInit,
  OnDestroy,
  untracked,
} from "@angular/core";
import {
  MediaType,
  Movie,
  TvShow,
  TvShowDetails,
  Episode,
  SubscribableChannel,
  MovieDetails,
  Video,
} from "../../models/movie.model";
import { CommonModule, NgOptimizedImage } from "@angular/common";
import { VideoInfoComponent } from "../video-info/video-info.component";
import { RelatedVideosComponent } from "../related-videos/related-videos.component";
import { MovieService } from "../../services/movie.service";
import { DomSanitizer, SafeResourceUrl } from "@angular/platform-browser";
import { toSignal, takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { NavigationService } from "../../services/navigation.service";
import { Observable, of } from "rxjs";
import { map } from "rxjs/operators";
import { HistoryService } from "../../services/history.service";
import { PlaylistService } from "../../services/playlist.service";
import { Playlist } from "../../models/playlist.model";
import { VideoPlayerPlaylistComponent } from "../video-player-playlist/video-player-playlist.component";
import { PlayerService, PlayerType } from "../../services/player.service";
import { PlaybackProgressService } from "../../services/playback-progress.service";
import { PlaybackProgress } from "../../models/playback-progress.model";
import { ContinueWatchingService } from "../../services/continue-watching.service";
import { ContinueWatchingItem } from "../../models/continue-watching.model";

const isMovie = (media: MediaType | TvShowDetails): media is Movie =>
  media.media_type === "movie";

interface PlayerEpisodeState {
  season: number;
  episode: number;
}

@Component({
  selector: "app-video-player",
  standalone: true,
  imports: [
    CommonModule,
    VideoInfoComponent,
    RelatedVideosComponent,
    VideoPlayerPlaylistComponent,
    NgOptimizedImage,
  ],
  templateUrl: "./video-player.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VideoPlayerComponent implements OnInit, OnDestroy {
  private movieService = inject(MovieService);
  private sanitizer: DomSanitizer = inject(DomSanitizer);
  private navigationService = inject(NavigationService);
  private historyService = inject(HistoryService);
  private playlistService = inject(PlaylistService);
  private playerService = inject(PlayerService);
  private playbackProgressService = inject(PlaybackProgressService);
  private continueWatchingService = inject(ContinueWatchingService);
  private destroyRef = inject(DestroyRef);

  params = input.required<any>();
  genreMap = toSignal(this.movieService.getCombinedGenreMap(), {
    initialValue: new Map<number, string>(),
  });

  selectedMediaItem = signal<MovieDetails | TvShowDetails | null>(null);
  videoDetails = signal<Video | null>(null);
  loadingTrailer = signal(true);
  currentEpisode = signal<Episode | null>(null);
  playlist = signal<Playlist | null>(null);
  historyAdded = signal(false);
  private messageHandler: ((event: MessageEvent) => void) | null = null;

  // Track the last episode state reported by the player
  private lastPlayerEpisodeState = signal<PlayerEpisodeState | null>(null);

  // Track if we should skip the next player URL update (player already navigated internally)
  private skipNextPlayerUpdate = signal(false);

  // Track if player has started playing (to avoid false episode detection on initial load)
  private playerHasStarted = signal(false);

  private constructedPlayerUrl = signal<string>("about:blank");

  // Track if auto-play next has been triggered for current episode
  private autoPlayNextTriggered = signal(false);

  selectedPlayer = this.playerService.selectedPlayer;

  // Autoplay state
  private autoplay = signal(false);

  currentMediaId = computed(() => this.selectedMediaItem()?.id);

  thumbnailUrl = computed<string | null>(() => {
    const media = this.selectedMediaItem();
    return media?.backdrop_path
      ? `https://image.tmdb.org/t/p/w1280${media.backdrop_path}`
      : null;
  });

  youtubeUrl = computed<string | null>(() => {
    const video = this.videoDetails();
    if (!video) return null;
    const autoplayParam = this.autoplay() ? "?autoplay=1" : "";
    return `https://www.youtube.com/embed/${video.key}${autoplayParam}`;
  });

  videasyUrl = computed<string | null>(() => {
    const media = this.selectedMediaItem();
    if (!media) return null;

    const episode = this.currentEpisode();
    const progressId = episode ? episode.id : media.id;

    const progress = untracked(() =>
      this.playbackProgressService.getProgress(progressId)
    );

    const resumeTime =
      progress && progress.progress > 5 && progress.progress < 95
        ? progress.timestamp
        : 0;

    const queryParams: string[] = [
      "color=FF0000",
      "nextEpisode=true",
      "episodeSelector=true",
    ];

    if (this.playerService.autoNextEnabled()) {
      queryParams.push("autoplayNextEpisode=true");
    }

    if (resumeTime > 5) {
      queryParams.push(`t=${Math.floor(resumeTime)}`);
    }
    if (this.autoplay()) {
      queryParams.push("autoplay=1");
    }

    const queryString = queryParams.join("&");

    let baseUrl: string;
    if (media.media_type === "movie") {
      baseUrl = `https://player.videasy.net/movie/${media.id}`;
    } else if (media.media_type === "tv" && episode) {
      baseUrl = `https://player.videasy.net/tv/${media.id}/${episode.season_number}/${episode.episode_number}`;
    } else if (media.media_type === "tv") {
      const tvDetails = media as TvShowDetails;
      const firstSeason =
        tvDetails.seasons.find((s) => s.season_number > 0) ||
        tvDetails.seasons[0];
      if (firstSeason) {
        baseUrl = `https://player.videasy.net/tv/${media.id}/${firstSeason.season_number}/1`;
      } else {
        return null;
      }
    } else {
      return null;
    }

    return `${baseUrl}?${queryString}`;
  });

  vidlinkUrl = computed<string | null>(() => {
    const media = this.selectedMediaItem();
    if (!media) return null;

    const episode = this.currentEpisode();

    const queryParams: string[] = [
      "primaryColor=ff0000",
      "secondaryColor=a2a2a2",
      "iconColor=eefdec",
      "icons=default",
      "player=jw",
      "title=true",
      "poster=true",
    ];

    if (this.playerService.autoNextEnabled()) {
      queryParams.push("nextbutton=true");
    }

    if (this.autoplay()) {
      queryParams.push("autoplay=true");
    }

    const queryString = queryParams.join("&");

    let baseUrl: string;
    if (media.media_type === "movie") {
      baseUrl = `https://vidlink.pro/movie/${media.id}`;
    } else if (media.media_type === "tv" && episode) {
      baseUrl = `https://vidlink.pro/tv/${media.id}/${episode.season_number}/${episode.episode_number}`;
    } else if (media.media_type === "tv") {
      const tvDetails = media as TvShowDetails;
      const firstSeason =
        tvDetails.seasons.find((s) => s.season_number > 0) ||
        tvDetails.seasons[0];
      if (firstSeason) {
        baseUrl = `https://vidlink.pro/tv/${media.id}/${firstSeason.season_number}/1`;
      } else {
        return null;
      }
    } else {
      return null;
    }

    return `${baseUrl}?${queryString}`;
  });

  playerUrl = computed<string | null>(() => {
    switch (this.selectedPlayer()) {
      case "YouTube":
        return this.youtubeUrl();
      case "VIDEASY":
        return this.videasyUrl();
      case "VIDLINK":
        return this.vidlinkUrl();
      default:
        return null;
    }
  });

  safeConstructedPlayerUrl = computed<SafeResourceUrl>(() => {
    const url = this.constructedPlayerUrl();
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  });

  constructor() {
    // Update the player URL, but only if we're not skipping the update
    effect(() => {
      const url = this.playerUrl();
      if (url && !this.skipNextPlayerUpdate()) {
        this.constructedPlayerUrl.set(url);
      } else if (this.skipNextPlayerUpdate()) {
        this.skipNextPlayerUpdate.set(false);
      }
    });

    effect((onCleanup) => {
      const p = this.params();
      if (!p) {
        this.selectedMediaItem.set(null);
        return;
      }
      const { mediaType, id, season, episode, playlistId, autoplay } = p;

      this.autoplay.set(!!autoplay);

      // Reset player state tracking when params change
      this.playerHasStarted.set(false);
      this.lastPlayerEpisodeState.set(null);
      this.autoPlayNextTriggered.set(false);

      const shouldReloadPlayer = !this.skipNextPlayerUpdate();

      if (shouldReloadPlayer) {
        this.constructedPlayerUrl.set("about:blank");
      }

      this.videoDetails.set(null);
      this.historyAdded.set(false);

      if (playlistId) {
        this.playlist.set(
          this.playlistService.getPlaylistById(playlistId) || null
        );
      } else {
        this.playlist.set(null);
      }

      if (!id || !mediaType) {
        this.selectedMediaItem.set(null);
        return;
      }

      this.currentEpisode.set(null);

      const media$: Observable<MovieDetails | TvShowDetails> =
        mediaType === "movie"
          ? this.movieService.getMovieDetails(+id)
          : this.movieService.getTvShowDetails(+id);

      const sub = media$.subscribe({
        next: (details) => {
          this.selectedMediaItem.set(details);
          if (!details) return;

          if (details.media_type === "tv" && "seasons" in details) {
            const tvDetails = details as TvShowDetails;
            if (season && episode) {
              this.loadEpisodeTrailer(tvDetails, +season, +episode);
            } else {
              const firstSeason =
                tvDetails.seasons.find((s) => s.season_number > 0) ||
                tvDetails.seasons[0];
              if (firstSeason) {
                this.loadEpisodeTrailer(
                  tvDetails,
                  firstSeason.season_number,
                  1
                );
              } else {
                this.loadMainTrailer(details);
              }
            }
          } else {
            this.loadMainTrailer(details);
          }
        },
        error: (err) => {
          console.error("Failed to load media details:", err);
          this.selectedMediaItem.set(null);
        },
      });

      onCleanup(() => sub.unsubscribe());
    });
  }

  ngOnInit(): void {
    this.setupPostMessageHandler();
  }

  ngOnDestroy(): void {
    if (this.messageHandler && typeof window !== "undefined") {
      window.removeEventListener("message", this.messageHandler);
    }
  }

  private setupPostMessageHandler(): void {
    if (typeof window === "undefined") return;

    this.messageHandler = (event: MessageEvent) => {
      const allowedOrigins = [
        "https://player.videasy.net",
        "https://vidlink.pro",
      ];
      if (!allowedOrigins.includes(event.origin)) return;

      let payload: any;
      try {
        payload =
          typeof event.data === "string" ? JSON.parse(event.data) : event.data;
      } catch {
        return;
      }

      if (
        (payload?.type === "PLAYER_EVENT" || payload?.type === "MEDIA_DATA") &&
        payload.data
      ) {
        const d = payload.data;
        const media = this.selectedMediaItem();
        if (!media) return;

        // Handle player start and progress
        if (payload.type === "PLAYER_EVENT") {
          if (
            d.event === "play" ||
            (d.event === "timeupdate" && d.currentTime > 0)
          ) {
            if (!this.playerHasStarted()) {
              this.playerHasStarted.set(true);
            }
          }
          if (
            d.event === "timeupdate" &&
            typeof d.duration === "number" &&
            d.duration > 0
          ) {
            this.handlePlaybackProgress(d, media);
          }
        } else if (
          payload.type === "MEDIA_DATA" &&
          event.origin === "https://vidlink.pro"
        ) {
          if (!this.playerHasStarted()) {
            this.playerHasStarted.set(true);
          }
        }

        // Normalize and handle episode changes from different players
        if (media.media_type !== "tv") return;

        let episodeChangeData: { season: number; episode: number } | null =
          null;

        if (
          event.origin === "https://player.videasy.net" &&
          typeof d.season === "number" &&
          typeof d.episode === "number"
        ) {
          episodeChangeData = { season: d.season, episode: d.episode };
        } else if (event.origin === "https://vidlink.pro") {
          if (d.season !== undefined && d.episode !== undefined) {
            const season = parseInt(String(d.season), 10);
            const episode = parseInt(String(d.episode), 10) + 1;
            if (!isNaN(season) && !isNaN(episode)) {
              episodeChangeData = { season, episode };
            }
          }
        }

        if (this.playerHasStarted() && episodeChangeData) {
          this.handleEpisodeChangeDetection(
            episodeChangeData,
            media as TvShowDetails
          );
        }
      }
    };

    window.addEventListener("message", this.messageHandler);
  }

  private handlePlaybackProgress(
    data: any,
    media: MovieDetails | TvShowDetails
  ): void {
    const progressPercent = (data.currentTime / data.duration) * 100;

    const progressData: Omit<PlaybackProgress, "updatedAt"> = {
      progress: progressPercent,
      timestamp: data.currentTime,
      duration: data.duration,
    };

    const episode = this.currentEpisode();
    const progressId = episode ? episode.id : media.id;
    this.playbackProgressService.updateProgress(progressId, progressData);

    // Add to history after significant playback (30 seconds or 5% progress)
    if (
      !this.historyAdded() &&
      (data.currentTime > 30 || progressPercent > 5)
    ) {
      this.historyService.addToHistory(
        media,
        this.currentEpisode() || undefined
      );
      this.historyAdded.set(true);
    }
    
    // Update continue watching list based on current progress
    if (progressPercent >= 5 && progressPercent < 95) {
      const continueWatchingItem: Omit<ContinueWatchingItem, 'updatedAt'> = {
        id: media.id,
        media: media,
        episode: episode || undefined,
      };
      this.continueWatchingService.addItem(continueWatchingItem);
    } else if (progressPercent >= 95) {
      this.continueWatchingService.removeItem(media.id);
    }


    // Auto-play next episode for vidlink when video completes
    if (
      this.selectedPlayer() === "VIDLINK" &&
      this.playerService.autoNextEnabled() &&
      media.media_type === "tv" &&
      !this.autoPlayNextTriggered() &&
      progressPercent >= 100
    ) {
      this.autoPlayNextTriggered.set(true);
      this.playNextEpisode(media as TvShowDetails);
    }
  }

  private handleEpisodeChangeDetection(
    data: { season: number; episode: number },
    media: TvShowDetails
  ): void {
    const playerEpisode: PlayerEpisodeState = {
      season: data.season,
      episode: data.episode,
    };

    const lastPlayerState = this.lastPlayerEpisodeState();

    const hasPlayerChangedEpisode =
      !lastPlayerState ||
      lastPlayerState.season !== playerEpisode.season ||
      lastPlayerState.episode !== playerEpisode.episode;

    if (hasPlayerChangedEpisode) {
      this.lastPlayerEpisodeState.set(playerEpisode);

      // This is a crucial fix: update the application's navigation state
      // to match the player's internal state without reloading the iframe.
      // This prevents issues when the player's internal "next" button is used.
      this.skipNextPlayerUpdate.set(true);
      this.navigationService.navigateTo("watch", {
        mediaType: "tv",
        id: media.id,
        season: playerEpisode.season,
        episode: playerEpisode.episode,
        playlistId: this.playlist()?.id,
        autoplay: true, // Auto-next implies we want to autoplay the new content
      });

      this.movieService
        .getSeasonDetails(media.id, playerEpisode.season)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((seasonDetails) => {
          const newEpisode = seasonDetails.episodes.find(
            (e) => e.episode_number === playerEpisode.episode
          );

          if (newEpisode) {
            this.currentEpisode.set(newEpisode);
            this.historyAdded.set(false);
            // Reset the auto-play trigger for the new episode, allowing VIDLINK's
            // auto-play to function correctly for the newly loaded episode.
            this.autoPlayNextTriggered.set(false);
          }
        });
    }
  }

  private playNextEpisode(tvShow: TvShowDetails): void {
    const currentEp = this.currentEpisode();
    if (!currentEp) return;

    // Get current season details to find next episode
    this.movieService
      .getSeasonDetails(tvShow.id, currentEp.season_number)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((seasonDetails) => {
        const episodes = seasonDetails.episodes || [];
        const currentIndex = episodes.findIndex(
          (e) => e.episode_number === currentEp.episode_number
        );

        if (currentIndex === -1) {
          // Failsafe: if current episode not found, maybe it was removed.
          // Don't auto-play to avoid unexpected behavior.
          console.warn('Could not find current episode in season details. Auto-play cancelled.');
          return;
        }

        if (currentIndex < episodes.length - 1) {
          // Next episode exists in the current season.
          const nextEpisode = episodes[currentIndex + 1];
          this.navigateToEpisode(
            tvShow.id,
            currentEp.season_number,
            nextEpisode.episode_number
          );
        } else {
          // This is the last episode of the current season. Try to find the next season.
          const currentSeasonIndex = tvShow.seasons.findIndex(s => s.season_number === currentEp.season_number);
          
          if (currentSeasonIndex > -1) {
             // Search for the next season with episodes, skipping empty seasons.
             for (let i = currentSeasonIndex + 1; i < tvShow.seasons.length; i++) {
                const nextSeasonObj = tvShow.seasons[i];
                // Also check for season_number > 0 to skip "specials" seasons
                if (nextSeasonObj && nextSeasonObj.episode_count > 0 && nextSeasonObj.season_number > 0) {
                    this.navigateToEpisode(tvShow.id, nextSeasonObj.season_number, 1);
                    return; // Found and navigated, so exit.
                }
             }
          }
          // If no next season/episode is found, do nothing (end of series).
        }
      });
  }

  private navigateToEpisode(
    showId: number,
    season: number,
    episode: number
  ): void {
    this.skipNextPlayerUpdate.set(false);

    this.navigationService.navigateTo("watch", {
      mediaType: "tv",
      id: showId,
      season: season,
      episode: episode,
      playlistId: this.playlist()?.id,
      autoplay: true,
    });
  }

  private loadMainTrailer(media: MediaType): void {
    this.loadingTrailer.set(true);

    const videoRequest$ = isMovie(media)
      ? this.movieService.getMovieVideos(media.id)
      : this.movieService.getTvShowVideos(media.id);

    videoRequest$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (response) => {
        const trailer = response.results.find(
          (video) => video.site === "YouTube" && video.type === "Trailer"
        );
        this.videoDetails.set(trailer ?? null);
        this.loadingTrailer.set(false);
      },
      error: () => this.loadingTrailer.set(false),
    });
  }

  private loadEpisodeTrailer(
    tvShow: TvShowDetails,
    seasonNumber: number,
    episodeNumber: number
  ): void {
    this.loadingTrailer.set(true);

    this.movieService
      .getSeasonDetails(tvShow.id, seasonNumber)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((seasonDetails) => {
        const episode = seasonDetails.episodes.find(
          (e) => e.episode_number === episodeNumber
        );

        this.currentEpisode.set(episode || null);

        if (episode) {
          this.movieService
            .getEpisodeVideos(tvShow.id, seasonNumber, episode.episode_number)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
              next: (response) => {
                const trailer =
                  response.results.find(
                    (v) => v.site === "YouTube" && v.type === "Trailer"
                  ) ?? response.results[0];
                this.videoDetails.set(trailer ?? null);
                this.loadingTrailer.set(false);
              },
              error: () => this.loadingTrailer.set(false),
            });
        } else {
          this.loadingTrailer.set(false);
        }
      });
  }

  onEpisodeSelected(data: { episode: Episode; seasonNumber: number }): void {
    const tvShow = this.selectedMediaItem();
    if (tvShow?.media_type !== "tv") return;

    this.skipNextPlayerUpdate.set(false);

    this.navigationService.navigateTo("watch", {
      mediaType: "tv",
      id: tvShow.id,
      season: data.seasonNumber,
      episode: data.episode.episode_number,
      playlistId: this.playlist()?.id,
    });
  }

  onSelectMedia(media: MediaType): void {
    this.skipNextPlayerUpdate.set(false);

    this.navigationService.navigateTo("watch", {
      mediaType: media.media_type,
      id: media.id,
      playlistId: this.playlist()?.id,
      autoplay: true,
    });
  }

  onRefreshPlayer(): void {
    const currentUrl = this.playerUrl();
    if (currentUrl) {
      this.constructedPlayerUrl.set("about:blank");
      setTimeout(() => {
        this.constructedPlayerUrl.set(currentUrl);
      }, 50);
    }
  }
}
