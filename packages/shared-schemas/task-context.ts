/** Task context is separate from the visible conversation so short follow-ups keep their goal. */
export function requestedFolder(text: string): string {
  const match =
    /["“']([a-z]:[\\/][^"”'\r\n]+)["”']/i.exec(text) ??
    /\b([a-z]:[\\/][^\r\n"<>|?*]+?)(?=\s+(?:please|and then|then)\b|$)/i.exec(
      text.trim(),
    );
  if (!match) return "";
  let path = match[1]
    .trim()
    .replace(/[.!?]+$/, "")
    .replace(/\\/g, "/");
  if (/\.(?:js|ts|tsx|jsx|py|html|css|json|md|txt|csv)$/i.test(path))
    path = path.slice(0, path.lastIndexOf("/"));
  return path.length > 3 ? path.replace(/\/+$/, "") : "";
}
export function fileTask(text: string): boolean {
  return (
    !!requestedFolder(text) &&
    /\b(?:create|write|save|implement|generate|build|code|example|file|folder|directory)\b/i.test(
      text,
    )
  );
}
export function isTaskFollowup(text: string): boolean {
  return /\b(?:for (?:that|this)(?: matter)?|instead|same (?:task|file|folder)|as (?:I|we) (?:said|discussed))\b|^(?:yes|no|continue|go ahead|notepad|use notepad)[.!?]*$/i.test(
    text.trim(),
  );
}
export function taskWithContext(text: string, previous: string): string {
  return previous && isTaskFollowup(text)
    ? `${previous.slice(-2800)}\nUser clarification: ${text}`
    : text;
}
