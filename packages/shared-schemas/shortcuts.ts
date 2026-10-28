export type ShortcutEvent = Pick<
  KeyboardEvent,
  "key" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey"
>;
export function shortcutFor(e: ShortcutEvent) {
  if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) return "";
  const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  return [
    ...(e.ctrlKey ? ["Ctrl"] : []),
    ...(e.altKey ? ["Alt"] : []),
    ...(e.shiftKey ? ["Shift"] : []),
    ...(e.metaKey ? ["Meta"] : []),
    key,
  ].join("+");
}
export function matchesShortcut(e: ShortcutEvent, shortcut: string) {
  return shortcutFor(e).toLowerCase() === shortcut.toLowerCase();
}
