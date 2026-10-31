export type VadState = "silence" | "speech" | "end";
export type Sensitivity = "low" | "normal" | "high";
// Speech must exceed max(min, floor * ratio): lower ratios pick up quieter voices.
const SENSITIVITY: Record<Sensitivity, { min: number; ratio: number }> = {
  low: { min: 0.012, ratio: 3.5 },
  normal: { min: 0.007, ratio: 2.5 },
  high: { min: 0.005, ratio: 2 },
};
export interface Vad {
  push(frame: Float32Array): VadState;
  // Audio from just before speech was confirmed, including the confirming frames.
  takePreRoll(): Float32Array[];
  reset(): void;
  // Stricter thresholds while the character is talking, so her own voice leaking
  // back into the mic is not taken for you interrupting.
  strict: boolean;
  // Latest frame level and the current speech threshold, for a UI meter.
  readonly meter: { level: number; threshold: number };
  // The learned noise floor, to start the next detector without recalibrating.
  readonly floor: number;
}
const MIN_END = 0.004,
  MAX_FLOOR = 0.05;
function level(frame: Float32Array) {
  let sum = 0;
  for (const sample of frame)
    sum += Number.isFinite(sample) ? sample * sample : 0;
  return frame.length ? Math.sqrt(sum / frame.length) : 0;
}
// Energy VAD with an adaptive noise floor. Raw RMS, not the 4x mouth-scaled one.
export function createVad({
  sampleRate,
  preRollMs = 400,
  minSpeechMs = 150,
  endSilenceMs = 600,
  sensitivity = "normal",
  initialFloor,
}: {
  sampleRate: number;
  preRollMs?: number;
  minSpeechMs?: number;
  endSilenceMs?: number;
  sensitivity?: Sensitivity;
  // A floor learned earlier in the same room; skips the start-up calibration.
  initialFloor?: number;
}): Vad {
  const perMs = sampleRate / 1000,
    minSpeech = minSpeechMs * perMs,
    endSilence = endSilenceMs * perMs,
    keep = (preRollMs + minSpeechMs) * perMs;
  let floor = initialFloor ?? 0.003,
    speaking = false,
    voicedRun = 0,
    quietRun = 0,
    heard = initialFloor === undefined ? 0 : 600 * perMs,
    speechLevel = 0,
    ring: Float32Array[] = [],
    ringSize = 0;
  const { min: minSpeechLevel, ratio } = SENSITIVITY[sensitivity];
  const meter = { level: 0, threshold: minSpeechLevel };
  return {
    meter,
    get floor() {
      return floor;
    },
    strict: false,
    push(frame) {
      const rms = level(frame),
        seconds = frame.length / sampleRate;
      meter.level = rms;
      meter.threshold = this.strict
        ? Math.max(0.03, floor * 4)
        : Math.max(minSpeechLevel, floor * ratio);
      if (!speaking) {
        // The first 300 ms only calibrate the floor, so a noisy room at mic start
        // is not mistaken for speech.
        // Mics often start with digital silence, so skip the first 250 ms.
        const before = heard;
        heard += frame.length;
        const dead = heard <= 250 * perMs,
          warm = !dead && before < 600 * perMs;
        if (dead) {
          ring.push(frame);
          ringSize += frame.length;
          return "silence";
        }
        if (warm) floor = before < 250 * perMs ? rms : (floor + rms) / 2;
        floor = Math.min(MAX_FLOOR, floor);
        const voiced = !warm && rms > meter.threshold;
        ring.push(frame);
        ringSize += frame.length;
        while (ring.length > 1 && ringSize - ring[0].length >= keep)
          ringSize -= ring.shift()!.length;
        if (voiced) {
          voicedRun += frame.length;
          if (voicedRun >= minSpeech * (this.strict ? 2 : 1)) {
            speaking = true;
            quietRun = 0;
            speechLevel = rms;
            return "speech";
          }
          return "silence";
        }
        voicedRun = 0;
        // Plain EMA (about 0.5 s time constant) tracks the room while quiet.
        const alpha = 1 - Math.exp(-seconds / 0.5);
        floor = Math.min(MAX_FLOOR, floor + (rms - floor) * alpha);
        return "silence";
      }
      // Speech tails fall relative to how loud you were, not just the noise floor.
      speechLevel = Math.max(speechLevel * 0.995, rms);
      if (rms < Math.max(MIN_END, floor * 2, speechLevel * 0.12))
        quietRun += frame.length;
      else quietRun = 0;
      if (quietRun >= endSilence) {
        speaking = false;
        voicedRun = 0;
        quietRun = 0;
        ring = [];
        ringSize = 0;
        return "end";
      }
      return "speech";
    },
    takePreRoll() {
      const out = ring;
      ring = [];
      ringSize = 0;
      return out;
    },
    reset() {
      speaking = false;
      voicedRun = quietRun = ringSize = heard = speechLevel = 0;
      ring = [];
    },
  };
}
