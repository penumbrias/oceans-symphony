// One kind of text (body or headings): font, size, style and, where the
// editor has one, colour — the same rows in the same order for both, so
// the two cards read as a pair. Shared by Display options and the widget
// options sheet so text is edited the same way everywhere.
import React from "react";
import { Minus, Plus } from "lucide-react";

export function Stepper({ label, valueLabel, canDown, canUp, onDown, onUp }) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      <button type="button" onClick={onDown} disabled={!canDown} aria-label={`${label} smaller`}
        className="w-8 h-8 rounded-lg border border-border/60 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-40">
        <Minus className="w-3.5 h-3.5" />
      </button>
      <span className="w-12 text-center text-xs tabular-nums" aria-live="polite">{valueLabel}</span>
      <button type="button" onClick={onUp} disabled={!canUp} aria-label={`${label} larger`}
        className="w-8 h-8 rounded-lg border border-border/60 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-40">
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// `style.stacked` puts a wide style control (a row of chips) under its
// label instead of beside it. `colour` is optional: { label, control }.
export default function TextCard({ title, font, size, style, colour, footer }) {
  return (
    <div className="rounded-xl border border-border/50 p-2.5 space-y-2">
      <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">{font.select}</div>
        {font.upload}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium flex-1">{size.label}</span>
        <Stepper {...size} />
      </div>
      {style.stacked ? (
        <div className="space-y-1">
          <span className="text-xs font-medium block">{style.label}</span>
          {style.control}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium flex-1">{style.label}</span>
          {style.control}
        </div>
      )}
      {colour && (
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium flex-1">{colour.label}</span>
          {colour.control}
        </div>
      )}
      {footer}
    </div>
  );
}
