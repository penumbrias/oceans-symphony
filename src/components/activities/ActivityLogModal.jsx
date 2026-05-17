import React, { useState, useMemo, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { format, differenceInMinutes } from "date-fns";
import { toast } from "sonner";
import ActivityPillSelector from "@/components/activities/ActivityPillSelector";
import MentionTextarea from "@/components/shared/MentionTextarea";
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
  const startDate = startDateProp || null;
  const endDate = endDateProp || startDateProp || null;
  const isCrossDay = startDate && endDate && format(startDate, "yyyy-MM-dd") !== format(endDate, "yyyy-MM-dd");

  const [selectedActivityCategories, setSelectedActivityCategories] = useState([]);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [selectedAlters, setSelectedAlters] = useState([]);
  const [notes, setNotes] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Reset per open. Mirrors the mega-modal's useEffect approach — never
  // call setState during render, never key off Date objects directly.
  useEffect(() => {
    if (!isOpen) return;
    if (startDate && startHour !== undefined) {
      setStartTime(toTimeString(startDate, startHour, startMinute));
      if (endHour != null) {
        setEndTime(toTimeString(endDate || startDate, endHour, endMinute));
      } else {
        setEndTime("");
      }
    } else {
      setStartTime("");
      setEndTime("");
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

  const handleToggleAlter = (alterId) => {
    setSelectedAlters((prev) =>
      prev.includes(alterId) ? prev.filter((id) => id !== alterId) : [...prev, alterId]
    );
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

    setIsLoading(true);
    const timestamp = parseTimeToDate(startDate, startTime);
    const endDt = endTime ? parseTimeToDate(endDate || startDate, endTime) : null;

    try {
      const catById = Object.fromEntries(activityCategories.map((c) => [c.id, c]));
      for (const catId of selectedActivityCategories) {
        const cat = catById[catId];
        await base44.entities.Activity.create({
          timestamp: timestamp.toISOString(),
          activity_name: cat?.name || catId,
          activity_category_ids: [catId],
          ...(cat?.color ? { color: cat.color } : {}),
          duration_minutes: durationMinutes > 0 ? durationMinutes : null,
          fronting_alter_ids: selectedAlters,
          notes: notes || null,
          is_planned: false,
          status: ACTIVITY_STATUSES.LOGGED,
        });
      }

      // Fronting-session sync — only for the past-time log path. Same
      // logic the mega-modal had: never promote based on selection order;
      // a brand-new front gets a fresh set of co-fronter sessions, an
      // existing front gets new co-fronters joined to it.
      if (selectedAlters.length > 0 && timestamp.getTime() <= Date.now()) {
        const now = new Date();
        const diffMins = (now - timestamp) / 60000;
        const isCurrentTime = diffMins < 10;
        const activeSessions = await base44.entities.FrontingSession.filter({ is_active: true });
        if (isCurrentTime && activeSessions.length > 0) {
          const alreadyActive = new Set();
          for (const s of activeSessions) {
            if (s.alter_id) alreadyActive.add(s.alter_id);
            if (s.primary_alter_id) alreadyActive.add(s.primary_alter_id);
            for (const id of (s.co_fronter_ids || [])) alreadyActive.add(id);
          }
          for (const alterId of selectedAlters) {
            if (alreadyActive.has(alterId)) continue;
            await base44.entities.FrontingSession.create({
              alter_id: alterId,
              is_primary: false,
              start_time: timestamp.toISOString(),
              is_active: true,
            });
          }
        } else {
          const isStillActive = endDt ? endDt >= now : true;
          for (const alterId of selectedAlters) {
            await base44.entities.FrontingSession.create({
              alter_id: alterId,
              is_primary: false,
              start_time: timestamp.toISOString(),
              end_time: isStillActive ? null : endDt?.toISOString(),
              is_active: isStillActive,
            });
          }
        }
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
          {/* Start / end time */}
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
            {endHour != null && (
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
            )}
            {durationMinutes > 0 && (
              <div className="text-xs text-muted-foreground pb-2 whitespace-nowrap">
                {durationMinutes >= 60
                  ? `${Math.floor(durationMinutes / 60)}h ${durationMinutes % 60 > 0 ? durationMinutes % 60 + "m" : ""}`
                  : `${durationMinutes}m`}
              </div>
            )}
          </div>

          {/* Activity categories */}
          <ActivityPillSelector
            selectedActivities={selectedActivityCategories}
            onActivityChange={setSelectedActivityCategories}
          />

          {/* Alters */}
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">
              Who was {terms.fronting}?
              {selectedAlters.length > 0 && (
                <span className="text-xs font-normal text-muted-foreground ml-2">
                  ({selectedAlters.length} selected)
                </span>
              )}
            </label>
            <div className="space-y-2 max-h-40 overflow-y-auto border border-border rounded-lg p-3 bg-muted/20">
              {alters.map((alter) => (
                <div key={alter.id} className="flex items-center gap-2">
                  <Checkbox
                    checked={selectedAlters.includes(alter.id)}
                    onCheckedChange={() => handleToggleAlter(alter.id)}
                    id={`log-alter-${alter.id}`}
                  />
                  <label htmlFor={`log-alter-${alter.id}`} className="text-sm cursor-pointer flex-1">
                    {alter.alias || alter.name}
                  </label>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-sm font-medium text-foreground">Notes — Optional</label>
            <MentionTextarea
              value={notes}
              onChange={setNotes}
              alters={alters || []}
              placeholder="Any additional notes..."
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
