import { broker } from "./broker";
import { matchApps } from "../../../packages/shared-schemas/desktop-intent";
import type {
  LaunchRequest,
  AppInfo,
} from "../../../packages/shared-schemas/index";
import {
  workContext,
  type WorkContext,
} from "../../../packages/shared-schemas/work-context";
import { TaskActivity, type TaskSnapshot } from "./TaskActivity";
import type { TaskQuestion } from "./QuestionPanel";
import { logActivity } from "./activity";
import { requestedFolder } from "../../../packages/shared-schemas/task-context";
import { useEffect, useRef, useState } from "react";
import { usePreferences } from "./preferences";
import "./computer.css";
import { browserTask } from "../../../packages/shared-schemas/computer-intent";
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
  context,
  conversation = [],
  onContext,
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
  context?: WorkContext;
  conversation?: { role: string; text: string }[];
  onContext?: (context: WorkContext) => void;
}) {
  const observedContext = useRef(workContext(context));
  const p = usePreferences(),
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
  const settings = useRef(p);
  settings.current = p;
  const interactive = useRef(false);
  const [needsVisible, setNeedsVisible] = useState(false);
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
    if (
      plan.review?.decision !== "deny" &&
      result &&
      (a.kind !== "run_command" || result.exitCode === 0)
    ) {
      const fact = `Tool result: ${a.kind}${a.path ? " " + a.path : ""}; ${a.kind === "run_command" ? "exit code 0" : "succeeded"}. Proposed purpose: ${a.reason || title}.`;
      observedContext.current = workContext({
        ...observedContext.current,
        status: "working",
        facts: [...observedContext.current.facts, fact],
      });
      onContext?.(observedContext.current);
    }
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
  async function openBrowserTask(
    desired: NonNullable<ReturnType<typeof browserTask>>,
    resolvedTask: string,
  ) {
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
              { task: resolvedTask, model: settings.current.ollamaModel },
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
  const pendingLaunch = useRef("");
  async function openNamedApp(query: string) {
    const ticket = ++generation.current;
    setBusy(true);
    setError("");
    setWorkLabel("Finding the installed app…");
    try {
      const apps = await broker.listApps();
      if (ticket !== generation.current) return;
      const matches = matchApps(query, apps);
      if (matches.length !== 1) {
        setBusy(false);
        if (matches.length)
          question(
            "Which installed app should I open?",
            matches.slice(0, 5).map((app: AppInfo) => ({
              label: app.name,
              value: `Open ${app.name}`,
            })),
          );
        else setError(`No installed app matched ${query}.`);
        return;
      }
      const request: LaunchRequest = await broker.requestLaunch(matches[0].id);
      if (ticket !== generation.current) {
        await broker.resolveLaunch(request.id, false).catch(() => {});
        return;
      }
      pendingLaunch.current = request.id;
      const finish = async (allow: boolean) => {
        if (ticket !== generation.current) return;
        setBusy(true);
        setWorkLabel(
          allow ? `Opening ${request.app.name}…` : "Cancelling launch…",
        );
        try {
          const result = await broker.resolveLaunch(request.id, allow);
          pendingLaunch.current = "";
          if (ticket !== generation.current) return;
          setLog([{ title: result.message, ok: result.ok }]);
          setDone(result.ok);
          if (result.ok) onResult?.(result.message);
          else {
            setStopped(true);
            onContext?.(
              workContext({
                ...observedContext.current,
                status: "stopped",
                question: "",
              }),
            );
          }
        } catch (e) {
          if (ticket === generation.current) setError(String(e));
        } finally {
          if (ticket === generation.current) setBusy(false);
        }
      };
      const policy = request.policy ?? settings.current.approvalMode;
      if (policy === "ask") {
        setBusy(false);
        onQuestion?.({
          kind: "permission",
          title: `Open ${request.app.name}?`,
          description: "Launch the installed application.",
          resolve: (answer) => {
            void finish(answer === "allow");
          },
        });
      } else await finish(policy === "auto");
    } catch (e) {
      if (ticket === generation.current) {
        setError(String(e));
        setBusy(false);
      }
    }
  }
  const generation = useRef(0),
    active = useRef("");
  async function call<T>(command: string, args: Record<string, unknown> = {}) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<T>(command, args);
  }
  const preparation = useRef<Promise<any> | null>(null);
  useEffect(() => {
    let disposed = false;
    const ticket = generation.current;
    setBusy(true);
    setWorkLabel("Understanding your request…");
    void (preparation.current ??= call<any>("computer_prepare_task", {
      task: initialTask,
      context: workContext(context),
      conversation: conversation
        .slice(-12)
        .map((m) => ({ role: m.role, content: m.text.slice(0, 4000) })),
      explicitWorkspace: requestedFolder(initialTask),
      conversationWorkspaces: [
        ...new Set(
          conversation
            .slice(-12)
            .filter((m) => m.role === "user")
            .map((m) => requestedFolder(m.text))
            .filter(Boolean),
        ),
      ].slice(-8),
      model: settings.current.ollamaModel,
    }))
      .then((prepared) => {
        if (disposed || ticket !== generation.current) return;
        const nextContext = workContext({
          ...prepared.context,
          status: "working",
          question: "",
        });
        observedContext.current = nextContext;
        onContext?.(nextContext);
        if (prepared.kind === "inspect") {
          setLog([
            { title: "Checked current desktop state", detail: prepared.result },
          ]);
          setDone(true);
          setBusy(false);
          onContext?.(
            workContext({
              ...nextContext,
              status: "completed",
              facts: [...nextContext.facts, prepared.result],
            }),
          );
          onResult?.(prepared.result);
        } else if (prepared.kind === "question") {
          setBusy(false);
          onContext?.(
            workContext({
              ...nextContext,
              status: "waiting",
              question: prepared.question,
            }),
          );
          question(
            prepared.question,
            prepared.options?.map((value: string) => ({ label: value, value })),
          );
        } else if (prepared.kind === "launch") {
          void openNamedApp(prepared.appQuery);
        } else if (prepared.kind === "browser") {
          const open = () =>
            void openBrowserTask(
              prepared.browserRequest,
              prepared.task || initialTask,
            );
          if (
            settings.current.computerApproval === "automatic" ||
            settings.current.actionReview === "bypass"
          )
            open();
          else {
            setBusy(false);
            onQuestion?.({
              kind: "permission",
              title: "Open this in your browser?",
              description: prepared.context.goal,
              resolve: (answer) => {
                if (answer === "allow") open();
                else setDone(true);
              },
            });
          }
        } else {
          void start(
            prepared.kind === "workspace" ? "" : nextContext.windowId,
            nextContext.workspace,
            prepared.task || initialTask,
          );
        }
      })
      .catch((e) => {
        if (!disposed) {
          setError(String(e));
          setBusy(false);
        }
      });
    const stop = () => {
      void end();
    };
    window.addEventListener("mivuneko-computer-stop", stop);
    return () => {
      disposed = true;
      generation.current++;
      window.removeEventListener("mivuneko-computer-stop", stop);
      if (pendingLaunch.current) {
        void broker.resolveLaunch(pendingLaunch.current, false).catch(() => {});
        pendingLaunch.current = "";
      }
      if (active.current) void call("computer_stop");
    };
  }, []);
  async function end() {
    generation.current++;
    if (pendingLaunch.current) {
      void broker.resolveLaunch(pendingLaunch.current, false).catch(() => {});
      pendingLaunch.current = "";
    }
    active.current = "";
    setSession("");
    setBusy(false);
    setProposal(null);
    setNeedsVisible(false);
    setStopped(true);
    observedContext.current = workContext({
      ...observedContext.current,
      status: "stopped",
      question: "",
    });
    onContext?.(observedContext.current);
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
  async function start(
    selectedTarget: string,
    projectWorkspace: string,
    resolvedTask: string,
  ) {
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
        workspace: projectWorkspace,
        task: resolvedTask,
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
