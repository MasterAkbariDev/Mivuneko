# Contextual task flow

Conversation and computer work share a bounded task state: original user request, resolved goal, current status, workspace, window, confirmed tool outcomes, and pending question. This state is session-local; saved conversation text remains governed by the history setting. Deleting conversation history clears task state too.

## From a turn to work

1. Live conversation turns first go through the selected conversation model with task memory. Its structured reply chooses ordinary conversation, companion actions, or a computer-task handoff. Live task and movement keyword shortcuts are disabled, so a negated edit instruction or a terminal command cannot be intercepted as work or pet movement. Offline commands and explicit recovery/screen controls retain their dedicated paths.
2. Goal resolution sees only the conversation and task memory. It decides whether the turn continues prior work or starts a new goal, retains constraints for continuations, and asks about genuinely missing functionality. It cannot infer a task from an unrelated open window.
3. Resource binding pins a validated user-supplied folder, a referenced prior scope, or a uniquely active project without asking whether an editor/terminal window is open. Other references use fresh window/project observations and the resolved operation. User-supplied paths in recent conversation can remain candidates for an explicit return to earlier work. It can select only observed window IDs and observed, remembered, or explicitly supplied project roots. It can ask a specific resource question when evidence is ambiguous. It cannot change the resolved goal or operation.
4. File and terminal work starts in the selected project without requiring a visible editor. UI work binds an observed window. Open-window questions can finish from observations alone. Browser work uses the resolved subject, including subjects referred to by follow-ups.
5. The execution loop observes, proposes one action, passes it through independent review, executes the bound action, and consumes the actual result. Failed commands are not completion evidence. Native scope and stale-observation checks still apply.
6. Confirmed tool progress is retained before a question. The answer returns with the pending question and original request, rather than reconstructing a new task by appending guessed phrases. Successful result messages and current scope become context for the next turn.

A completed step does not erase its context. A new unrelated task drops old task facts. An explanation-only turn can remain ordinary conversation without editing files. Stopping or deleting a conversation must not authorize later work by itself.

## Verification

Browser regression tests cover unfamiliar request wording, a follow-up without a command keyword, project references, questions, tool review, cancellation, output retention, and completed records. Native tests reject invented window IDs and unobserved project paths. Real-model scenarios additionally verify saved artifacts and task switching; mocks exercise the UI contract rather than prove model understanding.

The local model can still misinterpret a request. Resource validation and execution review constrain actions; this is not an OS sandbox or a guarantee of model correctness.

## Run the real-model acceptance test

On Windows, launch an idle native QA build with local WebView2 debugging enabled on port 9227, then run `npm run test:native:flow`. `MIVUNEKO_CDP_URL` can select a different local debugging endpoint; `MIVUNEKO_QA_MODEL` can override the selected local model. Do not run against an app doing another task.

The harness creates disposable projects under `.local`, independently checks JSON/YAML values and an unrelated inventory total, checks editor answers against actual window evidence, exercises a genuine question and its contextual answer, and checks edit-versus-explanation handoff and a new browsing goal. It never approves an action that the reviewer asks to confirm. It retains fixtures/results for inspection and does not alter conversation history or preferences. Reasoning is enabled for goal resolution and resource binding only when the local model advertises that capability; private reasoning is not shown as activity text.

Valid structured tool-only replies do not need a spoken preamble. The parser retains those calls and the chat avoids empty assistant bubbles. Stopping work marks the shared state stopped. A new unrelated browsing goal clears the previous active file/window scope.
