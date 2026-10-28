import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { loadVrm } from "./vrmModel";
import { VRMUtils, type VRM } from "@pixiv/three-vrm";
import type { CharacterState } from "../../../packages/character/controller.ts";
import { animateVrm } from "./vrmMotion";
import { vrmFace, vrmEffect } from "../../../packages/character/expressions.ts";
interface Props {
  state: CharacterState;
  model: ArrayBuffer | null;
  reduced: boolean;
  effects?: boolean;
}
function effectTexture(kind: string) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.strokeStyle =
    kind === "angry" ? "#ff6c87" : kind === "sad" ? "#75d5ff" : "#ffe19a";
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = 9;
  ctx.lineCap = "round";
  if (kind === "angry") {
    for (let i = 0; i < 4; i++) {
      ctx.save();
      ctx.translate(64, 64);
      ctx.rotate((i * Math.PI) / 2);
      ctx.beginPath();
      ctx.moveTo(12, 35);
      ctx.quadraticCurveTo(10, 10, 35, 12);
      ctx.stroke();
      ctx.restore();
    }
  } else if (kind === "sad") {
    ctx.beginPath();
    ctx.moveTo(64, 15);
    ctx.bezierCurveTo(20, 67, 25, 105, 64, 108);
    ctx.bezierCurveTo(103, 105, 108, 67, 64, 15);
    ctx.fill();
  } else if (kind === "hearts") {
    ctx.fillStyle = "#ff9fc4";
    ctx.beginPath();
    ctx.moveTo(64, 112);
    ctx.bezierCurveTo(2, 70, 8, 15, 42, 23);
    ctx.bezierCurveTo(55, 25, 61, 33, 64, 42);
    ctx.bezierCurveTo(78, 7, 117, 16, 119, 45);
    ctx.bezierCurveTo(122, 72, 90, 96, 64, 112);
    ctx.fill();
  } else if (kind === "question") {
    ctx.strokeStyle = "#c3b1ff";
    ctx.beginPath();
    ctx.arc(61, 41, 24, Math.PI, Math.PI * 2.4);
    ctx.lineTo(61, 80);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(61, 105, 5, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === "blush") {
    ctx.strokeStyle = "#ff9ab5";
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(24 + i * 19, 75);
      ctx.lineTo(35 + i * 19, 44);
      ctx.stroke();
    }
  } else if (kind === "sleep") {
    ctx.fillStyle = "#c3b1ff";
    ctx.font = "bold 75px sans-serif";
    ctx.fillText("Z", 35, 87);
  } else if (kind === "surprised") {
    ctx.beginPath();
    ctx.moveTo(64, 20);
    ctx.lineTo(64, 74);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(64, 99, 6, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(64, 8);
    ctx.quadraticCurveTo(68, 59, 117, 64);
    ctx.quadraticCurveTo(68, 69, 64, 120);
    ctx.quadraticCurveTo(60, 69, 11, 64);
    ctx.quadraticCurveTo(60, 59, 64, 8);
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
export function CharacterScene({
  state,
  model,
  reduced,
  effects = true,
}: Props) {
  const host = useRef<HTMLDivElement>(null),
    stateRef = useRef(state),
    reducedRef = useRef(reduced);
  const [error, setError] = useState("");
  const [modelReady, setModelReady] = useState(false);
  const effectsRef = useRef(effects);
  effectsRef.current = effects;
  stateRef.current = state;
  reducedRef.current = reduced;
  useEffect(() => {
    if (!host.current) return;
    setError("");
    setModelReady(false);
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    } catch {
      setError(
        "3D rendering is unavailable on this device. Choose 2D illustration in Characters.",
      );
      return;
    }
    renderer.setPixelRatio(Math.min(Math.max(window.devicePixelRatio, 2), 3));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.current.appendChild(renderer.domElement);
    renderer.domElement.setAttribute(
      "aria-label",
      model ? "Animated 3D companion" : "Character loading",
    );
    renderer.domElement.setAttribute("role", "img");
    const scene = new THREE.Scene(),
      camera = new THREE.PerspectiveCamera(30, 280 / 270, 0.01, 100);
    camera.position.set(0, 0.9, 3.6);
    camera.lookAt(0, 0.8, 0);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x555588, 1.3));
    const light = new THREE.DirectionalLight(0xffffff, 2.2);
    light.position.set(-2, 3, 4);
    scene.add(light);

    const textures = Object.fromEntries(
      [
        "angry",
        "sad",
        "surprised",
        "celebrating",
        "hearts",
        "question",
        "blush",
        "sleep",
      ].map((kind) => [kind, effectTexture(kind)]),
    );
    const effectMaterial = new THREE.SpriteMaterial({
      map: textures.angry,
      transparent: true,
      depthTest: false,
    });
    const effect = new THREE.Sprite(effectMaterial);
    effect.renderOrder = 10;
    effect.visible = false;
    scene.add(effect);
    const headPosition = new THREE.Vector3();
    let modelHeight = 1.5,
      baseRotation = 0;
    let modelCenter = new THREE.Vector3(0, 0.8, 0);
    function resize() {
      if (!host.current) return;
      const { width, height } = host.current.getBoundingClientRect();
      const w = Math.max(1, width),
        h = Math.max(1, height);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      const distance =
        Math.max(modelHeight * 1.35, (modelHeight * 0.85) / camera.aspect) /
        (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
      camera.position.set(
        modelCenter.x,
        modelCenter.y + modelHeight * 0.08,
        distance,
      );
      camera.lookAt(
        modelCenter.x,
        modelCenter.y + modelHeight * 0.08,
        modelCenter.z,
      );
      camera.updateProjectionMatrix();
    }
    const observer = new ResizeObserver(resize);
    observer.observe(host.current);
    resize();
    const gaze = new THREE.Object3D();
    gaze.position.set(0, 1.4, 3);
    const pointer = { x: 0, y: 0 };
    const track = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = THREE.MathUtils.clamp(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -1,
        1,
      );
      pointer.y = THREE.MathUtils.clamp(
        1 - ((event.clientY - rect.top) / rect.height) * 2,
        -1,
        1,
      );
    };
    window.addEventListener("pointermove", track);
    let vrm: VRM | undefined,
      disposed = false,
      frame = 0,
      last = performance.now(),
      phase = 0;
    if (model) {
      void loadVrm(model)
        .then((loaded) => {
          if (disposed) {
            VRMUtils.deepDispose(loaded.scene);
            return;
          }
          vrm = loaded;
          if (vrm.lookAt) vrm.lookAt.target = gaze;
          setModelReady(true);
          VRMUtils.rotateVRM0(vrm);
          baseRotation = vrm.scene.rotation.y;
          animateVrm(vrm, stateRef.current, 0, 1, true);
          vrm.update(0);
          scene.add(vrm.scene);
          vrm.scene.traverse((object) => {
            if (object instanceof THREE.Mesh)
              for (const material of Array.isArray(object.material)
                ? object.material
                : [object.material]) {
                if (material.map) {
                  material.map.anisotropy =
                    renderer.capabilities.getMaxAnisotropy();
                  material.map.needsUpdate = true;
                }
              }
          });
          const box = new THREE.Box3().setFromObject(vrm.scene);
          modelCenter = box.getCenter(new THREE.Vector3());
          modelHeight = box.getSize(new THREE.Vector3()).y;
          resize();
        })
        .catch((e) => {
          if (!disposed)
            setError(
              `This character could not be loaded. ${String(e)} Choose another model in Characters.`,
            );
        });
    }
    function animate(now: number) {
      const delta = Math.min((now - last) / 1000, 0.05);
      last = now;
      phase += delta;
      const s = stateRef.current,
        quiet = reducedRef.current;
      const blink = quiet ? 1 : Math.sin(phase * 0.6) > 0.996 ? 0.08 : 1;
      if (vrm) {
        const ex = vrm.expressionManager;
        const face = vrmFace(s.expression);
        for (const name of [
          "happy",
          "sad",
          "angry",
          "surprised",
          "relaxed",
          "blinkLeft",
          "blinkRight",
        ]) {
          const target = Math.min(1, (face[name] ?? 0) * 1.4);
          ex?.setValue(
            name,
            THREE.MathUtils.damp(ex.getValue(name) ?? 0, target, 12, delta),
          );
        }
        ex?.setValue("blink", s.body === "sleep" ? 1 : 1 - blink);
        ex?.setValue("aa", s.mouth);
        const head = vrm.humanoid.getNormalizedBoneNode("head");
        if (head) {
          head.getWorldPosition(headPosition);
          gaze.position.lerp(
            new THREE.Vector3(
              headPosition.x + (quiet ? 0 : pointer.x * 0.65),
              headPosition.y + (quiet ? 0 : pointer.y * 0.4),
              headPosition.z + 2,
            ),
            0.08,
          );
        }
        animateVrm(vrm, s, phase, delta, quiet);
        vrm.scene.rotation.y =
          baseRotation +
          (!quiet && s.body === "dance" ? Math.sin(phase * 2) * 0.12 : 0);
        vrm.update(delta);
      }
      const effectKind = vrmEffect(s.expression);
      effect.visible = !!vrm && effectsRef.current && !!textures[effectKind];
      if (effect.visible) {
        effectMaterial.map = textures[effectKind];
        const head = vrm?.humanoid.getNormalizedBoneNode("head");
        if (head) head.getWorldPosition(headPosition);
        else headPosition.set(0, 1.22, 0);
        effect.position
          .copy(headPosition)
          .add(new THREE.Vector3(modelHeight * 0.19, modelHeight * 0.15, 0.1));
        effect.scale.setScalar(
          modelHeight * 0.19 * (quiet ? 1 : 1 + Math.sin(phase * 5) * 0.06),
        );
        effectMaterial.rotation =
          s.expression === "angry" && !quiet ? Math.sin(phase * 8) * 0.08 : 0;
      }
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    }
    frame = requestAnimationFrame(animate);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", track);
      observer.disconnect();
      if (vrm) VRMUtils.deepDispose(vrm.scene);
      Object.values(textures).forEach((texture) => texture.dispose());
      effectMaterial.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [model]);
  return (
    <div
      className="character-scene"
      data-model-ready={modelReady}
      data-emotion={state.expression}
      data-activity={state.activity}
    >
      <div ref={host} />
      {!modelReady && !error && (
        <span className="vrm-loading" role="status">
          Loading character…
        </span>
      )}
      {error ? <small role="alert">{error}</small> : null}
    </div>
  );
}
