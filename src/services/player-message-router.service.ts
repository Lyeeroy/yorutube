import { Injectable, inject } from "@angular/core";
import { Subject, Observable } from "rxjs";
import {
  IPlayerProvider,
  PlayerEventData,
  PlayerMessageResult,
} from "../models/player-provider.model";
import { PlayerProviderService } from "./player-provider.service";

export interface RoutedPlayerMessage {
  provider?: IPlayerProvider;
  origin: string;
  raw: any;
  result?: PlayerMessageResult;
}

@Injectable({ providedIn: "root" })
export class PlayerMessageRouterService {
  private playerProviderService = inject(PlayerProviderService);
  private subject = new Subject<RoutedPlayerMessage>();
  private handler: ((event: MessageEvent) => void) | null = null;

  constructor() {}

  /** Enhanced origin validation for security */
  private validateOrigin(origin: string): boolean {
    if (!origin || typeof origin !== 'string') return false;
    
    try {
      const originUrl = new URL(origin);
      const allowedOrigins = this.playerProviderService.getAllowedOrigins();
      
      return allowedOrigins.some(allowed => {
        const allowedUrl = new URL(allowed);
        // Exact match of protocol, hostname, and port
        return originUrl.protocol === allowedUrl.protocol &&
               originUrl.hostname === allowedUrl.hostname &&
               originUrl.port === allowedUrl.port;
      });
    } catch {
      return false;
    }
  }

  /** Safe parsing of postMessage data with validation */
  private safeParseMessageData(data: any): any | null {
    try {
      if (typeof data === 'string') {
        // Validate JSON structure before parsing
        const trimmed = data.trim();
        if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
          return null;
        }
        const parsed = JSON.parse(data);
        // Basic sanitization - only allow known safe properties
        return this.sanitizeMessageData(parsed);
      }
      return this.sanitizeMessageData(data);
    } catch (error) {
      console.warn('Failed to parse postMessage data:', error);
      return null;
    }
  }

  /** Sanitize message data to prevent injection attacks */
  private sanitizeMessageData(data: any): any {
    if (!data || typeof data !== 'object') return {};
    
    // Only allow known safe properties
    const sanitized: any = {};
    const allowedKeys = [
      'event', 'currentTime', 'duration', 'progressPercent', 
      'season', 'episode', 'type', 'data'
    ];
    
    for (const key of allowedKeys) {
      if (key in data) {
        const value = data[key];
        // Only allow primitive types
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
          sanitized[key] = value;
        } else if (typeof value === 'object' && value !== null) {
          // Recursively sanitize nested objects
          sanitized[key] = this.sanitizeMessageData(value);
        }
      }
    }
    
    return sanitized;
  }

  /** Start listening to window messages. Call from components when active. */
  start(): void {
    // Always clear existing handler first to prevent memory leaks
    this.stop();
    
    if (typeof window === "undefined") return;

    this.handler = (event: MessageEvent) => {
      // Enhanced origin validation for security
      if (!this.validateOrigin(event.origin)) return;

      let data: any;
      try {
        data = this.safeParseMessageData(event.data);
        if (data === null) return;
      } catch (e) {
        console.warn('Failed to parse postMessage data:', e);
        return;
      }

      const provider = this.playerProviderService.getProviderByOrigin(
        event.origin
      );
      const routed: RoutedPlayerMessage = {
        provider,
        origin: event.origin,
        raw: data,
      };

      // Let the provider handle special MEDIA_DATA storage if it implements the hook
      if (provider && data?.type === "MEDIA_DATA" && provider.onMediaData) {
        try {
          provider.onMediaData(data.data ?? data);
        } catch (e) {
          console.error("Provider onMediaData failed:", e);
        }
      }

      // Provider-specific normalization should run in the context of the
      // consuming component so that it can pass in the current episode state.
      // The router only handles persistence and origin validation; consumers
      // (such as VideoPlayerComponent) should call provider.handleMessage
      // themselves with the current episode when needed.

      // Emit normalized event for consumers
      this.subject.next(routed);
    };

    window.addEventListener("message", this.handler);
  }

  /** Stop listening to window messages. Call on component destroy. */
  stop(): void {
    if (this.handler && typeof window !== "undefined") {
      window.removeEventListener("message", this.handler);
      this.handler = null;
    }
  }

  /** Observable to receive routed provider messages */
  onMessage(): Observable<RoutedPlayerMessage> {
    return this.subject.asObservable();
  }
}
