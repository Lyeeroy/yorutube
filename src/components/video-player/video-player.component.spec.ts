import { TestBed } from "@angular/core/testing";
import { of } from "rxjs";
import { VideoPlayerComponent } from "./video-player.component";
import { MovieService } from "../../services/movie.service";
import { ContinueWatchingService } from "../../services/continue-watching.service";
import { PlaylistService } from "../../services/playlist.service";
import { NavigationService } from "../../services/navigation.service";
import { PlayerService } from "../../services/player.service";
import { PlaybackProgressService } from "../../services/playback-progress.service";
import { HistoryService } from "../../services/history.service";
import { PlayerProviderService } from "../../services/player-provider.service";
import { ContinueWatchingManagerService } from "../../services/continue-watching-manager.service";
import { ContinueWatchingItem } from "../../models/continue-watching.model";
import { TvShowDetails, MovieDetails, Episode } from "../../models/movie.model";

describe("VideoPlayerComponent: Continue Watching behavior", () => {
  let component: VideoPlayerComponent;

  const mockNavigationService = {} as any;
  const mockPlayerService = {
    autoplayEnabled: () => false,
    autoNextEnabled: () => false,
    tryLockAutoNext: () => true,
    unlockAutoNext: () => {},
  } as any;
  const mockPlaybackProgressService = {
    updateProgress: jasmine.createSpy("updateProgress"),
    getProgress: jasmine.createSpy("getProgress"),
  } as any;
  const mockHistoryService = {
    addToHistory: jasmine.createSpy("addToHistory"),
  } as any;
  const mockPlayerProviderService = {
    getAllowedOrigins: () => [],
    getProvider: () => undefined,
    getProviderByOrigin: () => undefined,
  } as any;

  beforeEach(() => {
    const mockMovieService = {
      getSeasonDetails: jasmine.createSpy("getSeasonDetails"),
    } as any;

    const mockContinue = {
      addItem: jasmine.createSpy("addItem"),
      removeItem: jasmine.createSpy("removeItem"),
      items: { subscribe: () => {} },
    } as unknown as ContinueWatchingService;

    const mockPlaylist = {
      getNextItemFromPlaylist: jasmine.createSpy("getNextItemFromPlaylist"),
    } as unknown as PlaylistService;

    TestBed.configureTestingModule({
      providers: [
        { provide: MovieService, useValue: mockMovieService },
        { provide: ContinueWatchingService, useValue: mockContinue },
        { provide: PlaylistService, useValue: mockPlaylist },
        { provide: NavigationService, useValue: mockNavigationService },
        { provide: PlayerService, useValue: mockPlayerService },
        {
          provide: PlaybackProgressService,
          useValue: mockPlaybackProgressService,
        },
        { provide: HistoryService, useValue: mockHistoryService },
        { provide: PlayerProviderService, useValue: mockPlayerProviderService },
        ContinueWatchingManagerService,
      ],
      imports: [VideoPlayerComponent],
    });

    const fixture = TestBed.createComponent(VideoPlayerComponent);
    component = fixture.componentInstance;
  });

  it("removes movie from continue watching on complete", () => {
    const movie = { id: 100, media_type: "movie" } as MovieDetails;
    const mockContinue = TestBed.inject(ContinueWatchingService);

    const manager = TestBed.inject(ContinueWatchingManagerService);
    manager.handleCompletePlayback(movie, undefined);

    expect(mockContinue.removeItem).toHaveBeenCalledWith(100);
  });

  it("advances TV to next episode in same season", () => {
    const tv: TvShowDetails = {
      id: 200,
      media_type: "tv",
      seasons: [
        { season_number: 1, episode_count: 3 },
        { season_number: 2, episode_count: 2 },
      ],
    } as any;
    const curEpisode: Episode = {
      id: 1,
      season_number: 1,
      episode_number: 2,
    } as any;

    const mockMovieService = TestBed.inject(MovieService) as any;
    mockMovieService.getSeasonDetails.and.returnValue(
      of({
        episodes: [
          { episode_number: 1 },
          { episode_number: 2 },
          { episode_number: 3 },
        ],
      } as any)
    );

    const cw = TestBed.inject(ContinueWatchingService) as any;

    const manager = TestBed.inject(ContinueWatchingManagerService);
    manager.handleCompletePlayback(tv, curEpisode);

    expect(mockMovieService.getSeasonDetails).toHaveBeenCalledWith(200, 1);
    expect(cw.addItem).toHaveBeenCalled();
    const added = cw.addItem.calls.mostRecent().args[0] as Omit<
      ContinueWatchingItem,
      "updatedAt"
    >;
    expect(added.id).toBe(200);
    expect(added.episode?.episode_number).toBe(3);
  });

  it("removes TV from continue watching when no next episode or season exists", () => {
    const tv: TvShowDetails = {
      id: 300,
      media_type: "tv",
      seasons: [{ season_number: 1, episode_count: 1 }],
    } as any;
    const curEpisode: Episode = {
      id: 2,
      season_number: 1,
      episode_number: 1,
    } as any;

    const mockMovieService = TestBed.inject(MovieService) as any;
    mockMovieService.getSeasonDetails.and.returnValue(
      of({ episodes: [{ episode_number: 1 }] } as any)
    );

    const cw = TestBed.inject(ContinueWatchingService) as any;

    const manager = TestBed.inject(ContinueWatchingManagerService);
    manager.handleCompletePlayback(tv, curEpisode);

    expect(mockMovieService.getSeasonDetails).toHaveBeenCalledWith(300, 1);
    expect(cw.removeItem).toHaveBeenCalledWith(300);
  });

  it("recommends next episode at 90% progress for TV", () => {
    const tv: TvShowDetails = {
      id: 400,
      media_type: "tv",
      seasons: [{ season_number: 1, episode_count: 3 }],
    } as any;
    const curEpisode: Episode = {
      id: 10,
      season_number: 1,
      episode_number: 2,
    } as any;

    const mockMovieService = TestBed.inject(MovieService) as any;
    mockMovieService.getSeasonDetails.and.returnValue(
      of({
        episodes: [
          { episode_number: 1 },
          { episode_number: 2 },
          { episode_number: 3 },
        ],
      } as any)
    );

    const cw = TestBed.inject(ContinueWatchingService) as any;

    // Set the current episode on the component so the method will find it
    component["currentEpisode"].set(curEpisode);

    component["handlePlaybackProgress"](
      { currentTime: 60, duration: 120, progressPercent: 90 },
      tv
    );

    // We should have added an entry with the next episode (3)
    expect(cw.addItem).toHaveBeenCalled();
    const added = cw.addItem.calls.mostRecent().args[0] as Omit<
      ContinueWatchingItem,
      "updatedAt"
    >;
    expect(added.episode?.episode_number).toBe(3);
  });

  it("only recommends next episode once per playback", () => {
    const tv: TvShowDetails = {
      id: 410,
      media_type: "tv",
      seasons: [{ season_number: 1, episode_count: 3 }],
    } as any;
    const curEpisode: Episode = {
      id: 12,
      season_number: 1,
      episode_number: 2,
    } as any;

    const mockMovieService = TestBed.inject(MovieService) as any;
    mockMovieService.getSeasonDetails.and.returnValue(
      of({
        episodes: [
          { episode_number: 1 },
          { episode_number: 2 },
          { episode_number: 3 },
        ],
      } as any)
    );

    const cw = TestBed.inject(ContinueWatchingService) as any;

    component["currentEpisode"].set(curEpisode);
    // first time: triggers recommendation
    component["handlePlaybackProgress"](
      { currentTime: 30, duration: 120, progressPercent: 90 },
      tv
    );
    // second time: should not recommend again
    component["handlePlaybackProgress"](
      { currentTime: 31, duration: 120, progressPercent: 92 },
      tv
    );

    expect(cw.addItem.calls.count()).toBeGreaterThan(0);
    // Should only be recommended once by our signal guard
    expect(cw.addItem.calls.count()).toBe(1);
  });
});
