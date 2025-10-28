import { Component, ChangeDetectionStrategy, inject, signal, OnInit, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MovieService } from '../../services/movie.service';
import { Collection } from '../../models/movie.model';
import { NavigationService } from '../../services/navigation.service';
import { CollectionCardComponent } from '../collection-card/collection-card.component';
import { forkJoin, of } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError } from 'rxjs/operators';

@Component({
  selector: 'app-collections',
  standalone: true,
  imports: [CommonModule, CollectionCardComponent],
  templateUrl: './collections.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CollectionsComponent implements OnInit {
  private movieService = inject(MovieService);
  private navigationService = inject(NavigationService);
  private destroyRef = inject(DestroyRef);

  collections = signal<Collection[]>([]);
  loading = signal(true);

  private readonly collectionIds: number[] = [
    10, // Star Wars
    295, // Pirates of the Caribbean Collection
    9485, // The Fast and the Furious
    1241, // Harry Potter
    645, // James Bond
    119, // The Lord of the Rings
    328, // Jurassic Park
    10194, // Toy Story
    263, // The Dark Knight Trilogy
    131635, // The Hunger Games
    87359, // Mission: Impossible
    84, // Indiana Jones
    556, // The Godfather
    131292, // Marvel Cinematic Universe
    86311, // The Avengers Collection
    2344, // The Matrix Collection (corrected ID)
    528, // The Terminator Collection
    8091, // Alien Collection
    8650, // Transformers Collection
    86066, // Despicable Me Collection
    264, // Back to the Future Collection
    86058, // Men in Black Collection
    386382, // Frozen Collection
    131295, // How to Train Your Dragon Collection
    8354, // Ice Age Collection
    1733, // The Mummy Collection (corrected ID)
    937, // Predator Collection
    404609, // Paddington Collection
    748, // X-Men Collection
    531241, // Spider-Man (MCU) Collection
    468222, // The Incredibles Collection
    14740, // Madagascar Collection
    77816, // Kung Fu Panda Collection
    87118, // Cars Collection
    137696, // Monsters Inc Collection
    137697, // Finding Nemo Collection
    656, // Saw Collection
    313086, // The Conjuring Collection
    173710, // Planet of the Apes Reboot Collection
    283579, // Divergent Collection
    295130, // The Maze Runner Collection
    33514, // The Twilight Collection
    1575, // Rocky Collection
    5039, // Rambo Collection
    1570, // Die Hard Collection
    945, // Lethal Weapon Collection
    85861, // Beverly Hills Cop Collection
    90863, // Rush Hour Collection
    8580, // The Karate Kid Collection
    495527, // Jumanji Collection
    2980, // Ghostbusters Collection
    151, // Star Trek: The Original Series Collection
    115570, // Star Trek: The Next Generation Collection
    2150, // Shrek Collection
    87096, // Avatar Collection
    8537, // Superman Collection
    1022790, // Inside Out Collection
    531330, // Top Gun Collection
    94032, // The Lion King Collection
    31562, // The Bourne Collection
    535313, // MonsterVerse (Godzilla) Collection
  ];

  ngOnInit(): void {
    const collectionObservables = this.collectionIds.map(id => 
      this.movieService.getCollectionDetails(id).pipe(
        catchError(error => {
          console.error(`Failed to load collection with id ${id}`, error);
          return of(null); // Return null on error, so forkJoin can continue
        })
      )
    );

    forkJoin(collectionObservables)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (results) => {
          // Filter out the nulls from failed API calls
          const validCollections = results.filter((r): r is Collection => r !== null);
          this.collections.set(validCollections);
          this.loading.set(false);
        },
        error: (err) => {
          // This should ideally not be reached if all individual errors are caught
          console.error('Unexpected error in forkJoin for collections', err);
          this.collections.set([]);
          this.loading.set(false);
        }
      });
  }

  onCollectionSelected(collection: Collection): void {
    this.navigationService.navigateTo('collection-detail', { id: collection.id });
  }
}
