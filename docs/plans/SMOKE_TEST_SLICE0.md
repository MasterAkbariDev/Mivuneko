# Slice 0 manual smoke test (about 10 minutes)

Build and run from the `slice-0-foundations` branch:

```sh
git checkout slice-0-foundations
./script/build_and_run.sh   # or: npm run desktop
```

(If `git status` then shows `apps/desktop/src-tauri/Cargo.toml` modified, the Tauri CLI did it. Run `git checkout -- apps/desktop/src-tauri/Cargo.toml`.)

Tick each item. Note anything odd, especially a feature that silently does nothing; that would point to a command blocked by the new permission rules.

## Pet
- [ ] The pet appears, animates (idle, walk/run when moved) and can be dragged.
- [ ] Right-click / handle opens the pet menu; double-click or Enter opens the quick composer.
- [ ] Changing character and size in **Characters** updates the pet.
- [ ] Moving the pet to another monitor works (if you have one).

## Chat
- [ ] Type in the pet's quick composer: the reply streams and the pet's expression changes.
- [ ] Same in **Conversations**.
- [ ] Settings → backend: **Automatic**, **Gemini only** and **Groq only** each answer. With Groq only, replies arrive noticeably fast.
- [ ] Ask the pet to "walk to the left" / "sit down": it moves and poses.

## Voice
- [ ] Characters → voice: preview a mood with **Kokoro (local)**. The first phrase takes a few seconds (model load); later phrases take about 2–3 s, not 7–16 s.
- [ ] Switch to **Gemini** speech: preview works.
- [ ] Push-to-talk: speak, then **Finish recording**: the transcript is sent.
- [ ] Open mic: speak, pause, and it submits; speak while it talks and it stops (barge-in). "Stop talking" interrupts.

## App launches and permissions
- [ ] Settings → Permissions shows your previous approval mode (it should still be what you had).
- [ ] **Approve each request**: ask "open Calculator" → an approval card appears → Allow opens it; ask again → Deny does not open it.
- [ ] **Deny app launches**: the same request is denied without a card.
- [ ] **Automatically approve**: the same request opens Calculator without a card.
- [ ] Turning **app launching off** refuses the request.
- [ ] Spoken approval (Decide by voice → "approve") still works.

## Check-ins (optional)
- [ ] With proactive check-ins on, put a video or game **fullscreen**. No check-in appears or speaks during it.

## History
- [ ] With "Remember conversations" on, restart the app: the conversation is still there. Turning it off clears it.

## Measurements (optional)
- [ ] After a few chats: `node scripts/bench/spans.mjs` shows `turn.first_text`, `turn.reply_done` and, with voice on, `turn.first_audio` rows.

Report back: pass/fail per section, your OS/chip, and any item that did nothing.
