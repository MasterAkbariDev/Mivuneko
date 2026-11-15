import * as THREE from "three";
import type { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";
import type { CharacterState } from "../../../packages/character/controller";

// Authored humanoid gestures, blended rather than snapping between T poses.
const hipOffsets = new WeakMap<VRM, number>();
const origins = new WeakMap<VRM, THREE.Vector3>();
export function animateVrm(
  vrm: VRM,
  state: CharacterState,
  time: number,
  delta: number,
  reduced: boolean,
  dragging = false,
) {
  const t = reduced ? 0 : time;
  const wave = Math.sin(t * 3),
    breath = Math.sin(t * 1.8);
  const pose: Record<string, [number, number, number]> = {
    hips: [0, 0, 0],
    leftUpperArm: [0, 0, -1.42],
    rightUpperArm: [0, 0, 1.42],
    leftLowerArm: [0, 0, 0],
    rightLowerArm: [0, 0, 0],
    leftHand: [0, 0, 0],
    rightHand: [0, 0, 0],
    chest: [breath * 0.012, 0, 0],
    spine: [0, 0, 0],
    head: [0, Math.sin(t * 0.6) * 0.045, Math.sin(t * 0.8) * 0.025],
    leftUpperLeg: [0, 0, 0],
    rightUpperLeg: [0, 0, 0],
    leftLowerLeg: [0, 0, 0],
    rightLowerLeg: [0, 0, 0],
  };
  const mood = state.expression;
  if (["happy", "love", "wink", "joking", "teasing"].includes(mood)) {
    pose.rightUpperArm = [0, -0.25, -0.25];
    pose.rightLowerArm = [0, -1.25, -0.45];
    pose.rightHand = [0.15, 0.15, wave * 0.25];
    pose.head = [0.04, 0.08, -0.09];
  } else if (["angry", "determined"].includes(mood)) {
    pose.leftUpperArm = [0.25, 0.1, -0.85];
    pose.rightUpperArm = [0.25, -0.1, 0.85];
    pose.leftLowerArm = [0, 1.3, 0.2];
    pose.rightLowerArm = [0, -1.3, -0.2];
    pose.chest = [0.08, Math.sin(t * 2) * 0.025, 0];
    pose.head = [0.12, 0, 0];
  } else if (["sad", "crying", "concerned"].includes(mood)) {
    pose.head = [0.23, -0.08, 0.1];
    pose.spine = [0.1, 0, 0];
    pose.leftUpperArm = [0.15, 0.15, -1.25];
    pose.rightUpperArm = [0.15, -0.15, 1.25];
  } else if (["surprised", "excited", "celebrating"].includes(mood)) {
    pose.leftUpperArm = [-0.1, 0.15, -0.2];
    pose.rightUpperArm = [-0.1, -0.15, 0.2];
    pose.leftLowerArm = [0, 1.3, 0.4];
    pose.rightLowerArm = [0, -1.3, -0.4];
    pose.head = [-0.1, 0, 0];
    pose.chest = [-0.04, 0, wave * 0.025];
  } else if (
    ["curious", "confused", "thinking", "listening", "shy"].includes(mood)
  ) {
    pose.head = [0.06, -0.08, 0.16];
    pose.rightUpperArm = [0.1, -0.35, 0.65];
    pose.rightLowerArm = [0, -1.65, -0.5];
    pose.rightHand = [0.15, 0, -0.25];
  }
  if (mood === "bored") {
    pose.head = [0.13, 0.18, 0.12];
    pose.chest = [0.06, 0, 0];
    pose.rightHand = [0, 0, Math.sin(t * 0.8) * 0.08];
  }
  if (mood === "nervous") {
    pose.head = [0.09, Math.sin(t * 1.3) * 0.12, 0];
    pose.leftLowerArm = [0, -1.15, 0.15];
    pose.rightLowerArm = [0, 1.15, -0.15];
    pose.leftHand = [0, 0.12, Math.sin(t * 7) * 0.05];
    pose.rightHand = [0, -0.12, -Math.sin(t * 7) * 0.05];
  }
  if (mood === "relieved") {
    pose.head = [0.1, 0, 0];
    pose.chest = [-0.04 + Math.sin(t * 0.8) * 0.025, 0, 0];
    pose.leftUpperArm = [0, 0, -1.5];
    pose.rightUpperArm = [0, 0, 1.5];
  }
  if (mood === "embarrassed") {
    pose.head = [0.18, -0.22, -0.08];
    pose.rightUpperArm = [-0.1, 0.2, 0.7];
    pose.rightLowerArm = [0, 1.65, -0.2];
    pose.rightHand = [0.15, 0, 0.15];
  }
  // Individual reactions layer over the base pose; never substitute a head icon.
  if (mood === "crying") {
    pose.head = [0.25 + Math.sin(t * 7) * 0.025, 0, Math.sin(t * 3) * 0.035];
    pose.chest = [0.12 + Math.sin(t * 8) * 0.018, 0, 0];
    pose.rightUpperArm = [-0.2, 0.35, 0.55];
    pose.rightLowerArm = [0, 1.8, -0.3];
    pose.rightHand = [0.12, 0, Math.sin(t * 2.4) * 0.12];
  } else if (mood === "sleeping") {
    pose.head = [0.2 + Math.sin(t * 0.7) * 0.07, 0, 0.16];
    pose.chest = [Math.sin(t * 1.1) * 0.025, 0, 0];
  } else if (mood === "concerned") {
    pose.head = [0.1, Math.sin(t * 0.9) * 0.07, -0.08];
    pose.rightUpperArm = [-0.05, 0.2, 0.8];
    pose.rightLowerArm = [0, 1.4, -0.25];
  } else if (mood === "love") {
    pose.leftUpperArm = [-0.1, -0.25, -0.65];
    pose.rightUpperArm = [-0.1, 0.25, 0.65];
    pose.leftLowerArm = [0, -1.5, 0.25];
    pose.rightLowerArm = [0, 1.5, -0.25];
    pose.head = [0.08, 0, Math.sin(t * 1.2) * 0.07];
  } else if (mood === "shy") {
    pose.head = [0.22, -0.16, -0.12];
    pose.leftUpperArm = [0, -0.15, -1.1];
    pose.rightUpperArm = [0, 0.15, 1.1];
    pose.leftLowerArm = [0, -0.9, 0.1];
    pose.rightLowerArm = [0, 0.9, -0.1];
  } else if (mood === "thinking") {
    pose.head = [0.04, 0.2, -0.1];
    pose.rightHand = [0.15, 0, Math.sin(t * 1.5) * 0.04];
  } else if (mood === "confused") {
    pose.head = [0.05, Math.sin(t * 1.5) * 0.15, 0.23];
    pose.leftUpperArm = [0, -0.15, -0.8];
    pose.leftLowerArm = [0, -1, 0.4];
  } else if (mood === "determined") {
    pose.head = [-0.03, 0, 0];
    pose.chest = [-0.06, 0, 0];
    pose.leftUpperArm = [0, 0, -1.1];
    pose.rightUpperArm = [0, 0, 1.1];
  } else if (mood === "excited") {
    pose.chest = [-0.04, 0, Math.sin(t * 5) * 0.045];
    pose.leftHand = [0, 0, Math.sin(t * 7) * 0.15];
    pose.rightHand = [0, 0, -Math.sin(t * 7) * 0.15];
  } else if (mood === "celebrating") {
    pose.leftUpperArm = [0, 0, -0.1];
    pose.rightUpperArm = [0, 0, 0.1];
    pose.leftLowerArm = [0, -0.6, 0.8];
    pose.rightLowerArm = [0, 0.6, -0.8];
    pose.chest = [0, Math.sin(t * 2) * 0.12, 0];
  } else if (mood === "joking") {
    pose.chest = [Math.sin(t * 5) * 0.035, 0, 0.04];
    pose.head = [-0.08, 0, 0.08];
  } else if (mood === "teasing") {
    pose.head = [0, 0.17, -0.15];
    pose.rightHand = [0, 0, Math.sin(t * 4) * 0.2];
  } else if (mood === "proud") {
    pose.head = [-0.12, 0.1, 0];
    pose.chest = [-0.05, 0, 0];
    pose.leftUpperArm = [0.15, -0.15, -0.9];
    pose.leftLowerArm = [0, -1.3, 0.2];
  }
  if (state.body === "walk" || state.body === "run") {
    const stride = Math.sin(t * (state.body === "run" ? 9 : 6));
    pose.leftUpperLeg = [stride * (state.body === "run" ? 0.65 : 0.42), 0, 0];
    pose.rightUpperLeg = [-stride * (state.body === "run" ? 0.65 : 0.42), 0, 0];
    pose.leftLowerLeg = [Math.max(0, -stride) * 0.5, 0, 0];
    pose.rightLowerLeg = [Math.max(0, stride) * 0.5, 0, 0];
    pose.leftUpperArm = [-stride * 0.3, 0, -1.35];
    pose.rightUpperArm = [stride * 0.3, 0, 1.35];
  } else if (state.body === "sit") {
    pose.leftUpperLeg = [-1.2, 0, -0.08];
    pose.rightUpperLeg = [-1.2, 0, 0.08];
    pose.leftLowerLeg = [1.35, 0, 0];
    pose.rightLowerLeg = [1.35, 0, 0];
  } else if (state.body === "dance") {
    pose.leftUpperArm = [wave * 0.2, 0, -0.3 + wave * 0.6];
    pose.rightUpperArm = [-wave * 0.2, 0, 0.3 + wave * 0.6];
    pose.leftLowerArm = [0, 0.8, 0];
    pose.rightLowerArm = [0, -0.8, 0];
    pose.chest = [0, Math.sin(t * 2) * 0.15, wave * 0.12];
    pose.leftUpperLeg = [wave * 0.15, 0, -0.06];
    pose.rightUpperLeg = [-wave * 0.15, 0, 0.06];
  } else if (state.body === "lie") {
    pose.hips = [0, 0, -1.45];
    pose.spine = [0, 0, 0];
    pose.chest = [0.05, 0, 0];
    pose.head = [-0.05, 0.08, 0.15];
    pose.leftUpperArm = [-0.2, 0, -1.1];
    pose.leftLowerArm = [0, -1.3, 0];
    pose.rightUpperArm = [0, 0, 1.1];
    pose.rightLowerArm = [0, 0.4, 0];
    pose.leftUpperLeg = [-0.1, 0, -0.12];
    pose.rightUpperLeg = [-0.24, 0, 0.12];
    pose.leftLowerLeg = [0.2, 0, 0];
    pose.rightLowerLeg = [0.4, 0, 0];
  } else if (state.body === "sleep") pose.head = [0.25, 0, 0.22];
  const gesture = state.gesture;
  if (
    gesture &&
    !reduced &&
    !dragging &&
    !["walk", "run"].includes(state.body)
  ) {
    const elapsed = (Date.now() - gesture.started) / 1000;
    if (elapsed >= 0 && elapsed < gesture.duration) {
      const envelope =
        Math.min(1, elapsed * 3, (gesture.duration - elapsed) * 3) *
        gesture.intensity;
      const swing = Math.sin(elapsed * gesture.tempo * 5),
        slow = Math.sin(elapsed * gesture.tempo * 2);
      const apply = (bone: string, angles: [number, number, number]) => {
        pose[bone] = pose[bone].map((v, i) =>
          THREE.MathUtils.lerp(v, angles[i], envelope),
        ) as [number, number, number];
      };
      if (gesture.arms === "wave") {
        apply("rightUpperArm", [0, 0, 0.2]);
        apply("rightLowerArm", [0, 1.5, -0.4]);
        apply("rightHand", [0.1, 0, swing * 0.45]);
      }
      if (gesture.arms === "open" || gesture.arms === "stretch") {
        const raised = gesture.arms === "stretch";
        apply("leftUpperArm", [-0.1, 0, raised ? 0.1 : -0.6]);
        apply("rightUpperArm", [-0.1, 0, raised ? -0.1 : 0.6]);
        apply("leftLowerArm", [0, -0.7, slow * 0.1]);
        apply("rightLowerArm", [0, 0.7, -slow * 0.1]);
      }
      if (gesture.arms === "raised") {
        apply("leftUpperArm", [0, 0, 0.2]);
        apply("rightUpperArm", [0, 0, -0.2]);
        apply("leftLowerArm", [0, -0.6, 0.3]);
        apply("rightLowerArm", [0, 0.6, -0.3]);
      }
      if (gesture.arms === "folded" || gesture.arms === "clap") {
        const clap =
          gesture.arms === "clap" ? 0.25 + 0.2 * Math.abs(swing) : 0.55;
        apply("leftUpperArm", [-0.3, -0.2, -0.8]);
        apply("rightUpperArm", [-0.3, 0.2, 0.8]);
        apply("leftLowerArm", [0, -1.65, clap]);
        apply("rightLowerArm", [0, 1.65, -clap]);
      }
      if (gesture.arms === "point-left") {
        apply("leftUpperArm", [0, 0, -0.05]);
        apply("leftLowerArm", [0, -0.1, 0]);
      }
      if (gesture.arms === "point-right") {
        apply("rightUpperArm", [0, 0, 0.05]);
        apply("rightLowerArm", [0, 0.1, 0]);
      }
      if (gesture.head === "nod") apply("head", [swing * 0.16, 0, 0]);
      if (gesture.head === "shake") apply("head", [0, swing * 0.25, 0]);
      if (gesture.head === "tilt") apply("head", [0.05, 0, 0.2 + slow * 0.05]);
      if (gesture.head === "bow") {
        apply("spine", [0.32, 0, 0]);
        apply("head", [0.25, 0, 0]);
      }
    }
  }
  if (state.activity === "speaking") pose.head[0] += Math.sin(t * 4) * 0.035;
  if (dragging) {
    pose.hips = [0, 0, 0];
    const swing = Math.sin(t * 4) * 0.12;
    pose.leftUpperArm = [0.18 + swing, 0, -1.65];
    pose.rightUpperArm = [0.18 - swing, 0, 1.65];
    pose.leftLowerArm = [0, -0.15, 0];
    pose.rightLowerArm = [0, 0.15, 0];
    pose.leftUpperLeg = [0.12 + swing, 0, -0.08];
    pose.rightUpperLeg = [0.12 - swing, 0, 0.08];
    pose.leftLowerLeg = [0.2, 0, 0];
    pose.rightLowerLeg = [0.25, 0, 0];
    pose.chest = [-0.08, 0, swing * 0.4];
    pose.head = [0.08, 0, -swing * 0.6];
  }
  // Normalized elbows bend forward with negative Y on the left, positive on the right.
  // Keep the forearm hinge anatomically consistent across VRM skeletons.
  pose.leftUpperArm[1] = -Math.abs(pose.leftUpperArm[1]);
  pose.rightUpperArm[1] = Math.abs(pose.rightUpperArm[1]);
  pose.leftLowerArm[1] = -Math.abs(pose.leftLowerArm[1]);
  pose.rightLowerArm[1] = Math.abs(pose.rightLowerArm[1]);
  const alpha = 1 - Math.exp(-10 * delta),
    q = new THREE.Quaternion(),
    e = new THREE.Euler();
  for (const [name, angles] of Object.entries(pose)) {
    const bone = vrm.humanoid.getNormalizedBoneNode(name as VRMHumanBoneName);
    if (bone) bone.quaternion.slerp(q.setFromEuler(e.set(...angles)), alpha);
  }
  const hips = vrm.humanoid.getNormalizedBoneNode("hips");
  if (hips) {
    if (!origins.has(vrm)) origins.set(vrm, hips.position.clone());
    hips.position.copy(origins.get(vrm)!);
    const target =
      state.body === "lie" && !dragging
        ? -0.5
        : state.body === "sit" && !dragging
          ? -0.38
          : breath * 0.004;
    const previous = hipOffsets.get(vrm) ?? target;
    const next = THREE.MathUtils.lerp(previous, target, alpha);
    hipOffsets.set(vrm, next);
    hips.position.y += next;
  }
}
