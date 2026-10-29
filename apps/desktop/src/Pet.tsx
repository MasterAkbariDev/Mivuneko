import { usePetPlacement } from "./usePetPlacement";
import { PetDock } from "./PetDock";
import { hitsModel } from "./petHit";
import { cancelCompanionTask, useCompanionTask } from "./companionTask";
import { CompanionVisual } from "./CompanionVisual";
import { useEffect, useRef, useState } from "react";
import type { Mood } from "../../../packages/shared-schemas/index.ts";
import {
  characterFor,
  clampPosition,
  walkStep,
  shouldCheckIn,
  isQuietHour,
  type BodyAction,
} from "../../../packages/character/controller.ts";
import { createWheelScaler } from "../../../packages/shared-schemas/wheel.ts";
import { useVoice } from "./useVoice";
import { publishPet } from "./session";
import { isNative } from "./broker";
import { usePreferences, updatePreferences } from "./preferences";
import { usePetSession } from "./session";
export function Pet() {
  const root = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState(false),
    [dragging, setDragging] = useState(false),
    [closeDock, setCloseDock] = useState(0),
    [menuSignal, setMenuSignal] = useState(0),
    [chatSignal, setChatSignal] = useState(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panDrag = useRef<{
    x: number;
    y: number;
    pan: { x: number; y: number };
  } | null>(null);
  const resize = useRef<{
    x: number;
    y: number;
    scale: number;
    edge: string;
    width: number;
    height: number;
    anchor?: { x: number; y: number };
    factor?: number;
  } | null>(null);
  const task = useCompanionTask();

  useEffect(() => {
    if (!localStorage.getItem("mivuneko.automatic-behavior.v1")) {
      localStorage.setItem("mivuneko.automatic-behavior.v1", "1");
      updatePreferences({ petMode: "auto" });
    }
  }, []);

  const manualUntil = useRef(0),
    placing = useRef(false);

  const [automaticBody, setAutomaticBody] = useState<BodyAction>("idle");
  const [facing, setFacing] = useState(1);

  const [completed, setCompleted] = useState(0);
  const [dragPause, setDragPause] = useState(false);
  useEffect(() => {
    const timer = setInterval(
      () => setDragPause(Date.now() < manualUntil.current),
      200,
    );
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (task) {
      manualUntil.current = 0;
      setDragPause(false);
    }
  }, [task?.at]);
  const prefs = usePreferences(),
    session = usePetSession();
  useEffect(() => {
    let next = Date.now() + 18000;
    let resting = true;
    const timer = setInterval(() => {
      const engaged =
        hover ||
        dragging ||
        prefs.petEdit ||
        prefs.focus ||
        ["listening", "thinking", "speaking", "concerned"].includes(
          session.mood,
        );
      if (engaged || prefs.petMode !== "auto") {
        setAutomaticBody("idle");
        next = Date.now() + 18000;
        resting = true;
        return;
      }
      if (Date.now() < next) return;
      if (resting) {
        setAutomaticBody("walk");
        next = Date.now() + 5000 + Math.random() * 5000;
      } else {
        setAutomaticBody("sit");
        next = Date.now() + 35000 + Math.random() * 30000;
      }
      resting = !resting;
    }, 500);
    return () => clearInterval(timer);
  }, [
    prefs.petMode,
    prefs.petEdit,
    prefs.focus,
    session.mood,
    hover,
    dragging,
  ]);
  const [override, setOverride] = useState<Mood | null>(null),
    [error, setError] = useState(""),
    [bubble, setBubble] = useState(""),
    [captionVisible, setCaptionVisible] = useState(true),
    [offset, setOffset] = useState(0);
  const checkinActive = useRef(false);
  useEffect(() => {
    setCaptionVisible(true);
    if (["thinking", "listening", "speaking"].includes(session.mood)) return;
    const timer = setTimeout(() => setCaptionVisible(false), 8000);
    return () => clearTimeout(timer);
  }, [session.at, session.mood]);
  const checkinVoice = useVoice(
    () => {},
    (mood) => {
      if (checkinActive.current)
        publishPet(mood, "Want some company? I’m right here.");
      if (!["thinking", "listening", "speaking"].includes(mood))
        checkinActive.current = false;
    },
    setError,
  );
  useEffect(() => {
    if (prefs.focus || !prefs.spokenCheckins || prefs.voice === "off")
      void checkinVoice.stop();
  }, [prefs.focus, prefs.spokenCheckins, prefs.voice]);
  const budget = useRef(
    (() => {
      try {
        const data = JSON.parse(
          localStorage.getItem("mivuneko.checkins.v1") ?? "null",
        );
        return data && data.day === new Date().toDateString()
          ? {
              count: Math.max(0, Math.min(8, Number(data.count) || 0)),
              unanswered: data.unanswered === true,
            }
          : { count: 0, unanswered: false };
      } catch {
        return { count: 0, unanswered: false };
      }
    })(),
  );
  function persistBudget() {
    try {
      localStorage.setItem(
        "mivuneko.checkins.v1",
        JSON.stringify({
          day: day.current,
          count: promptCount.current,
          unanswered: unanswered.current,
        }),
      );
    } catch {}
  }
  useEffect(() => {
    if (!isNative) return;
    let disposed = false,
      busy = false,
      lastIgnore: boolean | undefined,
      lastDown = false,
      seen = 0;
    async function tick() {
      if (disposed || busy || dragging) return;
      busy = true;
      try {
        const { invoke } = await import("@tauri-apps/api/core"),
          { getCurrentWindow } = await import("@tauri-apps/api/window");
        const w = getCurrentWindow();
        const [cursor, pos, factor] = await Promise.all([
          invoke<{ x: number; y: number; down: boolean }>("pet_cursor"),
          w.outerPosition(),
          w.scaleFactor(),
        ]);
        if (disposed) return;
        const x = (cursor.x - pos.x) / factor,
          y = (cursor.y - pos.y) / factor;
        const dock = root.current?.querySelector<HTMLElement>(".pet-dock"),
          r = dock?.getBoundingClientRect();
        const controls =
          !!r &&
          x >= r.left &&
          x <= r.right &&
          y >= r.top &&
          y <= r.bottom &&
          dock!.classList.contains("is-visible");
        const editing = !!document
          .elementFromPoint(x, y)
          ?.closest("[data-pet-control]");
        const hit =
          !prefs.clickThrough &&
          (controls || editing || hitsModel(root.current, x, y));
        if (hit) seen = Date.now();
        setHover(!prefs.clickThrough && Date.now() - seen < 350);
        if (cursor.down && !lastDown && !hit) setCloseDock((v) => v + 1);
        lastDown = cursor.down;
        const ignore = prefs.clickThrough || !hit;
        if (ignore !== lastIgnore) {
          await w.setIgnoreCursorEvents(ignore);
          lastIgnore = ignore;
        }
      } catch {
        // Cursor queries can fail on a locked/secure desktop. Retry quietly.
        lastIgnore = undefined;
      } finally {
        busy = false;
      }
    }
    const timer = setInterval(() => void tick(), 40);
    void tick();
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [prefs.clickThrough, dragging]);
  useEffect(() => {
    if (!isNative) return;
    let off: (() => void) | undefined,
      disposed = false;
    void import("@tauri-apps/api/event")
      .then(({ listen }) =>
        listen("pet-interactive", () =>
          updatePreferences({ clickThrough: false }),
        ),
      )
      .then((unlisten) => {
        if (disposed) unlisten();
        else off = unlisten;
      })
      .catch(() => {});
    return () => {
      disposed = true;
      off?.();
    };
  }, []);
  const lastInteraction = useRef(Date.now()),
    lastPrompt = useRef(0),
    unanswered = useRef(budget.current.unanswered),
    promptCount = useRef(budget.current.count),
    day = useRef(new Date().toDateString());
  const body: BodyAction =
    prefs.petMode === "auto"
      ? automaticBody
      : prefs.petMode === "run"
        ? "run"
        : prefs.petMode === "walk"
          ? "walk"
          : prefs.petMode === "dance"
            ? "dance"
            : prefs.petMode === "sleep"
              ? "sleep"
              : prefs.petMode === "sit"
                ? "sit"
                : "idle";
  const mood =
    prefs.petMode === "sleep"
      ? "sleeping"
      : prefs.focus || prefs.petMode === "focus"
        ? "idle"
        : (override ?? session.mood);
  const reduced =
    prefs.reduced || matchMedia("(prefers-reduced-motion: reduce)").matches;
  const drag = useRef<{ x: number; y: number } | null>(null);

  const moving =
    !dragging &&
    !prefs.petEdit &&
    !dragPause &&
    (task
      ? completed !== task.at
      : !prefs.focus &&
        !reduced &&
        (body === "walk" || body === "run") &&
        ["idle", "happy", "curious"].includes(mood));
  const character = {
    ...characterFor(
      mood,
      moving
        ? body === "run"
          ? "run"
          : "walk"
        : ["walk", "run"].includes(body)
          ? "idle"
          : body,
    ),
    expression: mood === "speaking" ? (session.emotion ?? "happy") : mood,
    mouth: session.mood === "speaking" ? (session.mouth ?? 0) : 0,
  };
  function interact() {
    lastInteraction.current = Date.now();
    unanswered.current = false;
    persistBudget();
    setBubble("");
  }
  useEffect(() => {
    setOverride(null);
    setBubble("");
    lastInteraction.current = Date.now();
    if (session.mood === "thinking" || session.mood === "listening") {
      unanswered.current = false;
      persistBudget();
    }
  }, [session.at]);
  useEffect(() => {
    if (
      ![
        "happy",
        "celebrating",
        "confused",
        "error",
        "angry",
        "sad",
        "surprised",
      ].includes(session.mood)
    )
      return;
    const timer = setTimeout(() => setOverride("idle"), 6000);
    return () => clearTimeout(timer);
  }, [session.at, session.mood]);
  useEffect(() => {
    function touch() {
      interact();
    }
    window.addEventListener("pointerdown", touch);
    window.addEventListener("keydown", touch);
    return () => {
      window.removeEventListener("pointerdown", touch);
      window.removeEventListener("keydown", touch);
    };
  }, []);
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now(),
        today = new Date().toDateString();
      if (today !== day.current) {
        day.current = today;
        promptCount.current = 0;
      }
      const hour = new Date().getHours();
      if (
        shouldCheckIn({
          enabled: prefs.proactive,
          now,
          lastInteraction: lastInteraction.current,
          lastPrompt: lastPrompt.current,
          unanswered: unanswered.current,
          focus:
            prefs.focus ||
            prefs.petMode === "focus" ||
            prefs.petMode === "sleep",
          fullscreen: !!document.fullscreenElement,
          quietHours: isQuietHour(hour, prefs.quietStart, prefs.quietEnd),
          todayCount: promptCount.current,
          maxPerDay: prefs.dailyLimit,
          intervalMs: prefs.proactiveInterval * 60 * 1000,
        })
      ) {
        setBubble("Want some company? You can open Chat whenever you like.");
        if (isNative && prefs.spokenCheckins && prefs.voice !== "off") {
          checkinActive.current = true;
          void checkinVoice.speak(
            "Want some company? I’m right here.",
            prefs.volume,
            "curious",
          );
        }
        lastPrompt.current = now;
        promptCount.current++;
        unanswered.current = true;
        persistBudget();
      }
    }, 15000);
    return () => clearInterval(timer);
  }, [
    prefs.proactive,
    prefs.petMode,
    prefs.focus,
    prefs.proactiveInterval,
    prefs.dailyLimit,
    prefs.quietStart,
    prefs.quietEnd,
    prefs.spokenCheckins,
    prefs.voice,
    prefs.volume,
    prefs.voiceProvider,
  ]);
  const layout = usePetPlacement({
    prefs,
    task,
    moving: moving && !prefs.petEdit,
    running: body === "run",
    dragging,
    manualUntil,
    placing,
    resizeAnchor: resize,
    onDirection: setFacing,
    onComplete: setCompleted,
    onRest: () => setAutomaticBody("sit"),
    onError: setError,
  });
  // Scroll over the pet to resize: instant local scale, preference (and window) debounced.
  const [viewport, setViewport] = useState({
    width: innerWidth,
    height: innerHeight,
  });
  useEffect(() => {
    const resize = () =>
      setViewport({ width: innerWidth, height: innerHeight });
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  const [scale, setScale] = useState(prefs.petScale),
    [pill, setPill] = useState(false);
  const wheel = useRef(createWheelScaler()),
    wheelAt = useRef(0),
    commit = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    pillTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (performance.now() - wheelAt.current > 400) setScale(prefs.petScale);
  }, [prefs.petScale]);
  useEffect(
    () => () => {
      clearTimeout(commit.current);
      clearTimeout(pillTimer.current);
    },
    [],
  );
  useEffect(() => {
    root.current?.querySelector(".pet-bubble")?.scrollTo({ top: 0 });
  }, [session.text]);
  function onWheel(e: import("react").WheelEvent) {
    if ((e.target as Element).closest(".pet-bubble,[data-pet-control]")) return;
    if (!prefs.petEdit || !hitsModel(root.current, e.clientX, e.clientY))
      return;
    const next = wheel.current.push(e.deltaY, e.deltaMode, scale);
    if (next === null || next === scale) return;
    wheelAt.current = performance.now();
    setScale(next);
    setPill(true);
    clearTimeout(pillTimer.current);
    pillTimer.current = setTimeout(() => setPill(false), 800);
    clearTimeout(commit.current);
    commit.current = setTimeout(
      () => updatePreferences({ petScale: next }),
      150,
    );
  }
  useEffect(() => {
    if (!isNative) return;
    void import("@tauri-apps/api/window")
      .then(({ getCurrentWindow }) =>
        getCurrentWindow().setAlwaysOnTop(prefs.petAlwaysOnTop),
      )
      .catch((e) => setError(String(e)));
  }, [prefs.petAlwaysOnTop]);
  useEffect(() => {
    if (prefs.petScale / layout.scale <= 1.01) setPan({ x: 0, y: 0 });
  }, [prefs.petScale, layout.scale]);
  const oversized = layout.fitted;
  function resizeMove(e: import("react").PointerEvent) {
    const start = resize.current;
    if (!start) return;
    const dx = (e.screenX - start.x) * (start.edge.includes("w") ? -1 : 1),
      dy = (e.screenY - start.y) * (start.edge.includes("n") ? -1 : 1);
    const sx = 1 + dx / Math.max(1, start.width),
      sy = 1 + dy / Math.max(1, start.height);
    const ratio =
      start.edge === "e" || start.edge === "w"
        ? sx
        : start.edge === "n" || start.edge === "s"
          ? sy
          : Math.abs(dx / start.width) > Math.abs(dy / start.height)
            ? sx
            : sy;
    updatePreferences({
      petScale: Math.max(0.25, Math.round(start.scale * ratio * 100) / 100),
    });
  }

  return (
    <div
      ref={root}
      onPointerMove={(e) => {
        if (!isNative)
          setHover(
            hitsModel(root.current, e.clientX, e.clientY) ||
              !!(e.target as Element).closest("[data-pet-control]"),
          );
      }}
      onPointerLeave={() => {
        if (!isNative) setHover(false);
      }}
      className={
        reduced ? "pet-root pet-minimal reduced" : "pet-root pet-minimal"
      }
      style={
        {
          "--pet-scale": layout.scale,
          "--pet-base-width": prefs.renderer === "2d" ? 280 : 180,
          "--pet-base-height": prefs.renderer === "2d" ? 280 : 320,
        } as import("react").CSSProperties
      }
      onWheel={onWheel}
    >
      {(pill || prefs.petEdit) && (
        <div className="pet-scale-pill" role="status">
          {Math.round(prefs.petScale * 100)}%
          {layout.fitted ? " · beyond screen" : ""}
        </div>
      )}
      <div className="pet-caption-slot" style={{ height: 128 }}>
        {prefs.petCaptions &&
          (bubble.trim() ||
            (session.text.trim() &&
              (captionVisible ||
                ["thinking", "listening", "speaking"].includes(mood)))) && (
            <div
              className={`pet-bubble ${session.at || bubble ? "has-message" : ""}`}
              aria-live="polite"
              data-pet-control
            >
              <p>
                {bubble || (mood === "listening" ? "Listening…" : session.text)}
              </p>
            </div>
          )}
      </div>
      <div
        className={`pet-character body-${layout.fitted && !task && ["walk", "run"].includes(character.body) ? "idle" : character.body}`}
        style={{ transform: `translateX(${offset}px)` }}
        tabIndex={0}
        role="group"
        aria-label="Mivuneko character. Double-click for quick chat. Right-click for pet controls."
        onDoubleClick={() => setChatSignal((v) => v + 1)}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenuSignal((v) => v + 1);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") setChatSignal((v) => v + 1);
          if (e.key === " ") {
            e.preventDefault();
            setMenuSignal((v) => v + 1);
          }
        }}
        onPointerDown={(e) => {
          if (
            e.button === 0 &&
            prefs.petEdit &&
            hitsModel(root.current, e.clientX, e.clientY)
          ) {
            manualUntil.current = Date.now() + 30000;
            setDragPause(true);
            drag.current = { x: e.clientX, y: e.clientY };
          }
        }}
        onPointerUp={(e) => {
          if (panDrag.current) {
            panDrag.current = null;
            drag.current = null;
            if (e.currentTarget.hasPointerCapture(e.pointerId))
              e.currentTarget.releasePointerCapture(e.pointerId);
            return;
          }
          if (!drag.current) return;
          drag.current = null;
          manualUntil.current = Date.now() + 15000;
          setDragPause(true);
        }}
        onPointerLeave={() => {
          if (panDrag.current) return;
          drag.current = null;
        }}
        onPointerMove={(e) => {
          if (panDrag.current) {
            const start = panDrag.current,
              r = e.currentTarget.getBoundingClientRect();
            setPan({
              x: start.pan.x - (e.screenX - start.x) / r.width,
              y: start.pan.y + (e.screenY - start.y) / r.height,
            });
            return;
          }
          const point = drag.current;
          if (
            !isNative ||
            !point ||
            Math.hypot(e.clientX - point.x, e.clientY - point.y) < 6
          )
            return;
          drag.current = null;
          cancelCompanionTask();
          setDragging(true);
          void import("@tauri-apps/api/window")
            .then(async ({ getCurrentWindow }) => {
              await getCurrentWindow().startDragging();
              setDragging(false);
              manualUntil.current = Date.now() + 15000;
              setDragPause(true);
            })
            .catch((e) => {
              setDragging(false);
              setError(String(e));
            });
        }}
      >
        <CompanionVisual
          mood={mood}
          mouth={session.mouth}
          emotion={session.emotion}
          body={
            layout.fitted && !task && ["walk", "run"].includes(character.body)
              ? "idle"
              : character.body
          }
          direction={moving && (!layout.fitted || !!task) ? facing : 0}
          dragging={dragging}
          zoom={1}
          pan={pan}
        />
      </div>
      {prefs.petEdit && (
        <div
          className="pet-edit-frame"
          data-pet-control
          aria-label="Pet resize frame"
        >
          {["n", "s", "e", "w", "nw", "ne", "sw", "se"].map((edge) => (
            <button
              key={edge}
              className={`resize-handle handle-${edge}`}
              aria-label={`Resize pet ${edge}`}
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                cancelCompanionTask();
                manualUntil.current = Date.now() + 30000;
                const frame =
                  e.currentTarget.parentElement!.getBoundingClientRect();
                const start = {
                  x: e.screenX,
                  y: e.screenY,
                  scale: prefs.petScale,
                  edge,
                  width: Math.max(1, frame.width - 12),
                  height: Math.max(1, frame.height - 12),
                  anchor: undefined as { x: number; y: number } | undefined,
                  factor: 1,
                };
                resize.current = start;
                if (isNative)
                  void (async () => {
                    const { getCurrentWindow } =
                      await import("@tauri-apps/api/window");
                    const win = getCurrentWindow(),
                      [position, factor] = await Promise.all([
                        win.outerPosition(),
                        win.scaleFactor(),
                      ]);
                    if (resize.current !== start) return;
                    start.factor = factor;
                    start.anchor = {
                      x:
                        position.x +
                        (edge.includes("w")
                          ? frame.right - 6
                          : edge.includes("e")
                            ? frame.left + 6
                            : frame.left + frame.width / 2) *
                          factor,
                      y:
                        position.y +
                        (edge.includes("n")
                          ? frame.bottom - 6
                          : edge.includes("s")
                            ? frame.top + 6
                            : frame.top + frame.height / 2) *
                          factor,
                    };
                  })();
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={resizeMove}
              onPointerUp={(e) => {
                resize.current = null;
                manualUntil.current = Date.now() + 1000;
                e.currentTarget.releasePointerCapture(e.pointerId);
              }}
            />
          ))}
        </div>
      )}
      <PetDock
        visible={hover || prefs.petEdit || oversized}
        closeSignal={closeDock}
        menuSignal={menuSignal}
        chatSignal={chatSignal}
        onError={setError}
      />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
