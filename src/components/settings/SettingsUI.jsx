import React, { useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";

// Shared, minimal building blocks for the Settings menu so every section
// reads the same: a clean collapsible SubSection, consistent field labels,
// and icon-only action buttons. Keeps the whole menu visually uniform instead
// of the old card-vs-bare-div / text-button patchwork.

// Icon-only action button (upload / assets / remove …). The `title` doubles as
// the tooltip + accessible label, so the glyph alone is enough.
export function iconBtnClass(danger = false) {
  return `inline-flex items-center justify-center w-8 h-8 rounded-md border border-border/60 transition-colors flex-shrink-0 ${
    danger
      ? "text-muted-foreground hover:text-destructive hover:border-destructive/40"
      : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
  }`;
}

export function IconButton({ icon: Icon, title, onClick, danger = false, busy = false, disabled = false }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled || busy}
      className={`${iconBtnClass(danger)} ${disabled ? "opacity-50" : ""}`}
    >
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
    </button>
  );
}

// A label + optional hint + control, with consistent spacing. Use for every
// titled control so labels/hints look the same everywhere.
export function Field({ label, hint, htmlFor, children, className = "" }) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && (
        <label htmlFor={htmlFor} className="block text-sm font-medium text-foreground">{label}</label>
      )}
      {hint && <p className="text-xs text-muted-foreground leading-snug">{hint}</p>}
      {children}
    </div>
  );
}

// A collapsible subsection inside a Section — collapsed by default, with a
// clearly-delineated header (uppercase label + chevron) and a divider above
// the body. This is the unit that gives the menu its tidy, scannable rhythm.
export function SubSection({ title, hint, icon: Icon, defaultOpen = false, right = null, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-border/40 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-3 py-2.5 bg-muted/15 hover:bg-muted/30 transition-colors text-left"
      >
        {Icon && <Icon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
        <span className="flex-1 text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">{title}</span>
        {right}
        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-3 py-3 space-y-3 border-t border-border/30">
          {hint && <p className="text-xs text-muted-foreground leading-snug">{hint}</p>}
          {children}
        </div>
      )}
    </div>
  );
}
