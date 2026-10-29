// The one row grammar for edit menus (v0.287.0, widget inspector).
//
// Every setting is one row: its name on the left, its control on the right,
// and the REAL current value always visible — an inherited value shows
// greyed (dashed) rather than as the words "app default". A row whose value
// is the widget's own grows a small × that clears just that value.
//
// Five controls cover everything:
//   SwitchRow   on / off
//   ChoiceRow   one of a few options (segmented when they fit on a line,
//               wrapping chips otherwise)
//   SliderRow   a number — an always-visible slider with the number beside
//               it; tap the number to type an exact value (Baymard / Apple:
//               a slider needs a field). The thumb only moves on a sideways
//               drag, so scrolling past it can't nudge it.
//   StepRow     − n + for a count with no useful range (rare: a size or a
//               "how many" with a min and max is a SliderRow — owner's call,
//               v0.288.0: "font size, row size things should be sliders")
//   ColourRow   a swatch that opens the shared colour picker
//   TabBar      the fixed tab strip across the top of an inspector
//
// Shared by the widget inspector, Display options and the add-widget
// library. docs/inspector-design-guide.md is the contract.
import React from "react";
import { Minus, Plus, X } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import ColorPicker from "@/components/shared/ColorPicker";

const isSet = (v) => v !== undefined && v !== null && v !== "";

// Name left, control right. `hint` is one short line under the name.
// `onClear` shows the × only when `own` is true.
export function Row({ label, hint, children, own = false, onClear, align = "center", className = "" }) {
  return (
    <div className={`flex gap-2 min-h-[44px] py-1.5 border-b border-border/30 last:border-b-0 ${align === "start" ? "items-start" : "items-center"} ${className}`}>
      <div className="flex-1 min-w-0 py-1">
        <span className="text-sm block leading-tight">{label}</span>
        {hint && <span className="text-[0.6875rem] text-muted-foreground block leading-tight mt-0.5">{hint}</span>}
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0 max-w-[70%]">
        {children}
        {onClear && own && (
          <button type="button" onClick={onClear} aria-label={`Clear ${label}`} title="Back to inherited"
            className="w-6 h-6 rounded-full border border-border/50 text-muted-foreground hover:text-foreground flex items-center justify-center flex-shrink-0">
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}

// A control that is too wide for the right-hand slot sits under its name.
export function StackedRow({ label, hint, children, own = false, onClear }) {
  return (
    <div className="py-1.5 border-b border-border/30 last:border-b-0">
      <div className="flex items-center gap-2 min-h-[32px]">
        <div className="flex-1 min-w-0">
          <span className="text-sm block leading-tight">{label}</span>
          {hint && <span className="text-[0.6875rem] text-muted-foreground block leading-tight mt-0.5">{hint}</span>}
        </div>
        {onClear && own && (
          <button type="button" onClick={onClear} aria-label={`Clear ${label}`} title="Back to inherited"
            className="w-6 h-6 rounded-full border border-border/50 text-muted-foreground hover:text-foreground flex items-center justify-center flex-shrink-0">
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
      <div className="pt-1.5">{children}</div>
    </div>
  );
}

// A small group heading inside a tab — larger step from the row labels than
// a bare caption, so a tab scans one group at a time.
export function Group({ title, children, first = false }) {
  return (
    <div className={first ? "" : "pt-4"}>
      <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground pb-1">{title}</p>
      <div>{children}</div>
    </div>
  );
}

export function SwitchRow({ label, hint, checked, onChange }) {
  return (
    <Row label={label} hint={hint}>
      <Switch checked={!!checked} onCheckedChange={(on) => onChange(on)} aria-label={label} />
    </Row>
  );
}

// Segmented bar: the one-question control.
// `equal`: every segment the same width (a bar on its own line). Beside a
// name the segments size to their words instead — equal shares truncated
// the bold (wider) active one to "24-h…".
export function Segmented({ label, options, value, onChange, className = "", equal = true }) {
  return (
    <div role="radiogroup" aria-label={label} className={`flex rounded-full border border-border/60 p-0.5 gap-0.5 ${className}`}>
      {options.map((o) => {
        const on = String(value) === String(o.value);
        return (
          <button key={String(o.value)} type="button" role="radio" aria-checked={on}
            onClick={() => onChange(o.value)}
            className={`${equal ? "flex-1 min-w-0 truncate" : "whitespace-nowrap"} text-xs py-1.5 px-2.5 rounded-full ${
              on ? "bg-primary/10 text-primary font-semibold" : "text-muted-foreground hover:text-foreground"
            }`}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// Fits beside a name on a phone: up to three short options. Up to five
// still fit a segmented bar on its own line; more than that wrap as chips.
const labelChars = (options = []) => options.reduce((n, o) => n + String(o.label).length, 0);
// The row's name counts too: "Content alignment" + Left/Center/Right is a
// line and a half on a phone, so that one stacks.
export const fitsBeside = (options = [], label = "") =>
  options.length > 1 && options.length <= 3 && labelChars(options) <= 16 && labelChars(options) + String(label).length <= 30;
export const fitsSegmented = (options = []) => options.length > 1 && options.length <= 5 && labelChars(options) <= 34;

export function Chips({ label, options, value, onChange, multiple = false, style }) {
  const arr = multiple ? (Array.isArray(value) ? value : (isSet(value) ? [value] : [])) : null;
  const isOn = (o) => (multiple ? arr.some((x) => String(x) === String(o.value)) : String(value) === String(o.value));
  const pick = (o) => {
    if (!multiple) return onChange(o.value);
    onChange(isOn(o) ? arr.filter((x) => String(x) !== String(o.value)) : [...arr, o.value]);
  };
  return (
    <div role={multiple ? "group" : "radiogroup"} aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={String(o.value)} type="button" aria-pressed={isOn(o)} onClick={() => pick(o)}
          style={style ? style(o) : undefined}
          className={`text-xs px-3 py-1.5 rounded-full border ${
            isOn(o) ? "border-primary/60 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground hover:text-foreground"
          }`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// One of a few options: segmented beside the name when it fits, chips under
// it otherwise. `own`/`onClear` behave as on Row.
export function ChoiceRow({ label, hint, options, value, onChange, own, onClear }) {
  if (fitsBeside(options, label)) {
    return (
      <Row label={label} hint={hint} own={own} onClear={onClear}>
        <Segmented label={label} options={options} value={value} onChange={onChange} className="max-w-full" equal={false} />
      </Row>
    );
  }
  return (
    <StackedRow label={label} hint={hint} own={own} onClear={onClear}>
      {fitsSegmented(options)
        ? <Segmented label={label} options={options} value={value} onChange={onChange} />
        : <Chips label={label} options={options} value={value} onChange={onChange} />}
    </StackedRow>
  );
}

// The number box beside a slider or stepper: tap to type, commit on blur or
// Enter. Dashed + grey while the value is inherited.
function ValueField({ label, value, inherited, min, max, unit, onCommit, width = "w-[4.25rem]" }) {
  const [text, setText] = React.useState(String(value));
  const [editing, setEditing] = React.useState(false);
  React.useEffect(() => { if (!editing) setText(String(value)); }, [value, editing]);
  const commit = () => {
    setEditing(false);
    const v = parseFloat(text);
    if (!Number.isFinite(v)) { setText(String(value)); return; }
    const c = Math.min(max, Math.max(min, v));
    setText(String(c));
    if (c !== value || inherited) onCommit(c);
  };
  return (
    <span className={`relative inline-flex items-center h-8 rounded-lg border bg-background ${width} ${
      inherited ? "border-dashed border-border/70 text-muted-foreground" : "border-input"
    }`}>
      <input type="text" inputMode="decimal" value={text} aria-label={`${label} value`}
        onFocus={() => setEditing(true)}
        onChange={(e) => setText(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { setText(String(value)); e.currentTarget.blur(); } }}
        className="w-full h-full bg-transparent text-center text-xs tabular-nums pr-5 pl-1 focus:outline-none focus:ring-1 focus:ring-ring rounded-lg" />
      {unit && <span className="absolute right-1.5 text-[0.625rem] text-muted-foreground pointer-events-none">{unit}</span>}
    </span>
  );
}

// A size. The slider is always on screen with the number beside it.
// `value` unset means inherited: the slider sits at `fallback`, greyed.
export function SliderRow({ label, hint, value, fallback = 0, min = 0, max = 100, step = 1, unit = "px", onChange, onClear, labels = null }) {
  const inherited = !isSet(value);
  const current = inherited ? Number(fallback) : Number(value);
  const shown = Number.isFinite(current) ? current : min;
  // `labels`: the slider walks a list of named steps (Small … Large) — the
  // name shows where the number box would, and there is nothing to type.
  const stepLabel = Array.isArray(labels) ? labels[Math.round(shown)] : null;
  return (
    <div className="py-1.5 border-b border-border/30 last:border-b-0">
      <div className="flex items-center gap-2 min-h-[32px]">
        <div className="flex-1 min-w-0">
          <span className="text-sm block leading-tight">{label}</span>
          {hint && <span className="text-[0.6875rem] text-muted-foreground block leading-tight mt-0.5">{hint}</span>}
        </div>
        {stepLabel != null ? (
          <span className={`inline-flex items-center justify-center h-8 px-2 rounded-lg border bg-background text-xs min-w-[4.25rem] ${
            inherited ? "border-dashed border-border/70 text-muted-foreground" : "border-input"
          }`}>{stepLabel}</span>
        ) : (
          <ValueField label={label} value={shown} inherited={inherited} min={min} max={max} unit={unit}
            onCommit={(v) => onChange(v)} />
        )}
        {onClear && (
          <button type="button" onClick={onClear} disabled={inherited} aria-label={`Clear ${label}`} title="Back to inherited"
            className={`w-6 h-6 rounded-full border border-border/50 text-muted-foreground hover:text-foreground flex items-center justify-center flex-shrink-0 ${inherited ? "invisible" : ""}`}>
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
      {/* touch-action: pan-y lets a vertical swipe that starts on the track
          scroll the sheet; only a sideways drag moves the thumb. The track is
          inset from the screen edges (px-3 on top of the panel's padding) and
          tagged data-edge-safe, so a drag that starts on its end can't be
          taken for the phone's back gesture (gestureExclusion.js keeps
          Android's edge zones off it). */}
      <div className="px-3">
        <input type="range" min={min} max={max} step={step} value={shown} aria-label={label} data-edge-safe=""
          onChange={(e) => onChange(parseFloat(e.target.value))}
          style={{ touchAction: "pan-y" }}
          className={`w-full h-7 mt-0.5 accent-primary ${inherited ? "opacity-50" : ""}`} />
      </div>
    </div>
  );
}

// The last row of every tab (docs/inspector-design-guide.md): "Reset this
// tab". One component, every inspector.
export function ResetRow({ onReset, label = "Reset this tab" }) {
  return (
    <div className="pt-4 pb-2">
      <button type="button" onClick={onReset}
        className="w-full h-9 rounded-xl border border-border/60 text-xs text-muted-foreground hover:text-foreground">
        {label}
      </button>
    </div>
  );
}

// A count: − n +, with the number typeable.
export function StepRow({ label, hint, value, min = 0, max = 99, step = 1, onChange }) {
  const n = Number.isFinite(Number(value)) && isSet(value) ? Number(value) : min;
  const clamp = (v) => Math.min(max, Math.max(min, v));
  return (
    <Row label={label} hint={hint}>
      <span className="flex items-center gap-1" role="group" aria-label={label}>
        <button type="button" aria-label={`${label} less`} disabled={n <= min} onClick={() => onChange(clamp(n - step))}
          className="w-8 h-8 rounded-lg border border-border/60 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-40">
          <Minus className="w-3.5 h-3.5" />
        </button>
        <ValueField label={label} value={n} inherited={false} min={min} max={max} onCommit={onChange} width="w-12" />
        <button type="button" aria-label={`${label} more`} disabled={n >= max} onClick={() => onChange(clamp(n + step))}
          className="w-8 h-8 rounded-lg border border-border/60 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-40">
          <Plus className="w-3.5 h-3.5" />
        </button>
      </span>
    </Row>
  );
}

// A colour role. `value` is the widget's own colour (or ""), `live` what
// is actually on screen — the swatch always shows the real colour and is
// dashed while inherited. `opacity` = { value, onChange } as ColorPicker.
export function ColourRow({ label, hint, value, live, fallback = "#888888", onChange, opacity, onClear, extraAction }) {
  const own = isSet(value);
  return (
    <Row label={label} hint={hint} own={own} onClear={onClear}>
      <span className={own ? "" : "rounded-lg outline outline-1 outline-dashed outline-border/70 outline-offset-1"}>
        <ColorPicker compact caption={false} label={label}
          value={value || live || fallback}
          onChange={onChange} opacity={opacity} onClear={onClear} extraAction={extraAction} />
      </span>
    </Row>
  );
}

// The tab strip under the header: fixed, one tab on screen at a time.
// `dot` marks a tab where this item has its own settings.
export function TabBar({ tabs, value, onChange }) {
  return (
    <div role="tablist" className="flex border-y border-border/50 bg-muted/20 flex-shrink-0">
      {tabs.map((t) => {
        const on = t.id === value;
        const Icon = t.icon;
        return (
          <button key={t.id} type="button" role="tab" aria-selected={on} id={`inspector-tab-${t.id}`}
            onClick={() => onChange(t.id)}
            className={`relative flex-1 min-w-0 flex flex-col items-center gap-0.5 pt-2 pb-1.5 text-[0.6875rem] border-b-2 ${
              on ? "border-primary text-primary font-semibold" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}>
            {Icon && <Icon className="w-4 h-4" />}
            <span className="truncate max-w-full px-0.5">{t.label}</span>
            {t.dot && !on && <span aria-hidden className="absolute top-1.5 right-[18%] w-1.5 h-1.5 rounded-full bg-primary" />}
          </button>
        );
      })}
    </div>
  );
}
