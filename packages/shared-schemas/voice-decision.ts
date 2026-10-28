/** Only unambiguous, complete spoken decisions can resolve an approval. */
export function voiceDecision(text: string): boolean | null {
  const normalized = text.trim().toLowerCase().replace(/[.!?,]+$/g, "").trim();
  if (["yes", "approve", "allow", "allow once", "approve once"].includes(normalized)) return true;
  if (["no", "deny", "reject", "cancel"].includes(normalized)) return false;
  return null;
}
