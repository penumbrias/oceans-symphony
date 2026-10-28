// Edit a lineage event's date, cause and notes (v0.304.0) — the one form,
// used by System History and the Lineage widget. Saving goes through
// editLineageEvent (src/lib/lineageEvents.js); the caller passes onSave.

import React, { useState } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import MentionTextarea from "@/components/shared/MentionTextarea";

export default function LineageEventEditForm({ event, alters = [], onSave, onCancel }) {
  const [yearOnly, setYearOnly] = useState(!!event.year_only);
  const [date, setDate] = useState(() => { try { return format(new Date(event.date), "yyyy-MM-dd"); } catch { return ""; } });
  const [year, setYear] = useState(() => { try { return String(new Date(event.date).getFullYear()); } catch { return ""; } });
  const [cause, setCause] = useState(event.cause || "");
  const [notes, setNotes] = useState(event.notes || "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    let iso;
    if (yearOnly) {
      const y = parseInt(year, 10);
      if (!y) return;
      iso = new Date(y, 0, 1).toISOString();
    } else {
      if (!date) return;
      iso = new Date(`${date}T12:00:00`).toISOString();
    }
    setSaving(true);
    try {
      const ok = await onSave({ date: iso, year_only: yearOnly, cause: cause.trim() || null, notes: notes.trim() || null });
      if (ok !== false) onCancel();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2 mt-1.5 p-2.5 rounded-lg border border-border/50 bg-muted/20" data-own-hold="">
      <div className="flex items-center gap-2 flex-wrap">
        {yearOnly ? (
          <input type="number" value={year} onChange={(e) => setYear(e.target.value)} placeholder="Year" aria-label="Year"
            className="w-24 h-11 px-2 rounded-md border border-input bg-background text-sm" />
        ) : (
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date"
            className="h-11 px-2 rounded-md border border-input bg-background text-sm" />
        )}
        <label className="flex items-center gap-2 min-h-[44px] text-sm select-none">
          <input type="checkbox" className="w-5 h-5" checked={yearOnly} onChange={(e) => setYearOnly(e.target.checked)} /> Year only
        </label>
      </div>
      <input value={cause} onChange={(e) => setCause(e.target.value)} placeholder="Cause (optional)" aria-label="Cause"
        className="w-full h-11 px-2 rounded-md border border-input bg-background text-sm" />
      <MentionTextarea value={notes} onChange={setNotes} alters={alters} signposts placeholder="Notes (optional)" rows={2}
        className="w-full px-2 py-1.5 rounded-md border border-input bg-background text-sm resize-y" />
      <p className="text-xs text-muted-foreground">Editing the date &amp; notes. To change the type or who's involved, delete and re-record the event.</p>
      <div className="flex gap-1.5">
        <Button size="sm" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        <Button size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
