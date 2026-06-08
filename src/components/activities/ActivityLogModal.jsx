import React, { useState, useMemo, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { format, differenceInMinutes } from "date-fns";
import { toast } from "sonner";
import ActivityPillSelector from "@/components/activities/ActivityPillSelector";
import MentionTextarea from "@/components/shared/MentionTextarea";
import { SearchableMultiSelect } from "@/components/shared/SearchableSelect";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { applyWhisper } from "@/lib/whisperUtils";
import { useTerms } from "@/lib/useTerms";
import { ACTIVITY_STATUSES } from "@/lib/activityStatus";

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
  const [notes, setNotes] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  // Quick-duration presets: which end stays fixed when a preset is applied.
  // "end"  → preset sets START to (end − n).  "start" → sets END to (start + n).
  const [presetAnchor, setPresetAnchor] = useState("end");
  const [customAmt, setCustomAmt] = useState("");
  const [customUnit, setCustomUnit] = useState("m"); // "m" | "h"
  // Whether the selected fronters are STILL fronting now (open session) vs the
  // activity's front having ended (closed session). Defaults from end ≈ now.
  const [stillFronting, setStillFronting] = useState(true);

  const startDate = selectedDateStr ? new Date(`${selectedDateStr}T00:00:00`) : null;
  const endDate = endDateStr ? new Date(`${endDateStr}T00:00:00`) : startDate;
  const isCrossDay = selectedDateStr && endDateStr && selectedDateStr !== endDateStr;

  // Reset per open. Mirrors the mega-modal's useEffect approach — never
  // call setState during render, never key off Date objects directly.
  useEffect(() => {
    if (!isOpen) return;
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
  }, [isOpen, startDateProp, endDateProp, startHour, endHour, startMinute, endMinute]);

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

  const alterOptions = useMemo(
    () => (alters || []).filter((a) => !a.is_archived).map((a) => ({
      id: a.id, label: formatAlter(a), avatar_url: a.avatar_url, color: a.color, sublabel: a.pronouns || undefined,
    })),
    [alters, formatAlter]
  );

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
    if (selectedActivityCategories.length === 0) {
      toast.error("Select an activity");
      return;
    }
    if (!startTime) {
      toast.error("Set start time");
      return;
    }
    if (endTime && durationMinutes <= 0) {
      toast.error("End time must be after start time");
      return;
    }

    // "/w @name [secret]" in the notes hides that part behind a whisper bar
    // (no brackets warns first — an activity note is a personal record).
    const w = applyWhisper(notes || "", alters || [], { allowWholeBlur: false, rich: false, surfaceLabel: "note" });
    if (w === null) return;
    const finalNotes = w.content;

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
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Log Activity
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

        <div className="space-y-4">
          {/* Date */}
          <div>
            <label className="text-sm font-medium block mb-1">Date</label>
            <input
              type="date"
              value={selectedDateStr}
              onChange={(e) => {
                setSelectedDateStr(e.target.value);
                // Keep end date in sync unless the user has already split it.
                if (!isCrossDay) setEndDateStr(e.target.value);
              }}
              className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
            />
          </div>

          {/* Start / end time + duration */}
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="text-sm font-medium block mb-1">Time</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
              />
            </div>
            <div className="flex-1">
              <label className="text-sm font-medium block mb-1">
                End time
                {isCrossDay && endDate && (
                  <span className="ml-1 text-xs text-primary font-normal">{format(endDate, "MMM d")}</span>
                )}
              </label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
              />
            </div>
            {durationMinutes > 0 && (
              <div className="text-xs text-muted-foreground pb-2 whitespace-nowrap">
                {durationMinutes >= 60
                  ? `${Math.floor(durationMinutes / 60)}h ${durationMinutes % 60 > 0 ? durationMinutes % 60 + "m" : ""}`
                  : `${durationMinutes}m`}
              </div>
            )}
          </div>

          {/* Quick-duration presets. The "from end/start" toggle on the right
              decides which time stays fixed — e.g. "30m" from end sets the
              start to (end − 30m). */}
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

          {/* Activity categories */}
          <ActivityPillSelector
            selectedActivities={selectedActivityCategories}
            onActivityChange={setSelectedActivityCategories}
          />

          {/* Alters — searchable multi-select, same pattern as the rest of the app */}
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">
              Who was {terms.fronting}?
              {selectedAlters.length > 0 && (
                <span className="text-xs font-normal text-muted-foreground ml-2">
                  ({selectedAlters.length} selected)
                </span>
              )}
            </label>
            <SearchableMultiSelect
              value={selectedAlters}
              onChange={setSelectedAlters}
              options={alterOptions}
              placeholder={`Add ${terms.fronters || terms.alters}…`}
              searchPlaceholder={`Search ${terms.alters}…`}
            />
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

          {/* Notes */}
          <div>
            <label className="text-sm font-medium text-foreground">Notes — Optional</label>
            <MentionTextarea
              value={notes}
              onChange={setNotes}
              alters={alters || []}
              placeholder="Notes… @ to mention, /w @name [secret] to whisper"
              className="mt-1 h-20"
            />
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={isLoading}>
              {isLoading ? "Saving..." : "Save Activity"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
