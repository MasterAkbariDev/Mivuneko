# Idle CPU investigation (pre-existing, measured during Slice 0)

## What was measured

- **Machine:** macOS Intel i9, release bundle, pet visible and still, no conversation, 120 s.
- **Tool:** `node scripts/bench/idle-probe.mjs`. It counts the app process only; WebKit's content processes are separate and not attributed on macOS.

| Build | CPU (% of one core) | RSS |
|---|---|---|
| `main` `a3131b0` | 11.9 | 68–82 MB |
| Slice 0 | 12.9 | 67–90 MB |

The difference is within noise; Slice 0 changed no idle path. The plan's target is < 1%.

## Evidence

A 10 s `sample` of the idle app process shows two sources of real work. Most threads are parked.

1. **Repeated embedded-asset requests.** About 48 active samples are in Tauri's asset protocol:

   ```text
   tauri::protocol::tauri::get → AppManager::get_asset → EmbeddedAssets::get → brotli_decompressor::decode
   ```

   Tauri stores the frontend assets brotli-compressed, so every request decompresses the file again. The character atlases are 2.5–2.9 MB PNGs each (`apps/desktop/public/characters/`). Something in the pet keeps re-requesting assets while idle.
2. **Window-plugin IPC.** `InvokeResolver::respond_async_serialized` frames come from Tauri's `window` plugin, plus `DisplayLink::notifyObserversDisplayDidRefresh` (a 60 Hz display link held active by `requestAnimationFrame`).

## Likely causes, from the code

| # | Where | What it does while idle | Estimated share |
|---|---|---|---|
| 1 | `Pet.tsx` click-through `tick`, `setInterval(…, 40)` | 25 Hz: `pet_cursor` + `outerPosition()` + `scaleFactor()` = **~75 IPC round trips/s**, plus `elementFromPoint` / `hitsModel` hit tests and `setHover` | High |
| 2 | `usePetPlacement.ts` `setInterval(tick, 16)` | **60 Hz** even when the pet stands still; `fit()` + `viewport()` every tick; `availableMonitors` + `outerPosition` + `outerSize` IPC every 800 ms | High |
| 3 | `PackIllustration.tsx` / `CharacterScene.tsx` `requestAnimationFrame(animate)` | 60 Hz loop that calls `getBoundingClientRect` every frame even when nothing changes; keeps the display link alive. The VRM scene renders WebGL every frame | Medium (mostly in the WebContent process) |
| 4 | Embedded assets re-fetched (cause not yet pinned) | Each request brotli-decodes a multi-MB file. Candidates: `<img>`/canvas sources re-created on re-render, or no cache headers on `tauri://` responses, so WebKit doesn't reuse them | Medium |
| 5 | `Pet.tsx` 200 ms `setDragPause` interval | 5 React state updates/s | Low |
| 6 | Windows only: `--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows` on both windows (`tauri.conf.json`) | The hidden main window keeps full-rate timers. These are Chromium flags; macOS WebKit ignores them | Windows only |

## Proposed improvements (not done in Slice 0; candidate early Slice-1 housekeeping)

1. **Adaptive click-through polling (#1):**
   - Cache `outerPosition` / `scaleFactor`; update them on `onMoved` / `onScaleChanged` events instead of polling.
   - Poll the cursor at 25 Hz only while it is within ~100 px of the pet window; otherwise at 4 Hz.
   - Expected: ~75 → ~4–25 IPC/s.
2. **Event-driven placement (#2):**
   - Run the 16 ms loop only while the pet is moving or roaming, and stop it when it settles.
   - Refresh the monitor list on display-change events.
3. **Idle render loops (#3):** stop `requestAnimationFrame` when the frame and pointer haven't changed and no clip is playing. Restart on state change or pointer move. Lower the VRM idle frame rate (e.g. 15 fps) when no animation is active.
4. **Asset re-fetch (#4):**
   - Instrument it first: count protocol requests by path (debug log in a dev build).
   - Then keep decoded `ImageBitmap`s / `HTMLImageElement`s alive across re-renders.
   - Consider serving the large PNG atlases as **uncompressed** assets (PNG is already compressed, so brotli only costs CPU).
5. **Windows flags (#6):** keep the throttling-disable flags only on the window that owns audio (review M10 / plan §3.6).
6. **Re-measure** with `idle-probe.mjs` and a `sample` profile after each step. Set per-OS targets from the results.

Expected outcome: most idle CPU is polling and continuous loops, so items 1–3 should remove the bulk. That is an estimate until measured.
