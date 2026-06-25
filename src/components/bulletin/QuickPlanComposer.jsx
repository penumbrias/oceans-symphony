import React, { useState, useMemo, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  CalendarDays,
  Clock,
  Tag,
  Timer,
  Users,
  FileText,
  Plus,
  Check,
  Search,
  Zap,
  X,
  MapPin,
  Repeat,
  Bell,
  ListChecks,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { format, addDays, addWeeks, addMonths } from "date-fns";
import { useTerms } from "@/lib/useTerms";
import { motion, AnimatePresence } from "framer-motion";
import { ACTIVITY_STATUSES } from "@/lib/activityStatus";
import SetFrontModal from "@/components/fronting/SetFrontModal";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { LEAD_STEPS, DEFAULT_LEAD_STEPS } from "@/lib/criticalPins";
import {
  PLAN_REMINDER_OFFSETS,
  readPlanRemindersEnabled,
  readPlanRemindersDefaultOffset,
} from "@/lib/planReminderScheduler";

const DURATION_CHIPS = [15, 30, 45, 60, 90, 120];

const RECURRENCE_OPTIONS = [
  { value: "none", label: "None" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "monthly", label: "Monthly" },
];
const RECURRENCE_SHORT = { daily: "Daily", weekly: "Weekly", biweekly: "Every 2 wks", monthly: "Monthly" };

function todayLocalISODate() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

function formatDuration(mins) {
  if (!mins) return null;
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function formatTime(t) {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function formatDateLabel(iso) {
  if (!iso) return null;
  const today = todayLocalISODate();
  if (iso === today) return "Today";
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (
    dt.getFullYear() === tomorrow.getFullYear() &&
    dt.getMonth() === tomorrow.getMonth() &&
    dt.getDate() === tomorrow.getDate()
  ) {
    return "Tomorrow";
  }
  return dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Compact selected-alter chip (avatar + label + remove) — same shape as the
// Log Activity / Plan modals so the picker looks identical everywhere.
function SelectedFronterChip({ alter, label, onRemove }) {
  const avatar = useResolvedAvatarUrl(alter?.avatar_url);
  return (
    <span className="inline-flex items-center gap-1.5 pl-1 pr-1.5 py-0.5 rounded-full border border-border bg-muted/30 text-xs">
      <span className="w-5 h-5 rounded-full overflow-hidden flex items-center justify-center text-[0.5625rem] text-white flex-shrink-0" style={{ backgroundColor: alter?.color || "#8b5cf6" }}>
        {avatar ? <img src={avatar} alt="" className="w-full h-full object-cover" /> : (alter?.name?.[0]?.toUpperCase() || "?")}
      </span>
      <span className="truncate max-w-[140px]">{label}</span>
      <button type="button" onClick={onRemove} aria-label="Remove" className="text-muted-foreground hover:text-destructive"><X className="w-3 h-3" /></button>
    </span>
  );
}

// A lightweight "quick plan" composer that lives on the bulletin board —
// a quick-access point for scheduling a plan that truly creates the
// matching Activity in the Activity Tracker (identical schema to
// ActivityPlanModal, so it shows up everywhere plans are read).
//
// Minimal by default: it's a single "Plan something…" line, just like the
// bulletin post box. Tapping into it expands to reveal the optional detail
// pills. Every aspect of plan creation is reachable here — the same set
// the full Plan Activity modal exposes (date / time / category / how long /
// who it's for / to-do / location / repeat / reminder / critical / notes)
// — kept as compact pills so the quick path stays quick but never less
// capable than the modal.
export default function QuickPlanComposer({ onSaved }) {
  const terms = useTerms();
  const queryClient = useQueryClient();
  const formatAlter = useAlterLabel();

  const [expanded, setExpanded] = useState(false);
  const [isQuickPlan, setIsQuickPlan] = useState(true);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(() => todayLocalISODate());
  const [time, setTime] = useState("");
  const [categoryId, setCategoryId] = useState(null);
  const [durationMinutes, setDurationMinutes] = useState(null);
  const [alterIds, setAlterIds] = useState([]);
  const [notes, setNotes] = useState("");
  const [location, setLocation] = useState("");
  const [recurrenceInterval, setRecurrenceInterval] = useState("none");
  const [recurrenceCount, setRecurrenceCount] = useState(8);
  const [createTodo, setCreateTodo] = useState(false);
  const [linkedTaskId, setLinkedTaskId] = useState(null);
  const [reminderOffset, setReminderOffset] = useState(null);
  const [isCritical, setIsCritical] = useState(false);
  const [leadSteps, setLeadSteps] = useState(DEFAULT_LEAD_STEPS);
  const [fronterPickerOpen, setFronterPickerOpen] = useState(false);
  const [activePill, setActivePill] = useState(null);
  const [categorySearch, setCategorySearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const rootRef = useRef(null);
  const inputRef = useRef(null);

  const planRemindersEnabledGlobal = readPlanRemindersEnabled();
  const planRemindersDefault = readPlanRemindersDefaultOffset();

  const { data: categories = [] } = useQuery({
    queryKey: ["activityCategories"],
    queryFn: () => base44.entities.ActivityCategory.list(),
  });

  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => base44.entities.Task.list(),
  });

  const altersById = useMemo(
    () => Object.fromEntries((alters || []).map((a) => [a.id, a])),
    [alters]
  );

  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === categoryId) || null,
    [categories, categoryId]
  );

  const filteredCategories = useMemo(() => {
    const q = categorySearch.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) => (c.name || "").toLowerCase().includes(q));
  }, [categories, categorySearch]);

  // "Pristine" = nothing meaningful entered, so collapsing loses no work.
  const isPristine =
    !title.trim() && !time && !categoryId && !durationMinutes && alterIds.length === 0 &&
    !notes.trim() && !location.trim() && recurrenceInterval === "none" &&
    !createTodo && !linkedTaskId && reminderOffset == null && !isCritical &&
    date === todayLocalISODate();

  // Collapse back to the single-line state when the user taps away without
  // having entered anything (mirrors the bulletin post box). Never collapse
  // mid-edit (a pill panel open) or when there's unsaved input.
  useEffect(() => {
    if (!expanded) return;
    const handler = (e) => {
      if (rootRef.current?.contains(e.target)) return;
      if (activePill) return;
      if (fronterPickerOpen) return;
      if (isPristine) {
        setExpanded(false);
        setActivePill(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [expanded, activePill, fronterPickerOpen, isPristine]);

  const togglePill = (id) => setActivePill((prev) => (prev === id ? null : id));

  const toggleQuickPlan = () => {
    setIsQuickPlan((prev) => {
      const next = !prev;
      // Quick plans have no set time / length — clear & close those pills.
      // Reminders need a real start time too, so close that pill when it
      // disappears from the row.
      if (next) {
        setTime("");
        setDurationMinutes(null);
        setReminderOffset(null);
        setActivePill((p) => (p === "time" || p === "duration" || p === "reminder" ? null : p));
      }
      return next;
    });
  };

  const resetForm = () => {
    setTitle("");
    setDate(todayLocalISODate());
    setTime("");
    setCategoryId(null);
    setDurationMinutes(null);
    setAlterIds([]);
    setNotes("");
    setLocation("");
    setRecurrenceInterval("none");
    setRecurrenceCount(8);
    setCreateTodo(false);
    setLinkedTaskId(null);
    setReminderOffset(null);
    setIsCritical(false);
    setLeadSteps(DEFAULT_LEAD_STEPS);
    setActivePill(null);
    setCategorySearch("");
    setIsQuickPlan(true);
  };

  const collapse = () => {
    resetForm();
    setExpanded(false);
  };

  const handleSave = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      // Build the base timestamp. A quick plan is date-only — it gets a
      // 23:59 local timestamp (exactly like ActivityPlanModal) so it sorts
      // to the end of the day and the grid renders it as a top-of-column
      // pill rather than a timed cell. A non-quick plan uses the picked
      // time (noon fallback when none is set).
      let baseTs;
      if (isQuickPlan) {
        baseTs = new Date(`${date || todayLocalISODate()}T23:59:00`);
      } else {
        const [y, m, d] = (date || todayLocalISODate()).split("-").map(Number);
        baseTs = new Date(y, m - 1, d);
        if (time) {
          const [hh, mm] = time.split(":").map(Number);
          baseTs.setHours(hh, mm, 0, 0);
        } else {
          baseTs.setHours(12, 0, 0, 0);
        }
      }

      // "Set this plan as a to-do" — build the Task up-front so its id can
      // flow into task_id on every Activity (including recurring ones), then
      // keep its due date in sync. Mirrors ActivityPlanModal's create path.
      const linkedTask = linkedTaskId ? tasks.find((t) => t.id === linkedTaskId) : null;
      let derivedTask = null;
      if (createTodo && !linkedTask) {
        derivedTask = await base44.entities.Task.create({
          title: title.trim(),
          completed: false,
          priority: "medium",
          due_date: format(baseTs, "yyyy-MM-dd"),
          notes: notes.trim() || null,
        });
        queryClient.invalidateQueries({ queryKey: ["tasks"] });
      }
      const effectiveLinkedTask = linkedTask || derivedTask;

      // Recurrence — expand to N occurrences sharing a group id.
      const recurrenceGroupId =
        recurrenceInterval !== "none"
          ? `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
          : null;
      const advance = (dt, n) => {
        if (recurrenceInterval === "daily") return addDays(dt, n);
        if (recurrenceInterval === "weekly") return addWeeks(dt, n);
        if (recurrenceInterval === "biweekly") return addWeeks(dt, n * 2);
        if (recurrenceInterval === "monthly") return addMonths(dt, n);
        return dt;
      };
      const occurrences = recurrenceGroupId
        ? Array.from({ length: Math.max(1, Math.min(52, recurrenceCount)) }, (_, i) => advance(baseTs, i))
        : [baseTs];

      // Identical schema to ActivityPlanModal's create path so the plan is
      // read identically by the day/week/month grids, UpcomingPlans and
      // plan analytics: categories + alters are ARRAYS, the lifecycle is
      // driven by `status`, and is_planned/is_quick_plan match the modal.
      for (const occ of occurrences) {
        // A recurring occurrence is always a PLAN instance to resolve later;
        // a single plan keeps the past→logged rule.
        const isPlanned = !!recurrenceGroupId || (isQuickPlan
          ? format(occ, "yyyy-MM-dd") >= todayLocalISODate()
          : occ.getTime() > Date.now());
        await base44.entities.Activity.create({
          timestamp: occ.toISOString(),
          activity_name: title.trim(),
          activity_category_ids: categoryId ? [categoryId] : [],
          task_id: effectiveLinkedTask?.id || null,
          duration_minutes: isQuickPlan ? null : (durationMinutes ? Number(durationMinutes) : null),
          fronting_alter_ids: alterIds,
          notes: notes.trim() || null,
          location: location.trim() || null,
          is_planned: isPlanned,
          is_quick_plan: isQuickPlan,
          is_critical: isCritical ? true : false,
          critical_lead_steps: isCritical ? leadSteps : null,
          recurrence_group_id: recurrenceGroupId,
          recurrence_interval: recurrenceGroupId ? recurrenceInterval : null,
          assigned_alter_ids: isPlanned ? alterIds : [],
          status: isPlanned ? ACTIVITY_STATUSES.SCHEDULED : ACTIVITY_STATUSES.LOGGED,
          actual_duration_minutes: null,
          reschedule_history: [],
          reminder_offset_minutes: reminderOffset,
        });
      }

      if (linkedTask) {
        try {
          const dueDateStr = format(baseTs, "yyyy-MM-dd");
          if (linkedTask.due_date !== dueDateStr) {
            await base44.entities.Task.update(linkedTask.id, { due_date: dueDateStr });
            queryClient.invalidateQueries({ queryKey: ["tasks"] });
          }
        } catch { /* non-fatal */ }
      }

      queryClient.invalidateQueries({ queryKey: ["activities"] });
      queryClient.invalidateQueries({ queryKey: ["plannedActivities"] });
      queryClient.invalidateQueries({ queryKey: ["upcomingPlans"] });
      resetForm();
      setExpanded(false);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2200);
      const todoSuffix = derivedTask ? " · to-do created" : "";
      toast.success(
        recurrenceGroupId
          ? `Plan saved — ${occurrences.length} occurrences scheduled${todoSuffix} 🗓️`
          : `Plan added to your Activity Tracker!${todoSuffix} 🗓️`
      );
      onSaved?.();
    } catch (err) {
      console.error("Failed to save quick plan:", err);
      toast.error("Couldn't save that plan.");
    } finally {
      setSaving(false);
    }
  };

  const locationLabel = location.trim()
    ? (location.trim().length > 16 ? location.trim().slice(0, 16) + "…" : location.trim())
    : "Location";

  const pills = [
    {
      id: "date",
      icon: CalendarDays,
      label: formatDateLabel(date) || "Date",
      active: date !== todayLocalISODate(),
    },
    // Time + duration only matter for a timed (non-quick) plan.
    ...(!isQuickPlan
      ? [{ id: "time", icon: Clock, label: formatTime(time) || "Time", active: !!time }]
      : []),
    {
      id: "category",
      icon: Tag,
      label: selectedCategory ? selectedCategory.name : "Category",
      active: !!selectedCategory,
    },
    ...(!isQuickPlan
      ? [{ id: "duration", icon: Timer, label: formatDuration(durationMinutes) || "Duration", active: !!durationMinutes }]
      : []),
    {
      id: "alter",
      icon: Users,
      label: alterIds.length > 0 ? `${alterIds.length} ${terms.alters || "alters"}` : (terms.Alters || "Alters"),
      active: alterIds.length > 0,
    },
    {
      id: "todo",
      icon: ListChecks,
      label: createTodo ? "To-do ✓" : (linkedTaskId ? "Linked to-do" : "To-do"),
      active: createTodo || !!linkedTaskId,
    },
    {
      id: "location",
      icon: MapPin,
      label: locationLabel,
      active: !!location.trim(),
    },
    {
      id: "repeat",
      icon: Repeat,
      label: recurrenceInterval !== "none" ? (RECURRENCE_SHORT[recurrenceInterval] || "Repeat") : "Repeat",
      active: recurrenceInterval !== "none",
    },
    // Reminders fire relative to a start time, so only offer them on timed plans.
    ...(!isQuickPlan
      ? [{ id: "reminder", icon: Bell, label: reminderOffset != null ? "Reminder set" : "Reminder", active: reminderOffset != null }]
      : []),
    {
      id: "critical",
      icon: Zap,
      label: "Critical",
      active: isCritical,
    },
    {
      id: "notes",
      icon: FileText,
      label: notes.trim() ? "Note added" : "Note",
      active: !!notes.trim(),
    },
  ];

  return (
    <div
      ref={rootRef}
      data-tour="quick-plan"
      className="bg-card border border-border/60 rounded-2xl px-3 py-2 shadow-sm mb-3"
    >
      <div className="flex items-center gap-2">
        <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary flex-shrink-0">
          <CalendarDays className="w-4 h-4" />
        </div>
        <input
          ref={inputRef}
          value={title}
          onFocus={() => setExpanded(true)}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleSave();
            }
          }}
          placeholder="Plan something…"
          className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground min-w-0"
        />
        {expanded ? (
          <>
            <Button
              onClick={handleSave}
              disabled={!title.trim() || saving}
              size="sm"
              className="rounded-full px-3 flex-shrink-0 bg-primary"
            >
              {justSaved ? (
                <><Check className="w-4 h-4 mr-1" /> Planned</>
              ) : (
                <><Plus className="w-4 h-4 mr-1" /> Plan</>
              )}
            </Button>
            <button
              type="button"
              onClick={collapse}
              aria-label="Cancel"
              className="flex-shrink-0 text-muted-foreground hover:text-foreground p-1 -mr-1"
            >
              <X className="w-4 h-4" />
            </button>
          </>
        ) : (
          justSaved && (
            <span className="flex-shrink-0 text-xs text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1 pr-1">
              <Check className="w-3.5 h-3.5" /> Planned
            </span>
          )
        )}
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <p className="text-[0.6875rem] text-muted-foreground mt-2">A scheduled activity on your Activity Tracker — something to do at a time (or in a day), that you log as done.</p>
            {/* Quick-plan toggle */}
            <button
              type="button"
              onClick={toggleQuickPlan}
              className={`mt-2 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-colors ${
                isQuickPlan
                  ? "bg-primary/10 border-primary/40 text-primary"
                  : "bg-muted/50 border-transparent text-muted-foreground hover:text-foreground"
              }`}
              title={isQuickPlan
                ? "Quick plan: no set time — shows as a pill at the top of the day"
                : "Timed plan: pick a start time and length"}
            >
              <Zap className="w-3 h-3" />
              {isQuickPlan ? "Quick plan (no set time)" : "Timed plan"}
            </button>

            {/* Optional detail pills — every aspect the full Plan modal has */}
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              {pills.map((p) => {
                const Icon = p.icon;
                const isOpen = activePill === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => togglePill(p.id)}
                    className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs border transition-colors ${
                      p.active || isOpen
                        ? "bg-primary/10 border-primary/40 text-primary"
                        : "bg-muted/50 border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className="w-3 h-3" />
                    {p.label}
                  </button>
                );
              })}
            </div>

            <AnimatePresence initial={false}>
              {activePill && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="mt-2 p-2 rounded-xl bg-muted/30 border border-border/50">
                    {activePill === "date" && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <input
                          type="date"
                          value={date}
                          onChange={(e) => setDate(e.target.value || todayLocalISODate())}
                          className="bg-background border border-input rounded-lg px-2 py-1 text-sm text-foreground"
                        />
                        {date !== todayLocalISODate() && (
                          <button
                            type="button"
                            onClick={() => setDate(todayLocalISODate())}
                            className="text-xs text-muted-foreground hover:text-foreground"
                          >
                            Back to today
                          </button>
                        )}
                      </div>
                    )}

                    {activePill === "time" && (
                      <div className="flex items-center gap-2">
                        <input
                          type="time"
                          value={time}
                          onChange={(e) => setTime(e.target.value)}
                          className="bg-background border border-input rounded-lg px-2 py-1 text-sm text-foreground"
                        />
                        {time && (
                          <button
                            type="button"
                            onClick={() => setTime("")}
                            className="text-xs text-muted-foreground hover:text-foreground"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    )}

                    {activePill === "category" && (
                      <div>
                        <div className="flex items-center gap-1 bg-background border border-input rounded-lg px-2 py-1 mb-2">
                          <Search className="w-3 h-3 text-muted-foreground" />
                          <input
                            value={categorySearch}
                            onChange={(e) => setCategorySearch(e.target.value)}
                            placeholder="Search categories…"
                            className="flex-1 bg-transparent outline-none text-sm text-foreground min-w-0"
                          />
                        </div>
                        <div className="max-h-40 overflow-y-auto overscroll-contain space-y-0.5">
                          <button
                            type="button"
                            onClick={() => {
                              setCategoryId(null);
                              setActivePill(null);
                            }}
                            className={`w-full text-left px-2 py-1.5 rounded-lg text-sm ${
                              !categoryId
                                ? "bg-primary/10 text-primary"
                                : "hover:bg-muted/60 text-muted-foreground"
                            }`}
                          >
                            No category
                          </button>
                          {filteredCategories.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => {
                                setCategoryId(c.id);
                                setActivePill(null);
                              }}
                              className={`w-full text-left px-2 py-1.5 rounded-lg text-sm flex items-center gap-2 ${
                                categoryId === c.id
                                  ? "bg-primary/10 text-primary"
                                  : "hover:bg-muted/60 text-muted-foreground"
                              }`}
                            >
                              {c.color && (
                                <span
                                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: c.color }}
                                />
                              )}
                              <span className="truncate">{c.name}</span>
                            </button>
                          ))}
                          {filteredCategories.length === 0 && (
                            <p className="text-xs text-muted-foreground px-2 py-1">No matches.</p>
                          )}
                        </div>
                      </div>
                    )}

                    {activePill === "duration" && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {DURATION_CHIPS.map((d) => (
                          <button
                            key={d}
                            type="button"
                            onClick={() =>
                              setDurationMinutes((prev) => (prev === d ? null : d))
                            }
                            className={`px-2.5 py-1 rounded-full text-xs transition-colors ${
                              durationMinutes === d
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted/60 text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {formatDuration(d)}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Who's this for — same searchable Set Fronters picker
                        as the Log Activity / Plan modals, with removable chips. */}
                    {activePill === "alter" && (
                      <div className="space-y-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => setFronterPickerOpen(true)} className="gap-2">
                          <UserPlus className="w-4 h-4" />
                          {alterIds.length > 0 ? `Add or remove ${terms.alters}` : `Choose ${terms.alters}…`}
                        </Button>
                        {alterIds.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {alterIds.map((id) => {
                              const a = altersById[id];
                              if (!a) return null;
                              return <SelectedFronterChip key={id} alter={a} label={formatAlter(a)} onRemove={() => setAlterIds((prev) => prev.filter((x) => x !== id))} />;
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Set this plan as a to-do (or link an existing one). */}
                    {activePill === "todo" && (
                      <div className="space-y-2">
                        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={createTodo}
                            onChange={(e) => {
                              const n = e.target.checked;
                              setCreateTodo(n);
                              if (n) setLinkedTaskId(null);
                            }}
                            className="w-4 h-4 accent-primary"
                          />
                          <span>Also add this as a to-do</span>
                        </label>
                        <div>
                          <label className="text-xs text-muted-foreground block mb-1">Or link an existing to-do</label>
                          <select
                            value={linkedTaskId || ""}
                            onChange={(e) => {
                              const v = e.target.value || null;
                              setLinkedTaskId(v);
                              if (v) setCreateTodo(false);
                            }}
                            disabled={createTodo}
                            className="w-full h-9 px-2 rounded-lg border border-input bg-background text-sm disabled:opacity-50"
                          >
                            <option value="">— None —</option>
                            {tasks.filter((t) => !t.completed).map((t) => (
                              <option key={t.id} value={t.id}>{t.title}</option>
                            ))}
                          </select>
                        </div>
                        <p className="text-[0.6875rem] text-muted-foreground">
                          {createTodo
                            ? "A to-do with this title and date will be created and linked."
                            : (linkedTaskId
                              ? "This to-do's due date will move to match the plan."
                              : "Turn this plan into a to-do, or attach one you already have.")}
                        </p>
                      </div>
                    )}

                    {activePill === "location" && (
                      <input
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        placeholder="Where? (optional)"
                        className="w-full bg-background border border-input rounded-lg px-2 py-1.5 text-sm text-foreground outline-none"
                      />
                    )}

                    {activePill === "repeat" && (
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-1.5">
                          {RECURRENCE_OPTIONS.map((opt) => (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => setRecurrenceInterval(opt.value)}
                              className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                                recurrenceInterval === opt.value
                                  ? "border-primary/50 bg-primary/10 text-primary"
                                  : "border-border/50 text-muted-foreground hover:bg-muted/50"
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                        {recurrenceInterval !== "none" && (
                          <div className="flex items-center gap-2">
                            <label className="text-xs text-muted-foreground">Occurrences</label>
                            <input
                              type="number"
                              min={1}
                              max={52}
                              value={recurrenceCount}
                              onChange={(e) => {
                                const n = parseInt(e.target.value, 10);
                                setRecurrenceCount(Number.isFinite(n) ? Math.max(1, Math.min(52, n)) : 1);
                              }}
                              className="w-16 h-8 px-2 rounded-lg border border-input bg-background text-sm"
                            />
                            <span className="text-xs text-muted-foreground">(max 52)</span>
                          </div>
                        )}
                      </div>
                    )}

                    {activePill === "reminder" && (
                      planRemindersEnabledGlobal ? (
                        <div className="space-y-2">
                          <div className="flex flex-wrap gap-1.5">
                            <button
                              type="button"
                              onClick={() => setReminderOffset(null)}
                              className={`text-xs px-2.5 py-1 rounded-full border transition-all ${reminderOffset == null ? "border-primary/50 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground hover:bg-muted/50"}`}
                            >Default</button>
                            {PLAN_REMINDER_OFFSETS.map((opt) => (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() => setReminderOffset(opt.value)}
                                className={`text-xs px-2.5 py-1 rounded-full border transition-all ${reminderOffset === opt.value ? "border-primary/50 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground hover:bg-muted/50"}`}
                              >{opt.label}</button>
                            ))}
                          </div>
                          <p className="text-[0.6875rem] text-muted-foreground">
                            A notification before the plan starts (default {planRemindersDefault < 60 ? `${planRemindersDefault} min` : planRemindersDefault < 1440 ? `${Math.round(planRemindersDefault / 60)} hr` : "1 day"} before).
                          </p>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">Plan reminders are off globally. Turn them on in Settings → Reminders to get a heads-up before a plan starts.</p>
                      )
                    )}

                    {activePill === "critical" && (
                      <div className="space-y-2">
                        <button
                          type="button"
                          onClick={() => setIsCritical((v) => !v)}
                          className={`w-full flex items-center justify-between gap-2 text-sm font-medium transition-colors ${isCritical ? "text-amber-500" : "text-foreground"}`}
                        >
                          <span className="flex items-center gap-1.5">
                            <Zap className={`w-4 h-4 ${isCritical ? "fill-amber-500 text-amber-500" : ""}`} />
                            Mark as critical
                          </span>
                          <span className={`w-9 h-5 rounded-full transition-colors flex items-center px-0.5 ${isCritical ? "bg-amber-500" : "bg-muted-foreground/30"}`}>
                            <span className={`w-4 h-4 rounded-full bg-background transition-transform ${isCritical ? "translate-x-4" : "translate-x-0"}`} />
                          </span>
                        </button>
                        {isCritical && (
                          <div>
                            <p className="text-[0.6875rem] text-muted-foreground mb-1">Pin to the top of the Dashboard:</p>
                            <div className="flex flex-wrap gap-1.5">
                              {LEAD_STEPS.map((step) => {
                                const active = leadSteps.includes(step.key);
                                return (
                                  <button
                                    key={step.key}
                                    type="button"
                                    onClick={() => setLeadSteps((prev) => active ? prev.filter((k) => k !== step.key) : [...prev, step.key])}
                                    className={`text-xs px-2 py-1 rounded-full border transition-all ${active ? "border-amber-500/50 bg-amber-500/10 text-amber-500" : "border-border/50 text-muted-foreground hover:bg-muted/50"}`}
                                  >
                                    {step.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {activePill === "notes" && (
                      <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Add a note (optional)…"
                        rows={2}
                        className="w-full bg-background border border-input rounded-lg px-2 py-1.5 text-sm text-foreground resize-none outline-none"
                      />
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      <SetFrontModal
        open={fronterPickerOpen}
        onClose={() => setFronterPickerOpen(false)}
        alters={alters || []}
        selectionMode
        preselectedIds={alterIds}
        onConfirm={(ids) => setAlterIds(ids)}
        confirmLabel="Add to plan"
      />
    </div>
  );
}
