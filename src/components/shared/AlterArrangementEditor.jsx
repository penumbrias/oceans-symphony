// The manual alter arrangement editor — ONE implementation, used by both
// Settings → {Alter} setup (the system-wide order, which every alter list
// follows) and a widget's own override. Entries are ordered
// { type: "alter" | "group", id } records: drag by the grip, add through
// the house searchable pickers, x to drop. A group entry expands to its
// members wherever it sits.

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { GripVertical, X } from "lucide-react";
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS as DndCSS } from "@dnd-kit/utilities";
import { base44 } from "@/api/base44Client";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { SearchableSelect } from "@/components/shared/SearchableSelect";

// ── Manual arrangement ─────────────────────────────────────────────
// Owner request: not just sort rules — the user says literally "this
// alter, then this subsystem, then that alter". Entries are ordered
// { type: "alter" | "group", id } records; drag to reorder, add via the
// house searchable pickers, tap × to drop. A "group" entry expands to its
// members where it sits in the order.
function ArrangementRow({ entry, label, sub, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: entry.key });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: DndCSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-border/50 bg-background"
    >
      <button type="button" {...attributes} {...listeners}
        aria-label={`Reorder ${label}`}
        className="text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing touch-none">
        <GripVertical className="w-4 h-4" />
      </button>
      <span className="min-w-0 flex-1">
        <span className="text-sm truncate block">{label}</span>
        <span className="text-[0.6875rem] text-muted-foreground">{sub}</span>
      </span>
      <button type="button" onClick={onRemove} aria-label={`Remove ${label}`}
        className="text-muted-foreground hover:text-destructive flex-shrink-0">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export default function AlterArrangementEditor({ value = [], onChange }) {
  const terms = useTerms();
  const formatAlter = useAlterLabel();
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  const { data: groups = [] } = useQuery({ queryKey: ["groups"], queryFn: () => base44.entities.Group.list() });
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 5 } }),
  );
  // Stable per-row keys: the same alter can't appear twice, but a key
  // that survives reorders keeps dnd-kit honest.
  const entries = (Array.isArray(value) ? value : []).map((e) => ({ ...e, key: `${e.type}:${e.id}` }));
  const has = (type, id) => entries.some((e) => e.type === type && e.id === id);
  const add = (type, id) => { if (id && !has(type, id)) onChange([...entries.map(({ key, ...e }) => e), { type, id }]); };
  const removeAt = (i) => onChange(entries.filter((_, j) => j !== i).map(({ key, ...e }) => e));
  const onDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const from = entries.findIndex((e) => e.key === active.id);
    const to = entries.findIndex((e) => e.key === over.id);
    if (from < 0 || to < 0) return;
    onChange(arrayMove(entries, from, to).map(({ key, ...e }) => e));
  };
  const labelFor = (e) => e.type === "alter"
    ? (formatAlter(alters.find((a) => a.id === e.id)) || "—")
    : (groups.find((g) => g.id === e.id)?.name || "—");

  return (
    <div className="space-y-2">
      {entries.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Nothing placed yet — add {terms.alters} and groups below, then drag them into the order you want.
        </p>
      )}
      {entries.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={entries.map((e) => e.key)} strategy={verticalListSortingStrategy}>
            <div className="space-y-1">
              {entries.map((e, i) => (
                <ArrangementRow key={e.key} entry={e} label={labelFor(e)}
                  sub={e.type === "alter" ? terms.Alter : "Group / subsystem"}
                  onRemove={() => removeAt(i)} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
      <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-2">
        <SearchableSelect
          value=""
          onChange={(v) => add("alter", v)}
          options={alters.filter((a) => !a.is_archived && !has("alter", a.id))
            .map((a) => ({ id: a.id, label: formatAlter(a) }))}
          placeholder={`Add an ${terms.alter}…`}
          searchPlaceholder={`Search ${terms.alters}…`}
        />
        <SearchableSelect
          value=""
          onChange={(v) => add("group", v)}
          options={groups.filter((g) => !has("group", g.id)).map((g) => ({ id: g.id, label: g.name || "Group" }))}
          placeholder="Add a group…"
          searchPlaceholder="Search groups…"
        />
      </div>
    </div>
  );
}

