import type { Preferences } from "./preferences";
export function microphoneConstraints(p: Preferences): MediaTrackConstraints {
  return {
    channelCount: 1,
    ...(p.microphoneId && p.microphoneId !== "default"
      ? { deviceId: { exact: p.microphoneId } }
      : {}),
    echoCancellation: p.echoCancellation,
    noiseSuppression: p.noiseSuppression,
    autoGainControl: p.autoGainControl,
  };
}
