import { Injectable, signal } from "@angular/core";

export interface SafeguardConfig {
  persistenceKey: string;
  minProgressToSave: number; // Seconds
  lossThreshold: number; // Seconds (how far back is considered a "loss")
  resetProtectionThreshold: number; // Seconds (below this, we suspect a reset bug)
}

interface SavedSession {
  videoId: string;
  timestamp: number;
}

@Injectable({
  providedIn: "root",
})
export class VideoSafeguardService {
  private config: SafeguardConfig = {
    persistenceKey: "safeguard_active_session",
    minProgressToSave: 10,
    lossThreshold: 60,
    resetProtectionThreshold: 30,
  };

  // Signal to notify UI that recovery is available
  public recoveryAvailable = signal<{
    videoId: string;
    timestamp: number;
  } | null>(null);

  private currentVideoId: string | null = null;
  private lastSavedTime = 0;

  constructor() {}

  /**
   * Initializes the safeguard for a specific video.
   * Clears any previous recovery signals.
   */
  start(videoId: string): void {
    this.currentVideoId = videoId;
    this.recoveryAvailable.set(null);
    this.lastSavedTime = 0;
  }

  /**
   * Checks if there is a saved progress that is significantly ahead of the current time.
   * This should be called once when the player starts or loads.
   */
  checkRecovery(currentTime: number): void {
    if (!this.currentVideoId) return;

    const session = this.loadSession();
    if (!session || session.videoId !== this.currentVideoId) return;

    const saved = session.timestamp;

    // Check if the saved time is significantly ahead of the current time
    // AND the current time is suspiciously close to the start (Reset Bug signature)
    // If user is at 500s and saved is 1000s, assume they seeked back -> NO TRIGGER
    // If user is at 0s and saved is 1000s, assume reset bug -> TRIGGER
    
    // Condition 1: Significant loss (> 60s)
    // Condition 2: Current time is near start (< 30s)
    if (
      saved > currentTime + this.config.lossThreshold &&
      currentTime < this.config.resetProtectionThreshold
    ) {
      this.recoveryAvailable.set({
        videoId: this.currentVideoId,
        timestamp: saved,
      });
    }
  }

  /**
   * Updates the safeguard with the current playback time.
   * Throttles writes to localStorage to avoid performance issues.
   */
  updateProgress(currentTime: number): void {
    if (!this.currentVideoId) return;
    if (currentTime < this.config.minProgressToSave) return;

    // "Overwrite Protection" logic:
    // If the player suspiciously resets to 0 (or near 0), we DO NOT want to overwrite
    // our saved progress (e.g. 50:00) with 0:05.
    // However, if the user explicitly seeks back to 10:00 from 50:00, we SHOULD save 10:00.
    
    // Heuristic: If we are > 30s, we trust the player state (User seek or normal play).
    // If we are < 30s, we are cautious.
    if (currentTime < this.config.resetProtectionThreshold) {
       const session = this.loadSession();
       // If we have a saved session for this video that is "deep" (> threshold),
       // and we are currently "shallow" (< threshold), REJECT the update.
       if (
         session &&
         session.videoId === this.currentVideoId &&
         session.timestamp > this.config.resetProtectionThreshold + 10
       ) {
         return;
       }
    }

    // Throttle: Only save if diff is > 5 seconds
    if (Math.abs(currentTime - this.lastSavedTime) > 5) {
      this.saveSession(this.currentVideoId, currentTime);
      this.lastSavedTime = currentTime;
    }
  }

  /**
   * Clears the recovery signal and optionally the saved progress.
   * Call this when the user accepts the recovery or dismisses it.
   */
  clearRecovery(deleteSavedData: boolean = false): void {
    this.recoveryAvailable.set(null);
    if (deleteSavedData) {
      localStorage.removeItem(this.config.persistenceKey);
    }
  }

  /**
   * Explicitly sets the known progress. Useful when resuming.
   */
  setCurrentProgress(time: number): void {
    this.lastSavedTime = time;
    if (this.currentVideoId) {
       this.saveSession(this.currentVideoId, time);
    }
  }

  private loadSession(): SavedSession | null {
    const val = localStorage.getItem(this.config.persistenceKey);
    if (!val) return null;
    try {
      return JSON.parse(val) as SavedSession;
    } catch {
      return null;
    }
  }

  private saveSession(videoId: string, time: number): void {
    const session: SavedSession = { videoId, timestamp: time };
    localStorage.setItem(this.config.persistenceKey, JSON.stringify(session));
  }
}
