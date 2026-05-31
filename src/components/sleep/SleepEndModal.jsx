import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ZapOff, Cloud, AlarmClock, BookOpen, X } from "lucide-react";

// Finalize an in-progress sleep record. Mirrors the fields of
// SleepLogModal but starts from an existing Sleep entity with
// `wake_time` null (the "I'm going to bed" entry created by the
// Start Sleep action). Updates the record in place, links an
// Activity row for the duration, and optionally writes a dream
// JournalEntry. Bedtime is read-only here — the user picked that
// when they started the log; if they need to amend it after the
// fact, the regular Edit modal handles that.
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

// Mirrors the InterruptionDetails in SleepLogModal / SleepEditModal so the
// "End sleep log" flow can capture how many times (and at what times) sleep
// was interrupted — previously the Interrupted toggle here revealed nothing.
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
      {/* Count stepper */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">How many times?</span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onCount(Math.max(0, count - 1))}
            className="w-7 h-7 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors text-base leading-none"
          >−</button>
          <span className="text-sm font-semibold w-4 text-center tabular-nums">{count || 0}</span>
          <button
            type="button"
            onClick={() => onCount((count || 0) + 1)}
            className="w-7 h-7 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors text-base leading-none"
          >+</button>
        </div>
      </div>

      {/* Specific times — optional */}
      <div>
        <div className="flex items-center gap-2">
          <input
            type="time"
            value={newTime}
            onChange={e => setNewTime(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addTime()}
            className="flex-1 rounded-lg border border-border bg-transparent px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
          <button
            type="button"
            onClick={addTime}
            className="text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-2.5 py-1.5 transition-colors whitespace-nowrap"
          >
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
  const d = new Date(iso);
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 16);
}

export default function SleepEndModal({ sleep, isOpen, onClose, onSave }) {
  const [wakeTime, setWakeTime] = useState("");
  const [quality, setQuality] = useState(0);
  const [notes, setNotes] = useState("");
  const [isInterrupted, setIsInterrupted] = useState(false);
  const [interruptionCount, setInterruptionCount] = useState(0);
  const [interruptionTimes, setInterruptionTimes] = useState([]);
  const [dreamed, setDreamed] = useState(false);
  const [hadNightmare, setHadNightmare] = useState(false);
  const [saveAsDream, setSaveAsDream] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleInterruptedToggle = (val) => {
    setIsInterrupted(val);
    if (!val) { setInterruptionCount(0); setInterruptionTimes([]); }
  };

  // Default wake time to "now" the moment the modal opens. We
  // intentionally don't pre-fill from `sleep.wake_time` because the
  // whole point of this modal is to STAMP wake time; if the user
  // amends a later wake time they can.
  useEffect(() => {
    if (!isOpen) return;
    setWakeTime(toLocalDatetime(new Date().toISOString()));
    setQuality(0);
    setNotes("");
    setIsInterrupted(false);
    setInterruptionCount(0);
    setInterruptionTimes([]);
    setDreamed(false);
    setHadNightmare(false);
    setSaveAsDream(false);
  }, [isOpen]);

  const bedtimeDate = sleep?.bedtime ? new Date(sleep.bedtime) : null;
  const liveDurationLabel = bedtimeDate
    ? formatDistanceToNow(bedtimeDate, { addSuffix: false })
    : "—";

  const handleSave = async () => {
    if (!wakeTime) {
      toast.error("Wake time is required");
      return;
    }
    if (!sleep?.id || !sleep.bedtime) {
      toast.error("No in-progress sleep to end");
      return;
    }
    setIsLoading(true);
    try {
      const wakeTimeISO = new Date(wakeTime).toISOString();
      const bedtimeISO = sleep.bedtime;
      if (new Date(wakeTimeISO) <= new Date(bedtimeISO)) {
        toast.error("Wake time must be after the bedtime you started with");
        setIsLoading(false);
        return;
      }
      const durationMinutes = Math.round((new Date(wakeTimeISO) - new Date(bedtimeISO)) / 60000);

      // Dream journal entry (optional). Mirrors SleepLogModal's
      // create-time behaviour so finalized sleeps look the same as
      // retroactively-logged ones.
      let journalEntryId = sleep.journal_entry_id || null;
      if (saveAsDream && notes.trim() && !journalEntryId) {
        const DREAM_FOLDER = "Dreams";
        try {
          const saved = JSON.parse(localStorage.getItem("os_journal_folders") || "[]");
          if (!saved.includes(DREAM_FOLDER)) {
            localStorage.setItem("os_journal_folders", JSON.stringify([...saved, DREAM_FOLDER]));
          }
          const title = `Dream — ${format(new Date(sleep.date || bedtimeISO), "MMMM d, yyyy")}`;
          const journal = await base44.entities.JournalEntry.create({
            title,
            content: notes.trim(),
            folder: DREAM_FOLDER,
            tags: [hadNightmare ? "nightmare" : "dream"],
            entry_type: "dream",
          });
          journalEntryId = journal?.id || null;
        } catch (journalErr) {
          console.warn("Failed to create linked dream journal entry", journalErr);
          toast.error("Sleep ended, but the dream journal entry couldn't be created");
        }
      }

      await base44.entities.Sleep.update(sleep.id, {
        wake_time: wakeTimeISO,
        quality: quality || null,
        notes: notes || null,
        is_interrupted: isInterrupted,
        interruption_count: isInterrupted ? (interruptionCount || interruptionTimes.length || null) : null,
        interruption_times: isInterrupted && interruptionTimes.length > 0 ? interruptionTimes : null,
        dreamed,
        had_nightmare: hadNightmare,
        journal_entry_id: journalEntryId,
      });

      // Create the linked Activity row. Mirrors SleepLogModal — the
      // Sleep entity is the source of truth, the Activity row is a
      // cosmetic mirror so the sleep block shows up on the Activity
      // Tracker's weekly grid. If the sleep already had a linked
      // activity (e.g. from an earlier failed end attempt) update
      // its duration instead.
      try {
        const categories = await base44.entities.ActivityCategory.list();
        let sleepCat = categories.find(c => c.name?.toLowerCase() === "sleep");
        if (!sleepCat) {
          sleepCat = await base44.entities.ActivityCategory.create({ name: "sleep", color: "#6366f1" });
        }
        if (sleep.linked_activity_id) {
          await base44.entities.Activity.update(sleep.linked_activity_id, {
            timestamp: bedtimeISO,
            duration_minutes: durationMinutes,
            notes: notes || null,
          });
        } else {
          const newAct = await base44.entities.Activity.create({
            timestamp: bedtimeISO,
            activity_name: "Sleep",
            duration_minutes: durationMinutes,
            activity_category_ids: [sleepCat.id],
            color: sleepCat.color,
            notes: notes || null,
            source_sleep_id: sleep.id,
          });
          await base44.entities.Sleep.update(sleep.id, { linked_activity_id: newAct.id });
        }
      } catch (actErr) {
        console.warn("Failed to mirror sleep into an Activity row", actErr);
      }

      onSave?.();
    } catch (err) {
      toast.error(err.message || "Failed to end sleep log");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => { if (!o) onClose?.(); }}>
      <DialogContent className="max-w-md flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>End sleep log</DialogTitle>
          <DialogDescription>
            Started{bedtimeDate ? ` ${liveDurationLabel} ago — at ${format(bedtimeDate, "EEE h:mm a")}` : ""}.
          </DialogDescription>
        </DialogHeader>

        {/* Scrollable body — the action buttons stay pinned below so
            they're always reachable even on short screens / with the
            keyboard open. */}
        <div className="space-y-4 overflow-y-auto min-h-0 flex-1 pr-0.5">
          <label className="block">
            <span className="text-sm font-medium">Wake time</span>
            <Input
              type="datetime-local"
              value={wakeTime}
              onChange={(e) => setWakeTime(e.target.value)}
              className="mt-1"
            />
            <p className="text-[0.6875rem] text-muted-foreground mt-1">
              Defaults to right now — adjust if you woke up earlier.
            </p>
          </label>

          {/* Quality as tappable 1–10 chips instead of a drag slider.
              The Radix drag-slider is unreliable on touch inside a
              modal — the horizontal drag gets swallowed as a scroll
              gesture and the 6px track is hard to grab — which is why
              "can't set the sleep quality" was reported. Chips are a
              plain tap, so they always register. Tapping the current
              value again clears it (back to unrated). */}
          <div>
            <label className="text-sm font-medium block mb-2">
              Quality (optional){quality ? ` — ${quality}/10` : ""}
            </label>
            <div className="grid grid-cols-10 gap-1">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setQuality((q) => (q === n ? 0 : n))}
                  aria-pressed={quality === n}
                  aria-label={`Quality ${n} of 10`}
                  className={`aspect-square rounded-md text-xs font-semibold border transition-colors ${
                    quality >= n && quality > 0
                      ? "bg-primary/20 border-primary/60 text-primary"
                      : "bg-card border-border/60 text-muted-foreground hover:bg-muted/40"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="grid grid-cols-3 gap-2">
              <TogglePill
                icon={AlarmClock}
                label="Interrupted"
                value={isInterrupted}
                onChange={handleInterruptedToggle}
                activeClass="border-orange-500/60 bg-orange-500/10 text-orange-500"
              />
              <TogglePill
                icon={Cloud}
                label="Dreamed"
                value={dreamed}
                onChange={(v) => { setDreamed(v); if (!v) setHadNightmare(false); }}
                activeClass="border-blue-500/60 bg-blue-500/10 text-blue-500"
              />
              <TogglePill
                icon={ZapOff}
                label="Nightmare"
                value={hadNightmare}
                onChange={(v) => { setHadNightmare(v); if (v) setDreamed(true); }}
                activeClass="border-red-500/60 bg-red-500/10 text-red-500"
              />
            </div>

            {/* Interruption details — only when "Interrupted" is on */}
            {isInterrupted && (
              <InterruptionDetails
                count={interruptionCount}
                onCount={setInterruptionCount}
                interruptionTimes={interruptionTimes}
                onTimesChange={setInterruptionTimes}
              />
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium">Notes (optional)</label>
              {/* Same always-available "Save to Dream Journal" toggle as the
                  past-log modal — previously this was a checkbox hidden until
                  you'd marked a dream and typed a note, so the option was easy
                  to miss when ending a sleep. */}
              <button
                type="button"
                onClick={() => setSaveAsDream((v) => !v)}
                className={cn(
                  "inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-all",
                  saveAsDream
                    ? "border-violet-500/60 bg-violet-500/10 text-violet-500"
                    : "border-border text-muted-foreground hover:border-border/80"
                )}
              >
                <BookOpen className="w-3 h-3" />
                {saveAsDream ? "Saving to Dream Journal" : "Save to Dream Journal"}
              </button>
            </div>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="How did you sleep? Any dreams?"
              rows={3}
            />
            {saveAsDream && !notes.trim() && (
              <p className="text-[0.6875rem] text-muted-foreground mt-1">
                Add a note above and it'll be saved as a Dream journal entry too.
              </p>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-border/50">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={isLoading}>
            {isLoading ? "Saving…" : "End sleep"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
