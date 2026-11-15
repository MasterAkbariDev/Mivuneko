import { useEffect, useState } from "react";
import { Icon } from "./Icon";
export interface TaskQuestion {
  kind: "permission" | "question";
  title: string;
  description?: string;
  options?: { label: string; value: string; description?: string }[];
  resolve: (answer: string | null) => void;
}
export function QuestionPanel({ question }: { question: TaskQuestion }) {
  const [choice, setChoice] = useState(""),
    [custom, setCustom] = useState("");
  useEffect(() => {
    setChoice("");
    setCustom("");
  }, [question.title, question.kind]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement).matches("input,textarea,select") ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey
      )
        return;
      const n = Number(e.key) - 1;
      if (question.options?.[n]) {
        e.preventDefault();
        setChoice(question.options[n].value);
        setCustom("");
      }
      if (e.key === "Enter" && (custom.trim() || choice)) {
        e.preventDefault();
        question.resolve(custom.trim() || choice);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [question, choice, custom]);
  return (
    <section
      className="question-panel"
      aria-label={
        question.kind === "permission"
          ? "Permission request"
          : "Companion question"
      }
    >
      <header>
        <span className="question-symbol">
          <Icon name={question.kind === "permission" ? "shield" : "chat"} />
        </span>
        <div>
          <h3>{question.title}</h3>
          {question.description && <p>{question.description}</p>}
        </div>
      </header>
      {question.kind === "question" && (
        <>
          <div
            className="question-choices"
            role="radiogroup"
            aria-label={question.title}
          >
            {question.options?.map((option, i) => (
              <button
                type="button"
                role="radio"
                aria-checked={choice === option.value && !custom}
                key={option.value}
                onClick={() => {
                  setChoice(option.value);
                  setCustom("");
                }}
              >
                <kbd>{i + 1}</kbd>
                <span>
                  <strong>{option.label}</strong>
                  {option.description && <small>{option.description}</small>}
                </span>
                <i aria-hidden="true" />
              </button>
            ))}
          </div>
          <input
            aria-label="Your answer"
            placeholder="Write another answer…"
            value={custom}
            onChange={(e) => {
              setCustom(e.target.value);
              setChoice("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && custom.trim()) {
                e.preventDefault();
                question.resolve(custom.trim());
              }
            }}
          />
        </>
      )}
      <footer>
        <small>
          {question.kind === "permission"
            ? "Your choice applies to this action"
            : question.options?.length
              ? "Use a number to choose · Enter to send"
              : "A short answer is enough"}
        </small>
        <div>
          <button
            type="button"
            className="quiet"
            onClick={() => question.resolve(null)}
          >
            {question.kind === "permission" ? "Deny" : "Skip"}
          </button>
          <button
            type="button"
            className="primary"
            disabled={question.kind === "question" && !choice && !custom.trim()}
            onClick={() =>
              question.resolve(
                question.kind === "permission"
                  ? "allow"
                  : custom.trim() || choice,
              )
            }
          >
            {question.kind === "permission" ? "Allow" : "Send"}
          </button>
        </div>
      </footer>
    </section>
  );
}
