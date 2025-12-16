/**
 * Player Providers Registry
 *
 * This is the ONLY file you need to edit when adding a new player provider.
 *
 * To add a new provider:
 * 1. Create your provider file (e.g., newplayer.provider.ts)
 * 2. Import it below
 * 3. Add it to the REGISTERED_PROVIDERS array
 *
 * That's it! The provider will automatically:
 * - Appear in the player selection dropdown
 * - Be available for playback
 * - Handle all postMessage events
 *
 * No need to modify ANY other files!
 */

import { IPlayerProvider } from "../../models/player-provider.model";
// import { YouTubePlayerProvider } from "./youtube.provider";
import { VideasyPlayerProvider } from "./videasy.provider";
import { VidlinkPlayerProvider } from "./vidlink.provider";
import { VidsrcPlayerProvider } from "./vidsrc.provider";
import { VidfastPlayerProvider } from "./vidfast.provider";

import { VidUpPlayerProvider } from "./vidup.provider";
import { Movies111PlayerProvider } from "./movies111.provider";

/**
 * Central registry of all player providers.
 * Add new provider instances here to make them available app-wide.
 * The order here determines the order in the UI dropdown.
 */
export const REGISTERED_PROVIDERS: IPlayerProvider[] = [
  //   new YouTubePlayerProvider(),
  // dropdown by registering it first so the UI lists it at the top.
  new VidlinkPlayerProvider(),
  new VideasyPlayerProvider(),
  new VidfastPlayerProvider(),
  new VidsrcPlayerProvider(),
  new VidUpPlayerProvider(),
  new Movies111PlayerProvider(),
];

// Optional: Export individual providers for direct access if needed
// export { YouTubePlayerProvider } from "./youtube.provider";
export { VideasyPlayerProvider } from "./videasy.provider";
export { VidlinkPlayerProvider } from "./vidlink.provider";
export { VidsrcPlayerProvider } from "./vidsrc.provider";
export { VidfastPlayerProvider } from "./vidfast.provider";
export { VidUpPlayerProvider } from "./vidup.provider";
export { Movies111PlayerProvider } from "./movies111.provider";
