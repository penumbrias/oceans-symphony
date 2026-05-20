import React, { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, X, Trash2 } from "lucide-react";
import { useTerms } from "@/lib/useTerms";

// Modal for adding a user-defined Help-me-unblend question.
// The chosen kind drives the rest of the form. We persist a
// minimal record per kind; runtime instantiation happens in
// unblendQuestions.instantiateUserQuestion().
//
// Kinds shipped in v1:
//   - custom_field  : pick an existing custom field; options auto-
//                     derive from the unique values across alters.
//   - multiple_choice: free-text prompt + 2+ options; each option
//                     stores a list of alter IDs the user thinks
//                     match — picking it boosts those alters.
//   - color         : same hex picker as the preset color question.
//   - pronouns / role / age : re-use the dynamic builders (the
//                     prompt is the only customised bit).
//
// Deferred kinds (activity / symptom / diary / range / poll) need
// their own data-source pickers — noted in unblendQuestions.js.
const KINDS = [
  { id: "custom_field",    label: "Custom field" },
  { id: "multiple_choice", label: "Multiple choice (manual)" },
  { id: "color",           label: "Color picker" },
  { id: "pronouns",        label: "Pronouns" },
  { id: "role",            label: "Role" },
  { id: "age",             label: "Age" },
];

export default function AddUnblendQuestionModal({ isOpen, onClose, onSave, alters }) {
  const terms = useTerms();
  const [kind, setKind] = useState("custom_field");
  const [prompt, setPrompt] = useState("");
  const [field, setField] = useState("");
  const [options, setOptions] = useState([
    { id: "opt-1", label: "", alterIds: [] },
    { id: "opt-2", label: "", alterIds: [] },
  ]);

  const customFieldNames = useMemo(() => {
    const set = new Set();
    for (const a of alters || []) {
      const map = a.alter_custom_fields;
      if (!map || typeof map !== "object") continue;
      for (const k of Object.keys(map)) set.add(k);
    }
    return [...set].sort();
  }, [alters]);

  const reset = () => {
    setKind("custom_field");
    setPrompt("");
    setField("");
    setOptions([
      { id: "opt-1", label: "", alterIds: [] },
      { id: "opt-2", label: "", alterIds: [] },
    ]);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const canSave = (() => {
    if (!prompt.trim()) return false;
    if (kind === "custom_field" && !field) return false;
    if (kind === "multiple_choice") {
      const valid = options.filter((o) => o.label.trim());
      if (valid.length < 2) return false;
    }
    return true;
  })();

  const handleSubmit = () => {
    if (!canSave) return;
    const base = { prompt: prompt.trim(), kind };
    if (kind === "custom_field") base.field = field;
    if (kind === "multiple_choice") {
      base.options = options
        .filter((o) => o.label.trim())
        .map((o, i) => ({
          id: o.id || `opt-${i}`,
          label: o.label.trim(),
          alterIds: o.alterIds || [],
        }));
    }
    onSave(base);
    reset();
    onClose();
  };

  const toggleOptionAlter = (optIdx, alterId) => {
    setOptions((prev) =>
      prev.map((o, i) => {
        if (i !== optIdx) return o;
        const has = o.alterIds.includes(alterId);
        return {
          ...o,
          alterIds: has ? o.alterIds.filter((id) => id !== alterId) : [...o.alterIds, alterId],
        };
      })
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/50">
          <DialogTitle>Add a question</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 min-h-0">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Question</label>
            <Input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. What music are you in the mood for?"
              className="mt-1"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Response type</label>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {KINDS.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  onClick={() => setKind(k.id)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    kind === k.id
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:bg-muted/50"
                  }`}
                >
                  {k.label}
                </button>
              ))}
            </div>
            <p className="text-[0.6875rem] text-muted-foreground mt-2 leading-snug">
              Activity, symptom/habit, diary, range, and poll types are coming in a follow-up — they each need their own data source picker.
            </p>
          </div>

          {kind === "custom_field" && (
            <div>
              <label className="text-xs font-medium text-muted-foreground">Which custom field?</label>
              <select
                className="mt-1 w-full h-9 px-3 rounded-md border border-border bg-background text-sm"
                value={field}
                onChange={(e) => setField(e.target.value)}
              >
                <option value="">— Select a field —</option>
                {customFieldNames.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
              {customFieldNames.length === 0 && (
                <p className="text-[0.6875rem] text-amber-600 dark:text-amber-400 mt-1">
                  No custom fields exist yet. Add one in Settings → {terms.Alters} & Fields first.
                </p>
              )}
              <p className="text-[0.6875rem] text-muted-foreground mt-2 leading-snug">
                Options come from values you've filled in on your {terms.alters}. Comma-separated entries split into individual values (so "music, drawing, painting" becomes three).
              </p>
            </div>
          )}

          {kind === "multiple_choice" && (
            <div className="space-y-3">
              <label className="text-xs font-medium text-muted-foreground">Options</label>
              {options.map((opt, idx) => (
                <div key={opt.id} className="rounded-xl border border-border/50 bg-card/40 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Input
                      value={opt.label}
                      onChange={(e) => setOptions((prev) =>
                        prev.map((o, i) => i === idx ? { ...o, label: e.target.value } : o)
                      )}
                      placeholder={`Option ${idx + 1}`}
                      className="flex-1"
                    />
                    {options.length > 2 && (
                      <button
                        type="button"
                        onClick={() => setOptions((prev) => prev.filter((_, i) => i !== idx))}
                        className="text-muted-foreground hover:text-destructive p-1"
                        aria-label="Remove option"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <div>
                    <p className="text-[0.6875rem] text-muted-foreground mb-1.5">
                      Which {terms.alters} does this match?
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {(alters || []).filter((a) => !a.is_archived).map((a) => {
                        const checked = opt.alterIds.includes(a.id);
                        return (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => toggleOptionAlter(idx, a.id)}
                            className={`text-[0.6875rem] px-2 py-0.5 rounded-full border transition-colors ${
                              checked
                                ? "bg-primary/15 border-primary/50 text-primary"
                                : "bg-background border-border text-muted-foreground hover:bg-muted/40"
                            }`}
                          >
                            {a.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setOptions((prev) => [
                    ...prev,
                    { id: `opt-${prev.length + 1}-${Date.now()}`, label: "", alterIds: [] },
                  ])
                }
                className="gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" /> Add option
              </Button>
            </div>
          )}

          {(kind === "pronouns" || kind === "role" || kind === "age") && (
            <p className="text-xs text-muted-foreground leading-snug">
              Options come from each {terms.alter}'s {kind === "age" ? "age" : kind} field. Make sure at least two {terms.alters} have it set with different values for the question to be useful.
            </p>
          )}

          {kind === "color" && (
            <p className="text-xs text-muted-foreground leading-snug">
              The colour you pick will be compared to each {terms.alter}'s colour using RGB distance. No extra configuration needed.
            </p>
          )}
        </div>

        <div className="flex-shrink-0 border-t border-border/50 px-5 py-3 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!canSave}>Add question</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
