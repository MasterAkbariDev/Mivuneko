import { useEffect, useRef, useState } from "react";
import { updatePreferences, usePreferences } from "./preferences";
import { Icon } from "./Icon";
import "./computer.css";
import { browserTask } from "../../../packages/shared-schemas/computer-intent";
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
  onProgress,
}: {
  initialTask?: string;
  onClose: () => void;
  inline?: boolean;
  onResult?: (text: string) => void;
  onProgress?: (text: string) => void;
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
  const autoStarted = useRef(false);
  const settings = useRef(p);
  settings.current = p;
  const interactive = useRef(false);
  const [needsVisible, setNeedsVisible] = useState(false);
  const desiredBrowser = browserTask(task);
  async function openBrowserTask() {
    const desired = browserTask(task);
    if (!desired) return;
    const ticket = ++generation.current;
    setBusy(true);
    setError("");
    setDone(false);
    try {
      const page =
        desired.intent === "page"
          ? await call<{ url: string; title: string }>(
              "computer_resolve_page",
              { task, model: settings.current.ollamaModel },
            )
          : null;
      if (ticket !== generation.current) return;
      const url =
        page?.url ??
        desired.url ??
        `https://www.google.com/search?q=${encodeURIComponent(desired.query)}`;
      await call("computer_open_browser", {
        url,
        browser: desired.useDefault ? "default" : desired.browser,
      });
      if (ticket !== generation.current) return;
      setSession("browser");
      setDone(true);
      onResult?.(
        page
          ? `I've opened ${page.title} in your browser.`
          : desired.url
            ? "I've opened the page in your browser."
            : `I've opened a browser search for ${desired.query}.`,
      );
    } catch (e) {
      if (ticket === generation.current) setError(String(e));
    } finally {
      if (ticket === generation.current) setBusy(false);
    }
  }
  const generation = useRef(0),
    active = useRef("");
  async function call<T>(command: string, args: Record<string, unknown> = {}) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<T>(command, args);
  }
  useEffect(() => {
    let disposed = false;
    const ticket = generation.current;
    if (browserTask(initialTask)) {
      void Promise.resolve().then(() => {
        if (disposed || autoStarted.current) return;
        autoStarted.current = true;
        if (settings.current.computerApproval === "automatic")
          void openBrowserTask();
      });
    } else
      void call<any>("computer_windows")
        .then(async (v) => {
          if (disposed || ticket !== generation.current) return;
          setWindows(v.windows);
          setTarget(v.windows[0]?.id ?? "");
          if (
            initialTask &&
            settings.current.computerApproval === "automatic"
          ) {
            setBusy(true);
            try {
              const selected = await call<{
                windowId: string;
                needsWorkspace: boolean;
              }>("computer_select_target", {
                task: initialTask,
                model: settings.current.ollamaModel,
              });
              if (disposed || ticket !== generation.current) return;
              if (selected.windowId) {
                setTarget(selected.windowId);
                if (!selected.needsWorkspace) {
                  void start(selected.windowId);
                  return;
                }
              }
            } catch (e) {
              if (!disposed) setError(String(e));
            }
            if (!disposed) setBusy(false);
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
    setNeedsVisible(false);
    await call("computer_stop").catch(() => {});
  }
  function stale(e: unknown) {
    return /window changed|UI element changed|observe (?:it|the window|again)|step is stale|unobserved.*control/i.test(
      String(e),
    );
  }
  function reviewAction(action: Record<string, any>) {
    return (
      action.kind === "trash_file" ||
      (action.kind === "window" && action.operation === "close")
    );
  }
  async function next(id = session) {
    const ticket = ++generation.current;
    setBusy(true);
    setError("");
    setNeedsVisible(false);
    let retries = 0;
    try {
      for (let step = 0; step < 60 && ticket === generation.current; step++) {
        const plan = await call<Proposal>("computer_next", { sessionId: id });
        if (ticket !== generation.current) return;
        setProposal(plan);
        if (["finish", "ask_user"].includes(plan.action.kind)) {
          await call("computer_act", {
            sessionId: id,
            revision: plan.revision,
            interactive: interactive.current,
          });
          if (ticket !== generation.current) return;
          setDone(true);
          setLog((old) => [...old, plan.action.reason]);
          await call("computer_stop");
          active.current = "";
          if (ticket === generation.current) onResult?.(plan.action.reason);
          return;
        }
        if (
          settings.current.computerApproval === "review" ||
          reviewAction(plan.action)
        )
          return;
        try {
          await call("computer_act", {
            sessionId: id,
            revision: plan.revision,
            interactive: interactive.current,
          });
          if (ticket !== generation.current) return;
          setLog((old) => [...old, plan.action.reason]);
          setProposal(null);
          retries = 0;
        } catch (e) {
          if (ticket !== generation.current) return;
          setProposal(null);
          if (stale(e) && retries++ < 3) continue;
          if (String(e).includes("FOREGROUND_REQUIRED")) {
            setNeedsVisible(true);
            return;
          }
          throw e;
        }
      }
    } catch (e) {
      if (ticket === generation.current) setError(String(e));
    } finally {
      if (ticket === generation.current) setBusy(false);
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
        background: true,
      });
      if (ticket !== generation.current) {
        await call("computer_stop");
        return;
      }
      interactive.current = false;
      onProgress?.("I’m working on that for you.");
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
        interactive: interactive.current,
      });
      if (ticket !== generation.current) return;
      setLog((old) => [
        ...old,
        `${proposal.action.kind}: ${proposal.action.reason} → ${JSON.stringify(result).slice(0, 200)}`,
      ]);
      setProposal(null);
      await next();
    } catch (e) {
      if (ticket !== generation.current) return;
      setProposal(null);
      setBusy(false);
      if (stale(e)) {
        await next();
        return;
      }
      if (String(e).includes("FOREGROUND_REQUIRED")) {
        setNeedsVisible(true);
        return;
      }
      setError(String(e));
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
        <label className="setting">
          Task control
          <select
            aria-label="Computer task control"
            value={p.computerApproval}
            onChange={(e) =>
              updatePreferences({
                computerApproval: e.target.value as "automatic" | "review",
              })
            }
          >
            <option value="automatic">Automatic</option>
            <option value="review">Review every step</option>
          </select>
        </label>
        {!session ? (
          <>
            {desiredBrowser ? (
              <button
                className="primary"
                disabled={busy}
                onClick={() => void openBrowserTask()}
              >
                Open in browser
              </button>
            ) : (
              <>
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
                  Routine actions run automatically. Background controls keep
                  your mouse and keyboard free where supported. File access
                  stays inside the selected folder; edits keep backups.
                </p>
                <button
                  className="primary"
                  disabled={busy || !target || !task.trim()}
                  onClick={() => void start()}
                >
                  {inline ? "Continue" : "Start local session"}
                </button>
              </>
            )}
          </>
        ) : (
          <>
            <div className="computer-session-toolbar">
              <span>Step {proposal?.step ?? log.length + 1} of 60</span>
              <button onClick={() => void end()}>Stop session</button>
            </div>
            {needsVisible && (
              <div role="status">
                <p>
                  This app needs visible controls for the next part. Background
                  mode has kept your mouse and keyboard untouched.
                </p>
                <button
                  onClick={() => {
                    interactive.current = true;
                    void next();
                  }}
                >
                  Allow visible controls for this task
                </button>
              </div>
            )}
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
                {!done && !busy && (
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
        {session && !proposal && !busy && !done && !needsVisible && (
          <button onClick={() => void next()}>Observe again</button>
        )}
        {busy && (
          <p role="status">
            {desiredBrowser?.intent === "page"
              ? "Finding a page that matches your request…"
              : desiredBrowser
                ? "Opening your browser…"
                : "Observing the app and planning the next step…"}
          </p>
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
