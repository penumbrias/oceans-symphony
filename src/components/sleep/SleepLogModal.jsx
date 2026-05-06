import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ZapOff, Cloud, AlarmClock } from "lucide-react";

function TogglePill({ icon: Icon, label, value, onChange, activeClass }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={cn(
        "flex-1 flex flex-col items-center gap-1 py-2.5 px-1 rounded-xl border-2 text-xs font-medium transition-all select-none",
        value
          ? activeClass
          : "border-border bg-card text-muted-foreground hover:border-border/80"
      )}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}

export default function SleepLogModal({ isOpen, onClose, onSave, selectedDate }) {
  const [bedtime, setBedtime] = useState("");
  const [wakeTime, setWakeTime] = useState("");
  const [quality, setQuality] = useState(5);
  const [notes, setNotes] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sleepDate, setSleepDate] = useState("");
  const [isInterrupted, setIsInterrupted] = useState(false);
  const [dreamed, setDreamed] = useState(false);
  const [hadNightmare, setHadNightmare] = useState(false);

  React.useEffect(() => {
    if (isOpen && selectedDate) {
      const currentDayStr = format(selectedDate, "yyyy-MM-dd");
      const prevDay = new Date(selectedDate);
      prevDay.setDate(prevDay.getDate() - 1);
      const prevDayStr = format(prevDay, "yyyy-MM-dd");
      setSleepDate(currentDayStr);
      setBedtime(`${prevDayStr}T23:00`);
      setWakeTime(`${currentDayStr}T07:00`);
    }
    if (!isOpen) {
      setIsInterrupted(false);
      setDreamed(false);
      setHadNightmare(false);
      setNotes("");
      setQuality(5);
    }
  }, [isOpen, selectedDate]);

  // Auto-set dreamed when nightmare is checked
  const handleNightmareToggle = (val) => {
    setHadNightmare(val);
    if (val) setDreamed(true);
  };

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
      const durationMinutes = Math.round((new Date(wakeTimeISO) - new Date(bedtimeISO)) / 60000);

      const categories = await base44.entities.ActivityCategory.list();
      let sleepCat = categories.find(c => c.name?.toLowerCase() === "sleep");
      if (!sleepCat) {
        sleepCat = await base44.entities.ActivityCategory.create({ name: "sleep", color: "#6366f1" });
      }

      await base44.entities.Sleep.create({
        date: dateStr,
        bedtime: bedtimeISO,
        wake_time: wakeTimeISO,
        quality: quality || null,
        notes: notes || null,
        is_interrupted: isInterrupted,
        dreamed,
        had_nightmare: hadNightmare,
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
      setIsInterrupted(false);
      setDreamed(false);
      setHadNightmare(false);
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
            <Input type="date" value={sleepDate} onChange={(e) => setSleepDate(e.target.value)} className="mt-1" />
          </div>

          <div>
            <label className="text-sm font-medium text-foreground">Bedtime</label>
            <Input type="datetime-local" value={bedtime} onChange={(e) => setBedtime(e.target.value)} className="mt-1" />
          </div>

          <div>
            <label className="text-sm font-medium text-foreground">Wake time</label>
            <Input type="datetime-local" value={wakeTime} onChange={(e) => setWakeTime(e.target.value)} className="mt-1" />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-foreground">Sleep quality</label>
              <span className="text-sm font-semibold text-primary">{quality}/10</span>
            </div>
            <Slider value={[quality]} onValueChange={(v) => setQuality(v[0])} min={1} max={10} step={1} className="w-full" />
          </div>

          {/* Sleep quality toggles */}
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">Sleep notes</label>
            <div className="flex gap-2">
              <TogglePill
                icon={AlarmClock}
                label="Interrupted"
                value={isInterrupted}
                onChange={setIsInterrupted}
                activeClass="border-orange-500/60 bg-orange-500/10 text-orange-500"
              />
              <TogglePill
                icon={Cloud}
                label="Dreamed"
                value={dreamed}
                onChange={v => { setDreamed(v); if (!v) setHadNightmare(false); }}
                activeClass="border-blue-500/60 bg-blue-500/10 text-blue-500"
              />
              <TogglePill
                icon={ZapOff}
                label="Nightmare"
                value={hadNightmare}
                onChange={handleNightmareToggle}
                activeClass="border-red-500/60 bg-red-500/10 text-red-500"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-foreground">Notes — Optional</label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any notes about your sleep..."
              className="mt-1 h-20"
            />
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} loading={isLoading} disabled={isLoading} className="bg-primary hover:bg-primary/90">
              Save Sleep
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
