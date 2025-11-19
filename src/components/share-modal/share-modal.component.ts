import {
  Component,
  ChangeDetectionStrategy,
  output,
  input,
  inject,
  signal,
  computed,
  effect,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { NavigationService } from "../../services/navigation.service";
import {
  MediaType,
  MovieDetails,
  TvShowDetails,
  Episode,
} from "../../models/movie.model";

@Component({
  selector: "app-share-modal",
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: "./share-modal.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShareModalComponent {
  private navigationService = inject(NavigationService);

  media = input.required<MovieDetails | TvShowDetails>();
  currentEpisode = input<Episode | null>(null);
  currentTime = input<number>(0);
  close = output<void>();

  startAtEnabled = signal(false);
  startAtTime = signal(0);
  copySuccess = signal(false);
  canUseWebShare = signal(false);
  // Track whether we've initialized startAtTime from currentTime to avoid
  // overwriting user edits while the modal is open.
  private startAtInitialized = signal(false);

  constructor() {
    // Check if Web Share API is available
    // Check if Web Share API is available
    if (typeof navigator !== "undefined" && (navigator as any).share) {
      this.canUseWebShare.set(true);
    }

    // When the modal mounts, set the input's initial value to the current
    // playback time. We only set this once so that user edits are preserved
    // while the modal is open.
    effect(() => {
      // If already initialized, do nothing (safeguard against updates while open)
      if (this.startAtInitialized()) return;

      const t = Math.floor(this.currentTime() || 0);
      this.startAtTime.set(t);
      if (t > 5) this.startAtEnabled.set(true);
      this.startAtInitialized.set(true);
    });
  }

  shareUrl = computed(() => {
    const media = this.media();
    const episode = this.currentEpisode();

    const params: any = {
      mediaType: media.media_type,
      id: media.id,
    };

    if (episode) {
      params.season = episode.season_number;
      params.episode = episode.episode_number;
    }

    // Add startAt parameter if enabled
    if (this.startAtEnabled() && this.startAtTime() > 0) {
      params.startAt = this.startAtTime();
    }

    // Get full URL from NavigationService (includes startAt if present)
    return this.navigationService.getUrl("watch", params);
  });

  formattedTime = computed(() => {
    return this.formatTime(this.startAtTime());
  });

  formatTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  }

  parseTimeInput(input: string): number {
    const parts = input.split(":").map((p) => parseInt(p.trim(), 10));

    if (parts.length === 1) {
      // Just seconds
      return parts[0] || 0;
    } else if (parts.length === 2) {
      // mm:ss
      return (parts[0] || 0) * 60 + (parts[1] || 0);
    } else if (parts.length === 3) {
      // hh:mm:ss
      return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
    }

    return 0;
  }

  onTimeInputChange(event: Event): void {
    const input = (event.target as HTMLInputElement).value;
    const seconds = this.parseTimeInput(input);
    this.startAtTime.set(Math.max(0, seconds));
  }

  toggleStartAt(): void {
    this.startAtEnabled.update((v) => !v);
  }

  copyToClipboard(): void {
    const url = this.shareUrl();

    if (navigator.clipboard) {
      navigator.clipboard
        .writeText(url)
        .then(() => {
          this.copySuccess.set(true);
          setTimeout(() => this.copySuccess.set(false), 2000);
        })
        .catch(() => {
          this.fallbackCopy(url);
        });
    } else {
      this.fallbackCopy(url);
    }
  }

  private fallbackCopy(text: string): void {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.opacity = "0";
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand("copy");
      this.copySuccess.set(true);
      setTimeout(() => this.copySuccess.set(false), 2000);
    } catch (err) {
      console.error("Fallback copy failed", err);
    }
    document.body.removeChild(textArea);
  }

  shareViaWebApi(): void {
    if (typeof navigator !== "undefined" && (navigator as any).share) {
      const mediaTitle =
        this.media().media_type === "movie"
          ? (this.media() as any).title
          : (this.media() as any).name;

      (navigator as any)
        .share({
          title: mediaTitle,
          url: this.shareUrl(),
        })
        .catch(() => {
          // Ignore errors from share
        });
    }
  }
}
