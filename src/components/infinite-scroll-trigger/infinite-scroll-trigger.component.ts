import { Component, ChangeDetectionStrategy, output, ElementRef, inject, OnInit, OnDestroy } from '@angular/core';

@Component({
  selector: 'app-infinite-scroll-trigger',
  standalone: true,
  template: '',
  host: {
    class: 'block w-full h-px'
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InfiniteScrollTriggerComponent implements OnInit, OnDestroy {
  intersect = output<void>();
  
  private elementRef = inject(ElementRef);
  private observer: IntersectionObserver | null = null;

  ngOnInit() {
    this.observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        this.intersect.emit();
      }
    }, {
      rootMargin: '0px 0px 400px 0px', // Trigger when 400px from bottom
    });
    this.observer.observe(this.elementRef.nativeElement);
  }

  ngOnDestroy() {
    this.observer?.disconnect();
  }
}
