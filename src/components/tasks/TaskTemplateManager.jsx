import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SearchableMultiSelect } from "@/components/shared/SearchableSelect";
import { taskActivityConfig } from "@/lib/dailyTaskActivity";
import { flattenCategoryTree } from "@/lib/categoryTreeUtils";
import { AUTO_TRIGGER_OPTIONS, DEFAULT_TASK_TEMPLATES, FREQUENCY_LABELS, WEEKDAY_LABELS, applyTerms } from "@/lib/dailyTaskSystem";
import { useTerms } from "@/lib/useTerms";
import { Plus, GripVertical, Pencil, Trash2, RotateCcw, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  DndContext, closestCenter, PointerSensor, TouchSensor,
  useSensor, useSensors,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy,
  useSortable, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const FREQUENCY_ORDER = ["daily", "weekly", "monthly", "yearly"];

const SECTION_STYLE = {
  daily:   { label: "Daily",   dot: "bg-blue-500",   header: "text-blue-500",   badge: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
  weekly:  { label: "Weekly",  dot: "bg-green-500",  header: "text-green-500",  badge: "bg-green-500/10 text-green-500 border-green-500/20" },
  monthly: { label: "Monthly", dot: "bg-amber-500",  header: "text-amber-500",  badge: "bg-amber-500/10 text-amber-500 border-amber-500/20" },
  yearly:  { label: "Yearly",  dot: "bg-purple-500", header: "text-purple-500", badge: "bg-purple-500/10 text-purple-500 border-purple-500/20" },
};

const EMPTY_FORM = {
  title: "", description: "", points: 3, frequency: "daily",
  mode: "MANUAL", is_active: true, sort_order: 0,
  auto_trigger: "",                  // legacy single-trigger field, kept for back-compat
  auto_triggers: [],                 // new: ordered list of trigger ids
  auto_trigger_mode: "any",          // "any" (OR) | "all" (AND) — only matters when 2+
  nav_path: "",
  activity_category_ids: [],         // MANUAL only: tapping the task records these activities…
  activity_mode: "timed",            // …"timed" (runs for activity_minutes) | "active" (runs until ended) | "log" (logged done, nothing runs)
  activity_minutes: "",
  count_mode: "once",                // MANUAL only: "once" | "target" (target_count times a period) | "tally" (just counts) | "steps"
  target_count: "",
  steps: [],                         // [{ id, text }] for count_mode "steps"
  active_days: [],                   // daily only: which weekdays it's due (0 = Sunday); empty = every day
  reset_mode: "calendar",            // "calendar" (period / chosen weekday) | "rolling" (a full period after last completion)
  week_start_day: 1,                 // weekly + calendar: which weekday the week resets on (0 = Sunday)
};

// Pull the trigger list off a template, falling back to the legacy
// single field so editing an old template surfaces what's already set.
function readTriggers(form) {
  if (Array.isArray(form?.auto_triggers) && form.auto_triggers.length > 0) {
    return form.auto_triggers.filter(Boolean);
  }
  return form?.auto_trigger ? [form.auto_trigger] : [];
}

// What a saved task stores about its activities. The first build's single
// `activity_category_id` is cleared once the list takes over.
function activityFields(form) {
  const ids = form.mode === "MANUAL" ? (form.activity_category_ids || []).filter(Boolean) : [];
  const mode = ["timed", "active", "log"].includes(form.activity_mode) ? form.activity_mode : "timed";
  const minutes = Math.round(Number(form.activity_minutes) || 0);
  return {
    activity_category_ids: ids,
    activity_category_id: null,
    activity_mode: ids.length ? (mode === "timed" && minutes <= 0 ? "active" : mode) : null,
    activity_minutes: ids.length && mode === "timed" && minutes > 0 ? minutes : null,
  };
}

// How a saved task is completed (taskCounts.js). Step ids are kept on
// edit so this period's ticks stay with their step.
function countFields(form) {
  const mode = form.mode === "MANUAL" && ["target", "tally", "steps"].includes(form.count_mode) ? form.count_mode : "once";
  const target = Math.round(Number(form.target_count) || 0);
  const steps = (form.steps || []).map((st) => ({ id: st.id, text: String(st.text || "").trim() })).filter((st) => st.text);
  if (mode === "target" && target >= 2) return { count_mode: "target", target_count: target, steps: [] };
  if (mode === "tally") return { count_mode: "tally", target_count: null, steps: [] };
  if (mode === "steps" && steps.length) return { count_mode: "steps", target_count: null, steps };
  return { count_mode: "once", target_count: null, steps: [] };
}

const newStepId = () => (globalThis.crypto?.randomUUID?.() || `step_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`);
const PERIOD_WORD = { daily: "day", weekly: "week", monthly: "month", yearly: "year" };

function TaskForm({ initial, onSave, onCancel, isNew }) {
  const [form, setForm] = useState(() => {
    if (!initial) return EMPTY_FORM;
    // Older tasks (v0.255.0) stored one activity and no mode — show them
    // in the current shape.
    const cfg = taskActivityConfig(initial);
    const base = cfg
      ? { ...initial, activity_category_ids: cfg.categoryIds, activity_mode: cfg.mode, activity_minutes: cfg.minutes || initial.activity_minutes || "" }
      : { ...initial, activity_category_ids: [], activity_mode: "timed" };
    // Older tasks have no count fields — they're "once".
    return { ...base, count_mode: base.count_mode || "once", target_count: base.target_count ?? "", steps: Array.isArray(base.steps) ? base.steps : [] };
  });
  const terms = useTerms();
  const { data: categories = [] } = useQuery({
    queryKey: ["activityCategories"],
    queryFn: () => base44.entities.ActivityCategory.list(),
  });
  // Nested picker (house rule: hierarchies never render as a flat select).
  const categoryOptions = useMemo(
    () => flattenCategoryTree(categories).map((c) => ({ id: c.id, label: c.name, color: c.color, _depth: c._depth })),
    [categories],
  );
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  return (
    <div className="bg-muted/30 border border-border rounded-xl p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="text-xs font-medium text-muted-foreground">Title</label>
          <input className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Task title" />
        </div>
        <div className="col-span-2">
          <label className="text-xs font-medium text-muted-foreground">Description</label>
          <textarea className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none"
            rows={2} value={form.description} onChange={(e) => set("description", e.target.value)}
            placeholder="Optional description" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Frequency</label>
          <select className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={form.frequency || "daily"} onChange={(e) => set("frequency", e.target.value)}>
            {Object.entries(FREQUENCY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Points</label>
          <input type="number" min={1} max={100}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={form.points} onChange={(e) => set("points", Number(e.target.value))} />
        </div>
        {/* Daily tasks can be due only on some weekdays. */}
        {(form.frequency || "daily") === "daily" && (
          <div className="col-span-2">
            <label className="text-xs font-medium text-muted-foreground">On which days</label>
            <div className="mt-1 flex gap-1">
              {WEEKDAY_LABELS.map((d, i) => {
                const days = Array.isArray(form.active_days) ? form.active_days.map(Number) : [];
                const on = days.length === 0 || days.includes(i);
                return (
                  <button key={i} type="button" aria-pressed={on} title={d}
                    onClick={() => {
                      // Empty means "every day"; the first un-tick expands to
                      // the explicit full set minus that day.
                      const base = days.length === 0 ? [0, 1, 2, 3, 4, 5, 6] : days;
                      const next = base.includes(i) ? base.filter((x) => x !== i) : [...base, i].sort();
                      set("active_days", next.length === 7 ? [] : next);
                    }}
                    className={`flex-1 text-xs py-1.5 rounded-md border ${on ? "border-primary/60 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground"}`}>
                    {d.slice(0, 2)}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {/* When it comes round again. Calendar = the period resets on a
            fixed day (weekly: a weekday you pick); rolling = a full period
            after the last time you completed it. */}
        {(form.frequency || "daily") !== "yearly" && (
          <div className="col-span-2">
            <label className="text-xs font-medium text-muted-foreground">Resets</label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <select className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={form.reset_mode || "calendar"} onChange={(e) => set("reset_mode", e.target.value)}>
                <option value="calendar">
                  {(form.frequency || "daily") === "weekly" ? "Every week on a set day"
                    : (form.frequency || "daily") === "monthly" ? "On the 1st of each month" : "Each calendar day"}
                </option>
                <option value="rolling">
                  {(form.frequency || "daily") === "weekly" ? "7 days after I complete it"
                    : (form.frequency || "daily") === "monthly" ? "30 days after I complete it" : "24 hours after I complete it"}
                </option>
              </select>
              {(form.frequency || "daily") === "weekly" && (form.reset_mode || "calendar") === "calendar" && (
                <select className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  value={form.week_start_day ?? 1} onChange={(e) => set("week_start_day", Number(e.target.value))}>
                  {WEEKDAY_LABELS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
              )}
            </div>
          </div>
        )}
        <div>
          <label className="text-xs font-medium text-muted-foreground">Mode</label>
          <select className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={form.mode} onChange={(e) => set("mode", e.target.value)}>
            <option value="MANUAL">MANUAL</option>
            <option value="AUTO">AUTO</option>
          </select>
        </div>
        {form.mode === "AUTO" && (() => {
          const triggers = readTriggers(form);
          const triggerLabel = (id) => {
            const opt = AUTO_TRIGGER_OPTIONS.find((o) => o.value === id);
            return opt ? applyTerms(opt.label, terms) : id;
          };
          const updateTriggers = (next) => {
            // Keep the legacy `auto_trigger` field aligned with the
            // first entry so older readers still see something sensible.
            setForm((p) => ({
              ...p,
              auto_triggers: next,
              auto_trigger: next[0] || "",
            }));
          };
          const addTrigger = (id) => {
            if (!id || triggers.includes(id)) return;
            updateTriggers([...triggers, id]);
          };
          const removeTrigger = (id) => {
            updateTriggers(triggers.filter((t) => t !== id));
          };
          const mode = form.auto_trigger_mode === "all" ? "all" : "any";
          return (
            <div className="col-span-2 space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Auto triggers</label>

              {triggers.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {triggers.map((id, i) => (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-primary/10 text-primary border border-primary/30"
                    >
                      {triggerLabel(id)}
                      <button
                        type="button"
                        onClick={() => removeTrigger(id)}
                        aria-label={`Remove ${triggerLabel(id)}`}
                        className="hover:bg-primary/20 rounded-full p-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <select
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value=""
                onChange={(e) => { addTrigger(e.target.value); e.target.value = ""; }}
              >
                <option value="">{triggers.length === 0 ? "— Select trigger —" : "+ Add another trigger"}</option>
                {AUTO_TRIGGER_OPTIONS
                  .filter((o) => !triggers.includes(o.value))
                  .map((o) => (
                    <option key={o.value} value={o.value}>{applyTerms(o.label, terms)}</option>
                  ))}
              </select>

              {triggers.length >= 2 && (
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-xs text-muted-foreground">Count complete when:</span>
                  <div className="inline-flex rounded-md border border-border overflow-hidden text-xs">
                    <button
                      type="button"
                      onClick={() => set("auto_trigger_mode", "any")}
                      className={`px-2.5 py-1 transition-colors ${
                        mode === "any" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted/50"
                      }`}
                    >
                      Any (or)
                    </button>
                    <button
                      type="button"
                      onClick={() => set("auto_trigger_mode", "all")}
                      className={`px-2.5 py-1 border-l border-border transition-colors ${
                        mode === "all" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted/50"
                      }`}
                    >
                      All (and)
                    </button>
                  </div>
                  <span className="text-[0.6875rem] text-muted-foreground">
                    {mode === "any"
                      ? "fires as soon as one trigger happens"
                      : "every trigger must happen"}
                  </span>
                </div>
              )}
            </div>
          );
        })()}
        {form.mode === "MANUAL" && (
          <div className="col-span-2">
            <label className="text-xs font-medium text-muted-foreground">Navigation path or web link (optional)</label>
            <input className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={form.nav_path || ""} onChange={(e) => set("nav_path", e.target.value)} placeholder="/page-path or https://…" />
          </div>
        )}
        {form.mode === "MANUAL" && (() => {
          const ids = form.activity_category_ids || [];
          const mode = form.activity_mode || "timed";
          const MODES = [
            ["timed", "Timed", "Starts running for a set time, then asks how it went."],
            ["active", "Start active", "Starts running until you end it."],
            ["log", "Just log it", "Logs it as done now, or for today without a time."],
          ];
          return (
            <div className="col-span-2 space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Activities for this task (optional)</label>
              <SearchableMultiSelect
                value={ids}
                onChange={(next) => set("activity_category_ids", next || [])}
                options={categoryOptions}
                placeholder="No activities"
                searchPlaceholder="Search activities…"
                renderOption={(o) => (
                  <span className="flex items-center gap-2 min-w-0">
                    {o._depth > 0 && <span style={{ width: o._depth * 12 }} className="flex-shrink-0 text-muted-foreground text-xs text-right">↳</span>}
                    {o.color && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: o.color }} />}
                    <span className="truncate text-sm">{o.label}</span>
                  </span>
                )}
              />
              {ids.length > 0 && (
                <>
                  <div role="radiogroup" aria-label="When the task is tapped" className="flex flex-wrap gap-1.5">
                    {MODES.map(([id, label]) => (
                      <button key={id} type="button" role="radio" aria-checked={mode === id}
                        onClick={() => set("activity_mode", id)}
                        className={`text-xs px-2.5 py-1 rounded-full border ${
                          mode === id ? "border-primary text-primary bg-primary/10" : "border-border/60 text-muted-foreground hover:text-foreground"
                        }`}>
                        {label}
                      </button>
                    ))}
                  </div>
                  {mode === "timed" && (
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <input type="number" min={1} max={720} inputMode="numeric"
                        aria-label="Activity length in minutes"
                        className="w-20 rounded-md border border-border bg-background px-2 py-2 text-sm"
                        value={form.activity_minutes ?? ""} onChange={(e) => set("activity_minutes", e.target.value)}
                        placeholder="min" />
                      minutes
                    </label>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {MODES.find(([id]) => id === mode)?.[2]}
                    {form.nav_path && mode !== "log" ? " The link opens at the same time." : ""}
                  </p>
                </>
              )}
            </div>
          );
        })()}
        {form.mode === "MANUAL" && (() => {
          const cm = form.count_mode || "once";
          const period = PERIOD_WORD[form.frequency || "daily"] || "day";
          const steps = form.steps || [];
          const COUNT_MODES = [
            ["once", "Once", "One tick and it's done."],
            ["target", "Several times", `Needs doing a set number of times each ${period}. It's done when the count is reached.`],
            ["tally", "Tally", `Counts how many times it happened this ${period}. It's done after the first one.`],
            ["steps", "Steps", `A short checklist. It's done when every step is ticked, and the steps reset each ${period}.`],
          ];
          const setStep = (i, text) => set("steps", steps.map((st, j) => (j === i ? { ...st, text } : st)));
          return (
            <div className="col-span-2 space-y-2">
              <label className="text-xs font-medium text-muted-foreground">How it's completed</label>
              <div role="radiogroup" aria-label="How it's completed" className="flex flex-wrap gap-1.5">
                {COUNT_MODES.map(([id, label]) => (
                  <button key={id} type="button" role="radio" aria-checked={cm === id}
                    onClick={() => setForm((p) => ({
                      ...p, count_mode: id,
                      ...(id === "steps" && !(p.steps || []).length ? { steps: [{ id: newStepId(), text: "" }] } : {}),
                    }))}
                    className={`text-xs px-2.5 py-1 rounded-full border ${
                      cm === id ? "border-primary text-primary bg-primary/10" : "border-border/60 text-muted-foreground hover:text-foreground"
                    }`}>
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{COUNT_MODES.find(([id]) => id === cm)?.[2]}</p>
              {cm === "target" && (
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <input type="number" min={2} max={999} inputMode="numeric"
                    aria-label={`Times per ${period}`}
                    className="w-20 rounded-md border border-border bg-background px-2 py-2 text-sm"
                    value={form.target_count ?? ""} onChange={(e) => set("target_count", e.target.value)}
                    placeholder="3" />
                  times a {period}
                </label>
              )}
              {cm === "steps" && (
                <div className="space-y-1.5">
                  {steps.map((st, i) => (
                    <div key={st.id} className="flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground w-4 text-right">{i + 1}.</span>
                      <input className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                        aria-label={`Step ${i + 1}`} value={st.text} onChange={(e) => setStep(i, e.target.value)}
                        placeholder="What's this step?" />
                      <button type="button" onClick={() => set("steps", steps.filter((_, j) => j !== i))}
                        aria-label={`Remove step ${i + 1}`} className="p-1.5 rounded-md text-muted-foreground hover:text-destructive">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  <button type="button" onClick={() => set("steps", [...steps, { id: newStepId(), text: "" }])}
                    className="text-xs text-primary flex items-center gap-1 px-1 py-1">
                    <Plus className="w-3.5 h-3.5" /> Add a step
                  </button>
                </div>
              )}
            </div>
          );
        })()}
        <div className="col-span-2 flex items-center gap-2">
          <input type="checkbox" id="is_active" checked={form.is_active}
            onChange={(e) => set("is_active", e.target.checked)} className="rounded" />
          <label htmlFor="is_active" className="text-sm text-foreground">Active (show in checklist)</label>
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="sm" onClick={onCancel}><X className="w-3.5 h-3.5 mr-1" /> Cancel</Button>
        <Button size="sm" onClick={() => onSave(form)} disabled={!form.title.trim()}>
          <Check className="w-3.5 h-3.5 mr-1" /> {isNew ? "Add Task" : "Save"}
        </Button>
      </div>
    </div>
  );
}

function TaskRow({ template: t, dragHandleProps, onEdit, onToggle, onDelete }) {
  return (
    <div className={`flex items-center gap-2 rounded-xl border p-3 bg-card transition-all ${
      t.is_active ? "border-border/50" : "border-border/30 opacity-60"
    }`}>
      <button
        {...dragHandleProps}
        className="touch-none cursor-grab active:cursor-grabbing p-0.5 -ml-0.5 text-muted-foreground hover:text-foreground flex-shrink-0"
        aria-label="Drag to reorder"
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-medium">{t.title}</span>
          <span className={`text-xs px-1.5 py-0.5 rounded-full border font-medium ${
            t.mode === "AUTO" ? "border-blue-400/50 text-blue-500" : "border-border text-muted-foreground"
          }`}>{t.mode}</span>
          <span className="text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{t.points} pts</span>
          {!t.is_active && <span className="text-xs text-muted-foreground italic">hidden</span>}
        </div>
        {t.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{t.description}</p>}
      </div>
      <div className="flex gap-1 flex-shrink-0">
        <button onClick={() => onToggle(t)}
          className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors text-xs">
          {t.is_active ? "Hide" : "Show"}
        </button>
        <button onClick={() => onEdit(t.id)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => onDelete(t.id)} className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

function SortableTaskRow(props) {
  const { template } = props;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: template.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? "opacity-40 z-50" : ""}
    >
      <TaskRow {...props} dragHandleProps={{ ...attributes, ...listeners }} />
    </div>
  );
}

export default function TaskTemplateManager({ templates: propTemplates, onClose }) {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addFrequency, setAddFrequency] = useState("daily");
  const [restoringDefaults, setRestoringDefaults] = useState(false);
  // Local optimistic state so drags feel instant
  const [localOrder, setLocalOrder] = useState(null);
  const templates = localOrder ?? propTemplates;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );

  const invalidate = () => {
    setLocalOrder(null);
    queryClient.invalidateQueries({ queryKey: ["dailyTaskTemplates"] });
  };

  // Group + sort by frequency section
  const grouped = useMemo(() => {
    const g = {};
    for (const freq of FREQUENCY_ORDER) g[freq] = [];
    for (const t of templates) {
      const f = t.frequency || "daily";
      if (g[f]) g[f].push(t);
    }
    for (const freq of FREQUENCY_ORDER) {
      g[freq].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    }
    return g;
  }, [templates]);

  const handleDragEnd = async (event, frequency) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const section = grouped[frequency];
    const oldIdx = section.findIndex((t) => t.id === active.id);
    const newIdx = section.findIndex((t) => t.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(section, oldIdx, newIdx).map((t, i) => ({ ...t, sort_order: i }));
    // Optimistic update
    setLocalOrder((prev) => {
      const base = prev ?? propTemplates;
      const others = base.filter((t) => (t.frequency || "daily") !== frequency);
      return [...others, ...reordered];
    });
    // Persist
    await Promise.all(reordered.map((t, i) =>
      base44.entities.DailyTaskTemplate.update(t.id, { sort_order: i })
    ));
    invalidate();
  };

  const handleSave = async (id, form) => {
    const triggers = readTriggers(form);
    await base44.entities.DailyTaskTemplate.update(id, {
      title: form.title, description: form.description, points: form.points,
      frequency: form.frequency || "daily", mode: form.mode, is_active: form.is_active,
      auto_trigger: form.mode === "AUTO" ? (triggers[0] || null) : null,
      auto_triggers: form.mode === "AUTO" ? triggers : [],
      auto_trigger_mode: form.mode === "AUTO" && triggers.length >= 2
        ? (form.auto_trigger_mode === "all" ? "all" : "any")
        : "any",
      nav_path: form.mode === "MANUAL" ? (form.nav_path || null) : null,
      ...activityFields(form),
      ...countFields(form),
      reset_mode: form.reset_mode === "rolling" ? "rolling" : "calendar",
      week_start_day: (form.frequency || "daily") === "weekly" ? Number(form.week_start_day ?? 1) : null,
      active_days: (form.frequency || "daily") === "daily" && Array.isArray(form.active_days) && form.active_days.length > 0
        ? form.active_days.map(Number) : [],
    });
    setEditingId(null);
    invalidate();
    toast.success("Task updated");
  };

  const handleAdd = async (form) => {
    const sectionLen = grouped[form.frequency || "daily"]?.length ?? 0;
    const triggers = readTriggers(form);
    await base44.entities.DailyTaskTemplate.create({
      ...form, frequency: form.frequency || "daily", sort_order: sectionLen,
      auto_trigger: form.mode === "AUTO" ? (triggers[0] || null) : null,
      auto_triggers: form.mode === "AUTO" ? triggers : [],
      auto_trigger_mode: form.mode === "AUTO" && triggers.length >= 2
        ? (form.auto_trigger_mode === "all" ? "all" : "any")
        : "any",
      nav_path: form.mode === "MANUAL" ? (form.nav_path || null) : null,
      ...activityFields(form),
      ...countFields(form),
      reset_mode: form.reset_mode === "rolling" ? "rolling" : "calendar",
      week_start_day: (form.frequency || "daily") === "weekly" ? Number(form.week_start_day ?? 1) : null,
      active_days: (form.frequency || "daily") === "daily" && Array.isArray(form.active_days) && form.active_days.length > 0
        ? form.active_days.map(Number) : [],
    });
    setShowAddForm(false);
    invalidate();
    toast.success("Task added");
  };

  const handleDelete = async (id) => {
    await base44.entities.DailyTaskTemplate.delete(id);
    invalidate();
    toast.success("Task deleted");
  };

  const handleToggleActive = async (template) => {
    await base44.entities.DailyTaskTemplate.update(template.id, { is_active: !template.is_active });
    invalidate();
  };

  const handleRestoreDefaults = async () => {
    setRestoringDefaults(true);
    for (const def of DEFAULT_TASK_TEMPLATES) {
      await base44.entities.DailyTaskTemplate.create({ ...def });
    }
    setRestoringDefaults(false);
    invalidate();
    toast.success("Default tasks added");
  };

  const hasAnyTasks = templates.length > 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-lg">Manage Tasks</h2>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="w-5 h-5" />
        </button>
      </div>

      {FREQUENCY_ORDER.map((freq) => {
        const section = grouped[freq];
        const style = SECTION_STYLE[freq];
        // v0.85.7: always render every frequency section (was: hide when
        // empty). Otherwise users had no + button to add weekly/monthly/
        // yearly tasks — tester report from the Setup checklist's inline
        // "Create / edit custom" modal.
        return (
          <div key={freq}>
            {/* Section header */}
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${style.dot}`} />
              <p className={`text-xs font-bold uppercase tracking-widest ${style.header}`}>{style.label}</p>
              <div className="flex-1 h-px bg-border/50" />
              <button
                onClick={() => { setAddFrequency(freq); setShowAddForm(true); }}
                title={`Add ${style.label} task`}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* New-task form renders inline under the section header that was
                clicked, not at the bottom of the page. Previously the form
                was rendered once outside this map after every section, which
                meant tapping the + on the Daily header opened a form way
                below the Monthly section — testers reported "the button does
                nothing" because the form was off-screen. */}
            {showAddForm && addFrequency === freq && (
              <div className="mb-3">
                <TaskForm
                  initial={{ ...EMPTY_FORM, frequency: freq }}
                  onSave={handleAdd}
                  onCancel={() => setShowAddForm(false)}
                  isNew={true}
                />
              </div>
            )}

            {section.length === 0 ? (
              <p className="text-xs text-muted-foreground/50 italic px-1 pb-1">No {freq} tasks yet</p>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={(e) => handleDragEnd(e, freq)}
              >
                <SortableContext items={section.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2">
                    {section.map((t) =>
                      editingId === t.id ? (
                        <TaskForm key={t.id} initial={t}
                          onSave={(form) => handleSave(t.id, form)}
                          onCancel={() => setEditingId(null)} isNew={false} />
                      ) : (
                        <SortableTaskRow key={t.id} template={t}
                          onEdit={setEditingId}
                          onToggle={handleToggleActive}
                          onDelete={handleDelete} />
                      )
                    )}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>
        );
      })}

      {/* Bottom action row — only show when no per-section form is open.
          When the user pressed a section + the inline form above takes over,
          so this row collapses to avoid two forms on screen. */}
      {/* The bottom Add Task opens its form HERE, at the bottom, where the
          button was — it used to open under the Daily header at the top,
          so the tap looked like it did nothing (the user's report). */}
      {showAddForm && addFrequency === "__bottom__" && (
        <div ref={(el) => el && el.scrollIntoView({ block: "nearest" })}>
          <TaskForm initial={EMPTY_FORM} onSave={handleAdd} onCancel={() => setShowAddForm(false)} isNew={true} />
        </div>
      )}
      {!showAddForm && (
        <div className="flex gap-2 pt-1">
          <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={() => { setAddFrequency("__bottom__"); setShowAddForm(true); }}>
            <Plus className="w-3.5 h-3.5" /> Add Task
          </Button>
          {!hasAnyTasks && (
            <Button variant="outline" size="sm" onClick={handleRestoreDefaults} disabled={restoringDefaults} className="gap-1.5">
              <RotateCcw className="w-3.5 h-3.5" /> {restoringDefaults ? "Restoring..." : "Restore Defaults"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
