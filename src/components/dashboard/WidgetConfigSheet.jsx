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
import { Image as ImageIcon, X, Trash2, ChevronDown, ChevronUp, Check, Eye, EyeOff } from "lucide-react";
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
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import ColorPicker from "@/components/shared/ColorPicker";
import { pickLook, mergeLook, lookToStyle, BORDER_STYLES, SHADOW_PRESETS, USER_STYLE_PREFIX, userStyleId } from "@/lib/widgetLook";
import { getStyleShell } from "@/lib/homeStyles";
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

// Searchable group/subsystem picker (house rule: never a bare select —
// large systems have many groups).
function GroupField({ value, onChange }) {
  const { data: groups = [] } = useQuery({
    queryKey: ["groups"],
    queryFn: () => base44.entities.Group.list(),
  });
  const options = [
    { id: "", label: "Everyone" },
    ...groups.map((g) => ({ id: g.id, label: g.name || "Group" })),
  ];
  return (
    <SearchableSelect
      value={value}
      onChange={(v) => onChange(v)}
      options={options}
      placeholder="Everyone"
      searchPlaceholder="Search groups…"
    />
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
  userStyles = [],   // the user's own saved styles
  onSaveStyle,       // (label, look) → save the current look as a style
  onDeleteStyle,     // (styleId)
  onPickBackground,  // (instanceId) → opens the shared AssetPickerModal
  api = null,        // live widget api, for the in-sheet preview
}) {
  const open = !!widget && !!def;
  const [styleOpen, setStyleOpen] = React.useState(false);
  const [cssOpen, setCssOpen] = React.useState(false);
  const [naming, setNaming] = React.useState(false);
  const [styleName, setStyleName] = React.useState("");
  // Same viewing affordances as Display options: a collapsible live sample,
  // and Peek — a short undimmed sheet so the REAL widget is visible while
  // its options change under your finger (settings persist instantly, so
  // the page updates live).
  const [peek, setPeek] = React.useState(false);
  const [previewOpen, setPreviewOpen] = React.useState(() => {
    try { return localStorage.getItem("symphony_v2_widget_preview") !== "0"; } catch { return true; }
  });
  const togglePreview = (v) => {
    setPreviewOpen(v);
    try { localStorage.setItem("symphony_v2_widget_preview", v ? "1" : "0"); } catch { /* storage off */ }
  };
  React.useEffect(() => {
    if (!open || !peek) return undefined;
    document.documentElement.setAttribute("data-v2-peek", "1");
    // Bring the widget being styled into the visible strip above the sheet
    // — peeking at a widget that's below the fold shows nothing.
    const node = widget && document.querySelector(`[data-widget-id="${widget.instanceId}"]`);
    node?.scrollIntoView({ block: "start", behavior: "smooth" });
    return () => document.documentElement.removeAttribute("data-v2-peek");
  }, [open, peek, widget]);
  const settings = widget?.settings || {};
  const iconPreview = useResolvedAvatarUrl(settings.iconUrl || "");
  const t = useTerms();
  if (!open) return null;

  const defLabel = widgetLabel(def, t);
  const saveStyle = () => {
    const label = styleName.trim();
    if (!label) return;
    onSaveStyle?.(label.slice(0, 40), pickLook(settings));
    setNaming(false);
    setStyleName("");
  };
  const mode = effectiveMode(widget.mode, def.supportsModes);
  const savedLook = userStyles.find((st) => `${USER_STYLE_PREFIX}${st.id}` === settings.style)?.look || {};
  const previewLook = mergeLook(savedLook, pickLook(settings));
  const previewShell = !userStyleId(settings.style) && settings.style ? getStyleShell(settings.style) : "";
  const styleOverride = HOME_STYLES.some((s) => s.id === settings.style) ? settings.style : "";
  const pageStyleLabel = HOME_STYLES.find((s) => s.id === pageStyleId)?.label || "Current";

  return (
    <Drawer open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DrawerContent className={peek ? "max-h-[40vh]" : "max-h-[85vh]"}>
        <DrawerHeader className="pb-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <DrawerTitle className="text-base">{settings.label || defLabel}</DrawerTitle>
              <DrawerDescription className="text-xs">
                {peek ? "Keep adjusting — the widget is visible above." : "Widget options"}
              </DrawerDescription>
            </div>
            <button type="button" onClick={() => setPeek((v) => !v)}
              className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border flex-shrink-0 ${
                peek ? "border-primary/60 bg-primary/10 text-primary" : "border-border/60 text-muted-foreground hover:text-foreground"
              }`}>
              {peek ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {peek ? "Full panel" : "Peek"}
            </button>
          </div>
        </DrawerHeader>
        {!peek && (
          <div className="px-4 pb-2">
            <button type="button" onClick={() => togglePreview(!previewOpen)}
              className="w-full flex items-center justify-between text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground py-1">
              <span>Preview</span>
              <ChevronUp className="w-3.5 h-3.5"
                style={{ transform: previewOpen ? "none" : "rotate(180deg)", transition: "transform .18s" }} />
            </button>
            {previewOpen && (
              <div className="rounded-xl border border-border/50 p-2 bg-background/40">
                {settings.css && (
                  <style dangerouslySetInnerHTML={{ __html: `[data-config-preview="1"]{${settings.css}}` }} />
                )}
                <div data-config-preview="1" aria-hidden="true"
                  className={`pointer-events-none select-none overflow-hidden ${previewShell || ""}`}
                  style={{ ...lookToStyle(previewLook), maxHeight: 200, borderRadius: "var(--v2-radius, 8px)" }}>
                  {def.render({ mode, settings, instanceId: "config_preview", api })}
                </div>
              </div>
            )}
          </div>
        )}
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
                {f.type === "group" && (
                  <GroupField value={val || ""} onChange={(v) => commit(v || "")} />
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

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium block mb-1">Background</label>
                <div className="flex items-center gap-2">
                  <ColorPicker value={settings.bg || "#111827"}
                    onChange={(v) => onSettings(widget.instanceId, { bg: v })} />
                  <button type="button" onClick={() => onSettings(widget.instanceId, { bg: "" })}
                    className="text-xs px-2 py-1 rounded-full border border-border/50 text-muted-foreground">Clear</button>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium block mb-1">Text colour</label>
                <div className="flex items-center gap-2">
                  <ColorPicker value={settings.textColor || "#e5e7eb"}
                    onChange={(v) => onSettings(widget.instanceId, { textColor: v })} />
                  <button type="button" onClick={() => onSettings(widget.instanceId, { textColor: "" })}
                    className="text-xs px-2 py-1 rounded-full border border-border/50 text-muted-foreground">Clear</button>
                </div>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium block mb-1">Background image</label>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => onPickBackground?.(widget.instanceId)}
                  className="h-9 px-3 rounded-lg border border-border text-xs flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5" /> {settings.bgImage ? "Change" : "Choose"}
                </button>
                {settings.bgImage && (
                  <>
                    <div className="flex gap-1">
                      {["cover", "contain", "repeat"].map((v) => (
                        <button key={v} type="button" onClick={() => onSettings(widget.instanceId, { bgSize: v })}
                          className={`text-xs px-2 py-1 rounded-full border ${
                            (settings.bgSize || "cover") === v ? "border-primary/60 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground"
                          }`}>{v}</button>
                      ))}
                    </div>
                    <button type="button" onClick={() => onSettings(widget.instanceId, { bgImage: "" })}
                      className="text-xs px-2 py-1 rounded-full border border-border/50 text-muted-foreground">Remove</button>
                  </>
                )}
              </div>
            </div>

            <div>
              <label className="flex items-center justify-between text-xs font-medium mb-1">
                <span>Inner spacing</span>
                <span className="text-muted-foreground tabular-nums">
                  {settings.padding === undefined || settings.padding === "" ? "app default" : `${settings.padding}px`}
                </span>
              </label>
              <div className="flex items-center gap-2">
                <input type="range" min={0} max={32} step={1}
                  value={settings.padding === undefined || settings.padding === "" ? 9 : settings.padding}
                  onChange={(e) => onSettings(widget.instanceId, { padding: parseInt(e.target.value, 10) })}
                  className="flex-1" aria-label="Inner spacing" />
                <button type="button" onClick={() => onSettings(widget.instanceId, { padding: "" })}
                  className="text-xs px-2 py-1 rounded-full border border-border/50 text-muted-foreground">Reset</button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium block mb-1">Border colour</label>
                <div className="flex items-center gap-2">
                  <ColorPicker value={settings.borderColor || "#3b82f6"}
                    onChange={(v) => onSettings(widget.instanceId, { borderColor: v })} />
                  <button type="button" onClick={() => onSettings(widget.instanceId, { borderColor: "" })}
                    className="text-xs px-2 py-1 rounded-full border border-border/50 text-muted-foreground">Clear</button>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium block mb-1">Border style</label>
                <div className="flex flex-wrap gap-1">
                  {BORDER_STYLES.map((v) => (
                    <button key={v} type="button"
                      onClick={() => onSettings(widget.instanceId, { borderStyle: settings.borderStyle === v ? "" : v })}
                      className={`text-[0.6875rem] px-2 py-1 rounded-full border ${
                        settings.borderStyle === v ? "border-primary/60 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground"
                      }`}>{v}</button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium block mb-1">Shadow</label>
              <div className="flex flex-wrap gap-1">
                {Object.keys(SHADOW_PRESETS).map((v) => (
                  <button key={v} type="button"
                    onClick={() => onSettings(widget.instanceId, { shadow: settings.shadow === v ? "" : v })}
                    className={`text-xs px-2.5 py-1 rounded-full border ${
                      settings.shadow === v ? "border-primary/60 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground"
                    }`}>{v}</button>
                ))}
              </div>
            </div>

            {/* The escape hatch: your own CSS, scoped to this widget. */}
            <div>
              <button type="button" onClick={() => setCssOpen((v) => !v)}
                className="w-full flex items-center justify-between text-xs font-medium py-1">
                <span>Your own CSS{settings.css ? " — in use" : ""}</span>
                <ChevronDown className="w-3.5 h-3.5" style={{ transform: cssOpen ? "rotate(180deg)" : "none", transition: "transform .18s" }} />
              </button>
              {cssOpen && (
                <>
                  <DebouncedText multiline rows={5} value={settings.css || ""}
                    placeholder={"border-image: url(...) 30 round;\nletter-spacing: .04em;"}
                    onCommit={(v) => onSettings(widget.instanceId, { css: v })}
                    className="w-full px-3 py-2 rounded-lg border border-input bg-background text-xs font-mono resize-y focus:outline-none focus:ring-1 focus:ring-ring" />
                  <p className="text-[0.6875rem] text-muted-foreground mt-1">
                    Plain CSS declarations, applied to this widget only. Anything CSS can do — border images, gradients, filters.
                  </p>
                </>
              )}
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
              {naming ? (
                <div className="flex gap-1.5 pb-1">
                  <input autoFocus value={styleName} onChange={(e) => setStyleName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") saveStyle(); if (e.key === "Escape") setNaming(false); }}
                    placeholder="Name this style" maxLength={40}
                    className="flex-1 h-8 px-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                  <button type="button" onClick={saveStyle} disabled={!styleName.trim()}
                    className="text-xs px-2.5 py-1.5 rounded-lg border border-primary/50 text-primary disabled:opacity-40">Save</button>
                  <button type="button" onClick={() => setNaming(false)}
                    className="text-xs px-2.5 py-1.5 rounded-lg border border-border/50 text-muted-foreground">Cancel</button>
                </div>
              ) : (
                <div className="flex gap-1.5 pb-1">
                  <button type="button" onClick={() => { setStyleName(""); setNaming(true); }}
                    className="text-xs px-2.5 py-1.5 rounded-lg border border-primary/50 text-primary">
                    Save this look as a style
                  </button>
                </div>
              )}
              {userStyles.map((st) => {
                const on = settings.style === `${USER_STYLE_PREFIX}${st.id}`;
                return (
                  <div key={st.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
                    on ? "border-primary/60 bg-primary/10" : "border-border/40"
                  }`}>
                    <button type="button" className="flex-1 text-left text-sm font-medium"
                      onClick={() => onSettings(widget.instanceId, { style: `${USER_STYLE_PREFIX}${st.id}` })}>
                      {st.label}
                      <span className="text-xs text-muted-foreground block">Yours</span>
                    </button>
                    <button type="button" aria-label={`Delete ${st.label}`}
                      onClick={async () => {
                        const ok = await confirm({
                          title: `Delete "${st.label}"?`,
                          body: "Widgets using it go back to inheriting the page style. Their own tweaks stay.",
                          confirmLabel: "Delete", destructive: true,
                        });
                        if (ok) onDeleteStyle?.(st.id);
                      }}
                      className="p-1 text-muted-foreground hover:text-destructive">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
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
