import { Component, ChangeDetectionStrategy, input, output, computed, inject } from '@angular/core';
import { SubscribableChannel } from '../../models/movie.model';
import { NgOptimizedImage } from '@angular/common';
import { SubscriptionService } from '../../services/subscription.service';

@Component({
  selector: 'app-search-result-channel-card',
  standalone: true,
  imports: [NgOptimizedImage],
  templateUrl: './search-result-channel-card.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchResultChannelCardComponent {
  private subscriptionService = inject(SubscriptionService);
  
  channel = input.required<SubscribableChannel>();

  cardClicked = output<void>();
  subscribeClicked = output<SubscribableChannel>();

  isSubscribed = computed(() => {
    const ch = this.channel();
    return this.subscriptionService.isSubscribed(ch.id);
  });

  logoUrl = computed(() => {
    const ch = this.channel();
    return ch.logo_path ? `https://image.tmdb.org/t/p/w500${ch.logo_path}` : null;
  });

  onSubscribeClick(event: Event) {
    event.stopPropagation();
    this.subscribeClicked.emit(this.channel());
  }
}
