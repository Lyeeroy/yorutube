export interface PlaybackProgress {
  progress: number; // Percentage (0-100)
  timestamp: number; // Last watched position in seconds
  duration: number; // Total duration in seconds
  updatedAt: number; // Timestamp of the last update
}
