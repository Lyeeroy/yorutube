import {
  Component,
  ChangeDetectionStrategy,
  inject,
  computed,
  signal,
  OnDestroy,
  ViewChild,
  ElementRef,
  AfterViewInit,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { HistoryService } from "../../services/history.service";
import { HistoryItem } from "../../models/history.model";
import { HistoryItemCardComponent } from "../history-item-card/history-item-card.component";
import { NavigationService } from "../../services/navigation.service";
import { SubscribableChannel } from "../../models/movie.model";
import { ContinueWatchingComponent } from "../continue-watching/continue-watching.component";
import { ContinueWatchingService } from "../../services/continue-watching.service";
import { PlaybackProgressService } from "../../services/playback-progress.service";

@Component({
  selector: "app-history",
  standalone: true,
  imports: [CommonModule, HistoryItemCardComponent, ContinueWatchingComponent],
  templateUrl: "./history.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HistoryComponent implements OnDestroy, AfterViewInit {
  private historyService = inject(HistoryService);
  private navigationService = inject(NavigationService);
  private continueWatchingService = inject(ContinueWatchingService);
  private playbackProgressService = inject(PlaybackProgressService);

  private clearHistoryTimeout: ReturnType<typeof setTimeout> | null = null;
  private clearContinueWatchingTimeout: ReturnType<typeof setTimeout> | null =
    null;
  private observer: IntersectionObserver | null = null;

  @ViewChild("sentinel") sentinel!: ElementRef<HTMLElement>;

  history = this.historyService.history;
  confirmingClear = signal(false);
  confirmingClearContinueWatching = signal(false);
  searchQuery = signal("");
  isHistoryPaused = this.historyService.isPaused;
  displayLimit = signal(20);

  filteredHistory = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    if (!query) {
      return this.history();
    }
    return this.history().filter((item) => {
      const media = item.media;
      const title = media.media_type === "movie" ? media.title : media.name;
      if (title.toLowerCase().includes(query)) {
        return true;
      }
      if (item.episode?.name?.toLowerCase().includes(query)) {
        return true;
      }
      return false;
    });
  });

  visibleHistory = computed(() => {
    return this.filteredHistory().slice(0, this.displayLimit());
  });

  groupedHistory = computed(() => {
    const history = this.visibleHistory();
    if (history.length === 0) {
      return [];
    }

    const groups: { title: string; items: HistoryItem[] }[] = [];
    let lastGroupTitle = "";

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    for (const item of history) {
      const itemDate = new Date(item.watchedAt);
      itemDate.setHours(0, 0, 0, 0);

      let groupTitle: string;
      if (itemDate.getTime() === today.getTime()) {
        groupTitle = "Today";
      } else if (itemDate.getTime() === yesterday.getTime()) {
        groupTitle = "Yesterday";
      } else {
        groupTitle = itemDate.toLocaleDateString(undefined, {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        });
      }

      if (groupTitle !== lastGroupTitle) {
        groups.push({ title: groupTitle, items: [item] });
        lastGroupTitle = groupTitle;
      } else {
        groups[groups.length - 1].items.push(item);
      }
    }
    return groups;
  });

  ngAfterViewInit() {
    this.setupObserver();
  }

  private setupObserver() {
    if (this.observer) {
      this.observer.disconnect();
    }

    this.observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          this.loadMore();
        }
      },
      { rootMargin: "200px" } // Load more before reaching the very bottom
    );

    if (this.sentinel) {
      this.observer.observe(this.sentinel.nativeElement);
    }
  }

  loadMore() {
    const currentLimit = this.displayLimit();
    const totalItems = this.filteredHistory().length;

    if (currentLimit < totalItems) {
      this.displayLimit.update((limit) => limit + 20);
    }
  }

  onRemoveItem(id: string): void {
    const item = this.history().find((h) => h.id === id);
    if (item) {
      // Clear progress using the correct ID (episode.id for TV shows, media.id for movies)
      const progressId = item.episode ? item.episode.id : item.media.id;
      this.playbackProgressService.clearProgress(progressId);
      // Don't remove from continue watching - let it stay independently
    }
    this.historyService.removeFromHistory(id);
  }

  onClearHistory(): void {
    if (this.confirmingClear()) {
      if (this.clearHistoryTimeout) {
        clearTimeout(this.clearHistoryTimeout);
        this.clearHistoryTimeout = null;
      }
      this.historyService.clearHistory();
      this.playbackProgressService.clearAll();
      this.confirmingClear.set(false);
    } else {
      this.confirmingClear.set(true);
      this.clearHistoryTimeout = setTimeout(() => {
        if (this.confirmingClear()) {
          this.confirmingClear.set(false);
        }
        this.clearHistoryTimeout = null;
      }, 3000);
    }
  }

  onMediaClicked(item: HistoryItem): void {
    const { media, episode } = item;
    const params: any = { mediaType: media.media_type, id: media.id };
    if (episode) {
      params.season = episode.season_number;
      params.episode = episode.episode_number;
    }
    this.navigationService.navigateTo("watch", params);
  }

  onChannelClicked(channel: SubscribableChannel): void {
    this.navigationService.navigateTo("channel", channel);
  }

  updateSearchQuery(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
    this.displayLimit.set(20);
  }

  clearSearch(): void {
    this.searchQuery.set("");
    this.displayLimit.set(20);
  }

  togglePauseHistory(): void {
    this.historyService.togglePaused();
  }

  onClearContinueWatching(): void {
    if (this.confirmingClearContinueWatching()) {
      if (this.clearContinueWatchingTimeout) {
        clearTimeout(this.clearContinueWatchingTimeout);
        this.clearContinueWatchingTimeout = null;
      }
      this.continueWatchingService.clearAll();
      this.confirmingClearContinueWatching.set(false);
    } else {
      this.confirmingClearContinueWatching.set(true);
      this.clearContinueWatchingTimeout = setTimeout(() => {
        if (this.confirmingClearContinueWatching()) {
          this.confirmingClearContinueWatching.set(false);
        }
        this.clearContinueWatchingTimeout = null;
      }, 3000);
    }
  }

  ngOnDestroy(): void {
    if (this.clearHistoryTimeout) {
      clearTimeout(this.clearHistoryTimeout);
    }
    if (this.clearContinueWatchingTimeout) {
      clearTimeout(this.clearContinueWatchingTimeout);
    }
    if (this.observer) {
      this.observer.disconnect();
    }
  }
}
