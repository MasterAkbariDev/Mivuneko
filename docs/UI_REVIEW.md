# UI implementation review

The approved chat, numbered-question, Characters, Settings, Permissions and Activity concepts were used as the visual references. Latest browser captures are under `.local/design/` (local QA evidence, not shipped UI).

| Comparison              | Approved reference                                                             | Implemented / verified                                                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Palette                 | Graphite surfaces, lavender selections, restrained borders                     | Shared tokens in `studio.css`; no decorative gradients; custom menus use the same palette                                                                  |
| Chat hierarchy          | Quiet name header, prose replies, muted user bubble, bottom composer           | Real character portraits; response style moved into conversation options at the user's request; round, square-sized mic/interrupt/send controls            |
| Task activity           | Expandable Thinking with nested actions and scroll                             | Real tool results and reviewer summaries, nested disclosures, bounded vertical scrolling; no step counter, session controls or private chain-of-thought    |
| Questions / permissions | Numbered full-width choices, custom answer, bottom actions                     | Sticky footer above composer, number/Enter keyboard handling, Send/Skip and Allow/Deny; tested context continuation                                        |
| Characters              | Format tabs, large stages, right inspector, expression thumbnails, import tile | Same structure, actual bundled models and their rendered expression thumbnails, live preview, gesture disclosure, character voice link and guide           |
| Settings                | Secondary navigation and open divided sections                                 | Appearance, Voice & input, Connections, Shortcuts and Companion; voice previews and pronunciation collapsed; consistent button gaps                        |
| Dropdowns               | Custom dark option surfaces                                                    | Shared portal menu, selection check, keyboard navigation, outside/Escape dismissal, edge-aware positioning; native select retained as the form adapter     |
| Tray                    | Consistent app branding and compact actions                                    | Custom WebView popup, actual companion portrait, eight fixed icon actions; dismisses on focus loss; isolated capability with no computer/file/model access |
| Narrow layout           | Readable chat and accessible navigation                                        | Icon rail, wrapping content, bounded composer and square mic; tested at 800px and 430px                                                                    |

## Intentional differences and copy review

- The mockup's illustration of Haru and its extra example 3D character are not existing project assets. The implementation preserves the real bundled VRM and shows only real imported/library characters. It does not ship invented characters or duplicate a model to fill a gallery.
- The character's live preview retains full-body framing so sitting, feet, gestures and lying remain inspectable; gallery artwork uses a larger portrait crop.
- Importing VRM files and importing character-pack folders remain separate real operations. The primary import follows the current format; the pack section explains the complete character-plus-voice format.
- Activity contains actual session events, not the concept's seeded success rows. Empty state and search/filter/export/delete remain functional.
- Existing connection, microphone, shortcut and accessibility controls remain available; advanced voice settings use disclosures to avoid dense walls of buttons.
- User-requested changes after approval: remove the visible response-mode selector, custom dropdown menus and tray popup, add spacing between neighboring buttons, fix mic proportions, restore the Characters gallery/inspector balance.

Browser/IAB initialization failed in this session. Playwright Chromium was used as the documented fallback. The approved concepts and current captures were inspected with `view_image`; actual native release behavior was tested separately. Native/system dialogs such as file selection remain platform controls.

## Second refinement

The user's later feedback rejected the first custom tray, large/uneven corners and touching or overflowing controls. A focused tray/composer/activity concept (`exec-8123045b-1c79-47c2-9779-bf2ec6470e80.png`) was generated. The revision uses a brand-led tray header, fixed icon/text columns, grouped separators, smaller control corners, an add button outside the composer, and retained per-turn activity before the completion reply. Current-action labels and tab-independent task execution are covered by integration tests. Native file selection remains an operating-system dialog.

## Screenshot regression repairs (2026-11-15)

The user's 1280 × 890 captures at 110% text size revealed layout defects missed by earlier visual checks. Settings actions now belong to the settings content column; local-model actions have a wrapping row with explicit gaps; the Activity toolbar sizes the custom-select wrapper rather than its hidden native select. Characters now use an actual gallery/inspector grid with a sticky, bounded inspector, removing inherited absolute-position offsets and the unused 310px right padding. Format tabs choose a compatible character. Extra 3D expressions remain available in a disclosure so primary character controls fit.

Voice settings use one separator per meaningful group with a Character voice heading. The composer is a flex row with aligned external plus and form hit targets. Microphone status remains accessible without visible text; the single send action finalizes an active spoken turn or sends typed text. Both manual and automatic voice endpointing are covered by tests. The obsolete empty computer-session launcher was removed from Local models; tasks begin through conversation.

New layout regression tests cover button padding and gaps, settings ownership, Activity search width, compatible character previews and sticky inspector, and composer/microphone geometry at the user's viewport. Captures are generated in test-results/layout-*.png during verification.

## Composer and performance refinement

Format labels are centered with explicit grid alignment and tested using their text bounds. The composer uses a rounded input dock, a separate circular add action, circular mic/send hit targets, consistent hover clipping and restrained focus/press transitions; reduced-motion settings suppress animation. Regression checks assert the mic keeps the same circular silhouette on hover.

The performance inspector exposes the available additional emotions and a procedural arm/head composer with strength and tempo. Spoken amplitude drives subtle 3D head, chest and wrist/elbow beats, with locomotion, dragging and reduced-motion taking priority. Per-character Natural/Playful/Warm/Expressive voice directions reach both Qwen and Gemini streaming; fast Kokoro/system speech does not offer equivalent free-form emotional synthesis. Existing 2D artwork remains pose-based, not a newly authored Live2D rig.

The real local Qwen smoke run returned a valid 4.8-second waveform with peak amplitude 0.604 after 182 seconds while browser regressions were also running. This was not an isolated latency benchmark or a listening-quality assessment. Qwen therefore remains explicitly experimental; these delivery controls do not establish real-time local VTuber speech. The run also prompted process-tree cancellation for Python launchers and a bounded 240-second voice-worker response deadline.


## Live companion corrections

Reproduced the user's direct VS Code and casual sitting requests. App names now strip the trailing “for me”; seat requests wait for a real surface and movement result. Plain companion replies no longer append a generic completion message or replace arrival text with “I'm here.” Streaming and final replies share the same portrait markup. The native launch broker opened VS Code and the seat task completed in a release smoke run.

Finger bones now use relaxed, open, pointing and closed poses. Camera framing includes raised hands and fingertips vertically as well as horizontally, and expands immediately to avoid transition clipping. Per the user’s correction, sitting excludes taskbar surfaces entirely and requires a visible window/icon edge. Lying down routes to the taskbar and aligns the rendered bottom with that ledge, rather than inventing a seat in empty application space. Desktop icon supports are rejected if any part of their support span is covered by a window.

The real experimental Qwen-to-local fallback took 17.7 seconds cold, still unsuitable for live conversation. Live replies with Qwen selected now use the character's CPU voice directly and prewarm it at startup and while an answer is being prepared; Qwen is reserved for expressive previews with a five-second budget. Gemini remains the expressive streaming option. Imported prompt-only voices are never silently replaced with a bundled identity. Earlier local synthesis measured 6.5 seconds cold and 2.9 seconds warm under concurrent checks; this is not an instant-speech claim.


Final verification: 124 unit tests, 88 browser scenarios and 17 native tests passed; TypeScript, changed-file formatting, production Clippy and the release build passed. A temporary visible OS-window ledge was used for a real sitting check (0.27 physical pixels from the projected seat anchor). Lying down selected the taskbar separately (0.21 pixels from the rendered lower boundary). Native live audio started after 4.69 seconds on the first tested turn and 1.16 seconds on the next, with zero Qwen synthesis calls. Raised-arm and lying-pose captures were visually inspected. Latency depends on startup and concurrent work; these figures are observations, not a guarantee.
