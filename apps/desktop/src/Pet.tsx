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
  const task = useCompanionTask();
  const replica = new URLSearchParams(location.search).has("replica");
  useEffect(() => {
    if (!localStorage.getItem("mivuneko.automatic-behavior.v1")) {
      localStorage.setItem("mivuneko.automatic-behavior.v1", "1");
      updatePreferences({ petMode: "auto" });
    }
  }, []);
  const manualUntil = useRef(0),
    placing = useRef(false);
  const displayPreference = useRef("current");
  const [positionReady, setPositionReady] = useState(!isNative);
  const [automaticBody, setAutomaticBody] = useState<BodyAction>("idle");
  const [facing, setFacing] = useState(1);
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
  useEffect(() => {
    const start = Date.now();
    const timer = setInterval(() => {
      const t = ((Date.now() - start) / 1000) % 120;
      setAutomaticBody(
        t < 15
          ? "idle"
          : t < 35
            ? "walk"
            : t < 65
              ? "sit"
              : t < 85
                ? "walk"
                : t < 95
                  ? "run"
                  : "sit",
      );
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  const prefs = usePreferences(),
    session = usePetSession();
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
    void import("@tauri-apps/api/window")
      .then(({ getCurrentWindow }) =>
        getCurrentWindow().setIgnoreCursorEvents(prefs.clickThrough),
      )
      .catch((e) => {
        setError(String(e));
        if (prefs.clickThrough) updatePreferences({ clickThrough: false });
      });
  }, [prefs.clickThrough]);
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
  displayPreference.current = prefs.monitor;
  const moving =
    (body === "walk" ||
      body === "run" ||
      prefs.petMode === "walk" ||
      prefs.petMode === "run") &&
    !dragPause &&
    !prefs.focus &&
    prefs.petMode !== "focus" &&
    prefs.petMode !== "sleep" &&
    prefs.petMode !== "sit" &&
    !reduced &&
    ["idle", "happy", "curious"].includes(mood) &&
    body !== "sleep" &&
    body !== "sit";
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
      if (replica) return;
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
  useEffect(() => {
    if (!isNative) return;
    let disposed = false,
      off: (() => void) | undefined,
      timer: ReturnType<typeof setTimeout> | undefined;
    void (async () => {
      const { getCurrentWindow, currentMonitor } =
        await import("@tauri-apps/api/window");
      const { PhysicalPosition } = await import("@tauri-apps/api/dpi");
      const w = getCurrentWindow();
      const key = replica
        ? `mivuneko.pet-position.${w.label}.v1`
        : "mivuneko.pet-position.v1";
      try {
        const p = JSON.parse(localStorage.getItem(key) ?? "null");
        if (p && Number.isFinite(p.x) && Number.isFinite(p.y))
          await w.setPosition(new PhysicalPosition(p.x, p.y));
      } catch {}
      off = await w.onMoved((event) => {
        try {
          localStorage.setItem(key, JSON.stringify(event.payload));
        } catch {}
        clearTimeout(timer);
        timer = setTimeout(
          () =>
            void (async () => {
              if (disposed || placing.current) return;
              const m = await currentMonitor();
              if (!m) return;
              const selection = displayPreference.current,
                id = `${m.name ?? "Display"}:${m.position.x}:${m.position.y}`;
              if (!replica && selection === "all") {
                const { invoke } = await import("@tauri-apps/api/core");
                await invoke("sync_pet_displays", {
                  selection: "all",
                  relocate: false,
                });
              } else if (
                !replica &&
                selection !== "current" &&
                selection !== id
              )
                updatePreferences({ monitor: "current" });
            })().catch((e) => setError(String(e))),
          250,
        );
      });
      if (disposed) off();
      else setPositionReady(true);
    })().catch((e) => setError(String(e)));
    return () => {
      disposed = true;
      off?.();
      clearTimeout(timer);
    };
  }, []);
  useEffect(() => {
    if (!isNative || replica || !positionReady) return;
    void import("@tauri-apps/api/core")
      .then(({ invoke }) =>
        invoke("sync_pet_displays", {
          selection: prefs.monitor,
          relocate: true,
        }),
      )
      .catch((e) => setError(String(e)));
  }, [prefs.monitor, positionReady]);
  useEffect(() => {
    if (isNative || !moving) return;
    let direction: 1 | -1 = 1;
    const timer = setInterval(
      () =>
        setOffset((x) => {
          const next = walkStep(x, direction, 0.05, 30, -25, 25);
          direction = next.direction;
          setFacing(direction);
          return next.x;
        }),
      50,
    );
    return () => clearInterval(timer);
  }, [moving]);
  useEffect(() => {
    if (!isNative || !positionReady) return;
    let disposed = false,
      busy = false,
      direction: 1 | -1 = 1;
    let destinationPoint: { x: number; y: number } | null = null;
    async function tick() {
      if (
        busy ||
        disposed ||
        placing.current ||
        Date.now() < manualUntil.current ||
        drag.current
      )
        return;
      busy = true;
      try {
        const { availableMonitors, currentMonitor, getCurrentWindow } =
          await import("@tauri-apps/api/window");
        const { PhysicalPosition } = await import("@tauri-apps/api/dpi");
        const all = await availableMonitors();
        if (disposed) return;
        const w = getCurrentWindow();
        const current = await currentMonitor();
        const selected = current ?? all[0];
        if (!selected) return;
        const position = await w.outerPosition(),
          size = await w.outerSize();
        const area = {
          x: selected.workArea.position.x,
          y: selected.workArea.position.y,
          width: selected.workArea.size.width,
          height: selected.workArea.size.height,
        };
        let point = { x: position.x, y: position.y };
        if (
          position.x + size.width < area.x + 16 ||
          position.x > area.x + area.width - 16 ||
          position.y + size.height < area.y + 16 ||
          position.y > area.y + area.height - 16
        )
          point = clampPosition(position, size, area);
        if (moving) {
          let heading: number = direction;
          const target =
            task && Date.now() - task.at < 120000
              ? (destinationPoint ??= {
                  x:
                    area.x +
                    Math.max(0, area.width - size.width) *
                      (task.destination.includes("left")
                        ? 0.05
                        : task.destination.includes("right")
                          ? 0.95
                          : task.destination === "elsewhere"
                            ? position.x < area.x + area.width / 2
                              ? 0.8
                              : 0.2
                            : 0.5),
                  y:
                    area.y +
                    Math.max(0, area.height - size.height) *
                      (task.destination.startsWith("top")
                        ? 0.05
                        : task.destination === "center"
                          ? 0.5
                          : 0.95),
                })
              : null;
          const speed = (body === "run" ? 130 : 48) * selected.scaleFactor;
          if (target) {
            const dx = target.x - point.x,
              dy = target.y - point.y,
              distance = Math.hypot(dx, dy),
              step = speed * 0.1;
            if (distance <= step) {
              point = target;
              updatePreferences({ petMode: "sit" });
            } else {
              point = {
                x: point.x + (dx / distance) * step,
                y: point.y + (dy / distance) * step,
              };
              direction = dx < 0 ? -1 : 1;
              heading = Math.atan2(dx, dy) / (Math.PI / 2);
            }
          } else {
            const step = walkStep(
              point.x,
              direction,
              0.1,
              speed,
              area.x,
              area.x + Math.max(0, area.width - size.width),
            );
            direction = step.direction;
            heading = direction;
            point = {
              x: step.x,
              y: point.y,
            };
          }
          setFacing(heading);
        }
        if (
          !disposed &&
          Date.now() >= manualUntil.current &&
          !drag.current &&
          (point.x !== position.x || point.y !== position.y)
        )
          await w.setPosition(
            new PhysicalPosition(Math.round(point.x), Math.round(point.y)),
          );
      } catch (e) {
        if (!disposed) {
          setError(`Desktop placement: ${String(e)}`);
        }
      } finally {
        busy = false;
      }
    }
    void tick();
    const timer = setInterval(() => void tick(), moving ? 100 : 5000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [moving, prefs.monitor, prefs.petMode, body, task?.at, positionReady]);
  useEffect(() => {
    if (!isNative || !positionReady) return;
    void (async () => {
      const { getCurrentWindow, currentMonitor } =
        await import("@tauri-apps/api/window");
      const { LogicalSize, PhysicalPosition } =
        await import("@tauri-apps/api/dpi");
      const m = await currentMonitor();
      const window = getCurrentWindow();
      placing.current = true;
      const previousPosition = await window.outerPosition(),
        previousSize = await window.outerSize();
      await window.setSize(
        new LogicalSize(
          Math.min(
            Math.round(330 * prefs.petScale + 30),
            m ? m.workArea.size.width / m.scaleFactor : 1600,
          ),
          Math.min(
            Math.round(290 * prefs.petScale + (prefs.petCaptions ? 110 : 30)),
            m ? m.workArea.size.height / m.scaleFactor : 720,
          ),
        ),
      );
      if (m) {
        const position = {
          x:
            previousPosition.x +
            (previousSize.width - (await window.outerSize()).width) / 2,
          y:
            previousPosition.y +
            previousSize.height -
            (await window.outerSize()).height,
        };
        const size = await window.outerSize();
        const point = clampPosition(position, size, {
          x: m.workArea.position.x,
          y: m.workArea.position.y,
          width: m.workArea.size.width,
          height: m.workArea.size.height,
        });
        await window.setPosition(
          new PhysicalPosition(Math.round(point.x), Math.round(point.y)),
        );
      }
      await window.show();
    })()
      .catch((e) => setError(String(e)))
      .finally(() => {
        placing.current = false;
      });
  }, [prefs.petScale, prefs.petCaptions, positionReady]);
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
  function onWheel(e: import("react").WheelEvent) {
    if ((e.target as Element).closest(".pet-bubble")) return;
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
  async function openApp(
    tab: "Conversations" | "Characters" = "Conversations",
  ) {
    try {
      if (isNative) {
        const { Window } = await import("@tauri-apps/api/window");
        const { emitTo } = await import("@tauri-apps/api/event");
        const main = await Window.getByLabel("main");
        if (!main) throw Error("App window unavailable");
        await emitTo("main", "mivuneko-navigate", { tab });
        await main.show();
        await main.setFocus();
      } else window.open("/?view=chat&tab=" + tab, "mivuneko-chat");
    } catch (e) {
      setError(String(e));
    }
  }
  useEffect(() => {
    if (!isNative) return;
    void import("@tauri-apps/api/window")
      .then(({ getCurrentWindow }) =>
        getCurrentWindow().setAlwaysOnTop(prefs.petAlwaysOnTop),
      )
      .catch((e) => setError(String(e)));
  }, [prefs.petAlwaysOnTop]);
  return (
    <div
      className={
        reduced ? "pet-root pet-minimal reduced" : "pet-root pet-minimal"
      }
      style={
        {
          "--pet-scale": Math.min(
            scale,
            Math.max(
              0.5,
              (viewport.height - (prefs.petCaptions ? 110 : 30)) / 290,
            ),
            Math.max(0.5, (viewport.width - 30) / 330),
          ),
        } as import("react").CSSProperties
      }
      onWheel={onWheel}
    >
      {pill && (
        <div className="pet-scale-pill" role="status">
          {Math.round(scale * 100)}%
        </div>
      )}
      <div
        className="pet-caption-slot"
        style={{ height: prefs.petCaptions ? 100 : 20 }}
      >
        {prefs.petCaptions &&
          (bubble ||
            captionVisible ||
            ["thinking", "listening", "speaking"].includes(mood)) && (
            <div
              className={`pet-bubble ${session.at || bubble ? "has-message" : ""}`}
              aria-live="polite"
            >
              <p>
                {bubble || (mood === "listening" ? "Listening…" : session.text)}
              </p>
            </div>
          )}
      </div>
      <div
        className={`pet-character body-${character.body}`}
        style={{ transform: `translateX(${offset}px)` }}
        tabIndex={0}
        role="group"
        aria-label="Mivuneko character. Double-click to open the app. Right-click for characters."
        onDoubleClick={() => void openApp()}
        onContextMenu={(e) => {
          e.preventDefault();
          void openApp("Characters");
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") void openApp();
          if (e.key === " ") {
            e.preventDefault();
            void openApp("Characters");
          }
        }}
        onPointerDown={(e) => {
          if (e.button === 0) {
            manualUntil.current = Date.now() + 30000;
            setDragPause(true);
            drag.current = { x: e.clientX, y: e.clientY };
          }
        }}
        onPointerUp={() => {
          drag.current = null;
          manualUntil.current = Date.now() + 15000;
          setDragPause(true);
        }}
        onPointerLeave={() => {
          drag.current = null;
        }}
        onPointerMove={(e) => {
          const point = drag.current;
          if (
            !isNative ||
            !point ||
            Math.hypot(e.clientX - point.x, e.clientY - point.y) < 6
          )
            return;
          drag.current = null;
          cancelCompanionTask();
          updatePreferences({ petMode: "auto" });
          void import("@tauri-apps/api/window")
            .then(async ({ getCurrentWindow }) => {
              await getCurrentWindow().startDragging();
              manualUntil.current = Date.now() + 15000;
              setDragPause(true);
            })
            .catch((e) => setError(String(e)));
        }}
      >
        <CompanionVisual
          mood={mood}
          mouth={session.mouth}
          emotion={session.emotion}
          body={character.body}
          direction={moving ? facing : 0}
        />
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
