import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { WatchlistService } from '../../services/watchlist.service';
import { MediaType } from '../../models/movie.model';
import { toSignal } from '@angular/core/rxjs-interop';
import { MovieService } from '../../services/movie.service';
import { NavigationService } from '../../services/navigation.service';
import { SearchResultCardComponent } from '../search-result-card/search-result-card.component';

@Component({
  selector: 'app-watchlist',
  standalone: true,
  imports: [CommonModule, SearchResultCardComponent, FormsModule],
  templateUrl: './watchlist.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WatchlistComponent {
  private watchlistService = inject(WatchlistService);
  private movieService = inject(MovieService);
  private navigationService = inject(NavigationService);
  
  mediaItems = this.watchlistService.watchlist;
  genreMap = toSignal(this.movieService.getCombinedGenreMap(), { initialValue: new Map() });
  
  searchQuery = signal('');
  confirmingClear = signal(false);

  filteredMediaItems = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const items = this.mediaItems();
    if (!query) {
      return items;
    }
    return items.filter(item => {
      const title = item.media_type === 'movie' ? item.title : item.name;
      return title.toLowerCase().includes(query);
    });
  });

  onMediaClicked(media: MediaType) {
    this.navigationService.navigateTo('watch', { mediaType: media.media_type, id: media.id });
  }

  clearWatchlist(): void {
    if (this.confirmingClear()) {
      this.watchlistService.clearWatchlist();
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

  clearSearch(): void {
    this.searchQuery.set('');
  }
}
