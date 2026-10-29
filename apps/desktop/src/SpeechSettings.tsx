import { RangeSlider } from "./RangeSlider";
import { useEffect, useRef, useState } from "react";
import { isNative } from "./broker";
import { updatePreferences, usePreferences } from "./preferences";
import { useVoice } from "./useVoice";
import { MicrophoneSettings } from "./MicrophoneSettings";
import { useSpeechDownload, startSpeechDownload } from "./speechDownloads";

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
  const download = useSpeechDownload();
  const installing = download?.active ? download.engine : "";
  async function refreshEngines() {
    const { invoke } = await import("@tauri-apps/api/core");
    const result = await invoke<Engine[]>("voice_engines");
    setEngines(Array.isArray(result) ? result : []);
  }
  useEffect(() => {
    if (!isNative) return;
    void import("@tauri-apps/api/core")
      .then(({ invoke }) => invoke<Engine[]>("voice_engines"))
      .then((result) => setEngines(Array.isArray(result) ? result : []))
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
  async function install(engine: string) {
    setError("");
    try {
      await startSpeechDownload(engine);
      await refreshEngines();
      updatePreferences({ sttEngine: engine });
    } catch (e) {
      setError(String(e));
    }
  }
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
    <>
      <MicrophoneSettings />
      <section className="settings-group" aria-label="Speech recognition">
        <span className="eyebrow">LOCAL RECOGNITION</span>
        <h3>Turn your words into text</h3>
        <p className="hint">
          Choose the engine that turns your voice into text, then try it below.
          Recognition runs on your device. Download a model below to install the
          engine and model together. No terminal commands or environment
          variables are needed.
        </p>
        {!engines.some((e) => e.installed) && (
          <div className="setup-callout">
            <strong>Let’s set up your voice</strong>
            <p>
              Base English is a good first choice. For multilingual
              conversations, choose Base or Large v3 Turbo.
            </p>
            <button
              className="primary"
              disabled={!!installing}
              onClick={() => void install("whisper:base.en")}
            >
              {installing
                ? "Setting up…"
                : "Set up speech recognition · 148 MB"}
            </button>
          </div>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
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
                Selects the best installed recognition engine. Parakeet is
                preferred for English; Whisper remains available for
                multilingual conversations.
              </small>
            </span>
          </label>
          {engines.map((e) => (
            <div
              key={e.id}
              className={`engine ${selected === e.id ? "on" : ""} ${e.installed ? "" : "missing"}`}
              onClick={(event) => {
                if (e.installed && !(event.target as Element).closest("button"))
                  updatePreferences({ sttEngine: e.id });
              }}
            >
              <input
                aria-label={e.label}
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
                <small>
                  {e.installed ? "Engine + model ready" : "Not installed"}
                </small>
              </span>
              {!e.installed && (
                <button
                  type="button"
                  className="engine-download"
                  disabled={!!installing}
                  onClick={() => void install(e.id)}
                >
                  {installing === e.id
                    ? "Downloading…"
                    : `Download · ${e.sizeMb} MB`}
                </button>
              )}
            </div>
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
          <RangeSlider
            min={1500}
            max={10000}
            step={250}
            disabled={p.turnTaking === "manual"}
            value={p.endPauseMs}
            aria-label="End-of-speech pause"
            onChange={(e) =>
              updatePreferences({ endPauseMs: Number(e.target.value) })
            }
          />
        </label>
        <p className="hint">
          Waits {(p.endPauseMs / 1000).toFixed(2)} seconds after your last
          words. Keep talking after a thinking pause to continue the same
          message.
        </p>
        <label className="setting">
          Send my voice message
          <select
            aria-label="Voice message submission"
            value={p.turnTaking}
            onChange={(e) =>
              updatePreferences({
                turnTaking: e.target.value as typeof p.turnTaking,
              })
            }
          >
            <option value="automatic">After a quiet pause</option>
            <option value="manual">Only when I press Done speaking</option>
          </select>
        </label>
        <p className="hint">
          Manual mode lets you think for as long as you need. Recordings are
          limited to two minutes; at that limit, text is kept as a draft.
        </p>
        <label className="setting">
          Interrupt your companion by speaking
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
            onChange={(e) =>
              updatePreferences({ sttContext: e.target.checked })
            }
          />
        </label>
        <p className="hint">
          Gives Whisper her last reply plus the names Mivuneko and Luna as a
          hint. Parakeet ignores it.
        </p>
      </section>
    </>
  );
}
