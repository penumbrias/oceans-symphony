import React, { useMemo, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useTerms } from "@/lib/useTerms";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { GripVertical, Lock, LayoutGrid, Sparkles, SlidersHorizontal, Undo2 } from "lucide-react";
import { CLASSIC_TO_V2_WIDGET } from "@/lib/widgetRegistry";
import { V2_WIDGETS } from "@/v2/widgets";
import { resolveUserStyles, newStyleId } from "@/lib/widgetLook";
import { widgetLookFor } from "@/pages/ExperimentalDashboard";
import WidgetConfigSheet from "@/components/dashboard/WidgetConfigSheet";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DASHBOARD_ELEMENTS, DEFAULT_LAYOUT, resolveLayout } from "@/lib/dashboardLayout";
import {
  getBulletinBatchSize,
  setBulletinBatchSize,
  BATCH_MIN,
  BATCH_MAX,
  DEFAULT_BATCH,
} from "@/lib/bulletinLimit";
import { toast } from "sonner";
import { EXPERIMENTAL_HOME_ENABLED, UI_V2_ENABLED } from "@/lib/featureFlags";

// Drag/drop pill row. Whole row is the drag handle when grabbed from
// the GripVertical icon — using a dedicated handle keeps the toggle
// switch tappable without accidentally starting a drag.
// Sub-toggle ids that live INSIDE another pill's row (see quick_checkin
// below) rather than getting their own draggable SortablePill.
const SUB_TOGGLE_IDS = ["start_activity_button", "start_symptom_button", "quick_task_button", "quick_plan_button"];

function SortablePill({ entry, idx, total, onToggle, onBulletinBatchChange, bulletinBatchSize, subToggleEntries, onUpgrade, onConfigure, onRevert }) {
  const meta = DASHBOARD_ELEMENTS[entry.id];
  const locked = !!meta?.locked;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: entry.id });
  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    zIndex: isDragging ? 50 : "auto",
  };
  // Local text mirror for the batch field so it can be cleared and
  // mid-typed freely. The committed value is parsed/clamped/persisted on
  // blur — not on every keystroke, which made the field snap back to the
  // old number and feel impossible to change.
  const [batchText, setBatchText] = useState(String(bulletinBatchSize));
  useEffect(() => { setBatchText(String(bulletinBatchSize)); }, [bulletinBatchSize]);
  if (!meta) return null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 transition-colors ${
        entry.enabled ? "bg-card border-border/50" : "bg-muted/20 border-border/30 opacity-70"
      } ${isDragging ? "shadow-lg ring-2 ring-primary/40" : ""}`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
        className="touch-none cursor-grab active:cursor-grabbing w-7 h-9 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium truncate">{meta.label}</p>
          {locked && (
            <Lock className="w-3 h-3 text-muted-foreground flex-shrink-0" aria-label="Always shown" />
          )}
        </div>
        {meta.description && (
          <p className="text-[0.6875rem] text-muted-foreground mt-0.5 leading-snug">{meta.description}</p>
        )}
        {entry.id === "bulletin_board" && entry.enabled && (
          <div className="flex items-center gap-2 mt-2">
            <label className="text-[0.6875rem] text-muted-foreground">Show</label>
            <input
              type="number"
              inputMode="numeric"
              min={BATCH_MIN}
              max={BATCH_MAX}
              value={batchText}
              onChange={(e) => setBatchText(e.target.value)}
              onBlur={() => onBulletinBatchChange(batchText)}
              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
              className="w-14 h-7 px-2 text-xs rounded-md border border-border/50 bg-background text-foreground"
            />
            <span className="text-[0.6875rem] text-muted-foreground">
              at a time (then "Load more" reveals {bulletinBatchSize} more each tap)
            </span>
          </div>
        )}
        {entry.id === "current_fronters" && (
          <p className="text-[0.6875rem] text-muted-foreground/90 mt-2 leading-snug border-l-2 border-primary/40 pl-2">
            You can hide this if you don't track fronting — every other
            feature should still work, and anything you log lands on the
            system as a whole. If you find a screen that gets stuck
            without a fronter set, please send a bug report via Settings →
            Report a Bug.
          </p>
        )}
        {entry.id === "quick_checkin" && subToggleEntries && (
          <div className="mt-2 space-y-1.5 border-l-2 border-border/30 pl-2">
            {subToggleEntries.map((sub) => {
              const subMeta = DASHBOARD_ELEMENTS[sub.id];
              if (!subMeta) return null;
              return (
                <div key={sub.id} className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{subMeta.label}</p>
                    <p className="text-[0.625rem] text-muted-foreground leading-snug">{subMeta.description}</p>
                  </div>
                  <Switch
                    checked={sub.enabled}
                    onCheckedChange={(v) => onToggle(sub.id, v)}
                    aria-label={`Toggle ${subMeta.label}`}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
      {/* Board-widget upgrade for this slot: ✨ swaps the classic card
          for its live board widget (modes, config, colours — the works);
          once upgraded, ⚙ opens its options and ↩ restores the classic
          card. Slots without a widget twin show nothing extra. */}
      {entry.v2 ? (
        <span className="flex items-center gap-0.5 flex-shrink-0">
          <button type="button" onClick={() => onConfigure?.(entry.id)}
            title="Widget options" aria-label={`Options for ${meta.label} widget`}
            className="p-1.5 rounded-md text-primary hover:bg-primary/10">
            <SlidersHorizontal className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={() => onRevert?.(entry.id)}
            title="Back to the classic card" aria-label={`Use the classic ${meta.label} card`}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50">
            <Undo2 className="w-3.5 h-3.5" />
          </button>
        </span>
      ) : (onUpgrade && CLASSIC_TO_V2_WIDGET[entry.id] && V2_WIDGETS[CLASSIC_TO_V2_WIDGET[entry.id]] ? (
        <button type="button" onClick={() => onUpgrade(entry.id)}
          title="Use the board widget — modes, options, colours"
          aria-label={`Upgrade ${meta.label} to its board widget`}
          className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 flex-shrink-0">
          <Sparkles className="w-3.5 h-3.5" />
        </button>
      ) : null)}
      {locked ? (
        <span className="text-[0.625rem] text-muted-foreground uppercase tracking-wide flex-shrink-0">
          Always on
        </span>
      ) : (
        <Switch
          checked={entry.enabled}
          onCheckedChange={(v) => onToggle(entry.id, v)}
          aria-label={`Toggle ${meta.label}`}
        />
      )}
    </div>
  );
}

// The New-UI opt-in, on its own so onboarding can offer it too. Same
// record, same write, one implementation.
export function NewUiToggle() {
  const queryClient = useQueryClient();
  const { data: rows = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  const record = rows[0];
  const on = record?.ui_v2?.enabled === true;
  const toggle = async (next) => {
    try {
      const patch = { ...(record?.ui_v2 || {}), enabled: next };
      if (record?.id) await base44.entities.SystemSettings.update(record.id, { ui_v2: patch });
      else await base44.entities.SystemSettings.create({ ui_v2: patch });
      queryClient.invalidateQueries({ queryKey: ["systemSettings"] });
      toast.success(next ? "New UI on" : "Classic navigation restored");
    } catch (e) {
      toast.error(e?.message || "Couldn't switch");
    }
  };
  if (!UI_V2_ENABLED) return null;
  return (
    <label className="flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5 cursor-pointer">
      <div className="min-w-0">
        <span className="text-sm font-medium">New home screen</span>
        <p className="text-xs text-muted-foreground mt-0.5">
          Build your home screen from widgets. Switch back any time.
        </p>
      </div>
      <Switch checked={on} onCheckedChange={toggle} />
    </label>
  );
}

// The classic-hosted v2 bars, on their own so the setup guide can offer
// them too. Same record, same writes, one implementation. Reads/writes
// ui_v2.classicBars (+ the board's altersBar.enabled for the pinned bar,
// which is the same bar the widget board shows — one switch, one truth).
export function ClassicBarsToggles() {
  const queryClient = useQueryClient();
  const t = useTerms();
  const { data: rows = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  const record = rows[0];
  const cb = record?.ui_v2?.classicBars || {};
  const topOn = cb.top === true;
  const actionsOn = cb.actions !== false;
  const wide = typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;
  const homeField = wide ? "ui_v2_home_desktop" : "ui_v2_home";
  const altersOn = cb.alters !== false && record?.[homeField]?.altersBar?.enabled === true;
  const writeCb = async (patch, alsoAlters = null) => {
    try {
      const next = { ...(record?.ui_v2 || {}), classicBars: { ...cb, ...patch } };
      const write = { ui_v2: next };
      if (alsoAlters !== null) {
        write[homeField] = {
          ...(record?.[homeField] || {}),
          altersBar: { ...(record?.[homeField]?.altersBar || {}), enabled: alsoAlters, collapsed: false },
        };
      }
      if (record?.id) await base44.entities.SystemSettings.update(record.id, write);
      else await base44.entities.SystemSettings.create(write);
      queryClient.invalidateQueries({ queryKey: ["systemSettings"] });
    } catch (e) {
      toast.error(e?.message || "Couldn't switch");
    }
  };
  if (!UI_V2_ENABLED) return null;
  const Row = ({ label, hint, checked, onChange }) => (
    <label className="flex items-center justify-between gap-3 rounded-xl border border-border/50 px-3 py-2.5 cursor-pointer">
      <div className="min-w-0">
        <span className="text-sm font-medium">{label}</span>
        <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
  return (
    <div className="space-y-2">
      <Row label="New top bar"
        hint={`${t.System} name, who's ${t.fronting}, clock, search and notifications — replaces the classic header.`}
        checked={topOn} onChange={(v) => writeCb({ top: !!v })} />
      <Row label="Quick action bar"
        hint="A fold-out row of one-tap capture keys above the tab bar."
        checked={actionsOn} onChange={(v) => writeCb({ actions: !!v })} />
      <Row label={`Pinned ${t.alters} bar`}
        hint={`Your pinned ${t.alters} in a floating bar — tap to toggle ${t.fronting}, hold for the level rail.`}
        checked={altersOn} onChange={(v) => writeCb({ alters: true }, !!v)} />
      {/* The widget board is one swipe left of the classic home — this
          decides which of the two "/" opens on. */}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border/50 px-3 py-2.5">
        <div className="min-w-0">
          <span className="text-sm font-medium">Home opens on</span>
          <p className="text-xs text-muted-foreground mt-0.5">
            The widget board is always one swipe left; pick which one greets you.
          </p>
        </div>
        <div className="flex gap-1 flex-shrink-0">
          {[["classic", "Classic"], ["board", "Board"]].map(([v, label]) => {
            const on = (record?.ui_v2?.homeDefault === "board" ? "board" : "classic") === v;
            return (
              <button key={v} type="button" aria-pressed={on}
                onClick={async () => {
                  try {
                    const next = { ...(record?.ui_v2 || {}), homeDefault: v };
                    if (record?.id) await base44.entities.SystemSettings.update(record.id, { ui_v2: next });
                    else await base44.entities.SystemSettings.create({ ui_v2: next });
                    queryClient.invalidateQueries({ queryKey: ["systemSettings"] });
                  } catch (e) { toast.error(e?.message || "Couldn't switch"); }
                }}
                className={`text-xs px-2.5 py-1 rounded-full border ${on ? "border-primary/60 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground"}`}>
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function DashboardLayoutSettings() {
  const queryClient = useQueryClient();
  const { data: settings = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  const record = settings[0] || null;

  const layout = useMemo(
    () => resolveLayout(record?.dashboard_layout),
    [record?.dashboard_layout]
  );

  // Local mirror so drag movements feel instant. We commit the new
  // order to SystemSettings on drag-end (not on every frame) — the
  // user sees the pill snap into place and the dashboard re-renders
  // a beat later.
  const [draftLayout, setDraftLayout] = useState(layout);
  useEffect(() => { setDraftLayout(layout); }, [layout]);

  // start_activity_button / start_symptom_button aren't standalone
  // draggable pills — they render nested inside the quick_checkin row
  // (see SortablePill). Keep them out of the visible/sortable list but
  // still part of draftLayout so toggle()/persist() covers them.
  const visiblePills = useMemo(
    () => draftLayout.filter((e) => !SUB_TOGGLE_IDS.includes(e.id)),
    [draftLayout]
  );
  const subToggleEntries = useMemo(
    () => draftLayout.filter((e) => SUB_TOGGLE_IDS.includes(e.id)),
    [draftLayout]
  );

  // Bulletin batch size lives in localStorage (per-device), not on
  // SystemSettings. Mirrored here in state so the input is reactive
  // without a full re-query, plus a "storage" listener for the rare
  // case of multi-tab editing.
  const [batchSize, setBatchSizeLocal] = useState(() => getBulletinBatchSize());
  useEffect(() => {
    const sync = () => setBatchSizeLocal(getBulletinBatchSize());
    window.addEventListener("bulletin-batch-size-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("bulletin-batch-size-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const persist = async (nextLayout) => {
    if (record?.id) {
      await base44.entities.SystemSettings.update(record.id, { dashboard_layout: nextLayout });
    } else {
      await base44.entities.SystemSettings.create({ dashboard_layout: nextLayout });
    }
    queryClient.invalidateQueries({ queryKey: ["systemSettings"] });
    try { window.dispatchEvent(new CustomEvent("dashboard-layout-changed")); }
    catch { /* ignore */ }
  };

  // ── Board-widget upgrades per slot (entry.v2) ──
  const [configFor, setConfigFor] = useState(null); // entry id whose sheet is open
  const patchEntry = (id, fn) => {
    const next = draftLayout.map((e) => (e.id === id ? fn(e) : e));
    setDraftLayout(next);
    persist(next);
  };
  const upgradeSlot = (id) => {
    const widgetId = CLASSIC_TO_V2_WIDGET[id];
    if (!widgetId || !V2_WIDGETS[widgetId]) return;
    patchEntry(id, (e) => ({ ...e, v2: { widgetId, mode: "normal", settings: {} } }));
    setConfigFor(id);
  };
  const revertSlot = (id) => {
    setConfigFor((cur) => (cur === id ? null : cur));
    patchEntry(id, (e) => { const { v2: _v2, ...rest } = e; return rest; });
  };
  const configEntry = configFor ? draftLayout.find((e) => e.id === configFor && e.v2) : null;
  const configWidget = configEntry
    ? { instanceId: `classic_${configEntry.id}`, widgetId: configEntry.v2.widgetId, mode: configEntry.v2.mode || "normal", settings: configEntry.v2.settings || {} }
    : null;
  const configDef = configEntry ? V2_WIDGETS[configEntry.v2.widgetId] : null;
  const layoutUserStyles = resolveUserStyles(record?.ui_v2_styles);

  const toggle = (id, enabled) => {
    const next = draftLayout.map((e) => (e.id === id ? { ...e, enabled } : e));
    setDraftLayout(next);
    persist(next);
  };

  const resetToDefault = async () => {
    const next = DEFAULT_LAYOUT.map((e) => ({ ...e }));
    setDraftLayout(next);
    await persist(next);
    toast.success("Dashboard layout reset to default");
  };

  // DnD sensors — same config as QuickNavMenu so the touch behaviour
  // is consistent (200ms hold to grab on mobile, 8px pointer threshold
  // on mouse).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  const handleDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const oldIndex = draftLayout.findIndex((e) => e.id === active.id);
    const newIndex = draftLayout.findIndex((e) => e.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const next = arrayMove(draftLayout, oldIndex, newIndex);
    setDraftLayout(next);
    persist(next);
  };

  // Commit (called on blur / Enter): parse, fall back to the default for
  // empty/invalid, clamp, persist, and sync local state. Previously this
  // ran on every keystroke AND referenced an undefined `setBatchSize`,
  // so any valid digit threw and the field never updated.
  const handleBatchChange = (raw) => {
    const parsed = parseInt(raw, 10);
    const n = Number.isFinite(parsed) ? parsed : DEFAULT_BATCH;
    const clamped = Math.max(BATCH_MIN, Math.min(BATCH_MAX, n));
    setBulletinBatchSize(clamped);
    setBatchSizeLocal(clamped);
  };

  // Experimental homescreen toggle (v0.90.0). Enabling seeds the widget
  // layout from the classic dashboard (only the first time); disabling
  // keeps the built layout for later. Classic dashboard_layout is never
  // touched by the experimental view.
  const experimentalOn = record?.experimental_home?.enabled === true;
  const toggleExperimental = async (on) => {
    try {
      const { seedFromClassic } = await import("@/lib/experimentalHome");
      const { WIDGET_REGISTRY, CLASSIC_TO_WIDGET } = await import("@/lib/widgetRegistry");
      const existing = record?.experimental_home;
      const next = on
        ? (existing && Array.isArray(existing.pages) && existing.pages.some((p) => (p.widgets || []).length > 0)
            ? { ...existing, enabled: true }
            : seedFromClassic(record?.dashboard_layout, WIDGET_REGISTRY, CLASSIC_TO_WIDGET))
        : { ...(existing || {}), enabled: false };
      if (record?.id) await base44.entities.SystemSettings.update(record.id, { experimental_home: next });
      else await base44.entities.SystemSettings.create({ experimental_home: next });
      queryClient.invalidateQueries({ queryKey: ["systemSettings"] });
      toast.success(on ? "Experimental homescreen on" : "Back to the classic dashboard");
    } catch (e) {
      toast.error(e?.message || "Couldn't switch");
    }
  };

  // UI v2 opt-in toggle (build-gated by UI_V2_ENABLED).
  const uiV2On = record?.ui_v2?.enabled === true;
  const toggleUiV2 = async (on) => {
    try {
      const next = { ...(record?.ui_v2 || {}), enabled: on };
      if (record?.id) await base44.entities.SystemSettings.update(record.id, { ui_v2: next });
      else await base44.entities.SystemSettings.create({ ui_v2: next });
      queryClient.invalidateQueries({ queryKey: ["systemSettings"] });
      toast.success(on ? "New UI on" : "Classic navigation restored");
    } catch (e) {
      toast.error(e?.message || "Couldn't switch");
    }
  };

  return (
    <section className="space-y-3 border-t border-border/30 pt-4">
      {UI_V2_ENABLED && (
        <label className="flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5 cursor-pointer">
          <div className="min-w-0">
            <span className="text-sm font-medium flex items-center gap-1.5">
              🧪 New UI (in progress)
            </span>
            <p className="text-xs text-muted-foreground mt-0.5">
              The rebuilt navigation and pages, still being built. Everything you have keeps working underneath — switch back any time.
            </p>
          </div>
          <Switch checked={uiV2On} onCheckedChange={toggleUiV2} />
        </label>
      )}

      {/* The v2 bars in the CLASSIC chrome — only offered while the full
          new UI is off (v2 already carries its own bars). */}
      {UI_V2_ENABLED && !uiV2On && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">New bars in the classic look</p>
          <ClassicBarsToggles />
        </div>
      )}

      {EXPERIMENTAL_HOME_ENABLED && (
      <label className="flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5 cursor-pointer">
        <div className="min-w-0">
          <span className="text-sm font-medium flex items-center gap-1.5">
            🧪 Experimental homescreen
          </span>
          <p className="text-xs text-muted-foreground mt-0.5">
            A phone-style home: placeable widgets, an app drawer, and a quick-action bar. Your classic dashboard stays saved — switch back any time.
          </p>
        </div>
        <Switch checked={experimentalOn} onCheckedChange={toggleExperimental} />
      </label>
      )}

      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2">
            <LayoutGrid className="w-4 h-4 text-muted-foreground" />
            Dashboard layout
          </h3>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            Drag the grip handle to reorder, and switch any block off if
            you don't want it. The Quick-Nav grid + search is always
            on but can be moved.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={resetToDefault} className="text-xs flex-shrink-0">
          Reset
        </Button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={visiblePills.map((e) => e.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-1.5">
            {visiblePills.map((entry, idx) => (
              <SortablePill
                key={entry.id}
                entry={entry}
                idx={idx}
                total={visiblePills.length}
                onToggle={toggle}
                onBulletinBatchChange={handleBatchChange}
                bulletinBatchSize={batchSize}
                subToggleEntries={entry.id === "quick_checkin" ? subToggleEntries : undefined}
                onUpgrade={upgradeSlot}
                onConfigure={setConfigFor}
                onRevert={revertSlot}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* THE board widget-options sheet, driving an upgraded classic slot —
          one sheet, not a lookalike: modes, config fields, colours &
          background, presets, saved styles all behave exactly as on the
          board. "Remove" here means "back to the classic card". */}
      {configWidget && configDef && (
        <WidgetConfigSheet
          widget={configWidget}
          def={configDef}
          pageStyleId=""
          resolvedLook={widgetLookFor(configWidget, layoutUserStyles, "current")}
          userStyles={layoutUserStyles}
          onClose={() => setConfigFor(null)}
          onMode={(_iid, mode) => patchEntry(configFor, (e) => ({ ...e, v2: { ...e.v2, mode } }))}
          onSettings={(_iid, patch) => patchEntry(configFor, (e) => ({ ...e, v2: { ...e.v2, settings: { ...(e.v2.settings || {}), ...patch } } }))}
          onRemove={() => revertSlot(configFor)}
          onResetWidget={() => patchEntry(configFor, (e) => ({ ...e, v2: { widgetId: e.v2.widgetId, mode: "normal", settings: {} } }))}
          onPickIcon={() => toast.info("Custom icons live on the widget board")}
          onSaveStyle={async (label, look) => {
            try {
              const styles = [...layoutUserStyles, { id: newStyleId(), label, look }];
              if (record?.id) await base44.entities.SystemSettings.update(record.id, { ui_v2_styles: styles });
              else await base44.entities.SystemSettings.create({ ui_v2_styles: styles });
              queryClient.invalidateQueries({ queryKey: ["systemSettings"] });
              toast.success(`Style "${label}" saved`);
            } catch (e) { toast.error(e?.message || "Couldn't save the style"); }
          }}
        />
      )}
    </section>
  );
}
