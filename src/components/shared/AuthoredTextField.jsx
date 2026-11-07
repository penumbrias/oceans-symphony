// A saved text field inside a record's sheet, speaking the app's grammar
// (CLAUDE.md, "Every free-text field speaks the same grammar"): shows the
// text (RichText) until tapped, then a MentionTextarea with Save / Cancel.
// Save runs prepareAuthoredText → onSave(content) → recordAuthoredText, so
// ~commands, signposts and @mentions work like everywhere else. A broken
// ~command blocks the save and keeps the text open.
//
//   <AuthoredTextField value={med.notes} alters={alters} surfaceLabel="medication note"
//     placeholder="Add a note…" onSave={(content) => updateMedication(id, { notes: content })}
//     source={{ sourceType: "medication", sourceId: id, sourceLabel: "Medication: X", navigatePath }} />

import React, { useState } from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import MentionTextarea from "@/components/shared/MentionTextarea";
import RichText from "@/components/shared/RichText";
import { prepareAuthoredText, recordAuthoredText, isLogCommandError } from "@/lib/authoredText";
import { useTerms } from "@/lib/useTerms";

export default function AuthoredTextField({
  value, alters = [], onSave, surfaceLabel = "note", placeholder = "Add…", editPlaceholder, source = null, ariaLabel,
}) {
  const t = useTerms();
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      const text = String(draft || "").trim();
      let prepared = { content: "", authorIds: [] };
      if (text) {
        prepared = await prepareAuthoredText(text, { alters, terms: t, surfaceLabel, whisper: false });
        if (prepared === null) return;
      }
      await onSave(prepared.content, prepared);
      if (prepared.content && source) await recordAuthoredText({ ...prepared, alters, ...source });
      setDraft(null);
    } catch (e) {
      toast.error(isLogCommandError(e) ? e.message : (e?.message || "Couldn't save that."));
    } finally {
      setSaving(false);
    }
  };
  if (draft === null) {
    return (
      <button type="button" onClick={() => setDraft(value || "")} aria-label={ariaLabel ? `Edit ${ariaLabel}` : undefined}
        className="w-full text-left min-h-[44px] py-2 text-sm rounded-md hover:bg-muted/30">
        {value ? <RichText content={value} alters={alters} /> : <span className="text-muted-foreground">{placeholder}</span>}
      </button>
    );
  }
  return (
    <div className="space-y-2 py-2">
      <MentionTextarea toolbar value={draft} onChange={setDraft} alters={alters} signposts
        placeholder={editPlaceholder || placeholder} className="min-h-[80px] text-sm" aria-label={ariaLabel} />
      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="ghost" onClick={() => setDraft(null)} disabled={saving}>Cancel</Button>
        <Button size="sm" onClick={save} disabled={saving}><Check className="w-3.5 h-3.5 mr-1" /> Save</Button>
      </div>
    </div>
  );
}
