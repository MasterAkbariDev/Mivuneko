import { useEffect, useRef, useState } from "react";
import { usePreferences } from "./preferences";
import { Icon } from "./Icon";
import "./computer.css";
import { browserTask } from "../../../packages/shared-schemas/computer-intent";
import { broker } from "./broker";
import { matchApps } from "../../../packages/shared-schemas/desktop-intent";
import type { LaunchRequest } from "../../../packages/shared-schemas/index";
interface Target {
  id: string;
  title: string;
  process: string;
}
interface Proposal {
  revision: number;
  step: number;
  action: Record<string, any>;
  observation: { image: string; title: string; elements: any[] };
}
export function ComputerSession({
  initialTask = "",
  onClose,
  inline = false,
  onResult,
}: {
  initialTask?: string;
  onClose: () => void;
  inline?: boolean;
  onResult?: (text: string) => void;
}) {
  const p = usePreferences(),
    [windows, setWindows] = useState<Target[]>([]),
    [target, setTarget] = useState(""),
    [workspace, setWorkspace] = useState(""),
    [task, setTask] = useState(initialTask),
    [session, setSession] = useState(""),
    [proposal, setProposal] = useState<Proposal | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [log, setLog] = useState<string[]>([]),
    [done, setDone] = useState(false);
  const [launch, setLaunch] = useState<LaunchRequest | null>(null),
    [launchName, setLaunchName] = useState("");
  const autoStarted = useRef(false);
  const generation = useRef(0),
    active = useRef("");
  async function call<T>(command: string, args: Record<string, unknown> = {}) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<T>(command, args);
  }
  useEffect(() => {
    let disposed = false;
    void call<any>("computer_windows")
      .then(async (v) => {
        if (disposed) return;
        setWindows(v.windows);
        setTarget(v.windows[0]?.id ?? "");
        const desired = browserTask(initialTask);
        if (desired && !autoStarted.current) {
          autoStarted.current = true;
          const found = v.windows.find((w: Target) =>
            desired.useDefault
              ? ["msedge.exe", "chrome.exe", "firefox.exe"].includes(w.process)
              : w.process ===
                {
                  edge: "msedge.exe",
                  chrome: "chrome.exe",
                  firefox: "firefox.exe",
                }[desired.browser],
          );
          if (found) {
            setTarget(found.id);
            void start(found.id);
          } else {
            try {
              const apps = await broker.listApps();
              const matches = matchApps(desired.browser, apps);
              const app =
                matches.find(
                  (a) =>
                    a.name.toLowerCase() ===
                    {
                      edge: "microsoft edge",
                      chrome: "google chrome",
                      firefox: "mozilla firefox",
                    }[desired.browser],
                ) ?? matches[0];
              if (!app) throw Error("The requested browser is not installed.");
              const request = await broker.requestLaunch(app.id);
              setLaunchName(app.name);
              if (request.policy === "auto") {
                await broker.resolveLaunch(request.id, true);
                await afterLaunch();
              } else if (request.policy === "deny")
                throw Error("App launching is denied in Permissions.");
              else setLaunch(request);
            } catch (e) {
              setError(String(e));
            }
          }
        }
      })
      .catch((e) => setError(String(e)));
    const stop = () => {
      void end();
    };
    window.addEventListener("mivuneko-computer-stop", stop);
    return () => {
      disposed = true;
      generation.current++;
      window.removeEventListener("mivuneko-computer-stop", stop);
      if (active.current) void call("computer_stop");
    };
  }, []);
  async function end() {
    generation.current++;
    active.current = "";
    setSession("");
    setBusy(false);
    setProposal(null);
    await call("computer_stop").catch(() => {});
  }
  async function next(id = session) {
    const ticket = ++generation.current;
    setBusy(true);
    setError("");
    try {
      const plan = await call<Proposal>("computer_next", { sessionId: id });
      if (ticket === generation.current) {
        setProposal(plan);
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        await getCurrentWindow().show();
        await getCurrentWindow().setFocus();
        if (["finish", "ask_user"].includes(plan.action.kind)) {
          setDone(true);
          setLog((old) => [...old, plan.action.reason]);
          await call("computer_act", {
            sessionId: id,
            revision: plan.revision,
          });
          await call("computer_stop");
          active.current = "";
          onResult?.(plan.action.reason);
        }
      }
    } catch (e) {
      if (ticket === generation.current) setError(String(e));
    } finally {
      if (ticket === generation.current) setBusy(false);
    }
  }
  async function afterLaunch() {
    for (let i = 0; i < 4; i++) {
      const list = await call<any>("computer_windows");
      const desired = browserTask(initialTask);
      const found = list.windows.find(
        (w: Target) =>
          desired &&
          (desired.useDefault
            ? ["msedge.exe", "chrome.exe", "firefox.exe"].includes(w.process)
            : w.process ===
              {
                edge: "msedge.exe",
                chrome: "chrome.exe",
                firefox: "firefox.exe",
              }[desired.browser]),
      );
      setWindows(list.windows);
      if (found) {
        setTarget(found.id);
        await start(found.id);
        return;
      }
      await new Promise((r) => setTimeout(r, 750));
    }
    setError("The browser is still opening. Refresh its window and continue.");
  }
  async function openRequested() {
    if (!launch) return;
    setBusy(true);
    try {
      await broker.resolveLaunch(launch.id, true);
      setLaunch(null);
      await afterLaunch();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function start(selectedTarget = target) {
    const ticket = ++generation.current;
    setBusy(true);
    setError("");
    setDone(false);
    setLog([]);
    try {
      const s = await call<{ sessionId: string }>("computer_start", {
        windowId: selectedTarget,
        workspace,
        task: browserTask(task)?.url
          ? `Open a new browser tab and navigate to ${browserTask(task)!.url}. User request: ${task}. Keep existing tabs open. Verify the requested website has loaded.`
          : task,
        model: p.ollamaModel,
      });
      if (ticket !== generation.current) {
        await call("computer_stop");
        return;
      }
      active.current = s.sessionId;
      setSession(s.sessionId);
      await next(s.sessionId);
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  }
  async function approve() {
    if (!proposal || busy) return;
    const ticket = ++generation.current;
    setBusy(true);
    try {
      const result = await call<any>("computer_act", {
        sessionId: session,
        revision: proposal.revision,
      });
      if (ticket !== generation.current) return;
      setLog((old) => [
        ...old,
        `${proposal.action.kind}: ${proposal.action.reason} → ${JSON.stringify(result).slice(0, 200)}`,
      ]);
      setProposal(null);
      await next();
    } catch (e) {
      setProposal(null);
      setError(String(e));
      setBusy(false);
    }
  }
  return (
    <div className={inline ? "computer-inline" : "scrim"}>
      <section
        className="computer-session dialog"
        role={inline ? "region" : "dialog"}
        aria-modal={inline ? undefined : true}
        aria-label={inline ? "Computer task" : "Computer session"}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            void end();
            onClose();
          }
        }}
      >
        <header>
          <div>
            <h2>{inline ? "Working on your request" : "Computer session"}</h2>
            <p>{p.ollamaModel} · processed locally</p>
          </div>
          <button
            aria-label="Close computer session"
            onClick={() => {
              void end();
              onClose();
            }}
          >
            <Icon name="close" />
          </button>
        </header>
        {!session ? (
          <>
            {launch && (
              <button
                className="primary"
                disabled={busy}
                onClick={() => void openRequested()}
              >
                Open {launchName} and continue
              </button>
            )}
            <label>
              Task
              <textarea
                aria-label="Computer task"
                maxLength={4000}
                value={task}
                onChange={(e) => setTask(e.target.value)}
                placeholder="Help me edit a document, organize this folder, or work in an app…"
              />
            </label>
            <label>
              App window
              <select
                aria-label="Computer target window"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              >
                {windows.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.title} · {w.process}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Workspace folder · optional
              <input
                aria-label="Computer workspace folder"
                value={workspace}
                onChange={(e) => setWorkspace(e.target.value)}
                placeholder="J:\Projects\my-project"
              />
            </label>
            <p className="hint">
              Review each proposed action before it runs. File access stays
              inside the selected folder; edits keep backups. Stop ends the
              session.
            </p>
            <button
              className="primary"
              disabled={busy || !target || !task.trim()}
              onClick={() => void start()}
            >
              {inline ? "Continue" : "Start local session"}
            </button>
          </>
        ) : (
          <>
            <div className="computer-session-toolbar">
              <span>Step {proposal?.step ?? log.length + 1} of 60</span>
              <button onClick={() => void end()}>Stop session</button>
            </div>
            {proposal && (
              <>
                <img
                  className="computer-observation"
                  src={`data:image/jpeg;base64,${proposal.observation.image}`}
                  alt={`Current app: ${proposal.observation.title}`}
                />
                <div className="computer-action">
                  <strong>{proposal.action.kind.replaceAll("_", " ")}</strong>
                  <p>{proposal.action.reason}</p>
                  {Object.entries(proposal.action)
                    .filter(([key]) => !["kind", "reason"].includes(key))
                    .map(([key, v]) => (
                      <pre key={key}>
                        <b>{key}: </b>
                        {String(v)}
                      </pre>
                    ))}
                </div>
                {!done && (
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => void approve()}
                  >
                    Approve this step
                  </button>
                )}
              </>
            )}
            {done && (
              <button
                onClick={() => {
                  void end();
                  onClose();
                }}
              >
                Done
              </button>
            )}
            <details>
              <summary>Session activity</summary>
              <ol>
                {log.map((entry, i) => (
                  <li key={i}>{entry}</li>
                ))}
              </ol>
            </details>
          </>
        )}
        {session && !proposal && !busy && !done && (
          <button onClick={() => void next()}>Observe again</button>
        )}
        {busy && (
          <p role="status">Observing the app and planning the next step…</p>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
