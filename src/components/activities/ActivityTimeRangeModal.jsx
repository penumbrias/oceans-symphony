import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { format, addHours } from "date-fns";
import { toast } from "sonner";
import { X } from "lucide-react";
import ActivityPillSelector from "@/components/activities/ActivityPillSelector";

export default function ActivityTimeRangeModal({
  isOpen,
  onClose,
  startDate,
  startHour,
  endHour,
  allActivities,
  alters,
  frontingHistory,
  onSave,
}) {
  const [selectedActivityCategories, setSelectedActivityCategories] = useState([]);
  const [activityDuration, setActivityDuration] = useState("");
  const [selectedAlters, setSelectedAlters] = useState([]);
  const [notes, setNotes] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Calculate duration and determine default alters from fronting history
  const duration = useMemo(() => {
    if (startHour === undefined || endHour === undefined) return 0;
    return Math.abs(endHour - startHour) || 1; // 1 hour minimum if same hour
  }, [startHour, endHour]);

  // Auto-populate alters from fronting history
  useMemo(() => {
    if (startDate && startHour !== undefined && endHour !== undefined) {
      const startTime = addHours(startDate, Math.min(startHour, endHour));
      const endTime = addHours(startDate, Math.max(startHour, endHour) + 1);

      const relevantSessions = frontingHistory.filter((session) => {
        const sessionStart = new Date(session.start_time);
        const sessionEnd = session.end_time ? new Date(session.end_time) : new Date();
        return sessionStart < endTime && sessionEnd > startTime;
      });

      const alterIds = new Set();
      relevantSessions.forEach((session) => {
        if (session.primary_alter_id) alterIds.add(session.primary_alter_id);
        if (session.co_fronter_ids) session.co_fronter_ids.forEach((id) => alterIds.add(id));
      });

      setSelectedAlters(Array.from(alterIds));
    }
  }, [startDate, startHour, endHour, frontingHistory]);

  const handleToggleAlter = (alterId) => {
    setSelectedAlters((prev) =>
      prev.includes(alterId)
        ? prev.filter((id) => id !== alterId)
        : [...prev, alterId]
    );
  };

  const handleSave = async () => {
    if (selectedActivityCategories.length === 0) {
      toast.error("Select an activity");
      return;
    }

    setIsLoading(true);
    try {
      const timestamp = addHours(startDate, Math.min(startHour, endHour));
      await base44.functions.invoke('createActivityWithCategories', {
        activity_category_ids: selectedActivityCategories,
        duration_minutes: activityDuration ? parseInt(activityDuration) : duration * 60,
        fronting_alter_ids: selectedAlters,
        notes: notes || null,
        timestamp: timestamp.toISOString(),
      });

      setSelectedActivityCategories([]);
      setActivityDuration("");
      setSelectedAlters([]);
      setNotes("");
      onSave?.();
      onClose();
    } catch (err) {
      toast.error(err.message || "Failed to log activity");
    } finally {
      setIsLoading(false);
    }
  };

  const timeLabel =
    startHour !== undefined && endHour !== undefined
      ? `${String(Math.min(startHour, endHour)).padStart(2, "0")}:00 - ${String(Math.max(startHour, endHour) + 1).padStart(2, "0")}:00`
      : "Select time";

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Log Activity
            {startDate && (
              <>
                <div className="text-sm font-normal text-muted-foreground mt-2">
                  {format(startDate, "MMM d, yyyy")} • {timeLabel} ({duration}h)
                </div>
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Activities */}
          <ActivityPillSelector 
            selectedActivities={selectedActivityCategories}
            onActivityChange={setSelectedActivityCategories}
            duration={activityDuration}
            onDurationChange={setActivityDuration}
          />



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
            <label className="text-sm font-medium text-foreground">
              Notes - Optional
            </label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional notes..."
              className="mt-1 h-20"
            />
          </div>

          {/* Save button */}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isLoading} className="bg-primary hover:bg-primary/90">
              {isLoading ? "Saving..." : "Save Activity"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}