// Per-widget advanced config for the experimental homescreen — a bottom
// sheet (vaul Drawer) hosted ONCE at ExperimentalDashboard level and keyed
// by the widget instanceId being configured. The caller derives the live
// widget from home state each render, so persisted changes flow straight
// back into the open sheet.
//
// The inspector (v0.287.0): five fixed tabs — Content · Text · Shape ·
// Colour · Styles — one on screen at a time, every setting one row
// (SettingRows.jsx), the real current value always visible, a × to clear
// one value and a Reset per tab. INSPECTOR_TABS in widgetLook.js is the
// one table behind the strip, the dots and each tab's Reset.
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
import { DebouncedText, RichTextField } from "@/components/shared/DebouncedFields";
import { Image as ImageIcon, X, Trash2, ChevronDown, ChevronUp, Check, RotateCcw, Palette, Copy, Star, ArrowUpToLine, ArrowDownToLine, Type, Move, Square, Code2, Plus, MoreHorizontal, ListChecks } from "lucide-react";
import PinnedAltersConfigPanel from "@/components/alters/PinnedAltersConfigPanel";
import IconPicker from "@/components/shared/IconPicker";
import { useBoardSubject } from "@/lib/boardSubject";
import { usePeekHeight, PeekHandle } from "@/components/v2/PeekResize";
import FontUploadButton from "@/components/shared/FontUploadButton";
import { DOCK_KEY } from "@/components/v2/V2Frame";
import UndoRedoButtons from "@/components/v2/UndoRedoHistory";
import { useFontOptions } from "@/lib/useFontOptions";
import { confirm } from "@/components/shared/ConfirmDialog";
import { toast } from "sonner";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription,
} from "@/components/ui/drawer";
import { HOME_MODES, effectiveMode, layerOf } from "@/lib/experimentalHome";
import { HOME_STYLES } from "@/lib/homeStyles";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { useTerms } from "@/lib/useTerms";
import { useTheme } from "@/lib/ThemeContext";
import AlterArrangementEditor from "@/components/shared/AlterArrangementEditor";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { buildGridItems } from "@/lib/navCatalogue";
import { useModPagesVersion } from "@/lib/mods/registry";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import ProfileSongPicker from "@/components/shared/ProfileSongPicker";
import {
  themeToLook, BORDER_STYLES, SHADOW_PRESETS, USER_STYLE_PREFIX,
  LOOK_GROUPS, LOOK_SECTIONS, lookCoverage, lookForGroups, OFF, mergeLook, pickLook, userStyleId,
  FONT_STYLE_OPTIONS, textSplitPatch, inheritedHeaderStyles, sectionResetPatch,
  INSPECTOR_TABS, tabResetPatch, tabHasOwn,
} from "@/lib/widgetLook";
// The one row grammar every edit menu shares (v0.287.0).
import {
  Row, StackedRow, Group, SwitchRow, Segmented, Chips, ChoiceRow, SliderRow, ColourRow, TabBar,
} from "@/components/shared/SettingRows";
import { getStyleLook } from "@/lib/homeStyles";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { SearchableMultiList } from "@/v2/widgets";
import { widgetAutoLabel } from "@/lib/widgetRegistry";
import { foldedSettings } from "@/lib/widgetFold";
import { sheetPortalGuards } from "@/lib/sheetPortalGuards";
import { useEdgeSafeSliders } from "@/lib/gestureExclusion";
import { applyTerms } from "@/lib/dailyTaskSystem";
import { resolveQuickButtons, QUICK_BUTTON_DEFS } from "@/components/dashboard/QuickCheckinButtons";
import LucideByName from "@/components/shared/LucideByName";

function AppListField({ value = [], onChange, terms }) {
  const [q, setQ] = React.useState("");
  const modNavV = useModPagesVersion();
  const items = React.useMemo(() => buildGridItems(terms.Alters, terms.System), [terms.Alters, terms.System, modNavV]);
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

// Pick-and-order list: each option has a checkbox and, while on, up/down
// arrows. Stores the array of enabled values in display order. Generic —
// the header widget's name/date/time uses it, and anything else whose
// config is "which of these, in what order".
function OrderToggleField({ field, value, onChange }) {
  const options = field.options || [];
  const stored = Array.isArray(value) ? value.filter((v) => options.some((o) => o.value === v)) : null;
  const enabled = stored && stored.length ? stored : (field.default || []);
  const rest = options.filter((o) => !enabled.includes(o.value));
  const move = (id, dir) => {
    const i = enabled.indexOf(id);
    const j = i + dir;
    if (i === -1 || j < 0 || j >= enabled.length) return;
    const next = [...enabled];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const toggle = (id, on) => {
    if (on) onChange([...enabled, id]);
    else if (enabled.length > 1) onChange(enabled.filter((x) => x !== id));
  };
  const row = (o, on, idx) => (
    <div key={o.value} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-border/40">
      <input type="checkbox" checked={on} disabled={on && enabled.length === 1}
        onChange={(e) => toggle(o.value, e.target.checked)}
        aria-label={o.label} className="w-4 h-4 rounded accent-primary flex-shrink-0" />
      <span className={`flex-1 text-sm truncate ${on ? "" : "text-muted-foreground"}`}>{o.label}</span>
      {on && (
        <span className="flex items-center gap-0.5 flex-shrink-0">
          <button type="button" aria-label={`Move ${o.label} up`} disabled={idx === 0}
            onClick={() => move(o.value, -1)}
            className="w-7 h-7 flex items-center justify-center rounded-lg border border-border/50 text-muted-foreground hover:text-foreground disabled:opacity-30">
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <button type="button" aria-label={`Move ${o.label} down`} disabled={idx === enabled.length - 1}
            onClick={() => move(o.value, 1)}
            className="w-7 h-7 flex items-center justify-center rounded-lg border border-border/50 text-muted-foreground hover:text-foreground disabled:opacity-30">
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </span>
      )}
    </div>
  );
  return (
    <div className="space-y-1">
      {enabled.map((id, idx) => { const o = options.find((x) => x.value === id); return o ? row(o, true, idx) : null; })}
      {rest.map((o) => row(o, false, -1))}
    </div>
  );
}

// The quick-action-buttons widget's per-button editor: toggle, reorder,
// rename and re-icon each button (any icon, or an uploaded image).
// Stores [{ id, on, label, iconName, iconUrl }].
function ButtonIconPreview({ iconUrl, iconName, Fallback }) {
  const src = useResolvedAvatarUrl(iconUrl || "");
  if (iconUrl && src) return <img src={src} alt="" className="w-4 h-4 rounded-[4px] object-cover" />;
  if (iconName) return <LucideByName name={iconName} className="w-4 h-4" fallback={<Fallback className="w-4 h-4" />} />;
  return <Fallback className="w-4 h-4" />;
}
function QuickButtonsField({ settings, onChange, terms }) {
  const buttons = resolveQuickButtons(settings);
  const [iconFor, setIconFor] = React.useState(null); // button id
  const onCount = buttons.filter((b) => b.on).length;
  const commit = (next) => onChange(next.map((b) => ({ id: b.id, on: b.on, label: b.label || "", iconName: b.iconName || "", iconUrl: b.iconUrl || "" })));
  const patch = (id, p) => commit(buttons.map((b) => (b.id === id ? { ...b, ...p } : b)));
  const move = (id, dir) => {
    const i = buttons.findIndex((b) => b.id === id);
    const j = i + dir;
    if (i === -1 || j < 0 || j >= buttons.length) return;
    const next = [...buttons];
    [next[i], next[j]] = [next[j], next[i]];
    commit(next);
  };
  return (
    <div className="space-y-1">
      {buttons.map((b, idx) => {
        const def = QUICK_BUTTON_DEFS.find((d) => d.id === b.id);
        if (!def) return null;
        const DefIcon = def.icon;
        const label = applyTerms(def.label, terms);
        return (
          <div key={b.id} className={`rounded-lg border px-2.5 py-1.5 space-y-1.5 ${b.on ? "border-border/50" : "border-border/30"}`}>
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={b.on} disabled={b.on && onCount === 1}
                onChange={(e) => patch(b.id, { on: e.target.checked })}
                aria-label={label} className="w-4 h-4 rounded accent-primary flex-shrink-0" />
              <span className={`flex-1 text-sm truncate ${b.on ? "" : "text-muted-foreground"}`}>{b.label || label}</span>
              <span className="flex items-center gap-0.5 flex-shrink-0">
                <button type="button" aria-label={`Move ${label} up`} disabled={idx === 0}
                  onClick={() => move(b.id, -1)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg border border-border/50 text-muted-foreground hover:text-foreground disabled:opacity-30">
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <button type="button" aria-label={`Move ${label} down`} disabled={idx === buttons.length - 1}
                  onClick={() => move(b.id, 1)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg border border-border/50 text-muted-foreground hover:text-foreground disabled:opacity-30">
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </span>
            </div>
            {b.on && (
              <div className="flex items-center gap-1.5 pl-6">
                <button type="button" onClick={() => setIconFor(b.id)}
                  aria-label={`${label} icon`}
                  className="w-8 h-8 flex items-center justify-center rounded-lg border border-border/50 text-muted-foreground hover:text-foreground flex-shrink-0">
                  <ButtonIconPreview iconUrl={b.iconUrl} iconName={b.iconName} Fallback={DefIcon} />
                </button>
                <DebouncedText value={b.label} placeholder={label} maxLength={40}
                  onCommit={(v) => { if (v !== b.label) patch(b.id, { label: v.trim() }); }}
                  className="flex-1 min-w-0 h-8 px-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>
            )}
          </div>
        );
      })}
      <IconPicker open={!!iconFor} onClose={() => setIconFor(null)}
        current={buttons.find((b) => b.id === iconFor)?.iconName || ""}
        onPick={(o) => { if (iconFor) patch(iconFor, { iconName: o.iconName || "", iconUrl: o.iconUrl || "" }); }} />
    </div>
  );
}

// The saved quick-action LIST (what press-and-hold on Quick Check-In
// opens) — the full Settings manager, hosted right in the widget's own
// config. Collapsed by default: it's a big panel.
const QuickActionsConfigLazy = React.lazy(() => import("@/components/settings/QuickActionsConfig"));
function QuickActionsManagerField({ label }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="rounded-lg border border-border/40 overflow-hidden">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-muted/15 hover:bg-muted/30 text-left text-sm font-medium">
        <span>{label}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-3 py-3 border-t border-border/30">
          <React.Suspense fallback={<div className="h-24 rounded-lg bg-muted/30 animate-pulse" />}>
            <QuickActionsConfigLazy />
          </React.Suspense>
        </div>
      )}
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
  innerMaps: {
    queryKey: ["innerWorldMaps"],
    queryFn: () => base44.entities.InnerWorldMap.list(),
    toOptions: (rows) => rows.filter((m) => !m.is_archived)
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map((m) => ({ id: m.id, label: m.name || "Map" })),
    searchPlaceholder: "Search maps…",
  },
  innerLayers: {
    queryKey: ["innerWorldLayersWithMaps"],
    queryFn: async () => {
      const [layers, maps] = await Promise.all([
        base44.entities.InnerWorldLayer.list(),
        base44.entities.InnerWorldMap.list(),
      ]);
      return { layers, maps };
    },
    toOptions: ({ layers = [], maps = [] } = {}) => {
      const mapName = Object.fromEntries(maps.map((m) => [m.id, m.name || "Map"]));
      return layers.map((l) => ({ id: l.id, label: `${mapName[l.map_id] || "Map"} · ${l.name || "Layer"}` }));
    },
    searchPlaceholder: "Search layers…",
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
      // The box's measured border is the OUTLINE now (Border width means
      // the widget's inner borders since v0.239.0).
      outlineW: cs ? num(cs.borderTopWidth, undefined) : undefined,
      borderStyle: cs && cs.borderTopStyle !== "none" ? cs.borderTopStyle : undefined,
      padding: cs ? num(cs.paddingTop, undefined) : undefined,
      shadow: cs && cs.boxShadow && cs.boxShadow !== "none" ? cs.boxShadow : "none",
      font: cs?.fontFamily || undefined,
      fontScale: 100,
    };
     
  }, [open, instanceId, tick]);
}

// Does the live widget draw a name the board can hide (a Section heading,
// a command key's label)? Read off the DOM, like the live colours, so the
// "Show the name" switch only appears where it does something.
function useHasWidgetLabel(open, instanceId, tick) {
  const [has, setHas] = React.useState(false);
  React.useEffect(() => {
    if (!open || !instanceId) return undefined;
    const raf = requestAnimationFrame(() => {
      const node = document.querySelector(`[data-widget-id="${instanceId}"]`);
      setHas(!!node?.querySelector("[data-widget-label]"));
    });
    return () => cancelAnimationFrame(raf);
  }, [open, instanceId, tick]);
  return has;
}

// Which parts of a look to carry — the look sections, used by both "Save
// this look as a style" and "Apply this look to…".
function PartTicks({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1">
      {LOOK_GROUPS.map((g) => {
        const on = value.includes(g.id);
        return (
          <button key={g.id} type="button" aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== g.id) : [...value, g.id])}
            className={`text-[0.6875rem] px-2 py-1 rounded-full border ${
              on ? "border-primary/60 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground"
            }`}>{g.id === "layout" ? "Layout (spacing)" : g.label}</button>
        );
      })}
    </div>
  );
}

// The look of a set of font-style flags, for the preview and the toggles.
const FLAG_STYLE = {
  bold: { fontWeight: 700 },
  light: { fontWeight: 300 },
  italic: { fontStyle: "italic" },
  underline: { textDecorationLine: "underline" },
  strikethrough: { textDecorationLine: "line-through" },
  smallcaps: { fontVariant: "small-caps" },
  uppercase: { textTransform: "uppercase" },
};
function flagsStyle(flags = []) {
  const out = {};
  const deco = [];
  for (const f of flags) {
    if (f === "underline") deco.push("underline");
    else if (f === "strikethrough") deco.push("line-through");
    else Object.assign(out, FLAG_STYLE[f] || {});
  }
  if (deco.length) out.textDecorationLine = deco.join(" ");
  return out;
}

// Font styles as one row of toggles (B · L · I · U · S · small caps · caps).
// Bold and Light are opposite weights — picking one drops the other.
const STYLE_FACE = {
  bold: <b>B</b>, light: <span style={{ fontWeight: 300 }}>L</span>, italic: <i>I</i>,
  underline: <u>U</u>, strikethrough: <s>S</s>,
  smallcaps: <span style={{ fontVariant: "small-caps" }}>Aa</span>, uppercase: <span className="text-[0.625rem]">AA</span>,
};
function FontStyleToggles({ value = [], onChange }) {
  const toggle = (id) => {
    let next = value.includes(id) ? value.filter((x) => x !== id) : [...value, id];
    if (id === "bold" && next.includes("bold")) next = next.filter((x) => x !== "light");
    if (id === "light" && next.includes("light")) next = next.filter((x) => x !== "bold");
    onChange(next);
  };
  return (
    <div className="flex gap-1" role="group" aria-label="Style">
      {FONT_STYLE_OPTIONS.map(({ id, label }) => {
        const on = value.includes(id);
        return (
          <button key={id} type="button" aria-pressed={on} aria-label={label} title={label} onClick={() => toggle(id)}
            className={`w-8 h-8 rounded-lg border text-sm flex items-center justify-center ${
              on ? "border-primary/60 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground hover:text-foreground"
            }`}>{STYLE_FACE[id] || label}</button>
        );
      })}
    </div>
  );
}

// The four per-side rows under Inner spacing / Outline, opened from a
// small link under the uniform row and kept open while any side is set.
function SideRows({ sides, settings, fallback, min, max, set, setHere }) {
  const anySet = setHere(sides.map(([k]) => k));
  const [open, setOpen] = React.useState(false);
  const shown = open || anySet;
  return (
    <>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={shown}
        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 py-1">
        <ChevronDown className={`w-3 h-3 transition-transform ${shown ? "rotate-180" : ""}`} /> Each side{anySet ? " (set)" : ""}
      </button>
      {shown && (
        <div className="pl-3 border-l border-border/40">
          {sides.map(([key, label]) => (
            <SliderRow key={key} label={label} value={settings[key]} fallback={fallback}
              min={min} max={max} unit="px"
              onChange={(v) => set({ [key]: v })} onClear={() => set({ [key]: "" })} />
          ))}
        </div>
      )}
    </>
  );
}

// A row that opens into a panel below it (Save as a style, Apply to…).
function Disclosure({ label, hint, icon: Icon, open, onToggle, children }) {
  return (
    <div className="border-b border-border/30 last:border-b-0">
      <button type="button" onClick={onToggle} aria-expanded={open}
        className="w-full flex items-center gap-2 min-h-[44px] py-1.5 text-left">
        <span className="flex-1 min-w-0">
          <span className="text-sm block leading-tight">{label}</span>
          {hint && <span className="text-[0.6875rem] text-muted-foreground block leading-tight mt-0.5">{hint}</span>}
        </span>
        {Icon && !open && <Icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
        <ChevronDown className={`w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="pb-3 space-y-2">{children}</div>}
    </div>
  );
}

const TAB_ICONS = { content: ListChecks, text: Type, shape: Square, colour: Palette, styles: Star };

const layerBtnCls = "flex-1 min-w-0 text-xs px-1.5 min-h-[2.25rem] rounded-full border border-border/50 text-muted-foreground hover:text-foreground whitespace-nowrap";

export default function WidgetConfigSheet({
  widget,            // live widget object or null (sheet closed)
  def,               // registry entry for widget.widgetId
  pageStyleId,       // the page's style (shown as the "inherit" hint)
  onClose,
  onMode,            // (instanceId, mode)
  onSettings,        // (instanceId, patch)
  onPickIcon,        // (instanceId) → opens the shared AssetPickerModal
  onRemove,          // (instanceId) → delete this widget
  onDuplicate,       // (instanceId) → add a copy of this widget beside it
  onResetWidget,     // (instanceId) → back to registry defaults
  onEditLayout,      // () → turn on home-screen edit mode (move/resize)
  onApplyLook,       // (scope: "all" | "page" | "pick", parts?: section ids | null = all) → copy this look out
  resolvedLook = {}, // what this widget actually looks like right now
  userStyles = [],   // the user's own saved styles
  onSaveStyle,       // (label, look) → save the current look as a style
  onDeleteStyle,     // (styleId)
  onPickBackground,  // (instanceId) → opens the shared AssetPickerModal
  onRestoreSnapshot, // (instanceId, { mode, settings }, { keepCurrent }) → put the widget back how it was (Undo / Redo after closing)
  onLayer = null,    // (instanceId, "front" | "forward" | "backward" | "back") → layer order; null where widgets can't overlap
}) {
  const open = !!widget && !!def;
  // Everything in this sheet applies live and is saved as it happens, so
  // closing it always KEEPS the edits — however it's closed. (v0.293.1:
  // closing used to ask Keep / Undo / Keep editing, and one mis-tap on
  // "Undo my changes" threw away a whole fancy customisation with no way
  // back — owner report.) Instead the sheet snapshots the widget as it
  // opens, and closing with changes leaves a toast whose Undo puts the
  // widget back; that undo offers Redo, and the edited version is kept in
  // Recent changes first, so nothing done here is ever only one tap from
  // gone. One component, so every surface that hosts this menu — board,
  // home screen, desktop, profile pages, the pinned-bar config — gets it.
  const openSnap = React.useRef(null);
  React.useEffect(() => {
    if (!widget?.instanceId) { openSnap.current = null; return; }
    if (openSnap.current?.id === widget.instanceId) return;
    openSnap.current = {
      id: widget.instanceId,
      mode: widget.mode,
      settings: JSON.parse(JSON.stringify(widget.settings || {})),
    };
  }, [widget?.instanceId]);
  const editorDirty = () => {
    const snap = openSnap.current;
    if (!snap || snap.id !== widget?.instanceId) return false;
    return snap.mode !== widget.mode
      || JSON.stringify(widget.settings || {}) !== JSON.stringify(snap.settings);
  };
  const requestClose = () => {
    const snap = openSnap.current;
    if (!editorDirty() || !onRestoreSnapshot) { onClose(); return; }
    const before = { mode: snap.mode, settings: snap.settings };
    const after = { mode: widget.mode, settings: JSON.parse(JSON.stringify(widget.settings || {})) };
    const id = snap.id;
    const name = settings.label || defLabel || "this widget";
    onClose();
    const offerRedo = () => toast("Changes undone", {
      duration: 15000,
      action: { label: "Redo", onClick: () => onRestoreSnapshot(id, after) },
    });
    toast(`Saved your changes to ${name}`, {
      duration: 10000,
      action: {
        label: "Undo",
        onClick: () => { onRestoreSnapshot(id, before, { keepCurrent: true }); offerRedo(); },
      },
    });
  };
  const live = useLiveColors(open, widget?.instanceId, JSON.stringify(widget?.settings || {}) + (pageStyleId || ""));
  const drawsLabel = useHasWidgetLabel(open, widget?.instanceId, `${widget?.mode}|${JSON.stringify(widget?.settings || {})}`);
  // Which tab is showing. Remembered while the sheet stays open on one
  // widget; a new widget opens on Content.
  const [tab, setTab] = React.useState("content");
  // Android: the sliders on screen are kept out of the back-gesture zone.
  useEdgeSafeSliders(open, [tab]);
  React.useEffect(() => { setTab("content"); }, [widget?.instanceId]);
  // Each tab starts at its top — the one scroller is shared.
  const panelRef = React.useRef(null);
  React.useEffect(() => { if (panelRef.current) panelRef.current.scrollTop = 0; }, [tab]);
  // Text: which kind of text the rows edit — body or headings. One set of
  // controls on screen at a time, so a heading edit can't land on the body.
  const [textKind, setTextKind] = React.useState("body");
  // Styles: which catalogue is showing (Page style / Ready-made / Yours / Themes).
  const [styleTab, setStyleTab] = React.useState("builtin");
  const [naming, setNaming] = React.useState(false);
  const [applyOpen, setApplyOpen] = React.useState(false);
  const [cssOpen, setCssOpen] = React.useState(false);
  // Which parts "Apply this look to…" copies — all of them by default.
  const [applyParts, setApplyParts] = React.useState(LOOK_GROUPS.map((g) => g.id));
  // The ⋯ menu and its Reset… choice (just the look / everything).
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [resetAsk, setResetAsk] = React.useState(false);
  const [styleName, setStyleName] = React.useState("");
  // Which parts of the look a saved style should carry. All of them by
  // default — a preset that covers everything needs no caveats.
  const [saveGroups, setSaveGroups] = React.useState(LOOK_GROUPS.map((g) => g.id));
  const [exclusionsFor, setExclusionsFor] = React.useState(null); // style id
  // Always drag-resizable (the grab bar is the size control); height shared
  // with Display options. Opens at about half height so the widget being
  // styled stays in view (Apple's medium detent) — the first drag is
  // remembered, as before.
  const peekResize = usePeekHeight("symphony_options_peek_h", 55);
  const peekH = peekResize.peekH;
  React.useEffect(() => {
    if (!open) return undefined;
    document.documentElement.setAttribute("data-v2-peek", "1");
    // Bring the widget being styled into the visible strip above the sheet.
    const node = widget && document.querySelector(`[data-widget-id="${widget.instanceId}"]`);
    node?.scrollIntoView({ block: "start", behavior: "smooth" });
    return () => document.documentElement.removeAttribute("data-v2-peek");
  }, [open, widget]);
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
  // A folded widget's options show what it renders with (widgetFold.js).
  const settings = foldedSettings(def, widget?.settings);
  const iconPreview = useResolvedAvatarUrl(settings.iconUrl || "");
  const [iconPickerOpen, setIconPickerOpen] = React.useState(false);
  const fontOptions = useFontOptions({ inheritLabel: "App font" });
  const headFontOptions = useFontOptions({ inheritLabel: "Same as body" });
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
  const boardSubject = useBoardSubject();
  const showIfCtx = React.useMemo(() => ({ subject: boardSubject }), [boardSubject]);
  if (!open) return null;

  const defLabel = widgetAutoLabel(def, settings, t);
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
  // The look the widget is ACTUALLY drawing = the built-in / saved style
  // underneath, the widget's own fields on top (the same merge
  // widgetLookFor does), so every row shows the real current value.
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
  // What a size row falls back to while inherited: the style underneath,
  // then what is measured on screen, then the app's default.
  const num = (v, alt) => { const n = Number(v); return Number.isFinite(n) && v !== "" && v != null ? n : alt; };
  const fb = (key, liveKey, dflt) => num(effective[key], num(live[liveKey], dflt));

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
  // Host-added modes (def.extraModes — e.g. the classic home's "Classic")
  // aren't in HOME_MODES, so effectiveMode would coerce them away and the
  // wrong pill would highlight. They pass through as-is.
  const mode = (def.extraModes || []).some((x) => x.id === widget.mode)
    ? widget.mode
    : effectiveMode(widget.mode, def.supportsModes);
  const styleOverride = HOME_STYLES.some((s) => s.id === settings.style) ? settings.style : "";
  const pageStyleLabel = HOME_STYLES.find((s) => s.id === pageStyleId)?.label || "Current";
  const ownFields = (def.configFields || []).filter((f) => f.section !== "ui");
  const uiFields = (def.configFields || []).filter((f) => f.section === "ui" && f.type === "range");
  const uiFieldKeys = uiFields.map((f) => f.key);
  const extraKeys = { layout: uiFieldKeys };
  const hasOwnFields = ownFields.length > 0;
  const set = (patch) => onSettings(widget.instanceId, patch);
  const setHere = (keys) => keys.some((k) => {
    const v = settings[k];
    return v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0);
  });
  const own = (k) => setHere([k]);
  const isAppShortcut = widget.widgetId === "app_shortcut";
  // The tabs: one table (INSPECTOR_TABS) drives the strip, the dots and
  // each tab's Reset.
  const tabs = INSPECTOR_TABS.map((tb) => ({
    id: tb.id, label: tb.label, icon: TAB_ICONS[tb.id],
    dot: tb.id === "styles"
      ? setHere(["style"]) || !!ownCss
      : tb.id === "content"
        ? setHere(["label", "hideLabel", ...(isAppShortcut ? ["iconName", "iconUrl"] : [])])
        : tabHasOwn(settings, tb.id, extraKeys),
  }));
  const resetTab = (id) => set(tabResetPatch(id, extraKeys));

  // ── Text ──
  // Before a person first edits Text, headings show the body's styles too
  // (how widgets always worked). The first edit splits them, copying what
  // the headings showed into their own styles so nothing visibly changes.
  const split = effective.textSplit === true || effective.textSplit === "true";
  const bodyStyles = Array.isArray(effective.fontStyles) ? effective.fontStyles : [];
  const headStyles = split
    ? (Array.isArray(effective.headerFontStyles) ? effective.headerFontStyles : [])
    : inheritedHeaderStyles(effective);
  const setText = (patch) => set({ ...textSplitPatch(effective), ...patch });
  const fontScale = num(effective.fontScale, 100);
  const headerScale = num(effective.headerScale, 100);
  const bodyFont = effective.font || "";
  const headFont = effective.headerFont || bodyFont;
  const bodyColour = settings.textColor || live.textColor || "#e5e7eb";
  const headColour = settings.headerColor || bodyColour;

  const resetFooter = (id, label) => (
    <div className="flex justify-end pt-3">
      <button type="button" onClick={() => resetTab(id)}
        className="text-xs px-2.5 py-1.5 rounded-full border border-border/50 text-muted-foreground hover:text-foreground flex items-center gap-1">
        <RotateCcw className="w-3 h-3" /> {label}
      </button>
    </div>
  );

  // One of the widget's own fields (configFields), as a row.
  const renderOwnField = (f) => {
    if (f.type === "pinnedAlters") return <PinnedAltersConfigPanel key={f.key} />;
    // A widget's own editor (v0.295.0) — e.g. the Info widget's entries,
    // which edit the alter's info itself. Gets the live settings and the
    // same patch writer every row uses.
    if (f.type === "component" && f.Component) {
      const Editor = f.Component;
      return <div key={f.key} className="py-1"><Editor settings={settings} set={set} widget={widget} /></div>;
    }
    if (f.type === "quickButtons") {
      return (
        <StackedRow key={f.key} label={applyTerms(f.label, t)} hint={f.help}>
          <QuickButtonsField settings={settings} terms={t} onChange={(next) => set({ [f.key]: next })} />
        </StackedRow>
      );
    }
    if (f.type === "quickActionsManager") {
      return <div key={f.key} className="py-1.5"><QuickActionsManagerField label={applyTerms(f.label, t)} /></div>;
    }
    const val = settings[f.key] ?? f.default ?? "";
    const commit = (v) => set({ [f.key]: v });
    const label = applyTerms(f.label, t);
    if (f.type === "toggle") {
      return <SwitchRow key={f.key} label={label} hint={f.help} checked={val !== false && val !== ""} onChange={commit} />;
    }
    if (f.type === "number") {
      // A number with a range is a slider (owner, v0.288.0: "row height
      // should be a slider, the stepper is unintuitive"); the box beside it
      // still takes a typed value.
      return (
        <SliderRow key={f.key} label={label} hint={f.help} value={val} fallback={f.default ?? f.min ?? 0}
          min={f.min ?? 0} max={f.max ?? 99} step={f.step ?? 1} unit={f.unit || ""} onChange={commit} />
      );
    }
    if (f.type === "range") {
      return (
        <SliderRow key={f.key} label={label} hint={f.help} value={settings[f.key]} fallback={f.default ?? 0}
          min={f.min ?? 0} max={f.max ?? 100} step={f.step ?? 1} unit={f.unit || "px"}
          onChange={commit} onClear={() => commit("")} />
      );
    }
    if (f.type === "select") {
      return (
        <ChoiceRow key={f.key} label={label} hint={f.help} value={val} onChange={commit}
          options={(f.options || []).map((o) => ({ value: o.value, label: applyTerms(String(o.label), t) }))} />
      );
    }
    if (f.type === "multi") {
      return (
        <StackedRow key={f.key} label={label} hint={f.help}>
          <Chips multiple label={label} value={val} onChange={commit}
            options={(f.options || []).map((o) => ({ value: o.value, label: applyTerms(String(o.label), t) }))} />
        </StackedRow>
      );
    }
    if (f.type === "text" && f.toolbar) {
      // Text that can be formatted (the Heading widget): full width, with
      // the shared formatting toolbar under it while it's focused.
      return (
        <StackedRow key={f.key} label={label} hint={f.help}>
          <DebouncedText key={`${widget.instanceId}:${f.key}`} value={val} placeholder={f.placeholder ? applyTerms(f.placeholder, t) : undefined}
            maxLength={f.maxLength || 2000} toolbar onCommit={(v) => { if (v !== val) commit(v); }}
            className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
        </StackedRow>
      );
    }
    if (f.type === "text") {
      return (
        <Row key={f.key} label={label} hint={f.help}>
          <DebouncedText key={`${widget.instanceId}:${f.key}`} value={val} placeholder={f.placeholder ? applyTerms(f.placeholder, t) : undefined}
            maxLength={f.maxLength || 120} onCommit={(v) => { if (v !== val) commit(v); }}
            className="w-[11rem] max-w-full h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
        </Row>
      );
    }
    return (
      <StackedRow key={f.key} label={label} hint={f.help}>
        {f.type === "orderToggle" && <OrderToggleField field={f} value={val} onChange={commit} />}
        {f.type === "richtext" && (
          /* THE full editor — same WysiwygEditor + MiniToolbar the journals
             and bios use, so text widgets can carry colours, fonts, images
             and in-app link buttons. */
          <RichTextField key={`${widget.instanceId}:${f.key}`} value={val}
            onCommit={(v) => { if (v !== val) commit(v); }} placeholder={f.placeholder} />
        )}
        {f.type === "textarea" && (
          <DebouncedText key={`${widget.instanceId}:${f.key}`} value={val} placeholder={f.placeholder}
            multiline rows={f.rows || 3} maxLength={f.maxLength || 2000}
            onCommit={(v) => { if (v !== val) commit(v); }}
            className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm resize-y focus:outline-none focus:ring-1 focus:ring-ring" />
        )}
        {f.type === "dynamicSelect" && <DynamicSelectField field={f} value={val} onChange={commit} />}
        {f.type === "arrangement" && <AlterArrangementEditor value={Array.isArray(val) ? val : []} onChange={commit} />}
        {f.type === "symptoms" && (
          <DynamicMultiField field={{ ...f, source: "symptoms" }} value={Array.isArray(val) ? val : []} onChange={commit} terms={t} />
        )}
        {f.type === "dynamicMulti" && <DynamicMultiField field={f} value={Array.isArray(val) ? val : []} onChange={commit} terms={t} />}
        {f.type === "links" && <LinksField value={Array.isArray(val) ? val : []} onChange={(next) => commit(next)} />}
        {f.type === "group" && <GroupField value={val || ""} onChange={(v) => commit(v || "")} />}
        {f.type === "apps" && <AppListField value={Array.isArray(val) ? val : []} onChange={(next) => commit(next)} terms={t} />}
        {f.type === "song" && <ProfileSongPicker value={val || null} onChange={(v) => commit(v)} subjectLabel="page" />}
      </StackedRow>
    );
  };

  const styleButton = (on, onClick, title, sub, extra = null) => (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${on ? "border-primary/60 bg-primary/10" : "border-border/40"}`}>
      <button type="button" onClick={onClick} className="flex-1 text-left text-sm min-w-0">
        <span className="font-medium block truncate">{title}</span>
        {sub && <span className="text-xs text-muted-foreground block">{sub}</span>}
      </button>
      {extra}
    </div>
  );

  return (
    <Drawer key={dock} direction={dock} open={open} modal={false} onOpenChange={(v) => { if (!v) requestClose(); }}>
      <DrawerContent direction={dock} hideHandle
        style={{ maxHeight: `${peekH}vh`, height: `${peekH}vh` }} {...sheetPortalGuards}>
        {/* The grab bar IS the resize handle — every sheet is always
            drag-resizable (no separate Peek mode). */}
        <PeekHandle resize={peekResize} dock={dock} />
        {/* Reset…: how much — just the look (every tab's look and the
            style), or everything the widget ships with. */}
        {resetAsk && (
          <div className="absolute inset-0 z-50 bg-background/85 backdrop-blur-sm flex items-center justify-center p-6">
            <div className="w-full max-w-xs rounded-2xl border border-border/60 bg-card p-4 space-y-2 shadow-xl">
              <p className="text-sm font-semibold">Reset {settings.label || defLabel}?</p>
              <p className="text-xs text-muted-foreground">It stays on the page, and none of your data changes.</p>
              <button type="button"
                onClick={() => {
                  const patch = { style: "" };
                  for (const sec of LOOK_SECTIONS) Object.assign(patch, sectionResetPatch(sec.id, sec.id === "layout" ? uiFieldKeys : []));
                  set(patch);
                  setResetAsk(false);
                }}
                className="w-full h-10 rounded-lg border border-border/60 text-sm font-medium hover:bg-muted/50">
                Just how it looks
              </button>
              <button type="button"
                onClick={() => { setResetAsk(false); onResetWidget?.(widget.instanceId); }}
                className="w-full h-10 rounded-lg border border-border/60 text-sm font-medium hover:bg-muted/50">
                Everything: size, display mode, name, look and options
              </button>
              <button type="button" onClick={() => setResetAsk(false)}
                className="w-full h-9 rounded-lg text-sm text-muted-foreground hover:bg-muted/50">
                Cancel
              </button>
            </div>
          </div>
        )}
        <DrawerHeader className="pb-1.5 pt-1">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 min-w-0 flex-1">
              {/* The standard close chevron — points the way the sheet leaves. */}
              <button type="button" onClick={requestClose} aria-label="Close"
                className="p-1 -ml-1 rounded-lg text-muted-foreground hover:text-foreground flex-shrink-0">
                {dock === "top" ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              <DrawerTitle className="text-base truncate">{settings.label || defLabel}</DrawerTitle>
              <DrawerDescription className="sr-only">Widget options</DrawerDescription>
            </span>
            <span className="flex items-center gap-1.5 flex-shrink-0">
              <UndoRedoButtons />
              {/* Moving is the most common intent when you hold a widget
                  (the owner's call), so it keeps its own button. */}
              {onEditLayout && (
                <button type="button" onClick={onEditLayout} aria-label="Move and resize widgets" title="Move & resize widgets"
                  className="h-8 px-2.5 rounded-lg border border-border/60 text-xs font-medium text-muted-foreground hover:text-foreground flex items-center gap-1.5">
                  <Move className="w-3.5 h-3.5" /> Move
                </button>
              )}
              <span className="relative">
                <button type="button" onClick={() => setMenuOpen((v) => !v)} aria-haspopup="menu" aria-expanded={menuOpen}
                  aria-label="More" title="More"
                  className="flex items-center justify-center w-8 h-8 rounded-lg border border-border/60 text-muted-foreground hover:text-foreground">
                  <MoreHorizontal className="w-4 h-4" />
                </button>
                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} aria-hidden />
                    <div role="menu" className="absolute right-0 top-9 z-50 w-56 rounded-xl border border-border/60 bg-card shadow-xl p-1"
                      onKeyDown={(e) => { if (e.key === "Escape") setMenuOpen(false); }}>
                      <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); flipDock(); }}
                        className="w-full flex items-center gap-2 px-2.5 h-9 rounded-lg text-sm hover:bg-muted/50 text-left">
                        {dock === "top" ? <ArrowDownToLine className="w-3.5 h-3.5 text-muted-foreground" /> : <ArrowUpToLine className="w-3.5 h-3.5 text-muted-foreground" />}
                        Move this panel to the {dock === "top" ? "bottom" : "top"}
                      </button>
                      {onDuplicate && (
                        <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onDuplicate(widget.instanceId); }}
                          className="w-full flex items-center gap-2 px-2.5 h-9 rounded-lg text-sm hover:bg-muted/50 text-left">
                          <Copy className="w-3.5 h-3.5 text-muted-foreground" /> Duplicate this widget
                        </button>
                      )}
                      <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); setResetAsk(true); }}
                        className="w-full flex items-center gap-2 px-2.5 h-9 rounded-lg text-sm hover:bg-muted/50 text-left">
                        <RotateCcw className="w-3.5 h-3.5 text-muted-foreground" /> Reset this widget…
                      </button>
                      <button type="button" role="menuitem"
                        onClick={async () => {
                          setMenuOpen(false);
                          const ok = await confirm({
                            title: `Remove ${settings.label || defLabel}?`,
                            body: "It comes off this page. Nothing it shows is deleted, and you can add it back any time.",
                            confirmLabel: "Remove",
                            destructive: true,
                          });
                          if (ok) onRemove?.(widget.instanceId);
                        }}
                        className="w-full flex items-center gap-2 px-2.5 h-9 rounded-lg text-sm text-destructive hover:bg-destructive/10 text-left">
                        <Trash2 className="w-3.5 h-3.5" /> Remove widget
                      </button>
                    </div>
                  </>
                )}
              </span>
            </span>
          </div>
        </DrawerHeader>

        <TabBar tabs={tabs} value={tab} onChange={(id) => { setMenuOpen(false); setTab(id); }} />

        <div
          ref={panelRef} role="tabpanel" aria-labelledby={`inspector-tab-${tab}`}
          className="px-4 pt-1 overflow-y-auto overscroll-contain flex-1 min-h-0"
          // Bottom-nav height included: on pages where the classic bottom
          // bar is up, the sheet's last rows were hidden behind it.
          style={{ paddingBottom: "calc(var(--os-sab) + var(--bottom-nav-height, 0px) + 24px)" }}
        >
          {/* ── Content: name, how much it shows, and its own options ── */}
          {tab === "content" && (
            <div>
              <Row label="Name" hint={typeof def.autoLabel === "function"
                ? "Blank: follows the file that's set to play"
                : `Blank keeps “${defLabel}”`}>
                <DebouncedText
                  key={widget.instanceId}
                  value={settings.label || ""}
                  placeholder={defLabel}
                  maxLength={60}
                  onCommit={(v) => {
                    const next = v.trim();
                    if (next !== (settings.label || "")) set({ label: next });
                  }}
                  className="w-[11rem] max-w-full h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </Row>
              {/* Off = the widget drops its heading and gives the room to
                  what it shows. Only offered where the widget draws one. */}
              {(drawsLabel || settings.hideLabel) && (
                <SwitchRow label="Show the name on the widget" checked={!settings.hideLabel}
                  onChange={(on) => set({ hideLabel: on ? "" : true })} />
              )}
              {/* Display mode — the one question. `def.extraModes` lets a
                  HOST add modes of its own — the classic home offers
                  "Classic" (the untouched classic card) ahead of the board modes. */}
              {(def.supportsModes.length > 1 || (def.extraModes || []).length > 0) && (
                <ChoiceRow label="Display" value={mode} onChange={(m) => onMode(widget.instanceId, m)}
                  options={[
                    ...(def.extraModes || []).map((x) => ({ value: x.id, label: x.label })),
                    ...HOME_MODES.filter((m) => def.supportsModes.includes(m)).map((m) => ({ value: m, label: MODE_LABEL[m] })),
                  ]} />
              )}
              {isAppShortcut && (
                <Row label="Icon" own={setHere(["iconName", "iconUrl"])} onClear={() => set({ iconUrl: "", iconName: "" })}>
                  {iconPreview ? (
                    <img src={iconPreview} alt="" className="w-9 h-9 rounded-xl object-cover border border-border/40" />
                  ) : (
                    <button type="button" onClick={() => setIconPickerOpen(true)} aria-label="Choose icon"
                      className="w-9 h-9 rounded-xl border border-dashed border-border/50 flex items-center justify-center text-muted-foreground">
                      <LucideByName name={settings.iconName || ""} className="w-4 h-4" fallback={<ImageIcon className="w-4 h-4" />} />
                    </button>
                  )}
                  <button type="button" onClick={() => setIconPickerOpen(true)}
                    className="text-xs px-2.5 py-1.5 rounded-full border border-border/50 text-muted-foreground hover:text-foreground">Icon…</button>
                  <button type="button" onClick={() => onPickIcon(widget.instanceId)}
                    className="text-xs px-2.5 py-1.5 rounded-full border border-border/50 text-muted-foreground hover:text-foreground">Image…</button>
                  <IconPicker open={iconPickerOpen} onClose={() => setIconPickerOpen(false)} allowImage={false}
                    current={settings.iconName || ""}
                    onPick={(o) => set({ iconName: o.iconName || "" })} />
                </Row>
              )}
              {hasOwnFields && (
                <Group title="What it shows">
                  {ownFields.map((f, i) => {
                    // showIf: a field only appears when it means something
                    // for the current settings — the cure for option-soup.
                    if (typeof f.showIf === "function" && !f.showIf(settings, showIfCtx)) return null;
                    // A field may name a `group`; a new group gets a small heading.
                    const prevGroup = i > 0 ? ownFields[i - 1].group : undefined;
                    const head = f.group && f.group !== prevGroup
                      ? <p key={`g_${f.group}`} className="text-xs font-semibold pt-3 pb-0.5">{applyTerms(f.group, t)}</p>
                      : null;
                    const field = renderOwnField(f);
                    return head ? <React.Fragment key={f.key}>{head}{field}</React.Fragment> : field;
                  })}
                </Group>
              )}
            </div>
          )}

          {/* ── Text: body or headings, one at a time ── */}
          {tab === "text" && (
            <div>
              {/* Live preview in this widget's own fonts. */}
              <div className="rounded-xl border border-border/50 bg-muted/20 px-3 py-2.5 mt-1" aria-hidden>
                <p className="font-semibold leading-tight"
                  style={{ fontFamily: headFont || undefined, zoom: headerScale / 100, color: settings.headerColor || undefined, ...flagsStyle(headStyles) }}>
                  Heading
                </p>
                <p className="text-sm mt-0.5"
                  style={{ fontFamily: bodyFont || undefined, fontSize: `${0.875 * fontScale / 100}rem`, color: settings.textColor || undefined, ...flagsStyle(bodyStyles) }}>
                  Body text in this widget
                </p>
              </div>
              <div className="py-2">
                <Segmented label="Which text" value={textKind} onChange={setTextKind}
                  options={[{ value: "body", label: "Body" }, { value: "headings", label: "Headings" }]} />
              </div>
              {textKind === "body" ? (
                <div>
                  <Row label="Font" own={own("font")} onClear={() => setText({ font: "" })}>
                    <span className="w-[10rem] max-w-full">
                      <SearchableSelect
                        value={settings.font || ""}
                        onChange={(v) => setText({ font: v || "" })}
                        // Includes the user's own uploaded fonts (owner rule).
                        options={fontOptions}
                        placeholder="App font"
                        searchPlaceholder="Search fonts…"
                        renderOption={(o) => <span style={{ fontFamily: o.id || undefined }}>{o.label}</span>}
                      />
                    </span>
                    <FontUploadButton onUploaded={(family) => setText({ font: family })} />
                  </Row>
                  <SliderRow label="Size" value={settings.fontScale} fallback={fontScale}
                    min={70} max={160} step={5} unit="%"
                    onChange={(v) => setText({ fontScale: v })} onClear={() => set({ fontScale: "" })} />
                  <Row label="Style" own={own("fontStyles")} onClear={() => setText({ fontStyles: [] })}>
                    <FontStyleToggles value={bodyStyles} onChange={(next) => setText({ fontStyles: next })} />
                  </Row>
                  <ColourRow label="Colour" value={settings.textColor} live={live.textColor} fallback="#e5e7eb"
                    onChange={(v) => setText({ textColor: v })}
                    opacity={{ value: settings.textOpacity, onChange: (v) => setAlpha("textColor", "textOpacity", v, live.textColor || "#e5e7eb") }}
                    onClear={() => set({ textColor: "", textOpacity: "" })} />
                </div>
              ) : (
                <div>
                  <Row label="Font" own={own("headerFont")} onClear={() => setText({ headerFont: "" })}>
                    <span className="w-[10rem] max-w-full">
                      <SearchableSelect
                        value={settings.headerFont || ""}
                        onChange={(v) => setText({ headerFont: v || "" })}
                        options={headFontOptions}
                        placeholder="Same as body"
                        searchPlaceholder="Search fonts…"
                        renderOption={(o) => <span style={{ fontFamily: o.id || undefined }}>{o.label}</span>}
                      />
                    </span>
                    <FontUploadButton onUploaded={(family) => setText({ headerFont: family })} />
                  </Row>
                  <SliderRow label="Size" value={settings.headerScale} fallback={headerScale}
                    min={50} max={200} step={10} unit="%"
                    onChange={(v) => setText({ headerScale: v })} onClear={() => set({ headerScale: "" })} />
                  <Row label="Style" own={own("headerFontStyles")} onClear={() => setText({ headerFontStyles: [] })}>
                    <FontStyleToggles value={headStyles} onChange={(next) => setText({ headerFontStyles: next })} />
                  </Row>
                  <ColourRow label="Colour" value={settings.headerColor} live={headColour} fallback="#e5e7eb"
                    onChange={(v) => setText({ headerColor: v })}
                    opacity={{ value: settings.headerOpacity, onChange: (v) => setText({ headerOpacity: v, ...(settings.headerColor ? {} : { headerColor: headColour }) }) }}
                    onClear={() => set({ headerColor: "", headerOpacity: "" })} />
                  <p className="text-[0.6875rem] text-muted-foreground pt-2">
                    Headings are the widget's titles. They follow the body font until you pick one of their own, and body styles don't change them.
                  </p>
                </div>
              )}
              {resetFooter("text", "Reset text")}
            </div>
          )}

          {/* ── Shape: size, spacing and edges ── */}
          {tab === "shape" && (
            <div>
              <Group title="Size & spacing" first>
                <SliderRow label="Content size" hint="Rows, buttons, pictures and spacing"
                  value={settings.controlScale} fallback={100}
                  min={60} max={200} step={5} unit="%"
                  onChange={(v) => set({ controlScale: v })} onClear={() => set({ controlScale: "" })} />
                <div className="border-b border-border/30">
                  <SliderRow label="Inner spacing" value={settings.padding} fallback={fb("padding", "padding", 12)}
                    min={0} max={32} unit="px"
                    onChange={(v) => set({ padding: v })} onClear={() => set({ padding: "" })} />
                  <SideRows sides={[["padTop", "Top"], ["padRight", "Right"], ["padBottom", "Bottom"], ["padLeft", "Left"]]}
                    settings={settings} fallback={num(settings.padding, fb("padding", "padding", 12))} min={0} max={48} set={set} setHere={setHere} />
                </div>
                {/* Left / Right mirror the layout, not just the text. */}
                <ChoiceRow label="Across" value={settings.halign || "stretch"} onChange={(v) => set({ halign: v })}
                  own={own("halign")} onClear={() => set({ halign: "" })}
                  options={[{ value: "stretch", label: "Fill" }, { value: "left", label: "Left" }, { value: "center", label: "Centre" }, { value: "right", label: "Right" }]} />
                <ChoiceRow label="Down" value={settings.valign || "center"} onChange={(v) => set({ valign: v })}
                  own={own("valign")} onClear={() => set({ valign: "" })}
                  options={[{ value: "top", label: "Top" }, { value: "center", label: "Centre" }, { value: "bottom", label: "Bottom" }]} />
                {/* Sizes the widget itself declares (e.g. the week grid's lane strength). */}
                {uiFields.map((f) => (
                  <SliderRow key={f.key} label={applyTerms(f.label, t)}
                    value={settings[f.key]} fallback={f.default ?? 0}
                    min={f.min ?? 0} max={f.max ?? 100} step={f.step ?? 1} unit={f.unit || "px"}
                    onChange={(v) => set({ [f.key]: v })} onClear={() => set({ [f.key]: "" })} />
                ))}
              </Group>
              <Group title="Edges">
                <SliderRow label="Corners" value={settings.radius} fallback={fb("radius", "radius", 12)}
                  min={0} max={32} unit="px"
                  onChange={(v) => set({ radius: v })} onClear={() => set({ radius: "" })} />
                <div className="border-b border-border/30">
                  <SliderRow label="Outline" hint="The box's own edge" value={settings.outlineW} fallback={fb("outlineW", "outlineW", 1)}
                    min={0} max={8} unit="px"
                    onChange={(v) => set({ outlineW: v })} onClear={() => set({ outlineW: "" })} />
                  <SideRows sides={[["borderTopW", "Top"], ["borderRightW", "Right"], ["borderBottomW", "Bottom"], ["borderLeftW", "Left"]]}
                    settings={settings} fallback={num(settings.outlineW, fb("outlineW", "outlineW", 1))} min={0} max={8} set={set} setHere={setHere} />
                </div>
                <ChoiceRow label="Outline style" value={effective.borderStyle || live.borderStyle || "solid"}
                  onChange={(v) => set({ borderStyle: v })} own={own("borderStyle")} onClear={() => set({ borderStyle: "" })}
                  options={BORDER_STYLES.map((v) => ({ value: v, label: v === "dashed" ? "Dash" : v === "dotted" ? "Dot" : v === "double" ? "Dbl" : v[0].toUpperCase() + v.slice(1) }))} />
                <ColourRow label="Outline colour" value={settings.borderColor} live={live.borderColor} fallback="#3b82f6"
                  onChange={(v) => set({ borderColor: v })}
                  opacity={{ value: settings.borderOpacity, onChange: (v) => setAlpha("borderColor", "borderOpacity", v, live.borderColor || "#3b82f6") }}
                  onClear={() => set({ borderColor: "", borderOpacity: "" })} />
                {/* Split (owner ask, v0.239.0): this scales the borders INSIDE
                    the widget; Outline above is the box's own edge. */}
                <SliderRow label="Lines inside" hint="Buttons, cards and dividers" value={settings.borderW} fallback={fb("borderW", "borderW", 1)}
                  min={0} max={8} unit="px"
                  onChange={(v) => set({ borderW: v })} onClear={() => set({ borderW: "" })} />
                <ChoiceRow label="Shadow" value={effective.shadow || "none"} onChange={(v) => set({ shadow: v })}
                  own={own("shadow")} onClear={() => set({ shadow: "" })}
                  options={Object.keys(SHADOW_PRESETS).map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }))} />
              </Group>
              {/* Arrange (v0.314.0): overlap, layer order and tilt. */}
              {onLayer && (
                <Group title="Arrange">
                  <SwitchRow label="Overlap other widgets" hint="Sits on top of them instead of pushing them aside"
                    checked={settings.layered === true} onChange={(v) => set({ layered: v ? true : "" })} />
                  <StackedRow label="Layer" hint={settings.layered === true ? "Higher sits in front" : "Turn on overlap to stack widgets"}
                    own={own("zLayer")} onClear={() => set({ zLayer: "" })}>
                    <span className="flex items-center gap-1">
                      {[["back", "To back"], ["backward", "Back"]].map(([a, l]) => (
                        <button key={a} type="button" onClick={() => onLayer(widget.instanceId, a)} className={layerBtnCls}>{l}</button>
                      ))}
                      <span className="w-8 flex-shrink-0 text-center text-sm tabular-nums" aria-live="polite" aria-label={`Layer ${layerOf(widget)}`}>{layerOf(widget)}</span>
                      {[["forward", "Forward"], ["front", "To front"]].map(([a, l]) => (
                        <button key={a} type="button" onClick={() => onLayer(widget.instanceId, a)} className={layerBtnCls}>{l}</button>
                      ))}
                    </span>
                  </StackedRow>
                  <SliderRow label="Rotate" value={settings.boxRotate} fallback={0}
                    min={-180} max={180} step={1} unit="°"
                    onChange={(v) => set({ boxRotate: v })} onClear={() => set({ boxRotate: "" })} />
                </Group>
              )}
              {resetFooter("shape", "Reset shape")}
            </div>
          )}

          {/* ── Colour: everything painted ── */}
          {tab === "colour" && (
            <div>
              {/* Opacity sits with its OWN colour (inside each swatch's
                  popover), so a gradient can fade or a background can go
                  see-through independently. */}
              <ColourRow label="Highlight" hint="Buttons and selected things" value={settings.accent} live={live.accent} fallback="#3b82f6"
                onChange={(v) => set({ accent: v })}
                opacity={{ value: settings.accentOpacity, onChange: (v) => setAlpha("accent", "accentOpacity", v, live.accent || "#3b82f6") }}
                onClear={() => set({ accent: "", accentOpacity: "" })}
                extraAction={{ label: "Use the app colour", onClick: () => set({ accent: "", accentOpacity: "" }) }} />
              <ColourRow label="Background" value={settings.bg} live={live.bg} fallback="#111827"
                onChange={(v) => set({ bg: v })}
                opacity={{ value: settings.bgOpacity, onChange: (v) => setAlpha("bg", "bgOpacity", v, live.bg || "#111827") }}
                onClear={() => set({ bg: "", bgOpacity: "" })} />
              {/* Gradient — a layer OVER the background colour. A switch owns
                  it: its rows only show while it's on. */}
              <SwitchRow label="Gradient" checked={!!gradOn} onChange={(on) => {
                if (on) {
                  set({
                    gradFrom: gradHex(effective.gradFrom) || live.bg || "#38bdf8",
                    gradTo: gradHex(effective.gradTo) || "#6ee7b7",
                  });
                } else {
                  set({ gradFrom: "", gradTo: "", gradFromOpacity: "", gradToOpacity: "", gradAngle: "" });
                }
              }} />
              {gradOn && (
                <div className="pl-3 border-l border-border/40 mb-1">
                  <ColourRow label="From" value={gradHex(settings.gradFrom)} live={gradHex(effective.gradFrom) || live.bg} fallback="#38bdf8"
                    onChange={(v) => set({ gradFrom: v, ...(gradHex(settings.gradTo) ? {} : { gradTo: gradHex(effective.gradTo) || "#6ee7b7" }) })}
                    opacity={{ value: settings.gradFromOpacity ?? effective.gradFromOpacity, onChange: (v) => setAlpha("gradFrom", "gradFromOpacity", v, gradHex(effective.gradFrom) || live.bg || "#38bdf8") }}
                    onClear={() => set({ gradFrom: "", gradTo: "", gradFromOpacity: "", gradToOpacity: "" })} />
                  <ColourRow label="To" value={gradHex(settings.gradTo)} live={gradHex(effective.gradTo)} fallback="#6ee7b7"
                    onChange={(v) => set({ gradTo: v, ...(gradHex(settings.gradFrom) ? {} : { gradFrom: gradHex(effective.gradFrom) || live.bg || "#38bdf8" }) })}
                    opacity={{ value: settings.gradToOpacity ?? effective.gradToOpacity, onChange: (v) => setAlpha("gradTo", "gradToOpacity", v, gradHex(effective.gradTo) || "#6ee7b7") }}
                    onClear={() => set({ gradFrom: "", gradTo: "", gradFromOpacity: "", gradToOpacity: "" })} />
                  <SliderRow label="Angle" value={settings.gradAngle} fallback={num(effective.gradAngle, 135)}
                    min={0} max={360} step={15} unit="°"
                    onChange={(v) => set({ gradAngle: v })} onClear={() => set({ gradAngle: "" })} />
                </div>
              )}
              <Row label="Picture" own={!!settings.bgImage} onClear={() => set({ bgImage: "" })}>
                {settings.bgImage && (
                  <Segmented label="Picture fit" value={settings.bgSize || "cover"} onChange={(v) => set({ bgSize: v })}
                    options={[{ value: "cover", label: "Fill" }, { value: "contain", label: "Fit" }, { value: "repeat", label: "Tile" }]} />
                )}
                <button type="button" onClick={() => onPickBackground?.(widget.instanceId)}
                  className="h-8 px-2.5 rounded-lg border border-border/60 text-xs flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
                  <ImageIcon className="w-3.5 h-3.5" /> {settings.bgImage ? "Change" : "Choose"}
                </button>
              </Row>
              <SliderRow label="Frosted blur" value={settings.blur} fallback={num(effective.blur, 0)}
                min={0} max={24} unit="px"
                onChange={(v) => set({ blur: v })} onClear={() => set({ blur: "" })} />
              {resetFooter("colour", "Reset colour")}
            </div>
          )}

          {/* ── Styles: ready-made and saved looks, saving, copying, CSS ── */}
          {tab === "styles" && (
            <div className="space-y-2 pt-1">
              <Segmented label="Which styles" value={!settings.style ? "page" : styleTab}
                onChange={(v) => { if (v === "page") set({ style: "" }); else setStyleTab(v); }}
                options={[
                  { value: "page", label: "Page style" },
                  { value: "builtin", label: "Ready-made" },
                  { value: "mine", label: `Yours${userStyles.length ? ` (${userStyles.length})` : ""}` },
                  ...(themeLookEntries.length ? [{ value: "themes", label: "Themes" }] : []),
                ]} />
              {!settings.style ? (
                <p className="text-xs text-muted-foreground px-1">
                  This widget follows the page's style, currently “{pageStyleLabel}”. Pick one of the other lists to give it a style of its own; your own tweaks in Text, Shape and Colour sit on top either way.
                </p>
              ) : styleTab === "builtin" ? (
                <div className="space-y-1">
                  {HOME_STYLES.map((s) => (
                    <button key={s.id} type="button" onClick={() => set({ style: s.id })}
                      className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-all ${
                        styleOverride === s.id ? "border-primary/60 bg-primary/10" : "border-border/40 hover:border-border"
                      }`}>
                      <span className="font-medium">{s.label}</span>
                      <span className="text-xs text-muted-foreground block">{s.description}</span>
                    </button>
                  ))}
                </div>
              ) : styleTab === "mine" ? (
                <div className="space-y-1">
                  {userStyles.length === 0 && (
                    <p className="text-xs text-muted-foreground">No saved styles yet. Save this widget's look below to reuse it anywhere.</p>
                  )}
                  {userStyles.map((st) => {
                    const on = settings.style === `${USER_STYLE_PREFIX}${st.id}`;
                    const cov = lookCoverage(st.look || {});
                    return (
                      <div key={st.id}>
                        {styleButton(on, () => set({ style: `${USER_STYLE_PREFIX}${st.id}` }), st.label,
                          cov.complete ? "Whole look" : `Changes ${cov.covers.map((g) => g.label).join(", ") || "nothing"}`,
                          <>
                            {/* A style that decides everything needs no caveat.
                                One that leaves parts alone says so, and the star
                                opens exactly what it does and doesn't touch. */}
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
                          </>)}
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
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="text-[0.6875rem] text-muted-foreground">Copies a theme's colours and font onto this widget, so you can still tweak them after.</p>
                  {themeLookEntries.map(({ name, preset, mine }) => (
                    <button key={`theme_${name}`} type="button"
                      onClick={() => set({ ...themeToLook(preset, isDarkMode), style: "" })}
                      className="w-full text-left px-3 py-2 rounded-lg border border-border/40 hover:border-border text-sm transition-all flex items-center gap-2.5">
                      <span className="w-6 h-6 rounded-md border border-border/50 flex-shrink-0"
                        style={{ backgroundImage: `linear-gradient(135deg, ${(preset.dark || preset.light)?.surface || "#222"}, ${(preset.dark || preset.light)?.primary || "#888"})` }} />
                      <span className="min-w-0">
                        <span className="font-medium capitalize block truncate">{name}</span>
                        <span className="text-xs text-muted-foreground block">{mine ? "Your theme" : "Built-in theme"}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}

              <Group title="This look">
                {/* Save: the ticks are the look's parts. Untick some and
                    it's a partial style you can lay over anything. */}
                <Disclosure label="Save as a style…" hint="Reuse this look on any widget" icon={Plus}
                  open={naming} onToggle={() => { setStyleName(""); setNaming((v) => !v); }}>
                  <div className="flex gap-1.5">
                    <input autoFocus value={styleName} onChange={(e) => setStyleName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") saveStyle(); if (e.key === "Escape") setNaming(false); }}
                      placeholder="Name this style" maxLength={40}
                      className="flex-1 min-w-0 h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                    <button type="button" onClick={saveStyle} disabled={!styleName.trim() || saveGroups.length === 0}
                      className="text-xs px-3 rounded-lg border border-primary/50 text-primary disabled:opacity-40">Save</button>
                  </div>
                  <p className="text-[0.6875rem] text-muted-foreground">What it carries:</p>
                  <PartTicks value={saveGroups} onChange={setSaveGroups} />
                </Disclosure>
                {/* Copy this widget's look onto others — all of it, or just
                    the parts ticked. */}
                {onApplyLook && (
                  <Disclosure label="Apply to other widgets…" hint="Copy all of this look, or just some parts" icon={Copy}
                    open={applyOpen} onToggle={() => setApplyOpen((v) => !v)}>
                    <p className="text-[0.6875rem] text-muted-foreground">Which parts:</p>
                    <PartTicks value={applyParts} onChange={setApplyParts} />
                    <div className="space-y-1.5">
                      {[
                        ["page", "All widgets on this page"],
                        ["all", "All widgets, every page"],
                        ["pick", "Pick widgets…"],
                      ].map(([scope, label]) => (
                        <button key={scope} type="button" disabled={applyParts.length === 0}
                          onClick={() => {
                            setApplyOpen(false);
                            const all = applyParts.length === LOOK_GROUPS.length;
                            onApplyLook(scope, all ? null : applyParts);
                          }}
                          className="w-full text-left text-sm px-3 h-9 rounded-lg border border-border/50 hover:bg-muted/40 disabled:opacity-40">
                          {label}
                        </button>
                      ))}
                    </div>
                  </Disclosure>
                )}
              </Group>
              <Group title="Advanced">
                {/* The escape hatch, scoped to this widget. */}
                <Disclosure label="Your own CSS" hint={ownCss ? "Set on this widget" : "Plain CSS, applied to this widget only"} icon={Code2}
                  open={cssOpen || !!ownCss} onToggle={() => setCssOpen((v) => !v)}>
                  <DebouncedText multiline rows={5} value={ownCss}
                    placeholder={"border-image: url(...) 30 round;\nletter-spacing: .04em;"}
                    onCommit={(v) => set({ css: v })}
                    className="w-full px-3 py-2 rounded-lg border border-input bg-background text-xs font-mono resize-y focus:outline-none focus:ring-1 focus:ring-ring" />
                  <p className="text-[0.6875rem] text-muted-foreground">
                    Anything CSS can do — border images, gradients, filters. Clear the box to remove it.
                  </p>
                </Disclosure>
              </Group>
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
