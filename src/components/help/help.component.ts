import { Component, ChangeDetectionStrategy, signal, OnInit, OnDestroy, effect } from '@angular/core';
import { CommonModule } from '@angular/common';

interface Section {
  id: string;
  title: string;
}

@Component({
  selector: 'app-help',
  templateUrl: './help.component.html',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HelpComponent implements OnInit, OnDestroy {
  private observer?: IntersectionObserver;
  activeSection = signal<string>('disclaimer');

  sections: Section[] = [
    { id: 'disclaimer', title: 'Disclaimer' },
    { id: 'ad-free', title: 'Ad-Free Experience' },
    { id: 'extensions', title: 'Recommended Extensions' }
  ];

  ngOnInit() {
    // Set up Intersection Observer to track which section is currently active
    const options = {
      root: null, // use viewport
      rootMargin: '-10% 0px -80% 0px', // Active when section hits top part of screen
      threshold: 0
    };

    this.observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          this.activeSection.set(entry.target.id);
        }
      });
    }, options);

    // Wait a bit for DOM to render, then observe all sections
    setTimeout(() => {
      this.sections.forEach(section => {
        const element = document.getElementById(section.id);
        if (element) {
          this.observer?.observe(element);
        }
      });
    }, 100);
  }

  ngOnDestroy() {
    this.observer?.disconnect();
  }

  scrollToSection(sectionId: string) {
    const element = document.getElementById(sectionId);
    if (element) {
      // Use scrollIntoView which works with the overflow-y-auto container
      element.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'start',
        inline: 'nearest'
      });
      
      this.activeSection.set(sectionId);
    }
  }
}
