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
  currentEpisode = signal<Episode | null>(null);

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

  // Track if we should skip the next player URL update (player already navigated internally)
  private skipNextPlayerUpdate = signal(false);

  // Track if player has started playing (to avoid false episode detection on initial load)
  private playerHasStarted = signal(false);

  // Track if we're in the middle of a user-initiated navigation (to ignore stale player messages)
  private isNavigating = signal(false);

  private constructedPlayerUrl = signal<string>("about:blank");

  // Track if auto-play next has been triggered for current episode
  private autoPlayNextTriggered = signal(false);

  // Track if we've recommended the next episode (at 90% watched)
  private recommendedNextEpisodeSent = signal(false);

  // Track the previous media key to avoid blanking iframe on no-op param syncs
  private previousMediaKey = signal<string | null>(null);

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
    // This prevents a race condition where currentEpisode() still references the old
    // episode during autonext navigation, causing the old episode's progress to be
    // applied to the new episode URL.
    const params = untracked(() => this.params());
    const episode = this.currentEpisode();
    
    // Determine progressId based on params (source of truth) rather than currentEpisode
    let progressId: number;
    if (media.media_type === "tv" && params?.season && params?.episode && episode) {
      // For TV shows, only use episode.id if the episode matches what params say we're navigating to
      // This prevents using the old episode's ID during navigation
      if (episode.season_number === +params.season && episode.episode_number === +params.episode) {
        progressId = episode.id;
      } else {
        // Episode signal hasn't updated yet, use media.id as fallback
        // This means we won't resume progress, but that's better than resuming the wrong episode
        progressId = media.id;
      }
    } else {
      progressId = episode ? episode.id : media.id;
    }

    // Get resume time for supported players
    // Priority: 1) startAt from URL params, 2) saved progress
    const urlStartAt = params?.startAt;

    const progress = untracked(() =>
      this.playbackProgressService.getProgress(progressId)
    );

    // Use URL startAt only if provided for this navigation and player hasn't
    // started yet; otherwise prefer saved progress. This prevents a shared
    // start time from being re-applied when the user switches providers while
    // watching.
    const initialStart = untracked(() => this.initialStartAt());

    let resumeTime = 0;
    if (
      typeof initialStart === "number" &&
      initialStart > 0 &&
      !this.playerHasStarted() &&
      this.lastKnownPlaybackTime() <= 5
    ) {
      resumeTime = initialStart;
    } else if (progress && progress.progress > 5 && progress.progress < 100) {
      resumeTime = progress.timestamp;
    }

    const config: PlayerUrlConfig = {
      media,
      episode: episode || undefined,
      autoplay: this.autoplay() || this.playerService.autoplayEnabled(),
      autoNext: this.playerService.autoNextEnabled(),
      resumeTime,
      // For VidFast we allow passing a small theme override. If you need
      // other colors or per-user settings consider adding a UI control.
      // VidFast expects hex values without the leading '#', e.g. 'dc2626'.
      // Theme selection moved into provider (VidFast applies a default accent color)
    };

    return provider.generateUrl(config);
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

    // Clear initialStartAt once the player has a meaningful playback time so
    // that switching providers will respect the true user progress instead of
    // the shared 'startAt'. We also clear when the player starts.
    effect(() => {
      // When the player starts or we have last known playback time > 5s, clear
      // the initialStartAt so it's not re-applied when the user changes players.
      if (this.playerHasStarted() || this.lastKnownPlaybackTime() > 5) {
        this.initialStartAt.set(undefined);
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

      // Compute a key representing the current media identity
      const currentMediaKey = `${mediaType}:${id}:${season ?? ""}:${
        episode ?? ""
      }`;
      const prevKey = this.previousMediaKey();
      const isActualMediaChange = prevKey !== currentMediaKey;

      if (isActualMediaChange) {
        // Reset player state tracking only when media actually changes
        this.playerHasStarted.set(false);
        this.lastPlayerEpisodeState.set(null);
        this.autoPlayNextTriggered.set(false);
        this.recommendedNextEpisodeSent.set(false);
        this.lastKnownPlaybackTime.set(0);
        this.previousMediaKey.set(currentMediaKey);
        // Unlock any auto-next if we just navigated to a different media
        this.playerService.unlockAutoNext();

        // Mark that we're navigating to prevent stale player messages from interfering
        this.isNavigating.set(true);

        // Capture any `startAt` param from navigation so we can apply it as a one-time
        // resume time for the newly-opened media. We'll clear it once the player
        // has started or we have meaningful playback progress to avoid reusing
        // the shared startAt if the user switches player sources.
        this.initialStartAt.set(p?.startAt ? Number(p.startAt) : undefined);
      }

      const shouldReloadPlayer = !this.skipNextPlayerUpdate();

      // Only blank the iframe when we're actually changing media content
      if (shouldReloadPlayer && isActualMediaChange) {
        this.constructedPlayerUrl.set("about:blank");
      }

      this.videoDetails.set(null);
      this.historyAdded.set(false);

      // Playlist is now computed, no need to set it manually

      if (!id || !mediaType) {
        this.selectedMediaItem.set(null);
        return;
      }

      // For TV shows, immediately set the expected episode from params to avoid race conditions
      // This ensures currentEpisode is correct before any async operations or player messages
      if (mediaType === "tv" && season && episode) {
        // Create a temporary episode object with the expected state
        // This will be replaced with full episode details once loaded
        const expectedEpisode: Partial<Episode> = {
          season_number: +season,
          episode_number: +episode,
          id: 0, // Temporary, will be replaced
        };
        this.currentEpisode.set(expectedEpisode as Episode);

        // Also update lastPlayerEpisodeState to match our navigation intent
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
              this.currentEpisode()
            )
          : undefined;

        // Some providers embed the `event` inside a `data` wrapper. Normalize
        // here so we can decide whether this was a non-routine event (e.g.
        // explicit player navigation) and therefore bypass playback guards.
        const routedEventName =
          routed.raw?.event ?? (routed.raw?.data && routed.raw?.data.event);

        // Check if the message corresponds to a different episode than what we expect.
        // This prevents processing stale messages from the previous episode during navigation.
        const isMessageForDifferentEpisode =
          media.media_type === "tv" && !!result?.episodeChange;

        if (result?.playerStarted && !this.playerHasStarted()) {
          this.playerHasStarted.set(true);
        }

        if (result?.playbackProgress && !isMessageForDifferentEpisode) {
          this.handlePlaybackProgress(result.playbackProgress, media);
        }

        if (
          media.media_type === "tv" &&
          result?.episodeChange &&
          // Allow certain non-routine events (e.g. explicit navigation) to bypass
          // the playback-time guard so that internal player "next" buttons
          // immediately update the URL. Use routed.raw.event as the event
          // discriminator.
          this.canProcessEpisodeChange(routedEventName)
        ) {
          this.handleEpisodeChangeDetection(
            result.episodeChange,
            media as TvShowDetails
          );
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
          }

          if (
            season !== undefined &&
            episode !== undefined &&
            !isNaN(season) &&
            !isNaN(episode)
          ) {
            // Update UI-only state
            this.syncCurrentEpisodeFromPlayerData(
              { season, episode },
              media as TvShowDetails
            );

            // If the metadata indicates a different episode than our current params
            // and we've had meaningful playback, trigger proper navigation.
            // This catches internal player 'next' button clicks that previously
            // emitted metadata only on initial load/timeupdate and were ignored.
            const currentParams = untracked(() => this.params());
            const urlNeedsUpdate =
              currentParams?.season !== season ||
              currentParams?.episode !== episode;

            if (
              urlNeedsUpdate &&
              this.canProcessEpisodeChange(routedEventName)
            ) {
              // Use the provider-normalized metadata to update the app state
              this.handleEpisodeChangeDetection(
                { season, episode },
                media as TvShowDetails
              );
            }
          }
        }
      });
  }

  ngOnDestroy(): void {
    this.playerMessageRouter.stop();
  }

  // Track last known currentTime to prevent premature episode-change navigation
  private lastKnownPlaybackTime = signal(0);

  // Public signal for components that need current playback time (e.g., share modal)
  currentPlaybackTime = computed(() => this.lastKnownPlaybackTime());

  // Hold any startAt param from the URL for the first load. This should only
  // be applied once when the user navigates to a new media. After meaningful
  // playback or the player starts, this value will be cleared so it isn't
  // reapplied when the user switches providers.
  private initialStartAt = signal<number | undefined>(undefined);

  private handlePlaybackProgress(
    progressData: {
      currentTime: number;
      duration: number;
      progressPercent: number;
    },
    media: MovieDetails | TvShowDetails
  ): void {
    const { currentTime, duration, progressPercent } = progressData;

    // Update last known playback time
    if (typeof currentTime === "number" && currentTime > 0) {
      this.lastKnownPlaybackTime.set(currentTime);

      // Once we have meaningful playback (>5s), clear the navigation flag
      // This allows episode change detection to work for auto-next
      if (currentTime >= 5 && this.isNavigating()) {
        this.isNavigating.set(false);
      }
    }

    const playbackData: Omit<PlaybackProgress, "updatedAt"> = {
      progress: progressPercent,
      timestamp: currentTime,
      duration: duration,
    };

    const episode = this.currentEpisode();
    const progressId = episode ? episode.id : media.id;
    this.playbackProgressService.updateProgress(progressId, playbackData);

    // Add to history after significant playback (30 seconds or 5% progress)
    if (!this.historyAdded() && (currentTime > 30 || progressPercent > 5)) {
      this.historyService.addToHistory(
        media,
        this.currentEpisode() || undefined
      );
      this.historyAdded.set(true);
    }

    // Update continue watching list based on current progress
    if (progressPercent >= 5 && progressPercent < 95) {
      const continueWatchingItem: Omit<ContinueWatchingItem, "updatedAt"> = {
        id: media.id,
        media: media,
        episode: episode || undefined,
      };
      this.continueWatchingService.addItem(continueWatchingItem);
    } else if (progressPercent >= 95) {
      // When playback completes, handle movies and TV shows differently.
      // Movies: remove from continue watching.
      // TV: place the next episode (or remove if this was the final episode).
      this.continueWatchingManager.handleCompletePlayback(
        media,
        this.currentEpisode(),
        this.playlist()?.id
      );
    }

    // If the user has mostly finished a TV episode, proactively recommend the next
    // episode in Continue Watching. We mark this once per media playback to avoid
    // spamming the board with repeated writes.
    if (
      media.media_type === "tv" &&
      !this.recommendedNextEpisodeSent() &&
      progressPercent >= 90 &&
      progressPercent < 95
    ) {
      this.recommendedNextEpisodeSent.set(true);
      this.continueWatchingManager.maybeRecommendNextEpisode(
        media as TvShowDetails,
        episode || undefined,
        this.playlist()?.id
      );
    }

    // Auto-play next when playback completes.
    // For TV shows, prefer sequential episode progression; for movies,
    // jump to the next playlist item (if present). We only trigger for
    // providers that support auto-next to avoid duplicates for providers
    // that perform their own in-player navigation.
    const provider = this.playerProviderService.getProvider(
      this.selectedPlayer()
    );

    if (
      provider?.supportsAutoNext &&
      this.playerService.autoNextEnabled() &&
      this.playerHasStarted() &&
      !this.autoPlayNextTriggered() &&
      this.playerService.tryLockAutoNext() &&
      // Require meaningful playback time to avoid false triggers from initial duration weirdness
      currentTime > 30 &&
      // Use a threshold to catch end of video reliably for players that don't send an 'ended' event
      // Allow user to change the threshold via PlayerService; default 100% maps to 99.5
      (() => {
        const threshold = this.playerService.autoNextThreshold();
        const effective = threshold === 100 ? 99.5 : threshold;
        return progressPercent >= effective;
      })()
    ) {
      // If media is TV show — advance to next episode if any, else try playlist
      // If media is a movie — try playlist next item.
      this.autoPlayNextTriggered.set(true);
      if (media.media_type === "tv") {
        this.playNextEpisode(media as TvShowDetails);
      } else if (media.media_type === "movie") {
        const didNavigate = this.tryPlayNextPlaylistItem(media as MovieDetails);
        if (!didNavigate) {
          // No playlist next item — nothing to do. Unlock the auto-next lock to
          // allow other events to proceed.
          this.playerService.unlockAutoNext();
        }
      }
    }
  }

  /**
   * Handle a completed playback event for the provided media.
   * - For movies: remove from Continue Watching
   * - For TV shows: try to add the next episode to Continue Watching; if none exists, remove.
   * - If a playlist next item exists, prefer that (keeps playlist semantics consistent with playNextEpisode)
   */
  // handleCompletePlayback moved to ContinueWatchingManagerService

  private handleEpisodeChangeDetection(
    data: { season: number; episode: number },
    media: TvShowDetails
  ): void {
    const playerEpisode: PlayerEpisodeState = {
      season: data.season,
      episode: data.episode,
    };

    // Get the current episode from our app's state (from params)
    const currentParams = untracked(() => this.params());
    const appEpisodeState: PlayerEpisodeState | null =
      currentParams?.season && currentParams?.episode
        ? { season: +currentParams.season, episode: +currentParams.episode }
        : null;

    // If the player state already matches the app state,
    // just update our internal 'last state' and exit to prevent a navigation loop.
    if (
      appEpisodeState &&
      appEpisodeState.season === playerEpisode.season &&
      appEpisodeState.episode === playerEpisode.episode
    ) {
      const lastPlayerState = this.lastPlayerEpisodeState();
      // Only set if it's not already set, to avoid extra signal writes.
      if (
        !lastPlayerState ||
        lastPlayerState.season !== playerEpisode.season ||
        lastPlayerState.episode !== playerEpisode.episode
      ) {
        this.lastPlayerEpisodeState.set(playerEpisode);
      }
      // If the app params match the player but the current episode object is
      // the temporary placeholder (created from params while we load details),
      // fetch the season details so UI components like EpisodeSelector and
      // watchlist highlight the correct episode instance.
      const currentEp = this.currentEpisode();
      if (currentEp && currentEp.id === 0) {
        this.movieService
          .getSeasonDetails(media.id, playerEpisode.season)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe((seasonDetails) => {
            const matching = seasonDetails.episodes.find(
              (e) => e.episode_number === playerEpisode.episode
            );
            if (matching) {
              this.currentEpisode.set(matching);
            }
          });
      }
      return;
    }

    // If we've reached here, it means the player has navigated to a DIFFERENT episode
    // than what our app's URL params say. We need to check if we should sync our app.
    const lastPlayerState = this.lastPlayerEpisodeState();
    const hasPlayerChangedEpisode =
      !lastPlayerState ||
      lastPlayerState.season !== playerEpisode.season ||
      lastPlayerState.episode !== playerEpisode.episode;

    if (hasPlayerChangedEpisode) {
      // Check if this is likely a player-initiated auto-next (sequential episode progression)
      // If the user has set a custom threshold < 95%, we should ignore player auto-next
      // and let our app handle it at the user's preferred threshold
      const isSequentialNext =
        appEpisodeState &&
        playerEpisode.season === appEpisodeState.season &&
        playerEpisode.episode === appEpisodeState.episode + 1;

      const userThreshold = this.playerService.autoNextThreshold();
      const provider = this.playerProviderService.getProvider(
        this.selectedPlayer()
      );

      // If this looks like player auto-next AND user wants early triggering (< 95%),
      // ignore the player's navigation and let our app handle it at the user's threshold
      if (
        isSequentialNext &&
        provider?.supportsAutoNext &&
        this.playerService.autoNextEnabled() &&
        userThreshold < 95
      ) {
        // Ignore player-initiated auto-next, let app handle it at user's threshold
        this.lastPlayerEpisodeState.set(playerEpisode);
        return;
      }

      // Try to acquire lock to prevent duplicate navigation from both player and progress events
      if (!this.playerService.tryLockAutoNext()) {
        // Lock already held, just update our tracking and exit
        this.lastPlayerEpisodeState.set(playerEpisode);
        return;
      }

      this.lastPlayerEpisodeState.set(playerEpisode);

      // Mark that we're starting a navigation
      this.isNavigating.set(true);

      // Tell the component not to reload the iframe since the player did it internally.
      this.skipNextPlayerUpdate.set(true);

      // Update the URL and app state to match the player.
      this.navigationService.navigateTo("watch", {
        mediaType: "tv",
        id: media.id,
        season: playerEpisode.season,
        episode: playerEpisode.episode,
        playlistId: this.playlist()?.id,
        autoplay: true,
      });
      // Navigation complete, unlock for future auto-next
      this.playerService.unlockAutoNext();

      // Update the currentEpisode signal so the UI reflects the change.
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
            this.autoPlayNextTriggered.set(false);
          }
        });
    }
  }

  /**
   * Sync currentEpisode from player metadata even if navigation isn't triggered.
   * This ensures episode-selector highlights correctly when the player reports
   * episode data that matches our current route params.
   */
  private syncCurrentEpisodeFromPlayerData(
    data: { season: number; episode: number },
    media: TvShowDetails
  ): void {
    const currentEp = this.currentEpisode();

    // If currentEpisode already matches and has a valid id, no need to fetch
    if (
      currentEp &&
      currentEp.id > 0 &&
      currentEp.season_number === data.season &&
      currentEp.episode_number === data.episode
    ) {
      return;
    }

    // Check if URL params need updating (episode changed but URL is stale)
    const currentParams = untracked(() => this.params());
    const urlNeedsUpdate =
      currentParams?.season !== data.season ||
      currentParams?.episode !== data.episode;

    // If currentEpisode is null, a placeholder (id === 0), or doesn't match
    // the player's reported episode, fetch and update it
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
            (e) => e.episode_number === data.episode
          );
          if (matchingEpisode) {
            // Only update the UI selection; DO NOT update the URL from metadata.
            // URL updates should only happen via explicit navigation.
            this.currentEpisode.set(matchingEpisode);
          }
        });
    }
  }

  /**
   * Check if we can safely process episode change navigation.
   * Requires the player to have started and a small playback threshold to avoid
   * false positives from timeupdate events that include metadata.
   */
  private canProcessEpisodeChange(eventName?: string): boolean {
    // Consider events other than routine time updates as 'non-routine'.
    // Non-routine events (for example explicit player navigation events)
    // should be allowed to drive URL updates immediately, even when
    // playback hasn't reached the 5 second guard threshold.
    const nonRoutineEvent =
      typeof eventName === "string" &&
      !["timeupdate", "time", "seeking", "seeked"].includes(eventName);

    return (
      this.playerHasStarted() &&
      !this.isNavigating() &&
      (this.lastKnownPlaybackTime() >= 5 || nonRoutineEvent)
    );
  }

  private playNextEpisode(tvShow: TvShowDetails): void {
    const currentEp = this.currentEpisode();
    if (!currentEp) return;

    // First try to advance to the next episode in the series. Only if no
    // next episode or season is found should we fall back to the playlist
    // order (so playlists don't interrupt sequential show playback).

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
          console.warn(
            "Could not find current episode in season details. Auto-play cancelled."
          );
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
          const currentSeasonIndex = tvShow.seasons.findIndex(
            (s) => s.season_number === currentEp.season_number
          );

          if (currentSeasonIndex > -1) {
            // Search for the next season with episodes, skipping empty seasons.
            for (
              let i = currentSeasonIndex + 1;
              i < tvShow.seasons.length;
              i++
            ) {
              const nextSeasonObj = tvShow.seasons[i];
              // Also check for season_number > 0 to skip "specials" seasons
              if (
                nextSeasonObj &&
                nextSeasonObj.episode_count > 0 &&
                nextSeasonObj.season_number > 0
              ) {
                this.navigateToEpisode(
                  tvShow.id,
                  nextSeasonObj.season_number,
                  1
                );
                return; // Found and navigated, so exit.
              }
            }
          }
          // If no next season/episode is found, try to move to next item in
          // the playlist (if playing from a playlist). Otherwise end of
          // series — do nothing.
          const playlistId = this.playlist()?.id;
          if (playlistId) {
            const nextItem = this.playlistService.getNextItemFromPlaylist(
              playlistId,
              tvShow.id
            );
            if (nextItem) {
              this.navigationService.navigateTo("watch", {
                mediaType: nextItem.media_type,
                id: nextItem.id,
                playlistId: playlistId,
                autoplay: true,
              });
            }
          }
        }
      });
  }

  /**
   * If currently playing from a playlist, navigate to the next media item
   * (movie or tv) in that playlist. Returns true if navigation started.
   */
  private tryPlayNextPlaylistItem(
    media: MovieDetails | TvShowDetails
  ): boolean {
    const playlistId = this.playlist()?.id;
    if (!playlistId) return false;
    const nextItem = this.playlistService.getNextItemFromPlaylist(
      playlistId,
      media.id
    );
    if (!nextItem) return false;

    // Navigate to the next playlist item
    this.navigationService.navigateTo("watch", {
      mediaType: nextItem.media_type,
      id: nextItem.id,
      playlistId: playlistId,
      autoplay: true,
    });

    return true;
  }

  private navigateToEpisode(
    showId: number,
    season: number,
    episode: number
  ): void {
    this.skipNextPlayerUpdate.set(false);
    this.isNavigating.set(true);

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
    this.isNavigating.set(true);

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
    this.isNavigating.set(true);

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

  onClosePlaylist(): void {
    const media = this.selectedMediaItem();
    if (!media) return;

    const currentParams = this.params();

    this.navigationService.navigateTo("watch", {
      mediaType: media.media_type,
      id: media.id,
      season: currentParams?.season,
      episode: currentParams?.episode,
      // playlistId is omitted
    });
  }
}
