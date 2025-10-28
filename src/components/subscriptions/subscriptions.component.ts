import { Component, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SubscriptionService } from '../../services/subscription.service';
import { SubscribableChannel } from '../../models/movie.model';
import { NavigationService } from '../../services/navigation.service';
import { ChannelCardComponent } from '../channel-card/channel-card.component';

@Component({
  selector: 'app-subscriptions',
  standalone: true,
  imports: [CommonModule, ChannelCardComponent],
  templateUrl: './subscriptions.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SubscriptionsComponent {
  private subscriptionService = inject(SubscriptionService);
  private navigationService = inject(NavigationService);

  allSubscriptions = this.subscriptionService.subscriptions;

  networkSubscriptions = computed(() => this.allSubscriptions().filter(s => s.type === 'network'));
  companySubscriptions = computed(() => this.allSubscriptions().filter(s => s.type === 'company'));


  isSubscribed(channelId: number): boolean {
    return this.subscriptionService.isSubscribed(channelId);
  }

  toggleSubscription(channel: SubscribableChannel): void {
    if (this.isSubscribed(channel.id)) {
      this.subscriptionService.removeSubscription(channel.id);
    } else {
      this.subscriptionService.addSubscription(channel);
    }
  }

  onChannelSelected(channel: SubscribableChannel): void {
    this.navigationService.navigateTo('channel', { type: channel.type, id: channel.id });
  }
}