# macOS native test gate
Minimum configured macOS version: 12. Record `sw_vers`, `uname -m`, WebKit/system voice and monitor scales. Cloud tests did not compile or launch the complete macOS shell.

1. `npm ci`, `npm run doctor`, `./script/build_and_run.sh --verify`. Confirm a real .app is built/opened, pet transparency has no black rectangle, and menu-bar star is visible. Check Apple Silicon and Intel through the CI matrix when available.
2. Chat opens on demand; closing it hides the utility without terminating the pet. Menu-bar Show pet / Conversations / Hide pet / Quit work. The pet should not steal focus while idle. Debug through `--logs` or `--debug`.
3. Drag, restart, verify position restore; unplug/reattach displays, use negative origins and mixed Retina scaling. Test monitor selection, topmost toggle, work-area bounds and options-panel resize. Enable whole-pet click-through from Settings, then recover with menu bar → Show pet. Automatic per-pixel hit testing and icon/window perching are not implemented.
4. In Assist, use Apps picker to inspect an installed bundle's actual path; approve/deny Calculator/Notes/Telegram as available. `Open ...` exact-name matching refuses ambiguous names. Confirm symlinked bundles are skipped, unknown names fail, and approval expires/revokes/cannot replay. Launch Services acceptance is reported as a launch request, not proof the app finished loading.
5. Run `./script/setup_voice.sh`, rebuild/reopen. Set Push to talk + replies, press Record, permit the microphone, speak and finish. Confirm transcript, spoken response and approximate mouth movement. Deny mic permission, unplug input devices, use Stop, close chat and test worker timeout. Voice must be off by default; browser remains a preview. Persian transcription uses the multilingual model; available speech voices depend on macOS setup.
6. Configure the dedicated Hermes profile and private key as documented. Test connection rejects default enabled tools and wrong key. With a tool-free profile, normal chat uses Hermes and explicit app requests still require local consent. Stop must suppress stale answers; server-side generation may continue in this version.
7. Toggle local history, restart, verify conversation recovery; disable and confirm local SQLite history is removed. Switch among the four 2D companions and their expression previews; confirm both windows update.
8. Check quiet hours, daily caps across restart, ignored prompts, reduced motion, keyboard focus trap, readable captions, errors and deletion/export. Check screen reader labels. No external fullscreen/app-activity observation is claimed.

Distribution gate: sign/notarize before public release. Transparency uses a private API feature incompatible with Mac App Store submission. A licensed production character rig and real hardware checks are still required before calling this production-ready.

## v0.3 Local voice (open mic, engines, Luna's voice)
Setup: `npm run setup:voice` and `npm run setup:sherpa` (see docs/VOICE.md); both need network and about 1.4 GB. Models and the `luna-tts` worker live in git-ignored `.local/`, so repeat setup on each machine.
- Open mic: the mic button shows listening, hearing, understanding and thinking. Speak a short phrase and a long one with a pause; neither is clipped or runs on for seconds. Say "thanks" alone; it must reach chat. Silence or a keyboard tap must not send anything.
- Engines (Settings → Speech recognition): each installed engine can be selected and tested with the Start/Stop panel; uninstalled ones show their install command. Parakeet falls back to Whisper if its server is missing or stopped. Check RAM after switching (Parakeet server about 1 GB, Kokoro worker about 0.6 GB).
- Speak over Luna: she stops and your phrase is heard. Cut her off mid-reply, then ask again; the next answer should start without a long wait.
- Luna's voice: moods preview in Settings → Voice; phrases have pauses, "OK" is read as "okay", code in a reply is summarised as "I put the code in the chat." The first phrase after launch is slow while the model loads.
- Chat: Markdown renders (lists, code blocks, links as plain text, no raw HTML). Scroll wheel over the pet resizes it between 50% and 180% and survives restart; wheel over the speech bubble does not resize.
- Run on Apple Silicon too: all timings in docs/VOICE.md were measured on one throttled Intel Mac.

## v0.3 Gemini / inline pet
Verify Gemini chat + microphone transcription + speech through a configured proxy and multiple keys. Check microphone permissions in the packaged app, actual speaker playback, Stop during each stage and no direct fallback when the proxy is unavailable. Verify pet double-click opens Conversations, right-click opens Settings, and dragging works on Retina/multiple monitors. Gemini voice needs no whisper.cpp installation; local voice is a separate selectable provider. Validate opt-in spoken check-ins against do-not-disturb and quiet hours.
