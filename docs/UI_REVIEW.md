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
