import { lazy, Suspense, useEffect, useState } from "react";
import { usePreferences } from "./preferences";
import { usePetSession } from "./session";
import { characterFor } from "../../../packages/character/controller.ts";
import { storedModel } from "./modelStore";
import { Avatar } from "./Avatar";
import { Luna } from "./Luna";
import { Icon } from "./Icon";
const Scene = lazy(() =>
  import("./CharacterScene").then((m) => ({ default: m.CharacterScene })),
);
export function CompanionCard({ onSettings }: { onSettings: () => void }) {
  const prefs = usePreferences();
  const session = usePetSession();
  const [model, setModel] = useState<ArrayBuffer | null>(null);
  useEffect(() => {
    let alive = true;
    setModel(null);
    const request =
      prefs.character === "sample-vrm"
        ? fetch("/models/pixiv-expression-sample.vrm").then((r) => {
            if (!r.ok) throw Error();
            return r.arrayBuffer();
          })
        : prefs.character === "local-vrm"
          ? storedModel()
          : Promise.resolve(null);
    void request
      .then((bytes) => {
        if (alive) setModel(bytes);
      })
      .catch(() => {});
    const channel = new BroadcastChannel("mivuneko.assets");
    channel.onmessage = () => {
      if (prefs.character === "local-vrm")
        void storedModel()
          .then((bytes) => {
            if (alive) setModel(bytes);
          })
          .catch(() => {});
    };
    return () => {
      alive = false;
      channel.close();
    };
  }, [prefs.character]);
  const state = { ...characterFor(session.mood), mouth: session.mouth ?? 0 };
  const status =
    prefs.petMode === "sleep"
      ? "Dreaming…"
      : prefs.petMode === "dance"
        ? "A little celebration"
        : prefs.focus || prefs.petMode === "focus"
          ? "Quiet time"
          : session.mood === "thinking"
            ? "Thinking with you…"
            : session.mood === "speaking"
              ? "Speaking"
              : "Here with you";
  return (
    <section className="companion-card" aria-label="Your companion">
      <div className="companion-art">
        <div className="companion-orbit" aria-hidden="true" />
        {prefs.character === "luna" ? (
          <Luna
            mood={session.mood}
            mouth={session.mouth}
            mode={prefs.petMode}
            expression={prefs.petExpression}
            effects={prefs.petEffects}
          />
        ) : prefs.character === "mock-cat" ? (
          <Avatar mood={session.mood} />
        ) : (
          <Suspense fallback={<Icon name="cat" />}>
            <Scene state={state} model={model} reduced={prefs.reduced} />
          </Suspense>
        )}
      </div>
      <div className="companion-card-copy">
        <h2>
          Mivuneko<span>your little companion</span>
        </h2>
        <p className="presence">
          <span className="dot" />
          {status}
        </p>
        <p>Good company, a curious mind, and a little help when you need it.</p>
        <button className="companion-customize" onClick={onSettings}>
          <Icon name="settings" />
          Make it yours
          <Icon name="chevron" />
        </button>
      </div>
      <div className="companion-tip">
        <Icon name="cat" />
        <small>Double-click your desktop companion to open the app.</small>
      </div>
    </section>
  );
}
