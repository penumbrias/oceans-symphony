import React, { useState } from "react";
import { parseSessionSymptoms } from "@/lib/perAlterSessionEntries";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { format } from "date-fns";
import { BookOpen } from "lucide-react";
import { useTerms } from "@/lib/useTerms";
import { useQuery } from "@tanstack/react-query";
import MentionTextarea from "@/components/shared/MentionTextarea";
import { prepareAuthoredText, recordAuthoredText, isLogCommandError } from "@/lib/authoredText";

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

  // When a textarea above the slider has focus, touching the slider on
  // Android doesn't blur the text input — so the IME stays up and slides
  // the whole viewport over the sliders. Blurring the active element on
  // the slider's pointerdown dismisses the keyboard before the user
  // starts dragging.
  const dismissKeyboard = () => {
    const el = document.activeElement;
    if (el && el !== document.body && typeof el.blur === "function") {
      const tag = el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable) {
        el.blur();
      }
    }
  };

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
        onPointerDown={dismissKeyboard}
        onTouchStart={dismissKeyboard}
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
  const terms = useTerms();
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  const now = new Date();
  const [title, setTitle] = useState(`${terms.Switch} Log — ${format(now, "MMM d, yyyy")}`);
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
    // ONE pipeline for the notes: ~commands, whispers, signposts, @mentions.
    let prepared, pTrigger, pBefore, pAfter;
    try {
      prepared = await prepareAuthoredText(notes || "", { alters, terms, surfaceLabel: "journal", baseAuthorIds: authorAlterId ? [authorAlterId] : [] });
      // The three prompts run the same pipeline (commands, whispers) but
      // don't re-sign the entry — only the notes field carries signposts.
      const promptOpts = { alters, terms, surfaceLabel: "journal", signposts: false };
      pTrigger = await prepareAuthoredText(trigger || "", promptOpts);
      pBefore = await prepareAuthoredText(before || "", promptOpts);
      pAfter = await prepareAuthoredText(after || "", promptOpts);
    }
    catch (e) { if (isLogCommandError(e)) { toast.error(e.message); return; } throw e; }
    if (prepared === null || pTrigger === null || pBefore === null || pAfter === null) return;
    setSaving(true);
    try {
      const cleanNotes = prepared.content;
      const cleanTrigger = pTrigger.content, cleanBefore = pBefore.content, cleanAfter = pAfter.content;
      const content = buildContent({ trigger: cleanTrigger, before: cleanBefore, after: cleanAfter, symptoms, notes: cleanNotes });
      const entry = await base44.entities.JournalEntry.create({
        title,
        content: `## ${title} (${format(now, "MMMM d, yyyy · h:mm a")})\n\n${content}`,
        entry_type: "switch_log",
        tags: ["switch"],
        author_alter_id: prepared.authorIds[0] || authorAlterId || "",
        author_alter_ids: prepared.authorIds,
        fronting_session_id: sessionId || "",
        allowed_alter_ids: [],
        switch_data: { trigger: cleanTrigger, before: cleanBefore, after: cleanAfter, symptoms },
      });
      await recordAuthoredText({ ...prepared, content: [cleanTrigger, cleanBefore, cleanAfter, cleanNotes].filter(Boolean).join("\n"), recipientIds: [...new Set([...(prepared.recipientIds || []), ...(pTrigger.recipientIds || []), ...(pBefore.recipientIds || []), ...(pAfter.recipientIds || [])])], alters, sourceType: "journal", sourceId: entry?.id || "", sourceLabel: `${terms.Switch} journal`, navigatePath: entry?.id ? `/journals?id=${entry.id}` : "/journals" });
      // Sync trigger info back to the fronting session for analytics
      if (sessionId) {
        const patch = {};
        if (cleanTrigger) { patch.is_triggered_switch = true; patch.trigger_label = cleanTrigger; }
        const symptomEntries = SYMPTOMS.map(s => ({ id: s.key, label: s.label, value: symptoms[s.key], type: "slider" }));
        // Merge into whatever the fronter panel already logged on this
        // session (this used to replace the whole array wholesale).
        // must be JSON-encoded string — perAlterSessionEntries.js JSON.parses on read
        try {
          const fresh = await base44.entities.FrontingSession.get(sessionId);
          const existing = parseSessionSymptoms(fresh?.session_symptoms).filter(e => !SYMPTOMS.some(s => s.key === e?.id));
          patch.session_symptoms = JSON.stringify([...existing, ...symptomEntries]);
          await base44.entities.FrontingSession.update(sessionId, patch);
        } catch {}
      }
      toast.success(`${terms.Switch} journal saved!`);
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
            {terms.Switch} Journal
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
            <label className="text-sm font-medium text-foreground">What triggered the {terms.switch}?</label>
            <MentionTextarea
              alters={alters}
              signposts
              value={trigger}
              onChange={setTrigger}
              placeholder="e.g. loud noise, stressful conversation..."
              className="resize-none min-h-[60px] text-sm"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">How were you feeling before?</label>
            <MentionTextarea
              alters={alters}
              signposts
              value={before}
              onChange={setBefore}
              placeholder={`Emotional state before the ${terms.switch}...`}
              className="resize-none min-h-[60px] text-sm"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">How were you feeling after?</label>
            <MentionTextarea
              alters={alters}
              signposts
              value={after}
              onChange={setAfter}
              placeholder={`Emotional state after the ${terms.switch}...`}
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
            <MentionTextarea
              value={notes}
              onChange={setNotes}
              alters={alters}
              signposts
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