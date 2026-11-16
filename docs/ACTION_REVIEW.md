# Companion actions and review

File requests with a specific absolute folder start a scoped filesystem session. The folder is created if missing; an editor is optional. Short clarifications retain the original goal and observed results. Independent requests start with fresh task context.

The expandable task trace shows tool names, user-facing progress, results, and review summaries. It does not expose private model reasoning. Questions use numbered choices or a custom answer; permissions appear above the composer. Stop interrupts the active task and revokes pending work.

## Automatic review

Permissions → Action reviewer controls the independent model review. Routine requested file edits can execute automatically. Recycling a file or closing a window always requires a bound permission in automatic review mode, regardless of the model's judgment. Other questionable actions can request permission; out-of-scope proposals are blocked and replanned.

Bypass skips non-terminal review and its confirmation gates, including a saved “review every step” preference. Terminal commands always receive independent automatic review and cannot execute without an allow decision or a bound confirmation for an ask decision. Legacy file-API containment and protected visual inputs remain enforced. Shell commands execute with the current user account: their working directory and model review are not an OS filesystem sandbox.

A successful tool result is required before completion. Saved files must be read back; a request to open the file in Notepad requires a successful scoped file-open action. That result confirms an editor process accepted the file, not that an arbitrary editor rendered every byte correctly.

## Verified independent scenarios

Real native app with Ollama qwen3.5:9b, 2026-11-15:

- Create a closure JavaScript example in a missing nested directory: created, read back, syntax checked and executed with Node.
- Follow up with “use notepad for that matter”: retained the original example and opened the saved file through the Notepad action.
- Read an unrelated inventory JSON and write a quantity summary: total 8; source retained; no closure file or task leaked into the new workspace.
- Request recycling of a disposable fixture: reviewer requested permission; native execution without permission failed; original file remained.
- Explicit bypass: created and verified a greeting file without invoking semantic review.

The first live runs revealed premature completion on the Notepad follow-up and a model-approved recycle action. Completion evidence and the deterministic destructive-action gate were added, then all scenarios were rerun successfully.

Task status follows the current action (for example, “Saving closure.js…”), rather than displaying Thinking throughout execution. Completed expandable records stay before their result messages across later tasks and tab changes. The current app session retains the last 30 activity records; reloading restores saved conversation text according to the history setting, not these transient tool details. Deleting session history clears both the text and its task records.


## Terminal-first workspace tasks

When PowerShell is available, the workspace action schema exposes `run_command` instead of legacy file listing/writing/editing tools, preventing a model from ignoring terminal-first mode. The Notepad file opener remains available for explicit Notepad requests; file APIs remain a fallback when the shell is unavailable. The native session stores review authorization separately from the model’s proposed command. Failed commands do not enter successful operation history, and a failed last command prevents an unverified finish.

VS Code folder opening is distinct from opening a file. The exact request `open vscode for me on a new directory of "J:/Projects/JSPractice"` resolves a workspace, discovers VS Code without depending on PATH, and proposes a reviewed background command to open that folder in a new window. No code file or editor selection is required.


Review evidence includes the current workspace file list and recent successful operations. A later test command may rely on a file created by an earlier successful command; it does not need to recreate the file in every step. These facts provide evidence only and grant no additional authority. Corrected commands are reviewed as new actions; previous approval does not authorize a changed command. Repeated unchanged failures are rejected with bounded replanning rather than executed in a loop.
