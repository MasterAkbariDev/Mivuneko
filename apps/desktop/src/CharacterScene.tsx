import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils, type VRM } from "@pixiv/three-vrm";
import type { CharacterState } from "../../../packages/character/controller.ts";
import { vrmFace, vrmEffect } from "../../../packages/character/expressions.ts";
interface Props {
  state: CharacterState;
  model: ArrayBuffer | null;
  reduced: boolean;
  effects?: boolean;
}
function mesh(geometry: THREE.BufferGeometry, color: number) {
  return new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ color, roughness: 0.85 }),
  );
}
function prototype() {
  const root = new THREE.Group();
  const body = mesh(new THREE.ConeGeometry(0.24, 0.5, 16), 0xa78bfa);
  body.position.y = 0.65;
  root.add(body);
  const head = mesh(new THREE.SphereGeometry(0.3, 24, 16), 0xf2d5c4);
  head.position.y = 1.17;
  root.add(head);
  const hair = mesh(
    new THREE.SphereGeometry(0.315, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.57),
    0x7661ae,
  );
  hair.position.y = 1.22;
  root.add(hair);
  for (const x of [-0.27, 0.27]) {
    const lock = mesh(new THREE.CapsuleGeometry(0.07, 0.4, 5, 10), 0x7661ae);
    lock.position.set(x, 1.02, -0.03);
    root.add(lock);
  }
  const eyes: THREE.Mesh[] = [];
  for (const x of [-0.1, 0.1]) {
    const eye = mesh(new THREE.SphereGeometry(0.038, 12, 8), 0x202944);
    eye.position.set(x, 1.19, 0.279);
    root.add(eye);
    eyes.push(eye);
  }
  const mouth = mesh(new THREE.SphereGeometry(0.025, 10, 8), 0x9c4d69);
  mouth.position.set(0, 1.06, 0.282);
  mouth.scale.y = 0.3;
  root.add(mouth);
  const legs: THREE.Group[] = [],
    arms: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.11, 0.46, 0);
    const shoe = mesh(new THREE.CapsuleGeometry(0.07, 0.26, 5, 10), 0x202944);
    shoe.position.y = -0.18;
    leg.add(shoe);
    root.add(leg);
    legs.push(leg);
    const arm = new THREE.Group();
    arm.position.set(side * 0.22, 0.83, 0);
    const sleeve = mesh(
      new THREE.CapsuleGeometry(0.055, 0.27, 5, 10),
      0xc4b5fd,
    );
    sleeve.position.y = -0.16;
    arm.add(sleeve);
    root.add(arm);
    arms.push(arm);
  }
  const badge = mesh(new THREE.OctahedronGeometry(0.055), 0x5eead4);
  badge.position.set(0, 0.82, 0.16);
  root.add(badge);
  return { root, eyes, mouth, legs, arms };
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
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(280, 270);
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
    scene.add(new THREE.HemisphereLight(0xffffff, 0x555588, 2.5));
    const light = new THREE.DirectionalLight(0xffffff, 3);
    light.position.set(-2, 3, 4);
    scene.add(light);
    const fallback = prototype();
    fallback.root.visible = !model;
    scene.add(fallback.root);
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
      const loader = new GLTFLoader();
      loader.register((parser) => new VRMLoaderPlugin(parser));
      void loader
        .parseAsync(model.slice(0), "")
        .then((gltf) => {
          if (disposed) {
            VRMUtils.deepDispose(gltf.scene);
            return;
          }
          const loaded = gltf.userData.vrm as VRM | undefined;
          if (!loaded) {
            VRMUtils.deepDispose(gltf.scene);
            throw Error("This file has no supported VRM extension");
          }
          vrm = loaded;
          if (vrm.lookAt) vrm.lookAt.target = gaze;
          setModelReady(true);
          VRMUtils.rotateVRM0(vrm);
          baseRotation = vrm.scene.rotation.y;
          scene.remove(fallback.root);
          scene.add(vrm.scene);
          const box = new THREE.Box3().setFromObject(vrm.scene);
          const center = box.getCenter(new THREE.Vector3()),
            size = box.getSize(new THREE.Vector3());
          modelHeight = size.y;
          camera.position.set(
            center.x,
            center.y,
            Math.max(size.y, size.x) * 2.05,
          );
          camera.lookAt(center);
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
        const head = vrm.humanoid.getNormalizedBoneNode("head");
        for (const name of [
          "happy",
          "sad",
          "angry",
          "surprised",
          "relaxed",
          "blinkLeft",
          "blinkRight",
        ])
          ex?.setValue(name, face[name] ?? 0);
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
          head.rotation.z =
            s.body === "sleep"
              ? 0.15
              : quiet
                ? 0
                : Math.sin(phase * 1.2) * 0.035;
          head.rotation.x =
            s.activity === "speaking" && !quiet
              ? Math.sin(phase * 4) * 0.025
              : s.body === "sleep"
                ? 0.13
                : 0;
        }
        ex?.setValue("blink", s.body === "sleep" ? 1 : 1 - blink);
        ex?.setValue("aa", s.mouth);
        const left = vrm.humanoid.getNormalizedBoneNode("leftUpperArm");
        const right = vrm.humanoid.getNormalizedBoneNode("rightUpperArm");
        if (left)
          left.rotation.z =
            -1.15 +
            (s.activity === "speaking" && !quiet
              ? Math.sin(phase * 2) * 0.06
              : 0);
        if (right)
          right.rotation.z =
            1.15 +
            (!quiet && s.expression === "happy"
              ? Math.sin(phase * 2) * 0.035
              : 0);
        if (s.body === "dance" && !quiet) {
          if (left) left.rotation.z = -1.6 + Math.sin(phase * 4) * 0.35;
          if (right)
            right.rotation.z = 1.6 + Math.sin(phase * 4 + Math.PI) * 0.35;
          vrm.scene.rotation.y = baseRotation + Math.sin(phase * 2) * 0.14;
        } else vrm.scene.rotation.y = baseRotation;
        const chest = vrm.humanoid.getNormalizedBoneNode("chest");
        if (chest)
          chest.rotation.z = quiet
            ? 0
            : s.body === "dance"
              ? Math.sin(phase * 4) * 0.07
              : Math.sin(phase * 1.1) * 0.008;
        for (const [i, bone] of ["leftUpperLeg", "rightUpperLeg"].entries()) {
          const leg = vrm.humanoid.getNormalizedBoneNode(
            bone as "leftUpperLeg" | "rightUpperLeg",
          );
          if (leg)
            leg.rotation.x =
              s.body === "sit"
                ? -1.1
                : !quiet && s.body === "walk"
                  ? Math.sin(phase * 6 + i * Math.PI) * 0.25
                  : 0;
        }
        vrm.update(delta);
      } else {
        fallback.root.position.y = quiet ? 0 : Math.sin(phase * 2) * 0.012;
        fallback.root.rotation.y =
          s.body === "walk" ? Math.sin(phase * 2) * 0.12 : 0;
        fallback.eyes.forEach((e, i) => {
          e.rotation.z = s.expression === "angry" ? (i === 0 ? -0.4 : 0.4) : 0;
          e.scale.y = s.body === "sleep" ? 0.1 : blink;
        });
        fallback.mouth.scale.y = 0.3 + s.mouth * 2;
        fallback.legs.forEach((leg, i) => {
          leg.rotation.x =
            s.body === "sit"
              ? -1.2
              : s.body === "walk" && !quiet
                ? Math.sin(phase * 7 + i * Math.PI) * 0.45
                : 0;
        });
        fallback.arms.forEach((arm, i) => {
          arm.rotation.x =
            s.body === "walk" && !quiet
              ? Math.sin(phase * 7 + i * Math.PI) * -0.35
              : 0;
          arm.rotation.z =
            s.expression === "celebrating" ? (i === 0 ? -1.8 : 1.8) : 0;
        });
      }
      const effectKind = vrmEffect(s.expression);
      effect.visible = effectsRef.current && !!textures[effectKind];
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
      VRMUtils.deepDispose(fallback.root);
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
      {error ? <small role="alert">{error}</small> : null}
    </div>
  );
}
