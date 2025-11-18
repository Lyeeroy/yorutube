import { Injectable, inject } from "@angular/core";
import { MovieService } from "./movie.service";
import { PlaylistService } from "./playlist.service";
import { ContinueWatchingService } from "./continue-watching.service";
import { TvShowDetails, Episode, MovieDetails } from "../models/movie.model";
import { ContinueWatchingItem } from "../models/continue-watching.model";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { DestroyRef } from "@angular/core";

@Injectable({ providedIn: "root" })
export class ContinueWatchingManagerService {
  private movieService = inject(MovieService);
  private playlistService = inject(PlaylistService);
  private continueWatchingService = inject(ContinueWatchingService);
  private destroyRef = inject(DestroyRef);

  /**
   * Recommend the next episode for TV shows when the user has nearly finished
   * the current episode. Prefers playlist next item if present.
   */
  maybeRecommendNextEpisode(
    media: TvShowDetails,
    episode?: Episode,
    playlistId?: string
  ): void {
    if (playlistId) {
      const nextItem = this.playlistService.getNextItemFromPlaylist(
        playlistId,
        media.id
      );
      if (nextItem) {
        const continueItem: Omit<ContinueWatchingItem, "updatedAt"> = {
          id: nextItem.id,
          media: nextItem,
          episode: undefined,
        };
        this.continueWatchingService.addItem(continueItem);
        return;
      }
    }

    const currentEp = episode;
    if (!currentEp) return;

    this.movieService
      .getSeasonDetails(media.id, currentEp.season_number)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((seasonDetails) => {
        const episodes = seasonDetails.episodes || [];
        const idx = episodes.findIndex(
          (e) => e.episode_number === currentEp.episode_number
        );

        if (idx !== -1 && idx < episodes.length - 1) {
          const nextEpisode = episodes[idx + 1];
          const continueItem: Omit<ContinueWatchingItem, "updatedAt"> = {
            id: media.id,
            media: media,
            episode: nextEpisode,
          };
          this.continueWatchingService.addItem(continueItem);
          return;
        }

        const currentSeasonIndex = media.seasons.findIndex(
          (s) => s.season_number === currentEp.season_number
        );
        if (currentSeasonIndex > -1) {
          for (let i = currentSeasonIndex + 1; i < media.seasons.length; i++) {
            const nextSeasonObj = media.seasons[i];
            if (
              nextSeasonObj &&
              nextSeasonObj.episode_count > 0 &&
              nextSeasonObj.season_number > 0
            ) {
              this.movieService
                .getSeasonDetails(media.id, nextSeasonObj.season_number)
                .pipe(takeUntilDestroyed(this.destroyRef))
                .subscribe((sd) => {
                  const firstEp = sd.episodes.find((e) => e.episode_number > 0);
                  if (firstEp) {
                    const continueItem: Omit<
                      ContinueWatchingItem,
                      "updatedAt"
                    > = {
                      id: media.id,
                      media: media,
                      episode: firstEp,
                    };
                    this.continueWatchingService.addItem(continueItem);
                  }
                });
              return;
            }
          }
        }
      });
  }

  /**
   * Handle completed playback for movies or TV shows.
   * If media is a movie — remove from continue watching.
   * For TV shows — prefer playlist next item, else find following episode or remove.
   */
  handleCompletePlayback(
    media: MovieDetails | TvShowDetails,
    episode?: Episode | null,
    playlistId?: string
  ): void {
    if (media.media_type === "movie") {
      this.continueWatchingService.removeItem(media.id);
      return;
    }

    if (playlistId) {
      const nextItem = this.playlistService.getNextItemFromPlaylist(
        playlistId,
        media.id
      );
      if (nextItem) {
        const continueItem: Omit<ContinueWatchingItem, "updatedAt"> = {
          id: nextItem.id,
          media: nextItem,
          episode: undefined,
        };
        this.continueWatchingService.addItem(continueItem);
        return;
      }
    }

    const currentEp = episode;
    if (!currentEp) {
      this.continueWatchingService.removeItem(media.id);
      return;
    }

    this.movieService
      .getSeasonDetails(media.id, currentEp.season_number)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((seasonDetails) => {
        const episodes = seasonDetails.episodes || [];
        const idx = episodes.findIndex(
          (e) => e.episode_number === currentEp.episode_number
        );

        if (idx !== -1 && idx < episodes.length - 1) {
          const nextEpisode = episodes[idx + 1];
          const continueItem: Omit<ContinueWatchingItem, "updatedAt"> = {
            id: media.id,
            media: media,
            episode: nextEpisode,
          };
          this.continueWatchingService.addItem(continueItem);
          return;
        }

        const currentSeasonIndex = media.seasons.findIndex(
          (s) => s.season_number === currentEp.season_number
        );
        if (currentSeasonIndex > -1) {
          for (let i = currentSeasonIndex + 1; i < media.seasons.length; i++) {
            const nextSeasonObj = media.seasons[i];
            if (
              nextSeasonObj &&
              nextSeasonObj.episode_count > 0 &&
              nextSeasonObj.season_number > 0
            ) {
              this.movieService
                .getSeasonDetails(media.id, nextSeasonObj.season_number)
                .pipe(takeUntilDestroyed(this.destroyRef))
                .subscribe((sd) => {
                  const firstEp = sd.episodes.find((e) => e.episode_number > 0);
                  if (firstEp) {
                    const continueItem: Omit<
                      ContinueWatchingItem,
                      "updatedAt"
                    > = {
                      id: media.id,
                      media: media,
                      episode: firstEp,
                    };
                    this.continueWatchingService.addItem(continueItem);
                  } else {
                    this.continueWatchingService.removeItem(media.id);
                  }
                });
              return;
            }
          }
        }

        this.continueWatchingService.removeItem(media.id);
      });
  }
}
