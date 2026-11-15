import {
  Children,
  Fragment,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type SelectHTMLAttributes,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";
type Choice = { value: string; label: ReactNode; disabled: boolean };
export function CustomSelect({
  children,
  onChange,
  value,
  defaultValue,
  disabled,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  const options: Choice[] = [];
  function collect(nodes: ReactNode) {
    Children.forEach(nodes, (node) => {
      if (!isValidElement(node)) return;
      const p = node.props as any;
      if (node.type === Fragment || node.type === "optgroup")
        collect(p.children);
      else if (node.type === "option")
        options.push({
          value: String(p.value ?? p.children),
          label: p.children,
          disabled: !!p.disabled,
        });
    });
  }
  collect(children);
  const [open, setOpen] = useState(false),
    [index, setIndex] = useState(0),
    [internal, setInternal] = useState(
      String(defaultValue ?? options[0]?.value ?? ""),
    ),
    [rect, setRect] = useState({ left: 0, top: 0, width: 0, maxHeight: 280 });
  const selected = String(value ?? internal),
    id = useId(),
    anchor = useRef<HTMLDivElement>(null),
    native = useRef<HTMLSelectElement>(null),
    menu = useRef<HTMLDivElement>(null),
    button = useRef<HTMLButtonElement>(null);
  const current = options.find((o) => o.value === selected);
  function choose(i: number) {
    const o = options[i];
    if (!o || o.disabled || disabled) return;
    setInternal(o.value);
    if (native.current) {
      native.current.value = o.value;
      onChange?.({
        target: native.current,
        currentTarget: native.current,
      } as ChangeEvent<HTMLSelectElement>);
    }
    setOpen(false);
    button.current?.focus();
  }
  function show() {
    if (disabled) return;
    const r = anchor.current!.getBoundingClientRect(),
      height = Math.min(280, options.length * 38 + 12),
      below = innerHeight - r.bottom - 12;
    setRect({
      left: Math.max(8, Math.min(r.left, innerWidth - r.width - 8)),
      top:
        below >= Math.min(height, 160)
          ? r.bottom + 6
          : Math.max(8, r.top - height - 6),
      width: r.width,
      maxHeight: Math.max(
        100,
        Math.min(280, below >= 160 ? below : r.top - 14),
      ),
    });
    setIndex(
      Math.max(
        0,
        options.findIndex((o) => o.value === selected),
      ),
    );
    setOpen(true);
  }
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (
        !anchor.current?.contains(e.target as Node) &&
        !menu.current?.contains(e.target as Node)
      )
        setOpen(false);
    };
    const close = () => setOpen(false);
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", close);
    const scroll = (e: Event) => {
      if (!menu.current?.contains(e.target as Node)) close();
    };
    window.addEventListener("scroll", scroll, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", scroll, true);
    };
  }, [open]);
  useEffect(() => {
    menu.current
      ?.querySelector(`[data-index="${index}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [index, open]);
  return (
    <div
      className={`custom-select ${disabled ? "is-disabled" : ""}`}
      ref={anchor}
    >
      <select
        {...props}
        value={selected}
        disabled={disabled}
        ref={native}
        onChange={(e) => {
          setInternal(e.target.value);
          onChange?.(e);
        }}
        className="select-native"
        tabIndex={-1}
      >
        {children}
      </select>
      <button
        ref={button}
        type="button"
        className="select-trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={(e) => {
          if (
            ["ArrowDown", "ArrowUp", "Home", "End", "Escape"].includes(e.key)
          ) {
            e.preventDefault();
            if (e.key === "Escape") {
              setOpen(false);
              return;
            }
            if (!open) {
              show();
              return;
            }
            let n =
              e.key === "Home"
                ? 0
                : e.key === "End"
                  ? options.length - 1
                  : Math.max(
                      0,
                      Math.min(
                        options.length - 1,
                        index + (e.key === "ArrowDown" ? 1 : -1),
                      ),
                    );
            while (options[n]?.disabled && n > 0 && n < options.length - 1)
              n += e.key === "ArrowUp" ? -1 : 1;
            setIndex(n);
          } else if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            open ? choose(index) : show();
          } else if (e.key === "Tab") setOpen(false);
          else if (e.key.length === 1) {
            const n = options.findIndex(
              (o) =>
                !o.disabled &&
                String(o.label).toLowerCase().startsWith(e.key.toLowerCase()),
            );
            if (n >= 0) {
              if (!open) show();
              setIndex(n);
            }
          }
        }}
      >
        <span>{current?.label ?? "Choose…"}</span>
        <Icon name="chevron" />
      </button>
      {open &&
        createPortal(
          <div
            className="select-popover"
            ref={menu}
            id={id}
            role="listbox"
            aria-label={props["aria-label"] ?? "Options"}
            style={{
              left: rect.left,
              top: rect.top,
              width: rect.width,
              maxHeight: rect.maxHeight,
            }}
          >
            {options.map((o, i) => (
              <button
                type="button"
                role="option"
                key={o.value}
                aria-selected={o.value === selected}
                disabled={o.disabled}
                data-index={i}
                className={index === i ? "is-highlighted" : ""}
                onPointerMove={() => setIndex(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(i)}
              >
                <span>{o.label}</span>
                {o.value === selected && (
                  <span className="select-check">✓</span>
                )}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
