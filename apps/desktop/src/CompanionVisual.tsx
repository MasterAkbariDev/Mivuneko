import { savedPack, type SavedPack } from "./characterPackStore";
import { PackIllustration } from "./PackIllustration";
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
  dragging = false,
  zoom = 1,
  pan = { x: 0, y: 0 },
}: {
  mood?: Mood;
  mouth?: number;
  emotion?: Mood;
  body?: import("../../../packages/character/controller").BodyAction;
  direction?: number;
  dragging?: boolean;
  zoom?: number;
  pan?: { x: number; y: number };
}) {
  const p = usePreferences();
  const [pack, setPack] = useState<SavedPack | null>(null);
  const [model, setModel] = useState<ArrayBuffer | null>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [error, setError] = useState("");
  useEffect(() => {
    let disposed = false;
    async function load() {
      setError("");
      setModel(null);
      setPack(null);
      try {
        let bytes: ArrayBuffer | null = null;
        if (p.activePackId) {
          const imported = await savedPack(p.activePackId);
          if (!imported)
            throw Error(
              "This character was removed. Choose another character.",
            );
          if (!disposed) setPack(imported);
          if (imported.manifest.format === "3d")
            bytes =
              await imported.assets[imported.manifest.model!].arrayBuffer();
        } else if (p.renderer === "sample-vrm") {
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
        } else if (p.renderer === "custom-vrm")
          bytes = await storedModel(p.customModelId);
        if (!disposed) {
          setModel(bytes);
          if (!p.activePackId && p.renderer === "custom-vrm" && !bytes)
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
  }, [p.renderer, p.customModelId, p.activePackId]);
  useEffect(() => {
    if (!p.illustrationDepth || p.renderer !== "2d" || p.reduced || p.petEdit) {
      setTilt({ x: 0, y: 0 });
      return;
    }
    const track = (e: PointerEvent) =>
      setTilt({
        x: Math.max(-1, Math.min(1, (e.clientX / innerWidth) * 2 - 1)),
        y: Math.max(-1, Math.min(1, (e.clientY / innerHeight) * 2 - 1)),
      });
    const reset = () => setTilt({ x: 0, y: 0 });
    window.addEventListener("pointermove", track);
    window.addEventListener("blur", reset);
    return () => {
      window.removeEventListener("pointermove", track);
      window.removeEventListener("blur", reset);
    };
  }, [p.illustrationDepth, p.renderer, p.reduced, p.petEdit]);
  if (p.activePackId && !pack)
    return (
      <div className="model-placeholder" role="status">
        {error || "Loading character…"}
      </div>
    );
  if (pack && pack.manifest.format !== "3d")
    return (
      <PackIllustration
        pack={pack}
        pose={
          p.customPackPose ||
          (p.petExpression !== "auto"
            ? p.petExpression
            : mood === "speaking"
              ? "speaking"
              : (speechEmotion ?? mood))
        }
        body={p.petEdit ? "idle" : body}
        direction={direction}
        reduced={p.reduced || p.petEdit}
      />
    );
  if (p.renderer === "2d")
    return (
      <div
        className={`illustration-viewport ${p.illustrationDepth ? "depth-illustration" : ""}`}
        style={{ width: "100%", height: "100%", overflow: "hidden" }}
      >
        <div
          data-zoom={zoom}
          style={{
            width: "100%",
            height: "100%",
            transform: `perspective(700px) translate(${-pan.x * 100}%,${pan.y * 100}%) scale(${zoom}) rotateX(${-tilt.y * 3}deg) rotateY(${tilt.x * 5}deg)`,
            transition: "transform 180ms ease-out",
            transformOrigin: "50% 35%",
          }}
        >
          <Luna
            direction={direction}
            character={p.character}
            mood={p.petEdit && !dragging ? "idle" : mood}
            mouth={mouth}
            mode={
              p.petEdit
                ? "stand"
                : body
                  ? body === "idle"
                    ? "stand"
                    : body
                  : p.petMode
            }
            expression={p.petEdit ? "idle" : p.petExpression}
            effects={p.petEffects}
          />
        </div>
      </div>
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
  state.expression = p.petEdit && !dragging ? "idle" : emotion;
  if (p.petEdit && !dragging) state.mouth = 0;
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
            expressionMap={pack?.manifest.expressions}
            state={state}
            reduced={p.reduced || (p.petEdit && !dragging)}
            effects={p.petEffects && !p.petEdit}
            direction={direction}
            dragging={dragging}
            zoom={zoom}
            pan={pan}
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
