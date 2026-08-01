// Per-widget advanced config for the experimental homescreen — a bottom
// sheet (vaul Drawer) hosted ONCE at ExperimentalDashboard level and keyed
// by the widget instanceId being configured. The caller derives the live
// widget from home state each render, so persisted changes flow straight
// back into the open sheet.
//
// Config: display name (settings.label), display mode (widget.mode), style
// override (settings.style — "inherit" clears it), and for app shortcuts a
// custom icon image (settings.iconUrl, picked via the shared asset picker).
//
// Widget-specific options are DECLARED, not hand-coded here: a registry
// entry can carry
//   configFields: [{ key, type: "text"|"textarea"|"toggle"|"select"|"number",
//                    label, placeholder, help, options: [{value,label}],
//                    min, max, default }]
// and this sheet renders them, writing straight to settings[key]. That's
// what lets the catalogue grow without this file growing with it.

import React from "react";
import { Image as ImageIcon, X, Trash2, ChevronDown, Check } from "lucide-react";
import { APP_FONT_OPTIONS } from "@/lib/useAccessibility";
import { confirm } from "@/components/shared/ConfirmDialog";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription,
} from "@/components/ui/drawer";
import { HOME_MODES, effectiveMode } from "@/lib/experimentalHome";
import { HOME_STYLES } from "@/lib/homeStyles";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { useTerms } from "@/lib/useTerms";
import { buildGridItems } from "@/lib/navCatalogue";
import ColorPicker from "@/components/shared/ColorPicker";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { widgetLabel } from "@/lib/widgetRegistry";

// Text inputs here commit as you type (debounced) AND flush on unmount.
// Committing only onBlur loses whatever was typed when the sheet is closed
// with Escape or the drag handle — the input unmounts without ever blurring,
// and the user's text is simply gone.
function DebouncedText({ value, onCommit, multiline, rows, maxLength, placeholder, className }) {
  const [local, setLocal] = React.useState(value ?? "");
  const timer = React.useRef(null);
  const pending = React.useRef(null);
  const commitRef = React.useRef(onCommit);
  commitRef.current = onCommit;

  React.useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    if (pending.current !== null) commitRef.current(pending.current);
  }, []);

  const change = (v) => {
    setLocal(v);
    pending.current = v;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      const val = pending.current;
      pending.current = null;
      if (val !== null) commitRef.current(val);
    }, 350);
  };
  const flush = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (pending.current !== null) { const v = pending.current; pending.current = null; onCommit(v); }
  };

  const props = {
    value: local, placeholder, maxLength, className,
    onChange: (e) => change(e.target.value),
    onBlur: flush,
  };
  return multiline ? <textarea {...props} rows={rows || 3} /> : <input {...props} />;
}

function AppListField({ value = [], onChange, terms }) {
  const [q, setQ] = React.useState("");
  const items = React.useMemo(() => buildGridItems(terms.Alters, terms.System), [terms.Alters, terms.System]);
  const needle = q.trim().toLowerCase();
  const shown = needle ? items.filter((i) => i.label.toLowerCase().includes(needle)) : items;
  const toggle = (id) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <div className="space-y-2">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search apps…"
        className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
      <div className="max-h-56 overflow-y-auto overscroll-contain space-y-0.5 pr-1">
        {shown.map((i) => {
          const on = value.includes(i.id);
          const Icon = i.icon;
          return (
            <button key={i.id} type="button" onClick={() => toggle(i.id)}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg border text-left text-sm ${
                on ? "border-primary/60 bg-primary/10" : "border-transparent hover:bg-muted/40"
              }`}>
              <Icon className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
              <span className="truncate flex-1">{i.label}</span>
              {on && <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
            </button>
          );
        })}
        {shown.length === 0 && <p className="text-xs text-muted-foreground px-1 py-2">No apps match that.</p>}
      </div>
    </div>
  );
}

const MODE_LABEL = { minimal: "Minimal", normal: "Normal", expanded: "Expanded", detailed: "Detailed" };

export default function WidgetConfigSheet({
  widget,            // live widget object or null (sheet closed)
  def,               // registry entry for widget.widgetId
  pageStyleId,       // the page's style (shown as the "inherit" hint)
  onClose,
  onMode,            // (instanceId, mode)
  onSettings,        // (instanceId, patch)
  onPickIcon,        // (instanceId) → opens the shared AssetPickerModal
  onRemove,          // (instanceId) → delete this widget
}) {
  const open = !!widget && !!def;
  const [styleOpen, setStyleOpen] = React.useState(false);
  const settings = widget?.settings || {};
  const iconPreview = useResolvedAvatarUrl(settings.iconUrl || "");
  const t = useTerms();
  if (!open) return null;

  const defLabel = widgetLabel(def, t);
  const mode = effectiveMode(widget.mode, def.supportsModes);
  const styleOverride = HOME_STYLES.some((s) => s.id === settings.style) ? settings.style : "";
  const pageStyleLabel = HOME_STYLES.find((s) => s.id === pageStyleId)?.label || "Current";

  return (
    <Drawer open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader className="pb-1">
          <DrawerTitle className="text-base">{settings.label || defLabel}</DrawerTitle>
          <DrawerDescription className="text-xs">Widget options</DrawerDescription>
        </DrawerHeader>
        <div
          className="px-4 pb-6 space-y-4 overflow-y-auto overscroll-contain"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}
        >
          {/* Rename */}
          <div>
            <label className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground block mb-1">
              Display name
            </label>
            <DebouncedText
              key={widget.instanceId}
              value={settings.label || ""}
              placeholder={defLabel}
              maxLength={60}
              onCommit={(v) => {
                const next = v.trim();
                if (next !== (settings.label || "")) onSettings(widget.instanceId, { label: next });
              }}
              className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Display mode */}
          {def.supportsModes.length > 1 && (
            <div>
              <label className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground block mb-1">
                Display mode
              </label>
              <div className="flex flex-wrap gap-1.5">
                {HOME_MODES.filter((m) => def.supportsModes.includes(m)).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => onMode(widget.instanceId, m)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                      m === mode
                        ? "border-primary/60 bg-primary/10 text-primary"
                        : "border-border/50 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {MODE_LABEL[m]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Widget-specific options, declared by the registry entry. */}
          {(def.configFields || []).map((f) => {
            const val = settings[f.key] ?? f.default ?? "";
            const commit = (v) => onSettings(widget.instanceId, { [f.key]: v });
            return (
              <div key={f.key}>
                {f.type !== "toggle" && (
                  <label className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground block mb-1">
                    {f.label}
                  </label>
                )}
                {f.type === "text" && (
                  <DebouncedText key={`${widget.instanceId}:${f.key}`} value={val} placeholder={f.placeholder}
                    maxLength={f.maxLength || 120} onCommit={(v) => { if (v !== val) commit(v); }}
                    className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                )}
                {f.type === "textarea" && (
                  <DebouncedText key={`${widget.instanceId}:${f.key}`} value={val} placeholder={f.placeholder}
                    multiline rows={f.rows || 3} maxLength={f.maxLength || 2000}
                    onCommit={(v) => { if (v !== val) commit(v); }}
                    className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm resize-y focus:outline-none focus:ring-1 focus:ring-ring" />
                )}
                {f.type === "toggle" && (
                  <label className="flex items-center justify-between gap-3 text-sm cursor-pointer">
                    <span>{f.label}</span>
                    <input type="checkbox" checked={val !== false && val !== ""} onChange={(e) => commit(e.target.checked)}
                      className="w-4 h-4 rounded accent-primary" />
                  </label>
                )}
                {f.type === "select" && (
                  <div className="flex flex-wrap gap-1.5">
                    {(f.options || []).map((o) => (
                      <button key={o.value} type="button" onClick={() => commit(o.value)}
                        className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                          String(val) === String(o.value)
                            ? "border-primary/60 bg-primary/10 text-primary"
                            : "border-border/50 text-muted-foreground hover:text-foreground"
                        }`}>
                        {o.label}
                      </button>
                    ))}
                  </div>
                )}
                {f.type === "apps" && (
                  <AppListField value={Array.isArray(val) ? val : []}
                    onChange={(next) => commit(next)} terms={t} />
                )}
                {f.type === "number" && (
                  <input type="number" key={`${widget.instanceId}:${f.key}`} defaultValue={val}
                    min={f.min} max={f.max}
                    onBlur={(e) => {
                      const n = parseInt(e.target.value, 10);
                      if (!Number.isNaN(n)) commit(Math.min(f.max ?? 99, Math.max(f.min ?? 0, n)));
                    }}
                    className="w-24 h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                )}
                {f.help && <p className="text-[0.6875rem] text-muted-foreground mt-1">{f.help}</p>}
              </div>
            );
          })}

          {/* Appearance overrides. These write CSS variables onto the widget
              wrapper, so the whole-app settings apply by default and this
              widget alone departs from them where the user says so. */}
          <div className="space-y-3">
            <label className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground block">
              This widget's look
            </label>

            <div>
              <label className="text-xs font-medium block mb-1">Font</label>
              <SearchableSelect
                value={settings.font || ""}
                onChange={(v) => onSettings(widget.instanceId, { font: v || "" })}
                options={[
                  { id: "", label: "Use the app font" },
                  ...APP_FONT_OPTIONS.map((f) => ({ id: f.value, label: f.label })),
                ]}
                placeholder="Use the app font"
                searchPlaceholder="Search fonts…"
                renderOption={(o) => (
                  <span style={{ fontFamily: o.id || undefined }}>{o.label}</span>
                )}
              />
            </div>

            <div>
              <label className="flex items-center justify-between text-xs font-medium mb-1">
                <span>Corner radius</span>
                <span className="text-muted-foreground tabular-nums">
                  {settings.radius === undefined || settings.radius === "" ? "app default" : `${settings.radius}px`}
                </span>
              </label>
              <div className="flex items-center gap-2">
                <input type="range" min={0} max={32} step={1}
                  value={settings.radius === undefined || settings.radius === "" ? 12 : settings.radius}
                  onChange={(e) => onSettings(widget.instanceId, { radius: parseInt(e.target.value, 10) })}
                  className="flex-1" aria-label="Corner radius" />
                <button type="button" onClick={() => onSettings(widget.instanceId, { radius: "" })}
                  className="text-xs px-2 py-1 rounded-full border border-border/50 text-muted-foreground">Reset</button>
              </div>
            </div>

            <div>
              <label className="flex items-center justify-between text-xs font-medium mb-1">
                <span>Border width</span>
                <span className="text-muted-foreground tabular-nums">
                  {settings.borderW === undefined || settings.borderW === "" ? "app default" : `${settings.borderW}px`}
                </span>
              </label>
              <div className="flex items-center gap-2">
                <input type="range" min={0} max={6} step={1}
                  value={settings.borderW === undefined || settings.borderW === "" ? 0 : settings.borderW}
                  onChange={(e) => onSettings(widget.instanceId, { borderW: parseInt(e.target.value, 10) })}
                  className="flex-1" aria-label="Border width" />
                <button type="button" onClick={() => onSettings(widget.instanceId, { borderW: "" })}
                  className="text-xs px-2 py-1 rounded-full border border-border/50 text-muted-foreground">Reset</button>
              </div>
            </div>

            <div>
              <label className="flex items-center justify-between text-xs font-medium mb-1">
                <span>Text size</span>
                <span className="text-muted-foreground tabular-nums">
                  {settings.fontScale ? `${settings.fontScale}%` : "app default"}
                </span>
              </label>
              <div className="flex items-center gap-2">
                <input type="range" min={70} max={160} step={5}
                  value={settings.fontScale || 100}
                  onChange={(e) => onSettings(widget.instanceId, { fontScale: parseInt(e.target.value, 10) })}
                  className="flex-1" aria-label="Text size" />
                <button type="button" onClick={() => onSettings(widget.instanceId, { fontScale: "" })}
                  className="text-xs px-2 py-1 rounded-full border border-border/50 text-muted-foreground">Reset</button>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium block mb-1">Highlight colour</label>
              <div className="flex items-center gap-2">
                <ColorPicker value={settings.accent || "#3b82f6"}
                  onChange={(v) => onSettings(widget.instanceId, { accent: v })} />
                <button type="button" onClick={() => onSettings(widget.instanceId, { accent: "" })}
                  className={`text-xs px-2.5 py-1 rounded-full border ${!settings.accent ? "border-primary/60 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground"}`}>
                  Use the app colour
                </button>
              </div>
            </div>
          </div>

          {/* Style presets — collapsed, because nine full-width cards open by
              default buried everything else in this sheet. */}
          <div>
            <button type="button" onClick={() => setStyleOpen((v) => !v)}
              className="w-full flex items-center justify-between text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground py-1">
              <span>Style preset{styleOverride ? ` — ${HOME_STYLES.find((x) => x.id === styleOverride)?.label}` : " — inherit"}</span>
              <ChevronDown className="w-3.5 h-3.5" style={{ transform: styleOpen ? "rotate(180deg)" : "none", transition: "transform .18s" }} />
            </button>
            <div className="space-y-1" hidden={!styleOpen}>
              <button
                type="button"
                onClick={() => onSettings(widget.instanceId, { style: "" })}
                className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-all ${
                  !styleOverride
                    ? "border-primary/60 bg-primary/10"
                    : "border-border/40 hover:border-border"
                }`}
              >
                <span className="font-medium">Inherit page style</span>
                <span className="text-xs text-muted-foreground block">Currently “{pageStyleLabel}”</span>
              </button>
              {HOME_STYLES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onSettings(widget.instanceId, { style: s.id })}
                  className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-all ${
                    styleOverride === s.id
                      ? "border-primary/60 bg-primary/10"
                      : "border-border/40 hover:border-border"
                  }`}
                >
                  <span className="font-medium">{s.label}</span>
                  <span className="text-xs text-muted-foreground block">{s.description}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Icon override — app shortcuts only */}
          {widget.widgetId === "app_shortcut" && (
            <div>
              <label className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground block mb-1">
                Icon
              </label>
              <div className="flex items-center gap-2">
                {iconPreview ? (
                  <img src={iconPreview} alt="" className="w-11 h-11 rounded-2xl object-cover border border-border/40" />
                ) : (
                  <span className="w-11 h-11 rounded-2xl border border-dashed border-border/50 flex items-center justify-center text-muted-foreground">
                    <ImageIcon className="w-4 h-4" />
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onPickIcon(widget.instanceId)}
                  className="text-xs px-3 py-1.5 rounded-full border border-border/50 text-muted-foreground hover:text-foreground"
                >
                  Choose image…
                </button>
                {settings.iconUrl && (
                  <button
                    type="button"
                    onClick={() => onSettings(widget.instanceId, { iconUrl: "" })}
                    aria-label="Remove custom icon"
                    className="min-w-[28px] min-h-[28px] flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          )}
          <div className="pt-2 border-t border-border/50">
            <button
              type="button"
              onClick={async () => {
                const ok = await confirm({
                  title: `Remove ${settings.label || defLabel}?`,
                  body: "It comes off this page. Nothing it shows is deleted, and you can add it back any time.",
                  confirmLabel: "Remove",
                  destructive: true,
                });
                if (ok) onRemove?.(widget.instanceId);
              }}
              className="w-full flex items-center justify-center gap-2 h-10 rounded-lg border border-destructive/40 text-destructive text-sm font-medium hover:bg-destructive/10"
            >
              <Trash2 className="w-4 h-4" /> Remove widget
            </button>
            <p className="text-[0.6875rem] text-muted-foreground mt-1 text-center">
              Or hold a widget and drag it onto “Drop to remove”.
            </p>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
