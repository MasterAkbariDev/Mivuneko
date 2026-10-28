import { Luna } from "./Luna";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { Mood } from "../../../packages/shared-schemas/index.ts";
import {
  characterFor,
  clampPosition,
  walkStep,
  shouldCheckIn,
  isQuietHour,
  type BodyAction,
} from "../../../packages/character/controller.ts";
import { validateVrmBytes } from "../../../packages/character/packs.ts";
import { useVoice } from "./useVoice";
import { publishPet } from "./session";
import { Avatar } from "./Avatar";
import { storedModel } from "./modelStore";
import { isNative } from "./broker";
import { usePreferences, updatePreferences } from "./preferences";
import { usePetSession } from "./session";
const CharacterScene = lazy(() =>
  import("./CharacterScene").then((m) => ({ default: m.CharacterScene })),
);
export function Pet() {
  const prefs = usePreferences(),
    session = usePetSession();
  const [override, setOverride] = useState<Mood | null>(null),
    [error, setError] = useState(""),
    [model, setModel] = useState<ArrayBuffer | null>(null),
    [sampleModel, setSampleModel] = useState<ArrayBuffer | null>(null),
    [bubble, setBubble] = useState(""),
    [offset, setOffset] = useState(0);
  useEffect(() => {
    let active = true;
    void storedModel()
      .then((bytes) => {
        if (bytes && active) {
          validateVrmBytes(bytes);
          setModel(bytes);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (prefs.character !== "sample-vrm" || sampleModel) return;
    const controller = new AbortController();
    void fetch("/models/pixiv-expression-sample.vrm", {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw Error("Bundled model unavailable");
        return response.arrayBuffer();
      })
      .then((bytes) => {
        validateVrmBytes(bytes);
        setSampleModel(bytes);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(String(e));
      });
    return () => controller.abort();
  }, [prefs.character, sampleModel]);
  const selectedModel =
    prefs.character === "sample-vrm"
      ? sampleModel
      : prefs.character === "local-vrm"
        ? model
        : null;
  useEffect(() => {
    const channel = new BroadcastChannel("mivuneko.assets");
    channel.onmessage = () => {
      void storedModel()
        .then(setModel)
        .catch(() => {});
    };
    return () => channel.close();
  }, []);
  const checkinActive = useRef(false);
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
  const body: BodyAction = prefs.petMode === "sleep" ? "sleep" : "idle";
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
    !["local-vrm", "sample-vrm"].includes(prefs.character) &&
    prefs.movement === "roaming" &&
    !prefs.focus &&
    prefs.petMode !== "focus" &&
    prefs.petMode !== "sleep" &&
    !reduced &&
    ["idle", "happy", "curious"].includes(mood) &&
    body !== "sleep";
  const character = {
    ...characterFor(mood, moving ? "walk" : body),
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
  useEffect(() => {
    if (!isNative) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void (async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const { PhysicalPosition } = await import("@tauri-apps/api/dpi");
      const window = getCurrentWindow();
      try {
        const p = JSON.parse(
          localStorage.getItem("mivuneko.pet-position.v1") ?? "null",
        );
        if (p && Number.isFinite(p.x) && Number.isFinite(p.y))
          await window.setPosition(new PhysicalPosition(p.x, p.y));
      } catch {}
      const off = await window.onMoved((event) => {
        try {
          localStorage.setItem(
            "mivuneko.pet-position.v1",
            JSON.stringify({ x: event.payload.x, y: event.payload.y }),
          );
        } catch {}
      });
      if (disposed) off();
      else unlisten = off;
    })().catch((e) => setError(String(e)));
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);
  useEffect(() => {
    if (isNative || !moving) return;
    let direction: 1 | -1 = 1;
    const timer = setInterval(
      () =>
        setOffset((x) => {
          const next = walkStep(x, direction, 0.05, 30, -25, 25);
          direction = next.direction;
          return next.x;
        }),
      50,
    );
    return () => clearInterval(timer);
  }, [moving]);
  useEffect(() => {
    if (!isNative) return;
    let disposed = false,
      busy = false,
      direction: 1 | -1 = 1;
    async function tick() {
      if (busy || disposed) return;
      busy = true;
      try {
        const { availableMonitors, currentMonitor, getCurrentWindow } =
          await import("@tauri-apps/api/window");
        const { PhysicalPosition } = await import("@tauri-apps/api/dpi");
        const all = await availableMonitors();
        if (disposed) return;
        const w = getCurrentWindow();
        const current = await currentMonitor();
        const selected =
          all.find(
            (m) =>
              `${m.name ?? "Display"}:${m.position.x}:${m.position.y}` ===
              prefs.monitor,
          ) ??
          current ??
          all[0];
        if (!selected) return;
        const position = await w.outerPosition(),
          size = await w.outerSize();
        const area = {
          x: selected.workArea.position.x,
          y: selected.workArea.position.y,
          width: selected.workArea.size.width,
          height: selected.workArea.size.height,
        };
        let point = clampPosition(position, size, area);
        if (moving) {
          const step = walkStep(
            point.x,
            direction,
            0.1,
            36 * selected.scaleFactor,
            area.x,
            area.x + Math.max(0, area.width - size.width),
          );
          direction = step.direction;
          point = {
            x: step.x,
            y: area.y + Math.max(0, area.height - size.height),
          };
        }
        if (!disposed && (point.x !== position.x || point.y !== position.y))
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
  }, [moving, prefs.monitor]);
  useEffect(() => {
    if (!isNative) return;
    void (async () => {
      const { getCurrentWindow, currentMonitor } =
        await import("@tauri-apps/api/window");
      const { LogicalSize, PhysicalPosition } =
        await import("@tauri-apps/api/dpi");
      const m = await currentMonitor();
      const window = getCurrentWindow();
      await window.setSize(
        new LogicalSize(
          Math.round(330 * prefs.petScale + 30),
          Math.min(
            Math.round(290 * prefs.petScale + (prefs.petCaptions ? 110 : 30)),
            m ? m.workArea.size.height / m.scaleFactor : 720,
          ),
        ),
      );
      if (m) {
        const position = await window.outerPosition();
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
    })().catch((e) => setError(String(e)));
  }, [prefs.petScale, prefs.petCaptions]);
  async function openApp(tab: "Conversations" | "Settings" = "Conversations") {
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
      style={{ "--pet-scale": prefs.petScale } as import("react").CSSProperties}
    >
      {prefs.petCaptions && (
        <div
          className={`pet-bubble ${session.at || bubble ? "has-message" : ""}`}
          aria-live="polite"
        >
          <p>
            {bubble || (mood === "listening" ? "Listening…" : session.text)}
          </p>
        </div>
      )}
      <div
        className={`pet-character body-${character.body}`}
        style={{ transform: `translateX(${offset}px)` }}
        tabIndex={0}
        role="group"
        aria-label="Mivuneko character. Double-click to open the app. Right-click for settings."
        onDoubleClick={() => void openApp()}
        onContextMenu={(e) => {
          e.preventDefault();
          void openApp("Settings");
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") void openApp();
          if (e.key === " ") {
            e.preventDefault();
            void openApp("Settings");
          }
        }}
        onPointerDown={(e) => {
          if (e.button === 0) drag.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerUp={() => {
          drag.current = null;
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
          void import("@tauri-apps/api/window")
            .then(({ getCurrentWindow }) => getCurrentWindow().startDragging())
            .catch((e) => setError(String(e)));
        }}
      >
        {prefs.character === "luna" ? (
          <Luna
            mood={mood}
            mouth={session.mouth}
            mode={prefs.petMode}
            expression={prefs.petExpression}
            effects={prefs.petEffects}
          />
        ) : prefs.character === "mock-cat" ? (
          <Avatar mood={character.expression} />
        ) : (
          <Suspense fallback={<p>Loading companion…</p>}>
            <CharacterScene
              state={character}
              model={selectedModel}
              reduced={reduced}
            />
          </Suspense>
        )}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
