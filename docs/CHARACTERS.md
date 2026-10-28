# Character formats and behavior · v0.3
See [CHARACTER_SOURCES.md](CHARACTER_SOURCES.md) for current model provenance and Kyndred/AIRI research.

## Included renderers
- **Pixiv expressive sample**: bundled licensed VRM, default for fresh installs; standard emotion/vowel presets, arms-down idle, blink, nods and head-anchored effects. See licenses/ for exact metadata.
- **Luna**: original procedural Three.js chibi geometry, an engineering placeholder. Idle breathing/blink, simple walking limbs, sitting legs, sleeping eyes and celebratory arms.
- **Mooncat**: original lightweight SVG fallback with state labels; it does not have audio lip shapes.
- **Imported VRM**: local embedded binary VRM0/VRM1, max 50 MB. External buffer/image URIs are rejected. Import persists in IndexedDB; Remove imported model deletes it. Supported expressions depend on that rig. Actual authored VRM walk/sit clips and native device QA remain pending; the bundled sample has been rendered in cloud WebGL.

The controller separates activity (idle/listening/thinking/speaking/working/approval/sleeping), expression, body and mouth. Task events reliably signal approval/error/completion; live Hermes can return a closed expression vocabulary. Audio amplitude supplies approximate mouth opening for the 3D/VRM renderer. This is not phoneme-accurate animation. State names do not guarantee a natural production performance. Expressions are fictional, never claims of feelings.

## Producing a finished character pack
1. Make or commission original concept sheets and obtain usage/distribution rights.
2. Model in VRoid/Blender; rig humanoid bones, expression and vowel blendshapes, eye/look-at and hair physics. Export embedded VRM.
3. Author walking, sitting, sleep, greeting and work clips plus foot/sitting anchors. Retargeting/import UI is still required for those clips.
4. Test clipping/deformation, expression blending, blink/lip priorities, lighting, GPU/memory and multiple frame rates.
5. Package model, textures, motions, thumbnail, capability manifest and licenses. Keep personality/voice/tool permissions independent from appearance.

Live2D and sprite-sheet packs remain future adapters. Do not ship third-party anime characters or voice weights without rights. The built-in procedural character is not a finished production waifu rig; a real rig can be imported locally without replacing the application.
