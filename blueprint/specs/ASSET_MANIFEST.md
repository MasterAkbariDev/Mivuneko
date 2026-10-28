# Asset Manifest

## Required for prototype
- Original character concept: front/side/back reference, facial expressions, color sheet, outfit variants.
- Production-ready rig: Live2D Cubism model files (subject to SDK licensing) OR VRM 3D model with blendshapes.
- Avatar states: idle, blink, breathing, listen, think, speak, happy, curious, confused, celebrate, concern, error, sleep.
- UI: app icon (SVG + raster sizes), tray icons, microphone states, action status icons, onboarding illustrations.
- Audio: licensed voice model weights and language metadata; notification sounds; optional ambient effects.
- Fonts: licensed Inter and Noto Sans distributions or platform fallback.
- Localization: en-US baseline, fa-IR RTL, ja-JP; architecture for more locales.
- Branding: wordmark, logo, splash, installer artwork, screenshots.

## License and distribution checklist
Confirm character/IP ownership; voice dataset and model licenses; third-party dependency licenses; asset attribution; Live2D runtime terms; model redistribution permissions. Never ship third-party anime characters without rights.

## Suggested folders
assets/characters/default/{model,expressions,motions,thumbnails}; assets/ui/{icons,illustrations}; assets/audio/{sfx,voices}; locales/{en-US,fa-IR,ja-JP}; licenses/.
