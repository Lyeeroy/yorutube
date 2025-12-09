import {
  Component,
  ChangeDetectionStrategy,
  output,
  signal,
  inject,
  computed,
  ElementRef,
  HostListener,
  viewChild,
} from "@angular/core";
import { SearchHistoryService } from "../../services/search-history.service";
import { NavigationService } from "../../services/navigation.service";
import { NotificationService } from "../../services/notification.service";
import { Notification } from "../../models/notification.model";
import { NgOptimizedImage } from "@angular/common";

@Component({
  selector: "app-header",
  templateUrl: "./header.component.html",
  standalone: true,
  imports: [NgOptimizedImage],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeaderComponent {
  private searchHistoryService = inject(SearchHistoryService);
  private navigationService = inject(NavigationService);
  private notificationService = inject(NotificationService);
  private elementRef = inject(ElementRef);

  searchInput = viewChild<ElementRef<HTMLInputElement>>("searchInput");

  searchQuery = signal("");
  mobileSearchActive = signal(false);
  historyVisible = signal(false);
  notificationsVisible = signal(false);
  // Mobile overflow menu for items hidden on smaller breakpoints
  overflowVisible = signal(false);
  // when the mobile overflow menu has an inline notifications preview
  overflowShowNotifications = signal(false);

  hamburgerClick = output<void>();
  signInClicked = output<void>();

  searchHistory = this.searchHistoryService.history;
  // currently selected history item (when navigating with arrow keys)
  selectedHistoryTerm = signal<string | null>(null);
  notifications = this.notificationService.notifications;
  unreadNotificationCount = computed(
    () => this.notifications().filter((n) => !n.isRead).length
  );

  @HostListener("document:click", ["$event"])
  onDocumentClick(event: MouseEvent): void {
    if (
      (this.notificationsVisible() || this.overflowVisible()) &&
      !this.elementRef.nativeElement.contains(event.target)
    ) {
      this.closeNotifications();
      this.closeOverflow();
    }
  }

  @HostListener('document:keydown.escape', ['$event'])
  onDocumentEscape(_event: KeyboardEvent): void {
    // Close small popups with Escape
    if (this.overflowVisible()) {
      this.closeOverflow();
    }
    if (this.notificationsVisible()) {
      this.closeNotifications();
    }
    if (this.overflowShowNotifications()) {
      this.overflowShowNotifications.set(false);
    }
  }

  toggleOverflow(event: MouseEvent): void {
    event.stopPropagation();
    this.overflowVisible.update((v) => !v);
  }

  toggleOverflowNotifications(event: MouseEvent): void {
    event.stopPropagation();
    this.overflowShowNotifications.update((v) => !v);
  }

  closeOverflow(): void {
    this.overflowVisible.set(false);
  }

  onSearch(): void {
    const query = this.searchQuery().trim();
    if (query) {
      this.searchHistoryService.addSearchTerm(query);
      this.navigationService.navigateTo("search", { q: query });
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
    this.searchQuery.set("");
    this.searchInput()?.nativeElement.focus();
  }

  onLogoClick(): void {
    this.searchQuery.set("");
    this.navigationService.navigateTo("home");
  }

  openMobileSearch(): void {
    this.mobileSearchActive.set(true);
  }

  closeMobileSearch(): void {
    this.mobileSearchActive.set(false);
  }

  closeHistoryWithDelay(): void {
    // Delay closing to allow click events on history items to register
    setTimeout(() => {
      this.historyVisible.set(false);
      this.selectedHistoryTerm.set(null);
    }, 200);
  }

  onHistorySearch(term: string): void {
    this.searchQuery.set(term);
    this.onSearch();
  }

  removeHistoryItem(event: MouseEvent, term: string): void {
    event.stopPropagation();
    this.searchHistoryService.removeSearchTerm(term);
  }

  /**
   * Copy a history term into the input (do not trigger the search).
   */
  selectHistoryItem(event: MouseEvent, term: string): void {
    event.stopPropagation();
    this.searchQuery.set(term);
    this.selectedHistoryTerm.set(term);
    // keep the panel open and focus the input so user can press Enter to search
    setTimeout(() => this.searchInput()?.nativeElement.focus(), 0);
  }

  clearAllHistory(): void {
    this.searchHistoryService.clearAll();
    this.selectedHistoryTerm.set(null);
  }

  /**
   * Handle keyboard navigation inside the search input when history panel is visible.
   * Arrow keys will only set the input value / selection — they will NOT trigger a search.
   * Enter will trigger a search for the currently selected history item (if any).
   */
  onSearchInputKeydown(event: KeyboardEvent): void {
    const list = this.searchHistory();
    if (!this.historyVisible() || !list || list.length === 0) {
      // If panel not visible or no history, let other keys behave normally
      if (event.key === "Escape") {
        this.historyVisible.set(false);
        this.selectedHistoryTerm.set(null);
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      const cur = this.selectedHistoryTerm();
      const nextIndex =
        cur === null ? 0 : Math.min(list.indexOf(cur) + 1, list.length - 1);
      const next = list[nextIndex];
      this.selectedHistoryTerm.set(next);
      this.searchQuery.set(next);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      const cur = this.selectedHistoryTerm();
      let nextIndex = -1;
      if (cur === null) {
        nextIndex = list.length - 1;
      } else {
        nextIndex = Math.max(list.indexOf(cur) - 1, 0);
      }
      const next = list[nextIndex];
      this.selectedHistoryTerm.set(next);
      this.searchQuery.set(next);
    } else if (event.key === "Enter") {
      // If an item is selected, perform the history search; otherwise perform normal search
      const selected = this.selectedHistoryTerm();
      if (selected) {
        event.preventDefault();
        this.onHistorySearch(selected);
      } else {
        this.onSearch();
      }
    } else if (event.key === "Escape") {
      this.selectedHistoryTerm.set(null);
      this.historyVisible.set(false);
    }
  }

  toggleNotifications(event: MouseEvent): void {
    event.stopPropagation();
    this.notificationsVisible.update((v) => !v);
  }

  closeNotifications(): void {
    this.notificationsVisible.set(false);
  }

  onNotificationClick(notification: Notification): void {
    this.notificationService.markAsRead(notification.id);
    this.navigationService.navigateTo("watch", {
      mediaType: notification.media.media_type,
      id: notification.media.id,
    });
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
      return `${years} year${years > 1 ? "s" : ""}`;
    }
    interval = seconds / 2592000;
    if (interval > 1) {
      const months = Math.floor(interval);
      return `${months} month${months > 1 ? "s" : ""}`;
    }
    interval = seconds / 86400;
    if (interval > 1) {
      const days = Math.floor(interval);
      return `${days} day${days > 1 ? "s" : ""}`;
    }
    interval = seconds / 3600;
    if (interval > 1) {
      const hours = Math.floor(interval);
      return `${hours} hour${hours > 1 ? "s" : ""}`;
    }
    interval = seconds / 60;
    if (interval > 1) {
      const minutes = Math.floor(interval);
      return `${minutes} minute${minutes > 1 ? "s" : ""}`;
    }
    return "Just now";
  }

  onHelpClick(): void {
    this.navigationService.navigateTo("help");
  }
}
