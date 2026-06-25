import React, { useState, useEffect, useRef, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { CheckSquare, CalendarDays, Flag, Tag, Target, FileText, Pin, Zap, Plus, Check, X } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { useTerms } from "@/lib/useTerms";
import ActivityPillSelector from "@/components/activities/ActivityPillSelector";

const PRIORITIES = [
  { id: "low", label: "Low", cls: "bg-blue-500 text-white" },
  { id: "medium", label: "Medium", cls: "bg-yellow-500 text-black" },
  { id: "high", label: "High", cls: "bg-red-500 text-white" },
];

function todayLocalISODate() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

function formatDateLabel(iso) {
  if (!iso) return null;
  const today = todayLocalISODate();
  if (iso === today) return "Today";
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (dt.getFullYear() === tomorrow.getFullYear() && dt.getMonth() === tomorrow.getMonth() && dt.getDate() === tomorrow.getDate()) {
    return "Tomorrow";
  }
  return dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// A "quick task" composer for the bulletin board — mirrors QuickPlanComposer
// and now exposes the SAME fields as the full "create a new task" modal:
// due date, scheduled (plan-to-do) date, priority, activity category, a goal
// (target + unit), a note/description, plus Pin-to-dashboard and Mark-urgent
// toggles. Minimal by default; tapping in expands to the optional pills so it
// isn't overwhelming. Creating it posts the matching task-bulletin.
export default function QuickTaskComposer({ frontingAlterIds = [], onSaved }) {
  const queryClient = useQueryClient();
  const terms = useTerms();

  const [expanded, setExpanded] = useState(false);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("medium");
  const [dueDate, setDueDate] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [categoryId, setCategoryId] = useState(null);
  const [goalTarget, setGoalTarget] = useState("");
  const [goalUnit, setGoalUnit] = useState("");
  const [note, setNote] = useState("");
  const [pinned, setPinned] = useState(false);
  const [urgent, setUrgent] = useState(false);
  const [activePill, setActivePill] = useState(null);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const rootRef = useRef(null);

  const { data: categories = [] } = useQuery({
    queryKey: ["activityCategories"],
    queryFn: () => base44.entities.ActivityCategory.list(),
  });
  const selectedCategory = useMemo(() => categories.find((c) => c.id === categoryId) || null, [categories, categoryId]);

  const isPristine = !title.trim() && priority === "medium" && !dueDate && !scheduledDate
    && !categoryId && !goalTarget && !goalUnit.trim() && !note.trim() && !pinned && !urgent;

  useEffect(() => {
    if (!expanded) return;
    const handler = (e) => {
      if (rootRef.current?.contains(e.target)) return;
      if (activePill) return;
      if (isPristine) { setExpanded(false); setActivePill(null); }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [expanded, activePill, isPristine]);

  const togglePill = (id) => setActivePill((prev) => (prev === id ? null : id));

  const resetForm = () => {
    setTitle(""); setPriority("medium"); setDueDate(""); setScheduledDate("");
    setCategoryId(null); setGoalTarget(""); setGoalUnit("");
    setNote(""); setPinned(false); setUrgent(false); setActivePill(null);
  };

  const collapse = () => { resetForm(); setExpanded(false); };

  const handleSave = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      // Defensive live-fetch — a task added right after page load shouldn't be
      // attributed to "System" while the fronting query is still hydrating.
      let authorIds = frontingAlterIds;
      if (authorIds.length === 0) {
        try {
          const active = await base44.entities.FrontingSession.filter({ is_active: true });
          const liveIds = active.map((s) => s.alter_id || s.primary_alter_id).filter(Boolean);
          if (liveIds.length > 0) authorIds = liveIds;
        } catch { /* fall through */ }
      }
      const task = await base44.entities.Task.create({
        title: title.trim(),
        completed: false,
        priority,
        due_date: dueDate || null,
        scheduled_at: scheduledDate || null,
        activity_category_ids: categoryId ? [categoryId] : [],
        description: note.trim() || "",
        pinned_to_dashboard: pinned,
        is_urgent: urgent,
        goal_target: goalTarget ? parseInt(goalTarget, 10) : null,
        goal_unit: goalUnit.trim() || "",
      });
      await base44.entities.Bulletin.create({
        content: `[task:${task.id}] ${title.trim()}`,
        author_alter_ids: authorIds,
        author_alter_id: authorIds[0] || null,
        reactions: {},
        read_by_alter_ids: authorIds,
      });
      queryClient.invalidateQueries({ queryKey: ["bulletins"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      resetForm();
      setExpanded(false);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2200);
      toast.success("✅ Task added!");
      onSaved?.();
    } catch (err) {
      console.error("Failed to save quick task:", err);
      toast.error("Couldn't save that task.");
    } finally {
      setSaving(false);
    }
  };

  const priorityMeta = PRIORITIES.find((p) => p.id === priority);
  const whenLabel = dueDate
    ? `Due ${formatDateLabel(dueDate)}`
    : (scheduledDate ? `Do ${formatDateLabel(scheduledDate)}` : "Dates");
  const pills = [
    { id: "when", icon: CalendarDays, label: whenLabel, active: !!dueDate || !!scheduledDate },
    // Priority pill now also hosts the Pin-to-dashboard + Mark-urgent toggles.
    { id: "priority", icon: Flag, label: priority === "medium" ? "Priority" : priorityMeta.label, active: priority !== "medium" || pinned || urgent },
    { id: "category", icon: Tag, label: selectedCategory ? selectedCategory.name : "Activity", active: !!selectedCategory },
    { id: "goal", icon: Target, label: goalTarget ? `${goalTarget}${goalUnit ? ` ${goalUnit}` : ""}` : "Goal", active: !!goalTarget },
    { id: "note", icon: FileText, label: note.trim() ? "Note added" : "Note", active: !!note.trim() },
  ];

  return (
    <div ref={rootRef} className="bg-card border border-border/60 rounded-2xl px-3 py-2 shadow-sm mb-3">
      <div className="flex items-center gap-2">
        <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary flex-shrink-0">
          <CheckSquare className="w-4 h-4" />
        </div>
        <input
          value={title}
          onFocus={() => setExpanded(true)}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSave(); } }}
          placeholder="Quick task… press Enter to add"
          className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground min-w-0"
        />
        {expanded ? (
          <>
            <Button onClick={handleSave} disabled={!title.trim() || saving} size="sm" className="rounded-full px-3 flex-shrink-0 bg-primary">
              {justSaved ? <><Check className="w-4 h-4 mr-1" /> Added</> : <><Plus className="w-4 h-4 mr-1" /> Add</>}
            </Button>
            <button type="button" onClick={collapse} aria-label="Cancel" className="flex-shrink-0 text-muted-foreground hover:text-foreground p-1 -mr-1">
              <X className="w-4 h-4" />
            </button>
          </>
        ) : (
          justSaved && (
            <span className="flex-shrink-0 text-xs text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1 pr-1">
              <Check className="w-3.5 h-3.5" /> Added
            </span>
          )
        )}
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <p className="text-[0.6875rem] text-muted-foreground mt-2">A to-do for your To-Do List — something to tick off when it's done.</p>
            {/* Optional detail pills (Pin + Urgent now live inside Priority) */}
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
                      p.active || isOpen ? "bg-primary/10 border-primary/40 text-primary" : "bg-muted/50 border-transparent text-muted-foreground hover:text-foreground"
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
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  <div className="mt-2 p-2 rounded-xl bg-muted/30 border border-border/50">
                    {activePill === "when" && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[0.6875rem] text-muted-foreground w-[4.5rem]">Deadline:</span>
                          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
                            className="bg-background border border-input rounded-lg px-2 py-1 text-sm text-foreground" />
                          {dueDate && <button type="button" onClick={() => setDueDate("")} className="text-xs text-muted-foreground hover:text-foreground">Clear</button>}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[0.6875rem] text-muted-foreground w-[4.5rem]">Plan to do:</span>
                          <input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)}
                            className="bg-background border border-input rounded-lg px-2 py-1 text-sm text-foreground" />
                          {scheduledDate && <button type="button" onClick={() => setScheduledDate("")} className="text-xs text-muted-foreground hover:text-foreground">Clear</button>}
                        </div>
                      </div>
                    )}

                    {activePill === "priority" && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {PRIORITIES.map((p) => (
                            <button key={p.id} type="button" onClick={() => setPriority(p.id)}
                              className={`px-2.5 py-1 rounded-full text-xs transition-colors ${priority === p.id ? p.cls : "bg-muted/60 text-muted-foreground hover:text-foreground"}`}>
                              {p.label}
                            </button>
                          ))}
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-border/40">
                          <button type="button" onClick={() => setPinned((v) => !v)} aria-pressed={pinned} title="Pin to dashboard"
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border transition-colors ${pinned ? "bg-primary/10 border-primary/40 text-primary" : "bg-muted/50 border-transparent text-muted-foreground hover:text-foreground"}`}>
                            <Pin className="w-3 h-3" /> Pin
                          </button>
                          <button type="button" onClick={() => setUrgent((v) => !v)} aria-pressed={urgent} title="Mark urgent"
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border transition-colors ${urgent ? "bg-amber-500/15 border-amber-500/50 text-amber-600 dark:text-amber-400" : "bg-muted/50 border-transparent text-muted-foreground hover:text-foreground"}`}>
                            <Zap className="w-3 h-3" /> Urgent
                          </button>
                        </div>
                      </div>
                    )}

                    {activePill === "category" && (
                      <ActivityPillSelector
                        selectedActivities={categoryId ? [categoryId] : []}
                        onActivityChange={(arr) => setCategoryId(arr.length ? arr[arr.length - 1] : null)}
                      />
                    )}

                    {activePill === "goal" && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <input type="number" min={1} value={goalTarget} onChange={(e) => setGoalTarget(e.target.value)} placeholder="Target"
                          className="w-24 bg-background border border-input rounded-lg px-2 py-1 text-sm text-foreground" />
                        <input type="text" value={goalUnit} onChange={(e) => setGoalUnit(e.target.value)} placeholder="times, hours, km…"
                          className="flex-1 min-w-[8rem] bg-background border border-input rounded-lg px-2 py-1 text-sm text-foreground" />
                        {(goalTarget || goalUnit) && <button type="button" onClick={() => { setGoalTarget(""); setGoalUnit(""); }} className="text-xs text-muted-foreground hover:text-foreground">Clear</button>}
                      </div>
                    )}

                    {activePill === "note" && (
                      <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a description (optional)…" rows={2}
                        className="w-full bg-background border border-input rounded-lg px-2 py-1.5 text-sm text-foreground resize-none outline-none" />
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
