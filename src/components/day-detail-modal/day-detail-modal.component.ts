import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { MediaType } from '../../models/movie.model';
import { NgOptimizedImage } from '@angular/common';

// Local interface from calendar component, for typing.
interface CalendarDay {
  date: Date;
  releases: MediaType[];
}

@Component({
  selector: 'app-day-detail-modal',
  standalone: true,
  imports: [CommonModule, NgOptimizedImage, DatePipe],
  templateUrl: './day-detail-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DayDetailModalComponent {
  day = input.required<CalendarDay>();
  close = output<void>();
  mediaClicked = output<MediaType>();
}
