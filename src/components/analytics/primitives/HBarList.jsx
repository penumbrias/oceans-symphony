import React from "react";

// Horizontal bar list — the workhorse chart of the new analytics.
// Chosen over pies/verticals because horizontal bars with DIRECT value
// labels are the most accessible chart family (screen-reader friendly,
// no legend cross-referencing, readable with 30+ rows on a phone).
//
// Accessibility: color is never the only encoding — every row carries its
// label + value as text; low-contrast user-chosen colors get a subtle
// ring so the bar edge stays visible on any theme.
//
// rows: [{ id, label, value, displayValue?, color?, sub?, leading? }]
//   value        — numeric, drives bar width
//   displayValue — text shown at the right (defaults to value)
//   leading      — optional ReactNode before the label (e.g. avatar)
export default function HBarList({
  rows = [],
  max = null,
  emptyText = "Nothing here for this period.",
  onRowClick = null,
  className = "",
}) {
  if (!rows.length) {
    return <p className={`text-xs text-muted-foreground py-4 text-center ${className}`}>{emptyText}</p>;
  }
  const maxValue = max ?? Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className={`space-y-1.5 ${className}`} role="list">
      {rows.map((r) => {
        const widthPct = maxValue > 0 ? Math.max(2, (r.value / maxValue) * 100) : 2;
        const Row = onRowClick ? "button" : "div";
        return (
          <Row
            key={r.id}
            role="listitem"
            {...(onRowClick ? { type: "button", onClick: () => onRowClick(r), className: "w-full text-left" } : {})}
          >
            <div className="flex items-center gap-2">
              {r.leading}
              <span className="text-xs font-medium text-foreground truncate flex-1 min-w-0">{r.label}</span>
              <span className="text-xs tabular-nums text-muted-foreground flex-shrink-0">{r.displayValue ?? r.value}</span>
            </div>
            <div className="mt-0.5 h-2 rounded-full bg-muted/40 overflow-hidden">
              <div
                className="h-full rounded-full ring-1 ring-inset ring-black/10 dark:ring-white/10"
                style={{ width: `${widthPct}%`, backgroundColor: r.color || "hsl(var(--primary))" }}
              />
            </div>
            {r.sub && <p className="mt-0.5 text-[0.625rem] text-muted-foreground">{r.sub}</p>}
          </Row>
        );
      })}
    </div>
  );
}
