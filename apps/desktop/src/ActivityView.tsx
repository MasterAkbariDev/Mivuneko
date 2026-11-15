import { CustomSelect } from "./CustomSelect";
import { useState } from "react";
import { Icon } from "./Icon";
export function ActivityView({
  entries,
  onClear,
}: {
  entries: string[];
  onClear: () => void;
}) {
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all");
  const category = (line: string) =>
    /file|\.js|\.py|folder|saving|reading/i.test(line)
      ? "files"
      : /app|launch|browser|page/i.test(line)
        ? "apps"
        : "companion";
  const shown = entries.filter(
    (e) =>
      e.toLowerCase().includes(query.toLowerCase()) &&
      (filter === "all" || category(e) === filter),
  );
  function download() {
    const url = URL.createObjectURL(
      new Blob([entries.join("\n")], { type: "text/plain" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "mivuneko-activity.txt";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="activity-view">
      <div className="activity-toolbar">
        <CustomSelect
          aria-label="Activity filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">All activity</option>
          <option value="files">Files</option>
          <option value="apps">Apps & websites</option>
          <option value="companion">Companion</option>
        </CustomSelect>
        <input
          aria-label="Search activity"
          placeholder="Search activity"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button onClick={download}>Export log</button>
        <button onClick={onClear}>Delete log</button>
      </div>
      <h3>Today</h3>
      <div className="activity-list">
        {shown.length ? (
          shown.map((line, i) => {
            const [time, ...rest] = line.split(" · ");
            const title = rest.join(" · ") || line;
            return (
              <details key={i}>
                <summary>
                  <span className="activity-symbol">
                    <Icon
                      name={
                        category(line) === "files"
                          ? "window"
                          : category(line) === "apps"
                            ? "link"
                            : "activity"
                      }
                    />
                  </span>
                  <strong>{title}</strong>
                  <time>{rest.length ? time : ""}</time>
                  <Icon name="chevron" />
                </summary>
                <p>{line}</p>
              </details>
            );
          })
        ) : (
          <p className="empty-activity">No tools have run this session.</p>
        )}
      </div>
    </div>
  );
}
