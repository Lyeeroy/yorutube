import { Component, ChangeDetectionStrategy, input, output, computed } from '@angular/core';
import { Collection } from '../../models/movie.model';
import { NgOptimizedImage } from '@angular/common';

@Component({
  selector: 'app-collection-card',
  standalone: true,
  imports: [NgOptimizedImage],
  templateUrl: './collection-card.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CollectionCardComponent {
  collection = input.required<Collection>();
  isPriority = input<boolean>(false);
  cardClicked = output<void>();

  thumbnailUrl = computed(() => {
    const collection = this.collection();
    if (collection.backdrop_path) {
      return `https://image.tmdb.org/t/p/w780${collection.backdrop_path}`;
    }
    const partWithBackdrop = collection.parts?.find(part => part?.backdrop_path);
    if (partWithBackdrop) {
      return `https://image.tmdb.org/t/p/w780${partWithBackdrop.backdrop_path}`;
    }
    return 'https://picsum.photos/480/270?grayscale';
  });
}