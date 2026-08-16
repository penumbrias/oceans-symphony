import React, { useState, useMemo, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { format, differenceInMinutes } from "date-fns";
import { toast } from "sonner";
import { UserPlus, Users, X, Play, Plus } from "lucide-react";
import ActivityPillSelector from "@/components/activities/ActivityPillSelector";
import MentionTextarea from "@/components/shared/MentionTextarea";
import SetFrontModal from "@/components/fronting/SetFrontModal";
import ContactMultiSelect from "@/components/contacts/ContactMultiSelect";
import { contactDisplayName } from "@/lib/contacts";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { applyWhisper } from "@/lib/whisperUtils";
import { applyLogCommands } from "@/lib/logCommands";
import { useTerms } from "@/lib/useTerms";
import { ACTIVITY_STATUSES } from "@/lib/activityStatus";
import { previousActivityEnd } from "@/lib/planner/previousEnd";
import { addActiveActivity } from "@/lib/activitySession";

// Lean "I did this" log modal. Past-dated capture path.
//
// Phase 2 split from the old ActivityTimeRangeModal: this is the
// back-dated "I already did this" entry, separate from the richer
// scheduling modal (ActivityPlanModal). No recurrence, no location,
// no critical flag, no task link, no lead-step picker. Status saved
// as "logged".
//
// Co-fronter detection is exactly the same auto-populate-from-fronting
// behaviour the old mega-modal had: any alter who was fronting during
// the chosen time range is pre-selected.

function toTimeString(date, hour, minute = 0) {
  const d = new Date(date);
  d.setHours(hour, minute, 0, 0);
  return format(d, "HH:mm");
}

function parseTimeToDate(baseDate, timeStr) {
  const [h, m] = timeStr.split(":").map(Number);
  const d = new Date(baseDate);
  d.setHours(h, m, 0, 0);
  return d;
}

// A compact selected-fronter chip (avatar + label + remove) for the list below
// the "Choose who was fronting" button.
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

// Contact-selection equivalent of SelectedFronterChip — no avatar resolution
// needed since Contact display here is name-only, matching CurrentContacts.
function SelectedContactChip({ contact, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1.5 pl-2 pr-1.5 py-0.5 rounded-full border border-border bg-muted/30 text-xs">
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: contact?.color || "#0ea5e9" }} />
      <span className="truncate max-w-[140px]">{contactDisplayName(contact)}</span>
      <button type="button" onClick={onRemove} aria-label="Remove" className="text-muted-foreground hover:text-destructive"><X className="w-3 h-3" /></button>
    </span>
  );
}

export default function ActivityLogModal({
  isOpen,
  onClose,
  startDate: startDateProp,
  endDate: endDateProp,
  startHour,
  endHour,
  startMinute = 0,
  endMinute = 0,
  alters,
  frontingHistory = [],
  onSave,
  // Open directly in Active ("start now") mode — the quick-action Start
  // Activity path. One modal, both directions of its own toggle.
  initialActive = false,
}) {
  const terms = useTerms();
  const queryClient = useQueryClient();
  const formatAlter = useAlterLabel();

  const [selectedDateStr, setSelectedDateStr] = useState("");
  const [endDateStr, setEndDateStr] = useState("");
  const [selectedActivityCategories, setSelectedActivityCategories] = useState([]);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [selectedAlters, setSelectedAlters] = useState([]);
  const [selectedContactIds, setSelectedContactIds] = useState([]);
  const [contactsPickerOpen, setContactsPickerOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  // Synchronous in-flight guard. setIsLoading is async and only flips after an
  // await in handleSave, so a fast double-tap could pass validation twice and
  // write duplicate records — this ref closes that gap.
  const savingRef = useRef(false);
  // Quick-duration presets: which end stays fixed when a preset is applied.
  // "end"  → preset sets START to (end − n).  "start" → sets END to (start + n).
  const [presetAnchor, setPresetAnchor] = useState("end");
  const [customAmt, setCustomAmt] = useState("");
  const [customUnit, setCustomUnit] = useState("m"); // "m" | "h"
  // Whether the selected fronters are STILL fronting now (open session) vs the
  // activity's front having ended (closed session). Defaults from end ≈ now.
  const [stillFronting, setStillFronting] = useState(true);
  const [fronterPickerOpen, setFronterPickerOpen] = useState(false);
  // "Active" mode = start an in-progress activity now and end/log it later
  // (an easier entry point — the saved record is identical to a normal log).
  const [activeMode, setActiveMode] = useState(initialActive);

  // v0.89.1 layout revamp: optional DETAILS fields hide behind "+ chips"
  // (plan-modal pattern) and auto-expand whenever they hold a value — so
  // the day-view fronting-history preselect still surfaces Who directly.
  const [showWhoField, setShowWhoField] = useState(false);
  const [showContactsField, setShowContactsField] = useState(false);
  const [showNotesField, setShowNotesField] = useState(false);
  const whoOpen = showWhoField || selectedAlters.length > 0;
  const contactsOpen = showContactsField || selectedContactIds.length > 0;
  const notesOpen = showNotesField || !!notes;

  const startDate = selectedDateStr ? new Date(`${selectedDateStr}T00:00:00`) : null;
  const endDate = endDateStr ? new Date(`${endDateStr}T00:00:00`) : startDate;
  const isCrossDay = selectedDateStr && endDateStr && selectedDateStr !== endDateStr;

  // Reset per open. Mirrors the mega-modal's useEffect approach — never
  // call setState during render, never key off Date objects directly.
  useEffect(() => {
    if (!isOpen) return;
    setActiveMode(initialActive);
    const seedDate = startDateProp || new Date();
    const nearNow = (d) => Math.abs(Date.now() - d.getTime()) < 15 * 60000;
    if (startHour !== undefined) {
      // Seeded from a tapped day-view slot — honour those hours.
      setSelectedDateStr(format(seedDate, "yyyy-MM-dd"));
      setEndDateStr(format(endDateProp || seedDate, "yyyy-MM-dd"));
      setStartTime(toTimeString(seedDate, startHour, startMinute));
      let endDt;
      if (endHour != null) {
        const eDate = endDateProp || seedDate;
        setEndTime(toTimeString(eDate, endHour, endMinute));
        endDt = new Date(eDate); endDt.setHours(endHour, endMinute, 0, 0);
      } else {
        const endH = (startHour + Math.floor((startMinute + 30) / 60)) % 24;
        const endM = (startMinute + 30) % 60;
        setEndTime(toTimeString(seedDate, endH, endM));
        endDt = new Date(seedDate); endDt.setHours(endH, endM, 0, 0);
      }
      setStillFronting(nearNow(endDt));
    } else {
      // No seed — default to End = now (rounded to 5 min), Start = end − 30 min.
      const now = new Date();
      const end = new Date(now); end.setMinutes(Math.floor(now.getMinutes() / 5) * 5, 0, 0);
      const start = new Date(end.getTime() - 30 * 60000);
      setSelectedDateStr(format(start, "yyyy-MM-dd"));
      setEndDateStr(format(end, "yyyy-MM-dd"));
      setStartTime(format(start, "HH:mm"));
      setEndTime(format(end, "HH:mm"));
      setStillFronting(true);
    }
    setSelectedActivityCategories([]);
    setNotes("");
    setActiveMode(false);
    setSelectedContactIds([]);
  }, [isOpen, startDateProp, endDateProp, startHour, endHour, startMinute, endMinute]);

  // Turning "Active" on snaps the start to now (still adjustable) and clears
  // any fronting selection — the fronting picker is hidden entirely in this
  // mode (matches the minimal Start Activity dashboard button's explicit
  // "no fronting picker" design), so nothing should be silently attributed
  // behind the scenes either.
  // Snapshot of the date/time/fronting range captured when Active mode is
  // enabled, so toggling it back OFF restores a coherent range instead of
  // leaving the start pinned to "now" while the end stays where it was
  // (which made start > end — the duration vanished and save would fail).
  const preActiveRef = useRef(null);
  const enableActiveMode = (on) => {
    if (on) {
      preActiveRef.current = { selectedDateStr, endDateStr, startTime, endTime, selectedAlters, stillFronting };
      const now = new Date();
      setActiveMode(true);
      setSelectedDateStr(format(now, "yyyy-MM-dd"));
      setStartTime(format(now, "HH:mm"));
      setSelectedAlters([]);
      return;
    }
    setActiveMode(false);
    const snap = preActiveRef.current;
    if (snap) {
      setSelectedDateStr(snap.selectedDateStr);
      setEndDateStr(snap.endDateStr);
      setStartTime(snap.startTime);
      setEndTime(snap.endTime);
      setSelectedAlters(snap.selectedAlters);
      setStillFronting(snap.stillFronting);
      preActiveRef.current = null;
    }
  };

  // Auto-populate alters from fronting history. Stable date key avoids
  // the infinite-loop bug the mega-modal hit.
  const startDateKey = startDate ? format(startDate, "yyyy-MM-dd") : null;
  useEffect(() => {
    if (startDate && startHour !== undefined && endHour !== undefined) {
      const startDt = new Date(startDate);
      startDt.setHours(Math.min(startHour, endHour), startMinute, 0, 0);
      const endDt = new Date(startDate);
      endDt.setHours(Math.max(startHour, endHour) + 1, endMinute, 0, 0);
      const relevantSessions = (frontingHistory || []).filter((s) => {
        const ss = new Date(s.start_time);
        const se = s.end_time ? new Date(s.end_time) : new Date();
        return ss < endDt && se > startDt;
      });
      const alterIds = new Set();
      relevantSessions.forEach((s) => {
        if (s.primary_alter_id) alterIds.add(s.primary_alter_id);
        if (s.alter_id) alterIds.add(s.alter_id);
        (s.co_fronter_ids || []).forEach((id) => alterIds.add(id));
      });
      setSelectedAlters(Array.from(alterIds));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDateKey, startHour, endHour, startMinute, endMinute, frontingHistory]);

  // "After last" quick-set: end of the most recent logged activity. Read
  // from the shared cache — the planner keeps this list warm — and only
  // resolved when the modal is open so a closed modal costs nothing.
  const { data: allActivities = [] } = useQuery({
    queryKey: ["activities"],
    queryFn: () => base44.entities.Activity.list(),
    enabled: !!isOpen,
  });
  const prevEnd = useMemo(
    () => previousActivityEnd(allActivities, { before: new Date() }),
    [allActivities]
  );
  const applyPrevEnd = () => {
    if (!prevEnd) return;
    const d = format(prevEnd.end, "yyyy-MM-dd");
    setSelectedDateStr(d);
    setStartTime(format(prevEnd.end, "HH:mm"));
    // Keep the end date from preceding the new start.
    setEndDateStr((cur) => (!cur || cur < d ? d : cur));
  };
  const AfterLastButton = () => prevEnd ? (
    <button type="button" onClick={applyPrevEnd}
      className="text-[0.6875rem] text-primary hover:underline truncate max-w-[10rem]"
      title={`${format(prevEnd.end, "EEE HH:mm")} — ${prevEnd.name || "previous activity"}`}>
      After last
    </button>
  ) : null;

  const { data: activityCategories = [] } = useQuery({
    queryKey: ["activityCategories"],
    queryFn: () => base44.entities.ActivityCategory.list(),
  });

  const durationMinutes = useMemo(() => {
    if (!startDate || !startTime || !endTime) return 0;
    const s = parseTimeToDate(startDate, startTime);
    const e = parseTimeToDate(endDate || startDate, endTime);
    const diff = differenceInMinutes(e, s);
    return diff > 0 ? diff : 0;
  }, [startDate, endDate, startTime, endTime]);

  const altersById = useMemo(() => Object.fromEntries((alters || []).map((a) => [a.id, a])), [alters]);
  const { data: contacts = [] } = useQuery({
    queryKey: ["contacts"],
    queryFn: () => base44.entities.Contact.list(),
  });
  const contactsById = useMemo(() => Object.fromEntries(contacts.map((c) => [c.id, c])), [contacts]);

  // Apply a quick duration. Anchored on END (default) → moves START back by n;
  // anchored on START → moves END forward by n. Handles day rollover.
  const applyDuration = (mins) => {
    if (!mins || mins <= 0) return;
    if (presetAnchor === "end") {
      const base = parseTimeToDate(endDate || startDate || new Date(), endTime || format(new Date(), "HH:mm"));
      const ns = new Date(base.getTime() - mins * 60000);
      setSelectedDateStr(format(ns, "yyyy-MM-dd"));
      setStartTime(format(ns, "HH:mm"));
    } else {
      const base = parseTimeToDate(startDate || new Date(), startTime || format(new Date(), "HH:mm"));
      const ne = new Date(base.getTime() + mins * 60000);
      setEndDateStr(format(ne, "yyyy-MM-dd"));
      setEndTime(format(ne, "HH:mm"));
    }
  };
  const applyCustom = () => {
    const n = parseInt(customAmt, 10);
    if (!n || n <= 0) return;
    applyDuration(customUnit === "h" ? n * 60 : n);
  };

  const handleSave = async () => {
    if (savingRef.current) return; // re-entry guard (see savingRef above)
    if (selectedActivityCategories.length === 0) {
      toast.error("Select an activity");
      return;
    }
    if (!startTime) {
      toast.error("Set start time");
      return;
    }
    if (!activeMode && endTime && durationMinutes <= 0) {
      toast.error("End time must be after start time");
      return;
    }

    savingRef.current = true;
    try {
    // Run inline ~commands first (each becomes a chip), then whisper handling.
    const lc = await applyLogCommands(notes || "", { isRich: false });
    // "/w @name [secret]" in the notes hides that part behind a whisper bar
    // (no brackets warns first — an activity note is a personal record).
    const w = applyWhisper(lc.content, alters || [], { allowWholeBlur: false, rich: lc.logged.length > 0, surfaceLabel: "note" });
    if (w === null) return;
    const finalNotes = w.content;

    // Active mode — start an in-progress activity (timed until you End it).
    // Reuses the running-session mechanism; on End it logs an Activity that's
    // identical in shape to a normally-logged one.
    if (activeMode) {
      const catId = selectedActivityCategories[0];
      const cat = activityCategories.find((c) => c.id === catId);
      addActiveActivity({
        categoryId: catId,
        name: cat?.name || catId,
        color: cat?.color || null,
        startTime: parseTimeToDate(startDate, startTime).toISOString(),
        alterIds: selectedAlters,
        contactIds: selectedContactIds,
        notes: finalNotes || "",
      });
      setSelectedActivityCategories([]);
      setNotes("");
      onSave?.();
      onClose();
      toast.success(`▶ Started ${cat?.name || "activity"}`);
      return;
    }

    setIsLoading(true);
    const timestamp = parseTimeToDate(startDate, startTime);
    const endDt = endTime ? parseTimeToDate(endDate || startDate, endTime) : null;

    try {
      const catById = Object.fromEntries(activityCategories.map((c) => [c.id, c]));
      let firstCreatedId = null;
      for (const catId of selectedActivityCategories) {
        const cat = catById[catId];
        const created = await base44.entities.Activity.create({
          timestamp: timestamp.toISOString(),
          activity_name: cat?.name || catId,
          activity_category_ids: [catId],
          ...(cat?.color ? { color: cat.color } : {}),
          duration_minutes: durationMinutes > 0 ? durationMinutes : null,
          fronting_alter_ids: selectedAlters,
          contact_ids: selectedContactIds,
          notes: finalNotes || null,
          is_planned: false,
          status: ACTIVITY_STATUSES.LOGGED,
        });
        if (!firstCreatedId) firstCreatedId = created?.id || null;
      }
      // Whisper recipients are peeled off the note — notify them.
      for (const rid of (w.recipientIds || [])) {
        try {
          await base44.entities.MentionLog.create({
            mentioned_alter_id: rid,
            author_alter_id: null,
            log_type: "mention",
            source_type: "activity",
            source_id: firstCreatedId || "",
            source_label: "Whisper in an activity note",
            source_date: new Date().toISOString(),
            preview_text: "🔒 private whisper",
            navigate_path: "/activity-tracker",
          });
        } catch { /* best-effort */ }
      }

      // Fronting-session sync — create an associated session for each selected
      // alter. The "Still fronting now" toggle decides whether that session is
      // OPEN (continues on front) or CLOSED at the activity's end time.
      if (selectedAlters.length > 0) {
        const active = await base44.entities.FrontingSession.filter({ is_active: true });
        const alreadyActive = new Set();
        for (const s of active) {
          if (s.alter_id) alreadyActive.add(s.alter_id);
          if (s.primary_alter_id) alreadyActive.add(s.primary_alter_id);
          for (const id of (s.co_fronter_ids || [])) alreadyActive.add(id);
        }
        for (const alterId of selectedAlters) {
          if (stillFronting) {
            // Continue on front — skip if they already have an open session.
            if (alreadyActive.has(alterId)) continue;
            await base44.entities.FrontingSession.create({
              alter_id: alterId,
              is_primary: false,
              start_time: timestamp.toISOString(),
              is_active: true,
            });
          } else {
            // Closed historical session spanning the activity's window.
            await base44.entities.FrontingSession.create({
              alter_id: alterId,
              is_primary: false,
              start_time: timestamp.toISOString(),
              end_time: (endDt || timestamp).toISOString(),
              is_active: false,
            });
          }
        }
        queryClient.invalidateQueries({ queryKey: ["activeFront"] });
        queryClient.invalidateQueries({ queryKey: ["frontHistory"] });
      }

      setSelectedActivityCategories([]);
      setNotes("");
      onSave?.();
      onClose();
      toast.success("Activity saved!");
    } catch (err) {
      toast.error(err.message || "Failed to log activity");
    } finally {
      setIsLoading(false);
    }
    } finally {
      savingRef.current = false; // always unlock, incl. the early-return paths
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {activeMode ? "Start Activity" : "Log Activity"}
            {startDate && (
              <div className="text-sm font-normal text-muted-foreground mt-1">
                {format(startDate, "MMM d, yyyy")}
                {isCrossDay && endDate && (
                  <span className="ml-1 text-primary">→ {format(endDate, "MMM d")}</span>
                )}
              </div>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* ── WHEN ─────────────────────────────────────────────── */}
          <section className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">When</h3>
              {/* Active mode as a compact pill toggle (mirrors the plan
                  modal's "No specific time") — times it live until End,
                  then it's logged automatically. */}
              <button
                type="button"
                onClick={() => enableActiveMode(!activeMode)}
                aria-pressed={activeMode}
                className={`text-xs px-2.5 py-1 rounded-full border transition-all flex items-center gap-1 ${activeMode ? "border-primary/50 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground hover:bg-muted/50"}`}
              >
                <Play className="w-3 h-3" /> Active — end later
              </button>
            </div>

            {activeMode ? (
              /* Active mode collapses to a single combined field — matches
                 the minimal Start Activity dashboard button's own layout,
                 since they're the same "start now" flow via two doors. */
              <div>
                <label className="text-xs text-muted-foreground mb-1 flex items-center justify-between gap-2">
                  <span>Start time <span className="text-destructive">*</span></span>
                  <span className="flex items-center gap-2.5">
                    <AfterLastButton />
                    <button type="button" onClick={() => { const n = new Date(); setSelectedDateStr(format(n, "yyyy-MM-dd")); setStartTime(format(n, "HH:mm")); }}
                      className="text-[0.6875rem] text-primary hover:underline">Now</button>
                  </span>
                </label>
                <input
                  type="datetime-local"
                  value={selectedDateStr && startTime ? `${selectedDateStr}T${startTime}` : ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) return;
                    const [d, t] = v.split("T");
                    setSelectedDateStr(d);
                    setStartTime(t);
                  }}
                  className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm"
                />
                <p className="text-[0.6875rem] text-muted-foreground mt-1">
                  Times it live until you tap End, then it's logged automatically.
                </p>
              </div>
            ) : (
              <>
                {/* Start / end date */}
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-xs text-muted-foreground block mb-1">Start date</label>
                    <input
                      type="date"
                      value={selectedDateStr}
                      onChange={(e) => {
                        const v = e.target.value;
                        setSelectedDateStr(v);
                        // Push the end date forward if it now precedes the start.
                        if (!endDateStr || endDateStr < v) setEndDateStr(v);
                      }}
                      className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-muted-foreground block mb-1">End date</label>
                    <input
                      type="date"
                      value={endDateStr}
                      min={selectedDateStr || undefined}
                      onChange={(e) => setEndDateStr(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm"
                    />
                  </div>
                </div>

                {/* Start / end time + duration */}
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <label className="text-xs text-muted-foreground mb-1 flex items-center justify-between gap-2">
                      <span>Start time <span className="text-destructive">*</span></span>
                      <span className="flex items-center gap-2.5">
                        <AfterLastButton />
                        <button type="button" onClick={() => { const n = new Date(); setSelectedDateStr(format(n, "yyyy-MM-dd")); setStartTime(format(n, "HH:mm")); }}
                          className="text-[0.6875rem] text-primary hover:underline">Now</button>
                      </span>
                    </label>
                    <input
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-muted-foreground mb-1 flex items-center justify-between gap-2">
                      <span>
                        End time
                        {isCrossDay && endDate && (
                          <span className="ml-1 text-primary">{format(endDate, "MMM d")}</span>
                        )}
                      </span>
                      <button type="button" onClick={() => { const n = new Date(); setEndDateStr(format(n, "yyyy-MM-dd")); setEndTime(format(n, "HH:mm")); }}
                        className="text-[0.6875rem] text-primary hover:underline">Now</button>
                    </label>
                    <input
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm"
                    />
                  </div>
                  {durationMinutes > 0 && (
                    <div className="text-xs text-muted-foreground pb-2.5 whitespace-nowrap tabular-nums">
                      {durationMinutes >= 60
                        ? `${Math.floor(durationMinutes / 60)}h ${durationMinutes % 60 > 0 ? durationMinutes % 60 + "m" : ""}`
                        : `${durationMinutes}m`}
                    </div>
                  )}
                </div>

                {/* Quick-duration presets. The "from end/start" toggle on the
                    right decides which time stays fixed — e.g. "30m" from end
                    sets the start to (end − 30m). */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {[{ l: "1hr", m: 60 }, { l: "30m", m: 30 }, { l: "15m", m: 15 }].map((p) => (
                    <button key={p.l} type="button" onClick={() => applyDuration(p.m)}
                      className="px-2.5 h-7 rounded-md border border-border text-xs text-foreground hover:bg-muted/50 transition-colors">
                      {p.l}
                    </button>
                  ))}
                  <div className="flex items-center rounded-md border border-border overflow-hidden h-7">
                    <input type="number" min="1" inputMode="numeric" value={customAmt}
                      onChange={(e) => setCustomAmt(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyCustom(); } }}
                      placeholder="—" className="w-10 h-full px-1.5 text-xs bg-background outline-none text-center" aria-label="Custom amount" />
                    <button type="button" onClick={() => setCustomUnit((u) => (u === "m" ? "h" : "m"))}
                      className="px-1.5 h-full text-xs border-l border-border bg-muted/30 text-muted-foreground" title="Toggle minutes / hours">
                      {customUnit === "m" ? "min" : "hr"}
                    </button>
                    <button type="button" onClick={applyCustom}
                      className="px-2 h-full text-xs border-l border-border bg-primary/10 text-primary font-medium">set</button>
                  </div>
                  <button type="button" onClick={() => setPresetAnchor((a) => (a === "end" ? "start" : "end"))}
                    className="ml-auto px-2.5 h-7 rounded-md border border-border text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
                    title="Which time the presets keep fixed">
                    from <span className="font-medium text-foreground">{presetAnchor}</span>
                  </button>
                </div>
              </>
            )}
          </section>

          {/* ── WHAT ─────────────────────────────────────────────── */}
          <section className="space-y-2.5">
            <h3 className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">What</h3>
            <ActivityPillSelector
              selectedActivities={selectedActivityCategories}
              onActivityChange={setSelectedActivityCategories}
              required
            />
          </section>

          {/* ── DETAILS — optional fields behind "+ chips" (plan-modal
                 pattern). A field auto-expands whenever it holds a value —
                 e.g. Who was fronting opens itself when the day-view seed
                 preselected fronters from history. */}
          <section className="space-y-2.5">
            <h3 className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">Details</h3>
            {!((whoOpen || activeMode) && contactsOpen && notesOpen) && (
              <div className="flex flex-wrap gap-1.5">
                {!activeMode && !whoOpen && (
                  <button type="button" onClick={() => setShowWhoField(true)}
                    className="text-xs px-2.5 py-1 rounded-full border border-border/50 text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-all flex items-center gap-1">
                    <Plus className="w-3 h-3" /> Who was {terms.fronting}
                  </button>
                )}
                {!contactsOpen && (
                  <button type="button" onClick={() => setShowContactsField(true)}
                    className="text-xs px-2.5 py-1 rounded-full border border-border/50 text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-all flex items-center gap-1">
                    <Plus className="w-3 h-3" /> Company
                  </button>
                )}
                {!notesOpen && (
                  <button type="button" onClick={() => setShowNotesField(true)}
                    className="text-xs px-2.5 py-1 rounded-full border border-border/50 text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-all flex items-center gap-1">
                    <Plus className="w-3 h-3" /> Notes
                  </button>
                )}
              </div>
            )}

            {/* Alters — hidden entirely in Active mode (matches the minimal
                Start Activity button's explicit "no fronting picker" design,
                same flow via two doors). */}
            {!activeMode && whoOpen && (
              <div>
                <Button type="button" size="sm" variant="outline" onClick={() => setFronterPickerOpen(true)} className="w-full gap-2 text-xs">
                  <UserPlus className="w-3.5 h-3.5" />
                  {selectedAlters.length > 0 ? `${terms.Fronting}: ${selectedAlters.length} selected` : `Choose who was ${terms.fronting}…`}
                </Button>
                {selectedAlters.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {selectedAlters.map((id) => {
                      const a = altersById[id];
                      if (!a) return null;
                      return <SelectedFronterChip key={id} alter={a} label={formatAlter(a)} onRemove={() => setSelectedAlters((prev) => prev.filter((x) => x !== id))} />;
                    })}
                  </div>
                )}
                {selectedAlters.length > 0 && (
                  <label className="flex items-center justify-between gap-2 mt-2.5 px-1 cursor-pointer">
                    <span className="text-sm text-foreground">Still {terms.fronting} now</span>
                    <Switch checked={stillFronting} onCheckedChange={setStillFronting} />
                  </label>
                )}
                {selectedAlters.length > 0 && (
                  <p className="text-xs text-muted-foreground px-1 mt-1">
                    {stillFronting
                      ? `They'll stay on ${terms.front} after saving (an open ${terms.fronting} session).`
                      : `A closed ${terms.fronting} session is recorded for the activity's time.`}
                  </p>
                )}
              </div>
            )}

            {/* Contacts — purely descriptive (Activity.contact_ids); doesn't
                touch ContactEncounter/"currently with" state. */}
            {contactsOpen && (
              <div>
                <Button type="button" size="sm" variant="outline" onClick={() => setContactsPickerOpen(true)} className="w-full gap-2 text-xs">
                  <Users className="w-3.5 h-3.5" />
                  {selectedContactIds.length > 0 ? `Company: ${selectedContactIds.length} selected` : "Choose who you were with…"}
                </Button>
                {selectedContactIds.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {selectedContactIds.map((id) => {
                      const c = contactsById[id];
                      if (!c) return null;
                      return <SelectedContactChip key={id} contact={c} onRemove={() => setSelectedContactIds((prev) => prev.filter((x) => x !== id))} />;
                    })}
                  </div>
                )}
              </div>
            )}

            {notesOpen && (
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Notes</label>
                <MentionTextarea
                  value={notes}
                  onChange={setNotes}
                  alters={alters || []}
                  placeholder="Notes… @ to mention, /w @name [secret] to whisper"
                  className="h-20"
                />
              </div>
            )}
          </section>

          <div className="flex gap-2 justify-end pt-1 border-t border-border/40">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={isLoading} className="gap-1.5">
              {activeMode
                ? (<><Play className="w-4 h-4" /> Start activity</>)
                : (isLoading ? "Saving..." : "Save Activity")}
            </Button>
          </div>

          <SetFrontModal
            open={fronterPickerOpen}
            onClose={() => setFronterPickerOpen(false)}
            alters={alters || []}
            selectionMode
            preselectedIds={selectedAlters}
            onConfirm={(ids) => setSelectedAlters(ids)}
            confirmLabel="Add to activity"
          />
          <ContactMultiSelect
            isOpen={contactsPickerOpen}
            onClose={() => setContactsPickerOpen(false)}
            selectedContactIds={selectedContactIds}
            onChange={setSelectedContactIds}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
