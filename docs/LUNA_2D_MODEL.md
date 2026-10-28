# Luna 2D model

Luna is an original sprite-based 2D companion, not a Live2D/Cubism rig.
The model specification is `apps/desktop/src/lunaModel.ts`; rendering and local
effects are in `Luna.tsx` and `style.css`. Two transparent 1536 × 1024 atlases
contain twelve equal 512 × 512 cells in a 3-column, 2-row layout.

- Base atlas: idle, happy/wave, surprised, angry, sleeping, speaking.
- Expression atlas: thinking, listening, shy, sad, celebrating, dancing.
- Modes: automatic, cozy, playful, focus, sleep, dance.
- Effects: hearts, sparkles, sleep letters, thought dots, listening waves,
  anger marks and sad droplets. All effects are local visual cues.
- Speaking switches between idle and talking frames from mouth amplitude;
  the explicit speaking preview alternates frames locally.
- CSS handles breathing, tilting, celebration and dance motion. Reduced-motion
  preferences stop these animations.

The floating desktop pet contains no menu buttons, status capsule, settings
panel or inline chat. It only renders the character and optional captions.
Drag it to move it, double-click to open Conversations, and right-click to open
Settings. Keyboard Enter opens Conversations; Space opens Settings.

All controls live in app Settings: mode, expression preview, effects, captions,
size, always-on-top, display, character, voice and movement.

The character picker also offers Miku fan art, Kiko and Stella. Their six drawn
poses are combined with motion and effects for the additional expression choices.
