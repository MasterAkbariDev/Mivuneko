import { useEffect, useRef } from "react";
import { Icon } from "./Icon";
import { micMeter, type MicPhase } from "./useOpenMic";

// The open-mic toggle doubles as the status indicator: its fill follows the live
// input level (written straight to the DOM, so the chat never re-renders for it).
export function MicButton({
  active,
  phase,
  waiting,
  speaking,
  disabled,
  onClick,
  compact = false,
}: {
  active: boolean;
  phase: MicPhase;
  waiting: boolean;
  speaking: boolean;
  disabled: boolean;
  onClick: () => void;
  compact?: boolean;
}) {
  const fill = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!active) return;
    let frame = 0,
      shown = 0;
    const tick = () => {
      shown += (micMeter.level - shown) * 0.35;
      fill.current?.style.setProperty("--level", shown.toFixed(3));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active]);
  const state = !active
    ? "off"
    : phase === "transcribing"
      ? "busy"
      : waiting
        ? "waiting"
        : speaking
          ? "talking"
          : phase;
  const label = {
    off: "Start open mic",
    busy: "Understanding…",
    waiting: "Thinking…",
    talking: "Speak to interrupt",
    hearing: "Hearing you",
    listening: "Listening",
    transcribing: "Understanding…",
  }[state];
  return (
    <button
      type="button"
      className={`mic-btn mic-${state} ${compact ? "mic-compact" : ""}`}
      disabled={disabled}
      aria-pressed={active}
      aria-label={active ? `Stop open mic (${label})` : "Start open mic"}
      title={active ? `${label} · click to turn off` : "Start open mic"}
      onClick={onClick}
    >
      <i ref={fill} className="mic-fill" />
      <span className="mic-icon">
        <Icon name="mic" />
      </span>
      <span className="mic-label">{label}</span>
      {active && <em className="mic-stop">Stop</em>}
    </button>
  );
}
