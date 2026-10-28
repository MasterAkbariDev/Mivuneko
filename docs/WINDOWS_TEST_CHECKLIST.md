# Windows desktop test gate
Record Windows version, CPU/GPU, WebView2 version, monitor resolutions/scales and the commit being tested. Use README setup.

1. `npm ci`, `npm run test:all`, `cargo test -p os-broker --locked`, then `npm run desktop`.
2. Startup: only a transparent pet window, no full-app window. Verify visible character, background transparency and tray icon. Main closes to hidden, not destroyed. Reopen through pet and tray. Hide/show pet and Quit must work.
3. Drag pet, resize options panel, toggle always-on-top. Test 100%, 125%, 150%, 200% scaling. Verify controls do not clip or capture excessive desktop area. No click-through is promised yet.
4. Enable roaming, stationary, sit, sleep, wake and reduced motion. Choose a second monitor, including negative origins and vertical arrangements. Unplug its monitor and check recovery. Test with taskbar on another edge. Monitor traversal and icon/window perching are not implemented.
5. Open Chat, Assist → Open Telegram. Deny: no process. Retry and allow: Telegram starts only from its supported installed path. Verify Notepad/Calculator. Unknown app and altered executable names must fail. Approval expires after 60 seconds and cannot replay. Revoking/Stop cancels pending requests; already started processes remain open.
6. Change character/movement/focus in Settings and observe pet. Trigger a chat request and check thinking/approval/success mood. Ensure ordinary responses do not grant permissions. Native shared event path needs verification.
7. Voice is off by default. Local whisper.cpp transcription can be configured through absolute environment paths; validate recording and permission handling. Speech output currently uses macOS say and is unsupported on Windows. No microphone should activate without Record.
8. Import a licensed embedded .vrm file under 50 MB. Check expressions, bad files and rejection of external textures. Imported walk/sit clips are not yet supported.
9. Check no proactive messages by default, quiet hours, do-not-disturb and one-unanswered-message policy when opted in. Confirm no screenshot/app/system-idle monitoring is claimed. Current daily count is session-local.
10. Keyboard-only approval, screen reader labels, error recovery, history deletion and activity export. Check foreground focus is not stolen by idle animation.
11. Build unsigned executable and repeat smoke tests on Windows 10/11. Installer/signing and SmartScreen distribution are later work.

Do not label the build release-ready until these cases are recorded and native failures are fixed.

## v0.3 Gemini and pet interaction
- Install C++ Build Tools/MSVC/SDK if Cargo reports link.exe missing; restart terminal, run npm ci and npm run desktop.
- Fresh install renders the Pixiv sample; right-click/handle menu works and no pet frame/permanent button bar appears.
- Drag character; double-click/Enter → inline Chat. Menu Chat does not create the utility window. Check layout on a short display and two monitors.
- Configure two plain Gemini keys (one per line) and an HTTP or SOCKS proxy; test text, microphone → transcript → reply → audible TTS, Stop and a disconnected proxy. No direct request should occur with broken configured proxy.
- Preview angry/sad/surprised effects; check head attachment and mouth during an emotional spoken reply.
- Approve/deny an app from inline Chat and verify shared conversations/activity in the utility app.
- Enable spoken check-ins explicitly; verify quiet hours, do-not-disturb, daily cap and ignored suppression.
