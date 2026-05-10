import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { format, addHours, differenceInMinutes } from "date-fns";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { useQuery } from "@tanstack/react-query";
import ActivityPillSelector from "@/components/activities/ActivityPillSelector";
import MentionTextarea from "@/components/shared/MentionTextarea";
import { Plus, MapPin, Zap } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { LEAD_STEPS, DEFAULT_LEAD_STEPS } from "@/lib/criticalPins";

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

export default function ActivityTimeRangeModal({
  isOpen,
  onClose,
  startDate: startDateProp,
  endDate: endDateProp,
  startHour,
  endHour, startMinute = 0,
  endMinute = 0,
  alters,
  frontingHistory,
  onSave,
  // When true, show date inputs and default to a near-future timestamp so the
  // user can plan an activity for any day rather than only tapping a slot.
  planMode = false,
}) {
  // For plan mode without an explicit start date, default to tomorrow noon so
  // the modal starts from a sensible plannable point.
  const defaultedStart = startDateProp || (planMode ? (() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(12, 0, 0, 0); return d; })() : null);
  // Local state for the chosen date (yyyy-mm-dd) so plan mode can edit it.
  const [datePicked, setDatePicked] = useState(() => defaultedStart ? format(defaultedStart, "yyyy-MM-dd") : "");
  const [endDatePicked, setEndDatePicked] = useState(() => (endDateProp || defaultedStart) ? format(endDateProp || defaultedStart, "yyyy-MM-dd") : "");
  const startDate = datePicked ? new Date(`${datePicked}T00:00:00`) : defaultedStart;
  const endDate = endDatePicked ? new Date(`${endDatePicked}T00:00:00`) : startDate;
  const isCrossDay = startDate && endDate && format(startDate, "yyyy-MM-dd") !== format(endDate, "yyyy-MM-dd");

  const defaultStart = startDate && startHour !== undefined
    ? toTimeString(startDate, Math.min(startHour, isCrossDay ? startHour : (endHour ?? startHour)))
    : (planMode && startDate ? toTimeString(startDate, 12, 0) : "");
  const defaultEnd = endDate && endHour != null
    ? toTimeString(endDate, endHour, endMinute)
    : (planMode && endDate ? toTimeString(endDate, 13, 0) : "");

  const [selectedActivityCategories, setSelectedActivityCategories] = useState([]);
  const [startTime, setStartTime] = useState(defaultStart);
  const [endTime, setEndTime] = useState(defaultEnd);
  const [selectedAlters, setSelectedAlters] = useState([]);
  const [notes, setNotes] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  // One-off plan details — only used in plan mode. Title (when set) becomes
  // the activity_name on save so users don't need to create a permanent
  // category for "Doctor's appointment" or similar one-time events.
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [isCritical, setIsCritical] = useState(false);
  const [leadSteps, setLeadSteps] = useState(DEFAULT_LEAD_STEPS);
  const queryClient = useQueryClient();
const [newActivityName, setNewActivityName] = useState("");
const [showNewActivity, setShowNewActivity] = useState(false);

  // Fetch categories so we can resolve names for direct entity saves
  const { data: activityCategories = [] } = useQuery({
    queryKey: ["activityCategories"],
    queryFn: () => base44.entities.ActivityCategory.list(),
  });

  // Reset times/date when modal opens with new props
useMemo(() => {
  if (!isOpen) return;
  // Reset the picked date back to whatever the parent passed in (or to the
  // plan-mode default tomorrow). Without this the date picker would persist
  // across opens, which is confusing.
  if (startDateProp) {
    setDatePicked(format(startDateProp, "yyyy-MM-dd"));
    setEndDatePicked(format(endDateProp || startDateProp, "yyyy-MM-dd"));
  } else if (planMode) {
    const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(12, 0, 0, 0);
    setDatePicked(format(d, "yyyy-MM-dd"));
    setEndDatePicked(format(d, "yyyy-MM-dd"));
  }
  if (startDateProp && startHour !== undefined) {
    setStartTime(toTimeString(startDateProp, startHour, startMinute));
    if (endHour != null) {
      setEndTime(toTimeString(endDateProp || startDateProp, endHour, endMinute));
    } else {
      setEndTime("");
    }
  } else if (planMode) {
    setStartTime("12:00");
    setEndTime("13:00");
  }
  setSelectedActivityCategories([]);
  setNotes("");
  setTitle("");
  setLocation("");
  setIsCritical(false);
  setLeadSteps(DEFAULT_LEAD_STEPS);
}, [isOpen, startDateProp, endDateProp, startHour, endHour, startMinute, endMinute, planMode]);

  // Auto-populate alters from fronting history
  useMemo(() => {
    if (startDate && startHour !== undefined && endHour !== undefined) {
      const startDt = new Date(startDate);
      startDt.setHours(Math.min(startHour, endHour), startMinute, 0, 0);
      const endDt = new Date(startDate);
      endDt.setHours(Math.max(startHour, endHour) + 1, endMinute, 0, 0);
      const relevantSessions = frontingHistory.filter((s) => {
        const ss = new Date(s.start_time);
        const se = s.end_time ? new Date(s.end_time) : new Date();
        return ss < endDt && se > startDt;
      });
      const alterIds = new Set();
      relevantSessions.forEach((s) => {
        if (s.primary_alter_id) alterIds.add(s.primary_alter_id);
        (s.co_fronter_ids || []).forEach((id) => alterIds.add(id));
      });
      setSelectedAlters(Array.from(alterIds));
    }
  }, [startDate, startHour, endHour, frontingHistory]);

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

  // Update handleSave to allow no duration:
const handleSave = async () => {
  const trimmedTitle = title.trim();
  // Title alone is enough to save a plan — categories are optional in plan
  // mode so one-offs (a doctor's appointment) don't pollute the category
  // list. For non-plan logging, a category is still required.
  if (selectedActivityCategories.length === 0 && !(planMode && trimmedTitle)) {
    toast.error(planMode ? "Add a title or pick an activity" : "Select an activity");
    return;
  }
  if (!startTime) { toast.error("Set start time"); return; }
  // Only validate end time if one was provided
  if (endTime && durationMinutes <= 0) { toast.error("End time must be after start time"); return; }

  setIsLoading(true);
  const timestamp = parseTimeToDate(startDate, startTime);
  const endDt = endTime ? parseTimeToDate(endDate || startDate, endTime) : null;

  try {
    const catById = Object.fromEntries(activityCategories.map(c => [c.id, c]));
    const isPlanned = timestamp.getTime() > Date.now();

    // Build the list of records to create. With categories: one per category
    // (existing behaviour). Without categories but with a title: a single
    // ad-hoc record with no category linkage.
    const records = selectedActivityCategories.length > 0
      ? selectedActivityCategories.map(catId => {
          const cat = catById[catId];
          return {
            activity_name: trimmedTitle || (cat?.name || catId),
            activity_category_ids: [catId],
            color: cat?.color,
          };
        })
      : [{ activity_name: trimmedTitle, activity_category_ids: [], color: undefined }];

    for (const r of records) {
      await base44.entities.Activity.create({
        timestamp: timestamp.toISOString(),
        activity_name: r.activity_name,
        activity_category_ids: r.activity_category_ids,
        ...(r.color ? { color: r.color } : {}),
        duration_minutes: durationMinutes > 0 ? durationMinutes : null, // null = logged pill
        fronting_alter_ids: selectedAlters,
        notes: notes || null,
        location: planMode && location.trim() ? location.trim() : null,
        is_planned: isPlanned,
        is_critical: planMode && isCritical ? true : false,
        critical_lead_steps: planMode && isCritical ? leadSteps : null,
        // For planned activities, treat selectedAlters as the assignees too
        // so the per-alter "Plans for me" surface picks them up.
        assigned_alter_ids: isPlanned ? selectedAlters : [],
      });
    }
    // ... rest of fronting session logic unchanged

      // Handle fronting session update if alters selected — but skip
      // entirely for planned (future) activities, since the alter isn't
      // actually fronting yet.
      if (selectedAlters.length > 0 && timestamp.getTime() <= Date.now()) {
        const now = new Date();
        const diffMins = (now - timestamp) / 60000;
        const isCurrentTime = diffMins < 10;
        const activeSessions = await base44.entities.FrontingSession.filter({ is_active: true });

        if (isCurrentTime && activeSessions.length > 0) {
          const session = activeSessions[0];
          const existing = [session.primary_alter_id, ...(session.co_fronter_ids || [])].filter(Boolean);
          const merged = [...new Set([...existing, ...selectedAlters])];
          await base44.entities.FrontingSession.update(session.id, {
            primary_alter_id: merged[0],
            co_fronter_ids: merged.slice(1),
          });
        } else {
          const isStillActive = endDt ? endDt >= now : true;
          await base44.entities.FrontingSession.create({
            primary_alter_id: selectedAlters[0],
            co_fronter_ids: selectedAlters.slice(1),
            start_time: timestamp.toISOString(),
            end_time: isStillActive ? null : endDt?.toISOString(),
            is_active: isStillActive,
          });
        }
      }

      setSelectedActivityCategories([]);
      setNotes("");
      setTitle("");
      setLocation("");
      setIsCritical(false);
      setLeadSteps(DEFAULT_LEAD_STEPS);
      onSave?.();
      onClose();
      toast.success(planMode ? "Plan saved!" : "Activity saved!");
    } catch (err) {
      toast.error(err.message || "Failed to log activity");
    } finally {
      setIsLoading(false);
    }
  };

const handleCreateNewActivity = async () => {
    if (!newActivityName.trim()) return;
    const newCat = await base44.entities.ActivityCategory.create({
      name: newActivityName.trim(),
      color: "#8b5cf6",
      parent_category_id: null,
    });
    queryClient.invalidateQueries({ queryKey: ["activityCategories"] });
    setSelectedActivityCategories(prev => [...prev, newCat.id]);
    setNewActivityName("");
    setShowNewActivity(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {planMode ? "Plan Activity" : "Log Activity"}
            {startDate && !planMode && (
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
          {planMode && (
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-sm font-medium block mb-1">Date</label>
                <input type="date" value={datePicked} onChange={e => { setDatePicked(e.target.value); if (!endDatePicked || endDatePicked < e.target.value) setEndDatePicked(e.target.value); }}
                  className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm" />
              </div>
              <div className="flex-1">
                <label className="text-sm font-medium block mb-1">End date <span className="text-xs text-muted-foreground">(optional)</span></label>
                <input type="date" value={endDatePicked} min={datePicked} onChange={e => setEndDatePicked(e.target.value)}
                  className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm" />
              </div>
            </div>
          )}
          {/* Start / End time */}
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="text-sm font-medium block mb-1">Time</label>
                <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
                  className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm" />
              </div>
              {(endHour != null || planMode) && (
                <div className="flex-1">
                  <label className="text-sm font-medium block mb-1">
                    End time
                    {isCrossDay && endDate && (
                      <span className="ml-1 text-xs text-primary font-normal">{format(endDate, "MMM d")}</span>
                    )}
                  </label>
                  <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
                    className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm" />
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

          {/* Title (plan mode only) — saves into activity_name. Lets users
              record a one-off plan without polluting their category list. */}
          {planMode && (
            <div>
              <label className="text-sm font-medium block mb-1">Title</label>
              <Input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Doctor's appointment, school pickup, etc."
                className="text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">Optional. Picking a category below works too — set both to tag a custom title with a colour.</p>
            </div>
          )}

          {/* Location (plan mode only) */}
          {planMode && (
            <div>
              <label className="text-sm font-medium flex items-center gap-1 mb-1"><MapPin className="w-3.5 h-3.5" /> Location <span className="text-xs text-muted-foreground">(optional)</span></label>
              <Input
                value={location}
                onChange={e => setLocation(e.target.value)}
                placeholder="Westside Clinic, kitchen, anywhere"
                className="text-sm"
              />
            </div>
          )}

          {/* Critical toggle + lead-step picker (plan mode only) */}
          {planMode && (
            <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2">
              <button
                type="button"
                onClick={() => setIsCritical(v => !v)}
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
                  <p className="text-xs text-muted-foreground mb-1.5">Pin to the top of the Dashboard:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {LEAD_STEPS.map(step => {
                      const active = leadSteps.includes(step.key);
                      return (
                        <button
                          key={step.key}
                          type="button"
                          onClick={() => setLeadSteps(prev => active ? prev.filter(k => k !== step.key) : [...prev, step.key])}
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

          {/* Activities */}
          <ActivityPillSelector
            selectedActivities={selectedActivityCategories}
            onActivityChange={setSelectedActivityCategories}
          />

          {showNewActivity ? (
            <div className="space-y-2">
              <Input placeholder="Activity name..." value={newActivityName}
                onChange={e => setNewActivityName(e.target.value)} className="text-sm" autoFocus />
              <div className="flex gap-2">
                <Button size="sm" variant="outline"
                  onClick={() => { setShowNewActivity(false); setNewActivityName(""); }}
                  className="flex-1">Cancel</Button>
                <Button size="sm" onClick={handleCreateNewActivity}
                  disabled={!newActivityName.trim()} className="flex-1">Add</Button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowNewActivity(true)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-primary transition-colors flex items-center justify-center gap-1">
              <Plus className="w-4 h-4" /> Create new activity
            </button>
          )}

          {/* Alters */}
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">
              Who was fronting?
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
                    id={`alter-${alter.id}`}
                  />
                  <label htmlFor={`alter-${alter.id}`} className="text-sm cursor-pointer flex-1">
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
              {isLoading ? "Saving..." : (planMode ? "Save Plan" : "Save Activity")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );

  
}