import { Injectable, signal, effect } from '@angular/core';
import { SubscribableChannel } from '../models/movie.model';

const STORAGE_KEY = 'yorutube-subscriptions';

@Injectable({
  providedIn: 'root'
})
export class SubscriptionService {
  subscriptions = signal<SubscribableChannel[]>([]);

  constructor() {
    this.loadFromStorage();
    effect(() => {
      this.saveToStorage(this.subscriptions());
    });
  }

  private loadFromStorage(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            try {
                this.subscriptions.set(JSON.parse(stored));
            } catch (e) {
                console.error('Error parsing subscriptions from localStorage', e);
                this.subscriptions.set([]);
            }
        }
    }
  }

  private saveToStorage(subs: SubscribableChannel[]): void {
    if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(subs));
    }
  }

  addSubscription(channel: SubscribableChannel): void {
    this.subscriptions.update(subs => {
      if (!subs.some(s => s.id === channel.id && s.type === channel.type)) {
        return [...subs, channel];
      }
      return subs;
    });
  }

  removeSubscription(channelId: number): void {
    this.subscriptions.update(subs => subs.filter(s => s.id !== channelId));
  }

  isSubscribed(channelId: number): boolean {
    return this.subscriptions().some(s => s.id === channelId);
  }
}