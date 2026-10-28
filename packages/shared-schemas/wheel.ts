export const PET_SCALE_MIN = 0.5,
  PET_SCALE_MAX = 1.8,
  WHEEL_STEP = 0.05,
  WHEEL_PIXELS = 40;
// Turns wheel/trackpad deltas into pet-scale changes: mouse notches and trackpad
// pixels are normalised, then accumulated so small trackpad deltas still resize.
export function createWheelScaler(now: () => number = () => Date.now()) {
  let sum = 0,
    last = 0;
  return {
    // Returns the new scale, or null while the accumulated movement is below a step.
    push(deltaY: number, deltaMode: number, scale: number): number | null {
      if (!Number.isFinite(deltaY) || deltaY === 0) return null;
      const t = now();
      if (t - last > 250) sum = 0;
      last = t;
      sum +=
        deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 400 : deltaY;
      const steps = Math.trunc(sum / WHEEL_PIXELS);
      if (!steps) return null;
      sum -= steps * WHEEL_PIXELS;
      // Scrolling up grows the pet, down shrinks it.
      const next = scale - steps * WHEEL_STEP;
      return (
        Math.round(
          Math.max(PET_SCALE_MIN, Math.min(PET_SCALE_MAX, next)) * 100,
        ) / 100
      );
    },
  };
}
