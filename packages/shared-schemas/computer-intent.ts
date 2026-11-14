/** Only direct user requests enter computer sessions; model output cannot start one. */
export function computerIntent(text: string): boolean {
  if (browserTask(text)) return true;
  return /\b(?:use (?:my |the )?computer|computer (?:use|control)|control (?:my |the )?(?:computer|desktop)|click (?:on |the |that |this )|(?:create|edit|write|rename|move|organize|delete) (?:a |the |my |this |these )?(?:file|folder|document)|(?:type|write) .+ (?:in|into) (?:notepad|the editor|the app)|help me .+ (?:in|with) (?:the ide|notepad|my editor))\b/i.test(
    text,
  );
}
export function browserTask(
  text: string,
): { browser: "edge" | "chrome" | "firefox"; query: string } | null {
  const explicit =
    /\b(?:open|launch|use)\s+(?:microsoft\s+|google\s+)?(edge|chrome|firefox)\s+(?:and\s+)?(?:search(?:\s+for)?|look\s+up)\s+(.+)/i.exec(
      text,
    );
  const search =
    /^(?:please\s+|can you\s+|could you\s+)?(?:search(?:\s+(?:the web|online))?(?:\s+for)?|look\s+up)\s+(.+)/i.exec(
      text.trim(),
    );
  if (!explicit && !search) return null;
  return {
    browser: explicit
      ? (explicit[1].toLowerCase() as "edge" | "chrome" | "firefox")
      : "edge",
    query: (explicit ? explicit[2] : search![1])
      .replace(/\s+for me[.!?]*$/i, "")
      .replace(/[.!?]+$/, "")
      .trim(),
  };
}
