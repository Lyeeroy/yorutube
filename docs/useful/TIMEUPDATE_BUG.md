# Timeupdate Race Condition & postMessage Episode Data

This file documents a common problem encountered when embedding third-party players that use postMessage to report playback state. The app may receive episode/season metadata on routine playback events (eg. `timeupdate`) which can cause spurious navigation and iframe reloads when the host app tries to react to the message.

This doc explains the root cause, provides a step-by-step diagnosis guide, a robust fix that covers provider implementation and host app guarding, and tests to validate behavior.

---

## Problem Summary

Some remote players include `season` and `episode` attributes in many message payloads — including `timeupdate` and other routine progress events. If your host app treats any `season/episode` message as "I changed episode" and triggers navigation, the app may navigate or reload the iframe in response to a progress update. This can cause:

- The selected episode being overridden immediately after the user clicks it
- Iframe refreshing unexpectedly when starting playback or during progress
- Confusing loops between player and host state

Commonly affected platforms: VidFast (observed), Videasy, other embedded platforms that include metadata in many messages.

---

## Diagnosis

1. Reproduce the problem locally using DevTools Network and Console.
2. Inspect postMessage payloads (Console -> Listen to window.message) or set breakpoint inside `video-player.component.ts` message handler.
3. Look for a pattern where the payload contains `season` and `episode` attributes when `data.event` is `timeupdate` (or `time`).
4. Confirm that provider `handleMessage` or host code returns `episodeChange` on such messages.

If you see `episodeChange` set during `timeupdate`, that's the bug.

---

## Principles for a Robust Fix

- Episode navigation must only be triggered for explicit navigation events from the player (or when the host decides it is needed). Routine progress events must not cause navigation.
- Providers should be conservative: return `episodeChange` only for navigation events or when the provider explicitly emits a dedicated navigation event.
- The host `video-player.component.ts` should track navigation intent and guard its episode-change handling for a short period when user-initiated navigation occurs.
- Synchronous app state changes (set `currentEpisode` from params) avoid races where the provider receives messages about the old state.

---

## Provider Fix (recommended)

In the provider's `handleMessage` method, check `data.event` and only return `episodeChange` for non-routine events.

Example (Vidfast / Videasy / Vidsrc):

```ts
// inside handleMessage(...)
if (
  typeof data.season === "number" &&
  typeof data.episode === "number" &&
  data.event &&
  ![
    "timeupdate",
    "time",
    "play",
    "pause",
    "playing",
    "seeking",
    "seeked",
  ].includes(data.event)
) {
  // Only return episodeChange when it seems like an explicit navigation
  if (
    !currentEpisode ||
    currentEpisode.season_number !== data.season ||
    currentEpisode.episode_number !== data.episode
  ) {
    result.episodeChange = { season: data.season, episode: data.episode };
  }
}
```

Key points:

- Exclude `timeupdate`, `time` and similar routine events.
- Compare incoming season/episode to `currentEpisode` before marking a change.

This makes providers tolerant to players that broadcast metadata widely.

---

## Host App Guard (video-player.component.ts)

Add the following defensive measures in `video-player.component.ts`:

1. Set `currentEpisode` synchronously from route params when user initiates a navigation. This prevents the player from reporting the old episode metadata before the app has updated its state.

Example:

```ts
if (mediaType === "tv" && season && episode) {
  // set a temporary episode so the host state matches navigation intent
  this.currentEpisode.set({
    season_number: +season,
    episode_number: +episode,
    id: 0,
  } as Episode);
  this.lastPlayerEpisodeState.set({ season: +season, episode: +episode });
}
```

2. Track `isNavigating` (or `navigationInProgress`) signal at the start of any user navigation (episode select, playlist navigation, programmatic next). The signal will instruct the message handler to ignore `episodeChange` messages while navigation is in progress.

3. Only allow `episodeChange` messages to be processed when:


Example check:

```ts
  // Note: Some providers emit explicit navigation events (e.g. "next" or
  // "navigate") which are not routine timeupdate messages. In such cases
  // the host app should allow immediate navigation even if `lastKnownPlaybackTime`
  // is low. To support this behavior we now pass the event name into
  // `canProcessEpisodeChange(eventName)` which will bypass the 5s guard for
  // non-routine events.

  if (
    media.media_type === 'tv' &&
    result.episodeChange &&
    this.playerHasStarted() &&
    !this.isNavigating() &&
    (this.lastKnownPlaybackTime() >= 5 || isNonRoutineEvent(routed.raw?.event))
  ) {
  this.handleEpisodeChangeDetection(result.episodeChange, ...);
}
```

4. Auto-clear `isNavigating` once there is meaningful playback (5s), or after a short timeout.

This gives the app time to synchronize state and avoids being overridden by player-provided `timeupdate` messages.

### VidFast specific fix

VidFast often emits `season`/`episode` metadata in `timeupdate` messages when the player auto-nexts internally (or when the user hits the next button inside the iframe). To detect these internal navigations reliably without causing loops, implement the following **in addition**:

1. The provider may emit `episodeChange` on a first message, but it could be ignored initially due to a playback time guard. We now also use metadata to detect changes:

 - When the host receives metadata (season/episode) in any message, it should update the episode-selector UI but NOT navigate immediately.
 - If the metadata differs from the current URL params and then the host reaches the playback threshold (>=5s), the host should call `handleEpisodeChangeDetection` using the metadata to update the app state.

This ensures that VidFast's internal next-button navigation will be caught reliably: the app will only navigate to the new episode once it sees meaningful playback on the new episode (preventing race conditions and repeated navigations). This approach has been implemented in `VideoPlayerComponent`.

---

## Tests

- Unit test provider: dispatch a message with `event: 'timeupdate'` + `season`/`episode` → expect `handleMessage` to not return `episodeChange`.
- Unit test incident: dispatch a message with `event: 'ended'` or `event: 'playerNavigate'` + season/episode → expect `episodeChange` to be returned.
- Integration test: click an episode (calls `onEpisodeSelected`), assert iframe loads the selected episode after the navigation and the iframe does not revert due to timeupdate messages.

---

## Debugging Tips

- Add `console.debug('player payload', event.origin, payload)` to `video-player.component.ts` message handler to see the pattern of events and when they occur relative to navigation.
- Temporarily add `console.warn` before `handleEpisodeChangeDetection` to catch triggers and trace origin.
- If providers show repeated behavior, ensure server-side logic isn't emitting public metadata incorrectly.

---

## FAQ / Common Misconceptions

- "Should I rely on season/episode values from timeupdate messages?" — No. `timeupdate` is not a navigation event; it may include metadata as a convenience, but you can't rely on it for navigation decisions.

- "Why adding a navigation guard is important?" — For embedded players, parent/iframe messaging race conditions are common: the child might emit messages before the parent has updated its local state. Guarding prevents early overrides.

---

## Next Steps

- Add a small unit test in the repo verifying providers ignore `timeupdate`-based episode messages.
- Apply the provider change consistently across any new or third-party providers.
 - Ensure providers that implement an internal "next" capability advertise `supportsAutoNext = true`. The host app will use the user-configured auto-next threshold (`PlayerService.autoNextThreshold`) to decide when to advance; this keeps auto-next behavior consistent across providers.
- Consider adding an explicit `PLAYER_NAVIGATION` event inside embedded players if you have control of the player source; the host can then react safely.

---

If you'd like, I can also add the unit tests and example debugging dev helper to the repo. This is an especially common bug and the fix is straightforward but important for a robust user experience.
