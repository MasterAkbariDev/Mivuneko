import { useEffect, useRef, useState } from "react";
import { isNative } from "./broker";
import type { Preferences } from "./preferences";
import type { CompanionTask } from "./companionTask";
import {
  areaOf,
  PET_TOP,
  PET_EXTRA,
  contain,
  nearestDisplay,
  displayFor,
  destinationPoint,
  petWindowSize,
  reachable,
  routeBetween,
  advance,
  type Display,
  type Point,
  type Waypoint,
} from "../../../packages/shared-schemas/pet-placement.ts";
interface Options {
  prefs: Preferences;
  task: CompanionTask | null;
  moving: boolean;
  running: boolean;
  dragging: boolean;
  manualUntil: { current: number };
  placing: { current: boolean };
  resizeAnchor: {
    current: { edge: string; anchor?: Point; factor?: number } | null;
  };
  onDirection: (n: number) => void;
  onComplete: (at: number) => void;
  onRest: () => void;
  onError: (e: string) => void;
}
export function usePetPlacement(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  const [layout, setLayout] = useState({
    scale: Math.min(options.prefs.petScale, 1),
    fitted: false,
  });
  const force = useRef(false);
  useEffect(() => {
    if (!isNative) {
      const m: Display = {
        position: { x: 0, y: 0 },
        scaleFactor: 1,
        workArea: {
          position: { x: 0, y: 0 },
          size: { width: innerWidth, height: innerHeight },
        },
      };
      const f = petWindowSize(
        options.prefs.petScale,
        m,
        options.prefs.renderer === "2d",
      );
      setLayout({ scale: f.scale, fitted: f.fitted });
      return;
    }
  }, [options.prefs.petScale, options.prefs.renderer]);
  useEffect(() => {
    if (!isNative) return;
    let disposed = false,
      busy = false,
      ready = false,
      last = performance.now(),
      refresh = 0,
      saveTimer: ReturnType<typeof setTimeout> | undefined;
    let w: import("@tauri-apps/api/window").Window,
      all: Display[] = [],
      monitor: Display,
      position: Point = { x: 0, y: 0 },
      size = { width: 320, height: 480 };
    let sized = "",
      taskAt = 0,
      finished = 0,
      route: Waypoint[] = [],
      waypoint = 0,
      targetDisplay: Display | undefined,
      roam = 1,
      roamTarget: Point | undefined,
      lastRoaming = false;
    const offs: Array<() => void> = [];
    async function status(at: number, state: string, message: string) {
      const { emitTo } = await import("@tauri-apps/api/event");
      await emitTo("main", "pet-move-result", { at, state, message });
    }
    function viewport(p = position) {
      if (!all.length) return;
      const m = nearestDisplay(p, size, all),
        a = areaOf(m),
        factor = size.width / Math.max(1, innerWidth),
        root = document.querySelector<HTMLElement>(".pet-root");
      if (!root) return;
      const values = {
        left: Math.max(0, (a.x - p.x) / factor),
        top: Math.max(0, (a.y - p.y) / factor),
        right: Math.min(innerWidth, (a.x + a.width - p.x) / factor),
        bottom: Math.min(innerHeight, (a.y + a.height - p.y) / factor),
      };
      for (const [k, v] of Object.entries(values))
        root.style.setProperty(`--visible-${k}`, `${v}px`);
    }
    async function fit(restore = false) {
      const { PhysicalSize, PhysicalPosition } =
          await import("@tauri-apps/api/dpi"),
        o = latest.current;
      monitor = nearestDisplay(position, size, all);
      const requested = o.prefs.petAvoiding
          ? Math.min(o.prefs.petScale, 0.7)
          : o.prefs.petScale,
        f = petWindowSize(requested, monitor, o.prefs.renderer === "2d");
      const signature = [
        monitor.scaleFactor,
        requested,
        o.prefs.renderer,
        f.width,
        f.height,
      ].join(":");
      if (signature !== sized || restore || force.current) {
        o.placing.current = true;
        try {
          const old = { ...size };
          const head = parseFloat(
            document
              .querySelector<HTMLElement>(".pet-root")
              ?.style.getPropertyValue("--model-top") ?? "",
          );
          const headFraction = Number.isFinite(head)
            ? Math.max(
                0,
                Math.min(
                  0.8,
                  (head - PET_TOP) / Math.max(1, old.height - PET_EXTRA),
                ),
              )
            : 0.08;
          await w.setSize(new PhysicalSize(f.width, f.height));
          if (disposed) return;
          size = await w.outerSize();
          const visible = all.some((m) => {
            const a = areaOf(m);
            return (
              Math.min(position.x + size.width, a.x + a.width) -
                Math.max(position.x, a.x) >
                24 &&
              Math.min(position.y + size.height, a.y + a.height) -
                Math.max(position.y, a.y) >
                24
            );
          });
          const candidate = restore
            ? position
            : {
                x: position.x + (old.width - size.width) / 2,
                y: position.y + (old.height - size.height) * headFraction,
              };
          position = restore
            ? reachable(candidate, size, areaOf(monitor))
            : candidate;
          if (!o.resizeAnchor.current?.anchor)
            await w.setPosition(
              new PhysicalPosition(
                Math.round(position.x),
                Math.round(position.y),
              ),
            );
          else position = await w.outerPosition();
          setLayout({ scale: f.scale, fitted: f.fitted });
          sized = signature;
          force.current = false;
        } finally {
          o.placing.current = false;
        }
      }
    }

    async function tick() {
      if (busy || disposed) return;
      busy = true;
      const now = performance.now(),
        dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      try {
        const o = latest.current;
        if (!ready) return;
        if (o.dragging) return;
        if (now - refresh > 800 || force.current) {
          const { availableMonitors } = await import("@tauri-apps/api/window");
          all = await availableMonitors();
          position = await w.outerPosition();
          size = await w.outerSize();
          refresh = now;
        }
        await fit();
        viewport();
        if (disposed || Date.now() < o.manualUntil.current) return;
        if (o.task && taskAt !== o.task.at) {
          taskAt = o.task.at;
          finished = 0;
          route = [];
          waypoint = 0;
          try {
            monitor = nearestDisplay(position, size, all);
            targetDisplay = displayFor(o.task.destination, monitor, all);
            let target = destinationPoint(
              o.task.destination,
              position,
              size,
              targetDisplay,
            );
            if (o.task.destination === "unobtrusive") {
              const { invoke } = await import("@tauri-apps/api/core");
              target = await invoke<Point>("quiet_pet_position");
            }
            route = routeBetween(
              position,
              target,
              size,
              monitor,
              targetDisplay,
            );
            o.onError("");
            await status(taskAt, "started", "I'm moving to your chosen spot.");
          } catch (e) {
            finished = taskAt;
            o.onComplete(taskAt);
            o.onError(String(e));
            await status(taskAt, "failed", String(e));
          }
        }
        if (!o.task) {
          taskAt = 0;
          finished = 0;
          route = [];
        }
        if (!o.moving) {
          lastRoaming = false;
          roamTarget = undefined;
        }
        if (
          !o.moving ||
          (!o.task &&
            (size.width > areaOf(monitor).width ||
              size.height > areaOf(monitor).height))
        )
          return;
        let point = { ...position };
        if (o.task && finished !== o.task.at && route.length) {
          const target = route[waypoint];
          if (target.transfer) {
            point = { x: target.x, y: target.y };
            waypoint++;
          } else {
            const step = advance(
              position,
              target,
              (o.running ? 300 : 185) * (monitor.scaleFactor || 1),
              dt,
            );
            point = step.point;
            o.onDirection(step.direction);
            if (step.done) {
              waypoint++;
              if (waypoint >= route.length) {
                finished = o.task.at;
                o.onComplete(finished);
                o.onDirection(0);
                await status(finished, "arrived", "I'm here.");
              }
            }
          }
        } else if (!o.task) {
          const a = areaOf(monitor);
          if (!lastRoaming || !roamTarget) {
            const { invoke } = await import("@tauri-apps/api/core");
            const quiet = await invoke<Point>("quiet_pet_position").catch(
              () => ({ x: a.x, y: position.y }),
            );
            const dx = quiet.x - position.x;
            roamTarget = reachable(
              {
                x:
                  position.x +
                  Math.sign(dx || roam) *
                    Math.min(
                      Math.abs(dx) || 80,
                      240 * (monitor.scaleFactor || 1),
                    ),
                y: position.y,
              },
              size,
              a,
            );
          }
          lastRoaming = true;
          const step = advance(
            position,
            roamTarget,
            65 * (monitor.scaleFactor || 1),
            dt,
          );
          point = step.point;
          o.onDirection(step.direction);
          // A short purposeful leg ends in rest rather than bouncing at an edge.
          if (step.done) {
            roam = -roam;
            o.onDirection(0);
            o.onRest();
          }
        }
        if (point.x !== position.x || point.y !== position.y) {
          const { PhysicalPosition } = await import("@tauri-apps/api/dpi");
          if (disposed || o.dragging || Date.now() < o.manualUntil.current)
            return;
          await w.setPosition(
            new PhysicalPosition(Math.round(point.x), Math.round(point.y)),
          );
          position = point;
        }
      } catch (e) {
        if (!disposed) {
          latest.current.onError(`Desktop placement: ${String(e)}`);
          if (latest.current.task && finished !== latest.current.task.at) {
            finished = latest.current.task.at;
            latest.current.onComplete(finished);
            await status(
              finished,
              "failed",
              "I could not move safely. Use Find pet in the tray menu.",
            ).catch(() => {});
          }
        }
      } finally {
        busy = false;
      }
    }
    const anchored = (event: Event) => {
      const start = latest.current.resizeAnchor.current;
      if (!ready || disposed || !start?.anchor) return;
      const b = (
          event as CustomEvent<{
            left: number;
            right: number;
            top: number;
            bottom: number;
          }>
        ).detail,
        factor = start.factor ?? 1;
      const x = start.edge.includes("w")
        ? b.right
        : start.edge.includes("e")
          ? b.left
          : (b.left + b.right) / 2;
      const y = start.edge.includes("n")
        ? b.bottom
        : start.edge.includes("s")
          ? b.top
          : (b.top + b.bottom) / 2;
      const target = reachable(
        { x: start.anchor.x - x * factor, y: start.anchor.y - y * factor },
        size,
        areaOf(monitor),
      );
      if (
        Math.abs(target.x - position.x) < 1 &&
        Math.abs(target.y - position.y) < 1
      )
        return;
      position = target;
      void import("@tauri-apps/api/dpi")
        .then(({ PhysicalPosition }) => {
          if (!disposed && latest.current.resizeAnchor.current === start)
            return w.setPosition(
              new PhysicalPosition(Math.round(target.x), Math.round(target.y)),
            );
        })
        .catch((e) => latest.current.onError(String(e)));
    };
    window.addEventListener("pet-render-bounds", anchored);
    void (async () => {
      const { getCurrentWindow, availableMonitors } =
          await import("@tauri-apps/api/window"),
        { listen } = await import("@tauri-apps/api/event"),
        { invoke } = await import("@tauri-apps/api/core");
      w = getCurrentWindow();
      all = await availableMonitors();
      position = await w.outerPosition();
      size = await w.outerSize();
      try {
        const p = JSON.parse(
          localStorage.getItem("mivuneko.pet-position.v1") ?? "null",
        );
        if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) position = p;
      } catch {}
      await invoke("sync_pet_displays", {
        selection: "current",
        relocate: false,
      });
      if (disposed) return;
      await fit(true);

      if (disposed) return;
      await invoke("show_pet");
      try {
        localStorage.setItem(
          "mivuneko.pet-position.v1",
          JSON.stringify(position),
        );
      } catch {}
      ready = true;
      const moved = await w.onMoved((e) => {
        if (disposed) return;
        position = e.payload;
        viewport(e.payload);
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
          if (!disposed)
            try {
              localStorage.setItem(
                "mivuneko.pet-position.v1",
                JSON.stringify(e.payload),
              );
            } catch {}
        }, 350);
      });
      const recover = await listen<{ resetSize?: boolean }>(
        "pet-recover",
        () => {
          force.current = true;
          refresh = 0;
        },
      );
      for (const off of [moved, recover]) {
        if (disposed) off();
        else offs.push(off);
      }
    })().catch((e) => latest.current.onError(String(e)));
    const timer = setInterval(() => void tick(), 16);
    return () => {
      disposed = true;
      clearInterval(timer);
      clearTimeout(saveTimer);
      window.removeEventListener("pet-render-bounds", anchored);
      offs.forEach((f) => f());
    };
  }, []);
  // Display selection moves the one pet; it never creates replicas.
  useEffect(() => {
    if (!isNative) return;
    void import("@tauri-apps/api/core")
      .then(({ invoke }) =>
        invoke("sync_pet_displays", {
          selection: options.prefs.monitor,
          relocate: true,
        }),
      )
      .then(() => {
        force.current = true;
      })
      .catch((e) => options.onError(String(e)));
  }, [options.prefs.monitor]);
  return layout;
}
