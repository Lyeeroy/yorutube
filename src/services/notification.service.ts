import { Injectable, signal, effect, inject } from '@angular/core';
import { Notification } from '../models/notification.model';
import { WatchlistService } from './watchlist.service';
import { MovieService } from './movie.service';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { MovieDetails, TvShowDetails } from '../models/movie.model';

const NOTIFICATIONS_KEY = 'yorutube-notifications';
const LAST_CHECKED_KEY = 'yorutube-notifications-last-checked';

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private watchlistService = inject(WatchlistService);
  private movieService = inject(MovieService);

  notifications = signal<Notification[]>([]);

  constructor() {
    this.loadFromStorage();
    effect(() => {
      this.saveToStorage(this.notifications());
    });
  }

  private loadFromStorage(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
        const stored = localStorage.getItem(NOTIFICATIONS_KEY);
        if (stored) {
            try {
                this.notifications.set(JSON.parse(stored));
            } catch (e) {
                console.error('Error parsing notifications from localStorage', e);
            }
        }
    }
  }

  private saveToStorage(notifications: Notification[]): void {
    if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(notifications));
    }
  }

  checkForUpdates(): void {
    if (typeof window === 'undefined' || !window.localStorage) {
        return;
    }

    const lastCheckedStr = localStorage.getItem(LAST_CHECKED_KEY);
    const lastChecked = lastCheckedStr ? new Date(lastCheckedStr) : new Date(0);
    const now = new Date();

    // Check only once per hour to avoid spamming TMDB API
    if (now.getTime() - lastChecked.getTime() < 3600 * 1000) {
        return;
    }

    const watchlist = this.watchlistService.watchlist();
    if (watchlist.length === 0) {
      localStorage.setItem(LAST_CHECKED_KEY, now.toISOString());
      return;
    }
    
    const observables = watchlist.map(item => {
        if (item.media_type === 'movie') {
            return this.movieService.getMovieDetails(item.id).pipe(catchError(() => of(null)));
        } else {
            return this.movieService.getTvShowDetails(item.id).pipe(catchError(() => of(null)));
        }
    });

    forkJoin(observables).subscribe(detailsArray => {
      const newNotifications: Notification[] = [];
      const filteredDetails = detailsArray.filter((d): d is MovieDetails | TvShowDetails => d !== null);

      filteredDetails.forEach((details) => {
        const mediaItem = watchlist.find(w => w.id === details.id && w.media_type === details.media_type);
        if (!mediaItem) return;

        const isMovie = details.media_type === 'movie';
        
        if (isMovie) {
          const releaseDate = new Date(details.release_date);
          if (releaseDate > lastChecked && releaseDate <= now) {
            const id = `movie-${details.id}`;
            if (!this.notifications().some(n => n.id === id)) {
              newNotifications.push({
                id,
                media: mediaItem,
                message: `'${details.title}' has been released.`,
                timestamp: releaseDate.getTime(),
                isRead: false
              });
            }
          }
        } else { // TV Show
          const lastEpisode = (details as TvShowDetails).last_episode_to_air;
          if (lastEpisode) {
            const airDate = new Date(lastEpisode.air_date);
            if (airDate > lastChecked && airDate <= now) {
              const id = `tv-${details.id}-${lastEpisode.id}`;
               if (!this.notifications().some(n => n.id === id)) {
                  newNotifications.push({
                    id,
                    media: mediaItem,
                    message: `A new episode of '${details.name}' is available: S${lastEpisode.season_number}E${lastEpisode.episode_number} - ${lastEpisode.name}.`,
                    timestamp: airDate.getTime(),
                    isRead: false
                  });
               }
            }
          }
        }
      });

      if (newNotifications.length > 0) {
        this.notifications.update(current => [...newNotifications, ...current].sort((a, b) => b.timestamp - a.timestamp));
      }
      localStorage.setItem(LAST_CHECKED_KEY, now.toISOString());
    });
  }

  markAsRead(notificationId: string): void {
    this.notifications.update(notifications =>
      notifications.map(n => (n.id === notificationId ? { ...n, isRead: true } : n))
    );
  }

  markAllAsRead(): void {
    this.notifications.update(notifications =>
      notifications.map(n => ({ ...n, isRead: true }))
    );
  }
}