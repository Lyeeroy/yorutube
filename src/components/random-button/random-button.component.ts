import {
  Component,
  ChangeDetectionStrategy,
  signal,
  inject,
  HostListener,
  OnInit,
  computed,
} from "@angular/core";
import { CommonModule, NgOptimizedImage } from "@angular/common";
import { MovieService } from "../../services/movie.service";
import { NavigationService } from "../../services/navigation.service";
import { DiscoverParams, MediaType } from "../../models/movie.model";
import { forkJoin } from "rxjs";

interface GenreOption {
  id: number;
  name: string;
  types: ("movie" | "tv")[];
}

@Component({
  selector: "app-random-button",
  standalone: true,
  imports: [CommonModule, NgOptimizedImage],
  templateUrl: "./random-button.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      .roulette-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(15, 15, 15, 0.95);
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-direction: column;
      }
      .roulette-container {
        width: 100%;
        max-width: 1200px;
        height: 320px;
        background: transparent;
        position: relative;
        overflow: hidden;
      }
      .roulette-track {
        display: flex;
        height: 100%;
        will-change: transform;
        align-items: center;
      }
      .roulette-item {
        width: 320px;
        height: auto;
        flex-shrink: 0;
        position: relative;
        display: flex;
        flex-direction: column;
        padding: 0 8px;
      }
      .roulette-item img {
        width: 100%;
        aspect-ratio: 16/9;
        object-fit: cover;
        border-radius: 12px;
        margin-bottom: 12px;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
      }
      .center-line {
        position: absolute;
        left: 50%;
        top: 40px;
        bottom: 40px;
        width: 4px;
        background: #ff0000;
        transform: translateX(-50%);
        z-index: 10;
        box-shadow: 0 0 10px rgba(255, 0, 0, 0.5);
        border-radius: 2px;
        pointer-events: none;
      }
      .center-line::before,
      .center-line::after {
        content: "";
        position: absolute;
        left: 50%;
        transform: translateX(-50%);
        border-left: 8px solid transparent;
        border-right: 8px solid transparent;
      }
      .center-line::before {
        top: -5px;
        border-top: 8px solid #ff0000;
      }
      .center-line::after {
        bottom: -5px;
        border-bottom: 8px solid #ff0000;
      }
      .item-info {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 0 4px;
      }
      .item-title {
        color: white;
        font-weight: 500;
        font-size: 16px;
        line-height: 1.4;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .item-meta {
        color: #aaa;
        font-size: 14px;
      }
    `,
  ],
})
export class RandomButtonComponent implements OnInit {
  private movieService = inject(MovieService);
  private navigationService = inject(NavigationService);

  // UI state
  visible = signal(false);
  randomTvShow = signal(true);
  randomMovie = signal(true);
  randomAnime = signal(true);
  randomMaxAge = signal(20);

  // Genre state
  genres = signal<GenreOption[]>([]);
  selectedGenres = signal<Set<number>>(new Set());
  genresExpanded = signal(false);

  isSelectionValid = computed(() => {
    const types: ("movie" | "tv" | "anime")[] = [];
    if (this.randomTvShow()) types.push("tv");
    if (this.randomMovie()) types.push("movie");
    if (this.randomAnime()) types.push("anime");

    if (types.length === 0) return false;

    const selected = this.selectedGenres();
    if (selected.size === 0) return true;

    // Anime searches both, so it's usually valid unless the genre is totally obscure (but we don't check that deep)
    if (types.includes("anime")) return true;

    // Check if ANY selected genre is compatible with ANY selected type
    // Actually, we need to ensure that for the selected type, there is at least one valid genre if we are filtering by genre.
    // But since we pick a random type first, we just need to ensure that the pool isn't empty.
    // If I select "Action" (Movie) and "Comedy" (Movie/TV) and enable only "TV",
    // then "Action" is invalid for TV, but "Comedy" is valid.
    // So if we pick TV, we can filter by Comedy.
    // If we pick Movie, we can filter by Action OR Comedy.

    // So we need to check if there is at least one intersection between (Selected Types) and (Types supported by Selected Genres).
    // Let's collect all types supported by the selected genres.
    const supportedTypes = new Set<string>();
    this.genres().forEach((g) => {
      if (selected.has(g.id)) {
        g.types.forEach((t) => supportedTypes.add(t));
      }
    });

    const validTypes = types.filter((t) => {
      if (t === "anime") return true; // Anime is special
      return supportedTypes.has(t);
    });

    return validTypes.length > 0;
  });

  // Roulette state
  showRoulette = signal(false);
  rouletteItems = signal<MediaType[]>([]);
  rouletteTransform = signal("translateX(0px)");
  rouletteTransition = signal("none");
  winnerItem = signal<MediaType | null>(null);

  ngOnInit() {
    forkJoin([
      this.movieService.getMovieGenreMap(),
      this.movieService.getTvGenreMap(),
    ]).subscribe(([movieMap, tvMap]) => {
      const options = new Map<number, GenreOption>();

      movieMap.forEach((name, id) => {
        options.set(id, { id, name, types: ["movie"] });
      });

      tvMap.forEach((name, id) => {
        if (options.has(id)) {
          const existing = options.get(id)!;
          existing.types.push("tv");
        } else {
          options.set(id, { id, name, types: ["tv"] });
        }
      });

      const sorted = Array.from(options.values()).sort((a, b) =>
        a.name.localeCompare(b.name)
      );
      this.genres.set(sorted);
    });
  }

  toggleGenresExpanded() {
    this.genresExpanded.update((v) => !v);
  }

  toggleGenre(genreId: number) {
    this.selectedGenres.update((set) => {
      const newSet = new Set(set);
      if (newSet.has(genreId)) {
        newSet.delete(genreId);
      } else {
        newSet.add(genreId);
      }
      return newSet;
    });
  }

  clearGenres() {
    this.selectedGenres.set(new Set());
  }

  toggleVisible(event: MouseEvent): void {
    event.stopPropagation();
    this.visible.update((v) => !v);
  }

  close(): void {
    this.visible.set(false);
  }

  toggleRandomTvShow(): void {
    this.randomTvShow.update((v) => !v);
  }

  toggleRandomMovie(): void {
    this.randomMovie.update((v) => !v);
  }

  toggleRandomAnime(): void {
    this.randomAnime.update((v) => !v);
  }

  setRandomMaxAge(value: any): void {
    const num = Number(value);
    if (!isNaN(num)) this.randomMaxAge.set(num);
  }

  @HostListener("document:click", ["$event"])
  onDocClick(event: MouseEvent): void {
    if (
      this.visible() &&
      !(event.target as HTMLElement).closest("app-random-button") &&
      !this.showRoulette()
    ) {
      this.close();
    }
  }

  @HostListener("document:keydown.escape", ["$event"])
  onDocEscape(_event: KeyboardEvent): void {
    if (this.showRoulette()) {
      // Prevent closing during spin? Or allow cancelling?
      // Let's allow cancelling for UX
      this.showRoulette.set(false);
      this.winnerItem.set(null);
    } else if (this.visible()) {
      this.close();
    }
  }

  onRandomSearch(): void {
    const types: ("movie" | "tv" | "anime")[] = [];
    if (this.randomTvShow()) types.push("tv");
    if (this.randomMovie()) types.push("movie");
    if (this.randomAnime()) types.push("anime");

    // Filter types based on genre
    const selectedGenres = this.selectedGenres();
    let validTypes = types;

    if (selectedGenres.size > 0) {
      // We need to filter out types that don't support ANY of the selected genres.
      // E.g. if I select "Action" (Movie) and "News" (TV), and I have both Movie and TV enabled.
      // If I pick Movie, I should filter by Action.
      // If I pick TV, I should filter by News.
      // If I pick Anime, I ignore genres for now (or pass them if they match).

      // Let's refine validTypes.
      validTypes = types.filter((t) => {
        if (t === "anime") return true;
        // Check if this type supports at least one selected genre
        return this.genres().some(
          (g) => selectedGenres.has(g.id) && g.types.includes(t)
        );
      });
    }

    if (validTypes.length === 0) return;

    const selectedType =
      validTypes[Math.floor(Math.random() * validTypes.length)];
    const maxAge = this.randomMaxAge();
    const currentYear = new Date().getFullYear();
    const minYear = currentYear - maxAge;
    const releaseDateGte = `${minYear}-01-01`;

    const baseParams: DiscoverParams = {
      type: selectedType,
      release_date_gte: releaseDateGte,
      sort_by: "popularity.desc",
      page: 1,
    };

    if (selectedGenres.size > 0) {
      // Filter genres relevant to the selected type
      const relevantGenres = Array.from(selectedGenres).filter((id) => {
        const g = this.genres().find((gen) => gen.id === id);
        if (!g) return false;
        if (selectedType === "anime") return true; // Pass all to anime? Or just anime ones?
        return g.types.includes(selectedType);
      });

      if (relevantGenres.length > 0) {
        // Use pipe for OR logic
        baseParams.with_genres = relevantGenres.join("|");
      }
    }

    this.movieService.discoverMedia(baseParams).subscribe({
      next: (initialRes) => {
        if (initialRes.total_pages === 0 || initialRes.results.length === 0)
          return;

        const maxPage = Math.min(initialRes.total_pages, 50);
        const randomPage = Math.floor(Math.random() * maxPage) + 1;

        const getPage$ =
          randomPage === 1
            ? this.movieService.discoverMedia({ ...baseParams, page: 1 })
            : this.movieService.discoverMedia({
                ...baseParams,
                page: randomPage,
              });

        getPage$.subscribe((res) => {
          if (res.results.length === 0) return;

          // Prepare roulette items
          // We need enough items for a long spin.
          // Let's duplicate the results 5 times (20 * 5 = 100 items)
          let items = [...res.results];
          while (items.length < 80) {
            items = [...items, ...res.results];
          }
          // Shuffle slightly to avoid obvious patterns if we just duplicated
          items = items.sort(() => Math.random() - 0.5);

          // Pick a winner near the end (e.g., index 60-75)
          const winnerIndex = Math.floor(Math.random() * 15) + 60;
          const winner = items[winnerIndex];

          this.startRoulette(items, winnerIndex, winner);
        });
      },
      error: (err) => console.error("Random search failed", err),
    });
  }

  startRoulette(items: MediaType[], winnerIndex: number, winner: MediaType) {
    this.rouletteItems.set(items);
    this.winnerItem.set(null);
    this.showRoulette.set(true);
    this.visible.set(false); // Close the menu

    // Reset position
    this.rouletteTransition.set("none");
    this.rouletteTransform.set("translateX(0px)");

    // Item width is 160px.
    // We want the winner to be centered.
    // Container width is dynamic (max 1000px).
    // Center of container is 50%.
    // Center of winner item is (winnerIndex * 160) + (160 / 2).
    // We want to translate left by: (Center of winner) - (Center of container).
    // Since container width varies, let's assume we translate relative to the viewport center or just use a large offset.
    // Actually, simpler:
    // TranslateX = - (winnerIndex * 160) + (ContainerWidth / 2) - (ItemWidth / 2)
    // But we can't easily get ContainerWidth in signal without element ref.
    // Let's approximate or use calc().
    // transform: translateX(calc(50vw - (winnerIndex * 160px) - 80px)) if full width?
    // The container is max 1000px.
    // Let's just center it visually.
    // We can add a random offset within the item width to make it land "imperfectly" like CSGO.
    const itemWidth = 320;
    const randomOffset = Math.floor(Math.random() * (itemWidth - 20)) + 10; // Random spot inside the card
    // We want to move the track to the left.
    // Target position: - (winnerIndex * itemWidth)
    // Plus we want to center that item in the viewport/container.
    // Let's assume container is centered.
    // We can use `calc(50% - ${winnerIndex * itemWidth}px - ${itemWidth/2}px + ${randomOffset}px)`?
    // No, `randomOffset` should be the landing position.
    // Let's just aim for the center of the item for now.
    // Target X = - (winnerIndex * itemWidth) + (ContainerWidth / 2) - (ItemWidth / 2)

    // Let's trigger the animation after a brief delay to ensure DOM render
    setTimeout(() => {
      const containerWidth = Math.min(window.innerWidth, 1000);
      const centerOffset = containerWidth / 2 - itemWidth / 2;
      const targetX = -(winnerIndex * itemWidth) + centerOffset;
      // Add some randomness to where it lands within the item (optional, but requested "like CSGO")
      const jitter = Math.floor(Math.random() * 100) - 50; // +/- 50px

      this.rouletteTransition.set(
        "transform 6s cubic-bezier(0.15, 0, 0.10, 1)"
      ); // Slow down effect
      this.rouletteTransform.set(`translateX(${targetX + jitter}px)`);

      // Wait for animation to finish
      setTimeout(() => {
        this.winnerItem.set(winner);
        // Wait a bit showing the winner then navigate
        setTimeout(() => {
          this.navigationService.navigateTo("watch", {
            mediaType: winner.media_type,
            id: winner.id,
          });
          this.showRoulette.set(false);
        }, 2000);
      }, 6000);
    }, 100);
  }
}
