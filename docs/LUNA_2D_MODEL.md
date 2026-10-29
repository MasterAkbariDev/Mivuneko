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

The floating pet has a compact hover dock for voice, quick chat and the pencil edit lock. Double-click opens quick chat; right-click opens pet controls. Quick chat stays open after sending. Main Conversations opens from the tray or configured app shortcut.

The 2D gallery has ten illustrated characters. Each has 21 unique emotion cell assignments and separate front/back/side walking and running frames; leftward motion mirrors the side artwork. The dedicated 2.5D gallery contains Mochi, an original bunny companion with perspective motion. These are sprite animations, not Live2D rigs.

Creation, VRM import and local voice recipes are explained in `docs/CHARACTERS.md` and inside Characters > Creating characters & voices. The artwork prompt set is recorded in `docs/character-art-generation.json`.
