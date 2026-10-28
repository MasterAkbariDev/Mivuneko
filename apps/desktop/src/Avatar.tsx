import type { Mood } from "../../../packages/shared-schemas/index.ts";
export function Avatar({ mood }: { mood: Mood }) {
  return (
    <div className="avatar">
      <svg
        viewBox="0 0 280 280"
        role="img"
        aria-label={`Original mock cat avatar, ${mood}`}
      >
        <ellipse
          cx="140"
          cy="249"
          rx="75"
          ry="12"
          fill="#5EEAD4"
          opacity=".15"
        />
        <path
          d="M79 145 Q43 197 89 232 Q140 258 191 232 Q232 192 201 145"
          fill="#A78BFA"
        />
        <path
          d="M69 111 L61 31 L117 65 Q140 54 165 65 L218 31 L211 119 Q220 183 141 184 Q61 184 69 111"
          fill="#C4B5FD"
        />
        <path
          d="M77 56 L83 96 L105 74 M203 56 L196 96 L177 74"
          fill="#FB7185"
          opacity=".65"
        />
        <g stroke="#202944" strokeWidth="7" strokeLinecap="round" fill="none">
          <path d={mood === "sleeping" ? "M95 120 l18 0" : "M96 113 l0 13"} />
          <path d={mood === "sleeping" ? "M167 120 l18 0" : "M182 113 l0 13"} />
          <path
            d={
              mood === "concerned" ||
              mood === "error" ||
              mood === "angry" ||
              mood === "sad"
                ? "M127 151 Q140 139 153 151"
                : "M127 144 Q140 158 153 144"
            }
          />
        </g>
        <circle cx="89" cy="139" r="10" fill="#FB7185" opacity=".35" />
        <circle cx="191" cy="139" r="10" fill="#FB7185" opacity=".35" />
        <path
          d="M111 199 L140 218 L170 199"
          stroke="#5EEAD4"
          strokeWidth="10"
          fill="none"
        />
        <circle cx="140" cy="220" r="9" fill="#5EEAD4" />
      </svg>
      {["angry", "sad", "surprised", "celebrating"].includes(mood) && (
        <span
          className={`cat-effect effect-${mood}`}
          aria-label={`${mood} effect`}
        >
          {mood === "angry"
            ? "╬"
            : mood === "sad"
              ? "◞"
              : mood === "surprised"
                ? "!"
                : "✦"}
        </span>
      )}
    </div>
  );
}
