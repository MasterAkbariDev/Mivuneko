/** Read-only window checks return observations without launching or focusing an app. */
export function appWindowQuery(text: string): string | null {
  if (/\b(?:how (?:do|can|to)|explain|example)\b/i.test(text)) return null;
  const match =
    /\b(?:check|see|tell me) (?:if|whether) (?:my |the )?(.{1,80}?) is (?:currently |already )?(?:open|running|launched)(?: (?:on my (?:desktop|computer)|for me))?[.!?]*$/i.exec(
      text.trim(),
    ) ??
    /^(?:hey [\w-]+[,!]?\s+)?(?:is|do I have) (?:my |the )?(.{1,80}?) (?:currently |already )?(?:open|running|launched)[.!?]*$/i.exec(
      text.trim(),
    );
  return match && !/\b(?:and|then|if)\b/i.test(match[1])
    ? match[1].trim()
    : null;
}
export function matchingAppWindows<
  T extends { title: string; process: string },
>(query: string, windows: T[]): T[] {
  const normalized = query
    .toLowerCase()
    .replace(/\.exe$/, "")
    .replace(/[^a-z0-9]/g, "");
  const aliases: Record<string, string> = {
    vscode: "code",
    visualstudiocode: "code",
    microsoftedge: "msedge",
    edge: "msedge",
    googlechrome: "chrome",
    windowsnotepad: "notepad",
  };
  const process = aliases[normalized] || normalized;
  return windows.filter((w) => {
    const executable = w.process
      .toLowerCase()
      .replace(/\.exe$/, "")
      .replace(/[^a-z0-9]/g, "");
    const title = w.title.toLowerCase().replace(/[^a-z0-9]/g, "");
    return (
      executable === process ||
      (normalized.length >= 3 && title.includes(normalized))
    );
  });
}
export function terminalTask(text: string): boolean {
  return /^(?:please |can you |could you )?(?:(?:run|execute) (?:npm|pnpm|yarn|npx|git|python|node|cargo|dotnet|go|pytest|a command|the command|tests?|the tests?|a build|the build)\b|install (?:the )?dependencies\b|build (?:this|the) project\b)/i.test(
    text.trim(),
  );
}
/** Only direct user requests enter computer sessions; model output cannot start one. */
export function computerIntent(text: string): boolean {
  if (appWindowQuery(text) || browserTask(text) || terminalTask(text))
    return true;
  if (
    !/\b(?:explain|what is|how (?:do|can|to)|why)\b/i.test(text) &&
    /\b(?:create|write|build|implement|code)\b.*\b(?:function|example|script|program|code|directory|folder)\b/i.test(
      text,
    )
  )
    return true;
  return /\b(?:use (?:my |the )?computer|computer (?:use|control)|control (?:my |the )?(?:computer|desktop)|click (?:on |the |that |this )|(?:create|edit|write|rename|move|organize|delete) (?:a |the |my |this |these )?(?:file|folder|document)|(?:type|write) .+ (?:in|into) (?:notepad|the editor|the app)|help me .+ (?:in|with) (?:the ide|notepad|my editor))\b/i.test(
    text,
  );
}
export function browserTask(text: string): {
  browser: "edge" | "chrome" | "firefox";
  query: string;
  url?: string;
  useDefault?: boolean;
  intent?: "page";
} | null {
  const navigation =
    /^(?:please\s+|can you\s+|could you\s+)?(?:open|visit|browse(?:\s+to)?|go\s+to|find|show(?:\s+me)?)\s+(.+)/i.exec(
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
      .replace(/^(?:the|a|an)\s+/i, "")
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
      !/\.(?:exe|msi|bat|cmd|ps1|py|js|ts|json|txt|zip|pdf|docx?)$/i.test(
        target,
      ) &&
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
        ...(url ? { url } : { intent: "page" as const }),
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
      .replace(/[\\.!?]+$/, "")
      .replace(/\s+for me\b/gi, "")
      .replace(
        /\s+(?:on|in|using|with)\s+(?:(?:my|the|a)\s+)?(?:default\s+|web\s+)?(?:browser|web|internet|edge|chrome|firefox)$/i,
        "",
      )
      .replace(/^(?:about|for)\s+/i, "")
      .trim(),
    ...(!explicit ? { useDefault: true } : {}),
  };
}
