import { Markdown } from "./Markdown";
import guide from "../../../docs/CHARACTER_PACKS.md?raw";
export function CharacterGuide({ onBack }: { onBack: () => void }) {
  return (
    <section
      className="character-pack-guide page"
      aria-label="Character design system"
    >
      <div className="guide-hero">
        <span className="eyebrow">CREATOR HANDBOOK</span>
        <h2>Build a character that feels alive</h2>
        <p>
          One explicit pack format for illustrations, depth layers and VRM
          avatars, with independent library slots and voice identities.
        </p>
        <button onClick={onBack}>Back to Characters</button>
      </div>
      <figure>
        <img
          src="/guide/pack-pipeline.svg"
          alt="Character JSON and assets are validated, assigned a new device ID and rendered with an explicit voice definition"
        />
      </figure>
      <figure>
        <img
          src="/guide/atlas-layout.svg"
          alt="A six-pose atlas with zero-based cell indices and shared foot anchors"
        />
      </figure>
      <figure className="guide-art-example">
        <img
          src="/characters/luna-atlas.png"
          alt="Luna's original six-pose transparent sprite sheet"
        />
        <figcaption>
          Artwork example: separate drawings in a three-column, two-row atlas.
          Your manifest defines their meanings.
        </figcaption>
      </figure>
      <Markdown text={guide} />
      <div className="guide-downloads">
        <a href="/examples/2d-character.json" download>
          Download 2D manifest
        </a>
        <a href="/examples/depth-character.json" download>
          Download 2.5D manifest
        </a>
        <a href="/examples/vrm-character.json" download>
          Download VRM manifest
        </a>
      </div>
    </section>
  );
}
