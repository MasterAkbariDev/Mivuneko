# Mivuneko local-to-ChatGPT Work handoff — 2026-10-28

This source snapshot supersedes the earlier v0.3.2 archive in the conversation
"Mivuneko MVP Setup Verification". Continue from the attached snapshot rather
than regenerating the older code.

## Latest user instructions

Use the newly created Luna character as a 2D companion, add more modes and
effects, remove the many buttons around the floating pet, and keep its controls
inside the app. Upload the source here so work can continue in ChatGPT Work.
The user explicitly requested no additional tests for this latest handoff.

## Implemented source changes

- Reworked the app into a charcoal/coral companion UI with bundled Manrope font,
  custom scrollbars, controls, companion panel and a fixed chat composer.
- Added original Luna artwork: twelve 2D poses in two transparent atlases,
  sprite model specification, six modes and local mood effects. See
  `docs/LUNA_2D_MODEL.md`.
- Removed the visible floating-pet buttons, menus, status capsule, options
  panel and inline-chat surface. The pet now only shows its character and
  optional captions. Double-click opens Conversations; right-click opens
  Settings. Dragging still moves the pet.
- Moved modes, expression preview, effects, captions, scale, pinning, display
  and VRM import/removal controls into app Settings (`CompanionControls.tsx`).
- Added cross-window app-navigation events and model-asset notifications.
- Kept API-key edge previews, drafts across tab changes, plain-text proxy,
  individual key checks and proxy connectivity checks.
- Fixed Gemini HTTP 400: Google rejected the empty string in the appQuery
  schema enum. The invalid enum was removed; native allowed-app validation
  and explicit user approval remain in force.

## Live provider findings from the earlier session

Gemini 3.8 Flash repeatedly returned HTTP 503. Switching the session to
`gemini-3.6-flash` with the same keys/proxy produced real replies, including
an arithmetic answer of 12. The app's existing 503 path still labels it as
a project cooldown and performs no automatic retry; this has not yet been
improved. Defaults still mention 3.8, so select 3.6 explicitly if needed.
Metadata key checks do not establish inference quota or speech availability.

## Validation status

Before the latest button-free/12-pose changes, the redesign passed 31 JS unit
tests, 21 browser tests, a production frontend build, and a real Gemini chat.
The Gemini schema fix passed 13 Rust transport tests and a native build.
NO tests, type-check or build were run for the newest 12-pose/button-free
source changes, at the user's explicit request. Source formatting only.
Existing pet-menu/inline-chat browser tests target the old UI and need to be
updated when testing is requested again. Do not claim this latest snapshot
has passed those older tests.

## Source map and continuation

- `apps/desktop/src/Luna.tsx`, `lunaModel.ts`: 2D model and effects.
- `apps/desktop/public/characters/`: both original artwork atlases.
- `apps/desktop/src/Pet.tsx`: minimal floating pet, movement and app shortcuts.
- `apps/desktop/src/CompanionControls.tsx`: in-app companion controls.
- `apps/desktop/src/CompanionCard.tsx`: main-window preview.
- `packages/shared-schemas/preferences.ts`: validated companion preferences.
- `apps/desktop/src/GeminiSettings.tsx`: provider settings and diagnostics.
- `crates/gemini-client/src/lib.rs`: native transport and schema correction.

Run locally with `npm ci` and `npm run desktop` (Rust/Tauri prerequisites
required). The archive contains source, lockfiles, artwork and licenses;
node_modules, target, dist, generated test output and machine-specific files
are excluded. No session API keys or user proxy credentials are included.
This is a complete source handoff, not an installer or built application.
