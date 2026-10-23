// The planner surface: canvas + every sheet and modal that acts on it.
//
// The /planner page and the home-screen activity widgets both render this,
// so the gestures, the day list, the member assignment and the writes exist
// once. `dayCount` picks a week or a single day; `chrome` turns the toolbar
// and totals off for a widget that has its own header.
//
// Reads and writes the SAME Activity records — no new entity, no migration.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { prepareAuthoredText, recordAuthoredText, isLogCommandError } from "@/lib/authoredText";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, addWeeks, addMonths, addYears, startOfWeek, format } from "date-fns";
import { CheckSquare, ChevronLeft, ChevronRight, Users, Heart, Plus, Minus, FolderTree, Repeat, MapPin, Play, Pause, Settings as SettingsIcon } from "lucide-react";
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
import { RECURRENCE_BRANCHES, RECURRENCE_INTERVALS, maxOccurrences, clampOccurrenceCount, membersForBranch, deleteSeries, applyEditToSeries } from "@/lib/recurrenceUtils";
import { resolveOutcome, startPlanActive } from "@/lib/planner/resolvePlan";
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
import { SlidersHorizontal } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { usePlannerPrefs, formatClock, HOUR_PX_MIN, HOUR_PX_MAX, DAY_PX_MIN, DAY_PX_MAX } from "@/lib/planner/displayPrefs";
import PlansList from "@/components/planner/PlansList";
import PlanDetailsSheet from "@/components/planner/PlanDetailsSheet";
import PlanTimeChoice from "@/components/planner/PlanTimeChoice";
import PlanColorTagPicker from "@/components/activities/PlanColorTagPicker";
import { normalizeHex } from "@/lib/planTagColor";
import { Switch } from "@/components/ui/switch";
import { ContactMultiSelectList } from "@/components/contacts/ContactMultiSelect";
import CurrentActivities, { ActivityActionMenu } from "@/components/activities/CurrentActivities";
// The tracker's overview calendars and panels, merged into the planner.
import ActivityMonthView from "@/components/activities/ActivityMonthView";
import ActivityYearView from "@/components/activities/ActivityYearView";
import ActivityGoalsPanel from "@/components/activities/ActivityGoalsPanel";
import PlanCompletionTracker from "@/components/activities/PlanCompletionTracker";
import ActivityTallyTracker from "@/components/activities/ActivityTallyTracker";
import ActivityNestingRecovery from "@/components/activities/ActivityNestingRecovery";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import { collectAlterDates } from "@/lib/importantDates";
import { tasksAsCalendarItems } from "@/lib/planner/taskItems";
import { syncLinkedSleep, deleteLinkedSleep } from "@/lib/planner/linkedSleep";

const lsGet = (k, d) => {
  try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; }
};
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };

const VIEWS = ["day", "week", "month", "year"];

function PanelError({ label, onRetry }) {
  return (
    <div className="p-3 rounded-lg border border-destructive/40 bg-destructive/5 text-xs text-destructive">
      {label}: something went wrong showing this.
      <button type="button" onClick={onRetry} className="ml-2 underline hover:no-underline">Retry</button>
    </div>
  );
}

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
  onSetPref = null,
  // Widget host: a plain tap on empty time opens the full page (the widget
  // is a window onto the planner, so tapping its body should go there).
  // Hold-to-create and tap-a-block still work exactly as on the page.
  onOpenPage = null,
  // Deep link: open this plan's details on mount (Planner page passes the
  // ?activityId= param through).
  openActivityId = null,
  onOpenedActivity = null,
  // Deep link: start on this date (the Planner page passes ?date=).
  initialAnchor = null,
}) {
  const t = useTerms();
  const tr = useT();
  const formatAlter = useAlterLabel();
  const [showDisplay, setShowDisplay] = useState(false);
  // The page's three parts (chrome only) — the tracker's Logged / Planned /
  // Plan tracker tabs, merged: the calendar, the scheduled-plans list
  // (series collapsed to one row each) and the insights (totals, goals,
  // follow-through, tally). Remembered, like the view.
  const [section, setSectionState] = useState(() => {
    const v = lsGet("symphony_planner_section_v1", "calendar");
    return ["calendar", "plans", "insights"].includes(v) ? v : "calendar";
  });
  const setSection = (v) => { setSectionState(v); lsSet("symphony_planner_section_v1", v); };
  // Calendar zoom (chrome only): day / week on the time canvas, month /
  // year as the overview calendars the tracker had. Starts from the
  // tracker's own remembered choice so nobody's view resets.
  const [view, setViewState] = useState(() => {
    const v = lsGet("symphony_planner_view_v1", null) ?? lsGet("symphony_act_view_mode", "week");
    return VIEWS.includes(v) ? v : "week";
  });
  const setView = (v) => { setViewState(v); lsSet("symphony_planner_view_v1", v); };
  const effDayCount = chrome ? (view === "day" ? 1 : 7) : dayCount;
  // Display prefs (row height / clock / week start) — the same keys the
  // classic tracker used, so nothing resets moving between the two.
  const [prefs, setPref] = usePlannerPrefs(prefsOverride);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [ownAnchor, setOwnAnchor] = useState(() => initialAnchor || new Date());
  const anchor = anchorProp || ownAnchor;
  const setAnchor = (v) => {
    const next = typeof v === "function" ? v(anchor) : v;
    if (onAnchorChange) onAnchorChange(next); else setOwnAnchor(next);
  };
  const [ownOverlays, setOwnOverlays] = useState(() => lsGet("symphony_planner_overlays_v1", { alters: false, emotions: false }));
  const overlays = { ...ownOverlays, ...(overlaysOverride || {}) };
  const [planDay, setPlanDay] = useState(null);       // day whose list is open
  const [timing, setTiming] = useState(null);
  // Tapped empty time on the page → that hour's summary card.
  const [cellInfo, setCellInfo] = useState(null); // { day, min, rect }
  // Tapped fronting-lane bar → who/when card (bars alone are anonymous).
  const [bandInfo, setBandInfo] = useState(null);          // { item, day } being scheduled
  // Tapping an entry OPENS ITS DETAILS — a readable summary — rather than
  // dropping straight into the editor (owner spec). Edit is one tap away.
  const [details, setDetails] = useState(null);
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
  const [tagOpen, setTagOpen] = useState(null);
  // Company — the contacts the person was with (Activity.contact_ids).
  // Descriptive only; never touches "currently with" state.
  const [withOpen, setWithOpen] = useState(null);
  const withHas = (timing?.item?.contact_ids || []).length > 0;
  const withOpenEff = withOpen ?? withHas;
  const whoHas = (timing?.item?.fronting_alter_ids || []).length > 0;
  const notesHas = !!(timing?.item?.notes || "").trim() || !!noteValue.trim();
  const whoOpenEff = whoOpen ?? whoHas;
  const notesOpenEff = notesOpen ?? notesHas;
  // "Rescheduled" outcome chip → jump into the date field: rescheduling IS
  // the sheet's own move-to-day controls; the chip just takes you there.
  const dayInputRef = useRef(null);

  const [recur, setRecur] = useState({ interval: "none", count: 8 });
  // Create-mode only: extra week days picked on the day chips. The same
  // plan lands on each picked day as its own record — a "Thursday AND
  // Friday this week" plan isn't a recurring series. timing.day stays the
  // primary day (the date field edits that one).
  const [extraDays, setExtraDays] = useState([]);
  // The last title this sheet auto-filled from a picked activity — so a
  // later pick can replace its own fill without ever clobbering a title
  // the user typed themselves.
  const autoTitleRef = useRef("");
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
  const tagHas = !!normalizeHex(timing?.item?.tag_color || "");
  const tagOpenEff = tagOpen ?? tagHas;
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
  // The editor writes several fields straight through (members, notes,
  // name…) — convenient, but closing used to be silent about it (owner:
  // "no save-and-exit, no discard"). Closing an EDIT now compares the
  // live record against the snapshot taken when the editor opened; if
  // anything changed, a Keep-or-Undo prompt appears, and Undo restores
  // the snapshot. Explicit actions (Move, outcomes, Start now) still
  // close directly — pressing a named button IS the confirmation.
  const [closeAsk, setCloseAsk] = useState(false);
  const EDIT_GUARD_FIELDS = ["activity_name", "notes", "fronting_alter_ids", "activity_category_ids",
    "parent_category_id", "location", "is_critical", "contact_ids", "color", "tag_color", "timestamp", "duration_minutes", "actual_duration_minutes"];
  const editorDirty = () => {
    if (!timing || timing.create || !timing.snapshot) return false;
    const live = (activities || []).find((a) => a.id === timing.item.id);
    if (!live) return false;
    return EDIT_GUARD_FIELDS.some((f) => JSON.stringify(live[f] ?? null) !== JSON.stringify(timing.snapshot[f] ?? null));
  };
  const requestCloseEditor = () => {
    if (editorDirty()) { setCloseAsk(true); return; }
    setCloseAsk(false);
    setTiming(null);
  };
  const undoEditorChanges = async () => {
    try {
      const snap = timing?.snapshot;
      if (snap?.id) {
        const patch = {};
        for (const f of EDIT_GUARD_FIELDS) patch[f] = snap[f] ?? null;
        await base44.entities.Activity.update(snap.id, patch);
        await syncLinkedSleep(snap, patch);
        qc.invalidateQueries({ queryKey: ["activities"] });
        toast.success(tr("planner.editUndone"));
      }
    } catch (e) { toast.error(e?.message || "Couldn't undo"); }
    setCloseAsk(false);
    setTiming(null);
  };
  // Escape closes the entry sheet — the backdrop tap is easy to miss when
  // the sheet fills a phone screen, so there's an X too (title row).
  useEffect(() => {
    if (!timing) return undefined;
    const onKey = (e) => { if (e.key === "Escape") { requestCloseEditor(); setDetails(null); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
     
  }, [timing, activities]);
  const isSameDayAsTiming = (d) => timing && new Date(timing.day).toDateString() === d.toDateString();
  const { data: categories = [] } = useQuery({ queryKey: ["activityCategories"], queryFn: () => base44.entities.ActivityCategory.list() });
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  const { data: tasks = [] } = useQuery({ queryKey: ["tasks"], queryFn: () => base44.entities.Task.list() });
  const { data: frontingHistory = [] } = useQuery({
    queryKey: ["frontingHistory"], queryFn: () => base44.entities.FrontingSession.list(),
    // The create sheet reads it too: it fills in who was fronting.
    enabled: overlays.alters || !!timing?.create || !!cellInfo,
  });
  const { data: emotionCheckIns = [] } = useQuery({
    queryKey: ["emotionCheckIns"], queryFn: () => base44.entities.EmotionCheckIn.list(),
    enabled: overlays.emotions || !!cellInfo,
  });
  // Location records pin onto the canvas at their time (on unless turned off).
  const { data: locationRecords = [] } = useQuery({
    queryKey: ["locations"], queryFn: () => base44.entities.Location.list(),
    enabled: overlays.locations !== false,
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

  // ("Copy last week" lived here until v0.229.0 — removed at the owner's
  // request: it wrote a week of plans with no confirmation and no easy
  // undo.)

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
  // A running quick-start activity tapped in the grid — the same
  // ActivityActionMenu the dashboard pill opens (edit start, pause,
  // end & log, discard). Reuse, don't fork.
  const [liveMenu, setLiveMenu] = useState(null);

  const openCreate = (day, fromMin, toMin) => {
    const pad = (n) => String(n).padStart(2, "0");
    setTiming({
      create: true,
      day,
      item: { activity_name: "", fronting_alter_ids: [], contact_ids: [], notes: "", activity_category_ids: [] },
    });
    setTimeValue(`${pad(Math.floor(fromMin / 60))}:${pad(fromMin % 60)}`);
    setDurValue(Math.max(15, toMin - fromMin));
    setNoteValue("");
    setRecur({ interval: "none", count: 8 });
    setExtraDays([]);
    autoTitleRef.current = "";
    setExtra({ is_critical: false, critical_lead_steps: DEFAULT_LEAD_STEPS, reminder_offset_minutes: null, location: "" });
    setWhoOpen(null); setNotesOpen(null); setRepeatOpen(null); setReminderOpen(null); setCriticalOpen(null); setLocationOpen(null); setTagOpen(null); setWithOpen(null);
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
    setWhoOpen(null); setNotesOpen(null); setRepeatOpen(null); setReminderOpen(null); setCriticalOpen(null); setLocationOpen(null); setTagOpen(null); setWithOpen(null);
    setWhatOpen(false);
  };
  // Opening the EDITOR for an existing entry — one seeding path for every
  // caller (details sheet, plans list, untimed strip).
  const openEditor = (item, { day = null, series = false } = {}) => {
    const start = item.timestamp ? new Date(item.timestamp) : null;
    setDetails(null);
    setTiming({
      item, day: day || start || (item.planned_date ? new Date(item.planned_date) : anchor),
      seriesBranch: series ? RECURRENCE_BRANCHES.THIS_AND_FUTURE : null,
      // What the record looked like when editing began — the Undo point
      // for the close-with-changes prompt.
      snapshot: { ...item },
    });
    setTimeValue(start ? `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}` : "09:00");
    setDurValue(Number(item.actual_duration_minutes) || Number(item.duration_minutes) || 60);
    setNoteValue(item.notes || "");
    seedExtras(item);
  };
  // Deep link from anywhere that lists a plan (Today widget, notices,
  // unresolved card): land on its day with its details open.
  useEffect(() => {
    if (!openActivityId) return;
    const found = (activities || []).find((a) => a.id === openActivityId);
    if (!found) return;
    const when = found.timestamp || found.planned_date;
    if (when) setAnchor(new Date(when));
    setDetails(found);
    onOpenedActivity?.();
  }, [openActivityId, activities]);  

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
    // Same rule as createPlan: anything from today onward is a plan (an
    // intention), only earlier days are logged. The old time-based check
    // said "Log" for earlier today while the write created a plan.
    const isPlan = format(when, "yyyy-MM-dd") >= format(new Date(), "yyyy-MM-dd");
    const catId = (timing.item.activity_category_ids || [])[0] || null;
    const cat = catId ? categories.find((c) => c.id === catId) : null;
    // One record per picked day — the primary day plus any extra chips,
    // deduped so the primary can't double up.
    const days = [new Date(timing.day),
      ...extraDays.filter((d) => d.toDateString() !== new Date(timing.day).toDateString())];
    try {
      // Shared text pipeline for the note: ~commands run once (not per
      // occurrence), "-name" signposts sign the plan, @mentions notify.
      let preparedNote = null;
      if (noteValue.trim()) {
        try { preparedNote = await prepareAuthoredText(noteValue.trim(), { alters, terms: t, surfaceLabel: "plan note" }); }
        catch (e) { if (isLogCommandError(e)) { toast.error(e.message); return; } throw e; }
        if (preparedNote === null) return;
      }
      const noteText = preparedNote ? preparedNote.content : "";
      const signedIds = preparedNote?.authorIds?.length ? preparedNote.authorIds : null;
      let firstCreatedId = null;
      let total = 0;
      for (const day of days) {
        const dayWhen = new Date(day);
        dayWhen.setHours(h || 0, m || 0, 0, 0);
        const { occurrences, createdIds } = await createPlan({
          records: [{
            activity_name: name,
            activity_category_ids: timing.item.activity_category_ids || [],
            ...(cat?.color ? { color: cat.color } : {}),
            ...(normalizeHex(timing.item.tag_color || "") ? { tag_color: normalizeHex(timing.item.tag_color) } : {}),
            // A to-do linked while creating must ride along, or ticking one
            // off could never find the other.
            ...(timing.item.task_id ? { task_id: timing.item.task_id } : {}),
            contact_ids: timing.item.contact_ids || [],
          }],
          timestamp: dayWhen,
          durationMinutes: Math.max(5, Number(durValue) || 60),
          alterIds: signedIds || timing.item.fronting_alter_ids || [],
          notes: noteText || null,
          location: extra.location.trim() || null,
          isCritical: extra.is_critical,
          leadSteps: extra.is_critical ? extra.critical_lead_steps : null,
          reminderOffset: extra.reminder_offset_minutes,
          recurrence: recur,
          authorAlterIds: preparedNote?.authorIds || [],
        });
        if (createdIds?.length && !firstCreatedId) firstCreatedId = createdIds[0];
        total += occurrences.length;
      }
      if (recordFronting && createHasStarted) {
        const who = signedIds || timing.item.fronting_alter_ids || [];
        const start = new Date(timing.day);
        start.setHours(h || 0, m || 0, 0, 0);
        const end = new Date(start.getTime() + Math.max(5, Number(durValue) || 60) * 60000);
        try { await recordFrontingFor(who, start, end); }
        catch { toast.error(tr("planner.frontingNotSaved", { fronting: t.fronting })); }
      }
      if (preparedNote) {
        await recordAuthoredText({ ...preparedNote, alters, sourceType: "activity", sourceId: firstCreatedId, sourceLabel: "Plan note", navigatePath: `/planner?date=${format(new Date(timing.day), "yyyy-MM-dd")}${firstCreatedId ? `&highlight=${firstCreatedId}` : ""}` });
      }
      qc.invalidateQueries({ queryKey: ["activities"] });
      setTiming(null);
      setExtraDays([]);
      toast.success(total > 1
        ? tr("planner.createdCount", { count: total })
        : (isPlan ? tr("planner.planned") : tr("planner.logged")));
    } catch (e) { toast.error(e.message || "Failed"); }
  };

  // Dragging an edge only ever changes when it started and how long it ran.
  const handleResize = async (id, day, startMin, endMin) => {
    const activity = activities.find((a) => a.id === id);
    if (!activity) return;
    // Minutes from this column's midnight; may be NEGATIVE (a multi-day
    // block resized from its last day starts on an earlier one).
    // setMinutes normalises either direction; the old setHours(floor/60,
    // %60) split mis-handled negatives.
    const start = new Date(day);
    start.setHours(0, 0, 0, 0);
    start.setMinutes(startMin);
    // No one-day ceiling: dragging the bottom edge sideways into later
    // days hands in endMin > 1440, and multi-day blocks already render
    // with continuation edges. 14 days is a sanity cap, not a feature.
    const minutes = Math.max(1, Math.min(MINUTES_PER_DAY * 14, endMin - startMin));
    try {
      const patch = {
        timestamp: start.toISOString(),
        // Keep whichever duration field this record already used.
        ...(activity.actual_duration_minutes != null
          ? { actual_duration_minutes: minutes }
          : { duration_minutes: minutes }),
      };
      await base44.entities.Activity.update(id, patch);
      await syncLinkedSleep(activity, patch);
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
      const dur = Math.max(5, Number(durValue) || 60);
      // Write the length into whichever field the record already uses —
      // same rule as drag-resize. The sheet and the grid both SHOW
      // actual_duration_minutes when it's set, so writing only
      // duration_minutes made an edited end time "not stick": the plan kept
      // its old actual length (owner report: 12:00–19:34 saved, came back
      // ending 08:34 the next day).
      const lengthPatch = (rec) => (rec.actual_duration_minutes != null
        ? { actual_duration_minutes: dur }
        : { duration_minutes: dur });
      const members = seriesMembers();
      if (members.length > 1) {
        // Series reach: every member keeps its own DATE shifted by the same
        // day-delta as the pivot, and takes the chosen clock time + length.
        const pivotOrig = timing.item.timestamp ? new Date(timing.item.timestamp) : when;
        const dayDelta = Math.round((new Date(when.getFullYear(), when.getMonth(), when.getDate()) -
          new Date(pivotOrig.getFullYear(), pivotOrig.getMonth(), pivotOrig.getDate())) / 86400000);
        await applyEditToSeries(members, (mem) => {
          const d0 = mem.timestamp ? new Date(mem.timestamp) : when;
          const d = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + dayDelta, h || 0, m || 0, 0, 0);
          const iso = d.toISOString();
          return {
            timestamp: iso,
            ...lengthPatch(mem),
            ...(countReschedule && mem.status === "scheduled" && mem.timestamp && mem.timestamp !== iso
              ? { reschedule_history: [...(mem.reschedule_history || []), { from: mem.timestamp, to: iso, ts: new Date().toISOString() }] }
              : {}),
          };
        });
      } else {
        const timePatch = { timestamp: when.toISOString(), ...lengthPatch(timing.item) };
        await base44.entities.Activity.update(timing.item.id, {
          ...timePatch,
          // Moving a plan is a reschedule, not a new plan: status stays
          // `scheduled` and the move is recorded, matching the tracker's model.
          ...(countReschedule && wasScheduled && from && from !== when.toISOString()
            ? { reschedule_history: [...(timing.item.reschedule_history || []), { from, to: when.toISOString(), ts: new Date().toISOString() }] }
            : {}),
        });
        await syncLinkedSleep(timing.item, timePatch);
      }
      qc.invalidateQueries({ queryKey: ["activities"] });
      setTiming(null);
      // Say what happened. A move of one column at the same time is easy to
      // miss — especially if it lands outside the scrolled view — and the
      // sheet closing with no word for it reads as the button doing nothing.
      if (unchanged) toast.info(tr("planner.noChange"));
      else if (!countReschedule || !wasScheduled) toast.success(tr("planner.timeFixed", { when: format(when, "EEE d MMM, HH:mm") }));
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
    setTiming((prev) => ({ ...prev, whoTouched: true, item: { ...prev.item, fronting_alter_ids: next } }));
    if (timing.create) return;
    try {
      await base44.entities.Activity.update(timing.item.id, { fronting_alter_ids: next });
      qc.invalidateQueries({ queryKey: ["activities"] });
    } catch (e) { toast.error(e.message || "Failed"); }
  };

  // Resolve a plan: what actually became of it. The lifecycle enum exists so
  // a plan that didn't happen stays honest instead of counting as time spent.
  const resolveItem = async (item, status, endedAt = null) => {
    if (!item) return;
    try {
      // One write path with the home-notice resolve list (lib resolvePlan).
      await resolveOutcome(item, status, { endedAt });
      qc.invalidateQueries({ queryKey: ["activities"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      setTiming(null); setDetails(null);
    } catch (e) { toast.error(e.message || "Failed"); }
  };
  const setOutcome = (status, endedAt = null) => resolveItem(timing?.item, status, endedAt);
  // Moving a scheduled plan counts as a real-life reschedule (↻, counted
  // in plan stats) unless the person says it's only a correction of what
  // they entered (owner, 2026-10-01). Back on for every newly opened plan.
  const [countReschedule, setCountReschedule] = useState(true);
  useEffect(() => { setCountReschedule(true); }, [timing?.item?.id]);
  // Start / Done ask WHEN first (PlanTimeChoice — "on time", now, or
  // another time). Which one is open in the sheet: "start" | "end" | null.
  const [timeAsk, setTimeAsk] = useState(null);
  useEffect(() => { setTimeAsk(null); }, [timing?.item?.id]);
  // The details view resolves too (owner spec) — an outcome shouldn't
  // require opening the editor first. Reschedule hands off to the editor,
  // where the day picker lives, and opens it.
  const rescheduleFromDetails = (item) => {
    openEditor(item);
    setTimeout(() => {
      const el = dayInputRef.current;
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      try { el.showPicker(); } catch { el.focus(); }
    }, 120);
  };

  // "Start now" — the plan becomes a running Active Activity (the same
  // store the home notice / Active Activities widget use), exactly like the
  // tracker's lifecycle popover. The plan record stays scheduled until the
  // session ends and logs itself.
  const alreadyActive = !!timing && !timing.create && getActiveActivities().some((a) => a.planActivityId === timing.item.id);
  // Pause the running session without resolving the plan — elapsed time is
  // banked on it (see activitySession.pauseActiveActivity).
  const pauseNow = async () => {
    const sess = getActiveActivities().find((a) => a.planActivityId === timing?.item?.id);
    if (!sess) return;
    try {
      const { pauseActiveActivity } = await import("@/lib/activitySession");
      const res = await pauseActiveActivity(sess.id);
      qc.invalidateQueries({ queryKey: ["activities"] });
      if (res) toast.success(`⏸ ${res.name} — ${res.total ?? res.minutes}m saved`);
      setTiming(null);
    } catch (e) { toast.error(e?.message || "Couldn't pause"); }
  };
  const startNow = (startedAt = new Date()) => {
    if (!timing || timing.create) return;
    const it = timing.item;
    const cat = categories.find((c) => c.id === categoryIdOf(it));
    addActiveActivity({
      planActivityId: it.id,
      categoryId: cat?.id || null,
      name: it.activity_name || cat?.name || "Activity",
      color: cat?.color || null,
      startTime: (startedAt instanceof Date ? startedAt : new Date()).toISOString(),
      alterIds: it.fronting_alter_ids || [],
      contactIds: it.contact_ids || [],
      notes: (it.notes || "").trim(),
    });
    try { cancelPlanReminder(it.id).catch(() => {}); } catch { /* non-fatal */ }
    toast.success(tr("planner.startedToast"));
    setTiming(null);
  };

  const isSameDayAsToday = (d) => d && new Date(d).toDateString() === new Date().toDateString();
  // Start a NEW running activity straight from the create sheet — the
  // classic Log form's "Active" mode. It runs until ended from the running
  // strip (or the dashboard pill) and then logs itself like any entry.
  // Starts at the chosen time when that's earlier today, else now; only
  // offered for today, since a timer is something happening now.
  const startNewNow = async () => {
    if (!timing?.create) return;
    const name = (timing.item.activity_name || "").trim();
    const catId = (timing.item.activity_category_ids || [])[0] || null;
    const cat = catId ? categories.find((c) => c.id === catId) : null;
    if (!name && !cat) return;
    let prepared = null;
    if (noteValue.trim()) {
      try { prepared = await prepareAuthoredText(noteValue.trim(), { alters, terms: t, surfaceLabel: "activity note" }); }
      catch (e) { if (isLogCommandError(e)) { toast.error(e.message); return; } throw e; }
      if (prepared === null) return;
    }
    const chosen = createWindow?.start;
    const startAt = chosen && chosen.getTime() <= Date.now() && isSameDayAsToday(chosen) ? chosen : new Date();
    addActiveActivity({
      categoryId: catId,
      name: name || cat?.name || "Activity",
      color: cat?.color || null,
      startTime: startAt.toISOString(),
      alterIds: prepared?.authorIds?.length ? prepared.authorIds : (timing.item.fronting_alter_ids || []),
      contactIds: timing.item.contact_ids || [],
      notes: prepared ? prepared.content : "",
    });
    setTiming(null);
    toast.success(tr("planner.startedNew", { name: name || cat?.name || "" }));
  };

  const saveNote = async (rawText) => {
    if (!timing) return;
    if (timing.create) return; // held in noteValue until commit
    try {
      let prepared;
      try { prepared = await prepareAuthoredText(rawText, { alters, terms: t, surfaceLabel: "plan note" }); }
      catch (e) { if (isLogCommandError(e)) { toast.error(e.message); return; } throw e; }
      if (prepared === null) return;
      const text = prepared.content;
      const patch = { notes: text, ...(prepared.authorIds.length ? { author_alter_ids: prepared.authorIds } : {}) };
      const members = seriesMembers();
      if (members.length > 1) await applyEditToSeries(members, patch);
      else {
        await base44.entities.Activity.update(timing.item.id, patch);
        await syncLinkedSleep(timing.item, patch);
      }
      await recordAuthoredText({ ...prepared, alters, sourceType: "activity", sourceId: timing.item.id, sourceLabel: "Plan note", navigatePath: `/planner?highlight=${timing.item.id}` });
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
    return format(when, "yyyy-MM-dd") >= format(new Date(), "yyyy-MM-dd");
  }, [timing, timeValue]);

  // The new entry's window, as dates — read by the who-was-fronting fill
  // and the "still fronting" switch.
  const createWindow = useMemo(() => {
    if (!timing?.create) return null;
    const [h, m] = String(timeValue).split(":").map(Number);
    const start = new Date(timing.day);
    start.setHours(h || 0, m || 0, 0, 0);
    const end = new Date(start.getTime() + Math.max(5, Number(durValue) || 60) * 60000);
    return { start, end };
  }, [timing?.create, timing?.day, timeValue, durValue]);
  // Who was fronting during the chosen time fills "Who" on a new entry —
  // what the classic Log Activity form did. Follows the time as it changes
  // until the person picks members themselves; a future window finds
  // nobody (an open session only reaches as far as now).
  useEffect(() => {
    if (!createWindow || timing?.whoTouched) return;
    const { start, end } = createWindow;
    const ids = new Set();
    for (const s of frontingHistory || []) {
      const ss = new Date(s.start_time);
      const se = s.end_time ? new Date(s.end_time) : new Date();
      if (!(ss < end && se > start)) continue;
      if (s.alter_id) ids.add(s.alter_id);
      if (s.primary_alter_id) ids.add(s.primary_alter_id);
      for (const id of (s.co_fronter_ids || [])) ids.add(id);
    }
    const next = [...ids];
    setTiming((prev) => {
      if (!prev?.create || prev.whoTouched) return prev;
      const cur = prev.item.fronting_alter_ids || [];
      if (cur.length === next.length && cur.every((x) => ids.has(x))) return prev;
      return { ...prev, item: { ...prev.item, fronting_alter_ids: next } };
    });
  }, [createWindow, frontingHistory, timing?.whoTouched]);
  // "Still fronting now" (classic Log form): saving an entry that has
  // started also records the members' fronting — an open session when they
  // are still here, a closed one over the entry's time when not. Starts on
  // only when the entry is happening now. null = follow that default.
  const [stillFrontingPick, setStillFrontingPick] = useState(null);
  useEffect(() => { setStillFrontingPick(null); }, [timing?.create, timing?.day]);
  const createHasStarted = !!createWindow && createWindow.start.getTime() <= Date.now();
  const stillFronting = stillFrontingPick ?? (!!createWindow && createWindow.end.getTime() >= Date.now() - 15 * 60000);
  const [recordFronting, setRecordFronting] = useState(false);
  useEffect(() => { setRecordFronting(false); }, [timing?.create, timing?.day]);
  // Writes the fronting the switch describes. Never duplicates: someone
  // already on front isn't opened again, and a member whose fronting
  // already covers the entry's time isn't given a second closed session.
  const recordFrontingFor = async (alterIds, start, end) => {
    if (!alterIds.length) return;
    const all = await base44.entities.FrontingSession.list();
    const idsOf = (s) => [s.alter_id, s.primary_alter_id, ...(s.co_fronter_ids || [])].filter(Boolean);
    const activeIds = new Set(all.filter((s) => s.is_active).flatMap(idsOf));
    for (const alterId of alterIds) {
      if (stillFronting) {
        if (activeIds.has(alterId)) continue;
        await base44.entities.FrontingSession.create({
          alter_id: alterId, is_primary: false, start_time: start.toISOString(), is_active: true,
        });
      } else {
        const covered = all.some((s) => idsOf(s).includes(alterId)
          && new Date(s.start_time) < end && (s.end_time ? new Date(s.end_time) : new Date()) > start);
        if (covered) continue;
        await base44.entities.FrontingSession.create({
          alter_id: alterId, is_primary: false, start_time: start.toISOString(),
          end_time: end.toISOString(), is_active: false,
        });
      }
    }
    qc.invalidateQueries({ queryKey: ["activeFront"] });
    qc.invalidateQueries({ queryKey: ["frontHistory"] });
    qc.invalidateQueries({ queryKey: ["frontingHistory"] });
  };

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

  // Series edit mode: the sheet was opened for "this and future", so every
  // field write fans out over the members (same helpers the classic modal
  // uses, so both UIs agree on reach).
  const seriesMembers = () => (timing?.seriesBranch
    ? membersForBranch(activities, timing.item, timing.seriesBranch)
    : [timing?.item].filter(Boolean));

  // Rename / recategorise write straight through, like the member toggle.
  // The colour picker fires on every drag step; write the record once the
  // pick settles (the editor shows the new colour straight away).
  const tagSaveTimer = useRef(null);
  const saveTagColorDebounced = (hex) => {
    const v = normalizeHex(hex || "") || null;
    setTiming((prev) => (prev ? { ...prev, item: { ...prev.item, tag_color: v } } : prev));
    if (timing?.create) return;
    clearTimeout(tagSaveTimer.current);
    tagSaveTimer.current = setTimeout(() => saveField({ tag_color: v }), 400);
  };
  useEffect(() => () => clearTimeout(tagSaveTimer.current), []);
  const saveField = async (patch) => {
    if (!timing) return;
    if (timing.create) {
      setTiming((prev) => (prev ? { ...prev, item: { ...prev.item, ...patch } } : prev));
      return;
    }
    try {
      const members = seriesMembers();
      if (members.length > 1) await applyEditToSeries(members, patch);
      else {
        await base44.entities.Activity.update(timing.item.id, patch);
        await syncLinkedSleep(timing.item, patch);
      }
      setTiming((prev) => (prev ? { ...prev, item: { ...prev.item, ...patch } } : prev));
      qc.invalidateQueries({ queryKey: ["activities"] });
    } catch (e) { toast.error(e.message || "Failed"); }
  };

  // Picking an activity in the create sheet also names the plan after it —
  // choosing an activity used to leave the title box untouched (and the
  // Plan button dead when it was empty). A hand-typed title survives: only
  // an empty box, this sheet's own previous auto-fill, or an abandoned
  // fragment of the picked name ("coo" → "Cooking") gets replaced.
  const changeWhat = async (ids) => {
    const next = Array.isArray(ids) ? ids : [];
    const patch = { activity_category_ids: next };
    if (timing?.create) {
      const prev = timing.item.activity_category_ids || [];
      const addedId = next.find((id) => !prev.includes(id));
      let cat = addedId ? categories.find((c) => c.id === addedId) : null;
      if (addedId && !cat) {
        // A just-created activity isn't in this query's cache yet.
        try { cat = await base44.entities.ActivityCategory.get(addedId); } catch { /* name fill is best-effort */ }
      }
      const cur = (timing.item.activity_name || "").trim();
      if (cat?.name && (!cur || cur === autoTitleRef.current
          || cat.name.toLowerCase().startsWith(cur.toLowerCase()))) {
        patch.activity_name = cat.name;
        autoTitleRef.current = cat.name;
      }
    }
    saveField(patch);
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
      await deleteLinkedSleep(item);
      qc.invalidateQueries({ queryKey: ["activities"] });
      qc.invalidateQueries({ queryKey: ["sleep"] });
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


  // "What is it?" also looks at the OPEN TO-DOS: typing "clean my car"
  // offers the to-do of that name to link, so logging the plan ticks the
  // to-do off too (owner spec). Offered, never auto-applied.
  const openTasks = useMemo(() => tasks.filter((x) => !(x.completed || x.is_complete)), [tasks]);
  const todoMatches = useMemo(() => {
    if (timing?.item?.task_id) return [];
    const q = (timing?.item?.activity_name || "").trim().toLowerCase();
    if (!q || q.length < 2) return [];
    const exact = [], starts = [], contains = [];
    for (const x of openTasks) {
      const n = (x.title || "").toLowerCase();
      if (!n) continue;
      if (n === q) exact.push(x); else if (n.startsWith(q)) starts.push(x); else if (n.includes(q)) contains.push(x);
    }
    return [...exact, ...starts, ...contains].slice(0, 4);
  }, [timing?.item?.activity_name, timing?.item?.task_id, openTasks]);
  const [todoPickerOpen, setTodoPickerOpen] = useState(false);
  const [todoQuery, setTodoQuery] = useState("");
  const todoCandidates = useMemo(() => {
    const q = todoQuery.trim().toLowerCase();
    const list = q ? openTasks.filter((x) => (x.title || "").toLowerCase().includes(q)) : openTasks;
    return list.slice(0, 40);
  }, [openTasks, todoQuery]);
  const linkTodo = (task) => {
    saveField({ task_id: task.id, ...(timing?.item?.activity_name ? {} : { activity_name: task.title }) });
    setTodoPickerOpen(false); setTodoQuery("");
  };

  // Arrows step by whatever the calendar shows (a day, a week, a month, a
  // year); the plans list has no date, insights follow the week.
  const stepAnchor = (dir) => {
    const v = section === "calendar" ? view : "week";
    setAnchor((d) => (v === "day" ? addDays(d, dir) : v === "month" ? addMonths(d, dir)
      : v === "year" ? addYears(d, dir) : addWeeks(d, dir)));
  };
  // The month/year calendars also show open to-dos (with a date) and
  // important dates from custom fields, as the tracker did.
  const { data: customFields = [] } = useQuery({
    queryKey: ["customFields"], queryFn: () => base44.entities.CustomField.list(),
  });
  // Birthdays and other date fields, labelled the way the user picked. The
  // day/week canvas shows them under each day's header too, so tapping a
  // day still says whose birthday it is.
  const importantDates = useMemo(() => {
    const byId = new Map(alters.map((a) => [a.id, a]));
    return collectAlterDates(alters, customFields).map((x) => {
      const a = byId.get(x.alterId);
      return { ...x, alterName: (a && formatAlter(a)) || x.alterName };
    });
  }, [alters, customFields, formatAlter]);
  const taskItems = useMemo(() => tasksAsCalendarItems(tasks), [tasks]);
  const activitiesWithTasks = useMemo(() => [...activities, ...taskItems], [activities, taskItems]);
  const openFromCalendar = (picked) => {
    const list = (Array.isArray(picked) ? picked : [picked]).filter(Boolean);
    const real = list.filter((x) => !x._isTask);
    if (real.length === 0 && list[0]?._task) { navigate(`/todo?id=${list[0]._task.id}`); return; }
    if (real.length === 1) { setDetails(real[0]); return; }
    // Several on one day: go to that day on the canvas, where each is a block.
    const when = real[0]?.timestamp ? new Date(real[0].timestamp) : null;
    if (when) { setAnchor(when); setView("day"); }
  };

  // Plain range rather than "w/c" — that's British shorthand for "week
  // commencing" and means nothing to most people.
  const weekLabel = useMemo(() => {
    const start = startOfWeek(anchor, { weekStartsOn: prefs.weekStartsOn });
    const end = new Date(start.getTime() + 6 * 86400000);
    const sameMonth = start.getMonth() === end.getMonth();
    return sameMonth
      ? `${format(start, "d")}–${format(end, "d MMM")}`
      : `${format(start, "d MMM")} – ${format(end, "d MMM")}`;
  }, [anchor, prefs.weekStartsOn]);
  const rangeLabel = (section === "calendar" && view === "day") ? format(anchor, "EEE d MMM")
    : (section === "calendar" && view === "month") ? format(anchor, "MMMM yyyy")
    : (section === "calendar" && view === "year") ? format(anchor, "yyyy")
    : weekLabel;
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

  // What the tapped hour holds — the classic grid's cell popover: entries
  // that overlap it, who was fronting, feelings logged, places saved.
  const cellSummary = useMemo(() => {
    if (!cellInfo) return null;
    const hourStartMin = Math.floor(cellInfo.min / 60) * 60;
    const from = new Date(cellInfo.day); from.setHours(0, 0, 0, 0); from.setMinutes(hourStartMin);
    const to = new Date(from.getTime() + 60 * 60000);
    const overlaps = (s, e) => s < to && e > from;
    const entries = activities.filter((a) => {
      if (!a?.timestamp) return false;
      const s = new Date(a.timestamp);
      const mins = Number(a.actual_duration_minutes) || Number(a.duration_minutes) || 0;
      const e = new Date(s.getTime() + Math.max(1, mins) * 60000);
      return overlaps(s, e);
    }).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    const alterById = new Map(alters.map((a) => [a.id, a]));
    const whoIds = new Set();
    for (const f of frontingHistory || []) {
      const s = new Date(f.start_time), e = f.end_time ? new Date(f.end_time) : new Date();
      if (!overlaps(s, e)) continue;
      [f.alter_id, f.primary_alter_id, ...(f.co_fronter_ids || [])].filter(Boolean).forEach((id) => whoIds.add(id));
    }
    const who = [...whoIds].map((id) => alterById.get(id)).filter(Boolean);
    const inHour = (ts) => { const d = ts ? new Date(ts) : null; return d && d >= from && d < to; };
    const feelings = [...new Set((emotionCheckIns || []).filter((c) => inHour(c.timestamp)).flatMap((c) => c.emotions || []))];
    const places = (locationRecords || []).filter((l) => inHour(l.timestamp));
    return { from, to, hourStartMin, entries, who, feelings, places };
  }, [cellInfo, activities, alters, frontingHistory, emotionCheckIns, locationRecords]);

  return (
    <div className={chrome ? "min-h-screen p-2 sm:p-4" : "flex flex-col min-h-0 h-full"}
      {...(chrome ? { "data-tour": "planner" } : {})}
      style={applyPageLook ? pageLook : undefined}
      {...(applyPageLook ? { "data-widget-content": true } : {})}>
      <div className={chrome ? "os-page-shell space-y-2" : "flex flex-col min-h-0 h-full"}>
        {chrome && (
          <div className="space-y-2">
            {/* Row 1: what you're looking at (calendar / plans / insights)
                plus page config — the tracker's three tabs, merged in. */}
            <div className="flex items-center justify-between gap-2">
              <div role="tablist" className="flex gap-0.5 p-0.5 rounded-lg bg-muted/40" data-tour="planner-sections">
                {[["calendar", tr("planner.section.calendar")], ["plans", tr("planner.plans")], ["insights", tr("planner.section.insights")]].map(([id, label]) => (
                  <button key={id} type="button" role="tab" aria-selected={section === id}
                    onClick={() => setSection(id)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                      section === id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    }`}>{label}</button>
                ))}
              </div>
              <div className="flex items-center gap-0.5">
                <Button variant="ghost" size="sm" onClick={() => setShowDisplay((v) => !v)}
                  aria-expanded={showDisplay} aria-label={tr("planner.display")} title={tr("planner.display")}>
                  <SlidersHorizontal className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => navigate("/activities")}
                  aria-label={tr("planner.manage")} title={tr("planner.manage")}>
                  <SettingsIcon className="w-4 h-4" />
                </Button>
                <Button size="sm" className="gap-1 h-8 ml-1" onClick={openCreateNow}
                  style={{ background: "var(--v2-accent)", color: "var(--v2-on-accent, #fff)" }}>
                  <Plus className="w-4 h-4" /> {tr("planner.new")}
                </Button>
              </div>
            </div>

            {/* Row 2: date navigation — steps by whatever the view shows. */}
            {section !== "plans" && (
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-0.5 min-w-0">
                  <Button variant="ghost" size="sm" aria-label={tr("planner.prev")} onClick={() => stepAnchor(-1)}>
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-sm font-medium tabular-nums whitespace-nowrap">{rangeLabel}</span>
                  <Button variant="ghost" size="sm" aria-label={tr("planner.next")} onClick={() => stepAnchor(1)}>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                  <button type="button" onClick={() => setAnchor(new Date())}
                    className="text-xs px-2.5 py-1 rounded-full border border-border/50 text-muted-foreground hover:text-foreground ml-1">
                    {tr("planner.today")}
                  </button>
                  {section === "calendar" && view === "week" && (
                    <span className="text-xs text-muted-foreground tabular-nums ml-1.5 whitespace-nowrap">{weekTotalLabel}</span>
                  )}
                </div>
                {section === "calendar" && (
                  <div className="flex gap-0.5 p-0.5 rounded-lg bg-muted/40">
                    {VIEWS.map((v) => (
                      <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                          view === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                        }`}>{tr(`planner.view.${v}`)}</button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Row 3: overlays — only where the time canvas draws them. */}
            {section === "calendar" && (view === "week" || view === "day") && (
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
                <button type="button" onClick={() => setOverlay("locations", overlays.locations === false)}
                  aria-pressed={overlays.locations !== false}
                  className={`text-xs px-2 py-1 rounded-full border flex items-center gap-1 ${
                    overlays.locations !== false ? "border-[var(--v2-accent)] bg-[color-mix(in_srgb,var(--v2-accent)_12%,transparent)] text-[var(--v2-accent)]" : "border-border/50 text-muted-foreground"
                  }`}>
                  <MapPin className="w-3 h-3" /> {tr("planner.overlay.locations")}
                </button>
              </div>
            )}
          </div>
        )}
        {/* Running activities (timers) — the same strip the dashboard and
            the old tracker showed, so a running one is never out of sight
            here. Renders nothing when nothing is running. */}
        {chrome && section === "calendar" && <CurrentActivities />}
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

        {chrome && section === "insights" && (
          <div className="space-y-4">
            <div className="rounded-lg border border-border/50 p-2 space-y-2 text-xs"
              style={{ borderRadius: "var(--v2-radius, 8px)" }}>
              <p className="font-semibold text-sm">{tr("planner.insights.week", { range: rangeLabel })}</p>
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
            </div>
            {/* The tracker's panels, moved here whole (goals with their
                editor, plan follow-through, the all-time tally) — each
                behind its own boundary so one bad record can't blank the
                rest, and the tally keeps its un-nesting recovery. */}
            <ErrorBoundary
              fallback={(err, reset) => <PanelError label={tr("planner.goals")} onRetry={reset} />}
              resetKeys={[activities.length]}>
              <ActivityGoalsPanel weekStart={weekRange.from} />
            </ErrorBoundary>
            <ErrorBoundary
              fallback={(err, reset) => <PanelError label={tr("planner.insights.followThrough")} onRetry={reset} />}
              resetKeys={[activities.length]}>
              <div className="space-y-2">
                <p className="font-semibold text-sm">{tr("planner.insights.followThrough")}</p>
                <PlanCompletionTracker />
              </div>
            </ErrorBoundary>
            <ErrorBoundary
              fallback={(err, reset) => <ActivityNestingRecovery error={err} onReset={reset} />}
              resetKeys={[activities.length]}>
              <ActivityTallyTracker activities={activities} />
            </ErrorBoundary>
          </div>
        )}
        {chrome && section === "plans" ? (
          <PlansList
            activities={activities}
            categories={categories}
            alters={alters}
            weekStartsOn={prefs.weekStartsOn}
            onOpen={(item, { series } = {}) => (series ? openEditor(item, { series: true }) : setDetails(item))}
            onDeleteSeries={(item) => setBranchAsk({ item })}
            onMassChange={async (kind, items) => {
              for (const it of items) {
                try {
                  if (kind === "delete") {
                    await base44.entities.Activity.delete(it.id);
                    await deleteLinkedSleep(it);
                  }
                  else await base44.entities.Activity.update(it.id, { status: "cancelled" });
                } catch { /* keep going — partial progress beats none */ }
              }
              qc.invalidateQueries({ queryKey: ["activities"] });
              toast.success(kind === "delete"
                ? tr("planner.massDeleted", { count: items.length })
                : tr("planner.massCancelled", { count: items.length }));
            }}
          />
        ) : chrome && section === "insights" ? null : chrome && view === "month" ? (
          <ActivityMonthView
            monthDate={anchor}
            activities={activitiesWithTasks}
            alters={alters}
            weekStartsOn={prefs.weekStartsOn}
            importantDates={importantDates}
            onDayClick={(d) => { setAnchor(d); setView("day"); }}
            onActivityClick={openFromCalendar}
            // Dragging across days plans ONE entry over the whole span (as
            // the tracker did): 9:00 on the first day to 10:00 on the last,
            // shown as start → end so both dates can be adjusted.
            onRangeSelect={(from, to) => {
              const a = new Date(from); a.setHours(0, 0, 0, 0);
              const b = new Date(to || from); b.setHours(0, 0, 0, 0);
              const days = Math.max(0, Math.round((b - a) / 86400000));
              openCreate(a, 9 * 60, days * MINUTES_PER_DAY + 10 * 60);
              if (days > 0) setTimeMode("range");
            }}
          />
        ) : chrome && view === "year" ? (
          <ActivityYearView
            yearDate={anchor}
            activities={activitiesWithTasks}
            weekStartsOn={prefs.weekStartsOn}
            onMonthClick={(d) => { setAnchor(d); setView("month"); }}
            onDayClick={(d) => { setAnchor(d); setView("day"); }}
          />
        ) : (
        <WeekCanvas
          onOpenLive={setLiveMenu}
          anchor={anchor}
          onOpenPage={onOpenPage}
          onSetPref={onSetPref}
          importantDates={importantDates}
          onOpenDate={(x) => navigate(`/alter/${x.alterId}`)}
          prefsOverride={prefsOverride}
          dayCount={effDayCount}
          maxHeight={maxHeight}
          fill={!chrome}
          activities={activities}
          tasks={taskItems}
          frontingHistory={frontingHistory}
          emotionCheckIns={emotionCheckIns}
          locations={locationRecords}
          onOpenPlace={(p) => navigate(`/location-history?highlight=${encodeURIComponent(p.id)}`)}
          alters={alters}
          categoryColor={catColor}
          overlays={overlays}
          onCreate={handleCreate}
          onOpenBlock={(item) => (item?._isTask ? navigate(`/todo?id=${item._task.id}`) : setDetails(item))}
          onResize={handleResize}
          // A tapped check-in dot lands on that entry in the log, highlighted.
          onOpenMark={(m) => { if (m?.id) navigate(`/checkin-log?id=${encodeURIComponent(m.id)}`); }}
          onOpenBand={(b, rect) => setBandInfo({ band: b, rect })}
          onAddToDay={(day) => setPlanDay(day)}
          onTapEmpty={chrome ? (day, min, rect) => setCellInfo({ day, min, rect }) : null}
          onOpenUntimed={(item, day) => (item?._isTask ? navigate(`/todo?id=${item._task.id}`) : setDetails({ ...item, _day: day }))}
        />
        )}
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
      {cellSummary && createPortal((
        <div className="fixed inset-0 z-[85]" onClick={() => setCellInfo(null)}>
          <div className="fixed bg-card border border-border rounded-xl shadow-xl p-3 w-64 space-y-2 text-xs max-h-[60vh] overflow-y-auto overscroll-contain"
            style={{
              left: Math.max(8, Math.min(cellInfo.rect.left - 20, window.innerWidth - 264)),
              top: Math.max(8, Math.min(cellInfo.rect.top + 8, window.innerHeight - 260)),
              borderRadius: "var(--v2-radius, 12px)",
            }}
            onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-semibold">
              {format(cellSummary.from, "EEE d MMM")} · {formatClock(cellSummary.hourStartMin, prefs.timeFmt)}–{formatClock(cellSummary.hourStartMin + 60, prefs.timeFmt)}
            </p>
            {cellSummary.entries.length > 0 && (
              <div className="space-y-0.5">
                {cellSummary.entries.map((a) => (
                  <button key={a.id} type="button" onClick={() => { setCellInfo(null); setDetails(a); }}
                    className="w-full flex items-center gap-1.5 px-1.5 py-1 rounded-lg border border-border/40 text-left hover:bg-muted/30">
                    <span className="w-1 self-stretch rounded-full flex-shrink-0" style={{ background: a.color || catColor(categoryIdOf(a)) || "var(--v2-accent)" }} />
                    <span className="flex-1 truncate">{a.activity_name || tr("planner.untitled")}</span>
                    <span className="text-muted-foreground tabular-nums">{formatClock(new Date(a.timestamp).getHours() * 60 + new Date(a.timestamp).getMinutes(), prefs.timeFmt)}</span>
                  </button>
                ))}
              </div>
            )}
            {cellSummary.who.length > 0 && (
              <p><span className="text-muted-foreground">{t.Fronting}: </span>{cellSummary.who.map((a) => formatAlter(a)).join(", ")}</p>
            )}
            {cellSummary.feelings.length > 0 && (
              <p><span className="text-muted-foreground">{tr("planner.feelings")}: </span>{cellSummary.feelings.join(", ")}</p>
            )}
            {cellSummary.places.length > 0 && (
              <p><span className="text-muted-foreground">{tr("planner.location")}: </span>{cellSummary.places.map((l) => l.name || "📍").join(", ")}</p>
            )}
            {!cellSummary.entries.length && !cellSummary.who.length && !cellSummary.feelings.length && !cellSummary.places.length && (
              <p className="text-muted-foreground">{tr("planner.cellEmpty")}</p>
            )}
            <button type="button"
              onClick={() => { const c = cellInfo; setCellInfo(null); openCreate(c.day, cellSummary.hourStartMin, cellSummary.hourStartMin + 60); }}
              className="w-full text-xs px-2.5 py-1.5 rounded-full border border-[var(--v2-accent)] text-[var(--v2-accent)] flex items-center justify-center gap-1">
              <Plus className="w-3 h-3" />{tr("planner.addHere")}
            </button>
          </div>
        </div>
      ), document.body)}
      {/* DETAILS — what this entry IS, in plain reading form. Tapping a
          block lands here; Edit opens the editor (owner spec: "a little
          details view ... in a non-edit, easy to read form"). */}
      {/* Details — the SHARED sheet (also used by the Today widget), so a
          plan reads and resolves the same wherever you tap it. */}
      {liveMenu && (
        <ActivityActionMenu activity={liveMenu} onClose={() => setLiveMenu(null)} />
      )}
      <PlanDetailsSheet
        item={details}
        onClose={() => setDetails(null)}
        onEdit={(it) => openEditor(it, { day: it._day || null })}
        onStartNow={async (it, startedAt) => {
          // The shared start (the home notice's too). This used to set the
          // sheet's state and call its start a tick later — with the stale
          // closure, where nothing was open, so nothing started.
          setDetails(null);
          try {
            await startPlanActive(it, { startedAt: startedAt || new Date(), categories });
            toast.success(tr("planner.startedToast"));
          } catch (e) { toast.error(e?.message || "Failed"); }
        }}
        onReschedule={(it) => rescheduleFromDetails(it)}
      />
      {timing && createPortal((
        <div className="fixed inset-0 z-[70] bg-black/50 flex items-end sm:items-center justify-center"
          style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "calc(var(--bottom-nav-height, 56px) + var(--os-sab))" }}
          onClick={(e) => { if (e.target === e.currentTarget) requestCloseEditor(); }}>
          {/* Close-with-changes prompt — the editor writes through as you
              edit, so leaving must say so and offer the way back. */}
          {closeAsk && (
            <div className="absolute inset-0 z-[75] bg-black/50 flex items-center justify-center px-6"
              onClick={(e) => e.stopPropagation()}>
              <div className="bg-card w-full max-w-xs rounded-2xl border border-border p-4 space-y-3"
                style={{ borderRadius: "var(--v2-radius, 16px)" }}>
                <p className="text-sm font-semibold">{tr("planner.closeAskTitle")}</p>
                <p className="text-xs text-muted-foreground">{tr("planner.closeAskBody")}</p>
                <div className="flex flex-col gap-1.5">
                  <button type="button" onClick={() => { setCloseAsk(false); setTiming(null); }}
                    className="text-sm px-3 py-2 rounded-xl bg-[var(--v2-accent)] text-white font-medium">
                    {tr("planner.keepChanges")}
                  </button>
                  <button type="button" onClick={undoEditorChanges}
                    className="text-sm px-3 py-2 rounded-xl border border-destructive/50 text-destructive">
                    {tr("planner.undoChanges")}
                  </button>
                  <button type="button" onClick={() => setCloseAsk(false)}
                    className="text-sm px-3 py-2 rounded-xl border border-border/60 text-muted-foreground">
                    {tr("planner.keepEditing")}
                  </button>
                </div>
              </div>
            </div>
          )}
          {/* A sheet taller than the screen must scroll, not overflow off the
              top — with member list, notes and outcomes it can exceed a short
              viewport. */}
          <div className="bg-card w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl border border-border p-3 space-y-3 max-h-full overflow-y-auto overscroll-contain"
            style={{ borderRadius: "var(--v2-radius, 16px)" }}>
            <div className="flex items-start justify-between gap-2">
              <button type="button" onClick={requestCloseEditor} aria-label={tr("planner.close")} title={tr("planner.close")}
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
              <p className="text-[0.6875em] flex items-center gap-1"
                style={timing.seriesBranch ? { color: "var(--v2-accent)" } : undefined}>
                <Repeat className="w-3 h-3 flex-shrink-0" />
                {timing.seriesBranch
                  ? tr("planner.seriesFuture", { count: membersForBranch(activities, timing.item, timing.seriesBranch).length })
                  : tr("planner.series")}
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
                  <>
                  <span className="text-xs px-2.5 py-1 rounded-full border border-[var(--v2-accent)] text-[var(--v2-accent)] flex items-center gap-1">
                    <Play className="w-3 h-3" />{tr("planner.inProgress")}
                  </span>
                  <button type="button" onClick={pauseNow}
                    className="text-xs px-2.5 py-1 rounded-full border border-border/60 text-muted-foreground hover:text-foreground flex items-center gap-1">
                    <Pause className="w-3 h-3" />{tr("planner.pause")}
                  </button>
                  </>
                ) : (
                  <button type="button" aria-pressed={timeAsk === "start"}
                    onClick={() => setTimeAsk(timeAsk === "start" ? null : "start")}
                    className="text-xs px-2.5 py-1 rounded-full border border-[var(--v2-accent)] text-[var(--v2-accent)] flex items-center gap-1">
                    <Play className="w-3 h-3" />{tr("planner.startNow")}
                  </button>
                ))}
                {[["done", tr("planner.done")], ["partial", tr("planner.partial")],
                  ["skipped", tr("planner.skipped")], ["cancelled", tr("planner.cancelled")]].map(([id, label]) => (
                  <button key={id} type="button" aria-pressed={timing.item.status === id || (id === "done" && timeAsk === "end")}
                    onClick={() => (id === "done" ? setTimeAsk(timeAsk === "end" ? null : "end") : setOutcome(id))}
                    className={`text-xs px-2.5 py-1 rounded-full border ${
                      timing.item.status === id || (id === "done" && timeAsk === "end")
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
              {timeAsk && (
                <PlanTimeChoice kind={timeAsk} item={timing.item}
                  onPick={(d) => { const ask = timeAsk; setTimeAsk(null); if (ask === "start") startNow(d); else setOutcome("done", d); }} />
              )}
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
            {/* TO-DO — link this entry to a to-do so finishing one finishes
                the other. Auto-detected from the title; the picker is
                searchable because a to-do list is unbounded. */}
            <div className="space-y-1">
              {(() => {
                const linked = timing.item.task_id ? tasks.find((x) => x.id === timing.item.task_id) : null;
                if (linked) {
                  return (
                    <div className="flex items-center gap-2 text-xs">
                      <CheckSquare className="w-3.5 h-3.5 text-[var(--v2-accent)] flex-shrink-0" />
                      <span className="flex-1 min-w-0 truncate">{linked.title}</span>
                      <button type="button" onClick={() => saveField({ task_id: null })}
                        className="text-[0.6875em] px-2 py-0.5 rounded-full border border-border/50 text-muted-foreground hover:text-foreground flex-shrink-0">
                        {tr("planner.unlinkTodo")}
                      </button>
                    </div>
                  );
                }
                return (
                  <>
                    {todoMatches.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="text-[0.6875em] text-muted-foreground">{tr("planner.todoMatchHint")}</span>
                        {todoMatches.map((x) => (
                          <button key={x.id} type="button" onClick={() => linkTodo(x)}
                            className="text-[0.6875em] px-2 py-0.5 rounded-full border border-border/50 hover:text-foreground flex items-center gap-1">
                            <CheckSquare className="w-2.5 h-2.5" />{x.title}
                          </button>
                        ))}
                      </div>
                    )}
                    <button type="button" onClick={() => setTodoPickerOpen((v) => !v)}
                      aria-expanded={todoPickerOpen}
                      className="text-[0.6875em] px-2 py-0.5 rounded-full border border-border/50 text-muted-foreground hover:text-foreground flex items-center gap-1">
                      <CheckSquare className="w-2.5 h-2.5" />{tr("planner.linkTodo")}
                    </button>
                    {todoPickerOpen && (
                      <div className="space-y-1 pt-0.5">
                        <input value={todoQuery} onChange={(e) => setTodoQuery(e.target.value)}
                          placeholder={tr("planner.linkTodo")}
                          className="w-full h-8 px-2 rounded-lg border border-input bg-background text-xs" />
                        <div className="max-h-32 overflow-y-auto overscroll-contain space-y-0.5">
                          {todoCandidates.length === 0 && (
                            <p className="text-[0.6875em] text-muted-foreground px-1 py-1">{tr("planner.noPlans")}</p>
                          )}
                          {todoCandidates.map((x) => (
                            <button key={x.id} type="button" onClick={() => linkTodo(x)}
                              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg border border-border/40 text-left text-xs hover:bg-muted/30">
                              <CheckSquare className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                              <span className="flex-1 truncate">{x.title}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
            {nameMatches.length > 0 && !categoryIdOf(timing.item) && (
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-[0.6875em] text-muted-foreground">{tr("planner.matchHint")}</span>
                {nameMatches.map((c) => (
                  <button key={c.id} type="button"
                    onClick={() => changeWhat([c.id])}
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
                  onActivityChange={changeWhat}
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
                  const isPrimary = new Date(timing.day).toDateString() === d.toDateString();
                  const inExtra = !!timing.create && extraDays.some((x) => x.toDateString() === d.toDateString());
                  const on = isPrimary || inExtra;
                  return (
                    <button key={i} type="button" aria-pressed={on}
                      onClick={() => {
                        // Editing moves the entry (single-select). Creating
                        // TOGGLES days — the plan lands on every lit chip,
                        // one record per day (a twice-this-week plan, not a
                        // recurring series). The last lit day can't be
                        // un-toggled; removing the primary promotes the
                        // earliest extra so the date field stays honest.
                        if (!timing.create) { setTiming((prev) => ({ ...prev, day: d })); return; }
                        if (inExtra) {
                          setExtraDays((prev) => prev.filter((x) => x.toDateString() !== d.toDateString()));
                        } else if (!isPrimary) {
                          setExtraDays((prev) => [...prev, d]);
                        } else if (extraDays.length) {
                          const sorted = [...extraDays].sort((a, b) => a - b);
                          setTiming((prev) => ({ ...prev, day: sorted[0] }));
                          setExtraDays(sorted.slice(1));
                        }
                      }}
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
              // as a new duration (never negative). Typing an end TIME before
              // the start rolls to the next day — what people mean at
              // midnight. Picking an end DATE never rolls: moving the end
              // back to the start's day used to bounce straight back to the
              // next day (the old end time was before the start), so the
              // date could never be set (owner report). The end lands just
              // after the start instead, ready for the time to be typed.
              const startDt = (() => { const d = new Date(timing.day); const [h, m] = String(timeValue).split(":").map(Number); d.setHours(h || 0, m || 0, 0, 0); return d; })();
              const endDt = new Date(startDt.getTime() + Math.max(5, Number(durValue) || 60) * 60000);
              const pad = (n) => String(n).padStart(2, "0");
              const endDate = `${endDt.getFullYear()}-${pad(endDt.getMonth() + 1)}-${pad(endDt.getDate())}`;
              const endTime = `${pad(endDt.getHours())}:${pad(endDt.getMinutes())}`;
              const commitEnd = (dateStr, timeStr, { dateEdit = false } = {}) => {
                const [y, mo, da] = dateStr.split("-").map(Number);
                const [h, mi] = timeStr.split(":").map(Number);
                if (!y || !mo || !da) return;
                let end = new Date(y, mo - 1, da, h || 0, mi || 0, 0, 0);
                if (end <= startDt) {
                  end = dateEdit
                    ? new Date(startDt.getTime() + 5 * 60000)
                    : new Date(end.getTime() + 86400000);
                }
                setDurValue(Math.max(5, Math.round((end - startDt) / 60000)));
              };
              const crossesDay = endDt.toDateString() !== startDt.toDateString();
              return (
                <div className="flex items-end gap-2">
                  <label className="flex-1 text-xs text-muted-foreground">
                    {tr("planner.endsAt")}
                    <div className="mt-1 flex gap-1">
                      <input type="date" value={endDate} onChange={(e) => commitEnd(e.target.value, endTime, { dateEdit: true })}
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
              <DetailChip open={withOpenEff} has={withHas} onToggle={() => setWithOpen(!withOpenEff)} label={tr("planner.with")} />
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
              <DetailChip open={tagOpenEff} has={tagHas} onToggle={() => setTagOpen(!tagOpenEff)} label={tr("planner.colorTag")} />
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
              {timing.create && createHasStarted && (timing.item.fronting_alter_ids || []).length > 0 && (
                <div className="mt-2 space-y-1.5">
                  <label className="flex items-center justify-between gap-2 text-xs">
                    <span>{tr("planner.recordFronting", { fronting: t.fronting })}</span>
                    <Switch checked={recordFronting} onCheckedChange={setRecordFronting}
                      aria-label={tr("planner.recordFronting", { fronting: t.fronting })} />
                  </label>
                  {recordFronting && (
                    <>
                      <label className="flex items-center justify-between gap-2 text-xs">
                        <span>{tr("planner.stillFrontingNow", { fronting: t.fronting })}</span>
                        <Switch checked={stillFronting} onCheckedChange={setStillFrontingPick}
                          aria-label={tr("planner.stillFrontingNow", { fronting: t.fronting })} />
                      </label>
                      <p className="text-[0.6875em] text-muted-foreground">
                        {stillFronting
                          ? tr("planner.stillFrontingOn", { front: t.front, fronting: t.fronting })
                          : tr("planner.stillFrontingOff", { fronting: t.fronting })}
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>
            )}
            {withOpenEff && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">{tr("planner.withHint")}</p>
              <ContactMultiSelectList
                selectedContactIds={timing.item.contact_ids || []}
                onChange={(ids) => saveField({ contact_ids: ids })}
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
                signposts
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
                        {RECURRENCE_INTERVALS.map((iv) => (
                          <button key={iv} type="button" aria-pressed={recur.interval === iv}
                            onClick={() => setRecur((r) => ({ ...r, interval: iv, count: clampOccurrenceCount(iv, r.count) }))}
                            className={`text-xs px-2.5 py-1 rounded-full border ${
                              recur.interval === iv
                                ? "text-[var(--v2-accent)] border-[var(--v2-accent)]"
                                : "border-border/50 text-muted-foreground"
                            }`}>{tr(`planner.repeat.${iv}`)}</button>
                        ))}
                      </div>
                      {recur.interval !== "none" && (
                        <label className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                          {tr(recur.interval === "yearly" ? "planner.repeatYears" : "planner.repeatCount")}
                          <input type="number" min={1} max={maxOccurrences(recur.interval)} value={recur.count}
                            data-testid="plan-repeat-count"
                            onChange={(e) => {
                              const n = parseInt(e.target.value, 10);
                              setRecur((r) => ({ ...r, count: clampOccurrenceCount(r.interval, n) }));
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

                  {tagOpenEff && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">{tr("planner.colorTagHint")}</p>
                    <PlanColorTagPicker value={timing.item.tag_color || null} onChange={saveTagColorDebounced} />
                  </div>
                  )}
            </div>

            {timing.create ? (
              <div className="flex gap-2">
                <Button size="sm" className="flex-1" disabled={!(timing.item.activity_name || "").trim()}
                  onClick={commitCreate}>
                  {(createIsPlan ? tr("planner.plan") : tr("planner.log"))
                    + (extraDays.length ? ` ×${extraDays.length + 1}` : "")}
                </Button>
                {/* Start a timer instead — only for a single entry that
                    isn't repeating (a running session is one thing, now). */}
                {!extraDays.length && recur.interval === "none" && isSameDayAsToday(timing.day) && (
                  <Button size="sm" variant="outline" className="gap-1"
                    disabled={!(timing.item.activity_name || "").trim()}
                    onClick={startNewNow}>
                    <Play className="w-3.5 h-3.5" />{tr("planner.startTimer")}
                  </Button>
                )}
              </div>
            ) : timingDirty && (
              <>
                {timing.item.status === "scheduled" && timing.item.timestamp && (
                  <label className="flex items-center justify-between gap-2 text-xs">
                    <span>{tr("planner.countAsReschedule")}</span>
                    <Switch checked={countReschedule} onCheckedChange={setCountReschedule}
                      aria-label={tr("planner.countAsReschedule")} />
                  </label>
                )}
                <Button size="sm" className="w-full" onClick={applyTime}>
                  {timing.item.timestamp
                    ? (timing.item.status === "scheduled" && countReschedule ? tr("planner.reschedule") : tr("planner.saveTime"))
                    : tr("planner.giveTime")}
                </Button>
              </>
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
          style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "calc(var(--bottom-nav-height, 56px) + var(--os-sab))" }}
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
