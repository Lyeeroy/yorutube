import { Component, ChangeDetectionStrategy, input, output, signal, ElementRef, inject, OnInit, OnDestroy, DestroyRef, viewChild, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { fromEvent, Observable } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { VideoCardComponent } from '../video-card/video-card.component';
import { MediaType, SubscribableChannel } from '../../models/movie.model';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-content-category',
  standalone: true,
  imports: [CommonModule, VideoCardComponent],
  templateUrl: './content-category.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContentCategoryComponent implements OnInit, OnDestroy {
  title = input.required<string>();
  fetchFn$ = input.required<Observable<MediaType[]>>();
  genreMap = input.required<Map<number, string>>();
  isPriorityCategory = input<boolean>(false);
  mediaClicked = output<MediaType>();

  media = signal<MediaType[]>([]);
  loading = signal(true);

  private elementRef = inject(ElementRef);
  private destroyRef = inject(DestroyRef);
  private observer: IntersectionObserver | null = null;
  
  scrollContainer = viewChild<ElementRef<HTMLElement>>('scrollContainer');

  canScrollLeft = signal(false);
  canScrollRight = signal(false);

  constructor() {
    effect(() => {
        // When media changes, or scroll container becomes available, check scroll.
        // This needs to happen after the DOM updates.
        // A small timeout helps ensure the DOM is painted.
        this.media(); 
        this.scrollContainer();
        setTimeout(() => this.checkScroll(), 100);
    });
  }

  ngOnInit() {
    this.observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        this.loadContent();
        this.observer?.disconnect();
      }
    }, { rootMargin: '200px' });
    this.observer.observe(this.elementRef.nativeElement);

    fromEvent(window, 'resize').pipe(
        debounceTime(200),
        takeUntilDestroyed(this.destroyRef)
    ).subscribe(() => this.checkScroll());
  }

  ngOnDestroy() {
    this.observer?.disconnect();
  }

  private loadContent(): void {
    this.loading.set(true);
    this.fetchFn$().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (data) => {
        this.media.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.media.set([]);
        this.loading.set(false);
      },
    });
  }
  
  checkScroll(): void {
    const element = this.scrollContainer()?.nativeElement;
    if (!element) return;
    
    const hasOverflow = element.scrollWidth > element.clientWidth;
    // A little tolerance for floating point inaccuracies
    const atStart = element.scrollLeft < 5;
    const atEnd = element.scrollWidth - element.clientWidth - element.scrollLeft < 5;
    
    this.canScrollLeft.set(hasOverflow && !atStart);
    this.canScrollRight.set(hasOverflow && !atEnd);
  }

  scroll(direction: 'left' | 'right'): void {
    const element = this.scrollContainer()?.nativeElement;
    if (!element) return;

    const scrollAmount = element.clientWidth * 0.75;
    const scrollValue = direction === 'left' ? -scrollAmount : scrollAmount;
    
    element.scrollBy({
      left: scrollValue,
      behavior: 'smooth'
    });
  }

  onMediaClicked(media: MediaType) {
    this.mediaClicked.emit(media);
  }
}
