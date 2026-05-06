import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ZapOff, Cloud, AlarmClock, Plus, X, BookOpen, Loader2 } from "lucide-react";

function TogglePill({ icon: Icon, label, value, onChange, activeClass }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={cn(
        "flex-1 flex flex-col items-center gap-1 py-2.5 px-1 rounded-xl border-2 text-xs font-medium transition-all select-none",
        value ? activeClass : "border-border bg-card text-muted-foreground hover:border-border/80"
      )}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}

function InterruptionDetails({ count, onCount, interruptionTimes, onTimesChange }) {
  const [newTime, setNewTime] = useState("");

  const addTime = () => {
    const t = newTime.trim();
    if (!t) return;
    const updated = [...interruptionTimes, t];
    onTimesChange(updated);
    if (updated.length > count) onCount(updated.length);
    setNewTime("");
  };

  const removeTime = (i) => onTimesChange(interruptionTimes.filter((_, idx) => idx !== i));

  return (
    <div className="mt-2 space-y-3 pl-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">How many times?</span>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => onCount(Math.max(0, count - 1))}
            className="w-7 h-7 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors text-base leading-none">−</button>
          <span className="text-sm font-semibold w-4 text-center tabular-nums">{count || 0}</span>
          <button type="button" onClick={() => onCount((count || 0) + 1)}
            className="w-7 h-7 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors text-base leading-none">+</button>
        </div>
      </div>
      <div>
        <div className="flex items-center gap-2">
          <input type="time" value={newTime} onChange={e => setNewTime(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addTime()}
            className="flex-1 rounded-lg border border-border bg-transparent px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40" />
          <button type="button" onClick={addTime}
            className="text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-2.5 py-1.5 transition-colors whitespace-nowrap">
            + Add time
          </button>
        </div>
        {interruptionTimes.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {interruptionTimes.map((t, i) => (
              <span key={i} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-500 border border-orange-500/20">
                {t}
                <button type="button" onClick={() => removeTime(i)} className="hover:opacity-70 leading-none">
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground/60 mt-1.5">Specific times are optional</p>
      </div>
    </div>
  );
}

function toLocalDatetime(iso) {
  if (!iso) return "";
  try { return format(parseISO(iso), "yyyy-MM-dd'T'HH:mm"); } catch { return ""; }
}

export default function SleepEditModal({ sleep, onClose, onSave }) {
  const [sleepDate, setSleepDate] = useState("");
  const [bedtime, setBedtime] = useState("");
  const [wakeTime, setWakeTime] = useState("");
  const [quality, setQuality] = useState(5);
  const [notes, setNotes] = useState("");
  const [isInterrupted, setIsInterrupted] = useState(false);
  const [dreamed, setDreamed] = useState(false);
  const [hadNightmare, setHadNightmare] = useState(false);
  const [interruptionCount, setInterruptionCount] = useState(0);
  const [interruptionTimes, setInterruptionTimes] = useState([]);
  const [saveAsDream, setSaveAsDream] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!sleep) return;
    setSleepDate(sleep.date || "");
    setBedtime(toLocalDatetime(sleep.bedtime));
    setWakeTime(toLocalDatetime(sleep.wake_time));
    setQuality(sleep.quality || 5);
    setNotes(sleep.notes || "");
    setIsInterrupted(!!sleep.is_interrupted);
    setDreamed(!!sleep.dreamed);
    setHadNightmare(!!sleep.had_nightmare);
    setInterruptionCount(sleep.interruption_count || 0);
    setInterruptionTimes(sleep.interruption_times || []);
  }, [sleep]);

  const handleNightmareToggle = (val) => {
    setHadNightmare(val);
    if (val) setDreamed(true);
  };

  const handleInterruptedToggle = (val) => {
    setIsInterrupted(val);
    if (!val) { setInterruptionCount(0); setInterruptionTimes([]); }
  };

  const handleSave = async () => {
    if (!bedtime || !wakeTime) {
      toast.error("Bedtime and wake time are required");
      return;
    }
    setSaving(true);
    try {
      const bedtimeISO = new Date(bedtime).toISOString();
      const wakeTimeISO = new Date(wakeTime).toISOString();

      await base44.entities.Sleep.update(sleep.id, {
        date: sleepDate,
        bedtime: bedtimeISO,
        wake_time: wakeTimeISO,
        quality: quality || null,
        notes: notes || null,
        is_interrupted: isInterrupted,
        interruption_count: isInterrupted ? (interruptionCount || interruptionTimes.length || null) : null,
        interruption_times: isInterrupted && interruptionTimes.length > 0 ? interruptionTimes : null,
        dreamed,
        had_nightmare: hadNightmare,
      });

      if (saveAsDream && notes.trim()) {
        const DREAM_FOLDER = "Dreams";
        const saved = JSON.parse(localStorage.getItem("os_journal_folders") || "[]");
        if (!saved.includes(DREAM_FOLDER)) {
          localStorage.setItem("os_journal_folders", JSON.stringify([...saved, DREAM_FOLDER]));
        }
        const title = `Dream — ${format(new Date(sleepDate), "MMMM d, yyyy")}`;
        await base44.entities.JournalEntry.create({
          title,
          content: notes.trim(),
          folder: DREAM_FOLDER,
          tags: [hadNightmare ? "nightmare" : "dream"],
          entry_type: "dream",
        });
      }

      toast.success("Sleep record updated!");
      onSave?.();
      onClose();
    } catch (err) {
      toast.error(err.message || "Failed to update sleep record");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Sleep Record</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground">Date</label>
            <Input type="date" value={sleepDate} onChange={e => setSleepDate(e.target.value)} className="mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Bedtime</label>
            <Input type="datetime-local" value={bedtime} onChange={e => setBedtime(e.target.value)} className="mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Wake time</label>
            <Input type="datetime-local" value={wakeTime} onChange={e => setWakeTime(e.target.value)} className="mt-1" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-foreground">Sleep quality</label>
              <span className="text-sm font-semibold text-primary">{quality}/10</span>
            </div>
            <Slider value={[quality]} onValueChange={v => setQuality(v[0])} min={1} max={10} step={1} className="w-full" />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">Sleep notes</label>
            <div className="flex gap-2">
              <TogglePill icon={AlarmClock} label="Interrupted" value={isInterrupted} onChange={handleInterruptedToggle}
                activeClass="border-orange-500/60 bg-orange-500/10 text-orange-500" />
              <TogglePill icon={Cloud} label="Dreamed" value={dreamed}
                onChange={v => { setDreamed(v); if (!v) setHadNightmare(false); }}
                activeClass="border-blue-500/60 bg-blue-500/10 text-blue-500" />
              <TogglePill icon={ZapOff} label="Nightmare" value={hadNightmare} onChange={handleNightmareToggle}
                activeClass="border-red-500/60 bg-red-500/10 text-red-500" />
            </div>
            {isInterrupted && (
              <InterruptionDetails count={interruptionCount} onCount={setInterruptionCount}
                interruptionTimes={interruptionTimes} onTimesChange={setInterruptionTimes} />
            )}
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-foreground">Notes — Optional</label>
              <button type="button" onClick={() => setSaveAsDream(v => !v)}
                className={cn(
                  "inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-all",
                  saveAsDream
                    ? "border-violet-500/60 bg-violet-500/10 text-violet-500"
                    : "border-border text-muted-foreground hover:border-border/80"
                )}>
                <BookOpen className="w-3 h-3" />
                {saveAsDream ? "Saving to Dream Journal" : "Save to Dream Journal"}
              </button>
            </div>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Any notes about your sleep..." className="mt-1 h-20" />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-primary hover:bg-primary/90">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Changes"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
