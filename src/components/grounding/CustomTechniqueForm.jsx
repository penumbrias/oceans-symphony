import { useState } from "react";
import { X, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { CATEGORY_LABELS, EMOTIONAL_STATES } from "@/utils/groundingDefaults";

export default function CustomTechniqueForm({ onClose, onSaved }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("custom");
  const [steps, setSteps] = useState([""]);
  const [duration, setDuration] = useState("");
  const [suggestedFor, setSuggestedFor] = useState([]);
  const [saving, setSaving] = useState(false);

  const addStep = () => setSteps(s => [...s, ""]);
  const removeStep = (i) => setSteps(s => s.filter((_, idx) => idx !== i));
  const updateStep = (i, val) => setSteps(s => s.map((v, idx) => idx === i ? val : v));

  const toggleState = (id) => setSuggestedFor(prev =>
    prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
  );

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await base44.entities.GroundingTechnique.create({
      name: name.trim(),
      description: description.trim(),
      category,
      steps: steps.filter(s => s.trim()),
      duration_seconds: duration ? parseInt(duration) * 60 : null,
      suggested_for: suggestedFor,
      is_default: false,
      is_archived: false,
      order: 100,
    });
    setSaving(false);
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl p-5 w-full max-w-md max-h-[90vh] overflow-y-auto space-y-4"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-foreground">Add your own technique</h3>
          <button onClick={onClose}><X className="w-4 h-4 text-muted-foreground" /></button>
        </div>

        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Name</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="What's this technique called?"
            className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm" />
        </div>

        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Description</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
            placeholder="A brief description..."
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm resize-none" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Category</label>
            <select value={category} onChange={e => setCategory(e.target.value)}
              className="w-full h-9 px-2 rounded-lg border border-border bg-background text-sm">
              {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Duration (minutes)</label>
            <input type="number" min="1" max="60" value={duration} onChange={e => setDuration(e.target.value)}
              placeholder="e.g. 5"
              className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm" />
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Steps</label>
          <div className="space-y-2">
            {steps.map((step, i) => (
              <div key={i} className="flex gap-2 items-start">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-muted text-muted-foreground text-xs flex items-center justify-center mt-2">{i + 1}</span>
                <textarea value={step} onChange={e => updateStep(i, e.target.value)} rows={2}
                  placeholder={`Step ${i + 1}...`}
                  className="flex-1 px-2 py-1.5 rounded-lg border border-border bg-background text-sm resize-none" />
                {steps.length > 1 && (
                  <button onClick={() => removeStep(i)} className="mt-2 text-muted-foreground hover:text-destructive transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
            <button onClick={addStep} className="text-xs text-primary hover:underline flex items-center gap-1">
              <Plus className="w-3 h-3" /> Add step
            </button>
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Helpful for</label>
          <div className="flex flex-wrap gap-1.5">
            {EMOTIONAL_STATES.map(s => (
              <button key={s.id} onClick={() => toggleState(s.id)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${suggestedFor.includes(s.id) ? "bg-primary/15 border-primary/40 text-primary" : "border-border text-muted-foreground hover:border-primary/20"}`}>
                {s.emoji} {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button onClick={handleSave} disabled={!name.trim() || saving} className="flex-1">
            {saving ? "Saving…" : "Save technique"}
          </Button>
        </div>
      </div>
    </div>
  );
}