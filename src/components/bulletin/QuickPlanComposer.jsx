import React, { useState, useMemo, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  CalendarDays,
  Clock,
  Tag,
  Timer,
  User,
  FileText,
  Plus,
  Check,
  Search,
  Zap,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useTerms } from "@/lib/useTerms";
import { motion, AnimatePresence } from "framer-motion";
import { ACTIVITY_STATUSES } from "@/lib/activityStatus";
import AlterSearchSelect from "@/components/shared/AlterSearchSelect";

const DURATION_CHIPS = [15, 30, 45, 60, 90, 120];

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

// A lightweight "quick plan" composer that lives on the bulletin board —
// a quick-access point for scheduling a plan that truly creates the
// matching Activity in the Activity Tracker (identical schema to
// ActivityPlanModal, so it shows up everywhere plans are read).
//
// Minimal by default: it's a single "Plan something…" line, just like the
// bulletin post box. Tapping into it expands to reveal the optional
// detail pills (date / time / category / how long / who / notes) and the
// "Quick plan" toggle. Quick plan (the default) = a date-only plan with no
// set time that renders as a pill at the top of the day; turn it off to
// pin the plan to a specific time + length.
export default function QuickPlanComposer({ onSaved }) {
  const terms = useTerms();
  const queryClient = useQueryClient();

  const [expanded, setExpanded] = useState(false);
  const [isQuickPlan, setIsQuickPlan] = useState(true);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(() => todayLocalISODate());
  const [time, setTime] = useState("");
  const [categoryId, setCategoryId] = useState(null);
  const [durationMinutes, setDurationMinutes] = useState(null);
  const [alterId, setAlterId] = useState(null);
  const [notes, setNotes] = useState("");
  const [activePill, setActivePill] = useState(null);
  const [categorySearch, setCategorySearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const rootRef = useRef(null);
  const inputRef = useRef(null);

  const { data: categories = [] } = useQuery({
    queryKey: ["activityCategories"],
    queryFn: () => base44.entities.ActivityCategory.list(),
  });

  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });

  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === categoryId) || null,
    [categories, categoryId]
  );

  const filteredCategories = useMemo(() => {
    const q = categorySearch.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) => (c.name || "").toLowerCase().includes(q));
  }, [categories, categorySearch]);

  const alterName = useMemo(() => {
    const a = alters.find((x) => x.id === alterId);
    return a ? a.name : null;
  }, [alters, alterId]);

  // "Pristine" = nothing meaningful entered, so collapsing loses no work.
  const isPristine =
    !title.trim() && !time && !categoryId && !durationMinutes && !alterId &&
    !notes.trim() && date === todayLocalISODate();

  // Collapse back to the single-line state when the user taps away without
  // having entered anything (mirrors the bulletin post box). Never collapse
  // mid-edit (a pill panel open) or when there's unsaved input.
  useEffect(() => {
    if (!expanded) return;
    const handler = (e) => {
      if (rootRef.current?.contains(e.target)) return;
      if (activePill) return;
      if (isPristine) {
        setExpanded(false);
        setActivePill(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [expanded, activePill, isPristine]);

  const togglePill = (id) => setActivePill((prev) => (prev === id ? null : id));

  const toggleQuickPlan = () => {
    setIsQuickPlan((prev) => {
      const next = !prev;
      // Quick plans have no set time / length — clear & close those pills.
      if (next) {
        setTime("");
        setDurationMinutes(null);
        setActivePill((p) => (p === "time" || p === "duration" ? null : p));
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
    setAlterId(null);
    setNotes("");
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
      // Build the timestamp. A quick plan is date-only — it gets a
      // 23:59 local timestamp (exactly like ActivityPlanModal) so it sorts
      // to the end of the day and the grid renders it as a top-of-column
      // pill rather than a timed cell. A non-quick plan uses the picked
      // time (noon fallback when none is set).
      let ts;
      if (isQuickPlan) {
        ts = new Date(`${date || todayLocalISODate()}T23:59:00`);
      } else {
        const [y, m, d] = (date || todayLocalISODate()).split("-").map(Number);
        ts = new Date(y, m - 1, d);
        if (time) {
          const [hh, mm] = time.split(":").map(Number);
          ts.setHours(hh, mm, 0, 0);
        } else {
          ts.setHours(12, 0, 0, 0);
        }
      }
      // A quick plan is date-only, so it counts as a scheduled (upcoming)
      // plan whenever its DATE is today or later — not just until 23:59,
      // which would wrongly flip a same-day quick plan to "logged" if it
      // were created late at night. Timed plans use the clock comparison.
      const isPlanned = isQuickPlan
        ? (date || todayLocalISODate()) >= todayLocalISODate()
        : ts.getTime() > Date.now();

      // Identical schema to ActivityPlanModal's create path so the plan is
      // read identically by the day/week/month grids, UpcomingPlans and
      // plan analytics: categories + alters are ARRAYS, the lifecycle is
      // driven by `status`, and is_planned/is_quick_plan match the modal.
      await base44.entities.Activity.create({
        timestamp: ts.toISOString(),
        activity_name: title.trim(),
        activity_category_ids: categoryId ? [categoryId] : [],
        duration_minutes: isQuickPlan ? null : (durationMinutes ? Number(durationMinutes) : null),
        fronting_alter_ids: alterId ? [alterId] : [],
        notes: notes.trim() || null,
        is_planned: isPlanned,
        is_quick_plan: isQuickPlan,
        assigned_alter_ids: isPlanned && alterId ? [alterId] : [],
        status: isPlanned ? ACTIVITY_STATUSES.SCHEDULED : ACTIVITY_STATUSES.LOGGED,
        actual_duration_minutes: null,
        reschedule_history: [],
      });
      queryClient.invalidateQueries({ queryKey: ["activities"] });
      queryClient.invalidateQueries({ queryKey: ["plannedActivities"] });
      queryClient.invalidateQueries({ queryKey: ["upcomingPlans"] });
      resetForm();
      setExpanded(false);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2200);
      toast.success("Plan added to your Activity Tracker! 🗓️");
      onSaved?.();
    } catch (err) {
      console.error("Failed to save quick plan:", err);
      toast.error("Couldn't save that plan.");
    } finally {
      setSaving(false);
    }
  };

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
      icon: User,
      label: alterName || terms.Alter || "Alter",
      active: !!alterId,
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

            {/* Optional detail pills */}
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

                    {activePill === "alter" && (
                      <AlterSearchSelect
                        alters={alters}
                        value={alterId}
                        onChange={(id) => setAlterId(id)}
                        terms={terms}
                        placeholder={`Pick ${(terms.alter || "alter").toLowerCase()}…`}
                        noneLabel={`No ${(terms.alter || "alter").toLowerCase()}`}
                      />
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
    </div>
  );
}
