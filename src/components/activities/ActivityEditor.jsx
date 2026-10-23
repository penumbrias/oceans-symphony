// THE activity editor — one sheet for logging, starting and planning an
// activity, and for editing one that exists (owner, 2026-10-23: the
// planner's log page was rough and confusing next to the quick-actions
// logger; every logging popup should work the same and offer everything).
//
// Every door opens this: the planner (hold/drag, tap empty, +, Edit on a
// plan's details), the quick actions bar's "Start an activity", the
// board's tracker widgets, and a to-do's "More options". It replaced the
// planner's inline sheet, ActivityLogModal, StartActivityModal's form and
// ActivityPlanModal.
//
// The quick logger's simplicity is the model: ask ONE question first —
// "Already happened / Still going / Coming up" — then show only what fits.
// The answer decides what's saved (lib/activityEntry), never the clock.
// The length is given by duration OR end time (ActivityWhenField).
// Everything optional sits behind "+" chips that open themselves when they
// already hold something.
//
// Editing writes field by field (the planner's model) with the
// close-with-changes prompt as the safety net; the time is applied with
// one explicit button so a reschedule is always a decision.
//
// request:
//   { create: true, start: Date, minutes?, mode?, name?, notes?,
//     categoryIds?, alterIds?, untimed?, taskId? }
//   { item, day?, series?, focusDay? }        — edit an existing entry

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, startOfWeek } from "date-fns";
import { toast } from "sonner";
import { CheckSquare, ChevronLeft, FolderTree, MapPin, Minus, Pause, Play, Plus, Repeat } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { confirm } from "@/components/shared/ConfirmDialog";
import MentionTextarea from "@/components/shared/MentionTextarea";
import AlterSortToggle from "@/components/shared/AlterSortToggle";
import ActivityPillSelector from "@/components/activities/ActivityPillSelector";
import PlanColorTagPicker from "@/components/activities/PlanColorTagPicker";
import ActivityWhenField from "@/components/activities/ActivityWhenField";
import PlanTimeChoice from "@/components/planner/PlanTimeChoice";
import { ContactMultiSelectList } from "@/components/contacts/ContactMultiSelect";
import { SearchableMultiList } from "@/v2/widgets";
import { prepareAuthoredText, recordAuthoredText, isLogCommandError } from "@/lib/authoredText";
import { createActivityEntry, defaultModeFor, ENTRY_MODES } from "@/lib/activityEntry";
import { LEAD_STEPS, DEFAULT_LEAD_STEPS } from "@/lib/criticalPins";
import {
  PLAN_REMINDER_OFFSETS, readPlanRemindersEnabled, writePlanRemindersEnabled, cancelPlanReminder,
} from "@/lib/planReminderScheduler";
import { getActiveActivities, addActiveActivity } from "@/lib/activitySession";
import {
  RECURRENCE_BRANCHES, RECURRENCE_INTERVALS, maxOccurrences, clampOccurrenceCount,
  membersForBranch, deleteSeries, applyEditToSeries,
} from "@/lib/recurrenceUtils";
import { resolveOutcome } from "@/lib/planner/resolvePlan";
import { previousActivityEnd } from "@/lib/planner/previousEnd";
import { categoryIdOf } from "@/lib/planner/rollup";
import { syncLinkedSleep, deleteLinkedSleep } from "@/lib/planner/linkedSleep";
import { statusFor, ACTIVITY_STATUSES } from "@/lib/activityStatus";
import { normalizeHex } from "@/lib/planTagColor";
import { isNative } from "@/lib/platform";
import { useTerms } from "@/lib/useTerms";
import { useT } from "@/lib/i18n";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { useAlterSorter } from "@/lib/alterSort";
import { groupedAlterSections } from "@/lib/alterSections";

const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage off */ } };

const chipCls = (on) => `text-xs px-2.5 py-1 rounded-full border ${
  on ? "text-[var(--v2-accent)] border-[var(--v2-accent)]" : "border-border/50 text-muted-foreground"
}`;

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

const SectionLabel = ({ children }) => (
  <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground -mb-1">{children}</p>
);

// Delete a series member: how far does it reach? Shared with the planner's
// plans list, so both ask the same question with the same helpers.
export function SeriesDeleteSheet({ item, activities, onClose, onDeleted }) {
  const tr = useT();
  const qc = useQueryClient();
  if (!item) return null;
  const run = async (branch) => {
    onClose?.();
    try {
      const members = branch === RECURRENCE_BRANCHES.THIS_ONLY ? [item] : membersForBranch(activities, item, branch);
      const count = await deleteSeries(members);
      qc.invalidateQueries({ queryKey: ["activities"] });
      toast.success(tr("planner.deletedCount", { count }));
      onDeleted?.();
    } catch (e) { toast.error(e.message || "Failed"); }
  };
  return createPortal((
    <div className="fixed inset-0 z-[80] bg-black/50 flex items-end sm:items-center justify-center"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "calc(var(--bottom-nav-height, 56px) + var(--os-sab))" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="bg-card w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl border border-border p-4 space-y-2"
        style={{ borderRadius: "var(--v2-radius, 16px)" }}>
        <p className="text-sm font-semibold">{tr("planner.branchTitle")}</p>
        <p className="text-xs text-muted-foreground">
          {tr("planner.branchBody", { name: item.activity_name || tr("planner.untitled") })}
        </p>
        {[
          [RECURRENCE_BRANCHES.THIS_ONLY, tr("planner.branchThis")],
          [RECURRENCE_BRANCHES.THIS_AND_FUTURE, tr("planner.branchFuture")],
          [RECURRENCE_BRANCHES.ALL, tr("planner.branchAll")],
        ].map(([branch, label]) => (
          <Button key={branch} size="sm" variant="outline" className="w-full justify-start" onClick={() => run(branch)}>
            {label}
          </Button>
        ))}
        <Button size="sm" variant="ghost" className="w-full" onClick={onClose}>{tr("planner.cancel")}</Button>
      </div>
    </div>
  ), document.body);
}

const EDIT_GUARD_FIELDS = ["activity_name", "notes", "fronting_alter_ids", "activity_category_ids",
  "parent_category_id", "location", "is_critical", "contact_ids", "color", "tag_color", "timestamp",
  "duration_minutes", "actual_duration_minutes", "task_id"];

export default function ActivityEditor({ request, onClose, onSaved = null, weekStartsOn = 1 }) {
  const t = useTerms();
  const tr = useT();
  const qc = useQueryClient();
  const formatAlter = useAlterLabel();

  const { data: activities = [] } = useQuery({ queryKey: ["activities"], queryFn: () => base44.entities.Activity.list(), enabled: !!request });
  const { data: categories = [] } = useQuery({ queryKey: ["activityCategories"], queryFn: () => base44.entities.ActivityCategory.list(), enabled: !!request });
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list(), enabled: !!request });
  const { data: tasks = [] } = useQuery({ queryKey: ["tasks"], queryFn: () => base44.entities.Task.list(), enabled: !!request });
  const { data: groups = [] } = useQuery({ queryKey: ["groups"], queryFn: () => base44.entities.Group.list(), enabled: !!request });
  const { data: frontingHistory = [] } = useQuery({
    queryKey: ["frontingHistory"], queryFn: () => base44.entities.FrontingSession.list(),
    enabled: !!request?.create,
  });

  // ── The entry being edited (or the unsaved draft) ──────────────────
  const [entry, setEntry] = useState(null); // { create, item, seriesBranch, snapshot, whoTouched }
  const [start, setStart] = useState(() => new Date());
  const [minutes, setMinutes] = useState(60);
  const [untimed, setUntimed] = useState(false);
  const [mode, setMode] = useState(ENTRY_MODES.DONE);
  const [noteValue, setNoteValue] = useState("");
  const [recur, setRecur] = useState({ interval: "none", count: 8 });
  const [extraDays, setExtraDays] = useState([]);
  const [extra, setExtra] = useState({ is_critical: false, critical_lead_steps: DEFAULT_LEAD_STEPS, reminder_offset_minutes: null, location: "" });
  const [open, setOpen] = useState({}); // detail chip → true/false (absent = follow the value)
  const [whatOpen, setWhatOpen] = useState(false);
  const [todoPickerOpen, setTodoPickerOpen] = useState(false);
  const [todoQuery, setTodoQuery] = useState("");
  const [recordFronting, setRecordFronting] = useState(false);
  const [stillFrontingPick, setStillFrontingPick] = useState(null);
  const [closeAsk, setCloseAsk] = useState(false);
  const [branchAsk, setBranchAsk] = useState(null);
  const [timeAsk, setTimeAsk] = useState(null);
  const [countReschedule, setCountReschedule] = useState(true);
  const [planRemOn, setPlanRemOn] = useState(() => readPlanRemindersEnabled());
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const autoTitleRef = useRef("");
  const dayInputRef = useRef(null);
  const tagSaveTimer = useRef(null);
  useEffect(() => () => clearTimeout(tagSaveTimer.current), []);

  // Seed from the request each time a new one arrives.
  useEffect(() => {
    if (!request) { setEntry(null); return; }
    setOpen({}); setCloseAsk(false); setBranchAsk(null); setTimeAsk(null); setCountReschedule(true);
    setTodoPickerOpen(false); setTodoQuery(""); setRecordFronting(false); setStillFrontingPick(null);
    setRecur({ interval: "none", count: 8 }); setExtraDays([]);
    autoTitleRef.current = "";
    if (request.create) {
      const s = request.start instanceof Date ? request.start : new Date();
      setStart(s);
      setMinutes(request.minutes === undefined ? 60 : request.minutes);
      setUntimed(!!request.untimed);
      setMode(request.mode || defaultModeFor(s));
      setNoteValue(request.notes || "");
      setExtra({ is_critical: false, critical_lead_steps: DEFAULT_LEAD_STEPS, reminder_offset_minutes: null, location: "" });
      setWhatOpen(false);
      setEntry({
        create: true,
        whoTouched: !!(request.alterIds && request.alterIds.length),
        item: {
          activity_name: request.name || "",
          activity_category_ids: request.categoryIds || [],
          fronting_alter_ids: request.alterIds || [],
          contact_ids: [],
          task_id: request.taskId || null,
          tag_color: null,
        },
      });
      return;
    }
    const item = request.item;
    const s = item.timestamp ? new Date(item.timestamp)
      : request.day ? new Date(request.day)
      : item.planned_date ? (() => { const d = new Date(item.planned_date); d.setHours(9, 0, 0, 0); return d; })()
      : new Date();
    if (!item.timestamp && request.day) s.setHours(9, 0, 0, 0);
    setStart(s);
    setMinutes(Number(item.actual_duration_minutes) || Number(item.duration_minutes) || null);
    setUntimed(!item.timestamp);
    setNoteValue(item.notes || "");
    setExtra({
      is_critical: !!item.is_critical,
      critical_lead_steps: item.critical_lead_steps || DEFAULT_LEAD_STEPS,
      reminder_offset_minutes: item.reminder_offset_minutes ?? null,
      location: item.location || "",
    });
    setWhatOpen(false);
    setEntry({
      create: false, item,
      seriesBranch: request.series ? RECURRENCE_BRANCHES.THIS_AND_FUTURE : null,
      snapshot: { ...item },
    });
    if (request.focusDay) {
      setTimeout(() => {
        const el = dayInputRef.current;
        if (!el) return;
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        try { el.showPicker(); } catch { el.focus(); }
      }, 150);
    }
  }, [request]);

  const create = !!entry?.create;
  const item = entry?.item || {};
  const status = create ? null : statusFor(item);
  const isPlanLike = create ? mode === ENTRY_MODES.PLAN : status !== ACTIVITY_STATUSES.LOGGED;
  const canPlanExtras = create ? mode === ENTRY_MODES.PLAN : status === ACTIVITY_STATUSES.SCHEDULED;

  // ── Who: fill from fronting history for the chosen time ───────────
  const createWindow = useMemo(() => {
    if (!create || mode === ENTRY_MODES.PLAN) return null;
    const end = mode === ENTRY_MODES.NOW ? new Date() : new Date(start.getTime() + (Number(minutes) || 0) * 60000);
    return { start, end };
  }, [create, mode, start, minutes]);
  useEffect(() => {
    if (!createWindow || entry?.whoTouched) return;
    const ids = new Set();
    for (const s of frontingHistory || []) {
      const ss = new Date(s.start_time);
      const se = s.end_time ? new Date(s.end_time) : new Date();
      if (!(ss < (createWindow.end > createWindow.start ? createWindow.end : new Date(createWindow.start.getTime() + 60000)) && se > createWindow.start)) continue;
      if (s.alter_id) ids.add(s.alter_id);
      if (s.primary_alter_id) ids.add(s.primary_alter_id);
      for (const id of (s.co_fronter_ids || [])) ids.add(id);
    }
    const next = [...ids];
    setEntry((prev) => {
      if (!prev?.create || prev.whoTouched) return prev;
      const cur = prev.item.fronting_alter_ids || [];
      if (cur.length === next.length && cur.every((x) => ids.has(x))) return prev;
      return { ...prev, item: { ...prev.item, fronting_alter_ids: next } };
    });
  }, [createWindow, frontingHistory, entry?.whoTouched]);
  const stillFronting = stillFrontingPick ?? (mode === ENTRY_MODES.NOW
    || (!!createWindow && createWindow.end.getTime() >= Date.now() - 15 * 60000));

  const prevEnd = useMemo(() => {
    if (!entry) return null;
    const before = !create && item.timestamp ? new Date(item.timestamp) : new Date();
    return previousActivityEnd(activities, { before, excludeId: item.id || null });
  }, [activities, entry, create, item.timestamp, item.id]);

  // ── Member list (searchable, fronters first, optional group view) ──
  const sorter = useAlterSorter("symphony_planner_alter_sort");
  const [whoGrouped, setWhoGrouped] = useState(() => lsGet("symphony_planner_who_grouped", false));
  const toggleWhoGrouped = () => setWhoGrouped((v) => { lsSet("symphony_planner_who_grouped", !v); return !v; });
  const toMemberOption = useMemo(() => (a) => ({ id: a.id, label: formatAlter(a), color: a.color, avatarUrl: a.avatar_url }), [formatAlter]);
  const memberSections = useMemo(
    () => (whoGrouped ? groupedAlterSections({ alters, groups, sort: sorter.sort, toOption: toMemberOption }) : undefined),
    [whoGrouped, alters, groups, sorter, toMemberOption]
  );
  const memberOptions = useMemo(
    () => sorter.sort(alters.filter((a) => !a.is_archived)).map(toMemberOption),
    [alters, sorter, toMemberOption]
  );

  // ── Writes for an existing entry (field by field) ─────────────────
  const seriesMembers = () => (entry?.seriesBranch
    ? membersForBranch(activities, item, entry.seriesBranch)
    : [entry?.item].filter(Boolean));
  const patchLocal = (patch) => setEntry((prev) => (prev ? { ...prev, item: { ...prev.item, ...patch } } : prev));
  const saveField = async (patch) => {
    if (!entry) return;
    if (create) { patchLocal(patch); return; }
    try {
      const members = seriesMembers();
      if (members.length > 1) await applyEditToSeries(members, patch);
      else {
        await base44.entities.Activity.update(item.id, patch);
        await syncLinkedSleep(item, patch);
      }
      patchLocal(patch);
      qc.invalidateQueries({ queryKey: ["activities"] });
    } catch (e) { toast.error(e.message || "Failed"); }
  };
  const saveTagColorDebounced = (hex) => {
    const v = normalizeHex(hex || "") || null;
    patchLocal({ tag_color: v });
    if (create) return;
    clearTimeout(tagSaveTimer.current);
    tagSaveTimer.current = setTimeout(() => saveField({ tag_color: v }), 400);
  };
  const saveNote = async (rawText) => {
    if (!entry || create) return; // held in noteValue until the save
    try {
      let prepared;
      try { prepared = await prepareAuthoredText(rawText || "", { alters, terms: t, surfaceLabel: "plan note" }); }
      catch (e) { if (isLogCommandError(e)) { toast.error(e.message); return; } throw e; }
      if (prepared === null) return;
      const patch = { notes: (prepared.content || "").trim() || null };
      if (prepared.authorIds?.length) patch.author_alter_ids = prepared.authorIds;
      await base44.entities.Activity.update(item.id, patch);
      patchLocal(patch);
      setNoteValue(patch.notes || "");
      await recordAuthoredText({ ...prepared, alters, sourceType: "activity", sourceId: item.id, sourceLabel: "Plan note", navigatePath: `/planner?highlight=${item.id}` });
      qc.invalidateQueries({ queryKey: ["activities"] });
    } catch (e) { toast.error(e.message || "Failed"); }
  };
  const toggleAlter = async (alterId) => {
    if (!entry) return;
    const current = item.fronting_alter_ids || [];
    const next = current.includes(alterId) ? current.filter((x) => x !== alterId) : [...current, alterId];
    setEntry((prev) => ({ ...prev, whoTouched: true, item: { ...prev.item, fronting_alter_ids: next } }));
    if (create) return;
    try {
      await base44.entities.Activity.update(item.id, { fronting_alter_ids: next });
      qc.invalidateQueries({ queryKey: ["activities"] });
    } catch (e) { toast.error(e.message || "Failed"); }
  };
  // Picking an activity also names the entry after it — unless the person
  // typed a name of their own (only an empty box, this sheet's own earlier
  // fill, or an abandoned fragment of the picked name is replaced).
  const changeWhat = async (ids) => {
    const next = Array.isArray(ids) ? ids : [];
    const patch = { activity_category_ids: next };
    if (create) {
      const prev = item.activity_category_ids || [];
      const addedId = next.find((id) => !prev.includes(id));
      let cat = addedId ? categories.find((c) => c.id === addedId) : null;
      if (addedId && !cat) {
        try { cat = await base44.entities.ActivityCategory.get(addedId); } catch { /* best-effort */ }
      }
      const cur = (item.activity_name || "").trim();
      if (cat?.name && (!cur || cur === autoTitleRef.current || cat.name.toLowerCase().startsWith(cur.toLowerCase()))) {
        patch.activity_name = cat.name;
        autoTitleRef.current = cat.name;
      }
    }
    saveField(patch);
  };

  // Has the time changed from the record? The apply button only shows then.
  const timingDirty = useMemo(() => {
    if (!entry || create) return false;
    if (!item.timestamp) return true; // untimed: any chosen time is a change
    const orig = new Date(item.timestamp);
    const origDur = Number(item.actual_duration_minutes) || Number(item.duration_minutes) || null;
    return orig.getTime() !== start.getTime() || (origDur || null) !== (Number(minutes) > 0 ? Number(minutes) : null);
  }, [entry, create, item, start, minutes, untimed]);

  const applyTime = async () => {
    if (!entry || create) return;
    const when = start;
    const dur = Number(minutes) > 0 ? Math.round(Number(minutes)) : null;
    // Write the length into whichever field the record already uses (same
    // rule as drag-resize; the canvas shows actual_duration_minutes first).
    const lengthPatch = (rec) => (rec.actual_duration_minutes != null
      ? { actual_duration_minutes: dur }
      : { duration_minutes: dur });
    try {
      const wasScheduled = item.status === "scheduled";
      const from = item.timestamp;
      const members = seriesMembers();
      if (members.length > 1) {
        const pivotOrig = item.timestamp ? new Date(item.timestamp) : when;
        const dayDelta = Math.round((new Date(when.getFullYear(), when.getMonth(), when.getDate()) -
          new Date(pivotOrig.getFullYear(), pivotOrig.getMonth(), pivotOrig.getDate())) / 86400000);
        await applyEditToSeries(members, (mem) => {
          const d0 = mem.timestamp ? new Date(mem.timestamp) : when;
          const d = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + dayDelta, when.getHours(), when.getMinutes(), 0, 0);
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
        const timePatch = { timestamp: when.toISOString(), ...lengthPatch(item) };
        await base44.entities.Activity.update(item.id, {
          ...timePatch,
          // Moving a plan is a reschedule: status stays scheduled and the
          // move is recorded (unless it's only a correction).
          ...(countReschedule && wasScheduled && from && from !== when.toISOString()
            ? { reschedule_history: [...(item.reschedule_history || []), { from, to: when.toISOString(), ts: new Date().toISOString() }] }
            : {}),
        });
        await syncLinkedSleep(item, timePatch);
      }
      qc.invalidateQueries({ queryKey: ["activities"] });
      onClose?.();
      if (!countReschedule || !wasScheduled) toast.success(tr("planner.timeFixed", { when: format(when, "EEE d MMM, HH:mm") }));
      else toast.success(tr("planner.rescheduled", { when: format(when, "EEE d MMM, HH:mm") }));
    } catch (e) { toast.error(e.message || tr("planner.moveFailed")); }
  };

  // ── Outcomes, start / pause (existing plans) ───────────────────────
  const alreadyActive = !!entry && !create && getActiveActivities().some((a) => a.planActivityId === item.id);
  const setOutcome = async (st, endedAt = null) => {
    try {
      await resolveOutcome(item, st, { endedAt });
      qc.invalidateQueries({ queryKey: ["activities"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      onClose?.();
    } catch (e) { toast.error(e.message || "Failed"); }
  };
  const pauseNow = async () => {
    const sess = getActiveActivities().find((a) => a.planActivityId === item.id);
    if (!sess) return;
    try {
      const { pauseActiveActivity } = await import("@/lib/activitySession");
      const res = await pauseActiveActivity(sess.id);
      qc.invalidateQueries({ queryKey: ["activities"] });
      if (res) toast.success(`⏸ ${res.name} — ${res.total ?? res.minutes}m saved`);
      onClose?.();
    } catch (e) { toast.error(e?.message || "Couldn't pause"); }
  };
  const startPlanNow = (startedAt = new Date()) => {
    const cat = categories.find((c) => c.id === categoryIdOf(item));
    addActiveActivity({
      planActivityId: item.id,
      categoryId: cat?.id || null,
      name: item.activity_name || cat?.name || "Activity",
      color: cat?.color || null,
      startTime: (startedAt instanceof Date ? startedAt : new Date()).toISOString(),
      alterIds: item.fronting_alter_ids || [],
      contactIds: item.contact_ids || [],
      notes: (item.notes || "").trim(),
    });
    try { cancelPlanReminder(item.id).catch(() => {}); } catch { /* non-fatal */ }
    toast.success(tr("planner.startedToast"));
    onClose?.();
  };

  const deleteEntry = async () => {
    if (item.recurrence_group_id) { setBranchAsk(item); return; }
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
      onClose?.();
      toast.success(tr("planner.deleted"));
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
    } catch { /* permission stays whatever it is */ }
  };

  // ── Matches offered from the typed name (never auto-applied) ───────
  const rank = (list, getName, q, n) => {
    const exact = [], starts = [], contains = [];
    for (const x of list) {
      const v = (getName(x) || "").toLowerCase();
      if (!v) continue;
      if (v === q) exact.push(x); else if (v.startsWith(q)) starts.push(x); else if (v.includes(q)) contains.push(x);
    }
    return [...exact, ...starts, ...contains].slice(0, n);
  };
  const nameQ = (item.activity_name || "").trim().toLowerCase();
  const nameMatches = useMemo(
    () => (nameQ.length < 2 || categoryIdOf(item) ? [] : rank(categories, (c) => c.name, nameQ, 5)),
    [nameQ, categories, item.activity_category_ids]
  );
  // The few activities used most recently: one tap, no tree. The whole
  // (often long, nested) list stays behind the "+ Activity" pill so the
  // sheet isn't a wall of pills (owner ask, 2026-10-23).
  const selectedWhat = item.activity_category_ids || [];
  const recentWhat = useMemo(() => {
    const byId = new Map(categories.map((c) => [c.id, c]));
    const seen = new Set();
    const out = [];
    const sorted = [...activities]
      .filter((a) => a.timestamp)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    for (const a of sorted) {
      for (const id of a.activity_category_ids || []) {
        if (seen.has(id) || !byId.has(id)) continue;
        seen.add(id);
        out.push(byId.get(id));
      }
      if (out.length >= 8) break;
    }
    return out;
  }, [activities, categories]);
  const openTasks = useMemo(() => tasks.filter((x) => !(x.completed || x.is_complete)), [tasks]);
  const todoMatches = useMemo(
    () => (item.task_id || nameQ.length < 2 ? [] : rank(openTasks, (x) => x.title, nameQ, 4)),
    [nameQ, item.task_id, openTasks]
  );
  const todoCandidates = useMemo(() => {
    const q = todoQuery.trim().toLowerCase();
    return (q ? openTasks.filter((x) => (x.title || "").toLowerCase().includes(q)) : openTasks).slice(0, 40);
  }, [openTasks, todoQuery]);
  const linkTodo = (task) => {
    saveField({ task_id: task.id, ...(item.activity_name ? {} : { activity_name: task.title }) });
    setTodoPickerOpen(false); setTodoQuery("");
  };
  const linkedTask = item.task_id ? tasks.find((x) => x.id === item.task_id) : null;

  // ── Closing ────────────────────────────────────────────────────────
  const editorDirty = () => {
    if (!entry || create || !entry.snapshot) return false;
    const live = (activities || []).find((a) => a.id === item.id);
    if (!live) return false;
    return EDIT_GUARD_FIELDS.some((f) => JSON.stringify(live[f] ?? null) !== JSON.stringify(entry.snapshot[f] ?? null));
  };
  const requestClose = () => {
    if (editorDirty()) { setCloseAsk(true); return; }
    setCloseAsk(false);
    onClose?.();
  };
  const undoChanges = async () => {
    try {
      const snap = entry?.snapshot;
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
    onClose?.();
  };
  useEffect(() => {
    if (!entry) return undefined;
    const onKey = (e) => { if (e.key === "Escape") requestClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [entry, activities]);

  // ── Save a new entry ───────────────────────────────────────────────
  const commitCreate = async () => {
    if (!create || savingRef.current) return;
    const catIds = item.activity_category_ids || [];
    if (!(item.activity_name || "").trim() && !catIds.length) return;
    savingRef.current = true; setSaving(true);
    try {
      const res = await createActivityEntry({
        mode,
        name: item.activity_name,
        categoryIds: catIds,
        categories,
        start,
        minutes: mode === ENTRY_MODES.PLAN && !untimed && !(Number(minutes) > 0) ? null : minutes,
        untimed: mode === ENTRY_MODES.PLAN && untimed,
        extraDays: mode === ENTRY_MODES.PLAN ? extraDays : [],
        alterIds: item.fronting_alter_ids || [],
        contactIds: item.contact_ids || [],
        notes: noteValue,
        location: extra.location,
        tagColor: item.tag_color,
        taskId: item.task_id || null,
        recurrence: recur,
        reminderOffset: extra.reminder_offset_minutes,
        isCritical: extra.is_critical,
        leadSteps: extra.critical_lead_steps,
        recordFronting: recordFronting && mode !== ENTRY_MODES.PLAN,
        stillFronting,
      }, { alters, terms: t });
      if (!res) return; // backed out of the whisper warning
      qc.invalidateQueries({ queryKey: ["activities"] });
      if (recordFronting) {
        qc.invalidateQueries({ queryKey: ["activeFront"] });
        qc.invalidateQueries({ queryKey: ["frontHistory"] });
        qc.invalidateQueries({ queryKey: ["frontingHistory"] });
      }
      if (item.task_id) qc.invalidateQueries({ queryKey: ["tasks"] });
      const name = (item.activity_name || "").trim() || categories.find((c) => c.id === catIds[0])?.name || "";
      toast.success(res.mode === ENTRY_MODES.NOW ? tr("planner.startedNew", { name })
        : res.count > 1 ? tr("planner.createdCount", { count: res.count })
        : res.mode === ENTRY_MODES.PLAN ? tr("planner.planned") : tr("planner.logged"));
      onSaved?.(res);
      onClose?.();
    } catch (e) {
      if (isLogCommandError(e)) toast.error(e.message);
      else toast.error(e.message || "Failed");
    } finally {
      savingRef.current = false; setSaving(false);
    }
  };

  if (!entry) return null;

  // Chip open state: the person's own toggle, else open when it holds a value.
  const has = {
    who: (item.fronting_alter_ids || []).length > 0,
    with: (item.contact_ids || []).length > 0,
    notes: !!(item.notes || "").trim() || !!noteValue.trim(),
    todo: !!item.task_id,
    location: !!(extra.location || "").trim(),
    tag: !!normalizeHex(item.tag_color || ""),
    repeat: recur.interval !== "none",
    reminder: extra.reminder_offset_minutes != null,
    critical: !!extra.is_critical,
  };
  const isOpen = (k) => open[k] ?? has[k];
  const toggle = (k) => setOpen((o) => ({ ...o, [k]: !isOpen(k) }));

  const weekStart = startOfWeek(start, { weekStartsOn });
  const startsLater = start.getTime() > Date.now() + 60000;
  const dayPassed = format(start, "yyyy-MM-dd") < format(new Date(), "yyyy-MM-dd");
  const canSave = !!((item.activity_name || "").trim() || (item.activity_category_ids || []).length);
  const saveLabel = mode === ENTRY_MODES.NOW ? tr("planner.startIt")
    : mode === ENTRY_MODES.PLAN ? tr("planner.planIt") + (extraDays.length ? ` ×${extraDays.length + 1}` : "")
    : tr("planner.logIt");

  return createPortal((
    <div className="fixed inset-0 z-[70] bg-black/50 flex items-end sm:items-center justify-center"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "calc(var(--bottom-nav-height, 56px) + var(--os-sab))" }}
      onClick={(e) => { if (e.target === e.currentTarget) requestClose(); }}>
      {closeAsk && (
        <div className="absolute inset-0 z-[75] bg-black/50 flex items-center justify-center px-6" onClick={(e) => e.stopPropagation()}>
          <div className="bg-card w-full max-w-xs rounded-2xl border border-border p-4 space-y-3" style={{ borderRadius: "var(--v2-radius, 16px)" }}>
            <p className="text-sm font-semibold">{tr("planner.closeAskTitle")}</p>
            <p className="text-xs text-muted-foreground">{tr("planner.closeAskBody")}</p>
            <div className="flex flex-col gap-1.5">
              <button type="button" onClick={() => { setCloseAsk(false); onClose?.(); }}
                className="text-sm px-3 py-2 rounded-xl bg-[var(--v2-accent)] text-white font-medium">{tr("planner.keepChanges")}</button>
              <button type="button" onClick={undoChanges}
                className="text-sm px-3 py-2 rounded-xl border border-destructive/50 text-destructive">{tr("planner.undoChanges")}</button>
              <button type="button" onClick={() => setCloseAsk(false)}
                className="text-sm px-3 py-2 rounded-xl border border-border/60 text-muted-foreground">{tr("planner.keepEditing")}</button>
            </div>
          </div>
        </div>
      )}
      {/* Taller than a short screen → it scrolls instead of overflowing. */}
      <div
        className="bg-card w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl border border-border p-3 space-y-3 max-h-full overflow-y-auto overscroll-contain"
        style={{ borderRadius: "var(--v2-radius, 16px)" }}>
        {/* NAME */}
        <div className="flex items-start justify-between gap-2">
          <button type="button" onClick={requestClose} aria-label={tr("planner.close")} title={tr("planner.close")}
            className="p-1 -ml-1 rounded-lg text-muted-foreground hover:text-foreground flex-shrink-0">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <input
            value={item.activity_name || ""}
            placeholder={create ? tr("planner.namePlaceholder") : tr("planner.untitled")}
            aria-label={tr("planner.namePlaceholder")}
            onChange={(e) => patchLocal({ activity_name: e.target.value })}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (!create && v && v !== entry.snapshot?.activity_name) saveField({ activity_name: v });
            }}
            className="flex-1 min-w-0 bg-transparent text-sm font-semibold focus:outline-none focus:border-b focus:border-[var(--v2-accent)]"
          />
          {!create && (
            <span className="text-[0.625em] uppercase tracking-wide text-muted-foreground border border-border/50 rounded-full px-2 py-0.5 flex-shrink-0">
              {tr("planner.edit")}
            </span>
          )}
        </div>
        {(nameMatches.length > 0 || todoMatches.length > 0) && (
          <div className="flex flex-wrap items-center gap-1 -mt-1">
            {nameMatches.length > 0 && <span className="text-[0.6875em] text-muted-foreground">{tr("planner.matchHint")}</span>}
            {nameMatches.map((c) => (
              <button key={c.id} type="button" onClick={() => changeWhat([c.id])}
                className="text-[0.6875em] px-2 py-0.5 rounded-full border border-border/50 hover:text-foreground flex items-center gap-1">
                {c.color && <span className="w-2 h-2 rounded-full" style={{ background: c.color }} />}{c.name}
              </button>
            ))}
            {todoMatches.map((x) => (
              <button key={x.id} type="button" onClick={() => linkTodo(x)}
                className="text-[0.6875em] px-2 py-0.5 rounded-full border border-border/50 hover:text-foreground flex items-center gap-1">
                <CheckSquare className="w-2.5 h-2.5" />{x.title}
              </button>
            ))}
          </div>
        )}

        {/* THE ONE QUESTION (new entries): what is this? */}
        {create && (
          <div role="radiogroup" aria-label={tr("planner.modeAsk")}
            className="flex rounded-full border border-border/60 p-0.5 gap-0.5">
            {[[ENTRY_MODES.DONE, tr("planner.modeDone")], [ENTRY_MODES.NOW, tr("planner.modeNow")], [ENTRY_MODES.PLAN, tr("planner.modePlan")]].map(([id, label]) => (
              <button key={id} type="button" role="radio" aria-checked={mode === id}
                onClick={() => {
                  setMode(id);
                  if (id === ENTRY_MODES.NOW) { const n = new Date(); n.setSeconds(0, 0); setStart(n); }
                  if (id !== ENTRY_MODES.PLAN) setUntimed(false);
                }}
                className={`flex-1 text-xs py-1.5 rounded-full flex items-center justify-center gap-1 ${
                  mode === id ? "bg-[var(--v2-accent)]/10 text-[var(--v2-accent)] font-semibold" : "text-muted-foreground"
                }`}>
                {id === ENTRY_MODES.NOW && <Play className="w-3 h-3" />}{label}
              </button>
            ))}
          </div>
        )}

        {/* Series membership is a fact to see before editing. */}
        {!create && item.recurrence_group_id && (
          <p className="text-[0.6875em] flex items-center gap-1" style={entry.seriesBranch ? { color: "var(--v2-accent)" } : undefined}>
            <Repeat className="w-3 h-3 flex-shrink-0" />
            {entry.seriesBranch
              ? tr("planner.seriesFuture", { count: membersForBranch(activities, item, entry.seriesBranch).length })
              : tr("planner.series")}
          </p>
        )}

        {/* OUTCOME — existing plans only: what became of it. */}
        {!create && isPlanLike && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">{tr("planner.outcome")}</p>
            <div className="flex flex-wrap gap-1">
              {item.status === "scheduled" && (alreadyActive ? (
                <>
                  <span className={`${chipCls(true)} flex items-center gap-1`}><Play className="w-3 h-3" />{tr("planner.inProgress")}</span>
                  <button type="button" onClick={pauseNow} className={`${chipCls(false)} flex items-center gap-1`}>
                    <Pause className="w-3 h-3" />{tr("planner.pause")}
                  </button>
                </>
              ) : (
                <button type="button" aria-pressed={timeAsk === "start"} onClick={() => setTimeAsk(timeAsk === "start" ? null : "start")}
                  className={`${chipCls(true)} flex items-center gap-1`}>
                  <Play className="w-3 h-3" />{tr("planner.startNow")}
                </button>
              ))}
              {[["done", tr("planner.done")], ["partial", tr("planner.partial")], ["skipped", tr("planner.skipped")], ["cancelled", tr("planner.cancelled")]].map(([id, label]) => (
                <button key={id} type="button" aria-pressed={item.status === id || (id === "done" && timeAsk === "end")}
                  onClick={() => (id === "done" ? setTimeAsk(timeAsk === "end" ? null : "end") : setOutcome(id))}
                  className={chipCls(item.status === id || (id === "done" && timeAsk === "end"))}>{label}</button>
              ))}
              <button type="button"
                onClick={() => {
                  const el = dayInputRef.current;
                  if (!el) return;
                  el.scrollIntoView({ behavior: "smooth", block: "center" });
                  try { el.showPicker(); } catch { el.focus(); }
                }}
                className={`${chipCls(false)} flex items-center gap-1`}>
                <Repeat className="w-3 h-3" />{tr("planner.reschedule")}
              </button>
            </div>
            {timeAsk && (
              <PlanTimeChoice kind={timeAsk} item={item}
                onPick={(d) => { const ask = timeAsk; setTimeAsk(null); if (ask === "start") startPlanNow(d); else setOutcome("done", d); }} />
            )}
            {item.status === "partial" && (
              <label className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                {tr("planner.actualMin")}
                <input type="number" min={1} step={5} defaultValue={item.actual_duration_minutes ?? ""}
                  onBlur={(e) => {
                    const n = parseInt(e.target.value, 10);
                    saveField({ actual_duration_minutes: Number.isFinite(n) && n > 0 ? n : null });
                  }}
                  className="w-20 h-8 px-2 rounded-lg border border-input bg-background text-sm" />
              </label>
            )}
          </div>
        )}

        {/* WHAT — picked activities as chips; the full nested list opens
            only on "+ Activity" so it never greets you as a wall. */}
        <div>
          <SectionLabel>{tr("planner.what")}</SectionLabel>
          <div className="flex flex-wrap items-center gap-1 mt-1">
            {selectedWhat.map((id) => categories.find((c) => c.id === id)).filter(Boolean).map((c) => (
              <span key={c.id} className="text-xs pl-2.5 pr-1 py-1 rounded-full border border-[var(--v2-accent)] text-[var(--v2-accent)] flex items-center gap-1">
                {c.color && <span className="w-2 h-2 rounded-full" style={{ background: c.color }} />}{c.name}
                <button type="button" aria-label={tr("planner.whatRemove", { name: c.name })}
                  onClick={() => changeWhat(selectedWhat.filter((x) => x !== c.id))}
                  className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-[var(--v2-accent)]/20">×</button>
              </span>
            ))}
            {!whatOpen && recentWhat.filter((c) => !selectedWhat.includes(c.id)).slice(0, selectedWhat.length ? 2 : 4).map((c) => (
              <button key={c.id} type="button" onClick={() => changeWhat([...selectedWhat, c.id])}
                className="text-xs px-2.5 py-1 rounded-full border border-border/50 text-muted-foreground hover:text-foreground flex items-center gap-1">
                {c.color && <span className="w-2 h-2 rounded-full" style={{ background: c.color }} />}{c.name}
              </button>
            ))}
            <button type="button" onClick={() => setWhatOpen((v) => !v)} aria-expanded={whatOpen}
              className={`text-xs px-2.5 py-1 rounded-full border ${whatOpen ? "border-[var(--v2-accent)] text-[var(--v2-accent)]" : "border-dashed border-border text-muted-foreground hover:text-foreground"}`}>
              {whatOpen ? tr("planner.whatDone") : tr("planner.whatAdd")}
            </button>
          </div>
          {whatOpen && (
            <div className="mt-2 max-h-[45vh] overflow-y-auto overscroll-contain rounded-xl border border-border/50 p-2">
              <ActivityPillSelector selectedActivities={selectedWhat} onActivityChange={changeWhat} />
            </div>
          )}
        </div>

        {/* WHEN */}
        <SectionLabel>{tr("planner.when")}</SectionLabel>
        {create && mode === ENTRY_MODES.PLAN && (
          <div className="space-y-1">
            {/* Extra days (plans): the same plan on each lit day, one record
                each — "Thursday and Friday", not a repeating series. */}
            <p className="text-xs text-muted-foreground">{tr("planner.alsoOn")}</p>
            <div className="flex gap-1 items-center">
              {Array.from({ length: 7 }, (_, i) => {
                const d = new Date(weekStart.getTime() + i * 86400000);
                const isPrimary = start.toDateString() === d.toDateString();
                const inExtra = extraDays.some((x) => x.toDateString() === d.toDateString());
                const on = isPrimary || inExtra;
                return (
                  <button key={i} type="button" aria-pressed={on} aria-label={format(d, "EEEE d MMM")}
                    onClick={() => {
                      if (inExtra) setExtraDays((prev) => prev.filter((x) => x.toDateString() !== d.toDateString()));
                      else if (!isPrimary) setExtraDays((prev) => [...prev, d]);
                      else if (extraDays.length) {
                        const sorted = [...extraDays].sort((a, b) => a - b);
                        const nd = new Date(sorted[0]); nd.setHours(start.getHours(), start.getMinutes(), 0, 0);
                        setStart(nd); setExtraDays(sorted.slice(1));
                      }
                    }}
                    className={`flex-1 text-[0.6875em] py-1 rounded border ${on ? "text-[var(--v2-accent)] border-[var(--v2-accent)]" : "border-border/50 text-muted-foreground"}`}>
                    {format(d, "EEEEE")}
                  </button>
                );
              })}
            </div>
            <label className="flex items-center justify-between gap-2 text-xs pt-1">
              <span>{tr("planner.anyTimeThatDay")}</span>
              <Switch checked={untimed} onCheckedChange={setUntimed} aria-label={tr("planner.anyTimeThatDay")} />
            </label>
          </div>
        )}
        {create && mode === ENTRY_MODES.PLAN && untimed ? (
          <label className="block text-xs text-muted-foreground">
            {tr("planner.date")}
            <input type="date" value={format(start, "yyyy-MM-dd")}
              onChange={(e) => {
                const [y, mo, da] = String(e.target.value).split("-").map(Number);
                if (y && mo && da) setStart(new Date(y, mo - 1, da, start.getHours(), start.getMinutes()));
              }}
              className="mt-1 w-full h-9 px-2 rounded-lg border border-input bg-background text-sm" />
          </label>
        ) : (
          <ActivityWhenField
            start={start}
            minutes={minutes}
            onChange={({ start: s, minutes: m }) => { setStart(s); setMinutes(m); }}
            mode={create ? mode : "edit"}
            allowNoLength={!create || mode === ENTRY_MODES.DONE || !isPlanLike}
            prevEnd={prevEnd}
            dayInputRef={dayInputRef}
          />
        )}
        {create && mode === ENTRY_MODES.DONE && startsLater && (
          <p className="text-[0.6875em] text-muted-foreground">{tr("planner.futureHint")}</p>
        )}
        {create && mode === ENTRY_MODES.PLAN && dayPassed && (
          <p className="text-[0.6875em] text-muted-foreground">{tr("planner.pastPlanHint")}</p>
        )}
        {!create && timingDirty && (
          <div className="space-y-2">
            {item.status === "scheduled" && item.timestamp && (
              <label className="flex items-center justify-between gap-2 text-xs">
                <span>{tr("planner.countAsReschedule")}</span>
                <Switch checked={countReschedule} onCheckedChange={setCountReschedule} aria-label={tr("planner.countAsReschedule")} />
              </label>
            )}
            <Button size="sm" className="w-full" onClick={applyTime}>
              {item.timestamp
                ? (item.status === "scheduled" && countReschedule ? tr("planner.reschedule") : tr("planner.saveTime"))
                : tr("planner.giveTime")}
            </Button>
          </div>
        )}

        {/* DETAILS — every optional field, the same in every door. */}
        <SectionLabel>{tr("planner.details")}</SectionLabel>
        <div className="flex flex-wrap gap-1.5">
          <DetailChip open={isOpen("who")} has={has.who} onToggle={() => toggle("who")} label={tr("planner.who")} />
          <DetailChip open={isOpen("with")} has={has.with} onToggle={() => toggle("with")} label={tr("planner.with")} />
          <DetailChip open={isOpen("notes")} has={has.notes} onToggle={() => toggle("notes")} label={tr("planner.notes")} />
          <DetailChip open={isOpen("todo")} has={has.todo} onToggle={() => toggle("todo")} label={tr("planner.todoLabel")} />
          <DetailChip open={isOpen("location")} has={has.location} onToggle={() => toggle("location")} label={tr("planner.location")} />
          <DetailChip open={isOpen("tag")} has={has.tag} onToggle={() => toggle("tag")} label={tr("planner.colorTag")} />
          {create && mode === ENTRY_MODES.PLAN && !untimed && (
            <DetailChip open={isOpen("repeat")} has={has.repeat} onToggle={() => toggle("repeat")} label={tr("planner.repeat")} />
          )}
          {canPlanExtras && !untimed && (
            <DetailChip open={isOpen("reminder")} has={has.reminder} onToggle={() => toggle("reminder")} label={tr("planner.reminder")} />
          )}
          {canPlanExtras && !untimed && (
            <DetailChip open={isOpen("critical")} has={has.critical} onToggle={() => toggle("critical")} label={tr("planner.critical")} />
          )}
        </div>

        {/* Who — never a bare member list: searchable, fronters first. */}
        {isOpen("who") && (
          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <p className="text-xs text-muted-foreground">{tr("planner.who")}</p>
              <span className="flex items-center gap-1">
                <button type="button" onClick={toggleWhoGrouped} aria-pressed={whoGrouped}
                  aria-label={tr("planner.groupView")} title={tr("planner.groupView")}
                  className={`p-1.5 rounded-lg border ${whoGrouped ? "border-[var(--v2-accent)] text-[var(--v2-accent)]" : "border-border/50 text-muted-foreground"}`}>
                  <FolderTree className="w-3.5 h-3.5" />
                </button>
                <AlterSortToggle sorter={sorter} />
              </span>
            </div>
            <SearchableMultiList
              options={memberOptions}
              sections={memberSections}
              selectedIds={item.fronting_alter_ids || []}
              onToggle={toggleAlter}
              searchPlaceholder={tr("planner.searchMembers", { members: t.alters })}
            />
            {create && mode !== ENTRY_MODES.PLAN && (item.fronting_alter_ids || []).length > 0 && (
              <div className="mt-2 space-y-1.5">
                <label className="flex items-center justify-between gap-2 text-xs">
                  <span>{tr("planner.recordFronting", { fronting: t.fronting })}</span>
                  <Switch checked={recordFronting} onCheckedChange={setRecordFronting}
                    aria-label={tr("planner.recordFronting", { fronting: t.fronting })} />
                </label>
                {recordFronting && mode === ENTRY_MODES.DONE && (
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
        {isOpen("with") && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">{tr("planner.withHint")}</p>
            <ContactMultiSelectList selectedContactIds={item.contact_ids || []} onChange={(ids) => saveField({ contact_ids: ids })} />
          </div>
        )}
        {isOpen("notes") && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">{tr("planner.notes")}</p>
            <MentionTextarea
              value={noteValue}
              onChange={setNoteValue}
              alters={alters}
              signposts
              onBlur={() => { if (!create && noteValue !== (item.notes || "")) saveNote(noteValue); }}
              rows={2}
              placeholder={tr("planner.notesPlaceholder")}
              className="w-full rounded-lg border border-input bg-background text-sm p-2"
            />
          </div>
        )}
        {isOpen("todo") && (
          <div className="space-y-1">
            {linkedTask ? (
              <div className="flex items-center gap-2 text-xs">
                <CheckSquare className="w-3.5 h-3.5 text-[var(--v2-accent)] flex-shrink-0" />
                <span className="flex-1 min-w-0 truncate">{linkedTask.title}</span>
                <button type="button" onClick={() => saveField({ task_id: null })}
                  className="text-[0.6875em] px-2 py-0.5 rounded-full border border-border/50 text-muted-foreground hover:text-foreground flex-shrink-0">
                  {tr("planner.unlinkTodo")}
                </button>
              </div>
            ) : (
              <>
                <input value={todoQuery} onChange={(e) => { setTodoQuery(e.target.value); setTodoPickerOpen(true); }}
                  onFocus={() => setTodoPickerOpen(true)}
                  placeholder={tr("planner.linkTodo")} aria-label={tr("planner.linkTodo")}
                  className="w-full h-8 px-2 rounded-lg border border-input bg-background text-xs" />
                {todoPickerOpen && (
                  <div className="max-h-32 overflow-y-auto overscroll-contain space-y-0.5">
                    {todoCandidates.length === 0 && <p className="text-[0.6875em] text-muted-foreground px-1 py-1">{tr("planner.noTasks")}</p>}
                    {todoCandidates.map((x) => (
                      <button key={x.id} type="button" onClick={() => linkTodo(x)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg border border-border/40 text-left text-xs hover:bg-muted/30">
                        <CheckSquare className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                        <span className="flex-1 truncate">{x.title}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
        {isOpen("location") && (
          <div>
            <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><MapPin className="w-3 h-3" /> {tr("planner.location")}</p>
            <input value={extra.location} aria-label={tr("planner.location")}
              onChange={(e) => setExtra((x) => ({ ...x, location: e.target.value }))}
              onBlur={() => {
                if (!create && (extra.location.trim() || null) !== (item.location || null)) saveField({ location: extra.location.trim() || null });
              }}
              className="w-full h-8 px-2 rounded-lg border border-input bg-background text-sm" />
            {!create && item.location && (
              <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.location)}`}
                target="_blank" rel="noopener noreferrer" className="text-[0.6875em] mt-0.5 inline-block hover:underline"
                style={{ color: "var(--v2-accent)" }}>{tr("planner.openMap")}</a>
            )}
          </div>
        )}
        {isOpen("tag") && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">{tr("planner.colorTagHint")}</p>
            <PlanColorTagPicker value={item.tag_color || null} onChange={saveTagColorDebounced} />
          </div>
        )}
        {create && mode === ENTRY_MODES.PLAN && !untimed && isOpen("repeat") && (
          <div>
            <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Repeat className="w-3 h-3" /> {tr("planner.repeat")}</p>
            <div className="flex flex-wrap gap-1">
              {RECURRENCE_INTERVALS.map((iv) => (
                <button key={iv} type="button" aria-pressed={recur.interval === iv}
                  onClick={() => setRecur((r) => ({ ...r, interval: iv, count: clampOccurrenceCount(iv, r.count) }))}
                  className={chipCls(recur.interval === iv)}>{tr(`planner.repeat.${iv}`)}</button>
              ))}
            </div>
            {recur.interval !== "none" && (
              <label className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                {tr(recur.interval === "yearly" ? "planner.repeatYears" : "planner.repeatCount")}
                <input type="number" min={1} max={maxOccurrences(recur.interval)} value={recur.count} data-testid="plan-repeat-count"
                  onChange={(e) => { const n = parseInt(e.target.value, 10); setRecur((r) => ({ ...r, count: clampOccurrenceCount(r.interval, n) })); }}
                  className="w-16 h-8 px-2 rounded-lg border border-input bg-background text-sm" />
              </label>
            )}
          </div>
        )}
        {canPlanExtras && !untimed && isOpen("reminder") && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">{tr("planner.reminder")}</p>
            {planRemOn ? (
              <div className="flex flex-wrap gap-1">
                {[{ value: null, label: tr("planner.reminderDefault") }, ...PLAN_REMINDER_OFFSETS.map((o) => ({ value: o.value, label: tr(`planner.offset.${o.value}`) }))].map((o) => (
                  <button key={String(o.value)} type="button" aria-pressed={extra.reminder_offset_minutes === o.value}
                    onClick={() => {
                      setExtra((x) => ({ ...x, reminder_offset_minutes: o.value }));
                      if (!create) saveField({ reminder_offset_minutes: o.value });
                    }}
                    className={chipCls(extra.reminder_offset_minutes === o.value)}>{o.label}</button>
                ))}
              </div>
            ) : (
              <Button size="sm" variant="outline" className="text-xs h-7" onClick={enablePlanReminders}>{tr("planner.reminderEnable")}</Button>
            )}
          </div>
        )}
        {canPlanExtras && !untimed && isOpen("critical") && (
          <div>
            <button type="button" aria-pressed={extra.is_critical}
              onClick={() => {
                const on = !extra.is_critical;
                setExtra((x) => ({ ...x, is_critical: on }));
                if (!create) saveField({ is_critical: on, critical_lead_steps: on ? extra.critical_lead_steps : null });
              }}
              className={`text-xs px-2.5 py-1 rounded-full border ${extra.is_critical ? "text-amber-500 border-amber-500" : "border-border/50 text-muted-foreground"}`}>
              ⚡ {tr("planner.critical")}
            </button>
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
                        if (!create) saveField({ critical_lead_steps: next });
                      }}
                      className={`text-[0.6875em] px-2 py-0.5 rounded-full border ${on ? "text-[var(--v2-accent)] border-[var(--v2-accent)]" : "border-border/50 text-muted-foreground"}`}>
                      {tr(`planner.lead.${s.key}`)}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {create ? (
          <Button className="w-full gap-1.5" disabled={!canSave || saving} onClick={commitCreate}>
            {mode === ENTRY_MODES.NOW && <Play className="w-3.5 h-3.5" />}{saveLabel}
          </Button>
        ) : (
          <Button size="sm" variant="ghost" className="w-full text-destructive hover:text-destructive" onClick={deleteEntry}>
            {tr("planner.delete")}
          </Button>
        )}
      </div>
      {branchAsk && (
        <SeriesDeleteSheet item={branchAsk} activities={activities} onClose={() => setBranchAsk(null)} onDeleted={() => onClose?.()} />
      )}
    </div>
  ), document.body);
}
