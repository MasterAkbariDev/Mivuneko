# Creating your companion

## Choose a format

- **2D** uses illustrated sprite poses, expression transitions and mood effects.
- **2.5D** offers Mochi, a dedicated original bunny companion with subtle cursor-driven perspective. It is not a Live2D/Cubism rig; `.moc3` files are not supported.
- **3D** uses VRM humanoids with facial expressions, gaze, lip sync and spring-bone physics. Haru is included. Select a card to apply that character to the desktop.

Changing a gallery tab only browses its models. Selecting a model applies it. Reduced motion disables the 2.5D tilt and minimizes animated motion.

## Create and import a 3D character

1. Create your original humanoid in a VRM-capable character editor such as VRoid Studio, or obtain a model whose terms permit your use.
2. Export a self-contained `.vrm` file with embedded textures. VRM 1.0 is preferred. Keep the file below 50 MB; external texture URLs are rejected.
3. Include the standard facial presets: happy, sad, angry, surprised, relaxed, blink, blinkLeft, blinkRight and the mouth preset aa. The app blends these presets into additional moods. A model without those morphs cannot display them just through animation.
4. In **Characters → 3D**, choose **Import VRM character** and select the file. Its name, author and license appear after validation. It is saved locally on this device; importing replaces the previous custom-model slot.
5. Preview happy, crying, shy, surprised and sleeping, then try speaking, sitting and walking. Check elbows, hands, hair and clothing. Different rigs may need adjustments in their source editor.
6. Use **Remove imported model** to return to Haru. Import does not upload the file to an AI provider.

VRM imports use the app's authored humanoid gestures. Animation clips shown on a model's website are separate assets and are not automatically downloaded or imported. Preserve author attribution and obtain permission before redistributing models, outfits, textures or voices.

## Make illustrated characters

Illustrated character import is currently a source-level workflow, rather than a file picker. Create transparent PNG sprite atlases, following the dimensions and pose mapping of an existing character in `apps/desktop/src/lunaModel.ts`. Keep all poses aligned to the same canvas and foot baseline to avoid jumps. Add its artwork under the desktop public assets, register its ID and atlas/pose mapping, and add its ID to the preference schema. The current full atlas format is six columns by seven rows with 21 emotion cells followed by sitting and directional motion frames; see `spriteFrames.ts` and `docs/character-art-generation.json` for cell order. Rebuild the app. Choose one gallery for the character; the bundled galleries are separate.

For a smooth result, draw distinct neutral, listening, speaking, happy, sad, angry, surprised, shy and sleeping poses. Keep edges clean at the largest intended size. A flat image cannot acquire independent hair or clothing physics just by enabling depth.

## Give it a voice

Open **Settings → Voice & input**. Choose Gemini for cloud character speech, or install Kokoro for local speech. Recognition (Parakeet/Whisper) turns your microphone into text; it is separate from the character's speaking voice. Choose a microphone and test it before starting voice chat.

Bundled characters have their own local voice recipes. A custom VRM uses the configured custom-character voice identity; importing a VRM does not import a voice. Gemini voice style and delivery are configured in Voice & input.

For a custom local recipe, follow `docs/VOICE.md`. Voice packs live at `assets/characters/<id>/voice/voice.json`; start from an existing pack. Configure a stable speaker or speaker blend, then mood-specific speed, gain and pauses. Register the pack in the native voice-pack lookup and rebuild. Runtime overrides under `.local/tts/packs/` can be used for local auditions as described in that guide. Do not put API keys in a character pack or publish recordings without permission.

## Living on your desktop

Say **be free**, **move freely**, or **do your own thing** to resume automatic behavior. The companion rests longer, pauses while you talk or use its controls, and takes short walks toward a quieter corner. It does not read your screen to make these choices. Directed movement ends at the requested destination; ask to resume when you want roaming again. **Sit down** and **stand up** are explicit commands.

Double-click for quick chat; right-click for controls. Unlock the pencil to resize or drag. Your dropped position is preserved, including partial placement beyond the taskbar or screen edge. Use **Ctrl+Alt+0** or **Reset size & find pet** to restore a visible normal-sized companion. The native frame can exceed the screen; its dock stays within the visible monitor area.

The bundled 2D characters use separate front/back/side walk and run frames; left motion mirrors the side frames. Diagonal motion chooses the nearest facing. These sprite cycles are stylized, not skeletal 3D animation.
