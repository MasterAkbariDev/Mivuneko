export type IconName =
  | "chat"
  | "activity"
  | "shield"
  | "settings"
  | "cat"
  | "pin"
  | "moon"
  | "window"
  | "link"
  | "mic"
  | "stop"
  | "send"
  | "close"
  | "chevron"
  | "sparkle"
  | "grid"
  | "volume"
  | "sun";
const paths: Record<IconName, string> = {
  mic: "M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0V5Zm-3 6v1a6 6 0 0 0 12 0v-1m-6 7v4m-3 0h6",
  stop: "M6 6h12v12H6V6Z",
  send: "m5 3 16 9-16 9 3-9-3-9Zm3 9h13",
  close: "m6 6 12 12M6 18 18 6",
  chevron: "m9 5 7 7-7 7",
  sparkle: "m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z",
  grid: "M3 3h6v6H3V3Zm12 0h6v6h-6V3ZM3 15h6v6H3v-6Zm12 0h6v6h-6v-6Z",
  volume: "M4 9h4l5-5v16l-5-5H4V9Zm12-2a7 7 0 0 1 0 10m3-13a11 11 0 0 1 0 16",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-6v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5",
  chat: "M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6 4V6a2 2 0 0 1 2-2Zm3 6h.01M12 10h.01M16 10h.01",
  activity: "M2 12h4l3-8 5 16 3-8h5",
  shield: "M12 3 3 7v6c0 5 9 9 9 9s9-4 9-9V7l-9-4Zm0 5v8m-4-4h8",
  settings:
    "m9 3-.6 3-2.5 1-2.5-1.2L1 10l2.5 2L3 15l-1 1 3 4 3-1 2 1 .5 3h4l.5-3 2-1 3 1 3-4-2-2v-3l2-1-2-4-3 1-2-1-.5-3H9ZM12 9a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z",
  cat: "M6 21h13c2-2 1-5-1-6V9l-1-6-5 4-5-3-2 7-2 5c-1 3 0 5 3 5Zm3-9h.01M14 12h.01m-4 4h2",
  pin: "m8 3 8 0-1 7 4 4H5l4-4-1-7Zm4 11v8",
  moon: "M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z",
  window: "M3 4h18v16H3V4Zm0 5h18M7 6.5h.01M10 6.5h.01",
  link: "m9 15 6-6m-7 3-2 2a4 4 0 0 0 6 6l3-3m-6-10 3-3a4 4 0 0 1 6 6l-2 2",
};
export function Icon({ name }: { name: IconName }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
