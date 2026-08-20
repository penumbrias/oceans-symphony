// The planner surface: canvas + every sheet and modal that acts on it.
//
// The /planner page and the home-screen activity widgets both render this,
// so the gestures, the day list, the member assignment and the writes exist
// once. `dayCount` picks a week or a single day; `chrome` turns the toolbar
// and totals off for a widget that has its own header.
//
// Reads and writes the SAME Activity records — no new entity, no migration.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { addWeeks, startOfWeek, format } from "date-fns";
import { ChevronLeft, ChevronRight, Users, Heart, Plus, Minus, FolderTree, Repeat, MapPin, Play } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import WeekCanvas from "@/components/planner/WeekCanvas";
import DayPlanSheet from "@/components/planner/DayPlanSheet";
import { confirm } from "@/components/shared/ConfirmDialog";
import { createPlan } from "@/lib/planCreate";
import { LEAD_STEPS, DEFAULT_LEAD_STEPS } from "@/lib/criticalPins";
import {
  PLAN_REMINDER_OFFSETS,
  readPlanRemindersEnabled,
  writePlanRemindersEnabled,
  cancelPlanReminder,
} from "@/lib/planReminderScheduler";
import { getActiveActivities, addActiveActivity } from "@/lib/activitySession";
import { RECURRENCE_BRANCHES, membersForBranch, deleteSeries } from "@/lib/recurrenceUtils";
import { resolveOutcome } from "@/lib/planner/resolvePlan";
import { previousActivityEnd } from "@/lib/planner/previousEnd";
import { isNative } from "@/lib/platform";
import ActivityPillSelector from "@/components/activities/ActivityPillSelector";
import MentionTextarea from "@/components/shared/MentionTextarea";
import { categoryIdOf } from "@/lib/planner/rollup";
import { useTerms } from "@/lib/useTerms";
import { useT } from "@/lib/i18n";
import { lookToStyle, resolveUserStyles } from "@/lib/widgetLook";
import { widgetLookFor } from "@/pages/ExperimentalDashboard";
import { MINUTES_PER_DAY } from "@/lib/planner/layout";
import { rollup, goalProgress } from "@/lib/planner/rollup";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { SearchableMultiList } from "@/v2/widgets";
import AlterSortToggle from "@/components/shared/AlterSortToggle";
import { useAlterSorter } from "@/lib/alterSort";
import { groupedAlterSections } from "@/lib/alterSections";
import { BarChart3, CopyPlus, ChevronDown, SlidersHorizontal, ListChecks } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { usePlannerPrefs, HOUR_PX_MIN, HOUR_PX_MAX, DAY_PX_MIN, DAY_PX_MAX } from "@/lib/planner/displayPrefs";
import PlannedActivitiesList from "@/components/activities/PlannedActivitiesList";
import PlanCompletionTracker from "@/components/activities/PlanCompletionTracker";

const lsGet = (k, d) => {
  try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; }
};
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };

const fmt = (min) => {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
};

// One chip per optional field: always present, toggles its section.
function DetailChip({ open, has, onToggle, label, icon }) {
  return (
    <button type="button" onClick={onToggle} aria-expanded={open}
      className={`text-xs px-2.5 py-1 rounded-full border flex items-center gap-1 ${
        open ? "text-[var(--v2-accent)] border-[var(--v2-accent)]" : "border-border/50 text-muted-foreground hover:text-foreground"
      }`}>
      {open ? <Minus className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
      {icon}{label}
      {!open && has && <span aria-hidden className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--v2-accent)" }} />}
    </button>
  );
}

export default function PlannerSurface({
  dayCount = 7,
  chrome = true,
  anchor: anchorProp,
  onAnchorChange,
  maxHeight,
  applyPageLook = true,
  // Per-instance display overrides (a widget's own weekStartsOn / timeFmt /
  // rowH config). Beat the shared preference when set.
  prefsOverride = null,
  // Per-instance overlay overrides (a widget's "Show who was fronting" /
  // "Show feelings" toggles). Only explicitly-set keys win; unset keys
  // keep following the page's shared pills.
  overlaysOverride = null,
  // Widget host: a plain tap on empty time opens the full page (the widget
  // is a window onto the planner, so tapping its body should go there).
  // Hold-to-create and tap-a-block still work exactly as on the page.
  onOpenPage = null,
}) {
  const t = useTerms();
  const tr = useT();
  const formatAlter = useAlterLabel();
  const [showTotals, setShowTotals] = useState(false);
  const [showDisplay, setShowDisplay] = useState(false);
  const [showPlans, setShowPlans] = useState(false);
  // Display prefs (row height / clock / week start) — the same keys the
  // classic tracker used, so nothing resets moving between the two.
  const [prefs, setPref] = usePlannerPrefs(prefsOverride);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [ownAnchor, setOwnAnchor] = useState(() => new Date());
  const anchor = anchorProp || ownAnchor;
  const setAnchor = (v) => {
    const next = typeof v === "function" ? v(anchor) : v;
    if (onAnchorChange) onAnchorChange(next); else setOwnAnchor(next);
  };
  const [ownOverlays, setOwnOverlays] = useState(() => lsGet("symphony_planner_overlays_v1", { alters: false, emotions: false }));
  const overlays = { ...ownOverlays, ...(overlaysOverride || {}) };
  const [planDay, setPlanDay] = useState(null);       // day whose list is open
  const [timing, setTiming] = useState(null);
  // Tapped fronting-lane bar → who/when card (bars alone are anonymous).
  const [bandInfo, setBandInfo] = useState(null);          // { item, day } being scheduled
  const [timeValue, setTimeValue] = useState("09:00");
  const [durValue, setDurValue] = useState(60);
  const [noteValue, setNoteValue] = useState("");
  // The tracker functions beyond name/time/who: repeat cadence (create
  // only, like the classic modal — editing one instance never changes a
  // series' cadence), critical pinning, per-plan reminder offset, location.
  // DETAILS chips (classic popup pattern): who / notes start folded, open on
  // tap, and auto-open whenever they already hold a value. Each open state
  // is tri-state: null = follow the value, true/false = the user's own
  // choice — so an opened section can be folded back up (v0.186.3), and a
  // section holding a value can be tucked away too (its chip keeps a dot).
  const [whoOpen, setWhoOpen] = useState(null);
  const [notesOpen, setNotesOpen] = useState(null);
  // WHAT is the full picker while creating; when editing it folds to one
  // line (what's linked + Change) so the sheet reads as "a plan that
  // exists" instead of a wall of categories.
  const [whatOpen, setWhatOpen] = useState(false);
  // WHEN can be entered as start + duration (default) or as start → end
  // (the end may fall on another day). Both edit the same underlying
  // day/time/duration, so every commit path is unchanged. Remembered.
  const [timeMode, setTimeModeState] = useState(() => lsGet("symphony_planner_time_mode", "duration"));
  const setTimeMode = (m) => { setTimeModeState(m); lsSet("symphony_planner_time_mode", m); };
  // The "more options" fields are Details chips now (same grammar as Who /
  // Notes): folded until tapped, auto-open when they hold a value.
  const [repeatOpen, setRepeatOpen] = useState(null);
  const [reminderOpen, setReminderOpen] = useState(null);
  const [criticalOpen, setCriticalOpen] = useState(null);
  const [locationOpen, setLocationOpen] = useState(null);
  const whoHas = (timing?.item?.fronting_alter_ids || []).length > 0;
  const notesHas = !!(timing?.item?.notes || "").trim() || !!noteValue.trim();
  const whoOpenEff = whoOpen ?? whoHas;
  const notesOpenEff = notesOpen ?? notesHas;
  // "Rescheduled" outcome chip → jump into the date field: rescheduling IS
  // the sheet's own move-to-day controls; the chip just takes you there.
  const dayInputRef = useRef(null);

  const [recur, setRecur] = useState({ interval: "none", count: 8 });
  const [extra, setExtra] = useState({
    is_critical: false, critical_lead_steps: DEFAULT_LEAD_STEPS,
    reminder_offset_minutes: null, location: "",
  });
  const [planRemOn, setPlanRemOn] = useState(() => readPlanRemindersEnabled());
  // Chip open states derived from values (must sit AFTER recur/extra are declared).
  const repeatHas = !!(recur.interval && recur.interval !== "none");
  const reminderHas = extra.reminder_offset_minutes != null;
  const criticalHas = !!extra.is_critical;
  const locationHas = !!(extra.location || "").trim();
  const repeatOpenEff = repeatOpen ?? repeatHas;
  const reminderOpenEff = reminderOpen ?? reminderHas;
  const criticalOpenEff = criticalOpen ?? criticalHas;
  const locationOpenEff = locationOpen ?? locationHas;
  const canRepeat = !!timing?.create;
  const canPlanExtras = !!(timing?.create || timing?.item?.status === "scheduled");
  // Deleting a series member must ask how far the delete reaches.
  const [branchAsk, setBranchAsk] = useState(null); // { item }

  const { data: activities = [] } = useQuery({ queryKey: ["activities"], queryFn: () => base44.entities.Activity.list() });
  // "After the last one": the end of the most recent activity that finished
  // before this entry's own start (or before now, for a new entry) — the
  // natural start time when logging a day back-to-back. Skips the entry
  // being edited and anything with no duration (no real end).
  const { prevEnd, prevEndName } = useMemo(() => {
    if (!timing) return { prevEnd: null, prevEndName: "" };
    const ownStart = !timing.create && timing.item?.timestamp ? new Date(timing.item.timestamp) : new Date();
    const best = previousActivityEnd(activities, { before: ownStart, excludeId: timing.item?.id || null });
    return { prevEnd: best?.end || null, prevEndName: best?.name || "" };
  }, [activities, timing]);
  // Escape closes the entry sheet — the backdrop tap is easy to miss when
  // the sheet fills a phone screen, so there's an X too (title row).
  useEffect(() => {
    if (!timing) return undefined;
    const onKey = (e) => { if (e.key === "Escape") setTiming(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [timing]);
  const isSameDayAsTiming = (d) => timing && new Date(timing.day).toDateString() === d.toDateString();
  const { data: categories = [] } = useQuery({ queryKey: ["activityCategories"], queryFn: () => base44.entities.ActivityCategory.list() });
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  const { data: frontingHistory = [] } = useQuery({
    queryKey: ["frontingHistory"], queryFn: () => base44.entities.FrontingSession.list(),
    enabled: overlays.alters,
  });
  const { data: emotionCheckIns = [] } = useQuery({
    queryKey: ["emotionCheckIns"], queryFn: () => base44.entities.EmotionCheckIn.list(),
    enabled: overlays.emotions,
  });

  // The planner wears the same look the v2 widgets do, so a style preset
  // set on the home screen carries here: accent, radius, borders, fonts and
  // colours all arrive as CSS variables and the markup below reads them.
  const { data: settingsRows = [] } = useQuery({
    queryKey: ["systemSettings"], queryFn: () => base44.entities.SystemSettings.list(),
  });
  const settingsRow = settingsRows[0];
  const pageLook = useMemo(() => {
    const userStyles = resolveUserStyles(settingsRow?.ui_v2_styles);
    const styleMode = settingsRow?.ui_v2_home?.styleMode || "current";
    return lookToStyle(widgetLookFor({}, userStyles, styleMode));
  }, [settingsRow]);

  const { data: goals = [] } = useQuery({ queryKey: ["activityGoals"], queryFn: () => base44.entities.ActivityGoal.list() });

  // Fronters first, then whatever order the user picked — the standard
  // arrangement for every member list in the app.
  const sorter = useAlterSorter("symphony_planner_alter_sort");
  // Nested view (rule 23): the same sections every grouped member list uses,
  // built from the user's own group/subsystem tree. Remembered.
  const [whoGrouped, setWhoGrouped] = useState(() => lsGet("symphony_planner_who_grouped", false));
  const toggleWhoGrouped = () => {
    setWhoGrouped((v) => { lsSet("symphony_planner_who_grouped", !v); return !v; });
  };
  const { data: groups = [] } = useQuery({ queryKey: ["groups"], queryFn: () => base44.entities.Group.list() });
  const toMemberOption = useMemo(
    () => (a) => ({ id: a.id, label: formatAlter(a), color: a.color, avatarUrl: a.avatar_url }),
    [formatAlter]
  );
  const memberSections = useMemo(
    () => (whoGrouped ? groupedAlterSections({ alters, groups, sort: sorter.sort, toOption: toMemberOption }) : undefined),
    [whoGrouped, alters, groups, sorter, toMemberOption]
  );
  const memberOptions = useMemo(
    () => sorter.sort(alters.filter((a) => !a.is_archived))
      .map((a) => ({ id: a.id, label: formatAlter(a), color: a.color, avatarUrl: a.avatar_url })),
    [alters, sorter, formatAlter]
  );

  const weekRange = useMemo(() => {
    const from = startOfWeek(anchor, { weekStartsOn: prefs.weekStartsOn });
    return { from, to: new Date(from.getTime() + 7 * 86400000) };
  }, [anchor]);

  const totals = useMemo(() => rollup({
    activities, from: weekRange.from, to: weekRange.to, categories,
    alterIds: Object.fromEntries(alters.map((a) => [a.id, formatAlter(a)])),
  }), [activities, weekRange, categories, alters, formatAlter]);

  const goalRows = useMemo(
    () => goalProgress({ goals, rollupResult: totals, categories }),
    [goals, totals, categories]
  );

  // The work rota changes weekly, so the fastest way to set it is to take
  // last week and shift it seven days. Copies PLANS only — logs are history.
  const copyLastWeek = async () => {
    const prevFrom = new Date(weekRange.from.getTime() - 7 * 86400000);
    const source = activities.filter(
      (a) => a.timestamp && new Date(a.timestamp) >= prevFrom && new Date(a.timestamp) < weekRange.from
    );
    if (!source.length) { toast.info(tr("planner.copyNothing")); return; }
    try {
      for (const a of source) {
        const when = new Date(new Date(a.timestamp).getTime() + 7 * 86400000);
        await base44.entities.Activity.create({
          activity_name: a.activity_name,
          parent_category_id: a.parent_category_id || null,
          duration_minutes: a.duration_minutes ?? a.actual_duration_minutes ?? null,
          fronting_alter_ids: a.fronting_alter_ids || [],
          timestamp: when.toISOString(),
          // Always a PLAN — copying last week is scheduling, not claiming
          // you already did it.
          status: "scheduled",
        });
      }
      qc.invalidateQueries({ queryKey: ["activities"] });
      toast.success(tr("planner.copied", { count: source.length }));
    } catch (e) { toast.error(e.message || "Copy failed"); }
  };

  const catColor = useMemo(() => {
    const byId = Object.fromEntries(categories.map((c) => [c.id, c]));
    return (id) => byId[id]?.color || null;
  }, [categories]);

  const setOverlay = (key, on) => {
    const next = { ...ownOverlays, [key]: on };
    setOwnOverlays(next);
    lsSet("symphony_planner_overlays_v1", next);
  };

  // Creating uses the SAME sheet as editing (one implementation, rule 16),
  // opened with an unsaved draft item. Whether it becomes a log or a plan is
  // decided at commit from the chosen time — the split the tracker makes.
  const openCreate = (day, fromMin, toMin) => {
    const pad = (n) => String(n).padStart(2, "0");
    setTiming({
      create: true,
      day,
      item: { activity_name: "", fronting_alter_ids: [], notes: "", activity_category_ids: [] },
    });
    setTimeValue(`${pad(Math.floor(fromMin / 60))}:${pad(fromMin % 60)}`);
    setDurValue(Math.max(15, toMin - fromMin));
    setNoteValue("");
    setRecur({ interval: "none", count: 8 });
    setExtra({ is_critical: false, critical_lead_steps: DEFAULT_LEAD_STEPS, reminder_offset_minutes: null, location: "" });
    setWhoOpen(null); setNotesOpen(null); setRepeatOpen(null); setReminderOpen(null); setCriticalOpen(null); setLocationOpen(null);
    setWhatOpen(true);
  };
  // Editing seeds the extras from the record, and the More section starts
  // open when any of them is set — a critical plan's flag must not hide.
  const seedExtras = (item) => {
    setExtra({
      is_critical: !!item.is_critical,
      critical_lead_steps: item.critical_lead_steps || DEFAULT_LEAD_STEPS,
      reminder_offset_minutes: item.reminder_offset_minutes ?? null,
      location: item.location || "",
    });
    // Chips fold on open; fields that hold a value auto-open via the *OpenEff
    // derivations, so nothing set is ever hidden.
    setWhoOpen(null); setNotesOpen(null); setRepeatOpen(null); setReminderOpen(null); setCriticalOpen(null); setLocationOpen(null);
    setWhatOpen(false);
  };
  const handleCreate = (day, fromMin, toMin) => openCreate(day, fromMin, toMin);
  // Tap-first route (rule 28): the toolbar + opens a create for the next
  // whole hour today, and every field is adjustable in the sheet.
  const openCreateNow = () => {
    const d = new Date();
    const startMin = Math.min(23 * 60, (d.getHours() + 1) * 60);
    openCreate(d, startMin, startMin + 60);
  };

  // Creation goes through THE shared plan writer (rule 6) — the same one
  // the classic modal calls — so recurrence expansion, critical pinning,
  // reminder offsets and location behave identically in both UIs instead
  // of drifting. Native reminders reconcile globally (usePlanReminderSync).
  const commitCreate = async () => {
    if (!timing?.create) return;
    const name = (timing.item.activity_name || "").trim();
    if (!name) return;
    const [h, m] = String(timeValue).split(":").map(Number);
    const when = new Date(timing.day);
    when.setHours(h || 0, m || 0, 0, 0);
    const isPlan = when.getTime() > Date.now();
    const catId = (timing.item.activity_category_ids || [])[0] || null;
    const cat = catId ? categories.find((c) => c.id === catId) : null;
    try {
      const { occurrences } = await createPlan({
        records: [{
          activity_name: name,
          activity_category_ids: timing.item.activity_category_ids || [],
          ...(cat?.color ? { color: cat.color } : {}),
        }],
        timestamp: when,
        durationMinutes: Math.max(5, Number(durValue) || 60),
        alterIds: timing.item.fronting_alter_ids || [],
        notes: noteValue.trim() || null,
        location: extra.location.trim() || null,
        isCritical: extra.is_critical,
        leadSteps: extra.is_critical ? extra.critical_lead_steps : null,
        reminderOffset: extra.reminder_offset_minutes,
        recurrence: recur,
      });
      qc.invalidateQueries({ queryKey: ["activities"] });
      setTiming(null);
      toast.success(occurrences.length > 1
        ? tr("planner.createdCount", { count: occurrences.length })
        : (isPlan ? tr("planner.planned") : tr("planner.logged")));
    } catch (e) { toast.error(e.message || "Failed"); }
  };

  // Dragging an edge only ever changes when it started and how long it ran.
  const handleResize = async (id, day, startMin, endMin) => {
    const activity = activities.find((a) => a.id === id);
    if (!activity) return;
    const start = new Date(day);
    start.setHours(Math.floor(startMin / 60), startMin % 60, 0, 0);
    const minutes = Math.max(1, Math.min(MINUTES_PER_DAY, endMin - startMin));
    try {
      await base44.entities.Activity.update(id, {
        timestamp: start.toISOString(),
        // Keep whichever duration field this record already used.
        ...(activity.actual_duration_minutes != null
          ? { actual_duration_minutes: minutes }
          : { duration_minutes: minutes }),
      });
      qc.invalidateQueries({ queryKey: ["activities"] });
    } catch (e) { toast.error(e.message || tr("planner.moveFailed")); }
  };

  // Give an untimed intention a slot: the SAME record gains a timestamp, so
  // it moves from the strip into the grid without losing its identity (or
  // its link back to the to-do it came from).
  const applyTime = async () => {
    if (!timing) return;
    const [h, m] = String(timeValue).split(":").map(Number);
    const when = new Date(timing.day);
    when.setHours(h || 0, m || 0, 0, 0);
    try {
      const wasScheduled = timing.item.status === "scheduled";
      const from = timing.item.timestamp;
      const prevMins = Number(timing.item.actual_duration_minutes) || Number(timing.item.duration_minutes) || 0;
      const unchanged = from === when.toISOString()
        && prevMins === Math.max(5, Number(durValue) || 60);
      await base44.entities.Activity.update(timing.item.id, {
        timestamp: when.toISOString(),
        duration_minutes: Math.max(5, Number(durValue) || 60),
        // Moving a plan is a reschedule, not a new plan: status stays
        // `scheduled` and the move is recorded, matching the tracker's model.
        ...(wasScheduled && from && from !== when.toISOString()
          ? { reschedule_history: [...(timing.item.reschedule_history || []), { from, to: when.toISOString(), ts: new Date().toISOString() }] }
          : {}),
      });
      qc.invalidateQueries({ queryKey: ["activities"] });
      setTiming(null);
      // Say what happened. A move of one column at the same time is easy to
      // miss — especially if it lands outside the scrolled view — and the
      // sheet closing with no word for it reads as the button doing nothing.
      if (unchanged) toast.info(tr("planner.noChange"));
      else toast.success(tr("planner.rescheduled", { when: format(when, "EEE d MMM, HH:mm") }));
    } catch (e) { toast.error(e.message || tr("planner.moveFailed")); }
  };

  // Done from the strip. If it came from a to-do, tick that off too so the
  // two can't disagree.
  const markUntimedDone = async (item) => {
    try {
      await base44.entities.Activity.update(item.id, {
        status: "done",
        timestamp: item.timestamp || new Date().toISOString(),
      });
      if (item.task_id) {
        await base44.entities.Task.update(item.task_id, {
          completed: true, is_complete: true, completed_date: new Date().toISOString(),
        }).catch(() => {});
      }
      qc.invalidateQueries({ queryKey: ["activities"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      setTiming(null);
      toast.success(tr("planner.doneToast"));
    } catch (e) { toast.error(e.message || "Failed"); }
  };

  // Toggle a member on the open entry. Writes straight through so the totals
  // update without needing a save step.
  const toggleAlter = async (alterId) => {
    if (!timing) return;
    const current = timing.item.fronting_alter_ids || [];
    const next = current.includes(alterId) ? current.filter((x) => x !== alterId) : [...current, alterId];
    setTiming((prev) => ({ ...prev, item: { ...prev.item, fronting_alter_ids: next } }));
    if (timing.create) return;
    try {
      await base44.entities.Activity.update(timing.item.id, { fronting_alter_ids: next });
      qc.invalidateQueries({ queryKey: ["activities"] });
    } catch (e) { toast.error(e.message || "Failed"); }
  };

  // Resolve a plan: what actually became of it. The lifecycle enum exists so
  // a plan that didn't happen stays honest instead of counting as time spent.
  const setOutcome = async (status) => {
    if (!timing) return;
    try {
      // One write path with the home-notice resolve list (lib resolvePlan).
      await resolveOutcome(timing.item, status);
      qc.invalidateQueries({ queryKey: ["activities"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      setTiming(null);
    } catch (e) { toast.error(e.message || "Failed"); }
  };

  // "Start now" — the plan becomes a running Active Activity (the same
  // store the home notice / Active Activities widget use), exactly like the
  // tracker's lifecycle popover. The plan record stays scheduled until the
  // session ends and logs itself.
  const alreadyActive = !!timing && !timing.create && getActiveActivities().some((a) => a.planActivityId === timing.item.id);
  const startNow = () => {
    if (!timing || timing.create) return;
    const it = timing.item;
    const cat = categories.find((c) => c.id === categoryIdOf(it));
    addActiveActivity({
      planActivityId: it.id,
      categoryId: cat?.id || null,
      name: it.activity_name || cat?.name || "Activity",
      color: cat?.color || null,
      startTime: new Date().toISOString(),
      alterIds: it.fronting_alter_ids || [],
      notes: (it.notes || "").trim(),
    });
    try { cancelPlanReminder(it.id).catch(() => {}); } catch { /* non-fatal */ }
    toast.success(tr("planner.startedToast"));
    setTiming(null);
  };

  const saveNote = async (text) => {
    if (!timing) return;
    if (timing.create) return; // held in noteValue until commit
    try {
      await base44.entities.Activity.update(timing.item.id, { notes: text });
      setTiming((prev) => (prev ? { ...prev, item: { ...prev.item, notes: text } } : prev));
      qc.invalidateQueries({ queryKey: ["activities"] });
    } catch (e) { toast.error(e.message || "Failed"); }
  };

  // Has the user actually changed day / time / duration? The commit button
  // only renders when this is true — an always-on "Reschedule" invited
  // pressing it with nothing to do, which read as the button being broken.
  // Log or Plan? Follows the picked day+time against now, live.
  const createIsPlan = useMemo(() => {
    if (!timing?.create) return false;
    const [h, m] = String(timeValue).split(":").map(Number);
    const when = new Date(timing.day);
    when.setHours(h || 0, m || 0, 0, 0);
    return when.getTime() > Date.now();
  }, [timing, timeValue]);

  const timingDirty = useMemo(() => {
    if (!timing) return false;
    const orig = timing.item.timestamp ? new Date(timing.item.timestamp) : null;
    if (!orig) return true; // untimed: any chosen time is a change
    const pad = (n) => String(n).padStart(2, "0");
    const origTime = `${pad(orig.getHours())}:${pad(orig.getMinutes())}`;
    const origDur = Number(timing.item.actual_duration_minutes) || Number(timing.item.duration_minutes) || 60;
    const sameDay = new Date(timing.day).toDateString() === orig.toDateString();
    return !sameDay || timeValue !== origTime || Number(durValue) !== origDur;
  }, [timing, timeValue, durValue]);

  // Rename / recategorise write straight through, like the member toggle.
  const saveField = async (patch) => {
    if (!timing) return;
    if (timing.create) {
      setTiming((prev) => (prev ? { ...prev, item: { ...prev.item, ...patch } } : prev));
      return;
    }
    try {
      await base44.entities.Activity.update(timing.item.id, patch);
      setTiming((prev) => (prev ? { ...prev, item: { ...prev.item, ...patch } } : prev));
      qc.invalidateQueries({ queryKey: ["activities"] });
    } catch (e) { toast.error(e.message || "Failed"); }
  };

  const deleteEntry = async () => {
    if (!timing) return;
    const item = timing.item;
    // A series member: deleting must ask how far it reaches (rule 14) —
    // one occurrence, this-and-future, or the whole series.
    if (item.recurrence_group_id) {
      setBranchAsk({ item });
      return;
    }
    const ok = await confirm({
      title: tr("planner.deleteTitle", { name: item.activity_name || tr("planner.untitled") }),
      body: tr("planner.deleteBody"),
      confirmLabel: tr("planner.delete"),
      destructive: true,
    });
    if (!ok) return;
    try {
      await base44.entities.Activity.delete(item.id);
      qc.invalidateQueries({ queryKey: ["activities"] });
      setTiming(null);
      toast.success(tr("planner.deleted"));
    } catch (e) { toast.error(e.message || "Failed"); }
  };

  // The chosen reach for a series delete. Same helpers the classic details
  // modal uses, so both UIs agree on which records each branch covers.
  const deleteBranch = async (branch) => {
    const item = branchAsk?.item;
    setBranchAsk(null);
    if (!item) return;
    try {
      const members = branch === RECURRENCE_BRANCHES.THIS_ONLY
        ? [item]
        : membersForBranch(activities, item, branch);
      const count = await deleteSeries(members);
      qc.invalidateQueries({ queryKey: ["activities"] });
      setTiming(null);
      toast.success(tr("planner.deletedCount", { count }));
    } catch (e) { toast.error(e.message || "Failed"); }
  };

  const enablePlanReminders = async () => {
    writePlanRemindersEnabled(true);
    setPlanRemOn(true);
    try {
      if (isNative()) {
        const { requestNativePermission } = await import("@/lib/nativeNotifications");
        await requestNativePermission();
      } else if ("Notification" in window && Notification.permission === "default") {
        await Notification.requestPermission();
      }
    } catch { /* permission stays whatever it is; reconcile respects it */ }
  };

  // Depth-tagged category options from the shared cycle-guarded flattener.
  // "What is it?" → offer (never auto-apply) existing activities/categories
  // whose name matches what was typed. A user may deliberately title
  // something the same as an activity without linking it.
  const nameMatches = useMemo(() => {
    const q = (timing?.item?.activity_name || "").trim().toLowerCase();
    if (!q || q.length < 2) return [];
    const exact = [], starts = [], contains = [];
    for (const c of categories || []) {
      const n = (c.name || "").toLowerCase();
      if (!n) continue;
      if (n === q) exact.push(c); else if (n.startsWith(q)) starts.push(c); else if (n.includes(q)) contains.push(c);
    }
    return [...exact, ...starts, ...contains].slice(0, 5);
  }, [timing?.item?.activity_name, categories]);


  // Plain range rather than "w/c" — that's British shorthand for "week
  // commencing" and means nothing to most people.
  const weekLabel = useMemo(() => {
    const start = startOfWeek(anchor, { weekStartsOn: prefs.weekStartsOn });
    const end = new Date(start.getTime() + 6 * 86400000);
    const sameMonth = start.getMonth() === end.getMonth();
    return sameMonth
      ? `${format(start, "d")}–${format(end, "d MMM")}`
      : `${format(start, "d MMM")} – ${format(end, "d MMM")}`;
  }, [anchor]);
  // The canvas used to print its own range line under this one, saying the
  // same thing twice. One heading row.
  const weekTotalLabel = useMemo(() => {
    const start = startOfWeek(anchor, { weekStartsOn: prefs.weekStartsOn });
    const end = new Date(start.getTime() + 7 * 86400000);
    const mins = activities.reduce((n, a) => {
      const t = a.timestamp ? new Date(a.timestamp) : null;
      if (!t || t < start || t >= end) return n;
      return n + (Number(a.actual_duration_minutes) || Number(a.duration_minutes) || 0);
    }, 0);
    const h = Math.floor(mins / 60), m = mins % 60;
    return mins ? `· ${h ? `${h}h ` : ""}${m ? `${m}m` : ""}`.trim() : "";
  }, [anchor, activities]);

  return (
    <div className={chrome ? "min-h-screen p-2 sm:p-4" : "flex flex-col min-h-0 h-full"}
      {...(chrome ? { "data-tour": "planner" } : {})}
      style={applyPageLook ? pageLook : undefined}
      {...(applyPageLook ? { "data-widget-content": true } : {})}>
      <div className={chrome ? "os-page-shell space-y-2" : "flex flex-col min-h-0 h-full"}>
        {chrome && <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" aria-label={tr("planner.prevWeek")} onClick={() => setAnchor((d) => addWeeks(d, -1))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm font-medium tabular-nums">{weekLabel}</span>
            <Button variant="ghost" size="sm" aria-label={tr("planner.nextWeek")} onClick={() => setAnchor((d) => addWeeks(d, 1))}>
              <ChevronRight className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setAnchor(new Date())}>{tr("planner.today")}</Button>
            <span className="text-xs text-muted-foreground tabular-nums ml-1">{weekTotalLabel}</span>
            <Button variant="ghost" size="sm" className="gap-1" onClick={openCreateNow}
              aria-label={tr("planner.new")} title={tr("planner.new")}>
              <Plus className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" className="gap-1" onClick={copyLastWeek}
              title={tr("planner.copyWeek")}>
              <CopyPlus className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="sm" className="gap-1" onClick={() => setShowTotals((v) => !v)}
              aria-expanded={showTotals} title={tr("planner.totals")}>
              <BarChart3 className="w-3.5 h-3.5" />
              <ChevronDown className="w-3 h-3" style={{ transform: showTotals ? "rotate(180deg)" : "none" }} />
            </Button>
            <Button variant="ghost" size="sm" className="gap-1" onClick={() => setShowPlans((v) => !v)}
              aria-expanded={showPlans} aria-label={tr("planner.plans")} title={tr("planner.plans")}>
              <ListChecks className="w-3.5 h-3.5" />
              <ChevronDown className="w-3 h-3" style={{ transform: showPlans ? "rotate(180deg)" : "none" }} />
            </Button>
            <Button variant="ghost" size="sm" className="gap-1" onClick={() => setShowDisplay((v) => !v)}
              aria-expanded={showDisplay} aria-label={tr("planner.display")} title={tr("planner.display")}>
              <SlidersHorizontal className="w-3.5 h-3.5" />
            </Button>
          </div>

          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setOverlay("alters", !overlays.alters)}
              aria-pressed={overlays.alters}
              className={`text-xs px-2 py-1 rounded-full border flex items-center gap-1 ${
                overlays.alters ? "border-[var(--v2-accent)] bg-[color-mix(in_srgb,var(--v2-accent)_12%,transparent)] text-[var(--v2-accent)]" : "border-border/50 text-muted-foreground"
              }`}>
              <Users className="w-3 h-3" /> {tr("planner.overlay.fronting", { term: t.Fronting })}
            </button>
            <button type="button" onClick={() => setOverlay("emotions", !overlays.emotions)}
              aria-pressed={overlays.emotions}
              className={`text-xs px-2 py-1 rounded-full border flex items-center gap-1 ${
                overlays.emotions ? "border-[var(--v2-accent)] bg-[color-mix(in_srgb,var(--v2-accent)_12%,transparent)] text-[var(--v2-accent)]" : "border-border/50 text-muted-foreground"
              }`}>
              <Heart className="w-3 h-3" /> {tr("planner.overlay.checkins")}
            </button>
          </div>
        </div>}

        {chrome && showTotals && (
          <div className="rounded-lg border border-border/50 p-2 space-y-2 text-xs"
            style={{ borderRadius: "var(--v2-radius, 8px)" }}>
            {totals.total === 0 && <p className="text-muted-foreground">{tr("planner.nothingTracked")}</p>}
            {totals.activities.length > 0 && (
              <div>
                <p className="font-semibold uppercase tracking-wide text-[0.625em] text-muted-foreground mb-1">
                  {tr("planner.byActivity")}
                </p>
                {totals.activities.slice(0, 8).map((a) => (
                  <div key={a.key} className="flex items-center justify-between gap-2">
                    <span className="truncate">{a.label}</span>
                    <span className="tabular-nums text-muted-foreground">{fmt(a.minutes)}</span>
                  </div>
                ))}
              </div>
            )}
            {totals.alters.length > 0 && (
              <div>
                <p className="font-semibold uppercase tracking-wide text-[0.625em] text-muted-foreground mb-1">
                  {tr("planner.byMember", { members: t.alters })}
                </p>
                {totals.alters.map((a) => (
                  <div key={a.key} className="flex items-center justify-between gap-2">
                    <span className="truncate">{a.label}</span>
                    <span className="tabular-nums text-muted-foreground">{fmt(a.minutes)}</span>
                  </div>
                ))}
              </div>
            )}
            <div>
              <p className="font-semibold uppercase tracking-wide text-[0.625em] text-muted-foreground mb-1">
                {tr("planner.goals")}
              </p>
              {goalRows.length === 0 && <p className="text-muted-foreground">{tr("planner.noGoals")}</p>}
              {goalRows.map((g) => (
                <div key={g.id} className="space-y-0.5 mb-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate">{g.label}</span>
                    <span className="tabular-nums text-muted-foreground">{fmt(g.done)} / {fmt(g.target)}</span>
                  </div>
                  <div className="h-1 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full"
                      style={{ width: `${g.pct}%`, background: g.color || "var(--v2-accent)" }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {chrome && showPlans && (
          <div className="rounded-lg border border-border/50 p-2 space-y-3"
            style={{ borderRadius: "var(--v2-radius, 8px)" }}>
            {/* The SAME components the Activity tracker's Planned tab and
                plan tracker use — one implementation (rule: reuse, don't
                fork). Tapping a plan opens the planner's own edit sheet. */}
            <PlannedActivitiesList
              activities={activities}
              alters={alters}
              compact
              onClick={(a) => {
                const start = a.timestamp ? new Date(a.timestamp) : null;
                setTiming({ item: a, day: start || anchor });
                setTimeValue(start ? `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}` : "09:00");
                setDurValue(Number(a.actual_duration_minutes) || Number(a.duration_minutes) || 60);
                setNoteValue(a.notes || "");
                seedExtras(a);
              }}
            />
            <PlanCompletionTracker />
          </div>
        )}

        {chrome && showDisplay && (
          <div className="rounded-lg border border-border/50 p-2 space-y-2 text-xs"
            style={{ borderRadius: "var(--v2-radius, 8px)" }}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">{tr("planner.clock")}</span>
              <span className="flex gap-1">
                {[["24", tr("planner.clock24")], ["ampm", tr("planner.clock12")]].map(([id, label]) => (
                  <button key={id} type="button" aria-pressed={prefs.timeFmt === id}
                    onClick={() => setPref("timeFmt", id)}
                    className={`px-2.5 py-1 rounded-full border ${
                      prefs.timeFmt === id ? "text-[var(--v2-accent)] border-[var(--v2-accent)]" : "border-border/50 text-muted-foreground"
                    }`}>{label}</button>
                ))}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">{tr("planner.weekStart")}</span>
              <span className="flex gap-1">
                {[[1, tr("planner.monday")], [0, tr("planner.sunday")]].map(([id, label]) => (
                  <button key={id} type="button" aria-pressed={prefs.weekStartsOn === id}
                    onClick={() => setPref("weekStartsOn", id)}
                    className={`px-2.5 py-1 rounded-full border ${
                      prefs.weekStartsOn === id ? "text-[var(--v2-accent)] border-[var(--v2-accent)]" : "border-border/50 text-muted-foreground"
                    }`}>{label}</button>
                ))}
              </span>
            </div>
            <label className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground whitespace-nowrap">{tr("planner.rowHeight")}</span>
              <input type="range" min={HOUR_PX_MIN} max={HOUR_PX_MAX} step={2} value={prefs.hourPx}
                onChange={(e) => setPref("hourPx", Number(e.target.value))}
                className="flex-1 accent-[var(--v2-accent)]" aria-label={tr("planner.rowHeight")} />
              <span className="tabular-nums text-muted-foreground w-10 text-right">{prefs.hourPx}px</span>
            </label>
            {dayCount > 1 && (
              <label className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground whitespace-nowrap">{tr("planner.dayWidth")}</span>
                <input type="range" min={DAY_PX_MIN} max={DAY_PX_MAX} step={2} value={prefs.dayPx}
                  onChange={(e) => setPref("dayPx", Number(e.target.value))}
                  className="flex-1 accent-[var(--v2-accent)]" aria-label={tr("planner.dayWidth")} />
                <span className="tabular-nums text-muted-foreground w-10 text-right">{prefs.dayPx}px</span>
              </label>
            )}
            <label className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground whitespace-nowrap">{tr("planner.laneOpacity", { term: t.Fronting })}</span>
              <input type="range" min={10} max={100} step={5} value={prefs.laneOpacity}
                onChange={(e) => setPref("laneOpacity", Number(e.target.value))}
                className="flex-1 accent-[var(--v2-accent)]" aria-label={tr("planner.laneOpacity", { term: t.Fronting })} />
              <span className="tabular-nums text-muted-foreground w-10 text-right">{prefs.laneOpacity}%</span>
            </label>
            <p className="text-[0.6875em] text-muted-foreground">{tr("planner.pinchHint")}</p>
          </div>
        )}

        <WeekCanvas
          anchor={anchor}
          onOpenPage={onOpenPage}
          prefsOverride={prefsOverride}
          dayCount={dayCount}
          maxHeight={maxHeight}
          fill={!chrome}
          activities={activities}
          frontingHistory={frontingHistory}
          emotionCheckIns={emotionCheckIns}
          alters={alters}
          categoryColor={catColor}
          overlays={overlays}
          onCreate={handleCreate}
          onOpenBlock={(item) => {
            const start = item.timestamp ? new Date(item.timestamp) : null;
            setTiming({ item, day: start || anchor });
            setTimeValue(start ? `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}` : "09:00");
            setDurValue(Number(item.actual_duration_minutes) || Number(item.duration_minutes) || 60);
            setNoteValue(item.notes || "");
            seedExtras(item);
          }}
          onResize={handleResize}
          // A tapped check-in dot lands on that entry in the log, highlighted.
          onOpenMark={(m) => { if (m?.id) navigate(`/checkin-log?id=${encodeURIComponent(m.id)}`); }}
          onOpenBand={(b, rect) => setBandInfo({ band: b, rect })}
          onAddToDay={(day) => setPlanDay(day)}
          onOpenUntimed={(item, day) => {
            setTiming({ item, day }); setTimeValue("09:00"); setDurValue(60); setNoteValue(item.notes || "");
            seedExtras(item);
          }}
        />
      </div>

      <DayPlanSheet day={planDay} open={!!planDay} onClose={() => setPlanDay(null)} />

      {/* Portaled to the body: a v2 board is framer-transformed, which
          re-anchors `position: fixed` to the board instead of the viewport —
          so an un-portaled sheet renders inside the widget and gets clipped
          by it, which is why its buttons did nothing. */}
      {bandInfo && createPortal((
        <div className="fixed inset-0 z-[85]" onClick={() => setBandInfo(null)}>
          <div className="fixed bg-card border border-border rounded-xl shadow-xl p-3 w-56"
            style={{
              left: Math.max(8, Math.min(bandInfo.rect.left + 10, window.innerWidth - 232)),
              top: Math.max(8, Math.min(bandInfo.rect.top + 8, window.innerHeight - 140)),
            }}
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: bandInfo.band.color }} />
              <span className="text-sm font-medium truncate">{bandInfo.band.name}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {new Date(bandInfo.band.session.start_time).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              {" — "}
              {bandInfo.band.session.end_time
                ? new Date(bandInfo.band.session.end_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                : tr("planner.stillFronting")}
            </p>
            <div className="flex gap-2 mt-2">
              <button type="button" onClick={() => { setBandInfo(null); navigate(`/alter/${bandInfo.band.alterId}`); }}
                className="text-xs px-2.5 py-1 rounded-full border border-border/50 hover:text-foreground text-muted-foreground">
                {tr("planner.openProfile")}
              </button>
              <button type="button" onClick={() => { setBandInfo(null); navigate("/analytics"); }}
                className="text-xs px-2.5 py-1 rounded-full border border-border/50 hover:text-foreground text-muted-foreground">
                {tr("planner.frontHistory", { Front: t.Front })}
              </button>
            </div>
          </div>
        </div>
      ), document.body)}
      {timing && createPortal((
        <div className="fixed inset-0 z-[70] bg-black/50 flex items-end sm:items-center justify-center"
          style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "calc(var(--bottom-nav-height, 56px) + env(safe-area-inset-bottom, 0px))" }}
          onClick={(e) => { if (e.target === e.currentTarget) setTiming(null); }}>
          {/* A sheet taller than the screen must scroll, not overflow off the
              top — with member list, notes and outcomes it can exceed a short
              viewport. */}
          <div className="bg-card w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl border border-border p-3 space-y-3 max-h-full overflow-y-auto overscroll-contain"
            style={{ borderRadius: "var(--v2-radius, 16px)" }}>
            <div className="flex items-start justify-between gap-2">
              <button type="button" onClick={() => setTiming(null)} aria-label={tr("planner.close")} title={tr("planner.close")}
                className="p-1 -ml-1 rounded-lg text-muted-foreground hover:text-foreground flex-shrink-0">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <input
                value={timing.item.activity_name || ""}
                placeholder={timing.create ? tr("planner.namePlaceholder") : tr("planner.untitled")}
                autoFocus={!!timing.create}
                onChange={(e) => setTiming((prev) => (prev
                  ? { ...prev, item: { ...prev.item, activity_name: e.target.value } }
                  : prev))}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (!timing.create && v && v !== timing.item.activity_name) saveField({ activity_name: v });
                }}
                className="flex-1 min-w-0 bg-transparent text-sm font-semibold focus:outline-none focus:border-b focus:border-[var(--v2-accent)]"
              />
              <span className="text-[0.625em] uppercase tracking-wide text-muted-foreground border border-border/50 rounded-full px-2 py-0.5 flex-shrink-0">
                {timing.create ? tr("planner.new") : tr("planner.edit")}
              </span>
            </div>
            {/* Series membership is a fact the user must see before editing —
                per-field edits and reschedules apply to THIS occurrence only
                (matching the tracker); delete asks how far to reach. */}
            {!timing.create && timing.item.recurrence_group_id && (
              <p className="text-[0.6875em] text-muted-foreground flex items-center gap-1">
                <Repeat className="w-3 h-3 flex-shrink-0" /> {tr("planner.series")}
              </p>
            )}
            {/* OUTCOME first when editing: the sheet is about a plan that
                already exists, so "what became of it" is the headline, not
                a footnote under a wall of categories.
                A plan that didn't happen must be sayable —
                otherwise it either nags forever or quietly counts as done. */}
            {!timing.create && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">{tr("planner.outcome")}</p>
              <div className="flex flex-wrap gap-1">
                {timing.item.status === "scheduled" && (alreadyActive ? (
                  <span className="text-xs px-2.5 py-1 rounded-full border border-[var(--v2-accent)] text-[var(--v2-accent)] flex items-center gap-1">
                    <Play className="w-3 h-3" />{tr("planner.inProgress")}
                  </span>
                ) : (
                  <button type="button" onClick={startNow}
                    className="text-xs px-2.5 py-1 rounded-full border border-[var(--v2-accent)] text-[var(--v2-accent)] flex items-center gap-1">
                    <Play className="w-3 h-3" />{tr("planner.startNow")}
                  </button>
                ))}
                {[["done", tr("planner.done")], ["partial", tr("planner.partial")],
                  ["skipped", tr("planner.skipped")], ["cancelled", tr("planner.cancelled")]].map(([id, label]) => (
                  <button key={id} type="button" aria-pressed={timing.item.status === id}
                    onClick={() => setOutcome(id)}
                    className={`text-xs px-2.5 py-1 rounded-full border ${
                      timing.item.status === id
                        ? "text-[var(--v2-accent)] border-[var(--v2-accent)]"
                        : "border-border/50 text-muted-foreground"
                    }`}>{label}</button>
                ))}
                {/* Not an end state — "it's still happening, just later".
                    The chip enters the reschedule flow: the sheet's own
                    move-to-day controls, with the date picker opened so
                    the next tap is already choosing the new day. */}
                <button type="button"
                  onClick={() => {
                    const el = dayInputRef.current;
                    if (!el) return;
                    el.scrollIntoView({ behavior: "smooth", block: "center" });
                    try { el.showPicker(); } catch { el.focus(); }
                  }}
                  className="text-xs px-2.5 py-1 rounded-full border border-border/50 text-muted-foreground flex items-center gap-1">
                  <Repeat className="w-3 h-3" />{tr("planner.reschedule")}
                </button>
              </div>
              {/* Partly done wants to know how much actually happened — the
                  totals count the actual, not the intention. */}
              {timing.item.status === "partial" && (
                <label className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                  {tr("planner.actualMin")}
                  <input type="number" min={1} step={5}
                    defaultValue={timing.item.actual_duration_minutes ?? ""}
                    onBlur={(e) => {
                      const n = parseInt(e.target.value, 10);
                      saveField({ actual_duration_minutes: Number.isFinite(n) && n > 0 ? n : null });
                    }}
                    className="w-20 h-8 px-2 rounded-lg border border-input bg-background text-sm" />
                </label>
              )}
            </div>
            )}

            {/* WHAT — the same searchable, nested, create-if-missing picker
                the classic Log Activity modal uses (ActivityPillSelector),
                so choosing an activity/category here IS choosing it there.
                Above "who": what it is comes before who did it. */}
            {nameMatches.length > 0 && !categoryIdOf(timing.item) && (
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-[0.6875em] text-muted-foreground">{tr("planner.matchHint")}</span>
                {nameMatches.map((c) => (
                  <button key={c.id} type="button"
                    onClick={() => saveField({ activity_category_ids: [c.id] })}
                    className="text-[0.6875em] px-2 py-0.5 rounded-full border border-border/50 hover:text-foreground flex items-center gap-1">
                    {c.color && <span className="w-2 h-2 rounded-full" style={{ background: c.color }} />}
                    {c.name}
                  </button>
                ))}
              </div>
            )}
            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">{tr("planner.what")}</p>
                {!timing.create && (
                  <button type="button" onClick={() => setWhatOpen((v) => !v)} aria-expanded={whatOpen}
                    className="text-[0.6875em] px-2 py-0.5 rounded-full border border-border/50 text-muted-foreground hover:text-foreground">
                    {whatOpen ? tr("planner.whatDone") : tr("planner.whatChange")}
                  </button>
                )}
              </div>
              {(timing.create || whatOpen) ? (
                <ActivityPillSelector
                  selectedActivities={timing.item.activity_category_ids || []}
                  onActivityChange={(ids) => saveField({ activity_category_ids: Array.isArray(ids) ? ids : [] })}
                />
              ) : (
                <div className="flex flex-wrap gap-1">
                  {(timing.item.activity_category_ids || []).map((id) => categories.find((c) => c.id === id)).filter(Boolean).map((c) => (
                    <span key={c.id} className="text-xs px-2.5 py-1 rounded-full border border-border/50 flex items-center gap-1">
                      {c.color && <span className="w-2 h-2 rounded-full" style={{ background: c.color }} />}{c.name}
                    </span>
                  ))}
                  {(timing.item.activity_category_ids || []).length === 0 && (
                    <span className="text-xs text-muted-foreground">{tr("planner.whatNone")}</span>
                  )}
                </div>
              )}
            </div>

            {/* WHEN — day chips (fast path), date field (any date), time,
                duration. Same section grammar as the classic Log Activity
                popup: When → What → Details. */}
            <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground -mb-1">{tr("planner.when")}</p>
            <div>
              <p className="text-xs text-muted-foreground mb-1">{tr("planner.moveToDay")}</p>
              <div className="flex gap-1 items-center">
                {Array.from({ length: 7 }, (_, i) => {
                  const d = new Date(startOfWeek(anchor, { weekStartsOn: prefs.weekStartsOn }).getTime() + i * 86400000);
                  const on = new Date(timing.day).toDateString() === d.toDateString();
                  return (
                    <button key={i} type="button" aria-pressed={on}
                      onClick={() => setTiming((prev) => ({ ...prev, day: d }))}
                      className={`flex-1 text-[0.6875em] py-1 rounded border ${
                        on ? "text-[var(--v2-accent)] border-[var(--v2-accent)]" : "border-border/50 text-muted-foreground"
                      }`}>
                      {format(d, "EEEEE")}
                    </button>
                  );
                })}
              </div>
              <input type="date" ref={dayInputRef}
                aria-label={tr("planner.date")}
                value={format(new Date(timing.day), "yyyy-MM-dd")}
                onChange={(e) => {
                  const [y, mo, da] = String(e.target.value).split("-").map(Number);
                  if (!y || !mo || !da) return;
                  setTiming((prev) => (prev ? { ...prev, day: new Date(y, mo - 1, da) } : prev));
                }}
                className="mt-1 w-full h-8 px-2 rounded-lg border border-input bg-background text-xs" />
            </div>

            {/* Time entry mode: start + duration, or start → end (end may be
                another day). Both edit the same day/time/duration. */}
            <div className="flex items-center gap-1">
              {[["duration", tr("planner.modeDuration")], ["range", tr("planner.modeRange")]].map(([id, label]) => (
                <button key={id} type="button" aria-pressed={timeMode === id} onClick={() => setTimeMode(id)}
                  className={`text-[0.6875em] px-2 py-0.5 rounded-full border ${
                    timeMode === id ? "text-[var(--v2-accent)] border-[var(--v2-accent)]" : "border-border/50 text-muted-foreground"
                  }`}>{label}</button>
              ))}
            </div>
            <div className="flex items-end gap-2">
              <label className="flex-1 text-xs text-muted-foreground">
                <span className="flex items-center justify-between gap-2">
                  {timeMode === "range" ? tr("planner.startsAt") : tr("planner.giveTime")}
                  {/* Quick-set: start where the previous thing ended. Logging
                      a day is mostly back-to-back — retyping the last end
                      time for every entry is the tedium this removes. */}
                  {prevEnd && (
                    <button type="button"
                      onClick={() => {
                        setTimeValue(`${String(prevEnd.getHours()).padStart(2, "0")}:${String(prevEnd.getMinutes()).padStart(2, "0")}`);
                        if (!isSameDayAsTiming(prevEnd)) setTiming((p) => (p ? { ...p, day: prevEnd } : p));
                      }}
                      className="text-[0.6875em] px-2 py-0.5 rounded-full border border-border/50 hover:text-foreground truncate max-w-[60%]"
                      title={`${prevEnd.toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })} — ${prevEndName}`}>
                      {tr("planner.afterLast")}
                    </button>
                  )}
                </span>
                <input type="time" value={timeValue} onChange={(e) => setTimeValue(e.target.value)}
                  className="mt-1 w-full h-9 px-2 rounded-lg border border-input bg-background text-sm" />
              </label>
              {timeMode === "duration" && (
                <label className="w-24 text-xs text-muted-foreground">
                  min
                  <input type="number" min={5} step={5} value={durValue}
                    onChange={(e) => setDurValue(e.target.value)}
                    className="mt-1 w-full h-9 px-2 rounded-lg border border-input bg-background text-sm" />
                </label>
              )}
            </div>
            {timeMode === "range" && (() => {
              // Derive the end from day + start + duration; edits write back
              // as a new duration (never negative — an end before the start
              // rolls to the next day, matching what people mean at midnight).
              const startDt = (() => { const d = new Date(timing.day); const [h, m] = String(timeValue).split(":").map(Number); d.setHours(h || 0, m || 0, 0, 0); return d; })();
              const endDt = new Date(startDt.getTime() + Math.max(5, Number(durValue) || 60) * 60000);
              const pad = (n) => String(n).padStart(2, "0");
              const endDate = `${endDt.getFullYear()}-${pad(endDt.getMonth() + 1)}-${pad(endDt.getDate())}`;
              const endTime = `${pad(endDt.getHours())}:${pad(endDt.getMinutes())}`;
              const commitEnd = (dateStr, timeStr) => {
                const [y, mo, da] = dateStr.split("-").map(Number);
                const [h, mi] = timeStr.split(":").map(Number);
                if (!y || !mo || !da) return;
                let end = new Date(y, mo - 1, da, h || 0, mi || 0, 0, 0);
                if (end <= startDt) end = new Date(end.getTime() + 86400000);
                setDurValue(Math.max(5, Math.round((end - startDt) / 60000)));
              };
              const crossesDay = endDt.toDateString() !== startDt.toDateString();
              return (
                <div className="flex items-end gap-2">
                  <label className="flex-1 text-xs text-muted-foreground">
                    {tr("planner.endsAt")}
                    <div className="mt-1 flex gap-1">
                      <input type="date" value={endDate} onChange={(e) => commitEnd(e.target.value, endTime)}
                        aria-label={tr("planner.endDate")}
                        className="flex-1 min-w-0 h-9 px-2 rounded-lg border border-input bg-background text-sm" />
                      <input type="time" value={endTime} onChange={(e) => commitEnd(endDate, e.target.value)}
                        aria-label={tr("planner.endTime")}
                        className="w-28 h-9 px-2 rounded-lg border border-input bg-background text-sm" />
                    </div>
                  </label>
                  <span className="text-[0.6875em] text-muted-foreground tabular-nums pb-2 whitespace-nowrap">
                    {fmt(Math.max(5, Number(durValue) || 60))}{crossesDay ? ` · ${tr("planner.nextDay")}` : ""}
                  </span>
                </div>
              );
            })()}
            {/* DETAILS — optional fields behind "+" chips, exactly like the
                classic Log Activity popup: a field auto-expands whenever it
                already holds a value, so nothing is hidden that matters. */}
            <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground -mb-1">{tr("planner.details")}</p>
            <div className="flex flex-wrap gap-1.5">
              <DetailChip open={whoOpenEff} has={whoHas} onToggle={() => setWhoOpen(!whoOpenEff)} label={tr("planner.who")} />
              <DetailChip open={notesOpenEff} has={notesHas} onToggle={() => setNotesOpen(!notesOpenEff)} label={tr("planner.notes")} />
              {canRepeat && (
                <DetailChip open={repeatOpenEff} has={repeatHas} onToggle={() => setRepeatOpen(!repeatOpenEff)} label={tr("planner.repeat")} />
              )}
              {canPlanExtras && (
                <DetailChip open={reminderOpenEff} has={reminderHas} onToggle={() => setReminderOpen(!reminderOpenEff)} label={tr("planner.reminder")} />
              )}
              {canPlanExtras && (
                <DetailChip open={criticalOpenEff} has={criticalHas} onToggle={() => setCriticalOpen(!criticalOpenEff)} label={tr("planner.critical")} />
              )}
              <DetailChip open={locationOpenEff} has={locationHas} onToggle={() => setLocationOpen(!locationOpenEff)} label={tr("planner.location")} />
            </div>
            {/* Who was doing it — this is what makes the per-member totals
                answer "is everyone getting fair time".
                House rule: never a bare list of members. Searchable and
                scrollable, whoever is fronting first, one-tap sort toggle —
                the same picker every other member list uses. A flat chip row
                is unusable once a system has more than a handful. */}
            {whoOpenEff && (
            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <p className="text-xs text-muted-foreground">{tr("planner.who")}</p>
                <span className="flex items-center gap-1">
                  <button type="button" onClick={toggleWhoGrouped}
                    aria-pressed={whoGrouped} aria-label={tr("planner.groupView")} title={tr("planner.groupView")}
                    className={`p-1.5 rounded-lg border ${
                      whoGrouped ? "border-[var(--v2-accent)] text-[var(--v2-accent)]" : "border-border/50 text-muted-foreground"
                    }`}>
                    <FolderTree className="w-3.5 h-3.5" />
                  </button>
                  <AlterSortToggle sorter={sorter} />
                </span>
              </div>
              <SearchableMultiList
                options={memberOptions}
                sections={memberSections}
                selectedIds={timing.item.fronting_alter_ids || []}
                onToggle={toggleAlter}
                searchPlaceholder={tr("planner.searchMembers", { members: t.alters })}
              />
            </div>
            )}
            {notesOpenEff && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">{tr("planner.notes")}</p>
              {/* @mentions like every other note box (no ~commands here —
                  a plan note shouldn't quietly log things). */}
              <MentionTextarea
                value={noteValue}
                onChange={setNoteValue}
                alters={alters}
                commands={false}
                onBlur={() => { if (noteValue !== (timing.item.notes || "")) saveNote(noteValue); }}
                rows={2}
                placeholder={tr("planner.notesPlaceholder")}
                className="w-full rounded-lg border border-input bg-background text-sm p-2"
              />
            </div>
            )}

            <div className="space-y-3">
                  {canRepeat && repeatOpenEff && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                        <Repeat className="w-3 h-3" /> {tr("planner.repeat")}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {["none", "daily", "weekly", "biweekly", "monthly"].map((iv) => (
                          <button key={iv} type="button" aria-pressed={recur.interval === iv}
                            onClick={() => setRecur((r) => ({ ...r, interval: iv }))}
                            className={`text-xs px-2.5 py-1 rounded-full border ${
                              recur.interval === iv
                                ? "text-[var(--v2-accent)] border-[var(--v2-accent)]"
                                : "border-border/50 text-muted-foreground"
                            }`}>{tr(`planner.repeat.${iv}`)}</button>
                        ))}
                      </div>
                      {recur.interval !== "none" && (
                        <label className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                          {tr("planner.repeatCount")}
                          <input type="number" min={1} max={52} value={recur.count}
                            onChange={(e) => {
                              const n = parseInt(e.target.value, 10);
                              setRecur((r) => ({ ...r, count: Number.isFinite(n) ? Math.max(1, Math.min(52, n)) : 1 }));
                            }}
                            className="w-16 h-8 px-2 rounded-lg border border-input bg-background text-sm" />
                        </label>
                      )}
                    </div>
                  )}

                  {canPlanExtras && reminderOpenEff && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">{tr("planner.reminder")}</p>
                      {planRemOn ? (
                        <div className="flex flex-wrap gap-1">
                          <button type="button" aria-pressed={extra.reminder_offset_minutes == null}
                            onClick={() => {
                              setExtra((x) => ({ ...x, reminder_offset_minutes: null }));
                              if (!timing.create) saveField({ reminder_offset_minutes: null });
                            }}
                            className={`text-xs px-2.5 py-1 rounded-full border ${
                              extra.reminder_offset_minutes == null
                                ? "text-[var(--v2-accent)] border-[var(--v2-accent)]"
                                : "border-border/50 text-muted-foreground"
                            }`}>{tr("planner.reminderDefault")}</button>
                          {PLAN_REMINDER_OFFSETS.map((o) => (
                            <button key={o.value} type="button" aria-pressed={extra.reminder_offset_minutes === o.value}
                              onClick={() => {
                                setExtra((x) => ({ ...x, reminder_offset_minutes: o.value }));
                                if (!timing.create) saveField({ reminder_offset_minutes: o.value });
                              }}
                              className={`text-xs px-2.5 py-1 rounded-full border ${
                                extra.reminder_offset_minutes === o.value
                                  ? "text-[var(--v2-accent)] border-[var(--v2-accent)]"
                                  : "border-border/50 text-muted-foreground"
                              }`}>{tr(`planner.offset.${o.value}`)}</button>
                          ))}
                        </div>
                      ) : (
                        <Button size="sm" variant="outline" className="text-xs h-7" onClick={enablePlanReminders}>
                          {tr("planner.reminderEnable")}
                        </Button>
                      )}
                    </div>
                  )}

                  {canPlanExtras && criticalOpenEff && (
                    <div>
                      <button type="button" aria-pressed={extra.is_critical}
                        onClick={() => {
                          const on = !extra.is_critical;
                          setExtra((x) => ({ ...x, is_critical: on }));
                          if (!timing.create) saveField({ is_critical: on, critical_lead_steps: on ? extra.critical_lead_steps : null });
                        }}
                        className={`text-xs px-2.5 py-1 rounded-full border ${
                          extra.is_critical
                            ? "text-amber-500 border-amber-500"
                            : "border-border/50 text-muted-foreground"
                        }`}>⚡ {tr("planner.critical")}</button>
                      {extra.is_critical && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {LEAD_STEPS.map((s) => {
                            const on = (extra.critical_lead_steps || []).includes(s.key);
                            return (
                              <button key={s.key} type="button" aria-pressed={on}
                                onClick={() => {
                                  const cur = extra.critical_lead_steps || [];
                                  const next = on ? cur.filter((k) => k !== s.key) : [...cur, s.key];
                                  setExtra((x) => ({ ...x, critical_lead_steps: next }));
                                  if (!timing.create) saveField({ critical_lead_steps: next });
                                }}
                                className={`text-[0.6875em] px-2 py-0.5 rounded-full border ${
                                  on ? "text-[var(--v2-accent)] border-[var(--v2-accent)]" : "border-border/50 text-muted-foreground"
                                }`}>{tr(`planner.lead.${s.key}`)}</button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {locationOpenEff && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> {tr("planner.location")}
                    </p>
                    <input value={extra.location}
                      onChange={(e) => setExtra((x) => ({ ...x, location: e.target.value }))}
                      onBlur={() => {
                        if (!timing.create && (extra.location.trim() || null) !== (timing.item.location || null)) {
                          saveField({ location: extra.location.trim() || null });
                        }
                      }}
                      className="w-full h-8 px-2 rounded-lg border border-input bg-background text-sm" />
                    {!timing.create && timing.item.location && (
                      <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(timing.item.location)}`}
                        target="_blank" rel="noopener noreferrer"
                        className="text-[0.6875em] mt-0.5 inline-block hover:underline"
                        style={{ color: "var(--v2-accent)" }}>
                        {tr("planner.openMap")}
                      </a>
                    )}
                  </div>
                  )}
            </div>

            {timing.create ? (
              <Button size="sm" className="w-full" disabled={!(timing.item.activity_name || "").trim()}
                onClick={commitCreate}>
                {createIsPlan ? tr("planner.plan") : tr("planner.log")}
              </Button>
            ) : timingDirty && (
              <Button size="sm" className="w-full" onClick={applyTime}>
                {timing.item.timestamp ? tr("planner.reschedule") : tr("planner.giveTime")}
              </Button>
            )}
            {/* Deleting states its blast radius (rule 12) and leaves any
                linked to-do untouched — removing a plan is not un-wanting
                the task. */}
            {!timing.create && (
              <Button size="sm" variant="ghost"
                className="w-full text-destructive hover:text-destructive"
                onClick={deleteEntry}>{tr("planner.delete")}</Button>
            )}
          </div>
        </div>
      ), document.body)}

      {/* Series delete: how far does it reach? Rendered on its own (never
          stacked over the entry sheet's controls) and portaled like every
          v2 overlay. */}
      {branchAsk && createPortal((
        <div className="fixed inset-0 z-[80] bg-black/50 flex items-end sm:items-center justify-center"
          style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "calc(var(--bottom-nav-height, 56px) + env(safe-area-inset-bottom, 0px))" }}
          onClick={(e) => { if (e.target === e.currentTarget) setBranchAsk(null); }}>
          <div className="bg-card w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl border border-border p-4 space-y-2"
            style={{ borderRadius: "var(--v2-radius, 16px)" }}>
            <p className="text-sm font-semibold">{tr("planner.branchTitle")}</p>
            <p className="text-xs text-muted-foreground">
              {tr("planner.branchBody", { name: branchAsk.item.activity_name || tr("planner.untitled") })}
            </p>
            {[
              [RECURRENCE_BRANCHES.THIS_ONLY, tr("planner.branchThis")],
              [RECURRENCE_BRANCHES.THIS_AND_FUTURE, tr("planner.branchFuture")],
              [RECURRENCE_BRANCHES.ALL, tr("planner.branchAll")],
            ].map(([branch, label]) => (
              <Button key={branch} size="sm" variant="outline" className="w-full justify-start"
                onClick={() => deleteBranch(branch)}>
                {label}
              </Button>
            ))}
            <Button size="sm" variant="ghost" className="w-full" onClick={() => setBranchAsk(null)}>
              {tr("planner.cancel")}
            </Button>
          </div>
        </div>
      ), document.body)}
    </div>
  );
}
