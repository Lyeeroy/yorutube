import {
  Component,
  ChangeDetectionStrategy,
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
  TvShowDetails,
  Episode,
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
import { VideoPlayerPlaylistComponent } from "../video-player-playlist/video-player-playlist.component";
import { PlayerService } from "../../services/player.service";
import { PlaybackProgressService } from "../../services/playback-progress.service";
import { ContinueWatchingService } from "../../services/continue-watching.service";
import { PlayerProviderService } from "../../services/player-provider.service";
import { PlayerMessageRouterService } from "../../services/player-message-router.service";
import { ContinueWatchingManagerService } from "../../services/continue-watching-manager.service";
import { PlayerUrlConfig } from "../../models/player-provider.model";

// ============ Constants ============
const THRESHOLDS = {
  PLAYBACK_SECONDS: 30,
  AUTO_NEXT_PRELOAD: 90,
  AUTO_NEXT_COMPLETE: 95,
  STALE_EVENT_MS: 10000,
  STALE_TIME_DIFF: 10,
  SEEK_RESET_PERCENT: 10,
  MIN_PLAYBACK_RESET: 5,
  SIGNAL_UPDATE_MS: 1000,
  AUTO_NEXT_COUNTDOWN: 5,
} as const;

// ============ Type Guards ============
const isMovie = (media: MediaType | TvShowDetails): media is Movie =>
  media.media_type === "movie";

const isTvShow = (
  media: MovieDetails | TvShowDetails | null,
): media is TvShowDetails => media?.media_type === "tv";

// ============ Interfaces ============
interface EpisodeState {
  season: number;
  episode: number;
}

interface NavigationState {
  active: boolean;
  startTime: number;
  skipMediaKey: string | null;
}

interface PlaybackState {
  currentTime: number;
  progressPercent: number;
  lastUpdateTime: number;
  playerStarted: boolean;
  historyAdded: boolean;
}

interface AutoNextState {
  phase: "idle" | "counting_down";
  countdown: number;
  triggered: boolean;
  recommendedSent: boolean;
  minimized: boolean;
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
  // ============ Injected Services ============
  private readonly movieService = inject(MovieService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly navigationService = inject(NavigationService);
  private readonly historyService = inject(HistoryService);
  private readonly playlistService = inject(PlaylistService);
  private readonly playerService = inject(PlayerService);
  private readonly playbackProgressService = inject(PlaybackProgressService);
  private readonly continueWatchingService = inject(ContinueWatchingService);
  private readonly playerProviderService = inject(PlayerProviderService);
  private readonly playerMessageRouter = inject(PlayerMessageRouterService);
  private readonly continueWatchingManager = inject(
    ContinueWatchingManagerService,
  );
  private readonly destroyRef = inject(DestroyRef);

  // ============ Inputs ============
  readonly params = input.required<any>();

  // ============ Core State Signals ============
  readonly selectedMediaItem = signal<MovieDetails | TvShowDetails | null>(
    null,
  );
  readonly currentEpisode = signal<Episode | null>(null);
  readonly nextEpisode = signal<Episode | null>(null);
  readonly videoDetails = signal<Video | null>(null);

  // ============ UI State ============
  readonly loadingTrailer = signal(true);
  readonly iframeLoading = signal(false);
  readonly isMaximized = signal(false);

  // ============ Consolidated State Objects ============
  private readonly navState = signal<NavigationState>({
    active: false,
    startTime: 0,
    skipMediaKey: null,
  });

  private readonly playback = signal<PlaybackState>({
    currentTime: 0,
    progressPercent: 0,
    lastUpdateTime: 0,
    playerStarted: false,
    historyAdded: false,
  });

  private readonly autoNext = signal<AutoNextState>({
    phase: "idle",
    countdown: THRESHOLDS.AUTO_NEXT_COUNTDOWN,
    triggered: false,
    recommendedSent: false,
    minimized: false,
  });

  // ============ Private Tracking ============
  private readonly constructedUrl = signal("about:blank");
  private readonly reloading = signal(false);
  private readonly autoplay = signal(false);
  private readonly initialStartAt = signal<number | undefined>(undefined);
  private readonly lastProcessedStartAt = signal<number | undefined>(undefined);
  private readonly lastPlayerEpisode = signal<EpisodeState | null>(null);
  private readonly prevMediaKey = signal<string | null>(null);
  private readonly prevPlayer = signal<string | null>(null);

  private autoNextTimer: ReturnType<typeof setInterval> | null = null;

  // ============ External Signals ============
  readonly selectedPlayer = this.playerService.selectedPlayer;
  readonly genreMap = toSignal(this.movieService.getCombinedGenreMap(), {
    initialValue: new Map<number, string>(),
  });

  // ============ Computed Values ============
  readonly playlist = computed(() => {
    const id = this.params()?.playlistId;
    return id ? (this.playlistService.getPlaylistById(id) ?? null) : null;
  });

  readonly currentMediaId = computed(() => this.selectedMediaItem()?.id);

  readonly backdropUrl = computed(() => {
    const path = this.selectedMediaItem()?.backdrop_path;
    return path ? `https://image.tmdb.org/t/p/w1280${path}` : null;
  });

  // Template-exposed computed from consolidated state
  readonly currentPlaybackTime = computed(() => this.playback().currentTime);
  readonly currentProgressPercent = computed(
    () => this.playback().progressPercent,
  );
  readonly autoNextState = computed(() => this.autoNext().phase);
  readonly autoNextCountdown = computed(() => this.autoNext().countdown);
  readonly nextEpisodeMinimized = computed(() => this.autoNext().minimized);
  readonly isNavigating = computed(() => this.navState().active);

  readonly hasNextItem = computed(() => {
    const media = this.selectedMediaItem();
    if (!media) return false;
    if (isTvShow(media)) return true;

    const playlist = this.playlist();
    if (!playlist?.items?.length) return false;
    const idx = playlist.items.findIndex((i) => i.id === media.id);
    return idx >= 0 && idx < playlist.items.length - 1;
  });

  readonly showNextEpisodeButton = computed(() => {
    const { progressPercent } = this.playback();
    return (
      this.playerService.nextButtonEnabled() &&
      this.hasNextItem() &&
      !this.navState().active &&
      (progressPercent >= 80 || this.autoNext().phase === "counting_down")
    );
  });

  readonly safeConstructedPlayerUrl = computed<SafeResourceUrl>(() =>
    this.sanitizer.bypassSecurityTrustResourceUrl(this.constructedUrl()),
  );

  private readonly youtubeUrl = computed(() => {
    const video = this.videoDetails();
    if (!video) return null;
    const autoplayParam =
      this.autoplay() || this.playerService.autoplayEnabled() ? 1 : 0;
    return `https://www.youtube.com/embed/${video.key}?autoplay=${autoplayParam}`;
  });

  private readonly playerUrl = computed(() => {
    const playerId = this.selectedPlayer();
    if (playerId === "YouTube") return this.youtubeUrl();

    const media = this.selectedMediaItem();
    const provider = this.playerProviderService.getProvider(playerId);
    if (!media || !provider) return null;

    const episode = this.currentEpisode();
    const config: PlayerUrlConfig = {
      media,
      episode: episode ?? undefined,
      autoplay: this.autoplay() || this.playerService.autoplayEnabled(),
      autoNext: this.playerService.autoNextEnabled(),
      resumeTime: this.calculateResumeTime(media, episode),
    };

    return provider.generateUrl(config);
  });

  constructor() {
    this.playerMessageRouter.start();
    this.initEffects();
    this.initNextEpisodeStream();
  }

  ngOnInit(): void {
    this.playerMessageRouter.start();
    this.initMessageHandler();
  }

  ngOnDestroy(): void {
    this.playerMessageRouter.stop();
    this.clearAutoNextTimer();
  }

  // ============ Template Event Handlers ============
  onEpisodeSelected(data: { episode: Episode; seasonNumber: number }): void {
    const tvShow = this.selectedMediaItem();
    if (tvShow?.media_type !== "tv") return;

    this.navigateToMedia(
      "tv",
      tvShow.id,
      data.seasonNumber,
      data.episode.episode_number,
    );
  }

  onSelectMedia(media: MediaType): void {
    this.navigateToMedia(
      media.media_type,
      media.id,
      undefined,
      undefined,
      true,
    );
  }

  onRefreshPlayer(): void {
    if (!this.playerUrl()) return;

    this.iframeLoading.set(true);
    this.reloading.set(true);
    this.constructedUrl.set("");

    const media = this.selectedMediaItem();
    if (!media) return;

    const p = this.params();
    const currentTime = this.playback().currentTime;

    this.navigationService.navigateTo("watch", {
      mediaType: media.media_type,
      id: media.id,
      season: p?.season,
      episode: p?.episode,
      playlistId: this.playlist()?.id,
      startAt: currentTime > 5 ? currentTime : 0,
      autoplay: true,
    });

    this.startNavigation();
    setTimeout(() => this.finalizeRefresh(), 300);
  }

  onClosePlaylist(): void {
    const media = this.selectedMediaItem();
    if (!media) return;

    const p = this.params();
    this.navigationService.navigateTo("watch", {
      mediaType: media.media_type,
      id: media.id,
      season: p?.season,
      episode: p?.episode,
    });
  }

  onPlayerIframeLoad(): void {
    this.iframeLoading.set(false);
    setTimeout(() => this.iframeLoading.set(false), 4000);
  }

  onMaximizePlayer(): void {
    this.isMaximized.set(true);
  }

  closeMaximize(): void {
    this.isMaximized.set(false);
  }

  onMaximizeBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains("fixed")) {
      this.closeMaximize();
    }
  }

  @HostListener("document:keydown.escape")
  onEscapeKey(): void {
    if (this.isMaximized()) this.closeMaximize();
  }

  toggleNextEpisodeMinimized(): void {
    this.patchAutoNext({ minimized: !this.autoNext().minimized });
  }

  toggleAutoNext(media: MovieDetails | TvShowDetails): void {
    const state = this.autoNext();

    if (state.phase === "counting_down") {
      this.cancelAutoNext();
    } else if (state.triggered) {
      const threshold = this.playerService.autoNextThreshold();
      if (this.playback().progressPercent >= threshold) {
        this.startAutoNextCountdown(media);
      } else {
        this.patchAutoNext({ triggered: false });
        this.playerService.unlockAutoNext();
      }
    } else {
      this.cancelAutoNext();
    }
  }

  onNextEpisodeClick(): void {
    const media = this.selectedMediaItem();
    if (!media) return;

    if (this.autoNext().phase === "counting_down") {
      this.clearAutoNextTimer();
    }

    this.playerService.tryLockAutoNext();
    this.executeAutoNext(media);
  }

  cancelAutoNext(): void {
    this.clearAutoNextTimer();
    this.patchAutoNext({ phase: "idle", triggered: true });
    this.playerService.unlockAutoNext();
  }

  // ============ State Helpers ============
  private patchNavState(patch: Partial<NavigationState>): void {
    this.navState.update((s) => ({ ...s, ...patch }));
  }

  private patchPlayback(patch: Partial<PlaybackState>): void {
    this.playback.update((s) => ({ ...s, ...patch }));
  }

  private patchAutoNext(patch: Partial<AutoNextState>): void {
    this.autoNext.update((s) => ({ ...s, ...patch }));
  }

  private startNavigation(): void {
    this.patchNavState({ active: true, startTime: Date.now() });
    this.clearAutoNextTimer();
    this.patchAutoNext({ phase: "idle" });
  }

  private getMediaKey(p: any): string {
    return `${p?.mediaType}:${p?.id}:${p?.season ?? ""}:${p?.episode ?? ""}`;
  }

  // ============ Initialization ============
  private initEffects(): void {
    // URL update effect
    effect(() => {
      const url = this.playerUrl();
      if (this.reloading() || !url) return;

      const current = this.constructedUrl();
      const key = this.getMediaKey(untracked(() => this.params()));
      const skipKey = this.navState().skipMediaKey;

      if (skipKey === key) return;
      if (skipKey) this.patchNavState({ skipMediaKey: null });

      if (this.shouldUpdateUrl(current, url)) {
        this.iframeLoading.set(true);
        this.constructedUrl.set(url);
      }
    });

    // StartAt cleanup effect
    effect(() => {
      const startAt = this.initialStartAt();
      const { currentTime, playerStarted } = this.playback();

      if (
        typeof startAt === "number" &&
        startAt > 60 &&
        currentTime >= startAt - 60
      ) {
        this.clearStartAt();
      } else if (playerStarted || currentTime > 5) {
        this.clearStartAt();
      }
    });

    // Main params effect
    effect((onCleanup) => {
      const p = this.params();
      if (!p) {
        this.selectedMediaItem.set(null);
        return;
      }

      const { mediaType, id, season, episode, autoplay } = p;
      this.autoplay.set(!!autoplay);

      const mediaKey = this.getMediaKey(p);
      const player = this.selectedPlayer();

      const isMediaChange = untracked(() => this.prevMediaKey()) !== mediaKey;
      const isPlayerChange =
        untracked(() => this.prevPlayer()) !== null &&
        untracked(() => this.prevPlayer()) !== player;

      if (isMediaChange || isPlayerChange) {
        this.handleStateTransition(
          p,
          mediaKey,
          player,
          isMediaChange,
          isPlayerChange,
        );
      } else if (p.startAt) {
        this.handleStartAtUpdate(Number(p.startAt));
      }

      this.prepareForLoad(mediaKey, isMediaChange || isPlayerChange);

      if (!id || !mediaType) {
        this.selectedMediaItem.set(null);
        return;
      }

      this.initEpisodeState(mediaType, season, episode);
      const sub = this.loadMedia(mediaType, +id, season, episode);
      onCleanup(() => sub.unsubscribe());
    });
  }

  private initNextEpisodeStream(): void {
    toObservable(this.currentEpisode)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        switchMap((ep) => {
          const media = this.selectedMediaItem();
          return ep && isTvShow(media)
            ? this.fetchNextEpisode(media, ep)
            : of(null);
        }),
      )
      .subscribe((next) => this.nextEpisode.set(next));
  }

  private initMessageHandler(): void {
    this.playerMessageRouter
      .onMessage()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((routed) => this.processMessage(routed));
  }

  // ============ State Transition Handlers ============
  private handleStateTransition(
    p: any,
    mediaKey: string,
    player: string,
    isMediaChange: boolean,
    isPlayerChange: boolean,
  ): void {
    // Preserve playback time on player switch
    if (isPlayerChange && !isMediaChange) {
      const time = untracked(() => this.playback().currentTime);
      if (time > 5) {
        this.initialStartAt.set(time);
        this.lastProcessedStartAt.set(time);
      }
    }

    this.resetPlaybackState();
    this.prevMediaKey.set(mediaKey);
    this.prevPlayer.set(player);
    this.startNavigation();

    if (isMediaChange) {
      const startAt = p?.startAt ? Number(p.startAt) : undefined;
      this.initialStartAt.set(startAt);
      this.lastProcessedStartAt.set(startAt);
    }
  }

  private handleStartAtUpdate(startAt: number): boolean {
    if (untracked(() => this.lastProcessedStartAt()) === startAt) return false;

    this.initialStartAt.set(startAt);
    this.lastProcessedStartAt.set(startAt);
    this.patchPlayback({ playerStarted: false, currentTime: 0 });
    this.startNavigation();
    return true;
  }

  private resetPlaybackState(): void {
    this.patchPlayback({
      playerStarted: false,
      currentTime: 0,
      progressPercent: 0,
      lastUpdateTime: 0,
      historyAdded: false,
    });
    this.lastPlayerEpisode.set(null);
    this.patchAutoNext({
      phase: "idle",
      triggered: false,
      recommendedSent: false,
    });
    this.clearAutoNextTimer();
    this.playerService.unlockAutoNext();
  }

  private prepareForLoad(mediaKey: string, shouldReload: boolean): void {
    const skipKey = this.navState().skipMediaKey;
    if (skipKey !== mediaKey && shouldReload) {
      this.triggerReload();
    }
    this.videoDetails.set(null);
    this.patchPlayback({ historyAdded: false });
  }

  private triggerReload(): void {
    this.reloading.set(true);
    this.constructedUrl.set("");
    setTimeout(() => this.reloading.set(false), 100);
  }

  private initEpisodeState(
    mediaType: string,
    season?: number,
    episode?: number,
  ): void {
    if (mediaType === "tv" && season && episode) {
      this.currentEpisode.set({
        season_number: +season,
        episode_number: +episode,
        id: 0,
      } as Episode);
      this.lastPlayerEpisode.set({ season: +season, episode: +episode });
    } else {
      this.currentEpisode.set(null);
    }
  }

  // ============ Media Loading ============
  private loadMedia(
    mediaType: string,
    id: number,
    season?: number,
    episode?: number,
  ) {
    const media$: Observable<MovieDetails | TvShowDetails> =
      mediaType === "movie"
        ? this.movieService.getMovieDetails(id)
        : this.movieService.getTvShowDetails(id);

    return media$.subscribe({
      next: (details) => {
        this.selectedMediaItem.set(details);
        if (!details) return;

        if (isTvShow(details)) {
          this.loadTvContent(details, season, episode);
        } else {
          this.loadTrailer(details);
        }
      },
      error: () => this.selectedMediaItem.set(null),
    });
  }

  private loadTvContent(
    tv: TvShowDetails,
    season?: number,
    episode?: number,
  ): void {
    if (season && episode) {
      this.loadEpisodeTrailer(tv, +season, +episode);
    } else {
      const first =
        tv.seasons.find((s) => s.season_number > 0) ?? tv.seasons[0];
      first
        ? this.loadEpisodeTrailer(tv, first.season_number, 1)
        : this.loadTrailer(tv);
    }
  }

  private loadTrailer(media: MediaType): void {
    this.loadingTrailer.set(true);

    const videos$ = isMovie(media)
      ? this.movieService.getMovieVideos(media.id)
      : this.movieService.getTvShowVideos(media.id);

    videos$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (r) => {
        const trailer = r.results.find(
          (v) => v.site === "YouTube" && v.type === "Trailer",
        );
        this.videoDetails.set(trailer ?? null);
        this.loadingTrailer.set(false);
      },
      error: () => this.loadingTrailer.set(false),
    });
  }

  private loadEpisodeTrailer(
    tv: TvShowDetails,
    season: number,
    episode: number,
  ): void {
    this.loadingTrailer.set(true);

    this.movieService
      .getSeasonDetails(tv.id, season)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((seasonData) => {
        const ep = seasonData.episodes.find(
          (e) => e.episode_number === episode,
        );
        this.currentEpisode.set(ep ?? null);

        if (!ep) {
          this.loadingTrailer.set(false);
          return;
        }

        this.movieService
          .getEpisodeVideos(tv.id, season, ep.episode_number)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: (r) => {
              const trailer =
                r.results.find(
                  (v) => v.site === "YouTube" && v.type === "Trailer",
                ) ?? r.results[0];
              this.videoDetails.set(trailer ?? null);
              this.loadingTrailer.set(false);
            },
            error: () => this.loadingTrailer.set(false),
          });
      });
  }

  // ============ Message Processing ============
  private processMessage(routed: any): void {
    const media = this.selectedMediaItem();
    if (!media) return;

    const result = routed.provider?.handleMessage(
      routed.raw.data ?? routed.raw,
      this.currentEpisode(),
    );
    const eventName = routed.raw?.event ?? routed.raw?.data?.event;

    if (this.shouldIgnoreMessage(result, eventName, media)) return;

    if (result?.playerStarted && !this.playback().playerStarted) {
      this.patchPlayback({ playerStarted: true });
      this.iframeLoading.set(false);
    }

    if (result?.playbackProgress && !this.isMetadataMismatch(result, media)) {
      this.iframeLoading.set(false);
      this.processPlaybackProgress(result.playbackProgress, media);
    }

    if (isTvShow(media) && this.playback().playerStarted) {
      this.processEpisodeData(routed, result, media, eventName);
    }
  }

  private shouldIgnoreMessage(
    result: any,
    eventName: string,
    media: MovieDetails | TvShowDetails,
  ): boolean {
    if (!this.navState().active) return false;

    const isRoutine = ["timeupdate", "time", "seeking", "seeked"].includes(
      eventName,
    );
    const isStale =
      result?.playbackProgress &&
      this.isStaleEvent(result.playbackProgress.currentTime);
    const isMismatch = this.isMetadataMismatch(result, media);

    return isMismatch || (isRoutine && isStale);
  }

  private isMetadataMismatch(
    result: any,
    media: MovieDetails | TvShowDetails,
  ): boolean {
    if (!isTvShow(media) || !result?.episodeChange) return false;

    const ep = untracked(() => this.currentEpisode());
    return (
      ep &&
      (result.episodeChange.season !== ep.season_number ||
        result.episodeChange.episode !== ep.episode_number)
    );
  }

  // ============ Playback Progress ============
  private processPlaybackProgress(
    data: { currentTime: number; duration: number; progressPercent: number },
    media: MovieDetails | TvShowDetails,
  ): void {
    const { currentTime, duration, progressPercent } = data;
    if (!duration || duration <= 0 || !isFinite(progressPercent)) return;
    if (this.isStaleEvent(currentTime)) return;

    const now = Date.now();
    const shouldUpdate =
      now - this.playback().lastUpdateTime >= THRESHOLDS.SIGNAL_UPDATE_MS;

    if (shouldUpdate || progressPercent >= 100) {
      this.patchPlayback({ currentTime, progressPercent, lastUpdateTime: now });
      this.checkNavigationUnlock(currentTime, now);
    }

    const episode = this.currentEpisode();
    const progressId = episode?.id ?? media.id;

    if (!this.isFailedResume(currentTime) && shouldUpdate) {
      this.playbackProgressService.updateProgress(progressId, {
        progress: progressPercent,
        timestamp: currentTime,
        duration,
      });
    }

    this.updateWatchingState(media, currentTime, progressPercent, episode);
    this.checkAutoNextTrigger(progressPercent, currentTime, media);
  }

  private updateWatchingState(
    media: MovieDetails | TvShowDetails,
    currentTime: number,
    progressPercent: number,
    episode: Episode | null,
  ): void {
    // Add to history
    if (
      !this.playback().historyAdded &&
      (currentTime > THRESHOLDS.PLAYBACK_SECONDS || progressPercent > 5)
    ) {
      this.historyService.addToHistory(media, episode ?? undefined);
      this.patchPlayback({ historyAdded: true });
    }

    // Continue watching
    if (!this.historyService.isPaused()) {
      if (
        progressPercent >= 5 &&
        progressPercent < THRESHOLDS.AUTO_NEXT_COMPLETE
      ) {
        this.continueWatchingService.addItem({
          id: media.id,
          media,
          episode: episode ?? undefined,
        });
      } else if (progressPercent >= THRESHOLDS.AUTO_NEXT_COMPLETE) {
        this.continueWatchingManager.handleCompletePlayback(
          media,
          episode,
          this.playlist()?.id,
        );
      }
    }

    // Recommend next
    if (
      isTvShow(media) &&
      !this.autoNext().recommendedSent &&
      progressPercent >= THRESHOLDS.AUTO_NEXT_PRELOAD &&
      progressPercent < THRESHOLDS.AUTO_NEXT_COMPLETE
    ) {
      this.patchAutoNext({ recommendedSent: true });
      this.continueWatchingManager.maybeRecommendNextEpisode(
        media,
        episode ?? undefined,
        this.playlist()?.id,
      );
    }
  }

  private checkNavigationUnlock(currentTime: number, now: number): void {
    if (currentTime < THRESHOLDS.MIN_PLAYBACK_RESET || !this.navState().active)
      return;

    const startAt = this.initialStartAt() ?? 0;
    const nearStart =
      Math.abs(currentTime - startAt) < THRESHOLDS.STALE_TIME_DIFF;
    const longEnough =
      now - this.navState().startTime > THRESHOLDS.STALE_EVENT_MS;

    if (nearStart || longEnough) {
      this.patchNavState({ active: false });
      this.playerService.unlockAutoNext();
    }
  }

  private isStaleEvent(currentTime: number): boolean {
    if (!this.navState().active) return false;

    const startAt = this.initialStartAt() ?? 0;
    const timeSinceNav = Date.now() - this.navState().startTime;

    return (
      timeSinceNav < THRESHOLDS.STALE_EVENT_MS &&
      Math.abs(currentTime - startAt) > THRESHOLDS.STALE_TIME_DIFF
    );
  }

  private isFailedResume(currentTime: number): boolean {
    const startAt = untracked(() => this.initialStartAt());
    return (
      typeof startAt === "number" &&
      startAt > 60 &&
      currentTime < startAt - 60 &&
      currentTime < 15
    );
  }

  // ============ Auto Next ============
  private checkAutoNextTrigger(
    progressPercent: number,
    currentTime: number,
    media: MovieDetails | TvShowDetails,
  ): void {
    const threshold = this.playerService.autoNextThreshold();
    const state = this.autoNext();

    // Reset on seek back
    if (
      state.triggered &&
      currentTime > THRESHOLDS.MIN_PLAYBACK_RESET &&
      progressPercent < threshold - THRESHOLDS.SEEK_RESET_PERCENT
    ) {
      this.patchAutoNext({ triggered: false });
    }

    const provider = this.playerProviderService.getProvider(
      this.selectedPlayer(),
    );
    const canTrigger =
      provider?.supportsAutoNext &&
      this.playerService.autoNextEnabled() &&
      this.playback().playerStarted &&
      !state.triggered &&
      this.hasNextItem() &&
      !this.navState().active &&
      currentTime > THRESHOLDS.PLAYBACK_SECONDS &&
      progressPercent >= threshold &&
      this.playerService.tryLockAutoNext();

    if (canTrigger) {
      this.patchAutoNext({ triggered: true });
      this.startAutoNextCountdown(media);
    }
  }

  private startAutoNextCountdown(media: MovieDetails | TvShowDetails): void {
    this.patchAutoNext({
      phase: "counting_down",
      countdown: THRESHOLDS.AUTO_NEXT_COUNTDOWN,
    });

    this.autoNextTimer = setInterval(() => {
      const count = this.autoNext().countdown;
      if (count <= 0) {
        this.executeAutoNext(media);
      } else {
        this.patchAutoNext({ countdown: count - 1 });
      }
    }, 1000);
  }

  private executeAutoNext(media: MovieDetails | TvShowDetails): void {
    this.clearAutoNextTimer();
    this.patchAutoNext({ phase: "idle" });

    if (isTvShow(media)) {
      this.playNextEpisode(media);
    } else if (!this.tryPlayNextPlaylistItem(media)) {
      this.playerService.unlockAutoNext();
    }
  }

  private clearAutoNextTimer(): void {
    if (this.autoNextTimer) {
      clearInterval(this.autoNextTimer);
      this.autoNextTimer = null;
    }
  }

  // ============ Episode Handling ============
  private processEpisodeData(
    routed: any,
    result: any,
    media: TvShowDetails,
    eventName: string,
  ): void {
    const season =
      result?.episodeChange?.season ??
      routed.raw?.season ??
      routed.raw?.data?.season;
    const episode =
      result?.episodeChange?.episode ??
      routed.raw?.episode ??
      routed.raw?.data?.episode;

    if (
      season === undefined ||
      episode === undefined ||
      isNaN(season) ||
      isNaN(episode)
    )
      return;

    this.syncEpisodeFromPlayer({ season, episode }, media);

    const params = untracked(() => this.params());
    if (
      (params?.season !== season || params?.episode !== episode) &&
      this.canProcessEpisodeChange(eventName)
    ) {
      this.handleEpisodeChange({ season, episode }, media);
    }
  }

  private syncEpisodeFromPlayer(
    data: EpisodeState,
    media: TvShowDetails,
  ): void {
    const current = this.currentEpisode();
    if (
      current?.id &&
      current.season_number === data.season &&
      current.episode_number === data.episode
    ) {
      return;
    }

    this.movieService
      .getSeasonDetails(media.id, data.season)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((season) => {
        const ep = season.episodes.find(
          (e) => e.episode_number === data.episode,
        );
        if (ep) this.currentEpisode.set(ep);
      });
  }

  private handleEpisodeChange(data: EpisodeState, media: TvShowDetails): void {
    const params = untracked(() => this.params());
    const appState =
      params?.season && params?.episode
        ? { season: +params.season, episode: +params.episode }
        : null;

    // Already synced
    if (appState?.season === data.season && appState?.episode === data.episode)
      return;

    const last = this.lastPlayerEpisode();
    if (last?.season === data.season && last?.episode === data.episode) return;

    const isSequential =
      appState &&
      data.season === appState.season &&
      data.episode === appState.episode + 1;

    const provider = this.playerProviderService.getProvider(
      this.selectedPlayer(),
    );

    // Skip if player handles auto-next
    if (
      isSequential &&
      provider?.supportsAutoNext &&
      this.playerService.autoNextEnabled() &&
      this.playerService.autoNextThreshold() < 95
    ) {
      this.lastPlayerEpisode.set(data);
      return;
    }

    if (!this.playerService.tryLockAutoNext()) {
      this.lastPlayerEpisode.set(data);
      return;
    }

    this.lastPlayerEpisode.set(data);
    this.startNavigation();

    const targetKey = `${media.media_type}:${media.id}:${data.season}:${data.episode}`;
    this.patchNavState({ skipMediaKey: targetKey });

    this.navigationService.navigateTo("watch", {
      mediaType: "tv",
      id: media.id,
      season: data.season,
      episode: data.episode,
      playlistId: this.playlist()?.id,
      autoplay: true,
    });

    this.fetchEpisode(media.id, data.season, data.episode);
  }

  private canProcessEpisodeChange(eventName?: string): boolean {
    const nonRoutine =
      eventName &&
      !["timeupdate", "time", "seeking", "seeked"].includes(eventName);
    return (
      this.playback().playerStarted &&
      !this.navState().active &&
      (this.playback().currentTime >= 5 || !!nonRoutine)
    );
  }

  private fetchEpisode(showId: number, season: number, episode: number): void {
    this.movieService
      .getSeasonDetails(showId, season)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((s) => {
        const ep = s.episodes.find((e) => e.episode_number === episode);
        if (ep) {
          this.currentEpisode.set(ep);
          this.patchPlayback({ historyAdded: false });
          this.patchAutoNext({ triggered: false });
        }
      });
  }

  private fetchNextEpisode(
    tv: TvShowDetails,
    current: Episode,
  ): Observable<Episode | null> {
    return this.movieService
      .getSeasonDetails(tv.id, current.season_number)
      .pipe(
        map((s) => {
          const idx = s.episodes.findIndex(
            (e) => e.episode_number === current.episode_number,
          );
          return idx >= 0 && idx < s.episodes.length - 1
            ? s.episodes[idx + 1]
            : null;
        }),
        switchMap((next) => {
          if (next) return of(next);

          const seasonIdx = tv.seasons.findIndex(
            (s) => s.season_number === current.season_number,
          );
          for (let i = seasonIdx + 1; i < tv.seasons.length; i++) {
            const nextSeason = tv.seasons[i];
            if (nextSeason?.episode_count > 0 && nextSeason.season_number > 0) {
              return this.movieService
                .getSeasonDetails(tv.id, nextSeason.season_number)
                .pipe(map((s) => s.episodes[0] ?? null));
            }
          }
          return of(null);
        }),
      );
  }

  // ============ Navigation ============
  private navigateToMedia(
    type: string,
    id: number,
    season?: number,
    episode?: number,
    autoplay = false,
  ): void {
    this.patchNavState({ skipMediaKey: null });
    this.startNavigation();

    this.navigationService.navigateTo("watch", {
      mediaType: type,
      id,
      season,
      episode,
      playlistId: this.playlist()?.id,
      autoplay: autoplay || undefined,
    });
  }

  private playNextEpisode(tv: TvShowDetails): void {
    const current = this.currentEpisode();
    if (!current) {
      this.playerService.unlockAutoNext();
      return;
    }

    this.movieService
      .getSeasonDetails(tv.id, current.season_number)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (season) => {
          const episodes = season.episodes ?? [];
          const idx = episodes.findIndex(
            (e) => e.episode_number === current.episode_number,
          );

          if (idx < 0) {
            this.playerService.unlockAutoNext();
            return;
          }

          if (idx < episodes.length - 1) {
            this.navigateToMedia(
              "tv",
              tv.id,
              current.season_number,
              episodes[idx + 1].episode_number,
              true,
            );
          } else {
            this.tryNextSeason(tv, current);
          }
        },
        error: () => this.playerService.unlockAutoNext(),
      });
  }

  private tryNextSeason(tv: TvShowDetails, current: Episode): void {
    const seasonIdx = tv.seasons.findIndex(
      (s) => s.season_number === current.season_number,
    );

    for (let i = seasonIdx + 1; i < tv.seasons.length; i++) {
      const next = tv.seasons[i];
      if (next?.episode_count > 0 && next.season_number > 0) {
        this.navigateToMedia("tv", tv.id, next.season_number, 1, true);
        return;
      }
    }

    this.tryPlayNextPlaylistItem(tv);
  }

  private tryPlayNextPlaylistItem(
    media: MovieDetails | TvShowDetails,
  ): boolean {
    const playlistId = this.playlist()?.id;
    if (!playlistId) return false;

    const next = this.playlistService.getNextItemFromPlaylist(
      playlistId,
      media.id,
    );
    if (!next) return false;

    this.navigationService.navigateTo("watch", {
      mediaType: next.media_type,
      id: next.id,
      playlistId,
      autoplay: true,
    });
    this.iframeLoading.set(true);
    return true;
  }

  // ============ Utilities ============
  private calculateResumeTime(
    media: MovieDetails | TvShowDetails,
    episode: Episode | null,
  ): number {
    const params = untracked(() => this.params());
    const progressId = this.getProgressId(media, episode, params);
    const progress = untracked(() =>
      this.playbackProgressService.getProgress(progressId),
    );
    const startAt = untracked(() => this.initialStartAt());
    const { currentTime, playerStarted } = untracked(() => this.playback());

    if (
      typeof startAt === "number" &&
      startAt > 0 &&
      !playerStarted &&
      currentTime <= 5
    ) {
      return startAt;
    }
    if (currentTime > 5) return currentTime;
    if (progress?.progress > 5 && progress.progress < 100)
      return progress.timestamp;
    return 0;
  }

  private getProgressId(
    media: MovieDetails | TvShowDetails,
    episode: Episode | null,
    params: any,
  ): number {
    if (isTvShow(media) && params?.season && params?.episode && episode) {
      return episode.season_number === +params.season &&
        episode.episode_number === +params.episode
        ? episode.id
        : media.id;
    }
    return episode?.id ?? media.id;
  }

  private shouldUpdateUrl(current: string, next: string): boolean {
    if (!current || current === "about:blank" || !next || current === next) {
      return current !== next && !!next;
    }

    try {
      const c = new URL(current);
      const n = new URL(next);

      if (c.origin !== n.origin || c.pathname !== n.pathname) return true;

      const criticalKeys = ["season", "episode", "id", "tmdb", "imdb", "v"];
      return criticalKeys.some(
        (k) => c.searchParams.get(k) !== n.searchParams.get(k),
      );
    } catch {
      return true;
    }
  }

  private clearStartAt(): void {
    this.initialStartAt.set(undefined);
    if (this.params()?.startAt) this.removeStartAtFromUrl();
  }

  private removeStartAtFromUrl(): void {
    const media = this.selectedMediaItem();
    const params = this.params();
    if (!media || !params?.startAt) return;

    const cleanParams: Record<string, any> = {
      mediaType: media.media_type,
      id: media.id,
      playlistId: params.playlistId,
    };

    if (media.media_type === "tv" && params.season && params.episode) {
      cleanParams.season = params.season;
      cleanParams.episode = params.episode;
    }

    try {
      window.history.replaceState(
        {},
        "",
        this.navigationService.getPath("watch", cleanParams),
      );
    } catch {
      /* ignore */
    }
  }

  private finalizeRefresh(): void {
    if (!this.reloading()) return;

    this.reloading.set(false);
    this.iframeLoading.set(false);

    if (this.constructedUrl() === "") {
      const url = this.playerUrl();
      if (url) this.constructedUrl.set(url);
    }
  }
}
