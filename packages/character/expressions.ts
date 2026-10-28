export function vrmFace(mood: string): Record<string, number> {
  switch (mood) {
    case "happy":
      return { happy: 0.7 };
    case "celebrating":
    case "excited":
      return { happy: 0.85, surprised: 0.2 };
    case "sad":
    case "crying":
      return { sad: 0.8 };
    case "concerned":
      return { sad: 0.4 };
    case "angry":
      return { angry: 0.75 };
    case "determined":
      return { angry: 0.4, relaxed: 0.1 };
    case "surprised":
      return { surprised: 0.8 };
    case "curious":
    case "thinking":
      return { surprised: 0.25, relaxed: 0.15 };
    case "confused":
      return { surprised: 0.35, sad: 0.15 };
    case "shy":
      return { happy: 0.25, relaxed: 0.5 };
    case "love":
      return { happy: 0.65, relaxed: 0.3 };
    case "teasing":
    case "joking":
      return { happy: 0.6 };
    case "wink":
      return { happy: 0.5, blinkLeft: 1 };
    case "proud":
      return { happy: 0.55, relaxed: 0.25 };
    case "sleeping":
      return { relaxed: 0.6 };
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
