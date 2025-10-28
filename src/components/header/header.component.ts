import { Component, ChangeDetectionStrategy, output, signal, inject, computed, ElementRef, HostListener, viewChild } from '@angular/core';
import { SearchHistoryService } from '../../services/search-history.service';
import { NavigationService } from '../../services/navigation.service';
import { NotificationService } from '../../services/notification.service';
import { Notification } from '../../models/notification.model';
import { NgOptimizedImage } from '@angular/common';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  standalone: true,
  imports: [NgOptimizedImage],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeaderComponent {
  private searchHistoryService = inject(SearchHistoryService);
  private navigationService = inject(NavigationService);
  private notificationService = inject(NotificationService);
  private elementRef = inject(ElementRef);

  searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  searchQuery = signal('');
  mobileSearchActive = signal(false);
  historyVisible = signal(false);
  notificationsVisible = signal(false);
  
  hamburgerClick = output<void>();
  signInClicked = output<void>();

  searchHistory = this.searchHistoryService.history;
  notifications = this.notificationService.notifications;
  unreadNotificationCount = computed(() => this.notifications().filter(n => !n.isRead).length);

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.notificationsVisible() && !this.elementRef.nativeElement.contains(event.target)) {
      this.closeNotifications();
    }
  }

  onSearch(): void {
    const query = this.searchQuery().trim();
    if (query) {
        this.searchHistoryService.addSearchTerm(query);
        this.navigationService.navigateTo('search', { q: query });
    }
    if (this.mobileSearchActive()) {
      this.closeMobileSearch();
    }
    this.historyVisible.set(false);
  }

  updateSearchQuery(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.searchQuery.set(input.value);
  }

  clearSearchQuery(): void {
    this.searchQuery.set('');
    this.searchInput()?.nativeElement.focus();
  }

  onLogoClick(): void {
    this.searchQuery.set('');
    this.navigationService.navigateTo('home');
  }

  openMobileSearch(): void {
    this.mobileSearchActive.set(true);
  }

  closeMobileSearch(): void {
    this.mobileSearchActive.set(false);
  }

  closeHistoryWithDelay(): void {
    // Delay closing to allow click events on history items to register
    setTimeout(() => this.historyVisible.set(false), 200);
  }
  
  onHistorySearch(term: string): void {
    this.searchQuery.set(term);
    this.onSearch();
  }

  removeHistoryItem(event: MouseEvent, term: string): void {
    event.stopPropagation();
    this.searchHistoryService.removeSearchTerm(term);
  }

  toggleNotifications(event: MouseEvent): void {
    event.stopPropagation();
    this.notificationsVisible.update(v => !v);
  }

  closeNotifications(): void {
    this.notificationsVisible.set(false);
  }

  onNotificationClick(notification: Notification): void {
    this.notificationService.markAsRead(notification.id);
    this.navigationService.navigateTo('watch', { mediaType: notification.media.media_type, id: notification.media.id });
    this.closeNotifications();
  }

  markAllAsRead(): void {
    this.notificationService.markAllAsRead();
  }

  getRelativeTime(timestamp: number): string {
    const now = new Date();
    const seconds = Math.floor((now.getTime() - timestamp) / 1000);
    
    let interval = seconds / 31536000;
    if (interval > 1) {
      const years = Math.floor(interval);
      return `${years} year${years > 1 ? 's' : ''}`;
    }
    interval = seconds / 2592000;
    if (interval > 1) {
      const months = Math.floor(interval);
      return `${months} month${months > 1 ? 's' : ''}`;
    }
    interval = seconds / 86400;
    if (interval > 1) {
      const days = Math.floor(interval);
      return `${days} day${days > 1 ? 's' : ''}`;
    }
    interval = seconds / 3600;
    if (interval > 1) {
      const hours = Math.floor(interval);
      return `${hours} hour${hours > 1 ? 's' : ''}`;
    }
    interval = seconds / 60;
    if (interval > 1) {
      const minutes = Math.floor(interval);
      return `${minutes} minute${minutes > 1 ? 's' : ''}`;
    }
    return 'Just now';
  }
}
