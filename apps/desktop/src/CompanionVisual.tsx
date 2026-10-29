import { lazy, Suspense, useEffect, useState } from "react";
import { Luna } from "./Luna";
import { storedModel } from "./modelStore";
import { usePreferences } from "./preferences";
import {
  characterFor,
  withMouth,
} from "../../../packages/character/controller.ts";
import type { Mood } from "../../../packages/shared-schemas/index.ts";
let sample: Promise<ArrayBuffer> | undefined;
const CharacterScene = lazy(() =>
  import("./CharacterScene").then((module) => ({
    default: module.CharacterScene,
  })),
);
export function CompanionVisual({
  mood = "idle",
  mouth = 0,
  emotion: speechEmotion,
  body,
  direction = 0,
}: {
  mood?: Mood;
  mouth?: number;
  emotion?: Mood;
  body?: import("../../../packages/character/controller").BodyAction;
  direction?: number;
}) {
  const p = usePreferences();
  const [model, setModel] = useState<ArrayBuffer | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let disposed = false;
    async function load() {
      setError("");
      setModel(null);
      try {
        let bytes: ArrayBuffer | null = null;
        if (p.renderer === "sample-vrm") {
          sample ??= fetch("/models/haru.vrm")
            .then((r) => {
              if (!r.ok) throw Error("Bundled model unavailable");
              return r.arrayBuffer();
            })
            .catch((e) => {
              sample = undefined;
              throw e;
            });
          bytes = await sample;
        } else if (p.renderer === "custom-vrm") bytes = await storedModel();
        if (!disposed) {
          setModel(bytes);
          if (p.renderer === "custom-vrm" && !bytes)
            setError("Import a VRM model in Characters to use this slot.");
        }
      } catch (e) {
        if (!disposed) setError(String(e));
      }
    }
    void load();
    const channel = new BroadcastChannel("mivuneko.assets");
    channel.onmessage = () => void load();
    return () => {
      disposed = true;
      channel.close();
    };
  }, [p.renderer]);
  if (p.renderer === "2d")
    return (
      <Luna
        character={p.character}
        mood={mood}
        mouth={mouth}
        mode={p.petMode}
        expression={p.petExpression}
        effects={p.petEffects}
      />
    );
  const emotion =
    p.petMode === "sleep"
      ? "sleeping"
      : p.petExpression === "auto"
        ? mood === "speaking"
          ? (speechEmotion ?? "happy")
          : mood
        : (p.petExpression as Mood);
  const state = withMouth(
    characterFor(
      mood,
      body ??
        (p.petMode === "sleep"
          ? "sleep"
          : p.petMode === "dance"
            ? "dance"
            : p.petMode === "walk" || p.petMode === "run"
              ? "walk"
              : p.petMode === "sit"
                ? "sit"
                : "idle"),
    ),
    mouth,
  );
  state.expression = emotion;
  return (
    <div className="vrm-visual">
      {model ? (
        <Suspense
          fallback={
            <div className="model-placeholder" role="status">
              Preparing 3D renderer…
            </div>
          }
        >
          <CharacterScene
            model={model}
            state={state}
            reduced={p.reduced}
            effects={p.petEffects}
            direction={direction}
          />
        </Suspense>
      ) : (
        <div className="model-placeholder" role="status">
          {error || "Loading 3D companion…"}
        </div>
      )}
    </div>
  );
}
