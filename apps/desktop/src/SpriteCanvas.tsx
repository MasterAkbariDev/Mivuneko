import { useEffect, useRef, useState } from "react";
import { prepareAtlas, type AtlasFrame } from "./prepareSprites";
import type { ModelCanvas } from "./petHit";
export function SpriteCanvas({
  frame,
  className = "",
}: {
  frame: AtlasFrame;
  className?: string;
}) {
  const ref = useRef<ModelCanvas>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let disposed = false;
    setError("");
    void prepareAtlas(frame.image, frame.columns, frame.rows)
      .then((frames) => {
        if (disposed || !ref.current) return;
        const f = frames.frame(frame.row * frame.columns + frame.column),
          c = ref.current,
          ctx = c.getContext("2d")!;
        c.width = c.height = f.canvas.width;
        ctx.clearRect(0, 0, c.width, c.height);
        if (frame.mirror) {
          ctx.translate(c.width, 0);
          ctx.scale(-1, 1);
        }
        ctx.drawImage(f.canvas, 0, 0);
        c.dataset.ready = "true";
        c.petHit = (x, y) => {
          const r = c.getBoundingClientRect(),
            side = Math.min(r.width, r.height),
            left = r.left + (r.width - side) / 2,
            top = r.top + (r.height - side) / 2;
          let px = Math.floor(((x - left) / side) * 64);
          const py = Math.floor(((y - top) / side) * 64);
          if (frame.mirror) px = 63 - px;
          return (
            px >= 0 &&
            px < 64 &&
            py >= 0 &&
            py < 64 &&
            f.alpha[(py * 64 + px) * 4 + 3] > 30
          );
        };
      })
      .catch((e) => {
        if (!disposed) setError(String(e));
      });
    return () => {
      disposed = true;
    };
  }, [
    frame.image,
    frame.columns,
    frame.rows,
    frame.column,
    frame.row,
    frame.mirror,
  ]);
  return (
    <>
      <canvas
        ref={ref}
        className={className}
        aria-hidden="true"
        style={{ objectFit: "contain", background: "none" }}
      />
      {error && (
        <small role="alert">Character artwork could not be prepared.</small>
      )}
    </>
  );
}
