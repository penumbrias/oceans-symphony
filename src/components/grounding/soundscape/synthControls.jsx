import { useRef, useState } from "react";

// Hardware-style controls for the Soundscape: a dark faceplate, modules
// with printed labels, rotary knobs, keys with LEDs, and a small LCD.
// Everything is drawn from the theme tokens, so it follows light / dark
// and custom themes. Knobs are sliders underneath (role="slider", arrow
// keys, Page Up/Down, Home/End), dragged up/right to turn up.

export function SynthPanel({ name = "SS-1", subtitle, children, className = "" }) {
  return (
    <div
      className={`rounded-xl border border-border/70 p-3 space-y-3 ${className}`}
      style={{
        background: "linear-gradient(180deg, hsl(var(--muted) / 0.9) 0%, hsl(var(--card)) 38%, hsl(var(--muted) / 0.65) 100%)",
        boxShadow: "inset 0 1px 0 hsl(var(--foreground) / 0.08), inset 0 -1px 0 hsl(var(--background) / 0.6), 0 1px 2px hsl(var(--background) / 0.4)",
      }}
    >
      <div className="flex items-baseline justify-between px-0.5">
        <span className="font-mono text-[0.6875rem] font-bold tracking-[0.25em] text-foreground/80">{name}</span>
        {subtitle && <span className="text-[0.625rem] uppercase tracking-[0.18em] text-muted-foreground">{subtitle}</span>}
      </div>
      {children}
    </div>
  );
}

export function Module({ title, right, children }) {
  return (
    <section className="rounded-lg border border-border/50 bg-background/30 p-2.5 space-y-2.5" style={{ boxShadow: "inset 0 1px 3px hsl(var(--background) / 0.5)" }}>
      <div className="flex items-center gap-2">
        <span className="text-[0.625rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground whitespace-nowrap">{title}</span>
        <span className="h-px flex-1 bg-border/60" />
        {right}
      </div>
      {children}
    </section>
  );
}

export function Lcd({ lines, className = "" }) {
  return (
    <div
      className={`rounded-md border border-border/60 px-3 py-2 font-mono text-[0.75rem] leading-snug overflow-hidden ${className}`}
      style={{
        background: "repeating-linear-gradient(0deg, hsl(var(--primary) / 0.04) 0 1px, transparent 1px 3px), hsl(var(--background))",
        color: "hsl(var(--primary))",
        textShadow: "0 0 6px hsl(var(--primary) / 0.45)",
        boxShadow: "inset 0 2px 6px hsl(var(--background) / 0.9)",
      }}
      aria-live="polite"
    >
      {lines.map((l, i) => (
        <div key={i} className={`truncate ${i ? "opacity-75" : ""}`}>{l || " "}</div>
      ))}
    </div>
  );
}

// A key with an LED. `active` lights it.
export function LedKey({ active, onClick, children, disabled, title }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={!!active}
      className="relative flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-md border px-2.5 py-1.5 text-[0.6875rem] font-medium tracking-wide transition-colors disabled:opacity-40 active:translate-y-px"
      style={{
        borderColor: "hsl(var(--border))",
        background: active
          ? "linear-gradient(180deg, hsl(var(--muted)) 0%, hsl(var(--card)) 100%)"
          : "linear-gradient(180deg, hsl(var(--card)) 0%, hsl(var(--muted) / 0.7) 100%)",
        boxShadow: active
          ? "inset 0 1px 3px hsl(var(--background) / 0.7)"
          : "0 1px 0 hsl(var(--background) / 0.6), inset 0 1px 0 hsl(var(--foreground) / 0.07)",
        color: active ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))",
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{
          background: active ? "hsl(var(--primary))" : "hsl(var(--muted-foreground) / 0.3)",
          boxShadow: active ? "0 0 5px hsl(var(--primary))" : "none",
        }}
      />
      {children}
    </button>
  );
}

export function KeyRow({ options, value, onChange, disabled }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <LedKey key={String(o.value)} active={value === o.value} onClick={() => onChange(o.value)} disabled={disabled} title={o.title}>
          {o.label}
        </LedKey>
      ))}
    </div>
  );
}

// A rotary knob over an integer position min..max. `display` turns the
// position into the readout text; `onTouch` lets the panel's LCD show
// what's being turned.
const SWEEP = 270; // degrees from fully down to fully up
export function Knob({ label, pos, min = 0, max = 1000, step = 1, onChange, display, onTouch, size = 46 }) {
  const drag = useRef(null);
  const [active, setActive] = useState(false);
  const frac = (pos - min) / (max - min || 1);
  const angle = -SWEEP / 2 + frac * SWEEP;
  const set = (v) => {
    const snapped = Math.round(Math.min(max, Math.max(min, v)) / step) * step;
    if (snapped !== pos) onChange(snapped);
    onTouch?.(label, display(snapped));
  };
  const onPointerDown = (e) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, start: pos };
    setActive(true);
    onTouch?.(label, display(pos));
  };
  const onPointerMove = (e) => {
    if (!drag.current) return;
    // Up or right turns it up; about 220px of travel covers the range.
    const d = (e.clientX - drag.current.x) - (e.clientY - drag.current.y);
    set(drag.current.start + (d / 220) * (max - min));
  };
  const end = () => { drag.current = null; setActive(false); };
  const onKeyDown = (e) => {
    const big = Math.max(step, (max - min) / 10);
    const small = Math.max(step, (max - min) / 100);
    const map = { ArrowUp: small, ArrowRight: small, ArrowDown: -small, ArrowLeft: -small, PageUp: big, PageDown: -big };
    if (e.key in map) { e.preventDefault(); set(pos + map[e.key]); }
    else if (e.key === "Home") { e.preventDefault(); set(min); }
    else if (e.key === "End") { e.preventDefault(); set(max); }
  };
  const r = size / 2;
  const arc = (from, to) => {
    const p = (a) => {
      const rad = ((a - 90) * Math.PI) / 180;
      return [r + (r - 3) * Math.cos(rad), r + (r - 3) * Math.sin(rad)];
    };
    const [x1, y1] = p(from), [x2, y2] = p(to);
    return `M ${x1} ${y1} A ${r - 3} ${r - 3} 0 ${to - from > 180 ? 1 : 0} 1 ${x2} ${y2}`;
  };
  return (
    <div className="flex flex-col items-center gap-1 min-w-0" style={{ width: size + 22 }}>
      <div
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={pos}
        aria-valuetext={display(pos)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={end}
        onPointerCancel={end}
        onKeyDown={onKeyDown}
        onFocus={() => onTouch?.(label, display(pos))}
        className="relative cursor-grab active:cursor-grabbing rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary"
        style={{ width: size, height: size, touchAction: "none" }}
      >
        <svg width={size} height={size} className="absolute inset-0" aria-hidden="true">
          <path d={arc(-SWEEP / 2, SWEEP / 2)} fill="none" stroke="hsl(var(--border))" strokeWidth="2.5" strokeLinecap="round" />
          {frac > 0.002 && (
            <path d={arc(-SWEEP / 2, angle)} fill="none" stroke="hsl(var(--primary))" strokeWidth="2.5" strokeLinecap="round"
              style={{ filter: active ? "drop-shadow(0 0 3px hsl(var(--primary)))" : "none" }} />
          )}
        </svg>
        <div
          className="absolute rounded-full"
          style={{
            inset: 6,
            background: "radial-gradient(circle at 35% 30%, hsl(var(--foreground) / 0.22) 0%, hsl(var(--muted)) 45%, hsl(var(--background)) 100%)",
            boxShadow: "0 2px 4px hsl(var(--background) / 0.8), inset 0 1px 0 hsl(var(--foreground) / 0.15)",
            transform: `rotate(${angle}deg)`,
          }}
        >
          <span className="absolute left-1/2 top-[3px] w-[2px] h-[30%] -translate-x-1/2 rounded-full" style={{ background: "hsl(var(--foreground) / 0.85)" }} />
        </div>
      </div>
      <span className="text-[0.5625rem] font-semibold uppercase tracking-wider text-muted-foreground text-center leading-tight">{label}</span>
      <span className="text-[0.625rem] font-mono tabular-nums text-foreground/80 text-center leading-none truncate max-w-full">{display(pos)}</span>
    </div>
  );
}

export function KnobRow({ children }) {
  return <div className="flex flex-wrap justify-around gap-x-1 gap-y-3">{children}</div>;
}

// A labelled LED switch (on/off).
export function LedSwitch({ label, checked, onChange, hint }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs min-w-0">
        <span className="font-medium text-foreground block">{label}</span>
        {hint && <span className="text-muted-foreground text-[0.6875rem]">{hint}</span>}
      </span>
      <LedKey active={checked} onClick={() => onChange(!checked)}>{checked ? "On" : "Off"}</LedKey>
    </div>
  );
}
