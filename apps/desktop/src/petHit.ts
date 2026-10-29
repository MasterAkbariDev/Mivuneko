export type ModelCanvas = HTMLCanvasElement & {
  petHit?: (x: number, y: number) => boolean;
};
export function hitsModel(root: HTMLElement | null, x: number, y: number) {
  const canvas = root?.querySelector<ModelCanvas>("canvas");
  if (canvas) return canvas.petHit?.(x, y) ?? false;
  const img = root?.querySelector(".luna-model, .luna-sprite");
  if (!img) return false;
  const r = img.getBoundingClientRect();
  // Illustrated characters use the central silhouette, never the whole window.
  return (
    x > r.left + r.width * 0.25 &&
    x < r.right - r.width * 0.25 &&
    y > r.top + r.height * 0.12 &&
    y < r.bottom - r.height * 0.08
  );
}
