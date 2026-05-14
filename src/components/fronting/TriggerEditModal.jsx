import React, { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useTerms } from "@/lib/useTerms";
import { toast } from "sonner";

// Same default set as SetFrontModal — kept in sync manually. If we ever
// change the canonical list, update both. (A future cleanup could lift
// both to lib/triggerCategories.js.)
const TRIGGER_CATEGORIES = [
  { id: "sensory",         label: "Sensory",         emoji: "👂", hint: "loud noise, smell, touch" },
  { id: "emotional",       label: "Emotional",       emoji: "💙", hint: "grief, fear, loneliness" },
  { id: "interpersonal",   label: "Interpersonal",   emoji: "👥", hint: "conflict, rejection" },
  { id: "trauma_reminder", label: "Trauma reminder", emoji: "⚡", hint: "anniversary, place, memory" },
  { id: "physical",        label: "Physical",        emoji: "🫀", hint: "pain, fatigue, illness" },
  { id: "internal",        label: "Internal",        emoji: "🧠", hint: "intrusive thought, body memory" },
  { id: "unknown",         label: "Unknown",         emoji: "❓" },
];

// Tiny modal that lets the user mark / un-mark the current active
// fronting session(s) as a triggered switch and pick a category /
// label. Used as a post-hoc shortcut from the dashboard's Currently
// Fronting widget — when the switch happened via a method that didn't
// go through SetFrontModal (long-press, quick action, etc.) the user
// can still capture the same trigger metadata after the fact.
export default function TriggerEditModal({ open, onClose, sessions = [] }) {
  const terms = useTerms();
  const qc = useQueryClient();
  // Hydrate state from the most-recent active session (or the primary
  // if multiple are active). If any of them are already flagged we
  // pre-fill that data so the user can edit instead of resetting.
  const primarySession = sessions.find((s) => s.is_primary) || sessions[0] || null;
  const [triggered, setTriggered] = useState(!!primarySession?.is_triggered_switch);
  const [category, setCategory] = useState(primarySession?.trigger_category || "");
  const [label, setLabel] = useState(primarySession?.trigger_label || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTriggered(!!primarySession?.is_triggered_switch);
    setCategory(primarySession?.trigger_category || "");
    setLabel(primarySession?.trigger_label || "");
  }, [open, primarySession?.id]);

  const { data: customTriggerTypes = [] } = useQuery({
    queryKey: ["customTriggerTypes"],
    queryFn: () => base44.entities.TriggerType.list(),
  });
  const allCategories = useMemo(() => [
    ...TRIGGER_CATEGORIES,
    ...customTriggerTypes.map((t) => ({ id: t.id, label: t.label, emoji: t.emoji || "🏷️", hint: t.hint || "" })),
  ], [customTriggerTypes]);

  const handleSave = async () => {
    if (sessions.length === 0) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      const updates = triggered
        ? { is_triggered_switch: true, trigger_category: category || null, trigger_label: label.trim() || null }
        : { is_triggered_switch: false, trigger_category: null, trigger_label: null };
      for (const s of sessions) {
        await base44.entities.FrontingSession.update(s.id, updates);
      }
      qc.invalidateQueries({ queryKey: ["frontHistory"] });
      toast.success(triggered ? `Marked as a triggered ${terms.switch}` : `Cleared ${terms.switch} trigger flag`);
      onClose();
    } catch (e) {
      toast.error(e?.message || "Couldn't save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            Flag {terms.switch} as triggered
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Retroactively mark the current active {terms.fronting} session as a triggered {terms.switch} and capture what set it off. Affects {sessions.length} active session{sessions.length === 1 ? "" : "s"}.
          </p>
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <Checkbox checked={triggered} onCheckedChange={(v) => setTriggered(!!v)} />
            Triggered {terms.switch}?
          </label>
          {triggered && (
            <div className="rounded-xl bg-orange-500/5 border border-orange-400/20 px-3 py-2 space-y-2">
              <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                {allCategories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategory((c) => (c === cat.id ? "" : cat.id))}
                    title={cat.hint}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-all ${
                      category === cat.id
                        ? "bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-700"
                        : "text-muted-foreground border-border/60 hover:bg-muted/50"
                    }`}
                  >
                    {cat.emoji} {cat.label}
                  </button>
                ))}
              </div>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={`Describe what triggered the ${terms.switch}...`}
                className="w-full text-xs bg-transparent border-0 border-b border-border/40 pb-1 outline-none text-foreground placeholder:text-muted-foreground/40 focus:border-border"
              />
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={saving} className="flex-1">Cancel</Button>
            <Button onClick={handleSave} loading={saving} disabled={saving} className="flex-1">Save</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
