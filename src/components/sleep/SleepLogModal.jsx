import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { format } from "date-fns";
import { toast } from "sonner";

export default function SleepLogModal({
  isOpen,
  onClose,
  onSave,
  selectedDate,
}) {
  const [bedtime, setBedtime] = useState("");
  const [wakeTime, setWakeTime] = useState("");
  const [quality, setQuality] = useState(5);
  const [notes, setNotes] = useState("");
  const [isLoading, setIsLoading] = useState(false);
const [sleepDate, setSleepDate] = useState("");

React.useEffect(() => {
  if (isOpen && selectedDate) {
    const currentDayStr = format(selectedDate, "yyyy-MM-dd");
    const prevDay = new Date(selectedDate);
    prevDay.setDate(prevDay.getDate() - 1);
    const prevDayStr = format(prevDay, "yyyy-MM-dd");
    setSleepDate(currentDayStr);  // add this
    setBedtime(`${prevDayStr}T23:00`);
    setWakeTime(`${currentDayStr}T07:00`);
  }
}, [isOpen, selectedDate]);

const handleSave = async () => {
  if (!bedtime || !wakeTime) {
    toast.error("Bedtime and wake time are required");
    return;
  }

  setIsLoading(true);
  try {
    const dateStr = sleepDate || format(selectedDate || new Date(), "yyyy-MM-dd");
    const bedtimeISO = new Date(bedtime).toISOString();
    const wakeTimeISO = new Date(wakeTime).toISOString();
    const durationMinutes = Math.round(
      (new Date(wakeTimeISO) - new Date(bedtimeISO)) / 60000
    );

    // Find sleep category if it exists
    const categories = await base44.entities.ActivityCategory.list();
    let sleepCat = categories.find(c => c.name?.toLowerCase() === "sleep");
    
    // Create it if it doesn't exist
    if (!sleepCat) {
      sleepCat = await base44.entities.ActivityCategory.create({
        name: "sleep",
        color: "#6366f1",
      });
    }

    await base44.entities.Sleep.create({
      date: dateStr,
      bedtime: bedtimeISO,
      wake_time: wakeTimeISO,
      quality: quality || null,
      notes: notes || null,
    });

    await base44.entities.Activity.create({
      timestamp: bedtimeISO,
      activity_name: "Sleep",
      duration_minutes: durationMinutes,
      color: "#6366f1",
      notes: notes || null,
      activity_category_ids: [sleepCat.id],
    });

    toast.success("Sleep logged!");
    setBedtime("");
    setWakeTime("");
    setQuality(5);
    setNotes("");
    setSleepDate("");
    onSave?.();
    onClose();
  } catch (err) {
    toast.error(err.message || "Failed to log sleep");
  } finally {
    setIsLoading(false);
  }
};

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Log Sleep{selectedDate && ` - ${format(selectedDate, "MMM d")}`}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
        <div>
  <label className="text-sm font-medium text-foreground">Date</label>
  <Input
    type="date"
    value={sleepDate}
    onChange={(e) => setSleepDate(e.target.value)}
    className="mt-1"
  />
</div>
          {/* Bedtime */}
          <div>
            <label className="text-sm font-medium text-foreground">
              Bedtime
            </label>
            <Input
              type="datetime-local"
              value={bedtime}
              onChange={(e) => setBedtime(e.target.value)}
              className="mt-1"
            />
          </div>

          {/* Wake time */}
          <div>
            <label className="text-sm font-medium text-foreground">
              Wake time
            </label>
            <Input
              type="datetime-local"
              value={wakeTime}
              onChange={(e) => setWakeTime(e.target.value)}
              className="mt-1"
            />
          </div>

          {/* Quality */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-foreground">
                Sleep quality
              </label>
              <span className="text-sm font-semibold text-primary">
                {quality}/10
              </span>
            </div>
            <Slider
              value={[quality]}
              onValueChange={(value) => setQuality(value[0])}
              min={1}
              max={10}
              step={1}
              className="w-full"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="text-sm font-medium text-foreground">
              Notes - Optional
            </label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any notes about your sleep..."
              className="mt-1 h-20"
            />
          </div>

          {/* Save button */}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              loading={isLoading}
              disabled={isLoading}
              className="bg-primary hover:bg-primary/90"
            >
              Save Sleep
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}