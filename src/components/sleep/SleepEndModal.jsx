import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ZapOff, Cloud, AlarmClock, BookOpen } from "lucide-react";

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
  const [dreamed, setDreamed] = useState(false);
  const [hadNightmare, setHadNightmare] = useState(false);
  const [saveAsDream, setSaveAsDream] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

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
            duration_minutes: durationMinutes,
          });
        } else {
          const newAct = await base44.entities.Activity.create({
            timestamp: bedtimeISO,
            activity_name: "Sleep",
            duration_minutes: durationMinutes,
            activity_category_ids: [sleepCat.id],
            color: sleepCat.color,
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

          <div className="grid grid-cols-3 gap-2">
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

          <div>
            <label className="text-sm font-medium block mb-1">Notes (optional)</label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="How did you sleep? Any dreams?"
              rows={3}
            />
            {(dreamed || hadNightmare) && notes.trim() && (
              <label className="flex items-center gap-2 mt-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={saveAsDream}
                  onChange={(e) => setSaveAsDream(e.target.checked)}
                  className="w-4 h-4 accent-primary"
                />
                <BookOpen className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-sm">Also save the note as a Dream journal entry</span>
              </label>
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
