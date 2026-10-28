import * as THREE from "three";
import type { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";
import type { CharacterState } from "../../../packages/character/controller";

// Authored humanoid gestures, blended rather than snapping between T poses.
const origins = new WeakMap<VRM, THREE.Vector3>();
export function animateVrm(
  vrm: VRM,
  state: CharacterState,
  time: number,
  delta: number,
  reduced: boolean,
) {
  const t = reduced ? 0 : time;
  const wave = Math.sin(t * 3),
    breath = Math.sin(t * 1.8);
  const pose: Record<string, [number, number, number]> = {
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
  if (state.body === "walk") {
    const stride = Math.sin(t * 6);
    pose.leftUpperLeg = [stride * 0.42, 0, 0];
    pose.rightUpperLeg = [-stride * 0.42, 0, 0];
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
  } else if (state.body === "sleep") pose.head = [0.25, 0, 0.22];
  if (state.activity === "speaking") pose.head[0] += Math.sin(t * 4) * 0.035;
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
    hips.position.y += state.body === "sit" ? -0.23 : breath * 0.004;
  }
}
