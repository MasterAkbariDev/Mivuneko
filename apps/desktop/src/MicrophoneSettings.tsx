import { useEffect, useRef, useState } from "react";
import { updatePreferences, usePreferences } from "./preferences";
import { microphoneConstraints } from "./microphone";
export function MicrophoneSettings() {
  const p = usePreferences();
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [error, setError] = useState("");
  const [testing, setTesting] = useState(false);
  const [opening, setOpening] = useState(false);
  const [level, setLevel] = useState(0);
  const dispose = useRef<(() => void) | null>(null);
  const generation = useRef(0);
  async function refresh() {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      setDevices(
        (await navigator.mediaDevices.enumerateDevices()).filter(
          (d) => d.kind === "audioinput",
        ),
      );
    } catch {
      setError(
        "Microphone devices are unavailable. Check your system microphone permission.",
      );
    }
  }
  function stop() {
    generation.current++;
    dispose.current?.();
    dispose.current = null;
    setTesting(false);
    setLevel(0);
    setOpening(false);
  }
  useEffect(() => {
    void refresh();
    navigator.mediaDevices?.addEventListener?.("devicechange", refresh);
    return () => {
      generation.current++;
      dispose.current?.();
      navigator.mediaDevices?.removeEventListener?.("devicechange", refresh);
    };
  }, []);
  useEffect(() => {
    stop();
  }, [p.microphoneId]);
  async function test() {
    stop();
    const ticket = generation.current;
    setOpening(true);
    setError("");
    let stream: MediaStream | undefined, context: AudioContext | undefined;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: microphoneConstraints(p),
      });
      if (ticket !== generation.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      context.createMediaStreamSource(stream).connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      const timer = setInterval(() => {
        analyser.getFloatTimeDomainData(samples);
        setLevel(
          Math.min(
            1,
            Math.sqrt(samples.reduce((n, s) => n + s * s, 0) / samples.length) *
              5,
          ),
        );
      }, 80);
      dispose.current = () => {
        clearInterval(timer);
        stream?.getTracks().forEach((t) => t.stop());
        void context?.close();
      };
      await context.resume();
      if (ticket !== generation.current) return;
      setTesting(true);
      await refresh();
    } catch {
      stream?.getTracks().forEach((t) => t.stop());
      void context?.close();
      if (ticket !== generation.current) return;
      stop();
      setError(
        "Cannot open this microphone. Allow microphone access in your OS and choose an available input.",
      );
    } finally {
      if (ticket === generation.current) setOpening(false);
    }
  }
  return (
    <section
      className="settings-group microphone-panel"
      aria-label="Microphone input"
    >
      <div className="section-intro">
        <span className="eyebrow">INPUT DEVICE</span>
        <h3>Your microphone</h3>
        <p>Select an input and check its level before a conversation.</p>
      </div>
      <label className="setting">
        Input device
        <select
          aria-label="Microphone"
          value={p.microphoneId}
          onChange={(e) => updatePreferences({ microphoneId: e.target.value })}
        >
          <option value="default">System default microphone</option>
          {devices
            .filter((d) => d.deviceId !== "default")
            .map((d, i) => (
              <option value={d.deviceId} key={d.deviceId}>
                {d.label || `Microphone ${i + 1}`}
              </option>
            ))}
          {p.microphoneId !== "default" &&
            !devices.some((d) => d.deviceId === p.microphoneId) && (
              <option value={p.microphoneId}>
                Selected microphone · unavailable
              </option>
            )}
        </select>
      </label>
      <div className="mic-test-row">
        <button
          type="button"
          disabled={opening}
          onClick={() => (testing ? stop() : void test())}
        >
          {testing ? "Stop microphone check" : "Check microphone"}
        </button>
        <meter min={0} max={1} value={level} aria-label="Microphone level" />
        <small>
          {testing
            ? "Listening locally · nothing is saved"
            : "Microphone is off"}
        </small>
      </div>
      {(
        [
          ["echoCancellation", "Echo cancellation"],
          ["noiseSuppression", "Reduce background noise"],
          ["autoGainControl", "Automatic input level"],
        ] as const
      ).map(([key, label]) => (
        <label className="setting" key={key}>
          {label}
          <input
            type="checkbox"
            checked={p[key]}
            onChange={(e) => updatePreferences({ [key]: e.target.checked })}
          />
        </label>
      ))}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}
