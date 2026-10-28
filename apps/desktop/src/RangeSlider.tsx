import type { CSSProperties, InputHTMLAttributes } from "react";

export function RangeSlider(props: InputHTMLAttributes<HTMLInputElement>) {
  const min = Number(props.min ?? 0),
    max = Number(props.max ?? 100);
  const value = Number(props.value ?? min);
  const fill =
    max > min && Number.isFinite(value)
      ? Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100))
      : 0;
  return (
    <input
      {...props}
      type="range"
      className={`range-control ${props.className ?? ""}`}
      style={{ ...props.style, "--range-fill": `${fill}%` } as CSSProperties}
    />
  );
}
