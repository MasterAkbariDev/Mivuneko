# Desktop settings and 3D companions

## Characters

Choose **Characters → Haru · 3D** for the bundled VRoid Project character, originally
named AvatarSample_B (v1.1). It is downloaded from pixiv/ChatVRM at revision
`b542aa00e19dccf9fc48ba340cf7eee011d2329a`, with original metadata preserved.
SHA-256: `ffbd8c92a9e67c0a948f69c7a2eec91e5c282c9ae70e9184309fc164d74cbc27`.
Haru is Mivuneko's display alias, not a claim of authorship. See
[provenance](../licenses/haru-vroid.json) and the
[official sample conditions](https://vroid.pixiv.help/hc/en-us/articles/4402394424089).
The previous expression test model has been removed.

**Import VRM character** accepts embedded VRM 0.x or VRM 1.0 binary files up to 50 MB.
Model metadata, creator, license and expression count are displayed after import. Imported
bytes stay in IndexedDB on the user's device and update the pet and previews through a
BroadcastChannel. External texture/buffer URLs are rejected. Use models with suitable rights.

The live renderer supports blink, standard facial expressions, audio-driven mouth movement,
idle motion, walking, sitting, dancing, pointer gaze within the app view, and the model's
VRM spring-bone behavior. Available expressions and physics depend on the imported model.
2D illustrations remain available. The selected render format is shared by the desktop pet,
conversation panel and character studio. The Three.js renderer loads only when 3D is selected.

Characters contains model choices, expression previews, effects and companion behavior. Voice controls live only in Settings.

## Settings

- **Voice & input:** voice mode, output engine and volume, microphone selection and test,
  audio processing, recognition downloads, recognition testing and pause/manual turn-taking.
- **Connections:** reasoning provider, Gemini keys, proxy, connection tests and local history.
- **Shortcuts:** editable key combinations, collision checks and restore defaults. These
  shortcuts register with the operating system and keep working when the conversation is closed. Closing it hides the window; Quit exits the background app.
- **Appearance:** text size from 90–125%, reduced motion and quiet focus mode.

Default shortcuts are Alt+M (microphone), Ctrl+Alt+. (stop), Alt+1 (conversation),
Alt+2 (characters) and Alt+, (settings). Keys captured in the shortcut editor do not
trigger their actions. Input-device preferences contain device identifiers, never recorded audio.

The interface uses bundled Inter under the SIL Open Font License, larger text and controls,
responsive setting cards, a violet/mint palette and local custom scrollbars. OS microphone
permission is requested only when the user starts a recording or microphone test.

## Validation

Windows: the new installer downloaded the official runtime and Base English model, verified
their checksums, wrote configuration and passed a real transcription of the official public JFK
sample after conversion to the same canonical WAV format used by app recordings.
Browser regression coverage includes download activation, microphone selection/cleanup,
editable shortcut persistence/navigation, bundled and imported VRM rendering, and compact layout.
macOS source build remains to be checked on a Mac with CMake and the Xcode tools installed.

Parakeet was also installed from the app installer on Windows and transcribed the same public sample with no Whisper fallback: 3.05 seconds cold and 0.86 seconds warm in one run. These are device-specific observations. Gemini streaming delivered first audio in 1.29 seconds through the configured proxy.

The standalone Windows release was checked with the packaged CSP: embedded VRM textures load, Parakeet is detected and transcribes through native IPC, and Gemini streaming speech plays to completion without browser or app errors. Native first-audio measurements were 1.31 and 1.68 seconds in two proxy-backed checks. The connection policy permits local blob resources needed by embedded model textures.

## Rendering and motion

The renderer resizes its drawing buffer to the displayed canvas, uses 2–3× pixel density and fits the complete body plus head effects into the camera. Pet zoom resizes the canvas instead of stretching it twice. No geometric placeholder character is constructed. Loading shows a text indicator.

The bundled VRM has facial morphs but contains no animation clips. The website’s separate motion library is not embedded in that file. Mivuneko supplies authored humanoid gestures (waving, happy, angry, sad, surprised, curious), walking, seated poses and dancing with blended bone rotations. Facial presets blend independently from the optional icons and remain active while speaking. VRM gaze and spring bones still update. Browser checks verify actual skeleton rotation and mesh morph deformation; native checks cover textured rendering, enlarged canvas resolution and local voice playback.

## Automatic behavior and displays

Companion behavior runs automatically with rest, walking, running and seated periods. Talking and listening interrupt roaming. Explicit chat requests such as “walk to the left”, “run to the top right”, “sit down” and “resume automatic behavior” override the schedule. Walking and running turn the VRM toward its travel direction. Elbows use mirrored forward hinges, verified against actual hand positions in the bundled skeleton.

Character size supports 50–400%; rendering fits the display when the requested size exceeds its work area. Captions occupy reserved space and window resizing preserves the lower anchor. Roaming retains the existing vertical position, and dragging takes priority and pauses movement. Display selection relocates the pet once; dragging to a different display switches back to following the current monitor. **All monitors** creates one pet on each connected display. Replicas share preferences and conversation state and do not speak check-ins independently.

Native Windows validation covered two connected monitors: creation of a second companion, explicit display selection, manual cross-monitor positioning, and stable caption/foot placement. App discovery now uses Windows registered desktop and Store applications (262 apps on the validation device), retaining approved launch requests and stable catalog identifiers. Portable apps without a registered shortcut may still need registration in the Start menu.

## Screen assistance

Ask “help me understand my screen” in Conversations. Mivuneko hides its main window briefly, captures one display, deletes the temporary image after reading, and presents a local preview. Only **Share screenshot with Gemini** sends it to the configured provider. Images are not saved to chat history; the text explanation can be retained under the existing history preference. Capture and image-preview consent were checked natively/on browser; the image request contract is covered by a local HTTP fixture. Live cloud vision could not be validated in the final run because the configured proxy at port 10808 was offline. It requires a working Gemini connection.

## Desktop interaction

The hover dock sits just under the character's feet. It provides voice chat, an animated quick-message input, and a position lock. Edit mode starts locked; Ctrl+Alt+E toggles dragging and scroll resizing. Ctrl+Alt+X toggles click-through, Ctrl+Alt+F toggles focus, and Ctrl+Alt+S opens screen help. All shortcuts can be changed in Settings. Screen help still previews the image before sharing it.

Transparent pixels outside the rendered 3D silhouette pass clicks to the application beneath. Dragging uses a dangling pose and spring-bone hair movement, then restores the prior behavior. Captions follow the head and opening quick chat does not resize the pet window. Monitor replicas share normalized placement, facing, animation time and completion state.

“Stand up” ends a sitting command. Directed walking/running stops standing at its destination. “Get out of my way” or “I cannot code, go out of the code screen” chooses a quiet display corner using the top application's window rectangle and temporarily reduces the companion's footprint. It does not inspect screen contents. Say “resume” to restore automatic behavior and your preferred size.
