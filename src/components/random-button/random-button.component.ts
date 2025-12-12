import {
  Component,
  ChangeDetectionStrategy,
  signal,
  inject,
  HostListener,
  OnInit,
  computed,
  ViewChild,
  ElementRef,
} from "@angular/core";
import { CommonModule, NgOptimizedImage } from "@angular/common";
import { MovieService } from "../../services/movie.service";
import { NavigationService } from "../../services/navigation.service";
import { DiscoverParams, MediaType } from "../../models/movie.model";
import { forkJoin, map, of } from "rxjs";

interface GenreOption {
  id: number;
  name: string;
  types: ("movie" | "tv")[];
  movieIds: number[];
  tvIds: number[];
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
        /* overflow: hidden; - Removed to allow scrolling when interactive */
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
        height: 45px; /* Fixed height for 2 lines */
      }
      .item-meta {
        color: #aaa;
        font-size: 14px;
      }
      @keyframes fadeInUp {
        from {
          opacity: 0;
          transform: translateY(20px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      .animate-fade-in-up {
        animation: fadeInUp 0.8s ease-out both;
      }
      .winner-reveal-container {
        display: grid;
        grid-template-rows: 0fr;
        transition: grid-template-rows 0.8s cubic-bezier(0.4, 0, 0.2, 1);
      }
      .winner-reveal-container.open {
        grid-template-rows: 1fr;
      }
      .winner-reveal-inner {
        overflow: hidden;
      }
      .progress-ring__circle {
        transition: stroke-dashoffset 5s linear;
        transform: rotate(-90deg);
        transform-origin: 50% 50%;
      }
    `,
  ],
})
export class RandomButtonComponent implements OnInit {
  private movieService = inject(MovieService);
  private navigationService = inject(NavigationService);
  
  @ViewChild('rouletteContainer') rouletteContainer!: ElementRef<HTMLDivElement>;

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
    const supportedTypes = new Set<string>();
    this.genres().forEach((g) => {
      if (selected.has(g.id)) {
        g.types.forEach((t) => supportedTypes.add(t));
      }
    });

    // If we have selected genres but none of them map to a supported type (shouldn't happen with correct data),
    // then it's invalid.
    if (supportedTypes.size === 0) return false;

    const validTypes = types.filter((t) => {
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
  autoNavTimer: any = null;
  isAutoNavCancelled = signal(false);
  isInteractive = signal(false);
  isWinnerRevealed = signal(false);
  uniqueResults = signal<MediaType[]>([]);

  winnerGenres = computed(() => {
    const winner = this.winnerItem();
    if (!winner) return [];
    const allGenres = this.genres();
    return winner.genre_ids
      .map((id) => allGenres.find((g) => g.id === id)?.name)
      .filter((name): name is string => !!name);
  });

  // Drag-to-scroll properties
  private isMouseDown = false;
  private startX = 0;
  private scrollLeft = 0;
  private hasDragged = false;
  isGrabbing = signal(false);

  // Timers
  private spinTimeout: any;
  private startTimeout: any;
  private revealTimeout: any;

  ngOnInit() {
    forkJoin([
      this.movieService.getMovieGenreMap(),
      this.movieService.getTvGenreMap(),
    ]).subscribe(([movieMap, tvMap]) => {
      const genreGroups = new Map<string, { name: string, movieIds: number[], tvIds: number[] }>();

      const process = (map: Map<number, string>, type: 'movie' | 'tv') => {
        map.forEach((originalName, id) => {
            let name = originalName;
            // Normalization
            if (name === "Action & Adventure") name = "Action";
            if (name === "Science Fiction") name = "Sci-Fi";
            if (name === "Sci-Fi & Fantasy") name = "Sci-Fi";
            if (name === "War & Politics") name = "War";
            if (name === "Kids") name = "Family"; 
            
            if (!genreGroups.has(name)) {
                genreGroups.set(name, { name, movieIds: [], tvIds: [] });
            }
            const group = genreGroups.get(name)!;
            if (type === 'movie') group.movieIds.push(id);
            else group.tvIds.push(id);
        });
      };

      process(movieMap, 'movie');
      process(tvMap, 'tv');

      const options: GenreOption[] = [];
      genreGroups.forEach((group) => {
          const types: ("movie" | "tv")[] = [];
          if (group.movieIds.length > 0) types.push("movie");
          if (group.tvIds.length > 0) types.push("tv");
          
          // Use the first available ID as the unique ID for the UI
          const id = group.movieIds.length > 0 ? group.movieIds[0] : group.tvIds[0];
          
          options.push({
              id,
              name: group.name,
              types,
              movieIds: group.movieIds,
              tvIds: group.tvIds
          });
      });

      const sorted = options.sort((a, b) => a.name.localeCompare(b.name));
      this.genres.set(sorted);
    });
  }

  clearTimers() {
    if (this.spinTimeout) clearTimeout(this.spinTimeout);
    if (this.startTimeout) clearTimeout(this.startTimeout);
    if (this.revealTimeout) clearTimeout(this.revealTimeout);
    this.cancelAutoNav();
  }

  cancelAutoNav() {
    if (this.autoNavTimer) {
      clearTimeout(this.autoNavTimer);
      this.autoNavTimer = null;
    }
    this.isAutoNavCancelled.set(true);
  }

  reroll() {
    this.clearTimers();
    this.onRandomSearch();
  }

  closeRoulette() {
    this.clearTimers();
    this.showRoulette.set(false);
    this.winnerItem.set(null);
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

  private isAnime(item: MediaType): boolean {
    return item.original_language === 'ja' && item.genre_ids.includes(16);
  }

  private shuffle<T>(arr: T[]) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  private sample<T>(arr: T[], count: number) {
    if (arr.length <= count) return [...arr];
    const copy = [...arr];
    this.shuffle(copy);
    return copy.slice(0, count);
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

    // Build requests
    const requests: { type: 'movie' | 'tv', bucket?: 'movie' | 'tv' | 'anime', isAnime: boolean, params: DiscoverParams }[] = [];
    const maxAge = this.randomMaxAge();
    const currentYear = new Date().getFullYear();
    const minYear = currentYear - maxAge;
    const releaseDateGte = `${minYear}-01-01`;

    validTypes.forEach(t => {
        if (t === 'movie') {
            requests.push({
                type: 'movie',
              bucket: 'movie',
              isAnime: false,
              params: {
                  type: 'movie',
                  release_date_gte: releaseDateGte,
                  sort_by: 'popularity.desc',
                  page: 1,
                  with_genres: this.buildGenreQuery('movie', selectedGenres)
              }
          });
      } else if (t === 'tv') {
          requests.push({
              type: 'tv',
              bucket: 'tv',
              isAnime: false,
              params: {
                  type: 'tv',
                  release_date_gte: releaseDateGte,
                  sort_by: 'popularity.desc',
                  page: 1,
                  with_genres: this.buildGenreQuery('tv', selectedGenres)
              }
          });
      } else if (t === 'anime') {
          // Add both Movie and TV for Anime to ensure mix, but mark both as 'anime' bucket
          requests.push({
              type: 'movie',
              bucket: 'anime',
              isAnime: true,
              params: {
                  type: 'movie',
                  release_date_gte: releaseDateGte,
                  sort_by: 'popularity.desc',
                  page: 1,
                  with_original_language: 'ja',
                  with_genres: this.buildAnimeGenreQuery('movie', selectedGenres)
              }
          });
          requests.push({
              type: 'tv',
              bucket: 'anime',
              isAnime: true,
              params: {
                    type: 'tv',
                    release_date_gte: releaseDateGte,
                    sort_by: 'popularity.desc',
                    page: 1,
                    with_original_language: 'ja',
                    with_genres: this.buildAnimeGenreQuery('tv', selectedGenres)
                }
            });
        }
    });

    // Execute initial requests to get total pages
    const initialCalls$ = requests.map(req => 
        this.movieService.discoverMedia(req.params).pipe(
            map(res => ({ req, total_pages: res.total_pages }))
        )
    );

    forkJoin(initialCalls$).subscribe(initialResults => {
        const validResults = initialResults.filter(r => r.total_pages > 0);
        if (validResults.length === 0) return;

        // Execute random page requests
        const finalCalls$ = validResults.map(item => {
            const maxPage = Math.min(item.total_pages, 20);
            const randomPage = Math.floor(Math.random() * maxPage) + 1;
            return this.movieService.discoverMedia({ ...item.req.params, page: randomPage }).pipe(
                map(res => ({ req: item.req, results: res.results }))
            );
        });

        forkJoin(finalCalls$).subscribe(finalResults => {
            // Group results by logical bucket
            const buckets: Record<string, MediaType[]> = { movie: [], tv: [], anime: [] };

            finalResults.forEach(item => {
                const bucket = item.req.bucket || item.req.type;
                let filtered = item.results;
                if (item.req.isAnime) {
                    filtered = filtered.filter(m => this.isAnime(m));
                } else {
                    filtered = filtered.filter(m => !this.isAnime(m));
                }

                buckets[bucket] = buckets[bucket].concat(filtered);
            });

            // Determine active buckets
            const activeBuckets = Object.keys(buckets).filter(k => buckets[k].length > 0);
            if (activeBuckets.length === 0) return;

            // Decide the desired pool size (before duplicating for longer spin)
            const desiredPoolSize = 80; // will be duplicated later
            const perBucket = Math.floor(desiredPoolSize / activeBuckets.length);

            let pooled: MediaType[] = [];

            // Sample evenly from each bucket
            activeBuckets.forEach((bk) => {
                const list = buckets[bk];
                const sampleCount = Math.max(1, Math.min(perBucket, list.length));
                pooled = pooled.concat(this.sample(list, sampleCount));
            });

            // If we are short, fill remaining slots from buckets with leftover
            let remaining = desiredPoolSize - pooled.length;
            if (remaining > 0) {
                const poolLeftovers = activeBuckets.flatMap(bk => buckets[bk].filter(i => !pooled.find(p => p.id === i.id)));
                if (poolLeftovers.length > 0) {
                    pooled = pooled.concat(this.sample(poolLeftovers, remaining));
                }
            }

            // Deduplicate by id
            const dedup = new Map<number, MediaType>();
            pooled.forEach(i => dedup.set(i.id, i));
            pooled = Array.from(dedup.values());

            if (pooled.length === 0) return;

            // Store unique results for the "scroll through items" view
            this.uniqueResults.set(pooled);

            // Prepare roulette items (ensure plenty of items)
            let items = [...pooled];
            while (items.length < 80) {
              items = items.concat(pooled);
            }
            this.shuffle(items);

            // Pick a winner near the end (e.g., index 60-75)
            const winnerIndex = Math.floor(Math.random() * 15) + 60;
            const winner = items[winnerIndex];

            this.startRoulette(items, winnerIndex, winner);
        });
    });
  }

  // Helper to build genre query
  buildGenreQuery(type: 'movie' | 'tv', selectedGenres: Set<number>): string | undefined {
      if (selectedGenres.size === 0) return undefined;
      const ids: number[] = [];
      selectedGenres.forEach(id => {
          const g = this.genres().find(gen => gen.id === id);
          if (g) {
              if (type === 'movie') ids.push(...g.movieIds);
              else ids.push(...g.tvIds);
          }
      });
      return ids.length > 0 ? ids.join('|') : undefined;
  }

  buildAnimeGenreQuery(type: 'movie' | 'tv', selectedGenres: Set<number>): string {
      if (selectedGenres.size === 0) return '16';
      const ids: number[] = [];
      selectedGenres.forEach(id => {
          const g = this.genres().find(gen => gen.id === id);
          if (g) {
              if (type === 'movie') ids.push(...g.movieIds);
              else ids.push(...g.tvIds);
          }
      });
      
      if (ids.length === 0) return '16';
      
      // (16 AND ID1) OR (16 AND ID2) ...
      return ids.map(id => `16,${id}`).join('|');
  }

  onMouseDown(e: MouseEvent): void {
    if (!this.isInteractive()) return;
    const element = this.rouletteContainer?.nativeElement;
    if (!element) return;

    e.preventDefault();
    this.isMouseDown = true;
    this.hasDragged = false;
    this.isGrabbing.set(true);
    this.startX = e.pageX - element.offsetLeft;
    this.scrollLeft = element.scrollLeft;
  }

  onMouseLeave(): void {
    this.isMouseDown = false;
    this.isGrabbing.set(false);
  }

  onMouseUp(): void {
    this.isMouseDown = false;
    this.isGrabbing.set(false);
  }

  onMouseMove(e: MouseEvent): void {
    if (!this.isMouseDown || !this.isInteractive()) return;
    e.preventDefault();
    const element = this.rouletteContainer?.nativeElement;
    if (!element) return;

    const x = e.pageX - element.offsetLeft;
    const walk = x - this.startX;

    if (Math.abs(walk) > 5) {
      this.hasDragged = true;
    }

    element.scrollLeft = this.scrollLeft - walk;
  }

  onItemClick(item: MediaType) {
    if (this.hasDragged) return;
    if (this.isInteractive()) {
      this.watchNow(item);
    }
  }

  watchNow(item: MediaType) {
    this.closeRoulette();
    this.navigationService.navigateTo("watch", {
      mediaType: item.media_type,
      id: item.id,
    });
  }

  startRoulette(items: MediaType[], winnerIndex: number, winner: MediaType) {
    this.clearTimers(); // Ensure no previous timers are running

    this.rouletteItems.set(items);
    this.winnerItem.set(null);
    this.showRoulette.set(true);
    this.visible.set(false); // Close the menu
    this.isAutoNavCancelled.set(false);
    this.isInteractive.set(false);
    this.isWinnerRevealed.set(false);

    // Reset position
    this.rouletteTransition.set("none");
    this.rouletteTransform.set("translateX(0px)");

    // Reset scroll position (critical for reroll to ensure track is aligned and red line visible)
    if (this.rouletteContainer) {
      this.rouletteContainer.nativeElement.scrollLeft = 0;
    }

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
    this.startTimeout = setTimeout(() => {
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
      this.spinTimeout = setTimeout(() => {
        this.winnerItem.set(winner);
        
        // Switch to interactive mode
        const finalTranslateX = targetX + jitter;
        this.isInteractive.set(true);
        
        // Apply scroll position to match the transform
        // Use requestAnimationFrame to ensure DOM is updated
        requestAnimationFrame(() => {
          if (this.rouletteContainer) {
            // translateX is negative (moving left), so scrollLeft is positive (scrolling right)
            this.rouletteContainer.nativeElement.scrollLeft = -finalTranslateX;
          }
        });

        // Wait a bit showing the winner then navigate
        // Use a small delay to trigger the height animation
        this.revealTimeout = setTimeout(() => {
           this.isWinnerRevealed.set(true);
        }, 50);

        this.autoNavTimer = setTimeout(() => {
          if (!this.isAutoNavCancelled()) {
            this.navigationService.navigateTo("watch", {
              mediaType: winner.media_type,
              id: winner.id,
            });
            this.showRoulette.set(false);
          }
        }, 5000); // Increased to 5s
      }, 6000);
    }, 100);
  }
}
