import { terminalTask } from "../../../packages/shared-schemas/computer-intent";
import { TaskActivity, type TaskSnapshot } from "./TaskActivity";
import type { TaskQuestion } from "./QuestionPanel";
import { logActivity } from "./activity";
import {
  requestedFolder,
  fileTask,
} from "../../../packages/shared-schemas/task-context";
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
  review?: { decision: "allow" | "ask" | "deny"; summary: string };
}
export function ComputerSession({
  initialTask = "",
  onClose,
  inline = false,
  onResult,
  onProgress,
  onQuestion,
  onClarification,
  onBusyChange,
  onSnapshot,
  headless = false,
}: {
  initialTask?: string;
  onClose: () => void;
  inline?: boolean;
  onResult?: (text: string) => void;
  onProgress?: (text: string) => void;
  onQuestion?: (question: TaskQuestion) => void;
  onClarification?: (answer: string) => void;
  onBusyChange?: (busy: boolean) => void;
  onSnapshot?: (snapshot: TaskSnapshot) => void;
  headless?: boolean;
}) {
  const p = usePreferences(),
    [windows, setWindows] = useState<Target[]>([]),
    [target, setTarget] = useState(""),
    [workspace, setWorkspace] = useState(requestedFolder(initialTask)),
    [task, setTask] = useState(initialTask),
    [session, setSession] = useState(""),
    [proposal, setProposal] = useState<Proposal | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [log, setLog] = useState<
      {
        title: string;
        detail?: string;
        payload?: string;
        review?: string;
        ok?: boolean;
      }[]
    >([]),
    [done, setDone] = useState(false);
  const [workLabel, setWorkLabel] = useState("Thinking…"),
    [stopped, setStopped] = useState(false);
  const snapshotCallback = useRef(onSnapshot);
  snapshotCallback.current = onSnapshot;
  const snapshot: TaskSnapshot = {
    label: busy
      ? workLabel
      : error
        ? "Needs attention"
        : done
          ? "Completed"
          : stopped
            ? "Stopped"
            : "Waiting for you",
    busy,
    done,
    error,
    entries: log,
  };
  useEffect(() => {
    snapshotCallback.current?.(snapshot);
  }, [workLabel, busy, done, stopped, error, log]);
  useEffect(() => {
    onBusyChange?.(busy);
    return () => onBusyChange?.(false);
  }, [busy]);
  const autoStarted = useRef(false);
  const settings = useRef(p);
  settings.current = p;
  const interactive = useRef(false);
  const [needsVisible, setNeedsVisible] = useState(false);
  const desiredBrowser = browserTask(task);
  function actionLabel(a: Record<string, any>) {
    const verbs: Record<string, string> = {
      read_file: "Reading",
      write_file: "Saving",
      open_file: "Opening",
      open_folder: "Opening folder in VS Code",
      run_command: "Running command",
      list_files: "Checking folder",
      move_file: "Moving",
      trash_file: "Recycling",
      click: "Selecting a control",
      type: "Entering text",
      key: "Using a keyboard shortcut",
      system_info: "Checking system information",
      wait: "Waiting for the app",
      window: "Updating the window",
      switch_window: "Switching apps",
      open_app: "Opening an app",
      drag: "Moving a control",
      scroll: "Scrolling",
    };
    return `${verbs[a.kind] || "Working"}${a.path ? " " + a.path : ""}…`;
  }
  function record(plan: Proposal, result?: any) {
    const a = plan.action;
    const verbs: Record<string, string> = {
      read_file: "Reading",
      write_file: "Saving",
      open_file: "Opening",
      open_folder: "Opening folder in VS Code",
      run_command: "Running command",
      list_files: "Checking folder contents",
      move_file: "Moving",
      trash_file: "Recycling",
      click: "Selecting a control",
      type: "Entering text",
      key: "Using a keyboard shortcut",
      finish: "Verified result",
      ask_user: "A detail is needed",
      system_info: "Checking system information",
    };
    const title = `${verbs[a.kind] || a.kind.replaceAll("_", " ")}${a.path ? " " + a.path : ""}`;
    setLog((old) => [
      ...old,
      {
        title:
          plan.review?.decision === "deny"
            ? "Action blocked"
            : a.kind === "run_command" &&
                result?.exitCode !== undefined &&
                result.exitCode !== 0
              ? `Command failed (exit ${result.exitCode})`
              : title,
        ok:
          plan.review?.decision === "deny"
            ? false
            : a.kind === "run_command" && result?.exitCode !== undefined
              ? result.exitCode === 0
              : undefined,
        detail: a.reason?.startsWith("The user") ? undefined : a.reason,
        payload: (a.kind === "run_command"
          ? `PS ${result?.cwd || a.cwd || "."}> ${result?.command || a.command || `${a.executable} ${JSON.stringify(a.args)}`}\nExit: ${result?.exitCode ?? "not run"}\n${result?.stdout || ""}${result?.stderr ? "\n" + result.stderr : ""}`
          : result?.text || a.text || a.key || ""
        ).slice(0, 12000),
        review: plan.review?.summary,
      },
    ]);
    logActivity(title);
  }
  function question(title: string, options?: TaskQuestion["options"]) {
    onQuestion?.({
      kind: "question",
      title,
      options,
      resolve: (answer) => {
        if (answer) onClarification?.(answer);
        else {
          void end();
          setDone(true);
        }
      },
    });
  }
  async function openBrowserTask() {
    const desired = browserTask(task);
    if (!desired) return;
    const ticket = ++generation.current;
    setBusy(true);
    setError("");
    setDone(false);
    setStopped(false);
    setWorkLabel(
      desired.intent === "page"
        ? "Finding the right page…"
        : "Opening your browser…",
    );
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
      setWorkLabel("Opening your browser…");
      await call("computer_open_browser", {
        url,
        browser: desired.useDefault ? "default" : desired.browser,
      });
      if (ticket !== generation.current) return;
      setLog([
        {
          title: page ? `Opened ${page.title}` : "Opened browser",
          detail: url,
        },
      ]);
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
        if (
          settings.current.computerApproval === "automatic" ||
          settings.current.actionReview === "bypass"
        )
          void openBrowserTask();
        else
          onQuestion?.({
            kind: "permission",
            title: "Open this in your browser?",
            description: initialTask,
            resolve: (answer) => {
              if (answer === "allow") void openBrowserTask();
              else setDone(true);
            },
          });
      });
    } else if (fileTask(initialTask)) {
      void Promise.resolve().then(() => {
        if (!disposed && !autoStarted.current) {
          autoStarted.current = true;
          void start("");
        }
      });
    } else if (terminalTask(initialTask)) {
      void Promise.resolve().then(() => {
        if (!disposed)
          question("Which project folder should I run the command in?");
      });
    } else if (
      /\b(?:create|write|save|generate|build|implement)\b.*\b(?:function|example|script|program|file|folder|directory)\b/i.test(
        initialTask,
      ) &&
      !/\b(?:editor|notepad|ide)\b/i.test(initialTask)
    ) {
      void Promise.resolve().then(() => {
        if (!disposed) question("Where should I save the files?");
      });
    } else
      void call<any>("computer_windows")
        .then(async (v) => {
          if (disposed || ticket !== generation.current) return;
          setWindows(v.windows);
          setTarget(v.windows[0]?.id ?? "");
          if (initialTask) {
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
              if (!selected.windowId) {
                question(
                  "Which app should I work in?",
                  v.windows.slice(0, 5).map((w: Target) => ({
                    label: w.title,
                    value: `Use ${w.title} for this task`,
                    description: w.process,
                  })),
                );
              }
              if (selected.windowId) {
                setTarget(selected.windowId);
                if (!selected.needsWorkspace) {
                  void start(selected.windowId);
                  return;
                }
                question("Which folder should I use?");
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
    setStopped(true);
    await call("computer_stop").catch(() => {});
  }
  function stale(e: unknown) {
    return /window changed|UI element changed|observe (?:it|the window|again)|step is stale|unobserved.*control/i.test(
      String(e),
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
        setWorkLabel(
          step === 0 && log.length === 0
            ? "Thinking…"
            : "Planning the next step…",
        );
        const plan = await call<Proposal>("computer_next", { sessionId: id });
        if (ticket !== generation.current) return;
        setProposal(plan);
        setWorkLabel(actionLabel(plan.action));
        if (["finish", "ask_user"].includes(plan.action.kind)) {
          await call("computer_act", {
            sessionId: id,
            revision: plan.revision,
            interactive: interactive.current,
          });
          if (ticket !== generation.current) return;
          setDone(plan.action.kind === "finish");
          record(plan);
          await call("computer_stop");
          active.current = "";
          if (ticket === generation.current) {
            if (plan.action.kind === "ask_user")
              question(
                plan.action.reason.length < 240
                  ? plan.action.reason
                  : "What detail should I use to continue?",
                plan.action.options?.map((label: string) => ({
                  label,
                  value: label,
                })),
              );
            else onResult?.(plan.action.reason);
          }
          return;
        }
        if (plan.review?.decision === "deny") {
          record(plan);
          setProposal(null);
          continue;
        }
        if (
          (settings.current.computerApproval === "review" &&
            settings.current.actionReview !== "bypass") ||
          plan.review?.decision === "ask"
        ) {
          onQuestion?.({
            kind: "permission",
            title: "Allow this action?",
            description: plan.review?.summary || plan.action.reason,
            resolve: (answer) => {
              if (answer === "allow") void execute(plan, id, true);
              else {
                void end();
                setDone(true);
                onResult?.("I didn't run that action.");
              }
            },
          });
          return;
        }
        try {
          const result = await call("computer_act", {
            sessionId: id,
            revision: plan.revision,
            interactive: interactive.current,
          });
          if (ticket !== generation.current) return;
          record(plan, result);
          setProposal(null);
          retries = 0;
        } catch (e) {
          if (ticket !== generation.current) return;
          setProposal(null);
          if (stale(e) && retries++ < 3) continue;
          if (String(e).includes("FOREGROUND_REQUIRED")) {
            setNeedsVisible(true);
            if (settings.current.actionReview === "bypass") {
              interactive.current = true;
              continue;
            }
            onQuestion?.({
              kind: "permission",
              title: "Use visible controls?",
              description:
                "This app needs mouse or keyboard input to finish your request.",
              resolve: (answer) => {
                if (answer === "allow") {
                  interactive.current = true;
                  void next(id);
                } else {
                  void end();
                  setDone(true);
                }
              },
            });
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
    setStopped(false);
    setWorkLabel("Checking the request…");
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
        reviewMode: settings.current.actionReview,
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
  async function execute(plan: Proposal, id: string, approved = false) {
    const ticket = ++generation.current;
    setBusy(true);
    try {
      const result = await call("computer_act", {
        sessionId: id,
        revision: plan.revision,
        interactive: interactive.current,
        ...(approved ? { approved: true } : {}),
      });
      if (ticket !== generation.current) return;
      record(plan, result);
      setProposal(null);
      await next(id);
    } catch (e) {
      if (ticket !== generation.current) return;
      setBusy(false);
      setProposal(null);
      if (stale(e)) {
        await next(id);
        return;
      }
      setError(String(e));
    }
  }
  return headless ? null : <TaskActivity snapshot={snapshot} />;
}
