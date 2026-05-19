import React, { useMemo, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { GripVertical, Lock, LayoutGrid } from "lucide-react";
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
} from "@/lib/bulletinLimit";
import { toast } from "sonner";

// Drag/drop pill row. Whole row is the drag handle when grabbed from
// the GripVertical icon — using a dedicated handle keeps the toggle
// switch tappable without accidentally starting a drag.
function SortablePill({ entry, idx, total, onToggle, onBulletinBatchChange, bulletinBatchSize }) {
  const meta = DASHBOARD_ELEMENTS[entry.id];
  const locked = !!meta?.locked;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: entry.id });
  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    zIndex: isDragging ? 50 : "auto",
  };
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
              min={BATCH_MIN}
              max={BATCH_MAX}
              value={bulletinBatchSize}
              onChange={(e) => onBulletinBatchChange(e.target.value)}
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
      </div>
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

  const handleBatchChange = (raw) => {
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n)) return;
    setBatchSize(n);
    setBatchSizeLocal(Math.max(BATCH_MIN, Math.min(BATCH_MAX, n)));
  };

  return (
    <section className="space-y-3 border-t border-border/30 pt-4">
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
          items={draftLayout.map((e) => e.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-1.5">
            {draftLayout.map((entry, idx) => (
              <SortablePill
                key={entry.id}
                entry={entry}
                idx={idx}
                total={draftLayout.length}
                onToggle={toggle}
                onBulletinBatchChange={handleBatchChange}
                bulletinBatchSize={batchSize}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </section>
  );
}
