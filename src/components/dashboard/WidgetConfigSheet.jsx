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
const WysiwygEditorLazy = React.lazy(() => import("@/components/shared/WysiwygEditor"));

// Rich text with a DEBOUNCED commit — the wysiwyg emits per keystroke and
// committing straight through would persist the whole board every letter.
// Local state is the truth while typing (never re-seeded from the prop —
// the "description won't delete" lesson); pending text flushes on unmount.
function RichTextField({ value, onCommit, placeholder }) {
  const [draft, setDraft] = React.useState(value || "");
  const timer = React.useRef(null);
  const pending = React.useRef(null);
  const commitRef = React.useRef(onCommit);
  commitRef.current = onCommit;
  React.useEffect(() => {
    const flushNow = () => {
      clearTimeout(timer.current);
      if (pending.current != null) { const v = pending.current; pending.current = null; commitRef.current(v); }
    };
    // Same as DebouncedText: write what was typed if the app is closed or
    // backgrounded with the editor still open.
    const onVisibility = () => { if (document.visibilityState === "hidden") flushNow(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flushNow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flushNow);
      flushNow();
    };
  }, []);
  const change = (v) => {
    setDraft(v);
    pending.current = v;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { pending.current = null; commitRef.current(v); }, 600);
  };
  return (
    <React.Suspense fallback={<div className="h-24 rounded-lg border border-input bg-background animate-pulse" />}>
      <WysiwygEditorLazy value={draft} onChange={change} placeholder={placeholder || "Write anything here…"} />
    </React.Suspense>
  );
}
import { Image as ImageIcon, X, Trash2, ChevronDown, ChevronUp, Check, RotateCcw, LayoutGrid, Palette, Copy, Star, SlidersHorizontal, ArrowUpToLine, ArrowDownToLine, Type, Move, Square, Code2, Minus, Plus } from "lucide-react";
import PinnedAltersConfigPanel from "@/components/alters/PinnedAltersConfigPanel";
import IconPicker from "@/components/shared/IconPicker";
import { usePeekHeight, PeekHandle } from "@/components/v2/PeekResize";
import FontUploadButton from "@/components/shared/FontUploadButton";
import { DOCK_KEY } from "@/components/v2/V2Frame";
import UndoRedoButtons from "@/components/v2/UndoRedoHistory";
import { useFontOptions } from "@/lib/useFontOptions";
// The planner editor's add-chip, so the two editors read as one system.
import DetailChip from "@/components/shared/DetailChip";
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
import { useModPagesVersion } from "@/lib/mods/registry";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import ColorPicker from "@/components/shared/ColorPicker";
import { Switch } from "@/components/ui/switch";
import ProfileSongPicker from "@/components/shared/ProfileSongPicker";
import {
  themeToLook, BORDER_STYLES, SHADOW_PRESETS, USER_STYLE_PREFIX,
  LOOK_GROUPS, LOOK_SECTIONS, lookCoverage, lookForGroups, OFF, mergeLook, pickLook, userStyleId,
  FONT_STYLE_OPTIONS, textSplitPatch, inheritedHeaderStyles, sectionResetPatch, sectionHasOwn,
} from "@/lib/widgetLook";
import TextCard from "@/components/shared/TextCard";
import { getStyleLook } from "@/lib/homeStyles";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { SearchableMultiList } from "@/v2/widgets";
import { widgetAutoLabel } from "@/lib/widgetRegistry";
import { foldedSettings } from "@/lib/widgetFold";
import { sheetPortalGuards } from "@/lib/sheetPortalGuards";
import { applyTerms } from "@/lib/dailyTaskSystem";
import { resolveQuickButtons, QUICK_BUTTON_DEFS } from "@/components/dashboard/QuickCheckinButtons";
import LucideByName from "@/components/shared/LucideByName";

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

  React.useEffect(() => {
    const flushNow = () => {
      if (timer.current) { clearTimeout(timer.current); timer.current = null; }
      if (pending.current !== null) { const v = pending.current; pending.current = null; commitRef.current(v); }
    };
    // The Android back button can close the app outright, and a phone can
    // background it mid-typing; neither unmounts this field in time, so
    // the last few letters would never be written. Flush as the page hides.
    const onVisibility = () => { if (document.visibilityState === "hidden") flushNow(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flushNow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flushNow);
      flushNow();
    };
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

// One section of the sheet, opened from its chip (see lookParts). Every
// section that owns settings ends in its own Reset, so undoing one part
// never means undoing everything.
function LookPart({ open, title, children, onReset, resetLabel }) {
  if (!open) return null;
  return (
    <div className="rounded-lg border border-border/40 px-3 py-3 space-y-3">
      <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
      {children}
      {onReset && (
        <div className="flex justify-end pt-1 border-t border-border/30">
          <button type="button" onClick={onReset}
            className="text-xs px-2.5 py-1 rounded-full border border-border/50 text-muted-foreground hover:text-foreground flex items-center gap-1">
            <RotateCcw className="w-3 h-3" /> {resetLabel || "Reset"}
          </button>
        </div>
      )}
    </div>
  );
}

// Which parts of a look to carry — the sheet's own sections, used by both
// "Save this look as a style" and "Apply this look to…".
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

// A small label above a group of rows inside a section.
function SubHead({ children }) {
  return <p className="text-xs font-semibold pt-1">{children}</p>;
}

// The one-question control: a segmented bar, like the display mode and
// the planner editor's Done / Now / Plan. For short, few-option choices.
function Segmented({ label, options, value, onChange }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-full border border-border/60 p-0.5 gap-0.5">
      {options.map((o) => (
        <button key={String(o.value)} type="button" role="radio"
          aria-checked={String(value) === String(o.value)}
          onClick={() => onChange(o.value)}
          className={`flex-1 min-w-0 truncate text-xs py-1.5 px-1 rounded-full ${
            String(value) === String(o.value) ? "bg-primary/10 text-primary font-semibold" : "text-muted-foreground hover:text-foreground"
          }`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// A choice shows as a segmented bar when it fits on one line (up to four
// short options), as wrapping chips otherwise.
const fitsSegmented = (options = []) =>
  options.length > 1 && options.length <= 4 && options.reduce((n, o) => n + String(o.label).length, 0) <= 30;

// Counts (how many to show, row height, days ahead): − n +, and the number
// can be typed. A typed value saves when you leave the box or press Enter;
// the buttons save at once. Replaces the bare number box that only saved
// on blur and gave no way to nudge.
function NumberStepper({ label, value, min = 0, max = 99, step = 1, onCommit }) {
  const n = Number.isFinite(Number(value)) ? Number(value) : min;
  const [text, setText] = React.useState(String(n));
  React.useEffect(() => { setText(String(n)); }, [n]);
  const clamp = (v) => Math.min(max, Math.max(min, v));
  const commitText = () => {
    const v = parseInt(text, 10);
    if (Number.isNaN(v)) { setText(String(n)); return; }
    const c = clamp(v);
    setText(String(c));
    if (c !== n) onCommit(c);
  };
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      <button type="button" aria-label={`${label} less`} disabled={n <= min}
        onClick={() => onCommit(clamp(n - step))}
        className="w-8 h-8 rounded-lg border border-border/60 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-40">
        <Minus className="w-3.5 h-3.5" />
      </button>
      <input type="number" inputMode="numeric" value={text} min={min} max={max} aria-label={label}
        onChange={(e) => setText(e.target.value)} onBlur={commitText}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
        className="w-14 h-8 px-1 text-center rounded-lg border border-input bg-background text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-ring" />
      <button type="button" aria-label={`${label} more`} disabled={n >= max}
        onClick={() => onCommit(clamp(n + step))}
        className="w-8 h-8 rounded-lg border border-border/60 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-40">
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// A colour role as a labelled row: name on the left, swatch on the right
// (the swatch's popover holds hex, opacity, Clear).
function ColourRow({ label, children }) {
  return (
    <div className="flex items-center gap-2 min-h-[32px]">
      <span className="text-xs font-medium flex-1 min-w-0 truncate">{label}</span>
      {children}
    </div>
  );
}

// The look of a set of font-style flags, for previews and chip faces.
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

// Font-style chips. `regular` adds a first chip meaning "none of these",
// lit when nothing is picked (headings: no styles of their own).
function FontStyleChips({ value = [], onChange, regular = false }) {
  const toggle = (id) => {
    let next = value.includes(id) ? value.filter((x) => x !== id) : [...value, id];
    // Bold and Light are opposite weights — picking one drops the other.
    if (id === "bold" && next.includes("bold")) next = next.filter((x) => x !== "light");
    if (id === "light" && next.includes("light")) next = next.filter((x) => x !== "bold");
    onChange(next);
  };
  const chip = (on) => `text-[0.6875rem] px-2.5 py-1 rounded-full border ${
    on ? "border-primary/60 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground"
  }`;
  return (
    <div className="flex flex-wrap gap-1">
      {regular && (
        <button type="button" aria-pressed={value.length === 0} onClick={() => onChange([])}
          className={chip(value.length === 0)}>Regular</button>
      )}
      {FONT_STYLE_OPTIONS.map(({ id, label }) => (
        <button key={id} type="button" aria-pressed={value.includes(id)} onClick={() => toggle(id)}
          className={chip(value.includes(id))}
          style={{ ...FLAG_STYLE[id], ...(id === "uppercase" ? { fontSize: "0.625rem" } : {}) }}>
          {label}
        </button>
      ))}
    </div>
  );
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
  onApplyLook,       // (scope: "all" | "page" | "pick", parts?: section ids | null = all) → copy this look out
  resolvedLook = {}, // what this widget actually looks like right now
  userStyles = [],   // the user's own saved styles
  onSaveStyle,       // (label, look) → save the current look as a style
  onDeleteStyle,     // (styleId)
  onPickBackground,  // (instanceId) → opens the shared AssetPickerModal
  onRestoreSnapshot, // (instanceId, { mode, settings }) → put the widget back how it was when the sheet opened
}) {
  const open = !!widget && !!def;
  // Everything in this sheet applies live, so closing used to just keep
  // whatever happened — including accidents. Snapshot the widget as the
  // sheet opens; closing with changes asks Keep / Undo / Keep editing
  // (the same guard the planner's editor got). One component, so every
  // surface that hosts this menu — board, home screen, desktop, the
  // pinned-bar config — gets the guard at once.
  const openSnap = React.useRef(null);
  const [closeAsk, setCloseAsk] = React.useState(false);
  React.useEffect(() => {
    if (!widget?.instanceId) { openSnap.current = null; setCloseAsk(false); return; }
    if (openSnap.current?.id === widget.instanceId) return;
    openSnap.current = {
      id: widget.instanceId,
      mode: widget.mode,
      settings: JSON.parse(JSON.stringify(widget.settings || {})),
    };
    setCloseAsk(false);
  }, [widget?.instanceId]);
  const editorDirty = () => {
    const snap = openSnap.current;
    if (!snap || snap.id !== widget?.instanceId) return false;
    return snap.mode !== widget.mode
      || JSON.stringify(widget.settings || {}) !== JSON.stringify(snap.settings);
  };
  const requestClose = () => {
    if (editorDirty() && onRestoreSnapshot) setCloseAsk(true);
    else onClose();
  };
  const undoAndClose = () => {
    const snap = openSnap.current;
    if (snap && snap.id === widget?.instanceId) {
      onRestoreSnapshot?.(snap.id, { mode: snap.mode, settings: snap.settings });
    }
    setCloseAsk(false);
    onClose();
  };
  const live = useLiveColors(open, widget?.instanceId, JSON.stringify(widget?.settings || {}) + (pageStyleId || ""));
  const drawsLabel = useHasWidgetLabel(open, widget?.instanceId, `${widget?.mode}|${JSON.stringify(widget?.settings || {})}`);
  // Styles: which catalogue is showing (Ready-made / Yours / From themes).
  const [styleTab, setStyleTab] = React.useState("builtin");
  const [naming, setNaming] = React.useState(false);
  const [applyOpen, setApplyOpen] = React.useState(false);
  // Which parts "Apply this look to…" copies — all of them by default.
  const [applyParts, setApplyParts] = React.useState(LOOK_GROUPS.map((g) => g.id));
  // "Each side" rows under Inner spacing / Outline.
  const [padSides, setPadSides] = React.useState(false);
  const [outlineSides, setOutlineSides] = React.useState(false);
  // The footer's Reset… choice (just the look / everything).
  const [resetAsk, setResetAsk] = React.useState(false);
  const [styleName, setStyleName] = React.useState("");
  // Which parts of the look a saved style should carry. All of them by
  // default — a preset that covers everything needs no caveats.
  const [saveGroups, setSaveGroups] = React.useState(LOOK_GROUPS.map((g) => g.id));
  const [exclusionsFor, setExclusionsFor] = React.useState(null); // style id
  // Always drag-resizable (the grab bar is the size control — no separate
  // Peek mode); height shared with Display options. The page never dims
  // under it: settings apply live and watching the widget is the point.
  const peekResize = usePeekHeight("symphony_options_peek_h", 85);
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
  const fontOptions = useFontOptions();
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
  // Which sections (Text / Layout / Box / Colours & fill / Styles / CSS /
  // Icon) are open.
  const [openParts, setOpenParts] = React.useState([]);
  const toggleOpenPart = (id) => setOpenParts((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
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
  const hasOwnFields = ownFields.length > 0;
  const set = (patch) => onSettings(widget.instanceId, patch);
  const setHere = (keys) => keys.some((k) => {
    const v = settings[k];
    return v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0);
  });
  // The sections, in the order the chips show. The look sections come from
  // LOOK_SECTIONS (widgetLook.js) — the same list behind saved styles,
  // copied looks and each section's Reset.
  const SECTION_ICONS = { text: Type, layout: Move, box: Square, fill: Palette, css: Code2 };
  const lookParts = [
    ...LOOK_SECTIONS.filter((sec) => sec.id !== "css").map((sec) => ({
      id: sec.id, label: sec.label, icon: SECTION_ICONS[sec.id],
      has: sectionHasOwn(settings, sec.id, sec.id === "layout" ? uiFieldKeys : []),
    })),
    { id: "styles", label: "Styles", icon: Star, has: setHere(["style"]) },
    { id: "css", label: "Your own CSS", icon: Code2, has: !!ownCss },
    ...(widget.widgetId === "app_shortcut"
      ? [{ id: "icon", label: "Icon", icon: ImageIcon, has: setHere(["iconName", "iconUrl"]) }]
      : []),
  ];
  const resetSection = (id, extra = []) => set(sectionResetPatch(id, extra));

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
  const fontScale = Number(settings.fontScale) || 100;
  const headerScale = Number(settings.headerScale) || 100;
  const bodyFont = effective.font || "";
  const headFont = effective.headerFont || bodyFont;

  return (
    <Drawer key={dock} direction={dock} open={open} modal={false} onOpenChange={(v) => { if (!v) requestClose(); }}>
      <DrawerContent direction={dock} hideHandle
        style={{ maxHeight: `${peekH}vh`, height: `${peekH}vh` }} {...sheetPortalGuards}>
        {/* The grab bar IS the resize handle — every sheet is always
            drag-resizable (no separate Peek mode). */}
        <PeekHandle resize={peekResize} dock={dock} />
        {/* Close guard: changes here apply live, so leaving with edits
            asks what to do with them instead of silently keeping them. */}
        {closeAsk && (
          <div className="absolute inset-0 z-50 bg-background/85 backdrop-blur-sm flex items-center justify-center p-6">
            <div className="w-full max-w-xs rounded-2xl border border-border/60 bg-card p-4 space-y-3 shadow-xl">
              <p className="text-sm font-semibold">Keep these changes?</p>
              <p className="text-xs text-muted-foreground">You changed this widget while the menu was open.</p>
              <div className="space-y-1.5">
                <button type="button" onClick={() => { setCloseAsk(false); onClose(); }}
                  className="w-full h-10 rounded-lg bg-primary text-primary-foreground text-sm font-medium">
                  Keep changes
                </button>
                <button type="button" onClick={undoAndClose}
                  className="w-full h-10 rounded-lg border border-border/60 text-sm font-medium hover:bg-muted/50">
                  Undo my changes
                </button>
                <button type="button" onClick={() => setCloseAsk(false)}
                  className="w-full h-10 rounded-lg border border-border/60 text-sm text-muted-foreground hover:bg-muted/50">
                  Keep editing
                </button>
              </div>
            </div>
          </div>
        )}
        <DrawerHeader className="pb-1">
          <div className="flex items-start justify-between gap-2">
            <span className="flex items-center gap-2 min-w-0">
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
            <button type="button" onClick={flipDock}
              aria-label="Move this panel to the other edge" title="Move this panel to the other edge"
              className="flex items-center justify-center w-8 h-8 rounded-lg border border-border/60 text-muted-foreground hover:text-foreground">
              {dock === "top" ? <ArrowDownToLine className="w-3.5 h-3.5" /> : <ArrowUpToLine className="w-3.5 h-3.5" />}
            </button>
            </span>
          </div>
        </DrawerHeader>
        <div
          className="px-4 pb-6 space-y-4 overflow-y-auto overscroll-contain flex-1 min-h-0"
          // Bottom-nav height included: on pages where the classic bottom
          // bar is up, the sheet's last rows were hidden behind it.
          style={{ paddingBottom: "calc(var(--os-sab) + var(--bottom-nav-height, 0px) + 24px)" }}
        >
          {/* First thing in the sheet — moving is the most common intent
              when you hold a widget (the user's call). */}
          {onEditLayout && (
            <button
              type="button"
              onClick={onEditLayout}
              className="w-full flex items-center justify-center gap-2 h-10 rounded-lg border border-border/60 text-sm font-medium hover:bg-muted/50"
            >
              <LayoutGrid className="w-4 h-4" /> Move &amp; resize widgets
            </button>
          )}

          {/* ── Widget: its name and how much it shows ── */}
          <div className="space-y-2">
            <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">Widget</p>
            <div className="flex items-center gap-2">
              <DebouncedText
                key={widget.instanceId}
                value={settings.label || ""}
                placeholder={defLabel}
                maxLength={60}
                onCommit={(v) => {
                  const next = v.trim();
                  if (next !== (settings.label || "")) set({ label: next });
                }}
                className="flex-1 min-w-0 h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
              {/* Off = the widget drops its heading and gives the room to
                  what it shows. Only offered where the widget draws one. */}
              {(drawsLabel || settings.hideLabel) && (
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground flex-shrink-0 cursor-pointer">
                  Show
                  <Switch checked={!settings.hideLabel}
                    onCheckedChange={(on) => set({ hideLabel: on ? "" : true })}
                    aria-label="Show the name on the widget" />
                </label>
              )}
            </div>
            <p className="text-[0.6875rem] text-muted-foreground">
              {typeof def.autoLabel === "function"
                ? "Leave blank and the name follows the file that's set to play, renaming itself when you pick a different one."
                : "A name you type replaces the widget's own heading. Leave it blank to keep the heading it comes with."}
            </p>
            {/* Display mode — the one question, as a segmented control like
                the planner editor's Done / Now / Plan. `def.extraModes` lets a
                HOST add modes of its own — the classic home offers "Classic"
                (the untouched classic card) ahead of the board modes. */}
            {(def.supportsModes.length > 1 || (def.extraModes || []).length > 0) && (
              <Segmented label="Display mode" value={mode}
                onChange={(m) => onMode(widget.instanceId, m)}
                options={[
                  ...(def.extraModes || []).map((x) => ({ value: x.id, label: x.label })),
                  ...HOME_MODES.filter((m) => def.supportsModes.includes(m)).map((m) => ({ value: m, label: MODE_LABEL[m] })),
                ]} />
            )}
          </div>

          {/* ── What it shows: the widget's own options, always open ── */}
          {hasOwnFields && (
          <div className="space-y-3">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">What it shows</p>
          {ownFields.map((f, i) => {
            // showIf: a field only appears when it means something for the
            // current settings — the cure for option-soup config sheets.
            if (typeof f.showIf === "function" && !f.showIf(settings)) return null;
            // A field may name a `group`; a new group gets a small heading.
            const prevGroup = i > 0 ? ownFields[i - 1].group : undefined;
            const groupHead = f.group && f.group !== prevGroup ? <SubHead key={`g_${f.group}`}>{applyTerms(f.group, t)}</SubHead> : null;
            const field = (() => {
            if (f.type === "pinnedAlters") return <PinnedAltersConfigPanel key={f.key} />;
            if (f.type === "quickButtons") {
              return (
                <QuickButtonsField key={f.key} settings={settings} terms={t}
                  onChange={(next) => set({ [f.key]: next })} />
              );
            }
            if (f.type === "quickActionsManager") {
              return <QuickActionsManagerField key={f.key} label={applyTerms(f.label, t)} />;
            }
            const val = settings[f.key] ?? f.default ?? "";
            const commit = (v) => set({ [f.key]: v });
            const label = applyTerms(f.label, t);
            // On/off, counts and sizes sit on one line: name left, control right.
            if (f.type === "toggle") {
              return (
                <div key={f.key}>
                  <label className="flex items-center justify-between gap-3 text-sm cursor-pointer">
                    <span className="min-w-0">{label}</span>
                    <Switch checked={val !== false && val !== ""} onCheckedChange={(on) => commit(on)} aria-label={label} />
                  </label>
                  {f.help && <p className="text-[0.6875rem] text-muted-foreground mt-1">{f.help}</p>}
                </div>
              );
            }
            if (f.type === "number") {
              return (
                <div key={f.key}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm min-w-0">{label}</span>
                    <NumberStepper key={`${widget.instanceId}:${f.key}`} label={label} value={val}
                      min={f.min ?? 0} max={f.max ?? 99} step={f.step ?? 1} onCommit={commit} />
                  </div>
                  {f.help && <p className="text-[0.6875rem] text-muted-foreground mt-1">{f.help}</p>}
                </div>
              );
            }
            if (f.type === "range") {
              // Set-then-slide, like every size in this sheet (house rule):
              // a bare slider moved when you scrolled past it.
              return (
                <div key={f.key}>
                  <SliderRow label={label} value={settings[f.key]} fallback={f.default ?? 0}
                    min={f.min ?? 0} max={f.max ?? 100} step={f.step ?? 1} unit={f.unit || "px"}
                    onChange={commit} onReset={() => commit("")} />
                  {f.help && <p className="text-[0.6875rem] text-muted-foreground mt-1">{f.help}</p>}
                </div>
              );
            }
            return (
              <div key={f.key}>
                <label className="text-xs font-medium block mb-1">{label}</label>
                {f.type === "text" && (
                  <DebouncedText key={`${widget.instanceId}:${f.key}`} value={val} placeholder={f.placeholder ? applyTerms(f.placeholder, t) : undefined}
                    maxLength={f.maxLength || 120} onCommit={(v) => { if (v !== val) commit(v); }}
                    className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                )}
                {f.type === "orderToggle" && (
                  <OrderToggleField field={f} value={val} onChange={commit} />
                )}
                {f.type === "richtext" && (
                  /* THE full editor — same WysiwygEditor + MiniToolbar the
                     journals and bios use, so text widgets can carry colours,
                     fonts, images and in-app link buttons (owner spec:
                     "utilize all full formatting functionality"). */
                  <RichTextField key={`${widget.instanceId}:${f.key}`} value={val}
                    onCommit={(v) => { if (v !== val) commit(v); }} placeholder={f.placeholder} />
                )}
                {f.type === "textarea" && (
                  <DebouncedText key={`${widget.instanceId}:${f.key}`} value={val} placeholder={f.placeholder}
                    multiline rows={f.rows || 3} maxLength={f.maxLength || 2000}
                    onCommit={(v) => { if (v !== val) commit(v); }}
                    className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm resize-y focus:outline-none focus:ring-1 focus:ring-ring" />
                )}
                {f.type === "select" && (fitsSegmented(f.options) ? (
                  <Segmented label={label} value={val} onChange={commit}
                    options={(f.options || []).map((o) => ({ value: o.value, label: applyTerms(String(o.label), t) }))} />
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {(f.options || []).map((o) => (
                      <button key={o.value} type="button" onClick={() => commit(o.value)}
                        aria-pressed={String(val) === String(o.value)}
                        className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                          String(val) === String(o.value)
                            ? "border-primary/60 bg-primary/10 text-primary"
                            : "border-border/50 text-muted-foreground hover:text-foreground"
                        }`}>
                        {applyTerms(String(o.label), t)}
                      </button>
                    ))}
                  </div>
                ))}
                {/* Static multi-pick: same chips as select, but each toggles
                    membership in an array (e.g. which task sets a widget shows). */}
                {f.type === "multi" && (
                  <div className="flex flex-wrap gap-1.5">
                    {(f.options || []).map((o) => {
                      const arr = Array.isArray(val) ? val : (val != null && val !== "" ? [val] : []);
                      const on = arr.some((x) => String(x) === String(o.value));
                      return (
                        <button key={o.value} type="button" aria-pressed={on}
                          onClick={() => commit(on ? arr.filter((x) => String(x) !== String(o.value)) : [...arr, o.value])}
                          className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                            on ? "border-primary/60 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground hover:text-foreground"
                          }`}>
                          {applyTerms(String(o.label), t)}
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
                {f.type === "song" && (
                  <ProfileSongPicker value={val || null} onChange={(v) => commit(v)} subjectLabel="page" />
                )}
                {f.help && <p className="text-[0.6875rem] text-muted-foreground mt-1">{f.help}</p>}
              </div>
            );
            })();
            return groupHead ? <React.Fragment key={f.key}>{groupHead}{field}</React.Fragment> : field;
          })}
          </div>
          )}

          {/* ── How it looks: one chip per section (planner-editor chips).
              A dot on a closed chip = this widget has its own setting
              there. Each section holds everything about one part of the
              widget, and the same sections are what a saved style or a
              copied look carries (LOOK_SECTIONS). ── */}
          <div className="flex flex-wrap gap-1.5">
            {lookParts.map((part) => (
              <DetailChip key={part.id} open={openParts.includes(part.id)} has={part.has}
                onToggle={() => toggleOpenPart(part.id)} label={part.label}
                icon={<part.icon className="w-3 h-3" />} />
            ))}
          </div>

          {/* ── Text: body and headings as a matching pair ── */}
          <LookPart open={openParts.includes("text")} title="Text"
            onReset={() => resetSection("text")} resetLabel="Reset text">
            {/* Live preview in this widget's own fonts. */}
            <div className="rounded-xl border border-border/50 bg-muted/20 px-3 py-2.5" aria-hidden>
              <p className="font-semibold leading-tight"
                style={{ fontFamily: headFont || undefined, zoom: headerScale / 100, color: settings.headerColor || undefined, ...flagsStyle(headStyles) }}>
                Heading
              </p>
              <p className="text-sm mt-0.5"
                style={{ fontFamily: bodyFont || undefined, fontSize: `${0.875 * fontScale / 100}rem`, color: settings.textColor || undefined, ...flagsStyle(bodyStyles) }}>
                Body text in this widget
              </p>
            </div>
            <TextCard
              title="Body"
              font={{
                select: (
                  <SearchableSelect
                    value={settings.font || ""}
                    onChange={(v) => setText({ font: v || "" })}
                    // Includes the user's own uploaded fonts (owner rule).
                    options={fontOptions}
                    placeholder="Use the app font"
                    searchPlaceholder="Search fonts…"
                    renderOption={(o) => <span style={{ fontFamily: o.id || undefined }}>{o.label}</span>}
                  />
                ),
                upload: <FontUploadButton onUploaded={(family) => setText({ font: family })} />,
              }}
              size={{
                label: "Size", valueLabel: `${fontScale}%`,
                canDown: fontScale > 70, canUp: fontScale < 160,
                onDown: () => setText({ fontScale: Math.max(70, fontScale - 5) }),
                onUp: () => setText({ fontScale: Math.min(160, fontScale + 5) }),
              }}
              style={{
                label: "Style", stacked: true,
                control: <FontStyleChips value={bodyStyles} onChange={(next) => setText({ fontStyles: next })} />,
              }}
              colour={{
                label: "Colour",
                control: (
                  <ColorPicker compact caption={false} label="Text colour"
                    value={settings.textColor || live.textColor || "#e5e7eb"}
                    onChange={(v) => setText({ textColor: v })}
                    opacity={{ value: settings.textOpacity, onChange: (v) => setAlpha("textColor", "textOpacity", v, live.textColor || "#e5e7eb") }}
                    onClear={() => set({ textColor: "", textOpacity: "" })} />
                ),
              }}
            />
            <TextCard
              title="Headings"
              font={{
                select: (
                  <SearchableSelect
                    value={settings.headerFont || ""}
                    onChange={(v) => setText({ headerFont: v || "" })}
                    options={headFontOptions}
                    placeholder="Same as body"
                    searchPlaceholder="Search fonts…"
                    renderOption={(o) => <span style={{ fontFamily: o.id || undefined }}>{o.label}</span>}
                  />
                ),
                upload: <FontUploadButton onUploaded={(family) => setText({ headerFont: family })} />,
              }}
              size={{
                label: "Size", valueLabel: `${headerScale}%`,
                canDown: headerScale > 50, canUp: headerScale < 200,
                onDown: () => setText({ headerScale: Math.max(50, headerScale - 10) }),
                onUp: () => setText({ headerScale: Math.min(200, headerScale + 10) }),
              }}
              style={{
                label: "Style", stacked: true,
                control: <FontStyleChips regular value={headStyles} onChange={(next) => setText({ headerFontStyles: next })} />,
              }}
              colour={{
                label: "Colour",
                control: (
                  <ColorPicker compact caption={false} label="Heading colour"
                    value={settings.headerColor || settings.textColor || live.textColor || "#e5e7eb"}
                    onChange={(v) => setText({ headerColor: v })}
                    opacity={{ value: settings.headerOpacity, onChange: (v) => setText({ headerOpacity: v, ...(settings.headerColor ? {} : { headerColor: settings.textColor || live.textColor || "#e5e7eb" }) }) }}
                    onClear={() => set({ headerColor: "", headerOpacity: "" })} />
                ),
              }}
            />
            <p className="text-[0.6875rem] text-muted-foreground">
              Headings are the widget's titles. They follow the body font until you pick one of their own, and body styles don't change them.
            </p>
          </LookPart>

          {/* ── Layout: where things sit inside the box ── */}
          <LookPart open={openParts.includes("layout")} title="Layout"
            onReset={() => resetSection("layout", uiFieldKeys)} resetLabel="Reset layout">
            <SliderRow label="Content size" value={settings.controlScale} fallback={100}
              min={60} max={200} step={5} unit="%"
              onChange={(v) => set({ controlScale: v })}
              onReset={() => set({ controlScale: "" })} />
            <p className="text-[0.6875rem] text-muted-foreground -mt-2">Scales everything the widget draws: rows, buttons, pictures and spacing.</p>
            <div className="space-y-1">
              <span className="text-xs font-medium block">Across</span>
              {/* Left / Right mirror the layout, not just the text. */}
              <Segmented label="Across" value={settings.halign || "stretch"} onChange={(v) => set({ halign: v })}
                options={[{ value: "stretch", label: "Fill" }, { value: "left", label: "Left" }, { value: "center", label: "Center" }, { value: "right", label: "Right" }]} />
            </div>
            <div className="space-y-1">
              <span className="text-xs font-medium block">Down</span>
              <Segmented label="Down" value={settings.valign || "center"} onChange={(v) => set({ valign: v })}
                options={[{ value: "top", label: "Top" }, { value: "center", label: "Center" }, { value: "bottom", label: "Bottom" }]} />
            </div>
            <div>
              <SliderRow label="Inner spacing" value={settings.padding} fallback={12}
                min={0} max={32} unit="px"
                onChange={(v) => set({ padding: v })}
                onReset={() => set({ padding: "" })} />
              {(() => {
                const sideKeys = [["padTop", "Top"], ["padRight", "Right"], ["padBottom", "Bottom"], ["padLeft", "Left"]];
                const anySet = setHere(sideKeys.map(([k]) => k));
                const shown = padSides || anySet;
                return (
                  <>
                    <button type="button" onClick={() => setPadSides((v) => !v)} aria-expanded={shown}
                      className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 py-1">
                      <ChevronDown className={`w-3 h-3 transition-transform ${shown ? "rotate-180" : ""}`} /> Each side{anySet ? " (set)" : ""}
                    </button>
                    {shown && (
                      <div className="pl-3 border-l border-border/40">
                        {sideKeys.map(([key, label]) => (
                          <SliderRow key={key} label={label} value={settings[key]} fallback={settings.padding ?? 12}
                            min={0} max={48} unit="px"
                            onChange={(v) => set({ [key]: v })}
                            onReset={() => set({ [key]: "" })} />
                        ))}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
            {/* Sizes the widget itself declares (e.g. the week grid's lane
                strength) — set-then-slide like every size here. */}
            {uiFields.map((f) => (
              <SliderRow key={f.key} label={applyTerms(f.label, t)}
                value={settings[f.key]} fallback={f.default ?? 0}
                min={f.min ?? 0} max={f.max ?? 100} step={f.step ?? 1} unit={f.unit || "px"}
                onChange={(v) => set({ [f.key]: v })}
                onReset={() => set({ [f.key]: "" })} />
            ))}
          </LookPart>

          {/* ── Box: the widget's shell ── */}
          <LookPart open={openParts.includes("box")} title="Box"
            onReset={() => resetSection("box")} resetLabel="Reset box">
            <SliderRow label="Corner radius" value={settings.radius} fallback={12}
              min={0} max={32} unit="px"
              onChange={(v) => set({ radius: v })}
              onReset={() => set({ radius: "" })} />
            <SubHead>Outline</SubHead>
            <div>
              <SliderRow label="Width" value={settings.outlineW} fallback={1}
                min={0} max={8} unit="px"
                onChange={(v) => set({ outlineW: v })}
                onReset={() => set({ outlineW: "" })} />
              {(() => {
                const sideKeys = [["borderTopW", "Top"], ["borderRightW", "Right"], ["borderBottomW", "Bottom"], ["borderLeftW", "Left"]];
                const anySet = setHere(sideKeys.map(([k]) => k));
                const shown = outlineSides || anySet;
                return (
                  <>
                    <button type="button" onClick={() => setOutlineSides((v) => !v)} aria-expanded={shown}
                      className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 py-1">
                      <ChevronDown className={`w-3 h-3 transition-transform ${shown ? "rotate-180" : ""}`} /> Each side{anySet ? " (set)" : ""}
                    </button>
                    {shown && (
                      <div className="pl-3 border-l border-border/40">
                        {sideKeys.map(([key, label]) => (
                          <SliderRow key={key} label={label} value={settings[key]} fallback={settings.outlineW ?? 1}
                            min={0} max={8} unit="px"
                            onChange={(v) => set({ [key]: v })}
                            onReset={() => set({ [key]: "" })} />
                        ))}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
            <div>
              <label className="text-xs font-medium block mb-1">Style</label>
              <div className="flex flex-wrap gap-1">
                {BORDER_STYLES.map((v) => (
                  <button key={v} type="button" aria-pressed={settings.borderStyle === v}
                    onClick={() => set({ borderStyle: settings.borderStyle === v ? "" : v })}
                    className={`text-[0.6875rem] px-2.5 py-1 rounded-full border capitalize ${
                      settings.borderStyle === v ? "border-primary/60 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground"
                    }`}>{v}</button>
                ))}
              </div>
            </div>
            <ColourRow label="Colour">
              <ColorPicker compact caption={false} label="Outline colour"
                value={settings.borderColor || live.borderColor || "#3b82f6"}
                onChange={(v) => set({ borderColor: v })}
                opacity={{ value: settings.borderOpacity, onChange: (v) => setAlpha("borderColor", "borderOpacity", v, live.borderColor || "#3b82f6") }}
                onClear={() => set({ borderColor: "", borderOpacity: "" })} />
            </ColourRow>
            <SubHead>Inside the box</SubHead>
            {/* Split (owner ask, v0.239.0): this scales the borders INSIDE
                the widget; Outline above is the box's own edge. */}
            <SliderRow label="Lines inside" value={settings.borderW} fallback={1}
              min={0} max={8} unit="px"
              onChange={(v) => set({ borderW: v })}
              onReset={() => set({ borderW: "" })} />
            <p className="text-[0.6875rem] text-muted-foreground -mt-2">The borders of buttons, cards and dividers in the widget.</p>
            <div>
              <label className="text-xs font-medium block mb-1">Shadow</label>
              <div className="flex flex-wrap gap-1">
                {Object.keys(SHADOW_PRESETS).map((v) => (
                  <button key={v} type="button" aria-pressed={settings.shadow === v}
                    onClick={() => set({ shadow: settings.shadow === v ? "" : v })}
                    className={`text-[0.6875rem] px-2.5 py-1 rounded-full border capitalize ${
                      settings.shadow === v ? "border-primary/60 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground"
                    }`}>{v}</button>
                ))}
              </div>
            </div>
          </LookPart>

          {/* ── Colours & fill: everything painted ── */}
          <LookPart open={openParts.includes("fill")} title="Colours & fill"
            onReset={() => resetSection("fill")} resetLabel="Reset colours & fill">
            {/* Opacity sits with its OWN colour (inside each swatch's
                popover), so a gradient can fade or a background can go
                see-through independently. */}
            <ColourRow label="Highlight colour">
              <ColorPicker compact caption={false} label="Highlight colour"
                value={settings.accent || live.accent || "#3b82f6"}
                onChange={(v) => set({ accent: v })}
                opacity={{ value: settings.accentOpacity, onChange: (v) => setAlpha("accent", "accentOpacity", v, live.accent || "#3b82f6") }}
                onClear={() => set({ accent: "", accentOpacity: "" })}
                extraAction={{ label: "Use the app colour", onClick: () => set({ accent: "", accentOpacity: "" }) }} />
            </ColourRow>
            <ColourRow label="Background colour">
              <ColorPicker compact caption={false} label="Background"
                value={settings.bg || live.bg || "#111827"}
                onChange={(v) => set({ bg: v })}
                opacity={{ value: settings.bgOpacity, onChange: (v) => setAlpha("bg", "bgOpacity", v, live.bg || "#111827") }}
                onClear={() => set({ bg: "", bgOpacity: "" })} />
            </ColourRow>
            {/* Gradient — a layer OVER the background colour. A switch owns
                it: its swatches only show while it's on. */}
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <label className="text-xs font-medium flex-1">Gradient</label>
                <Switch checked={!!gradOn} onCheckedChange={(on) => {
                  if (on) {
                    set({
                      gradFrom: gradHex(effective.gradFrom) || live.bg || "#38bdf8",
                      gradTo: gradHex(effective.gradTo) || "#6ee7b7",
                    });
                  } else {
                    set({ gradFrom: "", gradTo: "", gradFromOpacity: "", gradToOpacity: "", gradAngle: "" });
                  }
                }} aria-label="Gradient" />
              </div>
              {gradOn && (
                <div className="pl-3 border-l border-border/40 space-y-1">
                  <ColourRow label="From">
                    <ColorPicker compact caption={false} label="From"
                      value={gradHex(effective.gradFrom) || live.bg || "#38bdf8"}
                      onChange={(v) => set({ gradFrom: v, ...(gradHex(settings.gradTo) ? {} : { gradTo: gradHex(effective.gradTo) || "#6ee7b7" }) })}
                      opacity={{ value: settings.gradFromOpacity ?? effective.gradFromOpacity, onChange: (v) => setAlpha("gradFrom", "gradFromOpacity", v, gradHex(effective.gradFrom) || live.bg || "#38bdf8") }}
                      onClear={() => set({ gradFrom: "", gradTo: "", gradFromOpacity: "", gradToOpacity: "" })} />
                  </ColourRow>
                  <ColourRow label="To">
                    <ColorPicker compact caption={false} label="To"
                      value={gradHex(effective.gradTo) || "#6ee7b7"}
                      onChange={(v) => set({ gradTo: v, ...(gradHex(settings.gradFrom) ? {} : { gradFrom: gradHex(effective.gradFrom) || live.bg || "#38bdf8" }) })}
                      opacity={{ value: settings.gradToOpacity ?? effective.gradToOpacity, onChange: (v) => setAlpha("gradTo", "gradToOpacity", v, gradHex(effective.gradTo) || "#6ee7b7") }}
                      onClear={() => set({ gradFrom: "", gradTo: "", gradFromOpacity: "", gradToOpacity: "" })} />
                  </ColourRow>
                  <SliderRow label="Angle" value={settings.gradAngle} fallback={Number(effective.gradAngle) || 135}
                    min={0} max={360} step={15} unit="°"
                    onChange={(v) => set({ gradAngle: v })}
                    onReset={() => set({ gradAngle: "" })} />
                </div>
              )}
            </div>
            <div>
              <label className="text-xs font-medium block mb-1">Picture</label>
              <div className="flex items-center gap-2 flex-wrap">
                <button type="button" onClick={() => onPickBackground?.(widget.instanceId)}
                  className="h-9 px-3 rounded-lg border border-border text-xs flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5" /> {settings.bgImage ? "Change" : "Choose"}
                </button>
                {settings.bgImage && (
                  <>
                    <div className="flex gap-1">
                      {[["cover", "Fill"], ["contain", "Fit"], ["repeat", "Tile"]].map(([v, label]) => (
                        <button key={v} type="button" aria-pressed={(settings.bgSize || "cover") === v}
                          onClick={() => set({ bgSize: v })}
                          className={`text-xs px-2 py-1 rounded-full border ${
                            (settings.bgSize || "cover") === v ? "border-primary/60 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground"
                          }`}>{label}</button>
                      ))}
                    </div>
                    <button type="button" onClick={() => set({ bgImage: "" })}
                      className="text-xs px-2 py-1 rounded-full border border-border/50 text-muted-foreground flex-shrink-0 whitespace-nowrap">Remove</button>
                  </>
                )}
              </div>
            </div>
            <SliderRow label="Frosted blur" value={settings.blur} fallback={0}
              min={0} max={24} unit="px"
              onChange={(v) => set({ blur: v })}
              onReset={() => set({ blur: "" })} />
          </LookPart>

          {/* ── Styles: ready-made and saved looks, saving, copying ── */}
          <LookPart open={openParts.includes("styles")} title="Styles">
            <button
              type="button"
              onClick={() => set({ style: "" })}
              className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-all ${
                !settings.style ? "border-primary/60 bg-primary/10" : "border-border/40 hover:border-border"
              }`}
            >
              <span className="font-medium">Inherit page style</span>
              <span className="text-xs text-muted-foreground block">Currently “{pageStyleLabel}”</span>
            </button>
            <Segmented label="Which styles" value={styleTab} onChange={setStyleTab}
              options={[
                { value: "builtin", label: "Ready-made" },
                { value: "mine", label: `Yours${userStyles.length ? ` (${userStyles.length})` : ""}` },
                ...(themeLookEntries.length ? [{ value: "themes", label: "Themes" }] : []),
              ]} />
            {styleTab === "builtin" && (
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
            )}
            {styleTab === "mine" && (
              <div className="space-y-1">
                {userStyles.length === 0 && (
                  <p className="text-xs text-muted-foreground">No saved styles yet. Save this widget's look below to reuse it anywhere.</p>
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
                        onClick={() => set({ style: `${USER_STYLE_PREFIX}${st.id}` })}>
                        <span className="truncate block">{st.label}</span>
                        <span className="text-xs text-muted-foreground block">{cov.complete ? "Whole look" : `Changes ${cov.covers.map((g) => g.label).join(", ") || "nothing"}`}</span>
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
              </div>
            )}
            {styleTab === "themes" && (
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

            {/* Save: the ticks are the sheet's own sections. Untick some
                and it's a partial style you can lay over anything. */}
            <div className="pt-2 border-t border-border/30 space-y-2">
              {naming ? (
                <>
                  <div className="flex gap-1.5">
                    <input autoFocus value={styleName} onChange={(e) => setStyleName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") saveStyle(); if (e.key === "Escape") setNaming(false); }}
                      placeholder="Name this style" maxLength={40}
                      className="flex-1 min-w-0 h-8 px-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                    <button type="button" onClick={saveStyle} disabled={!styleName.trim() || saveGroups.length === 0}
                      className="text-xs px-2.5 py-1.5 rounded-lg border border-primary/50 text-primary disabled:opacity-40">Save</button>
                    <button type="button" onClick={() => setNaming(false)}
                      className="text-xs px-2.5 py-1.5 rounded-lg border border-border/50 text-muted-foreground">Cancel</button>
                  </div>
                  <p className="text-[0.6875rem] text-muted-foreground">What it carries:</p>
                  <PartTicks value={saveGroups} onChange={setSaveGroups} />
                </>
              ) : (
                <button type="button" onClick={() => { setStyleName(""); setNaming(true); }}
                  className="text-xs px-2.5 py-1.5 rounded-lg border border-primary/50 text-primary">
                  Save this look as a style
                </button>
              )}
            </div>

            {/* Copy this widget's look onto others — all of it, or just the
                parts ticked. */}
            {onApplyLook && (
              <div className="pt-2 border-t border-border/30 space-y-2">
                <button type="button" onClick={() => setApplyOpen((v) => !v)} aria-expanded={applyOpen}
                  className="w-full flex items-center gap-2 text-left">
                  <Copy className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="flex-1 text-xs font-medium">Apply this look to…</span>
                  <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${applyOpen ? "rotate-180" : ""}`} />
                </button>
                {applyOpen && (
                  <div className="space-y-2">
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
                  </div>
                )}
              </div>
            )}
          </LookPart>

          {/* ── Your own CSS: the escape hatch, scoped to this widget ── */}
          <LookPart open={openParts.includes("css")} title="Your own CSS">
            <DebouncedText multiline rows={5} value={ownCss}
              placeholder={"border-image: url(...) 30 round;\nletter-spacing: .04em;"}
              onCommit={(v) => set({ css: v })}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-xs font-mono resize-y focus:outline-none focus:ring-1 focus:ring-ring" />
            <p className="text-[0.6875rem] text-muted-foreground">
              Plain CSS declarations, applied to this widget only. Anything CSS can do — border images, gradients, filters.
            </p>
          </LookPart>

          {/* ── Icon — app shortcuts only ── */}
          {widget.widgetId === "app_shortcut" && (
            <LookPart open={openParts.includes("icon")} title="Icon"
              onReset={setHere(["iconName", "iconUrl"]) ? () => set({ iconUrl: "", iconName: "" }) : null} resetLabel="Remove custom icon">
              <div className="flex items-center gap-2 flex-wrap">
                {iconPreview ? (
                  <img src={iconPreview} alt="" className="w-11 h-11 rounded-2xl object-cover border border-border/40" />
                ) : (
                  <span className="w-11 h-11 rounded-2xl border border-dashed border-border/50 flex items-center justify-center text-muted-foreground">
                    <ImageIcon className="w-4 h-4" />
                  </span>
                )}
                <button type="button" onClick={() => setIconPickerOpen(true)}
                  className="text-xs px-3 py-1.5 rounded-full border border-border/50 text-muted-foreground hover:text-foreground">
                  {settings.iconName ? `Icon: ${settings.iconName}` : "Choose icon…"}
                </button>
                <button type="button" onClick={() => onPickIcon(widget.instanceId)}
                  className="text-xs px-3 py-1.5 rounded-full border border-border/50 text-muted-foreground hover:text-foreground">
                  Choose image…
                </button>
                <IconPicker open={iconPickerOpen} onClose={() => setIconPickerOpen(false)} allowImage={false}
                  current={settings.iconName || ""}
                  onPick={(o) => set({ iconName: o.iconName || "" })} />
              </div>
            </LookPart>
          )}

          <div className="pt-2 border-t border-border/50 space-y-2">
            {/* Reset asks how much: just the look (every section and the
                style), or everything the widget ships with. */}
            {resetAsk ? (
              <div className="rounded-lg border border-border/60 p-3 space-y-2">
                <p className="text-sm font-medium">Reset {settings.label || defLabel}?</p>
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
            ) : (
              <button type="button" onClick={() => setResetAsk(true)}
                className="w-full flex items-center justify-center gap-2 h-10 rounded-lg border border-border/60 text-sm font-medium hover:bg-muted/50">
                <RotateCcw className="w-4 h-4" /> Reset…
              </button>
            )}
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
