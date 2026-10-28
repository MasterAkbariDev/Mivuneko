# Desktop settings and 3D companions

## Characters

Choose **Characters → 3D VRM sample** to use the bundled pixiv sample. Its model file and
license metadata are restored from the original main branch; the SHA-256 is
`12c2b97e95e700783a6a550dc0eee2d7880aeedccef9ae67bc4c5a2f0f2631a2`.
This is a demonstration model, not a generated 3D version of Luna's illustration.

**Import VRM character** accepts embedded VRM 0.x or VRM 1.0 binary files up to 50 MB.
Model metadata, creator, license and expression count are displayed after import. Imported
bytes stay in IndexedDB on the user's device and update the pet and previews through a
BroadcastChannel. External texture/buffer URLs are rejected. Use models with suitable rights.

The live renderer supports blink, standard facial expressions, audio-driven mouth movement,
idle motion, walking, sitting, dancing, pointer gaze within the app view, and the model's
VRM spring-bone behavior. Available expressions and physics depend on the imported model.
2D illustrations remain available. The selected render format is shared by the desktop pet,
conversation panel and character studio. The Three.js renderer loads only when 3D is selected.

## Settings

- **Voice & input:** voice mode, output engine and volume, microphone selection and test,
  audio processing, recognition downloads, recognition testing and pause/manual turn-taking.
- **Connections:** reasoning provider, Gemini keys, proxy, connection tests and local history.
- **Shortcuts:** editable key combinations, collision checks and restore defaults. These
  shortcuts operate while Mivuneko is focused; they are not system-wide keyboard hooks.
- **Appearance:** text size from 90–125%, reduced motion and quiet focus mode.

Default shortcuts are Alt+M (microphone), Escape (stop), Alt+1 (conversation),
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
