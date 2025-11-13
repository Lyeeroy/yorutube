import { Component, ChangeDetectionStrategy, input, output, signal, ElementRef, inject, OnInit, OnDestroy, DestroyRef, viewChild, effect, AfterViewInit } from '@angular/core';
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
  private checkScrollTimeout: number | null = null; // FIX: Track timeout ID
  private hasLoadedContent = false; // FIX: Prevent duplicate loads
  
  scrollContainer = viewChild<ElementRef<HTMLElement>>('scrollContainer');

  canScrollLeft = signal(false);
  canScrollRight = signal(false);
  
  // Drag-to-scroll properties
  private isMouseDown = false;
  private startX = 0;
  private scrollLeft = 0;
  private hasDragged = false;
  isGrabbing = signal(false);

  constructor() {
    effect(() => {
      // FIX: Clear any pending timeout before scheduling a new one
      if (this.checkScrollTimeout !== null) {
        clearTimeout(this.checkScrollTimeout);
      }
      
      this.media(); 
      this.scrollContainer();
      
      this.checkScrollTimeout = window.setTimeout(() => {
        this.checkScroll();
        this.checkScrollTimeout = null;
      }, 100);
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
    // FIX: Clear timeout on destroy
    if (this.checkScrollTimeout !== null) {
      clearTimeout(this.checkScrollTimeout);
    }
  }

  private loadContent(): void {
    // FIX: Guard against multiple calls
    if (this.hasLoadedContent) return;
    this.hasLoadedContent = true;
    
    this.loading.set(true);
    this.fetchFn$().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (data) => {
        this.media.set(data);
        this.loading.set(false);
      },
      error: (err) => {
        this.media.set([]);
        this.loading.set(false);
        console.error(`Error loading content for category "${this.title()}":`, err);
      },
    });
  }
  
  checkScroll(): void {
    const element = this.scrollContainer()?.nativeElement;
    if (!element) return;
    
    const hasOverflow = element.scrollWidth > element.clientWidth;
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

  onMouseDown(e: MouseEvent): void {
    // FIX: Check if the click originated inside a modal or other fixed element.
    // This prevents the drag-scroll from interfering with modal interactions.
    let targetElement = e.target as HTMLElement | null;
    while (targetElement && targetElement !== e.currentTarget) {
        if (window.getComputedStyle(targetElement).position === 'fixed') {
            return; // It's a modal, don't start drag.
        }
        targetElement = targetElement.parentElement;
    }

    const element = this.scrollContainer()?.nativeElement;
    if (!element) return;
    
    e.preventDefault(); // Prevent text selection during drag
    
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
    if (!this.isMouseDown) return;
    e.preventDefault();
    const element = this.scrollContainer()?.nativeElement;
    if (!element) return;

    const x = e.pageX - element.offsetLeft;
    const walk = x - this.startX;
    
    if (Math.abs(walk) > 5) {
        this.hasDragged = true;
    }

    element.scrollLeft = this.scrollLeft - walk;
  }

  onMediaClicked(media: MediaType) {
    if (this.hasDragged) {
      return;
    }
    this.mediaClicked.emit(media);
  }
}