// One chip per optional part of an editor: always present, toggles its
// section open and closed, and carries a dot while closed if that part
// holds something. The planner's editor (ActivityEditor) introduced it;
// the widget options sheet uses the same chip so the two read alike.
import React from "react";
import { Plus, Minus } from "lucide-react";

export default function DetailChip({ open, has, onToggle, label, icon }) {
  return (
    <button type="button" onClick={onToggle} aria-expanded={open}
      className={`text-xs px-2.5 py-1 rounded-full border flex items-center gap-1 ${
        open ? "text-[var(--v2-accent,var(--color-primary))] border-[var(--v2-accent,var(--color-primary))]" : "border-border/50 text-muted-foreground hover:text-foreground"
      }`}>
      {open ? <Minus className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
      {icon}{label}
      {!open && has && <span aria-hidden className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--v2-accent, var(--color-primary))" }} />}
    </button>
  );
}
