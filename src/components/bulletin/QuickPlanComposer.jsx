import React, { useState, useMemo } from "react";
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

// A lightweight "quick plan" composer that lives on the bulletin board.
// Typing a title and tapping Plan schedules a plan for the current day
// automatically — that's the only required field. Every other element of
// a plan (date, time, category, how long, who it's for, notes) is tucked
// behind a collapsed, tap-to-expand pill so the default surface stays a
// single line.
export default function QuickPlanComposer({ onSaved }) {
  const terms = useTerms();
  const queryClient = useQueryClient();

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

  const togglePill = (id) => setActivePill((prev) => (prev === id ? null : id));

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
  };

  const handleSave = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      // Build the timestamp from the (optional) date + time. Date defaults
      // to today; no time means noon so the plan sorts mid-day rather than
      // at midnight.
      const [y, m, d] = (date || todayLocalISODate()).split("-").map(Number);
      const ts = new Date(y, m - 1, d);
      if (time) {
        const [hh, mm] = time.split(":").map(Number);
        ts.setHours(hh, mm, 0, 0);
      } else {
        ts.setHours(12, 0, 0, 0);
      }
      // Match the schema ActivityPlanModal writes so this plan shows up
      // identically everywhere plans are read (UpcomingPlans, the day
      // view, plan analytics): categories + alters are ARRAYS, and the
      // status drives the lifecycle. We don't set is_quick_plan because
      // that flag suppresses duration in the planner views — here a
      // duration is optional but honoured when set.
      await base44.entities.Activity.create({
        activity_name: title.trim(),
        activity_category_ids: categoryId ? [categoryId] : [],
        timestamp: ts.toISOString(),
        duration_minutes: durationMinutes ? Number(durationMinutes) : null,
        status: ACTIVITY_STATUSES.SCHEDULED,
        is_planned: true,
        notes: notes.trim() || null,
        assigned_alter_ids: alterId ? [alterId] : [],
        fronting_alter_ids: alterId ? [alterId] : [],
        actual_duration_minutes: null,
        reschedule_history: [],
      });
      queryClient.invalidateQueries({ queryKey: ["activities"] });
      queryClient.invalidateQueries({ queryKey: ["plannedActivities"] });
      queryClient.invalidateQueries({ queryKey: ["upcomingPlans"] });
      resetForm();
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2200);
      toast.success("Plan added! 🗓️");
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
    { id: "time", icon: Clock, label: formatTime(time) || "Time", active: !!time },
    {
      id: "category",
      icon: Tag,
      label: selectedCategory ? selectedCategory.name : "Category",
      active: !!selectedCategory,
    },
    {
      id: "duration",
      icon: Timer,
      label: formatDuration(durationMinutes) || "Duration",
      active: !!durationMinutes,
    },
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
    <div data-tour="quick-plan" className="bg-card border border-border/60 rounded-2xl p-3 shadow-sm mb-3">
      <div className="flex items-center gap-2">
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary flex-shrink-0">
          <CalendarDays className="w-4 h-4" />
        </div>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleSave();
            }
          }}
          placeholder="Plan something… type a title to schedule it for today"
          className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground min-w-0"
        />
        <Button
          onClick={handleSave}
          disabled={!title.trim() || saving}
          size="sm"
          className="rounded-full px-3 flex-shrink-0 bg-primary"
        >
          {justSaved ? (
            <>
              <Check className="w-4 h-4 mr-1" /> Planned
            </>
          ) : (
            <>
              <Plus className="w-4 h-4 mr-1" /> Plan
            </>
          )}
        </Button>
      </div>

      {/* Collapsed, expandable pill tags for the optional plan elements */}
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
    </div>
  );
}
