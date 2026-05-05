import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { format } from "date-fns";
import { Loader2, BookOpen } from "lucide-react";

const SYMPTOMS = [
  { key: "anxiety", label: "Anxiety / worry" },
  { key: "reactivity", label: "Emotional reactivity" },
  { key: "dissociation", label: "Dissociation (DP/DR)" },
  { key: "memory", label: "Memory gaps" },
  { key: "tension", label: "Physical tension" },
];

function SymptomSlider({ label, value, onChange }) {
  const color =
    value <= 3 ? "bg-green-400" : value <= 6 ? "bg-yellow-400" : "bg-red-400";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-foreground">{label}</span>
        <span className={`font-semibold text-sm px-2 py-0.5 rounded-full text-white ${color}`}>
          {value}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={10}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-primary h-2 cursor-pointer"
      />
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>0</span>
        <span>5</span>
        <span>10</span>
      </div>
    </div>
  );
}

function buildContent({ trigger, before, after, symptoms, notes }) {
  const symptomLines = SYMPTOMS.map(
    (s) => `- ${s.label}: **${symptoms[s.key]}/10**`
  ).join("\n");

  return `**What triggered the switch?**
${trigger || "—"}

**How were you feeling before?**
${before || "—"}

**How were you feeling after?**
${after || "—"}

### Symptoms (0–10)
${symptomLines}

### Notes
${notes || "—"}`;
}

export default function SwitchJournalModal({ open, onClose, sessionId, authorAlterId, defaultTrigger = "" }) {
  const now = new Date();
  const [title, setTitle] = useState(`Switch Log — ${format(now, "MMM d, yyyy")}`);
  const [trigger, setTrigger] = useState(defaultTrigger);
  const [before, setBefore] = useState("");
  const [after, setAfter] = useState("");
  const [symptoms, setSymptoms] = useState({
    anxiety: 0,
    reactivity: 0,
    dissociation: 0,
    memory: 0,
    tension: 0,
  });
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const setSymptom = (key, val) => setSymptoms((s) => ({ ...s, [key]: val }));

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const content = buildContent({ trigger, before, after, symptoms, notes });
      await base44.entities.JournalEntry.create({
        title,
        content: `## ${title} (${format(now, "MMMM d, yyyy · h:mm a")})\n\n${content}`,
        entry_type: "switch_log",
        tags: ["switch"],
        author_alter_id: authorAlterId || "",
        fronting_session_id: sessionId || "",
        allowed_alter_ids: [],
      });
      toast.success("Switch journal saved!");
      onClose();
    } catch (err) {
      toast.error(err.message || "Failed to save journal");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[90vh] flex flex-col overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-primary" />
            Switch Journal
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 flex-1">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Entry title"
            className="font-medium"
          />

          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">What triggered the switch?</label>
            <Textarea
              value={trigger}
              onChange={(e) => setTrigger(e.target.value)}
              placeholder="e.g. loud noise, stressful conversation..."
              className="resize-none min-h-[60px] text-sm"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">How were you feeling before?</label>
            <Textarea
              value={before}
              onChange={(e) => setBefore(e.target.value)}
              placeholder="Emotional state before the switch..."
              className="resize-none min-h-[60px] text-sm"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">How were you feeling after?</label>
            <Textarea
              value={after}
              onChange={(e) => setAfter(e.target.value)}
              placeholder="Emotional state after the switch..."
              className="resize-none min-h-[60px] text-sm"
            />
          </div>

          <div className="space-y-3 rounded-lg bg-muted/40 p-4 border border-border/50">
            <p className="text-sm font-semibold text-foreground">Symptoms (0–10)</p>
            {SYMPTOMS.map((s) => (
              <SymptomSlider
                key={s.key}
                label={s.label}
                value={symptoms[s.key]}
                onChange={(val) => setSymptom(s.key, val)}
              />
            ))}
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">Notes</label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything else to note..."
              className="resize-none min-h-[60px] text-sm"
            />
          </div>
        </div>

        <div className="flex gap-2 pt-3 border-t border-border/50 mt-2">
          <Button variant="outline" onClick={onClose} className="flex-1">
            Skip
          </Button>
          <Button onClick={handleSave} loading={saving} disabled={saving} className="flex-1 bg-primary hover:bg-primary/90">
            Save Journal
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}