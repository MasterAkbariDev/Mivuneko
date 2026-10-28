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

Parakeet was also installed from the app installer on Windows and transcribed the same public sample with no Whisper fallback: 3.05 seconds cold and 0.86 seconds warm in one run. These are device-specific observations. Gemini streaming delivered first audio in 1.29 seconds through the configured proxy.

The standalone Windows release was checked with the packaged CSP: embedded VRM textures load, Parakeet is detected and transcribes through native IPC, and Gemini streaming speech plays to completion without browser or app errors. Native first-audio measurements were 1.31 and 1.68 seconds in two proxy-backed checks. The connection policy permits local blob resources needed by embedded model textures.
