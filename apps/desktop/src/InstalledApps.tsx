import { useEffect, useState } from "react";
import type { AppInfo } from "../../../packages/shared-schemas/index.ts";
import { broker } from "./broker";
export function InstalledApps({
  onClose,
  onRequest,
}: {
  onClose: () => void;
  onRequest: (app: AppInfo) => void;
}) {
  const [apps, setApps] = useState<AppInfo[]>([]),
    [query, setQuery] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    void broker
      .listApps()
      .then((value) => {
        if (alive) setApps(value);
      })
      .catch((e) => {
        if (alive) setError(String(e));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);
  return (
    <div className="scrim">
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="apps-title"
      >
        <h2 id="apps-title">Installed apps</h2>
        <label>
          Find an app
          <input
            autoFocus
            className="app-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Telegram, Notes, Calculator…"
          />
        </label>
        <p className="hint">
          Choose an app, then approve its launch. No app opens from this list
          alone.
        </p>
        {loading ? <p role="status">Discovering apps…</p> : null}
        {error ? <p role="alert">{error}</p> : null}
        <div className="installed-list">
          {apps
            .filter((a) =>
              a.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
            )
            .map((app) => (
              <button
                key={app.id}
                onClick={() => onRequest(app)}
                aria-label={`Request ${app.name}`}
              >
                <strong>{app.name}</strong>
                <small>{app.location ?? "Browser simulation"}</small>
              </button>
            ))}
        </div>
        {!loading && !apps.length ? (
          <p>No supported installed apps were found.</p>
        ) : null}
        <button onClick={onClose}>Close apps</button>
      </section>
    </div>
  );
}
