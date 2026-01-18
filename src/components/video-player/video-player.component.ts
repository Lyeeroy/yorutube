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
  HostListener,
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
import {
  toSignal,
  takeUntilDestroyed,
  toObservable,
} from "@angular/core/rxjs-interop";
import { NavigationService } from "../../services/navigation.service";
import { Observable, of } from "rxjs";
import { map, switchMap } from "rxjs/operators";
import { HistoryService } from "../../services/history.service";
import { PlaylistService } from "../../services/playlist.service";
import { Playlist } from "../../models/playlist.model";
import { VideoPlayerPlaylistComponent } from "../video-player-playlist/video-player-playlist.component";
import { PlayerService, PlayerType } from "../../services/player.service";
import { PlaybackProgressService } from "../../services/playback-progress.service";
import { PlaybackProgress } from "../../models/playback-progress.model";
import { ContinueWatchingService } from "../../services/continue-watching.service";
import { ContinueWatchingItem } from "../../models/continue-watching.model";
import { PlayerProviderService } from "../../services/player-provider.service";
import { PlayerMessageRouterService } from "../../services/player-message-router.service";
import { ContinueWatchingManagerService } from "../../services/continue-watching-manager.service";
import { PlayerUrlConfig } from "../../models/player-provider.model";

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
  styles: [
    `
      @keyframes fadeIn {
        from {
          opacity: 0;
          transform: translateY(10px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      .animate-fade-in {
        animation: fadeIn 0.3s ease-out forwards;
      }
    `,
  ],
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
  private playerProviderService = inject(PlayerProviderService);
  private playerMessageRouter = inject(PlayerMessageRouterService);
  private continueWatchingManager = inject(ContinueWatchingManagerService);
  private destroyRef = inject(DestroyRef);

  params = input.required<any>();
  genreMap = toSignal(this.movieService.getCombinedGenreMap(), {
    initialValue: new Map<number, string>(),
  });

  selectedMediaItem = signal<MovieDetails | TvShowDetails | null>(null);
  videoDetails = signal<Video | null>(null);
  loadingTrailer = signal(true);
  iframeLoading = signal(false);
  isMaximized = signal(false);
  currentEpisode = signal<Episode | null>(null);
  nextEpisode = signal<Episode | null>(null);

  playlist = computed(() => {
    const p = this.params();
    const id = p?.playlistId;
    if (!id) return null;
    return this.playlistService.getPlaylistById(id) || null;
  });

  historyAdded = signal(false);

  // provider messages are routed through PlayerMessageRouterService

  // Track the last episode state reported by the player
  private lastPlayerEpisodeState = signal<PlayerEpisodeState | null>(null);

  // Track if we should skip iframe updates for a specific media key (avoids reload loops on auto-nav)
  private skipUpdateForMediaKey = signal<string | null>(null);

  // Track if player has started playing (to avoid false episode detection on initial load)
  private playerHasStarted = signal(false);

  // Track if we're in the middle of a user-initiated navigation (to ignore stale player messages)
  private isNavigating = signal(false);

  private constructedPlayerUrl = signal<string>("about:blank");

  // Track if we are currently reloading the player (forcing a blank state)
  private reloading = signal(false);

  // Track if auto-play next has been triggered for current episode
  private autoPlayNextTriggered = signal(false);

  // Track if we've recommended the next episode (at 90% watched)
  private recommendedNextEpisodeSent = signal(false);

  // Track the previous media key to avoid blanking iframe on no-op param syncs
  private previousMediaKey = signal<string | null>(null);

  private previousPlayer = signal<string | null>(null);

  selectedPlayer = this.playerService.selectedPlayer;

  // Autoplay state
  private autoplay = signal(false);

  currentMediaId = computed(() => this.selectedMediaItem()?.id);

  // Debounce counter for progress updates
  private lastProgressUpdateTime = 0;

  // Auto-next visualization signals
  autoNextState = signal<"idle" | "counting_down">("idle");
  autoNextCountdown = signal(5); // 5 seconds countdown
  currentProgressPercent = signal(0);
  nextEpisodeMinimized = signal(false);
  private autoNextTimer: any = null;

  // Computed signal to check if there is a next item available
  hasNextItem = computed(() => {
    const media = this.selectedMediaItem();
    if (!media) return false;

    if (media.media_type === "tv") {
      // For TV shows, we assume there's always a potential next episode unless known otherwise
      return true;
    } else if (media.media_type === "movie") {
      // For movies, only if in a playlist and not the last item
      const playlist = this.playlist();
      if (!playlist || !playlist.items || playlist.items.length === 0)
        return false;

      const currentIndex = playlist.items.findIndex(
        (item) => item.id === media.id,
      );
      return currentIndex !== -1 && currentIndex < playlist.items.length - 1;
    }

    return false;
  });

  showNextEpisodeButton = computed(() => {
    const progress = this.currentProgressPercent();
    const isCountingDown = this.autoNextState() === "counting_down";
    const hasNext = this.hasNextItem();
    const isNavigating = this.isNavigating();
    const nextButtonEnabled = this.playerService.nextButtonEnabled();

    // Show if:
    // 1. Next button setting is ENABLED
    // 2. We have a next item
    // 3. We are NOT currently navigating
    // 4. AND either:
    //    a. Progress is > 90% (pre-show button)
    //    b. OR we are actively counting down (auto-next triggered)
    return (
      nextButtonEnabled &&
      hasNext &&
      !isNavigating &&
      (progress >= 80 || isCountingDown)
    );
  });

  backdropUrl = computed(() => {
    const media = this.selectedMediaItem();
    return media?.backdrop_path
      ? `https://image.tmdb.org/t/p/w1280${media.backdrop_path}`
      : null;
  });

  youtubeUrl = computed<string | null>(() => {
    const video = this.videoDetails();
    if (!video) return null;
    const autoplayParam =
      this.autoplay() || this.playerService.autoplayEnabled()
        ? "?autoplay=1"
        : "?autoplay=0";
    return `https://www.youtube.com/embed/${video.key}${autoplayParam}`;
  });

  playerUrl = computed<string | null>(() => {
    const selectedPlayerId = this.selectedPlayer();

    // YouTube uses trailer, handle separately
    if (selectedPlayerId === "YouTube") {
      return this.youtubeUrl();
    }

    const media = this.selectedMediaItem();
    if (!media) return null;

    const provider = this.playerProviderService.getProvider(selectedPlayerId);
    if (!provider) return null;

    // Use params to determine the episode we're navigating to, not currentEpisode()
    const params = untracked(() => this.params());
    const episode = this.currentEpisode();

    // Determine progressId based on params (source of truth) rather than currentEpisode
    let progressId: number;
    if (
      media.media_type === "tv" &&
      params?.season &&
      params?.episode &&
      episode
    ) {
      if (
        episode.season_number === +params.season &&
        episode.episode_number === +params.episode
      ) {
        progressId = episode.id;
      } else {
        progressId = media.id;
      }
    } else {
      progressId = episode ? episode.id : media.id;
    }

    const progress = untracked(() =>
      this.playbackProgressService.getProgress(progressId),
    );

    const initialStart = untracked(() => this.initialStartAt());

    let resumeTime = 0;
    const currentTime = untracked(() => this.lastKnownPlaybackTime());

    if (
      typeof initialStart === "number" &&
      initialStart > 0 &&
      !untracked(() => this.playerHasStarted()) &&
      currentTime <= 5
    ) {
      resumeTime = initialStart;
    } else if (currentTime > 5) {
      resumeTime = currentTime;
    } else if (progress && progress.progress > 5 && progress.progress < 100) {
      resumeTime = progress.timestamp;
    }

    const config: PlayerUrlConfig = {
      media,
      episode: episode || undefined,
      autoplay: this.autoplay() || this.playerService.autoplayEnabled(),
      autoNext: this.playerService.autoNextEnabled(),
      resumeTime,
    };

    return provider.generateUrl(config);
  });

  safeConstructedPlayerUrl = computed<SafeResourceUrl>(() => {
    const url = this.constructedPlayerUrl();
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  });

  // Timestamp when navigation started, used to filter stale events
  private navigationStartTime = 0;

  constructor() {
    this.playerMessageRouter.start();

    // Update the player URL, filtering out unnecessary reloads
    effect(() => {
      const url = this.playerUrl();
      const reloading = this.reloading();

      if (reloading) return;

      const currentUrl = this.constructedPlayerUrl();

      // Calculate current media key for skip check
      const params = untracked(() => this.params());
      const key = this.getMediaKey(params);
      const skipKey = this.skipUpdateForMediaKey();

      if (skipKey && skipKey === key) {
        // We are intentionally skipping updates for this media state (e.g. auto-navigated)
        return;
      } else if (skipKey) {
        // We moved to a different state, clear the skip flag
        this.skipUpdateForMediaKey.set(null);
      }

      if (url) {
        if (this.shouldUpdatePlayerUrl(currentUrl, url)) {
          this.iframeLoading.set(true);
          this.constructedPlayerUrl.set(url);
        }
      }
    });

    // Clear initialStartAt logic (prevent resume loops)
    effect(() => {
      const startAt = this.initialStartAt();
      const currentTime = this.lastKnownPlaybackTime();
      const playerStarted = this.playerHasStarted();
      const params = this.params();

      if (typeof startAt === "number" && startAt > 60) {
        if (currentTime >= startAt - 60) {
          this.initialStartAt.set(undefined);
          this.removeStartAtFromUrl();
        }
      } else {
        if (playerStarted || currentTime > 5) {
          this.initialStartAt.set(undefined);
          if (params?.startAt) {
            this.removeStartAtFromUrl();
          }
        }
      }
    });

    effect((onCleanup) => {
      const p = this.params();
      const currentPlayer = this.selectedPlayer();

      if (!p) {
        this.selectedMediaItem.set(null);
        return;
      }
      const { mediaType, id, season, episode, autoplay } = p;

      this.autoplay.set(!!autoplay);

      const currentMediaKey = this.getMediaKey(p);
      const prevKey = untracked(() => this.previousMediaKey());
      const isActualMediaChange = prevKey !== currentMediaKey;

      const prevPlayer = untracked(() => this.previousPlayer());
      const isPlayerChange =
        prevPlayer !== null && prevPlayer !== currentPlayer;

      let isForcedRefresh = false;

      if (isActualMediaChange || isPlayerChange) {
        if (isPlayerChange && !isActualMediaChange) {
          const currentTime = untracked(() => this.lastKnownPlaybackTime());
          if (currentTime > 5) {
            this.initialStartAt.set(currentTime);
            this.lastProcessedStartAt.set(currentTime);
          }
        }

        this.playerHasStarted.set(false);
        this.lastPlayerEpisodeState.set(null);
        this.autoPlayNextTriggered.set(false);
        this.recommendedNextEpisodeSent.set(false);
        this.lastKnownPlaybackTime.set(0);
        this.lastProgressUpdateTime = 0;
        this.previousMediaKey.set(currentMediaKey);
        this.previousPlayer.set(currentPlayer);

        this.currentProgressPercent.set(0);
        this.clearAutoNextTimer();
        this.autoNextState.set("idle");

        this.playerService.unlockAutoNext();
        this.startNavigation();

        if (isActualMediaChange) {
          const startAtVal = p?.startAt ? Number(p.startAt) : undefined;
          this.initialStartAt.set(startAtVal);
          this.lastProcessedStartAt.set(startAtVal);
        }
      } else if (p?.startAt) {
        const startAtVal = Number(p.startAt);
        const lastProcessed = untracked(() => this.lastProcessedStartAt());

        if (lastProcessed !== startAtVal) {
          this.initialStartAt.set(startAtVal);
          this.lastProcessedStartAt.set(startAtVal);
          isForcedRefresh = true;
          this.playerHasStarted.set(false);
          this.lastKnownPlaybackTime.set(0);
          this.startNavigation();
        }
      }

      // Check skip key to avoid reload if we just auto-navigated
      const skipKey = this.skipUpdateForMediaKey();
      const shouldReloadPlayer = skipKey !== currentMediaKey;

      if (
        shouldReloadPlayer &&
        (isActualMediaChange || isForcedRefresh || isPlayerChange)
      ) {
        this.reloading.set(true);
        this.constructedPlayerUrl.set("");
        setTimeout(() => {
          this.reloading.set(false);
        }, 100);
      }

      this.videoDetails.set(null);
      this.historyAdded.set(false);

      if (!id || !mediaType) {
        this.selectedMediaItem.set(null);
        return;
      }

      if (mediaType === "tv" && season && episode) {
        const expectedEpisode: Partial<Episode> = {
          season_number: +season,
          episode_number: +episode,
          id: 0,
        };
        this.currentEpisode.set(expectedEpisode as Episode);

        this.lastPlayerEpisodeState.set({
          season: +season,
          episode: +episode,
        });
      } else {
        this.currentEpisode.set(null);
      }

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
                  1,
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

    toObservable(this.currentEpisode)
      .pipe(
        takeUntilDestroyed(),
        switchMap((currentEp) => {
          const media = this.selectedMediaItem();
          if (!currentEp || !media || media.media_type !== "tv") {
            return of(null);
          }
          return this.fetchNextEpisode(media as TvShowDetails, currentEp);
        }),
      )
      .subscribe((nextEp) => this.nextEpisode.set(nextEp));
  }

  ngOnInit(): void {
    this.playerMessageRouter.start();
    this.playerMessageRouter
      .onMessage()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((routed) => {
        const media = this.selectedMediaItem();
        if (!media) return;

        const result = routed.provider
          ? routed.provider.handleMessage(
              routed.raw.data ?? routed.raw,
              this.currentEpisode(),
            )
          : undefined;

        const routedEventName =
          routed.raw?.event ?? (routed.raw?.data && routed.raw?.data.event);

        const msgSeason =
          result?.episodeChange?.season ??
          routed.raw?.season ??
          routed.raw?.data?.season;
        const msgEpisode =
          result?.episodeChange?.episode ??
          routed.raw?.episode ??
          routed.raw?.data?.episode;

        const currentEp = untracked(() => this.currentEpisode());
        const isMetadataMismatch =
          media.media_type === "tv" &&
          msgSeason !== undefined &&
          msgEpisode !== undefined &&
          currentEp &&
          (msgSeason !== currentEp.season_number ||
            msgEpisode !== currentEp.episode_number);

        const isStaleTime = result?.playbackProgress
          ? this.isStalePlaybackEvent(result.playbackProgress.currentTime)
          : false;

        if (this.isNavigating()) {
          const isRoutineEvent = [
            "timeupdate",
            "time",
            "seeking",
            "seeked",
          ].includes(routedEventName);
          if (isMetadataMismatch || (isRoutineEvent && isStaleTime)) {
            return;
          }
        }

        if (result?.playerStarted && !this.playerHasStarted()) {
          this.playerHasStarted.set(true);
          this.iframeLoading.set(false);
        }

        if (result?.playbackProgress && !isMetadataMismatch) {
          if (this.iframeLoading()) {
            this.iframeLoading.set(false);
          }
          this.handlePlaybackProgress(result.playbackProgress, media);
        }

        if (media.media_type === "tv" && this.playerHasStarted()) {
          let season: number | undefined;
          let episode: number | undefined;

          if (result?.episodeChange) {
            season = result.episodeChange.season;
            episode = result.episodeChange.episode;
          } else if (
            typeof routed.raw?.season === "number" &&
            typeof routed.raw?.episode === "number"
          ) {
            season = routed.raw.season;
            episode = routed.raw.episode;
          } else if (
            typeof routed.raw?.data?.season === "number" &&
            typeof routed.raw?.data?.episode === "number"
          ) {
            season = routed.raw.data.season;
            episode = routed.raw.data.episode;
          }

          if (
            season !== undefined &&
            episode !== undefined &&
            !isNaN(season) &&
            !isNaN(episode)
          ) {
            this.syncCurrentEpisodeFromPlayerData(
              { season, episode },
              media as TvShowDetails,
            );

            const currentParams = untracked(() => this.params());
            const urlNeedsUpdate =
              currentParams?.season !== season ||
              currentParams?.episode !== episode;

            if (
              urlNeedsUpdate &&
              this.canProcessEpisodeChange(routedEventName)
            ) {
              this.handleEpisodeChangeDetection(
                { season, episode },
                media as TvShowDetails,
              );
            }
          }
        }
      });
  }

  ngOnDestroy(): void {
    this.playerMessageRouter.stop();
    this.clearAutoNextTimer();
  }

  private lastKnownPlaybackTime = signal(0);
  currentPlaybackTime = computed(() => this.lastKnownPlaybackTime());
  private initialStartAt = signal<number | undefined>(undefined);
  private lastProcessedStartAt = signal<number | undefined>(undefined);

  private readonly PLAYBACK_THRESHOLD_SECONDS = 30;
  private readonly AUTO_NEXT_PRELOAD_PERCENT = 90;
  private readonly AUTO_NEXT_COMPLETE_PERCENT = 95;
  private readonly STALE_EVENT_THRESHOLD_MS = 10000;
  private readonly STALE_EVENT_TIME_DIFF = 10;
  private readonly SEEK_RESET_THRESHOLD_PERCENT = 10;
  private readonly MIN_PLAYBACK_FOR_RESET = 5;

  private getMediaKey(params: any): string {
    return `${params.mediaType}:${params.id}:${params.season ?? ""}:${params.episode ?? ""}`;
  }

  private shouldUpdatePlayerUrl(currentUrl: string, newUrl: string): boolean {
    if (!currentUrl || currentUrl === "about:blank") return true;
    if (!newUrl) return true;
    if (currentUrl === newUrl) return false;

    try {
      const current = new URL(currentUrl);
      const next = new URL(newUrl);

      // Different providers or paths -> Update
      if (
        current.origin !== next.origin ||
        current.pathname !== next.pathname
      ) {
        return true;
      }

      // Check critical params that define content identity
      // For seasons/episodes which might be in query for some providers
      const criticalKeys = ["season", "episode", "id", "tmdb", "imdb"];
      for (const key of criticalKeys) {
        if (current.searchParams.get(key) !== next.searchParams.get(key)) {
          return true;
        }
      }

      // If path matches and critical identity params match,
      // differences in startAt, autoplay, etc. are not worth reloading the iframe for
      // if it is already playing the correct content.
      return false;
    } catch (e) {
      return true; // Safe fallback
    }
  }

  private handlePlaybackProgress(
    progressData: {
      currentTime: number;
      duration: number;
      progressPercent: number;
    },
    media: MovieDetails | TvShowDetails,
  ): void {
    const { currentTime, duration, progressPercent } = progressData;

    if (this.isStalePlaybackEvent(currentTime)) {
      return;
    }

    if (typeof currentTime === "number" && currentTime > 0) {
      this.lastKnownPlaybackTime.set(currentTime);

      if (currentTime >= this.MIN_PLAYBACK_FOR_RESET && this.isNavigating()) {
        const startAt = this.initialStartAt() || 0;
        const isNearStartAt =
          Math.abs(currentTime - startAt) < this.STALE_EVENT_TIME_DIFF;
        const timeSinceNav = Date.now() - this.navigationStartTime;
        const hasPlayedLongEnough =
          timeSinceNav > this.STALE_EVENT_THRESHOLD_MS;

        if (isNearStartAt || hasPlayedLongEnough) {
          this.isNavigating.set(false);
          this.playerService.unlockAutoNext();
        }
      }
    }

    const episode = this.currentEpisode();
    const progressId = episode ? episode.id : media.id;

    const now = Date.now();
    const shouldUpdateProgress = now - this.lastProgressUpdateTime >= 1000;

    const expectedStart = untracked(() => this.initialStartAt());
    const isFailedResume =
      typeof expectedStart === "number" &&
      expectedStart > 60 &&
      currentTime < expectedStart - 60 &&
      currentTime < 15;

    if (shouldUpdateProgress && !isFailedResume) {
      this.lastProgressUpdateTime = now;

      const playbackData: Omit<PlaybackProgress, "updatedAt"> = {
        progress: progressPercent,
        timestamp: currentTime,
        duration: duration,
      };

      this.playbackProgressService.updateProgress(progressId, playbackData);
    }

    if (
      !this.historyAdded() &&
      (currentTime > this.PLAYBACK_THRESHOLD_SECONDS || progressPercent > 5)
    ) {
      this.historyService.addToHistory(
        media,
        this.currentEpisode() || undefined,
      );
      this.historyAdded.set(true);
    }

    if (
      !this.historyService.isPaused() &&
      progressPercent >= 5 &&
      progressPercent < this.AUTO_NEXT_COMPLETE_PERCENT
    ) {
      const continueWatchingItem: Omit<ContinueWatchingItem, "updatedAt"> = {
        id: media.id,
        media: media,
        episode: episode || undefined,
      };
      this.continueWatchingService.addItem(continueWatchingItem);
    } else if (progressPercent >= this.AUTO_NEXT_COMPLETE_PERCENT) {
      this.continueWatchingManager.handleCompletePlayback(
        media,
        this.currentEpisode(),
        this.playlist()?.id,
      );
    }

    this.currentProgressPercent.set(progressPercent);

    if (
      media.media_type === "tv" &&
      !this.recommendedNextEpisodeSent() &&
      progressPercent >= this.AUTO_NEXT_PRELOAD_PERCENT &&
      progressPercent < this.AUTO_NEXT_COMPLETE_PERCENT
    ) {
      this.recommendedNextEpisodeSent.set(true);
      this.continueWatchingManager.maybeRecommendNextEpisode(
        media as TvShowDetails,
        episode || undefined,
        this.playlist()?.id,
      );
    }

    this.checkAndTriggerAutoNext(progressPercent, currentTime, media);
  }

  private isStalePlaybackEvent(currentTime: number): boolean {
    if (this.isNavigating()) {
      const startAt = this.initialStartAt() || 0;
      const timeSinceNav = Date.now() - this.navigationStartTime;
      const isTimeMismatch =
        Math.abs(currentTime - startAt) > this.STALE_EVENT_TIME_DIFF;

      if (timeSinceNav < this.STALE_EVENT_THRESHOLD_MS && isTimeMismatch) {
        return true;
      }
    }
    return false;
  }

  private startNavigation(): void {
    this.isNavigating.set(true);
    this.navigationStartTime = Date.now();
    this.clearAutoNextTimer();
    this.autoNextState.set("idle");
  }

  private checkAndTriggerAutoNext(
    progressPercent: number,
    currentTime: number,
    media: MovieDetails | TvShowDetails,
  ): void {
    const provider = this.playerProviderService.getProvider(
      this.selectedPlayer(),
    );

    const autoNextEnabled = this.playerService.autoNextEnabled();
    const playerHasStarted = this.playerHasStarted();
    const autoPlayNextTriggered = this.autoPlayNextTriggered();
    const hasNextItem = this.hasNextItem();
    const threshold = this.playerService.autoNextThreshold();
    const thresholdMet = progressPercent >= threshold;

    if (
      this.autoPlayNextTriggered() &&
      progressPercent > 0 &&
      currentTime > this.MIN_PLAYBACK_FOR_RESET &&
      progressPercent < threshold - this.SEEK_RESET_THRESHOLD_PERCENT
    ) {
      this.autoPlayNextTriggered.set(false);
    }

    if (
      provider?.supportsAutoNext &&
      autoNextEnabled &&
      playerHasStarted &&
      !autoPlayNextTriggered &&
      hasNextItem &&
      !this.isNavigating() &&
      currentTime > this.PLAYBACK_THRESHOLD_SECONDS &&
      thresholdMet &&
      this.playerService.tryLockAutoNext()
    ) {
      this.autoPlayNextTriggered.set(true);
      this.startAutoNextCountdown(media);
    }
  }

  private handleEpisodeChangeDetection(
    data: { season: number; episode: number },
    media: TvShowDetails,
  ): void {
    const playerEpisode: PlayerEpisodeState = {
      season: data.season,
      episode: data.episode,
    };

    const currentParams = untracked(() => this.params());
    const appEpisodeState: PlayerEpisodeState | null =
      currentParams?.season && currentParams?.episode
        ? { season: +currentParams.season, episode: +currentParams.episode }
        : null;

    if (
      appEpisodeState &&
      appEpisodeState.season === playerEpisode.season &&
      appEpisodeState.episode === playerEpisode.episode
    ) {
      const lastPlayerState = this.lastPlayerEpisodeState();
      if (
        !lastPlayerState ||
        lastPlayerState.season !== playerEpisode.season ||
        lastPlayerState.episode !== playerEpisode.episode
      ) {
        this.lastPlayerEpisodeState.set(playerEpisode);
      }
      const currentEp = this.currentEpisode();
      if (currentEp && currentEp.id === 0) {
        this.movieService
          .getSeasonDetails(media.id, playerEpisode.season)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe((seasonDetails) => {
            const matching = seasonDetails.episodes.find(
              (e) => e.episode_number === playerEpisode.episode,
            );
            if (matching) {
              this.currentEpisode.set(matching);
            }
          });
      }
      return;
    }

    const lastPlayerState = this.lastPlayerEpisodeState();
    const hasPlayerChangedEpisode =
      !lastPlayerState ||
      lastPlayerState.season !== playerEpisode.season ||
      lastPlayerState.episode !== playerEpisode.episode;

    if (hasPlayerChangedEpisode) {
      const isSequentialNext =
        appEpisodeState &&
        playerEpisode.season === appEpisodeState.season &&
        playerEpisode.episode === appEpisodeState.episode + 1;

      const userThreshold = this.playerService.autoNextThreshold();
      const provider = this.playerProviderService.getProvider(
        this.selectedPlayer(),
      );

      if (isSequentialNext && !this.playerService.autoNextEnabled()) {
        this.lastPlayerEpisodeState.set(playerEpisode);
        return;
      }

      if (
        isSequentialNext &&
        provider?.supportsAutoNext &&
        this.playerService.autoNextEnabled() &&
        userThreshold < 95
      ) {
        this.lastPlayerEpisodeState.set(playerEpisode);
        return;
      }

      if (!this.playerService.tryLockAutoNext()) {
        this.lastPlayerEpisodeState.set(playerEpisode);
        return;
      }

      this.lastPlayerEpisodeState.set(playerEpisode);
      this.startNavigation();

      // Prevent iframe reloading since player handled it
      // Create the target key for the next episode
      const targetKey = `${media.media_type}:${media.id}:${playerEpisode.season}:${playerEpisode.episode}`;
      this.skipUpdateForMediaKey.set(targetKey);

      this.navigationService.navigateTo("watch", {
        mediaType: "tv",
        id: media.id,
        season: playerEpisode.season,
        episode: playerEpisode.episode,
        playlistId: this.playlist()?.id,
        autoplay: true,
      });

      this.movieService
        .getSeasonDetails(media.id, playerEpisode.season)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((seasonDetails) => {
          const newEpisode = seasonDetails.episodes.find(
            (e) => e.episode_number === playerEpisode.episode,
          );

          if (newEpisode) {
            this.currentEpisode.set(newEpisode);
            this.historyAdded.set(false);
            this.autoPlayNextTriggered.set(false);
          }
        });
    }
  }

  private startAutoNextCountdown(media: MovieDetails | TvShowDetails): void {
    this.autoNextState.set("counting_down");
    this.autoNextCountdown.set(5);

    this.autoNextTimer = setInterval(() => {
      const current = this.autoNextCountdown();
      if (current <= 0) {
        this.executeAutoNext(media);
      } else {
        this.autoNextCountdown.set(current - 1);
      }
    }, 1000);
  }

  toggleNextEpisodeMinimized(): void {
    this.nextEpisodeMinimized.update((v) => !v);
  }

  toggleAutoNext(media: MovieDetails | TvShowDetails): void {
    if (this.autoNextState() === "counting_down") {
      this.cancelAutoNext();
    } else {
      if (this.autoPlayNextTriggered()) {
        const currentProgress = this.currentProgressPercent();
        const threshold = this.playerService.autoNextThreshold();

        if (currentProgress >= threshold) {
          this.startAutoNextCountdown(media);
        } else {
          this.autoPlayNextTriggered.set(false);
          this.playerService.unlockAutoNext();
        }
      } else {
        this.cancelAutoNext();
      }
    }
  }

  private executeAutoNext(media: MovieDetails | TvShowDetails): void {
    this.clearAutoNextTimer();
    this.autoNextState.set("idle");

    if (media.media_type === "tv") {
      this.playNextEpisode(media as TvShowDetails);
    } else if (media.media_type === "movie") {
      const didNavigate = this.tryPlayNextPlaylistItem(media as MovieDetails);
      if (!didNavigate) {
        this.playerService.unlockAutoNext();
      }
    }
  }

  onNextEpisodeClick(): void {
    const media = this.selectedMediaItem();
    if (!media) return;

    if (this.autoNextState() === "counting_down") {
      this.clearAutoNextTimer();
    }

    this.playerService.tryLockAutoNext();
    this.executeAutoNext(media);
  }

  cancelAutoNext(): void {
    this.clearAutoNextTimer();
    this.autoNextState.set("idle");
    this.autoPlayNextTriggered.set(true);
    this.playerService.unlockAutoNext();
  }

  private clearAutoNextTimer(): void {
    if (this.autoNextTimer) {
      clearInterval(this.autoNextTimer);
      this.autoNextTimer = null;
    }
  }

  private syncCurrentEpisodeFromPlayerData(
    data: { season: number; episode: number },
    media: TvShowDetails,
  ): void {
    const currentEp = this.currentEpisode();

    if (
      currentEp &&
      currentEp.id > 0 &&
      currentEp.season_number === data.season &&
      currentEp.episode_number === data.episode
    ) {
      return;
    }

    if (
      !currentEp ||
      currentEp.id === 0 ||
      currentEp.season_number !== data.season ||
      currentEp.episode_number !== data.episode
    ) {
      this.movieService
        .getSeasonDetails(media.id, data.season)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((seasonDetails) => {
          const matchingEpisode = seasonDetails.episodes.find(
            (e) => e.episode_number === data.episode,
          );
          if (matchingEpisode) {
            this.currentEpisode.set(matchingEpisode);
          }
        });
    }
  }

  private canProcessEpisodeChange(eventName?: string): boolean {
    const nonRoutineEvent =
      typeof eventName === "string" &&
      !["timeupdate", "time", "seeking", "seeked"].includes(eventName);

    return (
      this.playerHasStarted() &&
      !this.isNavigating() &&
      (this.lastKnownPlaybackTime() >= 5 || nonRoutineEvent)
    );
  }

  private fetchNextEpisode(
    tvShow: TvShowDetails,
    currentEp: Episode,
  ): Observable<Episode | null> {
    return this.movieService
      .getSeasonDetails(tvShow.id, currentEp.season_number)
      .pipe(
        map((seasonDetails) => {
          const episodes = seasonDetails.episodes || [];
          const currentIndex = episodes.findIndex(
            (e) => e.episode_number === currentEp.episode_number,
          );

          if (currentIndex !== -1 && currentIndex < episodes.length - 1) {
            return episodes[currentIndex + 1];
          }
          return null;
        }),
        switchMap((nextEp) => {
          if (nextEp) return of(nextEp);

          const currentSeasonIndex = tvShow.seasons.findIndex(
            (s) => s.season_number === currentEp.season_number,
          );

          if (currentSeasonIndex > -1) {
            for (
              let i = currentSeasonIndex + 1;
              i < tvShow.seasons.length;
              i++
            ) {
              const nextSeasonObj = tvShow.seasons[i];
              if (
                nextSeasonObj &&
                nextSeasonObj.episode_count > 0 &&
                nextSeasonObj.season_number > 0
              ) {
                return this.movieService
                  .getSeasonDetails(tvShow.id, nextSeasonObj.season_number)
                  .pipe(
                    map((nextSeasonDetails) => {
                      return nextSeasonDetails.episodes.length > 0
                        ? nextSeasonDetails.episodes[0]
                        : null;
                    }),
                  );
              }
            }
          }
          return of(null);
        }),
      );
  }

  private playNextEpisode(tvShow: TvShowDetails): void {
    const currentEp = this.currentEpisode();
    if (!currentEp) {
      this.playerService.unlockAutoNext();
      return;
    }

    this.movieService
      .getSeasonDetails(tvShow.id, currentEp.season_number)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (seasonDetails) => {
          const episodes = seasonDetails.episodes || [];
          const currentIndex = episodes.findIndex(
            (e) => e.episode_number === currentEp.episode_number,
          );

          if (currentIndex === -1) {
            console.warn(
              "Could not find current episode in season details. Auto-play cancelled.",
            );
            this.playerService.unlockAutoNext();
            return;
          }

          if (currentIndex < episodes.length - 1) {
            const nextEpisode = episodes[currentIndex + 1];
            this.navigateToEpisode(
              tvShow.id,
              currentEp.season_number,
              nextEpisode.episode_number,
            );
          } else {
            const currentSeasonIndex = tvShow.seasons.findIndex(
              (s) => s.season_number === currentEp.season_number,
            );

            if (currentSeasonIndex > -1) {
              let foundNextSeason = false;
              for (
                let i = currentSeasonIndex + 1;
                i < tvShow.seasons.length;
                i++
              ) {
                const nextSeasonObj = tvShow.seasons[i];
                if (
                  nextSeasonObj &&
                  nextSeasonObj.episode_count > 0 &&
                  nextSeasonObj.season_number > 0
                ) {
                  this.navigateToEpisode(
                    tvShow.id,
                    nextSeasonObj.season_number,
                    1,
                  );
                  foundNextSeason = true;
                  return;
                }
              }

              if (!foundNextSeason) {
                this.tryPlayNextAfterSeriesEnd(tvShow);
              }
            } else {
              this.tryPlayNextAfterSeriesEnd(tvShow);
            }
          }
        },
        error: (err) => {
          console.error("Failed to fetch season details for auto-next:", err);
          this.playerService.unlockAutoNext();
        },
      });
  }

  private tryPlayNextAfterSeriesEnd(tvShow: TvShowDetails): void {
    const playlistId = this.playlist()?.id;
    if (playlistId) {
      const nextItem = this.playlistService.getNextItemFromPlaylist(
        playlistId,
        tvShow.id,
      );
      if (nextItem) {
        this.navigationService.navigateTo("watch", {
          mediaType: nextItem.media_type,
          id: nextItem.id,
          playlistId: playlistId,
          autoplay: true,
        });
        this.iframeLoading.set(true);
        return;
      }
    }
    this.playerService.unlockAutoNext();
  }

  private tryPlayNextPlaylistItem(
    media: MovieDetails | TvShowDetails,
  ): boolean {
    const playlistId = this.playlist()?.id;
    if (!playlistId) return false;
    const nextItem = this.playlistService.getNextItemFromPlaylist(
      playlistId,
      media.id,
    );
    if (!nextItem) return false;

    this.navigationService.navigateTo("watch", {
      mediaType: nextItem.media_type,
      id: nextItem.id,
      playlistId: playlistId,
      autoplay: true,
    });
    this.iframeLoading.set(true);

    return true;
  }

  private navigateToEpisode(
    showId: number,
    season: number,
    episode: number,
  ): void {
    // Clear any skip key since we want to force this navigation
    this.skipUpdateForMediaKey.set(null);
    this.startNavigation();

    this.navigationService.navigateTo("watch", {
      mediaType: "tv",
      id: showId,
      season: season,
      episode: episode,
      playlistId: this.playlist()?.id,
      autoplay: true,
    });
  }

  private readonly VIDSRC_MIRRORS = [
    "https://v3.vidsrc.cc",
    "https://vidsrc.xyz",
    "https://vidsrc.me",
    "https://vidsrc.to",
    "https://vidsrc.in",
    "https://vidsrc.net",
    "https://vidsrc.pm",
    "https://vidsrc.pro",
    "https://vidsrc.stream",
    "https://vidsrc.online",
    "https://v3.embed.su",
    "https://embed.su",
  ];

  private loadMainTrailer(media: MediaType): void {
    this.loadingTrailer.set(true);

    const videoRequest$ = isMovie(media)
      ? this.movieService.getMovieVideos(media.id)
      : this.movieService.getTvShowVideos(media.id);

    videoRequest$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (response) => {
        const trailer = response.results.find(
          (video) => video.site === "YouTube" && video.type === "Trailer",
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
    episodeNumber: number,
  ): void {
    this.loadingTrailer.set(true);

    this.movieService
      .getSeasonDetails(tvShow.id, seasonNumber)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((seasonDetails) => {
        const episode = seasonDetails.episodes.find(
          (e) => e.episode_number === episodeNumber,
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
                    (v) => v.site === "YouTube" && v.type === "Trailer",
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

  private removeStartAtFromUrl(): void {
    const media = this.selectedMediaItem();
    if (!media) return;

    const currentParams = this.params();
    if (!currentParams?.startAt) return;

    const cleanParams: any = {
      mediaType: media.media_type,
      id: media.id,
      playlistId: currentParams.playlistId,
    };

    if (
      media.media_type === "tv" &&
      currentParams.season &&
      currentParams.episode
    ) {
      cleanParams.season = currentParams.season;
      cleanParams.episode = currentParams.episode;
    }

    const path = this.navigationService.getPath("watch", cleanParams);
    if (typeof window !== "undefined") {
      try {
        window.history.replaceState({}, "", path);
      } catch {
        // Ignore SecurityError in sandboxed environments
      }
    }
  }

  onEpisodeSelected(data: { episode: Episode; seasonNumber: number }): void {
    const tvShow = this.selectedMediaItem();
    if (tvShow?.media_type !== "tv") return;

    this.skipUpdateForMediaKey.set(null);
    this.startNavigation();

    this.navigationService.navigateTo("watch", {
      mediaType: "tv",
      id: tvShow.id,
      season: data.seasonNumber,
      episode: data.episode.episode_number,
      playlistId: this.playlist()?.id,
    });
  }

  onSelectMedia(media: MediaType): void {
    this.skipUpdateForMediaKey.set(null);
    this.startNavigation();

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
      this.iframeLoading.set(true);
      this.reloading.set(true);
      this.constructedPlayerUrl.set("");

      const media = this.selectedMediaItem();
      if (!media) return;

      const currentParams = this.params();
      const currentTime = this.lastKnownPlaybackTime();

      this.navigationService.navigateTo("watch", {
        mediaType: media.media_type,
        id: media.id,
        season: currentParams?.season,
        episode: currentParams?.episode,
        playlistId: this.playlist()?.id,
        startAt: currentTime > 5 ? currentTime : 0,
        autoplay: true,
      });

      this.startNavigation();

      setTimeout(() => {
        if (this.reloading()) {
          this.reloading.set(false);
          this.iframeLoading.set(false);
          if (this.constructedPlayerUrl() === "") {
            const url = this.playerUrl();
            if (url) this.constructedPlayerUrl.set(url);
          }
        }
      }, 300);
    }
  }

  onClosePlaylist(): void {
    const media = this.selectedMediaItem();
    if (!media) return;

    const currentParams = this.params();

    this.navigationService.navigateTo("watch", {
      mediaType: media.media_type,
      id: media.id,
      season: currentParams?.season,
      episode: currentParams?.episode,
    });
  }

  onPlayerIframeLoad(): void {
    this.iframeLoading.set(false);
    setTimeout(() => {
      this.iframeLoading.set(false);
    }, 4000);
  }

  onMaximizePlayer(): void {
    this.isMaximized.set(true);
  }

  closeMaximize(): void {
    this.isMaximized.set(false);
  }

  onMaximizeBackdropClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (target.classList.contains("fixed")) {
      this.closeMaximize();
    }
  }

  @HostListener("document:keydown.escape", ["$event"])
  onEscapeKey(event: KeyboardEvent): void {
    if (this.isMaximized()) {
      this.closeMaximize();
      event.preventDefault();
    }
  }
}
