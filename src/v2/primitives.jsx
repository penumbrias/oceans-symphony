// UI v2 primitives — the entire component vocabulary of the new shell.
//
// Deliberately tiny: pages are built from Page > Section > Row and almost
// nothing else. New primitives are added only when a pattern repeats on a
// second page. No decoration; sizing/spacing/borders read the --v2-*
// customization tokens so everything here is user-tunable by construction.

import React from "react";

// The display mode a widget is rendering at, so shared primitives can
// answer it without every widget threading the prop through. Widgets that
// implement their own minimal/expanded rendering just ignore this.
export const WidgetModeContext = React.createContext("normal");
export const useWidgetMode = () => React.useContext(WidgetModeContext);

// "How many rows at this size" — one rule instead of each widget guessing:
// minimal keeps it short, expanded shows about twice as much.
export function rowsForMode(mode, base) {
  const n = Math.max(1, parseInt(base, 10) || 5);
  if (mode === "minimal") return Math.max(1, Math.min(3, n));
  if (mode === "expanded") return n * 2;
  return n;
}

export function Page({ title, sub, children }) {
  return (
    <div className="py-3" style={{ display: "flex", flexDirection: "column", gap: "calc(var(--v2-space, 6px) * 2)" }}>
      {title && (
        <header>
          <h1 className="text-lg font-semibold leading-tight">{title}</h1>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </header>
      )}
      {children}
    </div>
  );
}

// THE visible box (widget contract, docs/widget-contract.md): the one
// element per widget that consumes the box look variables. Section spreads
// it; tile-shaped widgets (app tiles, folders, quick links) spread it on
// their own root. `borderFallback: false` is for tiles, which are
// borderless until the user asks for a border.
export function boxStyle({ borderFallback = true, padFallback = true } = {}) {
  return {
    borderWidth: borderFallback ? "var(--v2-border-w, 1px)" : "var(--v2-border-w, 0px)",
    borderStyle: "var(--v2-border-style, solid)",
    borderColor: borderFallback
      ? "var(--v2-border-color, hsl(var(--border) / 0.6))"
      : "var(--v2-border-color, transparent)",
    borderRadius: "var(--v2-radius, 8px)",
    boxShadow: "var(--v2-shadow, none)",
    background: "var(--v2-widget-bg, transparent)",
    // padFallback: false = flush until the user sets padding (text widgets).
    padding: padFallback ? "var(--v2-pad, calc(var(--v2-space, 6px) * 1.5))" : "var(--v2-pad, 0px)",
  };
}

export function Section({ label, action, center, children }) {
  return (
    // Fills whatever box it's given — a widget resized taller should LOOK
    // taller, not sit content-sized inside a bigger empty cell. min-h-0 so
    // the list below can scroll instead of forcing the box open.
    <section className="h-full flex flex-col min-h-0" style={boxStyle()}>
      {(label || action) && (
        <div className="flex items-baseline justify-between mb-1 flex-shrink-0">
          <h2 className="text-[0.6875em] font-semibold uppercase tracking-wide text-muted-foreground">{label}</h2>
          {action}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto"
        style={{
          display: "flex", flexDirection: "column",
          gap: "calc(var(--v2-space, 6px) * 0.75)",
          // For non-list content (the breathing circle) that should sit in
          // the middle of the box rather than stack from the top.
          ...(center ? { alignItems: "center", justifyContent: "center" } : null),
        }}>
        {children}
      </div>
    </section>
  );
}

// One list row: [left] primary — secondary [right]. Tappable if onClick.
export function Row({ left, primary, secondary, right, onClick, title }) {
  const Tag = onClick ? "button" : "div";
  // Minimal means the answer and nothing else: no icon or avatar column, no
  // qualifier. The row keeps its name and its right-hand value.
  const mode = useWidgetMode();
  if (mode === "minimal") { left = null; secondary = null; }
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      title={title}
      className={`flex items-center gap-2 text-left w-full min-h-[32px] ${onClick ? "hover:bg-muted/40 -mx-1 px-1" : ""}`}
      style={onClick ? { borderRadius: "var(--v2-radius, 8px)" } : undefined}
    >
      {left}
      {/* The name is what identifies the row, so it keeps the space and the
          qualifier is the first thing to give way in a narrow widget. */}
      <span className="text-sm truncate min-w-0">{primary}</span>
      {secondary && <span className="text-xs text-muted-foreground truncate shrink-[3] min-w-0">{secondary}</span>}
      {right && <span className="ml-auto text-xs text-muted-foreground flex-shrink-0 tabular-nums">{right}</span>}
    </Tag>
  );
}

export function Muted({ children }) {
  return <p className="text-xs text-muted-foreground">{children}</p>;
}

// Small inline text button — the only action style on v2 pages.
export function TextAction({ onClick, children }) {
  return (
    <button type="button" onClick={onClick}
      className="text-xs font-medium text-primary hover:underline">
      {children}
    </button>
  );
}

// Colored presence dot (member color).
export function Dot({ color, active = true, ring = false }) {
  const c = color || "hsl(var(--muted-foreground))";
  return (
    <span aria-hidden="true" className="w-2 h-2 rounded-full flex-shrink-0"
      style={{
        background: c,
        opacity: active ? 1 : 0.4,
        // A ring is how a row says "this one leads" without spending words.
        boxShadow: ring ? `0 0 0 2px color-mix(in srgb, ${c} 45%, transparent)` : undefined,
      }} />
  );
}
