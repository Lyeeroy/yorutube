import { Injectable } from "@angular/core";
import { IPlayerProvider } from "../models/player-provider.model";
import { REGISTERED_PROVIDERS } from "./player-providers";

/**
 * Registry service for managing video player providers.
 * This service maintains a collection of available player providers
 * and provides methods to retrieve them by ID or origin.
 *
 * To add a new player provider:
 * 1. Create a new class implementing IPlayerProvider in player-providers/
 * 2. Add it to REGISTERED_PROVIDERS array in player-providers/index.ts
 *
 * That's it! No need to modify this service.
 */
@Injectable({
  providedIn: "root",
})
export class PlayerProviderService {
  private providers = new Map<string, IPlayerProvider>();
  private providersByOrigin = new Map<string, IPlayerProvider>();

  constructor() {
    this.registerProviders();
  }

  /**
   * Register all providers from the central REGISTERED_PROVIDERS array.
   * Providers are automatically loaded from player-providers/index.ts
   */
  private registerProviders(): void {
    REGISTERED_PROVIDERS.forEach((provider) => {
      this.registerProvider(provider);
    });
  }

  /**
   * Register a player provider
   * @param provider The provider instance to register
   */
  private registerProvider(provider: IPlayerProvider): void {
    this.providers.set(provider.id, provider);
    this.providersByOrigin.set(provider.origin, provider);
  }

  /**
   * Get a player provider by its ID
   * @param id The provider ID (e.g., "VIDEASY", "VIDLINK")
   * @returns The provider instance or undefined if not found
   */
  getProvider(id: string): IPlayerProvider | undefined {
    return this.providers.get(id);
  }

  /**
   * Get a player provider by its origin URL
   * Used for postMessage origin validation
   * @param origin The origin URL (e.g., "https://player.videasy.net")
   * @returns The provider instance or undefined if not found
   */
  getProviderByOrigin(origin: string): IPlayerProvider | undefined {
    return this.providersByOrigin.get(origin);
  }

  /**
   * Get all registered provider IDs
   * @returns Array of provider IDs
   */
  getAllProviderIds(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Get all registered providers
   * @returns Array of provider instances
   */
  getAllProviders(): IPlayerProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Get all allowed origins for postMessage validation
   * @returns Array of origin URLs
   */
  getAllowedOrigins(): string[] {
    return Array.from(this.providersByOrigin.keys());
  }
}
