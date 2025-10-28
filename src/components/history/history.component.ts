import { Component, ChangeDetectionStrategy, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HistoryService } from '../../services/history.service';
import { HistoryItem } from '../../models/history.model';
import { HistoryItemCardComponent } from '../history-item-card/history-item-card.component';
import { NavigationService } from '../../services/navigation.service';
import { SubscribableChannel } from '../../models/movie.model';

@Component({
  selector: 'app-history',
  standalone: true,
  imports: [CommonModule, HistoryItemCardComponent],
  templateUrl: './history.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HistoryComponent {
  private historyService = inject(HistoryService);
  private navigationService = inject(NavigationService);

  history = this.historyService.history;
  confirmingClear = signal(false);
  searchQuery = signal('');
  isHistoryPaused = signal(false); // UI only for now

  filteredHistory = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    if (!query) {
      return this.history();
    }
    return this.history().filter(item => {
      const media = item.media;
      const title = media.media_type === 'movie' ? media.title : media.name;
      if (title.toLowerCase().includes(query)) {
        return true;
      }
      if (item.episode?.name?.toLowerCase().includes(query)) {
        return true;
      }
      return false;
    });
  });

  groupedHistory = computed(() => {
    const history = this.filteredHistory();
    if (history.length === 0) {
        return [];
    }

    const groups: { title: string; items: HistoryItem[] }[] = [];
    let lastGroupTitle = '';

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    for (const item of history) {
        const itemDate = new Date(item.watchedAt);
        itemDate.setHours(0, 0, 0, 0);

        let groupTitle: string;
        if (itemDate.getTime() === today.getTime()) {
            groupTitle = 'Today';
        } else if (itemDate.getTime() === yesterday.getTime()) {
            groupTitle = 'Yesterday';
        } else {
            groupTitle = itemDate.toLocaleDateString(undefined, {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
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

  onRemoveItem(id: string): void {
    this.historyService.removeFromHistory(id);
  }

  onClearHistory(): void {
    if (this.confirmingClear()) {
      this.historyService.clearHistory();
      this.confirmingClear.set(false);
    } else {
      this.confirmingClear.set(true);
      setTimeout(() => {
        if (this.confirmingClear()) {
          this.confirmingClear.set(false);
        }
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
    this.navigationService.navigateTo('watch', params);
  }

  onChannelClicked(channel: SubscribableChannel): void {
    this.navigationService.navigateTo('channel', channel);
  }

  updateSearchQuery(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
  }

  clearSearch(): void {
    this.searchQuery.set('');
  }

  togglePauseHistory(): void {
    this.isHistoryPaused.update(v => !v);
  }
}