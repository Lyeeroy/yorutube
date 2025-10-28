import { Component, ChangeDetectionStrategy, signal, inject, computed, effect, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { MovieService } from '../../services/movie.service';
import { MediaType, Movie, TvShow } from '../../models/movie.model';
import { toSignal } from '@angular/core/rxjs-interop';
import { MediaDetailModalComponent } from '../media-detail-modal/media-detail-modal.component';
import { NgOptimizedImage } from '@angular/common';
import { DayDetailModalComponent } from '../day-detail-modal/day-detail-modal.component';

interface CalendarDay {
  date: Date;
  releases: MediaType[];
  displayReleases: MediaType[];
  moreCount: number;
}

interface CalendarWeek {
  days: CalendarDay[];
}

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [CommonModule, MediaDetailModalComponent, NgOptimizedImage, DatePipe, DayDetailModalComponent],
  templateUrl: './calendar.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CalendarComponent implements OnInit {
  private movieService = inject(MovieService);

  loading = signal(true);
  allReleases = signal<MediaType[]>([]);
  weeks = signal<CalendarWeek[]>([]);
  
  // Month navigation
  displayMonth = signal(new Date());
  private viewStartDate = signal<Date | null>(null);

  // Filters
  activeMediaType = signal<'all' | 'movie' | 'tv' | 'anime'>('all');
  selectedGenre = signal<number | null>(null);

  // Modal state
  selectedMedia = signal<MediaType | null>(null);
  selectedDay = signal<CalendarDay | null>(null);

  private movieGenres = toSignal(this.movieService.getMovieGenreMap());
  private tvGenres = toSignal(this.movieService.getTvGenreMap());

  availableGenres = computed(() => {
    const type = this.activeMediaType();
    let genreMap: Map<number, string> | undefined;

    if (type === 'movie') genreMap = this.movieGenres();
    else if (type === 'tv') genreMap = this.tvGenres();
    else {
      genreMap = new Map<number, string>([
        ...(this.movieGenres() ?? []),
        ...(this.tvGenres() ?? [])
      ]);
    }
    
    if (!genreMap) return [];
    
    const genres = Array.from(genreMap.entries()).map(([id, name]) => ({ id, name }));
    genres.sort((a, b) => a.name.localeCompare(b.name));
    return genres;
  });
  
  availableMonths = [
    'January', 'February', 'March', 'April', 'May', 'June', 
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  availableYears = computed(() => {
    const currentYear = new Date().getFullYear();
    const years: number[] = [];
    for (let i = currentYear + 5; i >= 1950; i--) {
      years.push(i);
    }
    return years;
  });

  filteredReleases = computed(() => {
    const all = this.allReleases();
    const type = this.activeMediaType();
    const genreId = this.selectedGenre();

    return all.filter(item => {
      let typeMatch: boolean;
      switch(type) {
        case 'all':
          typeMatch = true;
          break;
        case 'movie':
          typeMatch = item.media_type === 'movie';
          break;
        case 'tv':
          typeMatch = item.media_type === 'tv' && !item.genre_ids.includes(16);
          break;
        case 'anime':
          typeMatch = item.genre_ids.includes(16);
          break;
        default:
          typeMatch = true;
      }
      
      const genreMatch = !genreId || item.genre_ids.includes(genreId);
      
      return typeMatch && genreMatch;
    });
  });

  constructor() {
    effect(() => {
      const releases = this.filteredReleases();
      const startDate = this.viewStartDate();
      if (startDate) {
        this.processReleasesIntoWeeks(releases, startDate);
      }
    });
  }

  ngOnInit() {
    this.fetchDataForMonth(this.displayMonth());
  }

  fetchDataForMonth(date: Date) {
    this.loading.set(true);
    
    const year = date.getFullYear();
    const month = date.getMonth();
    
    const firstDayOfMonth = new Date(year, month, 1);
    const startDate = new Date(firstDayOfMonth);
    const startDayOfWeek = (startDate.getDay() === 0 ? 6 : startDate.getDay() - 1); // Monday is 0
    startDate.setDate(startDate.getDate() - startDayOfWeek);
    startDate.setHours(0, 0, 0, 0);

    this.viewStartDate.set(new Date(startDate));
    
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + (6 * 7) - 1); // Fetch 6 weeks of data

    this.movieService.getReleasesInRange(startDate, endDate).subscribe(releases => {
      this.allReleases.set(releases.filter(r => (r as Movie).release_date || (r as TvShow).first_air_date));
      this.loading.set(false);
    });
  }

  processReleasesIntoWeeks(releases: MediaType[], startDate: Date) {
    const releasesByDate = new Map<string, MediaType[]>();
    releases.forEach(release => {
      const dateStr = (release as Movie).release_date || (release as TvShow).first_air_date;
      if (dateStr) {
        const dateKey = new Date(dateStr + 'T00:00:00Z').toISOString().split('T')[0];
        if (!releasesByDate.has(dateKey)) {
          releasesByDate.set(dateKey, []);
        }
        releasesByDate.get(dateKey)!.push(release);
      }
    });

    const newWeeks: CalendarWeek[] = [];
    const MAX_RELEASES_PER_DAY = 3;
    
    for (let i = 0; i < 6; i++) { // Generate 6 weeks for a full month view
      const week: CalendarWeek = { days: [] };
      for (let d = 0; d < 7; d++) {
        const dayDate = new Date(startDate);
        dayDate.setDate(startDate.getDate() + (i * 7) + d);
        const dateKey = dayDate.toISOString().split('T')[0];
        const dayReleases = (releasesByDate.get(dateKey) || []).sort((a,b) => (b.popularity ?? 0) - (a.popularity ?? 0));
        
        week.days.push({
          date: dayDate,
          releases: dayReleases,
          displayReleases: dayReleases.slice(0, MAX_RELEASES_PER_DAY),
          moreCount: Math.max(0, dayReleases.length - MAX_RELEASES_PER_DAY),
        });
      }
      newWeeks.push(week);
    }
    this.weeks.set(newWeeks);
  }

  previousMonth() {
    this.displayMonth.update(d => {
      const newDate = new Date(d);
      newDate.setMonth(newDate.getMonth() - 1);
      return newDate;
    });
    this.fetchDataForMonth(this.displayMonth());
  }

  nextMonth() {
    this.displayMonth.update(d => {
      const newDate = new Date(d);
      newDate.setMonth(newDate.getMonth() + 1);
      return newDate;
    });
    this.fetchDataForMonth(this.displayMonth());
  }

  goToToday() {
    const today = new Date();
    if (this.displayMonth().getMonth() !== today.getMonth() || this.displayMonth().getFullYear() !== today.getFullYear()) {
      this.displayMonth.set(today);
      this.fetchDataForMonth(this.displayMonth());
    }
  }

  onMonthChange(event: Event) {
    const newMonth = Number((event.target as HTMLSelectElement).value);
    this.displayMonth.update(d => {
      const newDate = new Date(d);
      newDate.setMonth(newMonth);
      return newDate;
    });
    this.fetchDataForMonth(this.displayMonth());
  }

  onYearChange(event: Event) {
    const newYear = Number((event.target as HTMLSelectElement).value);
    this.displayMonth.update(d => {
      const newDate = new Date(d);
      newDate.setFullYear(newYear);
      return newDate;
    });
    this.fetchDataForMonth(this.displayMonth());
  }

  isToday(date: Date): boolean {
    const today = new Date();
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
  }

  onMediaClick(media: MediaType) {
    this.selectedMedia.set(media);
  }

  onCloseModal() {
    this.selectedMedia.set(null);
  }

  openDayDetailModal(day: CalendarDay) {
    if (day.releases.length > 0) {
      this.selectedDay.set(day);
    }
  }

  onCloseDayDetailModal() {
    this.selectedDay.set(null);
  }

  setMediaType(type: 'all' | 'movie' | 'tv' | 'anime') {
    this.activeMediaType.set(type);
    this.selectedGenre.set(null);
  }

  onGenreChange(event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    this.selectedGenre.set(value ? Number(value) : null);
  }
}
