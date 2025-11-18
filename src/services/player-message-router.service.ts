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

  /** Start listening to window messages. Call from components when active. */
  start(): void {
    if (typeof window === "undefined" || this.handler) return;

    this.handler = (event: MessageEvent) => {
      const allowed = this.playerProviderService.getAllowedOrigins();
      if (!allowed.includes(event.origin)) return;

      let data: any;
      try {
        data =
          typeof event.data === "string" ? JSON.parse(event.data) : event.data;
      } catch (e) {
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
