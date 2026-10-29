export function vrmFace(mood: string): Record<string, number> {
  switch (mood) {
    case "happy":
      return { happy: 0.7 };
    case "celebrating":
      return { happy: 0.9, surprised: 0.12 };
    case "excited":
      return { happy: 0.6, surprised: 0.38 };
    case "sad":
      return { sad: 0.65, relaxed: 0.08 };
    case "crying":
      return { sad: 0.95, blinkLeft: 0.42, blinkRight: 0.42 };
    case "concerned":
      return { sad: 0.4 };
    case "angry":
      return { angry: 0.75 };
    case "determined":
      return { angry: 0.4, relaxed: 0.1 };
    case "surprised":
      return { surprised: 0.8 };
    case "curious":
      return { surprised: 0.3, relaxed: 0.08 };
    case "thinking":
      return { relaxed: 0.3, blinkLeft: 0.12, blinkRight: 0.12 };
    case "confused":
      return { surprised: 0.35, sad: 0.15 };
    case "shy":
      return { happy: 0.25, relaxed: 0.5 };
    case "love":
      return { happy: 0.65, relaxed: 0.3 };
    case "teasing":
      return { happy: 0.48, blinkLeft: 0.3 };
    case "joking":
      return { happy: 0.8, blinkLeft: 0.25, blinkRight: 0.25 };
    case "wink":
      return { happy: 0.5, blinkLeft: 1 };
    case "proud":
      return { happy: 0.55, relaxed: 0.25 };
    case "sleeping":
      return { relaxed: 0.6, blinkLeft: 0.8, blinkRight: 0.8 };
    default:
      return { relaxed: 0.12 };
  }
}
export function vrmEffect(mood: string) {
  if (["happy", "love"].includes(mood)) return "hearts";
  if (["curious", "confused", "thinking"].includes(mood)) return "question";
  if (mood === "shy") return "blush";
  if (["sad", "crying", "concerned"].includes(mood)) return "sad";
  if (["angry", "determined"].includes(mood)) return "angry";
  if (mood === "surprised") return "surprised";
  if (mood === "sleeping") return "sleep";
  if (
    ["celebrating", "excited", "proud", "joking", "teasing", "wink"].includes(
      mood,
    )
  )
    return "celebrating";
  return "";
}

// A blink closes over 85 ms, rests briefly, then opens over 150 ms.
export function blinkAmount(time: number, reduced = false): number {
  if (reduced) return 0;
  const t = ((time % 5.1) + 5.1) % 5.1;
  const smooth = (x: number) => x * x * (3 - 2 * x);
  if (t < 0.085) return smooth(t / 0.085);
  if (t < 0.12) return 1;
  if (t < 0.27) return 1 - smooth((t - 0.12) / 0.15);
  return 0;
}
