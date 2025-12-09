import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  inject,
  signal,
  computed,
  effect,
} from "@angular/core";
import { CommonModule, NgOptimizedImage } from "@angular/common";
import { CollectionSearchResult, Collection } from "../../models/movie.model";
import { MovieService } from "../../services/movie.service";
import { NavigationService } from "../../services/navigation.service";

@Component({
  selector: "app-search-result-collection-card",
  standalone: true,
  imports: [CommonModule, NgOptimizedImage],
  templateUrl: "./search-result-collection-card.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchResultCollectionCardComponent {
  collection = input.required<CollectionSearchResult>();
  cardClicked = output<void>();

  private movieService = inject(MovieService);
  private navigationService = inject(NavigationService);

  details = signal<Collection | null>(null);

  thumbnailUrl = computed(() => {
    const path =
      this.collection().backdrop_path || this.collection().poster_path;
    return path
      ? `https://image.tmdb.org/t/p/w500${path}`
      : "https://picsum.photos/500/281";
  });

  constructor() {
    effect((onCleanup) => {
      const id = this.collection().id;
      const sub = this.movieService.getCollectionDetails(id).subscribe((d) => {
        this.details.set(d);
      });
      onCleanup(() => sub.unsubscribe());
    });
  }

  onCardClick() {
    this.navigationService.navigateTo("collection-detail", {
      id: this.collection().id,
    });
  }
}
