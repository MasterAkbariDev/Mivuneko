# Characters and voices

Open **Characters** to browse separate **2D**, **2.5D**, and **3D** galleries. Selecting a model applies it; browsing a tab does not change your active companion.

Use **Creating characters & voices - Open complete guide** to open the dedicated Creator Handbook with diagrams, artwork examples, JSON templates and the complete Character Pack v1 specification. Its source is [CHARACTER_PACKS.md](CHARACTER_PACKS.md).

## Add a character

- **Import character folder**: choose a folder containing one `character.json` plus its referenced artwork, VRM and optional voice files. Individual images, six-pose atlases, multiple timed frames per pose, depth layers and explicit VRM expression maps are supported.
- **3D → Import VRM character**: select one or more self-contained `.vrm` files. Each creates a separate library slot; it does not replace previous imports.

Imports are saved locally and can be selected or removed independently. Removing one entry does not remove another. Keep a backup of the original folder. Existing single-slot VRM imports migrate to the library automatically.

A character without a voice definition stays silent. A server prompt can use Gemini speech. Reference WAVs and exact transcripts are stored for a future local cloning engine, including the planned Qwen integration; the app does not claim cloning support yet. Built-in characters retain their separately registered local voice recipes.

## Control your companion

Say **cry**, **show love**, **look sleepy**, **be happy** or **wink** to choose an expression. Say **automatic expressions** to return to natural expression selection. **Sit down**, **stand up** and **be free** control posture and roaming. Requests such as **go to the first monitor then go up and sit down** run in order. Conversation providers can also return validated companion action plans for natural wording.

**Go outside of my screen** intentionally walks to a quiet edge and hides the pet; **Show pet** or **Reset size & find pet** in the tray brings it back. Ordinary movement remains inside the usable screen area. Feet dropped onto the taskbar settle upward gently instead of abruptly snapping the window.

Double-click opens quick chat. Right-click opens pet controls. The pencil unlocks dragging and resizing. **Ctrl+Alt+0** restores a usable size and brings the pet back to the active display.
