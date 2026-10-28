import { usePreferences } from "./preferences";
import { usePetSession } from "./session";
import { Luna } from "./Luna";
import { Icon } from "./Icon";
export function CompanionCard({ onSettings }: { onSettings: () => void }) {
  const prefs = usePreferences();
  const session = usePetSession();
  const status =
    prefs.petMode === "sleep"
      ? "Dreaming…"
      : prefs.petMode === "dance"
        ? "A little celebration"
        : prefs.focus || prefs.petMode === "focus"
          ? "Quiet time"
          : session.mood === "thinking"
            ? "Thinking with you…"
            : session.mood === "speaking"
              ? "Speaking"
              : "Here with you";
  return (
    <section className="companion-card" aria-label="Your companion">
      <div className="companion-art">
        <div className="companion-orbit" aria-hidden="true" />
        <Luna
          character={prefs.character}
          mood={session.mood}
          mouth={session.mouth}
          mode={prefs.petMode}
          expression={prefs.petExpression}
          effects={prefs.petEffects}
        />
      </div>
      <div className="companion-card-copy">
        <h2>
          Mivuneko<span>your little companion</span>
        </h2>
        <p className="presence">
          <span className="dot" />
          {status}
        </p>
        <p>Good company, a curious mind, and a little help when you need it.</p>
        <button className="companion-customize" onClick={onSettings}>
          <Icon name="settings" />
          Make it yours
          <Icon name="chevron" />
        </button>
      </div>
      <div className="companion-tip">
        <Icon name="cat" />
        <small>Double-click your desktop companion to open the app.</small>
      </div>
    </section>
  );
}
