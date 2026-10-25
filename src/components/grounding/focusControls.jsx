import { X } from "lucide-react";

// Small pieces the Quick Support tools share between their own screen and
// their full-screen focus view, so a setting looks and works the same in
// both places.

export function Chips({ options, value, onChange, disabled }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={`px-2.5 py-1 rounded-full text-xs transition-colors disabled:opacity-50 ${
            value === o.value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Row({ label, value, children }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-foreground">{label}</span>
        {value != null && <span className="text-muted-foreground tabular-nums">{value}</span>}
      </div>
      {children}
    </div>
  );
}

// A titled group inside the focus settings sheet.
export function SheetSection({ title, children }) {
  return (
    <section className="space-y-3 py-4 first:pt-1 border-b border-border/40 last:border-b-0">
      {title && <h3 className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>}
      {children}
    </section>
  );
}

// The settings sheet a focus view opens over itself: slides up from the
// bottom, scrolls on its own, and keeps taps from reaching the drawing or
// the visual underneath. The view keeps running behind it, so every change
// is seen straight away.
export function FocusSettingsSheet({ title, onClose, children }) {
  const stop = (e) => e.stopPropagation();
  return (
    <div className="absolute inset-0 z-10 flex flex-col justify-end" onClick={stop} onPointerDown={stop}>
      <button type="button" aria-label="Close settings" className="absolute inset-0 bg-black/30 cursor-default" onClick={onClose} />
      <div
        role="dialog"
        aria-label={title}
        className="relative mx-auto w-full max-w-lg rounded-t-2xl border border-border/60 bg-card/95 backdrop-blur shadow-2xl flex flex-col"
        style={{ maxHeight: "calc(78vh - var(--os-sat, 0px))" }}
      >
        <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-border/40">
          <span className="w-10 h-1 rounded-full bg-muted-foreground/30 absolute left-1/2 -translate-x-1/2 top-1.5" aria-hidden />
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Done"
            className="flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground">
            <X className="w-3.5 h-3.5" /> Done
          </button>
        </div>
        <div className="overflow-y-auto overscroll-contain px-4" style={{ paddingBottom: "calc(var(--os-sab, 0px) + 16px)" }}>
          {children}
        </div>
      </div>
    </div>
  );
}
