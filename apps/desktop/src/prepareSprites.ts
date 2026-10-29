export interface AtlasFrame {
  image: string;
  column: number;
  row: number;
  columns: number;
  rows: number;
  mirror: boolean;
}
export interface PreparedFrame {
  canvas: HTMLCanvasElement;
  alpha: Uint8ClampedArray;
}
interface PreparedAtlas {
  frame(index: number): PreparedFrame;
}
const cache = new Map<string, Promise<PreparedAtlas>>(),
  ready = new Set<string>();
const SIZE = 768;
const PADDING = Math.round(SIZE * 0.04);
/** Normalize one requested figure, not the whole sheet, to keep character browsing responsive. */
export function prepareAtlas(
  url: string,
  columns: number,
  rows: number,
): Promise<PreparedAtlas> {
  const key = `${url}:${columns}:${rows}`,
    old = cache.get(key);
  if (old) return old;
  const task = (async () => {
    const image = new Image();
    image.src = url;
    await image.decode();
    const w = image.naturalWidth,
      h = image.naturalHeight,
      source = document.createElement("canvas");
    source.width = w;
    source.height = h;
    const ctx = source.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(image, 0, 0);
    const data = ctx.getImageData(0, 0, w, h).data;
    const cut = (
      target: number,
      radius: number,
      limit: number,
      cost: (n: number) => number,
    ) => {
      let best = Math.round(target),
        score = Infinity;
      for (
        let n = Math.max(1, Math.floor(target - radius));
        n <= Math.min(Math.ceil(target + radius), limit - 1);
        n++
      ) {
        const s = cost(n) + Math.abs(n - target) * 0.12;
        if (s < score) {
          best = n;
          score = s;
        }
      }
      return best;
    };
    const rowCost = (y: number) => {
      let n = 0;
      for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > 80) n++;
      return n;
    };
    const ys = [
      0,
      ...Array.from({ length: rows - 1 }, (_, i) =>
        cut(((i + 1) * h) / rows, (h / rows) * 0.2, h, rowCost),
      ),
      h,
    ];
    const cuts = new Map<number, number[]>(),
      frames = new Map<number, PreparedFrame>();
    return {
      frame(index: number) {
        const cached = frames.get(index);
        if (cached) return cached;
        const row = Math.floor(index / columns),
          col = index % columns,
          top = ys[row],
          bottom = ys[row + 1];
        if (!cuts.has(row)) {
          const cost = (x: number) => {
            let n = 0;
            for (let y = top; y < bottom; y++)
              if (data[(y * w + x) * 4 + 3] > 80) n++;
            return n;
          };
          cuts.set(row, [
            0,
            ...Array.from({ length: columns - 1 }, (_, i) =>
              cut(((i + 1) * w) / columns, (w / columns) * 0.23, w, cost),
            ),
            w,
          ]);
        }
        const xs = cuts.get(row)!,
          left = xs[col],
          right = xs[col + 1],
          cw = right - left,
          ch = bottom - top,
          seen = new Uint8Array(cw * ch),
          queue = new Int32Array(cw * ch);
        let best: number[] = [];
        for (let start = 0; start < seen.length; start++) {
          if (seen[start]) continue;
          seen[start] = 1;
          const sx = start % cw,
            sy = Math.floor(start / cw);
          if (data[((top + sy) * w + left + sx) * 4 + 3] <= 64) continue;
          let read = 0,
            end = 1;
          queue[0] = start;
          while (read < end) {
            const at = queue[read++],
              x = at % cw,
              y = Math.floor(at / cw);
            for (const n of [
              x ? at - 1 : -1,
              x < cw - 1 ? at + 1 : -1,
              y ? at - cw : -1,
              y < ch - 1 ? at + cw : -1,
            ]) {
              if (n < 0 || seen[n]) continue;
              seen[n] = 1;
              const nx = n % cw,
                ny = Math.floor(n / cw);
              if (data[((top + ny) * w + left + nx) * 4 + 3] > 64)
                queue[end++] = n;
            }
          }
          if (end > best.length) best = Array.from(queue.subarray(0, end));
        }
        if (best.length < 20)
          throw Error("This sprite cell contains no character.");
        let x0 = cw,
          y0 = ch,
          x1 = 0,
          y1 = 0;
        for (const at of best) {
          const x = at % cw,
            y = Math.floor(at / cw);
          x0 = Math.min(x0, x);
          y0 = Math.min(y0, y);
          x1 = Math.max(x1, x);
          y1 = Math.max(y1, y);
        }
        x0 = Math.max(0, x0 - 2);
        y0 = Math.max(0, y0 - 2);
        x1 = Math.min(cw - 1, x1 + 2);
        y1 = Math.min(ch - 1, y1 + 2);
        const sw = x1 - x0 + 1,
          sh = y1 - y0 + 1,
          isolated = document.createElement("canvas");
        isolated.width = sw;
        isolated.height = sh;
        const ic = isolated.getContext("2d")!,
          pixels = ic.createImageData(sw, sh);
        // Preserve edge antialiasing around the selected silhouette, excluding neighboring figures.
        for (const at of best) {
          const x = at % cw,
            y = Math.floor(at / cw);
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              const px = x + dx,
                py = y + dy;
              if (px < x0 || px > x1 || py < y0 || py > y1) continue;
              const from = ((top + py) * w + left + px) * 4,
                to = ((py - y0) * sw + px - x0) * 4;
              pixels.data[to] = data[from];
              pixels.data[to + 1] = data[from + 1];
              pixels.data[to + 2] = data[from + 2];
              pixels.data[to + 3] = data[from + 3];
            }
        }
        ic.putImageData(pixels, 0, 0);
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = SIZE;
        const out = canvas.getContext("2d")!;
        const scale = Math.min(
            (SIZE - PADDING * 2) / sw,
            (SIZE - PADDING * 2) / sh,
          ),
          dw = sw * scale,
          dh = sh * scale;
        out.drawImage(isolated, (SIZE - dw) / 2, SIZE - PADDING - dh, dw, dh);
        const mask = document.createElement("canvas");
        mask.width = mask.height = 64;
        const mc = mask.getContext("2d")!;
        mc.drawImage(canvas, 0, 0, 64, 64);
        const frame = { canvas, alpha: mc.getImageData(0, 0, 64, 64).data };
        frames.set(index, frame);
        if (frames.size > 4) frames.delete(frames.keys().next().value!);
        return frame;
      },
    };
  })()
    .then((atlas) => {
      ready.add(key);
      for (const k of cache.keys()) {
        if (ready.size <= 6) break;
        if (k !== key && ready.has(k)) {
          cache.delete(k);
          ready.delete(k);
        }
      }
      return atlas;
    })
    .catch((e) => {
      cache.delete(key);
      ready.delete(key);
      throw e;
    });
  cache.set(key, task);
  return task;
}
