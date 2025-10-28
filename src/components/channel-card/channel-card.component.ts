import { Component, ChangeDetectionStrategy, input, output, computed } from '@angular/core';
import { Network, ProductionCompany } from '../../models/movie.model';
import { NgOptimizedImage } from '@angular/common';

@Component({
  selector: 'app-channel-card',
  standalone: true,
  imports: [NgOptimizedImage],
  templateUrl: './channel-card.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChannelCardComponent {
  channel = input.required<Network | ProductionCompany>();
  isSubscribed = input(false);
  subscribeClicked = output<void>();
  cardClicked = output<void>();

  logoUrl = computed(() => {
    return this.channel().logo_path
      ? `https://image.tmdb.org/t/p/w500${this.channel().logo_path}`
      : null;
  });

  countryName = computed(() => {
    const countryCode = this.channel().origin_country;
    if (!countryCode) {
        return '';
    }
    try {
        // This is a standard EcmaScript API, safe to use in modern browsers.
        // FIX: The correct value for the 'type' option is 'region' for country names.
        return new Intl.DisplayNames(['en'], { type: 'region' }).of(countryCode) || countryCode;
    } catch (e) {
        // Fallback for invalid region codes which might be in the data
        return countryCode;
    }
  });
}
