import { Component, OnDestroy, OnInit, ElementRef, ViewChild, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

interface LogEntry {
  timestamp: Date;
  origin: string;
  data: any;
}

@Component({
  selector: 'app-provider-dev-tool',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './provider-dev-tool.component.html',
  styleUrls: ['./provider-dev-tool.component.css']
})
export class ProviderDevToolComponent implements OnInit, OnDestroy {
  @ViewChild('logContainer') logContainer!: ElementRef;

  // Configuration Inputs
  movieUrlTemplate: string = 'https://vidsrc.cc/v2/embed/movie/{id}';
  tvUrlTemplate: string = 'https://vidsrc.cc/v2/embed/tv/{id}/{season}/{episode}';
  
  mediaType: 'movie' | 'tv' = 'movie'; // Current active mode
  
  tmdbId: string = '550';
  season: number = 1;
  episode: number = 1;

  // State
  generatedUrl: string = '';
  safeUrl: SafeResourceUrl | null = null;
  logs: LogEntry[] = [];
  autoScroll: boolean = true;
  
  private messageListener: (event: MessageEvent) => void;

  constructor(
    private sanitizer: DomSanitizer,
    private ngZone: NgZone
  ) {
    this.messageListener = this.handleMessage.bind(this);
  }

  ngOnInit(): void {
    window.addEventListener('message', this.messageListener);
  }

  ngOnDestroy(): void {
    window.removeEventListener('message', this.messageListener);
  }

  setMediaMode(mode: 'movie' | 'tv') {
    this.mediaType = mode;
    // Set some defaults for better UX when switching
    if (mode === 'movie') {
        if (this.tmdbId === '1399') this.tmdbId = '550'; // Switch from GoT to Fight Club
    } else {
        if (this.tmdbId === '550') this.tmdbId = '1399'; // Switch from Fight Club to GoT
    }
  }

  loadPreset(preset: string) {
    if (preset === 'vidsrc') {
        this.movieUrlTemplate = 'https://vidsrc.cc/v2/embed/movie/{id}';
        this.tvUrlTemplate = 'https://vidsrc.cc/v2/embed/tv/{id}/{season}/{episode}';
    } else if (preset === 'vidlink') {
        this.movieUrlTemplate = 'https://vidlink.pro/movie/{id}';
        // Vidlink might have a TV format, but for now we'll just leave TV as is or clear it if unknown
        // Keeping defaults for safety.
    }
  }

  loadIframe() {
    let template = this.mediaType === 'movie' ? this.movieUrlTemplate : this.tvUrlTemplate;
    let url = template;
    
    // Replace placeholders
    url = url.replace('{id}', this.tmdbId);
    url = url.replace('{tmdb}', this.tmdbId);
    url = url.replace('{imdb}', this.tmdbId);
    
    if (this.mediaType === 'tv') {
      url = url.replace('{season}', this.season.toString());
      url = url.replace('{episode}', this.episode.toString());
    } else {
      // Cleanup if user used TV placeholders in movie template (rare but possible)
      url = url.replace('{season}', '1');
      url = url.replace('{episode}', '1');
    }

    this.generatedUrl = url;
    this.safeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
    
    this.logs = [];
    this.addLog('System', { type: 'info', message: `Loading URL: ${url}` });
  }

  clearLogs() {
    this.logs = [];
  }

  copyLogData(data: any) {
    const json = JSON.stringify(data, null, 2);
    navigator.clipboard.writeText(json).then(() => {
        // Optional: toast notification
    });
  }

  private handleMessage(event: MessageEvent) {
    if (event.origin === window.location.origin) {
        if (typeof event.data === 'object' && event.data?.type?.includes('webpack')) return;
    }

    this.ngZone.run(() => {
      this.addLog(event.origin, event.data);
    });
  }

  private addLog(origin: string, data: any) {
    this.logs.unshift({
      timestamp: new Date(),
      origin,
      data
    });

    if (this.logs.length > 500) {
      this.logs.pop();
    }
  }

  copySummaryToClipboard() {
    const prompt = `
I need a new IPlayerProvider implementation involving:
Movie URL Template: "${this.movieUrlTemplate}"
TV Show URL Template: "${this.tvUrlTemplate}"

Sample postMessage events (${this.mediaType} mode):
${JSON.stringify(this.logs.slice(0, 15).map(l => l.data), null, 2)}

IMPLEMENTATION BEST PRACTICES (Derived from existing codebase):
1. **Interfaces**: Implement 'IPlayerProvider'.
2. **URL Generation ('generateUrl')**:
   - Return 'null' if required metadata (e.g., season/episode for TV) is missing.
   - Use 'PlayerUrlConfig' for 'autoplay' and 'resumeTime'.
   - Deduplicate query parameters if possible to avoid server errors.
   - Explicitly handle 'autoplay' (pass '1'/'0' or 'true'/'false') based on config.
3. **Event Handling ('handleMessage')**:
   - **Progress**: Look for 'timeupdate'/'time'. Calculate 'progressPercent'.
     - IF (duration - currentTime < 0.5s) THEN report 100% progress (fixes floating point issues).
   - **Status**: Set 'playerStarted=true' on 'play' or meaningful 'timeupdate'.
   - **Episode Changes**: Detect internal navigation (season/episode change in events).
     - IGNORE if identical to 'currentEpisode'.
     - IGNORE initial load events (compare against 'currentEpisode').
     - REPORT if: (Playback > 5s OR Non-routine event e.g. 'media_changed').
4. **Normalization**: Implement 'normalizeEpisode' to handle string/number parsing.
   - Watch out for 0-based indexing (e.g. VidLink uses 0-based, others 1-based).
5. **Class Structure**:
   - 'id' (upper snake_case), 'name' (Display Name), 'origin' (security check).
   - 'supportsAutoNext = true' if provider handles it or if we want app-side auto-next.

Create the 'provider.ts' file now.
`;
    navigator.clipboard.writeText(prompt);
    alert('AI Prompt copied to clipboard!');
  }
}
