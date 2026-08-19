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
import { Image as ImageIcon, X, Trash2, ChevronDown, Check, Eye, EyeOff, RotateCcw, LayoutGrid, Palette, Settings2, Copy, Star, SlidersHorizontal, ArrowUpToLine, ArrowDownToLine, Type } from "lucide-react";
import PinnedAltersConfigPanel from "@/components/alters/PinnedAltersConfigPanel";
import { DOCK_KEY } from "@/components/v2/V2Frame";
import { useFontOptions } from "@/lib/useFontOptions";
// Same collapsible section shell Display options uses, so the two editors
// read as one system rather than two conventions.
import { SubSection } from "@/components/settings/SettingsUI";
import { confirm } from "@/components/shared/ConfirmDialog";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription,
} from "@/components/ui/drawer";
import { HOME_MODES, effectiveMode } from "@/lib/experimentalHome";
import { HOME_STYLES } from "@/lib/homeStyles";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { useTerms } from "@/lib/useTerms";
import { useTheme } from "@/lib/ThemeContext";
import AlterArrangementEditor from "@/components/shared/AlterArrangementEditor";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { buildGridItems } from "@/lib/navCatalogue";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import ColorPicker from "@/components/shared/ColorPicker";
import ProfileSongPicker from "@/components/shared/ProfileSongPicker";
import {
  themeToLook, BORDER_STYLES, SHADOW_PRESETS, USER_STYLE_PREFIX,
  LOOK_GROUPS, lookCoverage, lookForGroups, OFF, mergeLook, pickLook, userStyleId,
} from "@/lib/widgetLook";
import { getStyleLook } from "@/lib/homeStyles";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { SearchableMultiList } from "@/v2/widgets";
import { widgetLabel } from "@/lib/widgetRegistry";
import { sheetPortalGuards } from "@/lib/sheetPortalGuards";
import { applyTerms } from "@/lib/dailyTaskSystem";

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

// Builder for "links to anywhere": journals, alters, groups — each added
// through a SEARCHABLE picker (house rule: large systems, no bare lists).
function LinksField({ value = [], onChange }) {
  const [kind, setKind] = React.useState("journal");
  const formatAlter = useAlterLabel();
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  const { data: groups = [] } = useQuery({ queryKey: ["groups"], queryFn: () => base44.entities.Group.list() });
  const { data: entries = [] } = useQuery({ queryKey: ["journalEntries"], queryFn: () => base44.entities.JournalEntry.list() });
  const journals = React.useMemo(() => {
    const set = new Set(entries.map((e) => e.folder).filter(Boolean));
    try { JSON.parse(localStorage.getItem("os_journal_folders") || "[]").forEach((f) => set.add(f)); }
    catch { /* none saved */ }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [entries]);

  const options = kind === "journal"
    ? journals.map((f) => ({ id: f, label: f }))
    : kind === "alter"
      ? alters.filter((a) => !a.is_archived).map((a) => ({ id: a.id, label: a.name || a.alias || "?" }))
      : groups.map((g) => ({ id: g.id, label: g.name || "Group" }));

  const labelFor = (l) => {
    if (l.type === "journal") return l.id;
    if (l.type === "alter") { const a = alters.find((x) => x.id === l.id); return a ? formatAlter(a) : "?"; }
    return groups.find((g) => g.id === l.id)?.name || "?";
  };

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((l, i) => (
            <span key={`${l.type}_${l.id}_${i}`}
              className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border border-border/60">
              <span className="text-muted-foreground">{l.type}:</span> {labelFor(l)}
              <button type="button" aria-label={`Remove ${labelFor(l)}`}
                onClick={() => onChange(value.filter((_, j) => j !== i))}
                className="text-muted-foreground hover:text-destructive"><X className="w-3 h-3" /></button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-1.5">
        {[["journal", "Journal"], ["alter", "Member"], ["group", "Group"]].map(([v, label]) => (
          <button key={v} type="button" onClick={() => setKind(v)}
            className={`text-xs px-2.5 py-1 rounded-full border ${
              kind === v ? "border-primary/60 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground"
            }`}>{label}</button>
        ))}
      </div>
      <SearchableSelect
        value={null}
        onChange={(id) => { if (id) onChange([...value, { type: kind, id }]); }}
        options={options.filter((o) => !value.some((l) => l.type === kind && l.id === o.id))}
        placeholder="Add a link…"
        searchPlaceholder="Search…"
      />
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


// ── Dynamic-source fields ───────────────────────────────────────────
// The sheet must carry a widget's FULL functional config, not only its
// look (owner rule) — including choices whose options come from live data
// (chat channels, polls, journals, boards). In-widget switchers still
// exist for convenience, but widgets are inert in edit mode, so the sheet
// is the canonical place to configure them.
const DYNAMIC_SOURCES = {
  chatChannels: {
    queryKey: ["systemChatChannels"],
    queryFn: () => base44.entities.SystemChatChannel.list(),
    toOptions: (rows) => rows.map((c) => ({ id: c.id, label: `#${c.name}` })),
    searchPlaceholder: "Search channels…",
  },
  polls: {
    queryKey: ["polls"],
    queryFn: () => base44.entities.Poll.list(),
    toOptions: (rows) => [...rows]
      .sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0))
      .map((p) => ({ id: p.id, label: p.question || "Poll" })),
    searchPlaceholder: "Search polls…",
  },
  journalFolders: {
    queryKey: ["journalEntries"],
    queryFn: () => base44.entities.JournalEntry.list(),
    toOptions: (rows) => {
      const set = new Set(rows.map((e) => e.folder).filter(Boolean));
      try { JSON.parse(localStorage.getItem("os_journal_folders") || "[]").forEach((f) => set.add(f)); } catch { /* none saved */ }
      return [...set].sort((a, b) => a.localeCompare(b)).map((f) => ({ id: f, label: f }));
    },
    searchPlaceholder: "Search journals…",
  },
  symptoms: {
    queryKey: ["symptoms"],
    queryFn: () => base44.entities.Symptom.list(),
    toOptions: (rows) => rows.filter((x) => !x.is_archived).map((x) => ({ id: x.id, label: x.label || x.name || "Symptom" })),
    searchPlaceholder: "Search symptoms…",
  },
  boards: {
    fallback: ["system"],
    queryKey: ["groups"],
    queryFn: () => base44.entities.Group.list(),
    toOptions: (rows, terms) => [
      { id: "system", label: `${terms?.System || "System"} board` },
      ...rows.map((g) => ({ id: g.id, label: g.name || "Group" })),
    ],
    searchPlaceholder: "Search boards…",
  },
};

function DynamicSelectField({ field, value, onChange }) {
  const src = DYNAMIC_SOURCES[field.source];
  const { data: rows = [] } = useQuery({ queryKey: src.queryKey, queryFn: src.queryFn });
  const options = [
    ...(field.emptyLabel ? [{ id: "", label: field.emptyLabel }] : []),
    ...src.toOptions(rows),
  ];
  return (
    <SearchableSelect
      value={value || ""}
      onChange={(v) => onChange(v ?? "")}
      options={options}
      placeholder={field.emptyLabel || field.label}
      searchPlaceholder={src.searchPlaceholder}
    />
  );
}

function DynamicMultiField({ field, value = [], onChange, terms }) {
  const src = DYNAMIC_SOURCES[field.source];
  const { data: rows = [] } = useQuery({ queryKey: src.queryKey, queryFn: src.queryFn });
  const options = src.toOptions(rows, terms);
  // Some multi-fields must always hold something (a board widget with no
  // board is nothing); others treat empty as "use the default set".
  const fallback = field.fallback ?? src.fallback ?? [];
  const current = value.length ? value : fallback;
  return (
    <SearchableMultiList
      options={options}
      selectedIds={current}
      onToggle={(id) => {
        const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
        onChange(next.length ? next : fallback);
      }}
      searchPlaceholder={src.searchPlaceholder}
    />
  );
}

const MODE_LABEL = { minimal: "Minimal", normal: "Normal", expanded: "Expanded", detailed: "Detailed" };

// The colour pickers used to fall back to hardcoded hexes, so before you
// customised anything they showed a generic blue/grey rather than the
// colour actually on screen — which makes "nudge this slightly" impossible.
// Read the live widget's computed colours instead and seed the pickers with
// those. Probed once per sheet-open.
// `revision` re-probes whenever the widget's look changes (a preset
// applied, a colour cleared) — read once on open, the swatches went stale
// and disagreed with the widget under them.
function useLiveColors(open, instanceId, revision = "") {
  const [tick, setTick] = React.useState(0);
  // The DOM repaints AFTER the settings write; probe on the next frame.
  React.useEffect(() => {
    if (!open) return undefined;
    const id = requestAnimationFrame(() => setTick((t) => t + 1));
    return () => cancelAnimationFrame(id);
  }, [open, revision]);
  return React.useMemo(() => {
    if (!open || typeof document === "undefined") return {};
    const toHex = (c) => {
      const str = String(c || "");
      const m = str.match(/[\d.]+/g);
      if (!m || m.length < 3) return null;
      let [r, g, b] = m.map(Number);
      const a = m.length > 3 ? Number(m[3]) : 1;
      if (a === 0) return null; // transparent tells us nothing
      // Chrome reports modern colours as `color(srgb 1 0 0 / .25)` with
      // 0-1 components — scaling those as 0-255 gave near-black swatches.
      if (/^color\(/i.test(str)) { r *= 255; g *= 255; b *= 255; }
      const clamp = (x) => Math.max(0, Math.min(255, Math.round(x)));
      return "#" + [r, g, b].map((x) => clamp(x).toString(16).padStart(2, "0")).join("");
    };
    const wrap = instanceId ? document.querySelector(`[data-widget-id="${instanceId}"]`) : null;
    const box = wrap?.querySelector("section") || wrap?.querySelector("[data-widget-content]") || wrap;
    const root = getComputedStyle(document.documentElement);
    const body = getComputedStyle(document.body);
    const cs = box ? getComputedStyle(box) : null;
    const accentVar = (root.getPropertyValue("--v2-accent") || root.getPropertyValue("--color-primary") || "").trim();
    const num = (v, fallback) => { const n = parseFloat(v); return Number.isFinite(n) ? Math.round(n) : fallback; };
    return {
      bg: (cs && toHex(cs.backgroundColor)) || toHex(body.backgroundColor) || undefined,
      textColor: (cs && toHex(cs.color)) || toHex(body.color) || undefined,
      borderColor: (cs && toHex(cs.borderTopColor)) || undefined,
      accent: accentVar.startsWith("#") ? accentVar : undefined,
      // Shape and type are probed too, because "save this look as a style"
      // has to capture what the widget ACTUALLY looks like. Most widgets
      // store no radius/border/font of their own — those come from the app
      // theme through CSS and never appear in the look object, so saving
      // from stored values alone produced a style that set almost nothing.
      radius: cs ? num(cs.borderTopLeftRadius, undefined) : undefined,
      borderW: cs ? num(cs.borderTopWidth, undefined) : undefined,
      borderStyle: cs && cs.borderTopStyle !== "none" ? cs.borderTopStyle : undefined,
      padding: cs ? num(cs.paddingTop, undefined) : undefined,
      shadow: cs && cs.boxShadow && cs.boxShadow !== "none" ? cs.boxShadow : "none",
      font: cs?.fontFamily || undefined,
      fontScale: 100,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, instanceId, tick]);
}

// Mirrors the TokenRow slider in Display options (− / range / + / readout)
// so both editors handle a size the same way, plus this sheet's own Reset
// (a widget value can be unset = follow the app).
function SliderRow({ label, value, fallback, min, max, step = 1, unit = "px", onChange, onReset }) {
  // Edit-menu anatomy (docs/v2-edit-menu-spec.md): the row shows its name,
  // current value and a visible "set" button; the slider only exists after
  // that explicit tap, so a scroll through the sheet can't move a setting.
  const [open, setOpen] = React.useState(false);
  const unset = value === undefined || value === "";
  const shown = unset ? "app default" : `${value}${unit}`;
  const current = unset ? fallback : Number(value);
  const bump = (dir) => onChange(Math.min(max, Math.max(min, current + dir * step)));
  return (
    <div className="py-1">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium flex-1 min-w-0 truncate">{label}</span>
        <span className="text-xs text-muted-foreground tabular-nums flex-shrink-0">{shown}</span>
        <button type="button" aria-label={`${label} — set`} aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className={`w-8 h-8 flex items-center justify-center rounded-lg border flex-shrink-0 ${
            open ? "border-primary/60 text-primary" : "border-border/60 text-muted-foreground hover:text-foreground"
          }`}>
          <SlidersHorizontal className="w-3.5 h-3.5" />
        </button>
      </div>
      {open && (
        <div className="flex items-center gap-2 pt-1.5">
          <button type="button" aria-label={`${label} −`} onClick={() => bump(-1)}
            className="w-7 h-7 rounded-lg border border-border/60 text-muted-foreground hover:text-foreground flex items-center justify-center text-sm leading-none flex-shrink-0">−</button>
          <input type="range" min={min} max={max} step={step} value={current}
            onChange={(e) => onChange(parseInt(e.target.value, 10))}
            className="flex-1" aria-label={label} />
          <button type="button" aria-label={`${label} +`} onClick={() => bump(1)}
            className="w-7 h-7 rounded-lg border border-border/60 text-muted-foreground hover:text-foreground flex items-center justify-center text-sm leading-none flex-shrink-0">+</button>
          {onReset && (
            <button type="button" onClick={onReset}
              className="text-xs px-2 py-1 rounded-full border border-border/50 text-muted-foreground flex-shrink-0 whitespace-nowrap">Reset</button>
          )}
        </div>
      )}
    </div>
  );
}

export default function WidgetConfigSheet({
  widget,            // live widget object or null (sheet closed)
  def,               // registry entry for widget.widgetId
  pageStyleId,       // the page's style (shown as the "inherit" hint)
  onClose,
  onMode,            // (instanceId, mode)
  onSettings,        // (instanceId, patch)
  onPickIcon,        // (instanceId) → opens the shared AssetPickerModal
  onRemove,          // (instanceId) → delete this widget
  onResetWidget,     // (instanceId) → back to registry defaults
  onEditLayout,      // () → turn on home-screen edit mode (move/resize)
  onApplyLook,       // (scope: "all" | "page" | "pick") → copy this look out
  resolvedLook = {}, // what this widget actually looks like right now
  userStyles = [],   // the user's own saved styles
  onSaveStyle,       // (label, look) → save the current look as a style
  onDeleteStyle,     // (styleId)
  onPickBackground,  // (instanceId) → opens the shared AssetPickerModal
}) {
  const open = !!widget && !!def;
  const live = useLiveColors(open, widget?.instanceId, JSON.stringify(widget?.settings || {}) + (pageStyleId || ""));
  const [styleOpen, setStyleOpen] = React.useState(false);
  const [cssOpen, setCssOpen] = React.useState(false);
  const [naming, setNaming] = React.useState(false);
  const [applyOpen, setApplyOpen] = React.useState(false);
  const [styleName, setStyleName] = React.useState("");
  // Which parts of the look a saved style should carry. All of them by
  // default — a preset that covers everything needs no caveats.
  const [saveGroups, setSaveGroups] = React.useState(LOOK_GROUPS.map((g) => g.id));
  const [exclusionsFor, setExclusionsFor] = React.useState(null); // style id
  // Same viewing affordances as Display options: a collapsible live sample,
  // and Peek — a short undimmed sheet so the REAL widget is visible while
  // its options change under your finger (settings persist instantly, so
  // the page updates live).
  const [peek, setPeek] = React.useState(false);
  // Peek height is DRAGGABLE (the user's ask) — remembered per device.
  const [peekH, setPeekH] = React.useState(() => {
    try { const n = Number(localStorage.getItem("symphony_widget_peek_h")); return Number.isFinite(n) && n > 0 ? n : 40; } catch { return 40; }
  });
  const peekDrag = React.useRef(null);
  const onPeekHandleDown = (e) => {
    peekDrag.current = { y: e.clientY, h: peekH };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* unsupported */ }
  };
  const onPeekHandleMove = (e) => {
    const d = peekDrag.current; if (!d) return;
    // Bottom dock: dragging UP grows the sheet; top dock: dragging DOWN does.
    const dy = (dock === "top" ? 1 : -1) * (e.clientY - d.y);
    const next = Math.max(15, Math.min(90, d.h + (dy / window.innerHeight) * 100));
    setPeekH(next);
  };
  const onPeekHandleUp = () => {
    if (!peekDrag.current) return;
    peekDrag.current = null;
    try { localStorage.setItem("symphony_widget_peek_h", String(Math.round(peekH))); } catch { /* storage off */ }
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
  // Dock top/bottom — same flip (and same remembered choice) as the other
  // edit sheets, so a widget near the bottom edge isn't hidden under its
  // own options.
  const [dock, setDock] = React.useState(() => {
    try { return localStorage.getItem(DOCK_KEY) === "top" ? "top" : "bottom"; } catch { return "bottom"; }
  });
  const flipDock = () => {
    const next = dock === "top" ? "bottom" : "top";
    setDock(next);
    try { localStorage.setItem(DOCK_KEY, next); } catch { /* storage off */ }
  };
  const settings = widget?.settings || {};
  const iconPreview = useResolvedAvatarUrl(settings.iconUrl || "");
  const fontOptions = useFontOptions();
  // Classic Appearance themes, offered as widget looks.
  const { allPresets = {}, userCustomPresets = {} } = useTheme() || {};
  // Which half of a theme to translate — the live document class is the
  // honest signal (themeMode can be "system").
  const isDarkMode = typeof document !== "undefined" && document.documentElement.classList.contains("dark");
  const themeLookEntries = React.useMemo(() => [
    ...Object.entries(userCustomPresets).map(([name, preset]) => ({ name, preset, mine: true })),
    ...Object.entries(allPresets).map(([name, preset]) => ({ name, preset, mine: false })),
  ].filter(({ preset }) => preset && (preset.light || preset.dark)), [allPresets, userCustomPresets]);
  const t = useTerms();
  if (!open) return null;

  const defLabel = widgetLabel(def, t);
  // Setting an opacity on a colour the widget only INHERITS has nothing to
  // fade, so pin the live colour at the same time — otherwise the slider
  // moves and nothing happens.
  const setAlpha = (colorKey, opacityKey, value, fallbackColor) =>
    onSettings(widget.instanceId, {
      [opacityKey]: value,
      ...(settings[colorKey] ? {} : { [colorKey]: fallbackColor }),
    });
  // OFF is a real stored value ("this style has no gradient"), not a colour.
  const gradHex = (v) => (v && v !== OFF ? v : "");
  // The gradient the widget is ACTUALLY drawing = the built-in / saved
  // style underneath, the widget's own fields on top (the same merge
  // widgetLookFor does). The pickers used to show only the widget's own
  // fields, so with a style applied they sat on default colours while the
  // widget showed the style's gradient (the user's report).
  const effective = (() => {
    const st = settings.style;
    const savedId = userStyleId(st);
    const saved = savedId ? userStyles.find((x) => x.id === savedId) : null;
    const builtinId = HOME_STYLES.some((h) => h.id === st) ? st : pageStyleId;
    return mergeLook(mergeLook(getStyleLook(builtinId), saved?.look || {}), pickLook(settings));
  })();
  const gradOn = gradHex(effective.gradFrom) && gradHex(effective.gradTo);
  // A style can carry "no custom CSS" as an explicit value; that's an
  // empty editor, not the literal word.
  const ownCss = settings.css && settings.css !== OFF ? settings.css : "";

  const saveStyle = () => {
    const label = styleName.trim();
    if (!label || saveGroups.length === 0) return;
    // Save from what the widget actually LOOKS like, not only the keys it
    // happens to store — a colour inherited from the page style is still
    // part of the look the user is naming.
    onSaveStyle?.(label.slice(0, 40), lookForGroups(resolvedLook, settings, saveGroups, live));
    setNaming(false);
    setStyleName("");
  };
  const mode = effectiveMode(widget.mode, def.supportsModes);
  const styleOverride = HOME_STYLES.some((s) => s.id === settings.style) ? settings.style : "";
  const pageStyleLabel = HOME_STYLES.find((s) => s.id === pageStyleId)?.label || "Current";

  return (
    <Drawer key={dock} direction={dock} open={open} modal={false} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DrawerContent direction={dock} className={peek ? "" : "max-h-[85vh]"} style={peek ? { maxHeight: `${peekH}vh`, height: `${peekH}vh` } : undefined} {...sheetPortalGuards}>
        {peek && dock === "bottom" && (
          <div role="separator" aria-label="Drag to resize" onPointerDown={onPeekHandleDown} onPointerMove={onPeekHandleMove} onPointerUp={onPeekHandleUp}
            className="w-full flex justify-center py-1 cursor-ns-resize" style={{ touchAction: "none" }}>
            <span className="w-10 h-1 rounded-full bg-border" />
          </div>
        )}
        <DrawerHeader className="pb-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <DrawerTitle className={peek ? "text-sm" : "text-base"}>{settings.label || defLabel}</DrawerTitle>
              {/* Screen-reader only: a visible explainer line here just ate
                  sheet space (house rule — no descriptive filler). */}
              <DrawerDescription className="sr-only">Widget options</DrawerDescription>
            </div>
            <span className="flex items-center gap-1.5 flex-shrink-0">
            <button type="button" onClick={flipDock}
              aria-label="Move this panel to the other edge" title="Move this panel to the other edge"
              className="flex items-center justify-center w-8 h-8 rounded-lg border border-border/60 text-muted-foreground hover:text-foreground">
              {dock === "top" ? <ArrowDownToLine className="w-3.5 h-3.5" /> : <ArrowUpToLine className="w-3.5 h-3.5" />}
            </button>
            <button type="button" onClick={() => setPeek((v) => !v)}
              className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border ${
                peek ? "border-primary/60 bg-primary/10 text-primary" : "border-border/60 text-muted-foreground hover:text-foreground"
              }`}>
              {peek ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {peek ? "Full panel" : "Peek"}
            </button>
            </span>
          </div>
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

          <SubSection title="Widget config" icon={Settings2}>
          {/* Widget-specific options, declared by the registry entry. A
              field with section:"ui" (a size, a shape) renders under UI &
              text instead — config is WHAT the widget shows. */}
          {(def.configFields || []).filter((f) => f.section !== "ui").map((f) => {
            // showIf: a field only appears when it means something for the
            // current settings — the cure for option-soup config sheets.
            if (typeof f.showIf === "function" && !f.showIf(settings)) return null;
            if (f.type === "pinnedAlters") return <PinnedAltersConfigPanel key={f.key} />;
            const val = settings[f.key] ?? f.default ?? "";
            const commit = (v) => onSettings(widget.instanceId, { [f.key]: v });
            return (
              <div key={f.key}>
                {f.type !== "toggle" && (
                  <label className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground block mb-1">
                    {applyTerms(f.label, t)}
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
                    <span>{applyTerms(f.label, t)}</span>
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
                {/* Static multi-pick: same chips as select, but each toggles
                    membership in an array (e.g. which task sets a widget shows). */}
                {f.type === "multi" && (
                  <div className="flex flex-wrap gap-1.5">
                    {(f.options || []).map((o) => {
                      const arr = Array.isArray(val) ? val : (val != null ? [val] : []);
                      const on = arr.some((x) => String(x) === String(o.value));
                      return (
                        <button key={o.value} type="button" aria-pressed={on}
                          onClick={() => commit(on ? arr.filter((x) => String(x) !== String(o.value)) : [...arr, o.value])}
                          className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                            on ? "border-primary/60 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground hover:text-foreground"
                          }`}>
                          {o.label}
                        </button>
                      );
                    })}
                  </div>
                )}
                {f.type === "dynamicSelect" && (
                  <DynamicSelectField field={f} value={val} onChange={commit} />
                )}
                {f.type === "arrangement" && (
                  <AlterArrangementEditor value={Array.isArray(val) ? val : []} onChange={commit} />
                )}
                {f.type === "symptoms" && (
                  <DynamicMultiField field={{ ...f, source: "symptoms" }} value={Array.isArray(val) ? val : []}
                    onChange={commit} terms={t} />
                )}
                {f.type === "dynamicMulti" && (
                  <DynamicMultiField field={f} value={Array.isArray(val) ? val : []} onChange={commit} terms={t} />
                )}
                {f.type === "links" && (
                  <LinksField value={Array.isArray(val) ? val : []} onChange={(next) => commit(next)} />
                )}
                {f.type === "group" && (
                  <GroupField value={val || ""} onChange={(v) => commit(v || "")} />
                )}
                {f.type === "apps" && (
                  <AppListField value={Array.isArray(val) ? val : []}
                    onChange={(next) => commit(next)} terms={t} />
                )}
                {/* A range reads as "drag me"; a number box reads as "type an
                    exact value", which is the wrong affordance for a size. */}
                {f.type === "song" && (
                  <ProfileSongPicker value={val || null} onChange={(v) => commit(v)} subjectLabel="page" />
                )}
                {f.type === "range" && (
                  <div>
                    <input type="range" value={Number(val) || 0}
                      min={f.min ?? 0} max={f.max ?? 100} step={f.step ?? 1}
                      onChange={(e) => commit(Number(e.target.value))}
                      aria-label={f.label}
                      className="w-full accent-primary" />
                    <span className="text-[0.6875rem] text-muted-foreground">
                      {f.format ? f.format(Number(val) || 0) : `${Number(val) || 0}${f.unit || "px"}`}
                    </span>
                  </div>
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

          </SubSection>
          {/* Appearance overrides, in the unified edit-menu anatomy
              (docs/v2-edit-menu-spec.md): UI size / Colors / Background /
              Presets, each a chevron section, sliders behind set buttons.
              These write CSS variables onto the widget wrapper, so the
              whole-app settings apply by default and this widget alone
              departs from them where the user says so. */}
          <SubSection title="UI & text" icon={Type} defaultOpen>
          {/* Layout (mode / across / down / content size) lives here with type
              and shape — one standard section, not two (the user's call). */}

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

          {/* Content alignment within the widget's box. Centered by
              default; overflowing content still starts at the top. */}
          <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">Alignment</p>
          <div>
            <label className="text-xs font-medium block mb-1">Horizontal</label>
            <div className="flex flex-wrap gap-1.5">
              {[["stretch", "Fill"], ["left", "Left"], ["center", "Center"], ["right", "Right"]].map(([v, label]) => (
                <button key={v} type="button"
                  onClick={() => onSettings(widget.instanceId, { halign: v })}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                    (settings.halign || "stretch") === v
                      ? "border-primary/60 bg-primary/10 text-primary"
                      : "border-border/50 text-muted-foreground hover:text-foreground"
                  }`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium block mb-1">Vertical</label>
            <div className="flex flex-wrap gap-1.5">
              {[["top", "Top"], ["center", "Center"], ["bottom", "Bottom"]].map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => onSettings(widget.instanceId, { valign: v })}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                    (settings.valign || "center") === v
                      ? "border-primary/60 bg-primary/10 text-primary"
                      : "border-border/50 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Scales everything the widget draws (rows, buttons, avatars,
              spacing), on top of whatever text size is set. */}
          {/* Same set-then-slide row as every other size here — a bare
              slider moved on a scroll through the sheet (the report). */}
          <SliderRow label="Content size" value={settings.controlScale} fallback={100}
            min={60} max={200} step={5} unit="%"
            onChange={(v) => onSettings(widget.instanceId, { controlScale: v })}
            onReset={() => onSettings(widget.instanceId, { controlScale: "" })} />
          {/* Size / shape fields a widget declares for this section (e.g.
              the pinned bar's height and icon size). Ranges only — that's
              what a size is. */}
          {(def.configFields || []).filter((f) => f.section === "ui" && f.type === "range").map((f) => {
            const val = settings[f.key] ?? f.default ?? 0;
            return (
              <div key={f.key}>
                <label className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground block mb-1">
                  {applyTerms(f.label, t)} — {f.format ? f.format(Number(val) || 0) : `${Number(val) || 0}${f.unit || "px"}`}
                </label>
                <input type="range" value={Number(val) || 0} min={f.min ?? 0} max={f.max ?? 100} step={f.step ?? 1}
                  onChange={(e) => onSettings(widget.instanceId, { [f.key]: Number(e.target.value) })}
                  aria-label={f.label} className="w-full accent-primary" />
              </div>
            );
          })}

          <div className="space-y-3 pt-2 border-t border-border/30">
            <div>
              <label className="text-xs font-medium block mb-1">Font</label>
              <SearchableSelect
                value={settings.font || ""}
                onChange={(v) => onSettings(widget.instanceId, { font: v || "" })}
                // Includes the user's own uploaded fonts, not just the
                // built-in catalogue (owner rule).
                options={fontOptions}
                placeholder="Use the app font"
                searchPlaceholder="Search fonts…"
                renderOption={(o) => (
                  <span style={{ fontFamily: o.id || undefined }}>{o.label}</span>
                )}
              />
            </div>

            <SliderRow label="Corner radius" value={settings.radius} fallback={12}
              min={0} max={32} unit="px"
              onChange={(v) => onSettings(widget.instanceId, { radius: v })}
              onReset={() => onSettings(widget.instanceId, { radius: "" })} />

            <SliderRow label="Border width" value={settings.borderW} fallback={1}
              min={0} max={8} unit="px"
              onChange={(v) => onSettings(widget.instanceId, { borderW: v })}
              onReset={() => onSettings(widget.instanceId, { borderW: "" })} />

            <SliderRow label="Text size" value={settings.fontScale} fallback={100}
              min={70} max={160} unit="%"
              onChange={(v) => onSettings(widget.instanceId, { fontScale: v })}
              onReset={() => onSettings(widget.instanceId, { fontScale: "" })} />

            <SliderRow label="Inner spacing" value={settings.padding} fallback={12}
              min={0} max={32} unit="px"
              onChange={(v) => onSettings(widget.instanceId, { padding: v })}
              onReset={() => onSettings(widget.instanceId, { padding: "" })} />

            <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3">
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
          </div>
          </SubSection>

          <SubSection title="Colors & background" icon={Palette}>
          <div className="space-y-3">
            {/* Four swatches on one line. The name, hex field, opacity,
                Clear and "use the app colour" all live inside each picker's
                popover — labelling them in the row squeezed the text into
                unreadable vertical slivers on a narrow sheet.
                Opacity sits with its OWN colour rather than applying to the
                whole widget, so you can ghost the text, see through the
                border, or fade a gradient out independently. Dragging one
                anchors to the live colour so there's something to fade. */}
            <div>
              <label className="text-xs font-medium block mb-1.5">Colours</label>
              <div className="flex items-center gap-3">
                <ColorPicker compact label="Highlight colour"
                  value={settings.accent || live.accent || "#3b82f6"}
                  onChange={(v) => onSettings(widget.instanceId, { accent: v })}
                  opacity={{ value: settings.accentOpacity, onChange: (v) => setAlpha("accent", "accentOpacity", v, live.accent || "#3b82f6") }}
                  onClear={() => onSettings(widget.instanceId, { accent: "", accentOpacity: "" })}
                  extraAction={{ label: "Use the app colour", onClick: () => onSettings(widget.instanceId, { accent: "", accentOpacity: "" }) }} />
                <ColorPicker compact label="Background"
                  value={settings.bg || live.bg || "#111827"}
                  onChange={(v) => onSettings(widget.instanceId, { bg: v })}
                  opacity={{ value: settings.bgOpacity, onChange: (v) => setAlpha("bg", "bgOpacity", v, live.bg || "#111827") }}
                  onClear={() => onSettings(widget.instanceId, { bg: "", bgOpacity: "" })} />
                <ColorPicker compact label="Text colour"
                  value={settings.textColor || live.textColor || "#e5e7eb"}
                  onChange={(v) => onSettings(widget.instanceId, { textColor: v })}
                  opacity={{ value: settings.textOpacity, onChange: (v) => setAlpha("textColor", "textOpacity", v, live.textColor || "#e5e7eb") }}
                  onClear={() => onSettings(widget.instanceId, { textColor: "", textOpacity: "" })} />
                <ColorPicker compact label="Border colour"
                  value={settings.borderColor || live.borderColor || "#3b82f6"}
                  onChange={(v) => onSettings(widget.instanceId, { borderColor: v })}
                  opacity={{ value: settings.borderOpacity, onChange: (v) => setAlpha("borderColor", "borderOpacity", v, live.borderColor || "#3b82f6") }}
                  onClear={() => onSettings(widget.instanceId, { borderColor: "", borderOpacity: "" })} />
              </div>
            </div>
            {/* Effects — the same two the built-in styles use, so a user can
                build Aero (or anything else) themselves. */}
            <div>
              <label className="text-xs font-medium block mb-1.5">Gradient</label>
              <div className="flex items-center gap-3">
                <ColorPicker compact label="Gradient start"
                  value={gradHex(effective.gradFrom) || live.bg || "#38bdf8"}
                  onChange={(v) => onSettings(widget.instanceId, { gradFrom: v, ...(gradHex(settings.gradTo) ? {} : { gradTo: gradHex(effective.gradTo) || "#6ee7b7" }) })}
                  opacity={{ value: settings.gradFromOpacity ?? effective.gradFromOpacity, onChange: (v) => setAlpha("gradFrom", "gradFromOpacity", v, gradHex(effective.gradFrom) || live.bg || "#38bdf8") }}
                  onClear={() => onSettings(widget.instanceId, { gradFrom: "", gradTo: "", gradFromOpacity: "", gradToOpacity: "" })} />
                <ColorPicker compact label="Gradient end"
                  value={gradHex(effective.gradTo) || "#6ee7b7"}
                  onChange={(v) => onSettings(widget.instanceId, { gradTo: v, ...(gradHex(settings.gradFrom) ? {} : { gradFrom: gradHex(effective.gradFrom) || live.bg || "#38bdf8" }) })}
                  opacity={{ value: settings.gradToOpacity ?? effective.gradToOpacity, onChange: (v) => setAlpha("gradTo", "gradToOpacity", v, gradHex(effective.gradTo) || "#6ee7b7") }}
                  onClear={() => onSettings(widget.instanceId, { gradFrom: "", gradTo: "", gradFromOpacity: "", gradToOpacity: "" })} />
                <span className="text-[0.6875rem] text-muted-foreground">
                  {gradOn ? "on" : "pick both"}
                </span>
              </div>
              {gradOn && (
                <SliderRow label="Gradient angle" value={settings.gradAngle} fallback={Number(effective.gradAngle) || 135}
                  min={0} max={360} step={15} unit="°"
                  onChange={(v) => onSettings(widget.instanceId, { gradAngle: v })}
                  onReset={() => onSettings(widget.instanceId, { gradAngle: "" })} />
              )}
            </div>

            <SliderRow label="Frosted blur" value={settings.blur} fallback={0}
              min={0} max={24} unit="px"
              onChange={(v) => onSettings(widget.instanceId, { blur: v })}
              onReset={() => onSettings(widget.instanceId, { blur: "" })} />

            <div>
              <label className="text-xs font-medium block mb-1">Background image</label>
              <div className="flex items-center gap-2 flex-wrap">
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
                      className="text-xs px-2 py-1 rounded-full border border-border/50 text-muted-foreground flex-shrink-0 whitespace-nowrap">Remove</button>
                  </>
                )}
              </div>
            </div>

            {/* The escape hatch: your own CSS, scoped to this widget. */}
            <div>
              <button type="button" onClick={() => setCssOpen((v) => !v)}
                className="w-full flex items-center justify-between text-xs font-medium py-1">
                <span>Your own CSS{ownCss ? " — in use" : ""}</span>
                <ChevronDown className="w-3.5 h-3.5" style={{ transform: cssOpen ? "rotate(180deg)" : "none", transition: "transform .18s" }} />
              </button>
              {cssOpen && (
                <>
                  <DebouncedText multiline rows={5} value={ownCss}
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
          </SubSection>

          <SubSection title="Presets">
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
                <div className="space-y-2 pb-1">
                  <div className="flex gap-1.5">
                    <input autoFocus value={styleName} onChange={(e) => setStyleName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") saveStyle(); if (e.key === "Escape") setNaming(false); }}
                      placeholder="Name this style" maxLength={40}
                      className="flex-1 h-8 px-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                    <button type="button" onClick={saveStyle} disabled={!styleName.trim() || saveGroups.length === 0}
                      className="text-xs px-2.5 py-1.5 rounded-lg border border-primary/50 text-primary disabled:opacity-40">Save</button>
                    <button type="button" onClick={() => setNaming(false)}
                      className="text-xs px-2.5 py-1.5 rounded-lg border border-border/50 text-muted-foreground">Cancel</button>
                  </div>
                  {/* What the style carries. Leave them all on and it's a
                      whole look; untick some and it becomes a partial style
                      you can lay over anything — which is why saved styles
                      show what they touch. */}
                  <div className="flex flex-wrap gap-1">
                    {LOOK_GROUPS.map((g) => {
                      const on = saveGroups.includes(g.id);
                      return (
                        <button key={g.id} type="button"
                          onClick={() => setSaveGroups((prev) => (on ? prev.filter((x) => x !== g.id) : [...prev, g.id]))}
                          aria-pressed={on}
                          className={`text-[0.6875rem] px-2 py-1 rounded-full border ${
                            on ? "border-primary/60 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground"
                          }`}>{g.label}</button>
                      );
                    })}
                  </div>
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
                const cov = lookCoverage(st.look || {});
                return (
                  <div key={st.id}>
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
                    on ? "border-primary/60 bg-primary/10" : "border-border/40"
                  }`}>
                    <button type="button" className="flex-1 text-left text-sm font-medium min-w-0"
                      onClick={() => onSettings(widget.instanceId, { style: `${USER_STYLE_PREFIX}${st.id}` })}>
                      <span className="truncate block">{st.label}</span>
                      <span className="text-xs text-muted-foreground block">Yours</span>
                    </button>
                    {/* A style that decides everything needs no caveat. One
                        that leaves parts alone says so, and the star opens
                        exactly what it does and doesn't touch. */}
                    {!cov.complete && (
                      <button type="button"
                        aria-label={`What "${st.label}" changes`}
                        title="Partial style — see what it changes"
                        onClick={() => setExclusionsFor(exclusionsFor === st.id ? null : st.id)}
                        className={`p-1 flex-shrink-0 ${exclusionsFor === st.id ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}>
                        <Star className="w-3.5 h-3.5" />
                      </button>
                    )}
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
                  {exclusionsFor === st.id && (
                    <div className="mt-1 mb-1 px-3 py-2 rounded-lg border border-border/40 bg-muted/30 space-y-1.5">
                      <div>
                        <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">Changes</p>
                        <p className="text-xs">{cov.covers.map((g) => g.label).join(", ") || "nothing"}</p>
                      </div>
                      <div>
                        <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">Leaves alone</p>
                        <p className="text-xs">{cov.leaves.map((g) => g.label).join(", ")}</p>
                      </div>
                    </div>
                  )}
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
              {/* The user's app themes, translated into widget looks
                  (owner request). Applying one writes the look onto this
                  widget, so it stays tweakable afterwards. */}
              {themeLookEntries.length > 0 && (
                <>
                  <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground pt-2">
                    From your app themes
                  </p>
                  {themeLookEntries.map(({ name, preset, mine }) => (
                    <button
                      key={`theme_${name}`}
                      type="button"
                      onClick={() => onSettings(widget.instanceId, { ...themeToLook(preset, isDarkMode), style: "" })}
                      className="w-full text-left px-3 py-2 rounded-lg border border-border/40 hover:border-border text-sm transition-all flex items-center gap-2.5"
                    >
                      <span className="w-6 h-6 rounded-md border border-border/50 flex-shrink-0"
                        style={{ backgroundImage: `linear-gradient(135deg, ${(preset.dark || preset.light)?.surface || "#222"}, ${(preset.dark || preset.light)?.primary || "#888"})` }} />
                      <span className="min-w-0">
                        <span className="font-medium capitalize block truncate">{name}</span>
                        <span className="text-xs text-muted-foreground block">{mine ? "Your theme" : "Built-in theme"}</span>
                      </span>
                    </button>
                  ))}
                  <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground pt-2">
                    Widget styles
                  </p>
                </>
              )}
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

          </SubSection>

          {/* Icon override — app shortcuts only */}
          {widget.widgetId === "app_shortcut" && (
            <SubSection title="Icon">
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
            </SubSection>
          )}
          <div className="pt-2 border-t border-border/50 space-y-2">
            {/* Copy this widget's look onto others — the alternative is
                re-setting eight fields per widget by hand. */}
            {onApplyLook && (
              <div className="rounded-lg border border-border/40 overflow-hidden">
                <button type="button" onClick={() => setApplyOpen((v) => !v)}
                  aria-expanded={applyOpen}
                  className="w-full flex items-center gap-2 px-3 py-2.5 bg-muted/15 hover:bg-muted/30 text-left">
                  <Copy className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="flex-1 text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">
                    Apply this look to…
                  </span>
                  <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${applyOpen ? "rotate-180" : ""}`} />
                </button>
                {applyOpen && (
                  <div className="px-3 py-3 space-y-1.5 border-t border-border/30">
                    {[
                      ["page", "All widgets on this page"],
                      ["all", "All widgets, every page"],
                      ["pick", "Pick widgets…"],
                    ].map(([scope, label]) => (
                      <button key={scope} type="button"
                        onClick={() => { setApplyOpen(false); onApplyLook(scope); }}
                        className="w-full text-left text-sm px-3 h-9 rounded-lg border border-border/50 hover:bg-muted/40">
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Reached by holding a widget, where the user often wants to
                MOVE it rather than restyle it — without this they had to
                close the sheet and find edit mode themselves. */}
            {onEditLayout && (
              <button
                type="button"
                onClick={onEditLayout}
                className="w-full flex items-center justify-center gap-2 h-10 rounded-lg border border-border/60 text-sm font-medium hover:bg-muted/50"
              >
                <LayoutGrid className="w-4 h-4" /> Move &amp; resize widgets
              </button>
            )}
            {/* Undo every tweak at once — size, mode, name, look, alignment,
                content size and this widget's own options. */}
            <button
              type="button"
              onClick={async () => {
                const ok = await confirm({
                  title: `Reset ${settings.label || defLabel} to default?`,
                  body: "Its size, display mode, name, look and options all go back to how the widget ships. It stays on the page, and none of your data changes.",
                  confirmLabel: "Reset",
                });
                if (ok) onResetWidget?.(widget.instanceId);
              }}
              className="w-full flex items-center justify-center gap-2 h-10 rounded-lg border border-border/60 text-sm font-medium hover:bg-muted/50"
            >
              <RotateCcw className="w-4 h-4" /> Reset all
            </button>
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
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
