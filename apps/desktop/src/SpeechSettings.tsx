import { useEffect, useRef, useState } from "react";
import { isNative } from "./broker";
import { updatePreferences, usePreferences } from "./preferences";
import { useVoice } from "./useVoice";

interface Engine {
  id: string;
  label: string;
  family: string;
  sizeMb: number;
  speed: string;
  accuracy: string;
  detail: string;
  install: string;
  installed: boolean;
}
interface TestResult {
  engine: string;
  text: string;
  ms: number;
}

// Speech recognition: pick an engine, try it with your own voice, tune the mic.
export function SpeechSettings() {
  const p = usePreferences();
  const [engines, setEngines] = useState<Engine[]>([]);
  useEffect(() => {
    if (!isNative) return;
    void import("@tauri-apps/api/core")
      .then(({ invoke }) => invoke<Engine[]>("voice_engines"))
      .then(setEngines)
      .catch(() => setEngines([]));
  }, []);
  const [results, setResults] = useState<TestResult[]>([]);
  const [error, setError] = useState("");
  const stopped = useRef({ at: 0, engine: "" });
  const test = useVoice(
    (text) =>
      setResults((r) =>
        [
          {
            engine: stopped.current.engine,
            text,
            ms: Math.round(performance.now() - stopped.current.at),
          },
          ...r,
        ].slice(0, 8),
      ),
    () => {},
    setError,
  );
  const selected =
    p.sttEngine === "auto"
      ? "auto"
      : engines.some((e) => e.id === p.sttEngine)
        ? p.sttEngine
        : "auto";
  const label = (id: string) =>
    id === "auto" ? "Auto" : (engines.find((e) => e.id === id)?.label ?? id);
  if (!isNative)
    return (
      <p className="hint">
        Speech recognition choices appear in the desktop app.
      </p>
    );
  return (
    <section className="settings-group" aria-label="Speech recognition">
      <h3>Speech recognition</h3>
      <p className="hint">
        Choose the engine that turns your voice into text, then try it below.
        Everything runs on this Mac; no audio leaves it. Switching engines frees
        the previous one from memory.
      </p>
      <div className="engine-list" role="radiogroup" aria-label="Engine">
        <label className={`engine ${selected === "auto" ? "on" : ""}`}>
          <input
            type="radio"
            name="stt-engine"
            checked={selected === "auto"}
            onChange={() => updatePreferences({ sttEngine: "auto" })}
          />
          <span className="engine-body">
            <b>Auto — recommended</b>
            <small>
              Uses Parakeet when it is installed, otherwise the Whisper model in
              voice.json (set by npm run setup:voice). Also the fallback if a
              chosen engine is missing or fails.
            </small>
          </span>
        </label>
        {engines.map((e) => (
          <label
            key={e.id}
            className={`engine ${selected === e.id ? "on" : ""} ${e.installed ? "" : "missing"}`}
          >
            <input
              type="radio"
              name="stt-engine"
              disabled={!e.installed}
              checked={selected === e.id}
              onChange={() => updatePreferences({ sttEngine: e.id })}
            />
            <span className="engine-body">
              <b>
                {e.label}
                <em className={e.installed ? "ok" : "no"}>
                  {e.installed ? "installed" : "not installed"}
                </em>
              </b>
              <small className="tags">
                <span>{e.family}</span>
                <span>{e.sizeMb} MB</span>
                <span>Speed: {e.speed}</span>
                <span>Accuracy: {e.accuracy}</span>
              </small>
              <small>{e.detail}</small>
              {!e.installed && <small className="install">{e.install}</small>}
            </span>
          </label>
        ))}
      </div>
      <div className="speech-test">
        <h4>Try the selected engine</h4>
        <p className="hint">
          Selected: <b>{label(selected)}</b>. Click Start, say a phrase, click
          Stop. The time runs from Stop until the text appears; the first run
          after a switch includes loading the model.
        </p>
        <div className="test-actions">
          <button
            type="button"
            disabled={test.recording}
            onClick={() => {
              setError("");
              stopped.current.engine = label(selected);
              void test.record();
            }}
          >
            Start test
          </button>
          <button
            type="button"
            disabled={!test.recording}
            onClick={() => {
              stopped.current = {
                at: performance.now(),
                engine: label(selected),
              };
              test.finishRecording();
            }}
          >
            Stop & transcribe
          </button>
          {test.recording && <span className="rec">● recording</span>}
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {results.length > 0 && (
          <ol className="test-results">
            {results.map((r, i) => (
              <li key={i}>
                <span>{r.engine}</span>
                <q>{r.text}</q>
                <time>{(r.ms / 1000).toFixed(2)} s</time>
              </li>
            ))}
          </ol>
        )}
      </div>
      <h4>Microphone & turn-taking</h4>
      <label className="setting">
        Microphone sensitivity
        <select
          aria-label="Microphone sensitivity"
          value={p.micSensitivity}
          onChange={(e) =>
            updatePreferences({
              micSensitivity: e.target.value as typeof p.micSensitivity,
            })
          }
        >
          <option value="low">Low — noisy room</option>
          <option value="normal">Normal</option>
          <option value="high">High — quiet or distant voice</option>
        </select>
      </label>
      <p className="hint">
        How loud you must be, relative to the room, before open mic starts
        listening. Raise it if it misses you; lower it if it reacts to noise.
      </p>
      <label className="setting">
        End-of-speech pause: {p.endPauseMs} ms
        <input
          type="range"
          min={400}
          max={1500}
          step={50}
          value={p.endPauseMs}
          aria-label="End-of-speech pause"
          onChange={(e) =>
            updatePreferences({ endPauseMs: Number(e.target.value) })
          }
        />
      </label>
      <p className="hint">
        How long you must be quiet before your phrase is sent. Shorter feels
        faster but can cut you off mid-thought.
      </p>
      <label className="setting">
        Interrupt Luna by speaking
        <input
          type="checkbox"
          checked={p.bargeIn}
          onChange={(e) => updatePreferences({ bargeIn: e.target.checked })}
        />
      </label>
      <p className="hint">
        Open mic keeps listening while she talks and stops her when you speak
        (stricter threshold, so her own voice is not mistaken for you). Off
        means she finishes first.
      </p>
      <label className="setting">
        Use conversation context
        <input
          type="checkbox"
          checked={p.sttContext}
          onChange={(e) => updatePreferences({ sttContext: e.target.checked })}
        />
      </label>
      <p className="hint">
        Gives Whisper her last reply plus the names Mivuneko and Luna as a hint.
        Parakeet ignores it.
      </p>
    </section>
  );
}
