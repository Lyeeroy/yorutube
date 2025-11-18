# Provider Episode-Selector Details

This document explains, in detail, how each registered player provider interacts with the episode-selector and app state. It is intended as a precise reference for debugging, writing AI prompts, and adding new providers.

Key principles
- URL params are the single source of truth for navigation.
- Embedded players can still change the currently playing episode; the app must detect that and either sync UI or navigate.
- Providers should be conservative: only report `episodeChange` for explicit navigation events or when the episode actually differs from the current state and the event isn't routine (timeupdate).
- Metadata (`season`/`episode`) may appear in `routed.raw` or `routed.raw.data`/`data.data` depending on the player; the host must check both.

---

Overview of message flows in `VideoPlayerComponent`
1. Player messages are routed through `PlayerMessageRouterService` (message handler parses JSON, checks allowed origin).
2. Providers `handleMessage(data, currentEpisode)` normalize the message into a `PlayerMessageResult` containing: `playerStarted`, `playbackProgress`, `episodeChange`.
3. `VideoPlayerComponent` processes the result: updates progress, starts auto-next logic, handles `episodeChange` navigation and `metadata` UI sync.

Two processing paths in `VideoPlayerComponent`
- Navigation path: Triggered by `result.episodeChange` and guarded with `canProcessEpisodeChange()`. This updates the URL and triggers app navigation if the provider indicates a navigation-worthy event.
- Metadata path: Extracts `season`/`episode` from `routed.raw` and updates the `currentEpisode` for UI highlighting via `syncEpisodeSelectorOnly()` (never updates URL) — always run when the player sends metadata.

---

Update: Videasy and VidFast now advertise `supportsAutoNext = true` so the host
applies the user-configured auto-next threshold for these providers as well.
This ensures consistent auto-next behavior and that the host's threshold
prevents premature navigation from routine `timeupdate` messages.


Providers details (alphabetical)

1) Videasy (VIDEASY)
- Origin: `https://player.videasy.net`
- URL: `/tv/:id/:season/:episode?color=...&episodeSelector=true&nextEpisode=true&autoplay=1|0`
- Indexing: 1-based
- MEDIA_DATA: Not used specifically
- Common events: `timeupdate`, `play`, internal `ended`/auto-next
- Message shape examples (observed):
  - timeupdate: `{ event: 'timeupdate', currentTime: 10, duration: 200, season: 1, episode: 2 }
  - navigation: `{ event: 'ended', season: 1, episode: 3 }
  - internal next: `{ season: 1, episode: 3 }` (sometimes reprsented with currentTime)

- Provider logic summary (see `videasy.provider.ts`):
  - Always extract playback progress from `time`/`timeupdate` events
  - For episode change detection: report `episodeChange` if
    - the remote metadata includes season/episode and
    - either it's an explicit navigation event (whitelisted events like `ended`) OR the reported season/episode differs from `currentEpisode` AND the event is not `timeupdate`.
  - This detects internal navigation via the player "next" button: the player often emits a non-`timeupdate` event or includes `currentTime`/other payload when the next button triggers. If differ and not timeupdate, it's considered a navigation event.

How episode-selector is updated
- Navigation path: If VidEasy emits a whitelisted event OR episode differs, `result.episodeChange` is set → `VideoPlayerComponent` sees `episodeChange` and, if `canProcessEpisodeChange()` is true, calls `handleEpisodeChangeDetection()` (updates URL and app state).
- Metadata path: The raw message may also contain `season`/`episode`. The `VideoPlayerComponent` extracts that and calls `syncEpisodeSelectorOnly()` to ensure the episode-selector highlights the actual playing episode. This function is UI-only and never changes the URL.

Best practices and debugging
- If internal "next" doesn't update app: Look for event name — if provider reports only `timeupdate`, it won't be treated as a navigation event by default, but the `episode differs` rule will still catch it if the metadata shows the new episode and it's not `timeupdate`.
- If episodeSelector doesn't update for Videasy: Check if `routed.raw` uses nested `data` (e.g., `routed.raw.data.season`) or if the event is being filtered out.

---

2) Vidlink (VIDLINK)
- Origin: `https://vidlink.pro`
- URL: `/tv/:id/:season/:episode?player=jw&autoplay=1`
- Indexing: 0-based in some contexts (the provider normalizes by adding 1)
- MEDIA_DATA: Vidlink sends a `MEDIA_DATA` message type with `{ last_season_watched, last_episode_watched, ... }` which is picked up and persisted via `provider.onMediaData`.
- Common events: `MEDIA_DATA` on load, `PLAYER_EVENT` messages with `timeupdate`, `season`, `episode` as strings
- Message shape examples:
  - MEDIA_DATA: `{ type: 'MEDIA_DATA', data: { last_season_watched: '1', last_episode_watched: '5' }}`
  - player event: `{ event: 'playerNavigate', season: '1', episode: '0', currentTime: 0 }`

- Provider logic summary (see `vidlink.provider.ts`):
  - Treats any `season`/`episode` metadata as potential navigation if season/episode differ.
  - Normalizes episode index by adding 1 (0-based -> 1-based in app)
  - Reports `episodeChange` when either MEDIA_DATA indicates a different last watched episode or when player reports a non-routine event or non-`timeupdate` event with different episode.

How episode-selector is updated
- MEDIA_DATA: Immediately saved using `onMediaData()` (persisted state) and `VideoPlayerComponent` may parse the raw message to update UI.
- Navigation path: `handleEpisodeChangeDetection()` triggers if `episodeChange` is set by provider.
- Metadata path: `extractMetadata` will pick up `routed.raw` or `routed.raw.data`, and `syncEpisodeSelectorOnly()` will update UI to the currently playing episode.

Best practices and debugging
- Vidlink sends `season`/`episode` as strings — provider normalizes. If you see `0` for episode, remember normalization adds 1.
- If the `next` button within Vidlink doesn't update the app, check the event name and if `episode` metadata accompanies the `playerNavigate` event.

---

3) Vidsrc (VIDSRC)
- Origin: `https://vidsrc.cc`
- URL: `/v2/embed/tv/:id/:season/:episode?color=...&autoPlay=true`
- Indexing: 1-based
- MEDIA_DATA: Usually not provided as separate type
- Common events: `timeupdate`, `playerNavigate`, `episode` in event
- Message shape examples:
  - `timeupdate`: `{ event: 'timeupdate', season: 1, episode: 3 }`
  - internal navigation: `{ event: 'navigate', season: 1, episode: 4 }`

- Provider logic summary (`vidsrc.provider.ts`):
  - Build playback progress and set playerStarted on timeupdate
  - Report `episodeChange` when metadata shows different season/episode and (either non-routine event or we have playback progress; not in timeupdate only)

How episode-selector is updated
- Navigation: `handleEpisodeChangeDetection()` will be triggered on `episodeChange` by provider.
- Metadata: `extractMetadata()` will pick up `season`/`episode` and `syncEpisodeSelectorOnly()` updates the UI-only state (episode selector highlights).

Debugging tips
- Vidsrc sometimes emits metadata on `timeupdate`, ensure check for `isTimeUpdateEvent` prevents loops. If the next button emits `navigate`, the provider will mark `episodeChange`.

---

4) VidFast (VIDFAST)
- Origin: `https://vidfast.pro` (canonical origin used in provider)
- URL: `https://vidfast.pro/tv/:id/:season/:episode?autoPlay=true&title=true&poster=true&theme=dc2626&nextButton=true` (supports theme and next button)
- Indexing: 1-based
- MEDIA_DATA: Vidfast sends `MEDIA_DATA` for progress, plus `PLAYER_EVENT` messages (timeupdate). Historically it included season/episode on timeupdate messages and other events.
- Message shape examples:
  - `PLAYER_EVENT` / `timeupdate`: `{ event: 'timeupdate', currentTime: 12, duration: 120, season: 1, episode: 3 }
  - navigation: `{ event: 'playerNavigate', season: 1, episode: 4 }`
  - MEDIA_DATA: `{ type: 'MEDIA_DATA', data: {...} }`

- Provider logic summary (`vidfast.provider.ts`):
  - Parse playback progress from `timeupdate` events
  - Report `episodeChange` when metadata changes and either is an explicit navigation event OR it differs and is not only a timeupdate (this catches internal next button)
  - Persists MEDIA_DATA via `onMediaData()` for provider-specific storage

How episode-selector is updated
- Navigation path: `result.episodeChange` will trigger `handleEpisodeChangeDetection()` (unless blocked by navigation guard)
- Metadata path: `extractMetadata()` picks up `season/episode` and `syncEpisodeSelectorOnly()` updates UI highlighting
- The whitelist + `episodeDiffers && not timeupdate` rule catches internal next button clicks that update metadata but may not include a special event.

Note: For VidFast we also rely on the host to trigger navigation from metadata once the host detects meaningful playback (>5s). This prevents timeupdate-based false positives while ensuring internal "next" controls are recognized — see `TIMEUPDATE_BUG.md` for full details.

Debugging tips
- Vidfast historically caused loops because it emits `season/episode` on routine `timeupdate` events — our rule prevents reporting `episodeChange` on `timeupdate` while still catching a real change if currentEpisode differs.

---

5) YouTube (YouTube provider)
- Origin: `https://www.youtube.com` (handled separately for trailers)
- Indexing: N/A (YouTube not used for multi-episode TV playback in this app) — not primary provider for episode sync.
- No special episode metadata or navigation handling required. Episode updates are not applicable.

---

How `VideoPlayerComponent` updates the episode-selector (full flow)
1. `PlayerMessageRouterService` emits `RoutedPlayerMessage` after origin check and data parse.
2. Provider `handleMessage()` is called with either `routed.raw.data ?? routed.raw` and current app `currentEpisode()`.
3. Provider returns `PlayerMessageResult`:
   - `playbackProgress` updates progress and triggers auto-next logic
   - `playerStarted` toggles `playerHasStarted`
   - `episodeChange` indicates either explicit navigation or internal navigation (detected by provider rules)
4. If `result.episodeChange` is present and `canProcessEpisodeChange()` returns true, the component calls `handleEpisodeChangeDetection()` which performs app navigation (URL update, skip iframe reload) and loads new episode details.
5. Independent of `episodeChange` detection, the component always extracts `metadata` from raw message and calls `syncEpisodeSelectorOnly()` to ensure `currentEpisode` matches the actual player state. `syncEpisodeSelectorOnly()` is UI-only and never changes URLs.

---

Debugging checklist and tests

Unit tests (provider-level):
- timeupdate with season/episode should NOT return `episodeChange` unless episode differs and it's not timeupdate.
- A `playerNavigate` or `ended` event with new season/episode should return `episodeChange`.
- When `currentEpisode` is the same as reported, provider should not report `episodeChange`.

Integration tests (component-level):
- Clicking next in iframe updates episode-selector highlight via metadata path
- Clicking next inside iframe that sends `playerNavigate` triggers route navigation
- Player sending `timeupdate` with same episode does not cause navigation
- Provider-specific media data (Vidlink/VidFast) is persisted by `onMediaData`

Examples of messages and expected behavior
- VidFast `timeupdate` with same ep: progress updates only
- VidFast `playerNavigate` with next ep: navigation and update UI
- Vidlink `MEDIA_DATA` with last_episode_watched: update UI and persist but may not navigate

---

AI prompt template for future bug triage

Prompt:
"I have an embedded iframe player from <PROVIDER> (origin: <ORIGIN>). When the user clicks the 'next episode' button inside the iframe, the app doesn't update the episode selector or route. The app uses the following snippet to handle messages: <include provider code and the video player component message handling>. Send a debugging plan listing the likely causes in order and a patch that would fix the issue. Include a reproducible test case with mocked window.postMessage events and suggested unit tests." 

Include relevant artifacts in the prompt:
- `src/services/player-providers/<provider>.provider.ts` content
- `src/components/video-player/video-player.component.ts` message handler (showing navigation and metadata paths)
- Example `postMessage` payloads (timeupdate, playerNavigate, MEDIA_DATA)

---

Where to look if things go wrong (quick hits)
- Check `window.postMessage` payload with console while reproducing the scenario.
- Search the console for `player payload` if debug logs are enabled.
- Check whether `season/episode` appear in `raw` or `raw.data`.
- Check `lastKnownPlaybackTime()` and `isNavigating()` flags: they can block navigation.

---

Notes for future provider authors
- Always use whitelist for navigation events; if you need to detect internal navigation (button), allow `episodeDiffers && !timeupdate` as a fallback.
- Keep provider logic minimal: identify `episodeChange` and `progress` only, do not mutate global state.
- Use `onMediaData` for provider-specific persistence.
- Add example postMessage payload comments to provider file.
