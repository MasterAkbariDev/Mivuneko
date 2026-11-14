/** Only direct user requests enter computer sessions; model output cannot start one. */
export function computerIntent(text: string): boolean {
  if (browserTask(text)) return true;
  return /\b(?:use (?:my |the )?computer|computer (?:use|control)|control (?:my |the )?(?:computer|desktop)|click (?:on |the |that |this )|(?:create|edit|write|rename|move|organize|delete) (?:a |the |my |this |these )?(?:file|folder|document)|(?:type|write) .+ (?:in|into) (?:notepad|the editor|the app)|help me .+ (?:in|with) (?:the ide|notepad|my editor))\b/i.test(
    text,
  );
}
export function browserTask(text: string): {
  browser: "edge" | "chrome" | "firefox";
  query: string;
  url?: string;
  useDefault?: boolean;
} | null {
  const navigation =
    /^(?:please\s+|can you\s+|could you\s+)?(?:open|visit|browse(?:\s+to)?|go\s+to)\s+(.+)/i.exec(
      text.trim(),
    );
  if (
    navigation &&
    !/\b(?:and\s+)?(?:search|look\s+up)\b/i.test(navigation[1])
  ) {
    const target = navigation[1]
      .replace(/\s+for me\b/gi, "")
      .replace(
        /\s+(?:on|in|using|with)\s+(?:(?:my|the|a)\s+)?(?:default\s+|web\s+)?(?:browser|web|internet|edge|chrome|firefox)[.!?]*$/i,
        "",
      )
      .replace(/^the\s+/i, "")
      .replace(/\s+(?:home\s*page|page|website|site)$/i, "")
      .replace(/[.!?]+$/, "")
      .trim();
    const known: Record<string, string> = {
      wikipedia: "https://www.wikipedia.org/",
      youtube: "https://www.youtube.com/",
      github: "https://github.com/",
      google: "https://www.google.com/",
    };
    let url = known[target.toLowerCase()];
    if (
      !url &&
      /^(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:[/:?#][^\s]*)?$/i.test(
        target,
      )
    ) {
      try {
        const parsed = new URL(
          /^https?:\/\//i.test(target) ? target : `https://${target}`,
        );
        if (
          ["http:", "https:"].includes(parsed.protocol) &&
          !parsed.username &&
          !parsed.password
        )
          url = parsed.href;
      } catch {
        /* Not a website address. */
      }
    }
    if (
      url ||
      (target &&
        /\b(?:page|website|site|browser|web|internet)\b/i.test(navigation[1]))
    ) {
      const named = /\b(edge|chrome|firefox)\b/i.exec(text);
      return {
        browser: named
          ? (named[1].toLowerCase() as "edge" | "chrome" | "firefox")
          : "edge",
        query: target,
        ...(url ? { url } : {}),
        ...(!named ? { useDefault: true } : {}),
      };
    }
  }
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
