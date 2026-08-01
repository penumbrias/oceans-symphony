// UI v2 primitives — the entire component vocabulary of the new shell.
//
// Deliberately tiny: pages are built from Page > Section > Row and almost
// nothing else. New primitives are added only when a pattern repeats on a
// second page. No decoration; sizing/spacing/borders read the --v2-*
// customization tokens so everything here is user-tunable by construction.

import React from "react";

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

export function Section({ label, action, children }) {
  return (
    <section
      className="border-border/60"
      style={{
        borderWidth: "var(--v2-border-w, 1px)",
        borderRadius: "var(--v2-radius, 8px)",
        padding: "calc(var(--v2-space, 6px) * 1.5)",
      }}
    >
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">{label}</h2>
        {action}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "calc(var(--v2-space, 6px) * 0.75)" }}>
        {children}
      </div>
    </section>
  );
}

// One list row: [left] primary — secondary [right]. Tappable if onClick.
export function Row({ left, primary, secondary, right, onClick, title }) {
  const Tag = onClick ? "button" : "div";
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
