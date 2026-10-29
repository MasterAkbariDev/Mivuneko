import { useEffect, useRef, useState } from "react";
import type { SavedPack } from "./characterPackStore";
import type { PackFrame } from "../../../packages/shared-schemas/character-pack";
import type { BodyAction } from "../../../packages/character/controller";
import type { ModelCanvas } from "./petHit";
export function PackIllustration({
  pack,
  pose,
  body = "idle",
  direction = 0,
  reduced = false,
}: {
  pack: SavedPack;
  pose: string;
  body?: BodyAction;
  direction?: number;
  reduced?: boolean;
}) {
  const ref = useRef<ModelCanvas>(null),
    [error, setError] = useState("");
  const m = pack.manifest;
  const facing =
    Math.abs(direction) >= 1.5
      ? "back"
      : Math.abs(direction) <= 0.5
        ? "front"
        : direction < 0
          ? "left"
          : "right";
  const movement =
    body === "walk" || body === "run"
      ? `${body}-${facing}`
      : body === "sit"
        ? "sit"
        : "";
  const selected = m.poses[movement]
    ? movement
    : m.poses[pose]
      ? pose
      : m.fallbackPose;
  useEffect(() => {
    let disposed = false,
      raf = 0,
      started = performance.now(),
      pointer = { x: 0, y: 0 },
      painted = "";
    const images = new Map<string, Promise<ImageBitmap>>();
    setError("");
    const track = (e: PointerEvent) => {
      const r = ref.current?.getBoundingClientRect();
      if (r)
        pointer = {
          x: Math.max(
            -1,
            Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1),
          ),
          y: Math.max(
            -1,
            Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1),
          ),
        };
    };
    const image = (id: string) => {
      if (!images.has(id)) {
        const blob = pack.assets[id];
        if (!blob) throw Error("Missing artwork");
        images.set(id, createImageBitmap(blob));
      }
      return images.get(id)!;
    };
    async function drawFrame(
      f: PackFrame,
      depth = 0,
      origin: [number, number] = [0.5, 0.5],
    ) {
      const im = await image(f.asset);
      if (disposed || !ref.current) return;
      const c = ref.current,
        ctx = c.getContext("2d")!,
        asset = m.assets[f.asset];
      let rect = f.rect ?? [0, 0, im.width, im.height];
      if (f.cell && asset.grid) {
        const sw = im.width / asset.grid.columns,
          sh = im.height / asset.grid.rows;
        rect = [f.cell[0] * sw, f.cell[1] * sh, sw, sh];
      }
      const [sx, sy, sw, sh] = rect,
        [ax, ay] = f.anchor,
        targetX = c.width * 0.5,
        targetY = c.height * 0.94,
        pad = c.width * 0.03;
      const scale = Math.min(
        ax ? (targetX - pad) / (sw * ax) : Infinity,
        ax < 1 ? (c.width - targetX - pad) / (sw * (1 - ax)) : Infinity,
        ay ? (targetY - pad) / (sh * ay) : Infinity,
        ay < 1 ? (c.height - targetY - pad) / (sh * (1 - ay)) : Infinity,
      );
      const dw = sw * scale,
        dh = sh * scale,
        x = targetX - dw * ax,
        y = targetY - dh * ay;
      ctx.save();
      if (!reduced && depth) {
        ctx.translate(
          pointer.x * depth * c.width * 0.025,
          pointer.y * depth * c.height * 0.015,
        );
        const ox = x + dw * origin[0],
          oy = y + dh * origin[1];
        ctx.translate(ox, oy);
        ctx.rotate(pointer.x * depth * 0.025);
        ctx.translate(-ox, -oy);
      }
      ctx.drawImage(im, sx, sy, sw, sh, x, y, dw, dh);
      ctx.restore();
    }
    async function animate(now: number) {
      if (disposed || !ref.current) return;
      const c = ref.current,
        clip = m.poses[selected],
        total = clip.frames.reduce((n, f) => n + f.durationMs, 0),
        elapsed = reduced
          ? 0
          : clip.loop
            ? (now - started) % total
            : Math.min(now - started, total - 1);
      let t = 0,
        index = 0;
      for (let i = 0; i < clip.frames.length; i++) {
        t += clip.frames[i].durationMs;
        if (elapsed < t) {
          index = i;
          break;
        }
      }
      const r = c.getBoundingClientRect(),
        size = Math.max(
          256,
          Math.min(
            2048,
            Math.round(
              Math.max(r.width, r.height) * Math.max(1, devicePixelRatio),
            ),
          ),
        ),
        key = `${index}:${size}:${Math.round(pointer.x * 40)}:${Math.round(pointer.y * 40)}`;
      if (key !== painted) {
        try {
          c.width = c.height = size;
          const ctx = c.getContext("2d")!;
          ctx.clearRect(0, 0, size, size);
          for (const l of m.layers.filter((l) => l.depth < 0))
            await drawFrame(m.frames[l.frame], l.depth, l.origin);
          await drawFrame(m.frames[clip.frames[index].frame]);
          for (const l of m.layers.filter((l) => l.depth >= 0))
            await drawFrame(m.frames[l.frame], l.depth, l.origin);
          if (disposed) return;
          const mask = document.createElement("canvas");
          mask.width = mask.height = 64;
          const mc = mask.getContext("2d")!;
          mc.drawImage(c, 0, 0, 64, 64);
          const alpha = mc.getImageData(0, 0, 64, 64).data;
          c.petHit = (x, y) => {
            const r = c.getBoundingClientRect(),
              side = Math.min(r.width, r.height),
              px = Math.floor(
                ((x - r.left - (r.width - side) / 2) / side) * 64,
              ),
              py = Math.floor(
                ((y - r.top - (r.height - side) / 2) / side) * 64,
              );
            return (
              px >= 0 &&
              px < 64 &&
              py >= 0 &&
              py < 64 &&
              alpha[(py * 64 + px) * 4 + 3] > 30
            );
          };
          c.dataset.ready = "true";
          painted = key;
        } catch (e) {
          if (!disposed) setError(String(e));
          return;
        }
      }
      raf = requestAnimationFrame(animate);
    }
    window.addEventListener("pointermove", track);
    raf = requestAnimationFrame(animate);
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", track);
      for (const p of images.values())
        void p.then((im) => im.close()).catch(() => {});
    };
  }, [pack, selected, reduced]);
  return (
    <div
      className="pack-illustration"
      role="img"
      aria-label={`${m.name} ${m.format} companion, ${selected}`}
    >
      <canvas
        ref={ref}
        style={{ width: "100%", height: "100%", objectFit: "contain" }}
      />
      {error && <small role="alert">{error}</small>}
    </div>
  );
}
