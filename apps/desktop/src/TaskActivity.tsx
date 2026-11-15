import { useEffect, useRef } from "react";
import { Icon } from "./Icon";
export interface TaskSnapshot {
  label: string;
  busy: boolean;
  done: boolean;
  error: string;
  entries: {
    title: string;
    detail?: string;
    payload?: string;
    review?: string;
  }[];
}
export function TaskActivity({ snapshot: s }: { snapshot: TaskSnapshot }) {
  const scroller = useRef<HTMLDivElement>(null),
    follow = useRef(true);
  useEffect(() => {
    if (follow.current && scroller.current)
      scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [s.entries.length, s.label]);
  return (
    <details
      className={`thinking-trace ${s.busy ? "is-working" : ""}`}
      aria-label="Task activity"
    >
      <summary>
        <span
          className={s.busy ? "thinking-dots" : "trace-mark"}
          aria-hidden="true"
        >
          {s.busy ? "•••" : s.done ? "✓" : "◇"}
        </span>
        <span>{s.label}</span>
        <Icon name="chevron" />
      </summary>
      <div
        className="thinking-scroll"
        tabIndex={0}
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          follow.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 60;
        }}
      >
        <ol>
          {s.entries.map((entry, i) => (
            <li key={i}>
              <details>
                <summary>
                  <span className="trace-check">✓</span>
                  {entry.title}
                  <Icon name="chevron" />
                </summary>
                <div>
                  {entry.detail && <p>{entry.detail}</p>}
                  {entry.review && (
                    <p className="trace-review">
                      <Icon name="shield" />
                      {entry.review}
                    </p>
                  )}
                  {entry.payload && <pre>{entry.payload}</pre>}
                </div>
              </details>
            </li>
          ))}
        </ol>
        {s.busy && (
          <p className="trace-current" role="status">
            {s.label}
          </p>
        )}
        {s.error && (
          <p className="error" role="alert">
            {s.error}
          </p>
        )}
      </div>
    </details>
  );
}
