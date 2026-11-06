// The one control for switching between views or pages of a screen (UI
// critique H1, v0.364.10). Underlined, scrolls sideways, never wraps.
//
// Two idioms only, app-wide:
//  - PageStrip: which part of the screen you see (Analytics' Overview /
//    Fronting…, Journals' All / Switch logs, a board's pages).
//  - Segmented (SettingRows.jsx): choosing a VALUE (Day / Week / Month).
// The inspector's fixed TabBar is the option-menu version of this strip.
//
//   <PageStrip label="Analytics views" value={tab} onChange={setTab}
//     items={[{ id: "overview", label: "Overview" }, { id: "life", label: "Life", icon: Leaf }]} />

import React, { useRef } from "react";

export default function PageStrip({ items = [], value, onChange, label = "Views", tour, className = "", sticky = false, children, ...rest }) {
  const ref = useRef(null);
  const onKeyDown = (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const i = items.findIndex((it) => it.id === value);
    const next = items[(i + (e.key === "ArrowRight" ? 1 : -1) + items.length) % items.length];
    if (!next) return;
    e.preventDefault();
    onChange?.(next.id);
    requestAnimationFrame(() => ref.current?.querySelector(`[data-strip-id="${CSS.escape(String(next.id))}"]`)?.focus());
  };
  return (
    <div
      ref={ref}
      role="tablist"
      aria-label={label}
      data-tour={tour}
      onKeyDown={onKeyDown}
      className={`os-page-strip flex items-stretch overflow-x-auto scrollbar-none border-b border-border/60 ${sticky ? "sticky top-0 bg-background z-10" : ""} ${className}`}
      {...rest}
    >
      {items.map((it) => {
        const on = it.id === value;
        const Icon = it.icon;
        return (
          <button
            key={it.id}
            type="button"
            role="tab"
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            data-strip-id={it.id}
            data-tour={it.tour}
            onClick={() => onChange?.(it.id)}
            className={`flex-1 min-w-max flex items-center justify-center gap-1.5 px-4 min-h-[44px] text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
              on ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {Icon && <Icon className="w-4 h-4 flex-shrink-0" />}
            <span>{it.label}</span>
            {it.count != null && <span className="text-xs text-muted-foreground">{it.count}</span>}
          </button>
        );
      })}
      {children}
    </div>
  );
}
