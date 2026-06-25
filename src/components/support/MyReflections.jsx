import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { CURRICULUM } from "./TopicView";
import { format } from "date-fns";
import { ChevronLeft, FileText, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

// One saved reflection — read-only by default, with inline edit (each response
// becomes an editable field) and delete. SupportJournalEntry.responses is a
// { fieldId: value } map; we edit the values in place.
function ReflectionCard({ entry }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.responses || {});
  const [saving, setSaving] = useState(false);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["supportJournalAll"] });
    qc.invalidateQueries({ queryKey: ["supportJournal", entry.exercise_id] });
  };

  const filled = Object.entries(entry.responses || {}).filter(([, v]) => v != null && String(v).trim().length > 0);

  const save = async () => {
    setSaving(true);
    try {
      await base44.entities.SupportJournalEntry.update(entry.id, { responses: draft, updated_date: new Date().toISOString() });
      invalidate();
      setEditing(false);
      toast.success("Reflection updated");
    } catch (e) {
      toast.error(e?.message || "Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  const del = async () => {
    if (!window.confirm("Delete this reflection? This can't be undone.")) return;
    try {
      await base44.entities.SupportJournalEntry.delete(entry.id);
      invalidate();
      toast.success("Reflection deleted");
    } catch (e) {
      toast.error(e?.message || "Couldn't delete");
    }
  };

  return (
    <div className="bg-card border border-border/60 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-foreground">{entry.meta.topicTitle}</p>
          <p className="text-xs text-muted-foreground">{entry.meta.exerciseTitle}</p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <p className="text-xs text-muted-foreground mr-1">
            {format(new Date(entry.updated_date || entry.created_date), "MMM d, yyyy")}
          </p>
          {!editing && (
            <button onClick={() => { setDraft(entry.responses || {}); setEditing(true); }}
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors" title="Edit">
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
          <button onClick={del}
            className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors" title="Delete">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div className="px-4 py-3 space-y-2">
        {editing ? (
          <div className="space-y-2">
            {Object.keys(entry.responses || {}).map((fieldId) => (
              <Textarea key={fieldId} value={draft[fieldId] ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, [fieldId]: e.target.value }))}
                className="text-sm min-h-[56px]" />
            ))}
            <div className="flex gap-1.5">
              <Button size="sm" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
              <Button size="sm" variant="outline" onClick={() => { setDraft(entry.responses || {}); setEditing(false); }}>Cancel</Button>
            </div>
          </div>
        ) : (
          filled.length > 0
            ? filled.map(([fieldId, value]) => (
                <div key={fieldId}>
                  <p className="text-xs text-foreground/70 italic leading-relaxed">"{String(value)}"</p>
                </div>
              ))
            : <p className="text-xs text-muted-foreground italic">No content.</p>
        )}
      </div>
    </div>
  );
}

// Build a lookup: exerciseId → { exerciseTitle, moduleTitle, topicTitle }
const EXERCISE_META = {};
CURRICULUM.forEach(mod => {
  mod.topics.forEach(topic => {
    if (topic.exercise) {
      EXERCISE_META[topic.exercise.id] = {
        exerciseTitle: topic.exercise.title,
        moduleTitle: mod.title,
        topicTitle: topic.title,
        moduleEmoji: mod.emoji,
      };
    }
  });
});

export default function MyReflections({ onBack }) {
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["supportJournalAll"],
    queryFn: () => base44.entities.SupportJournalEntry.list(),
  });

  // Group by module
  const byModule = {};
  entries.forEach(entry => {
    const meta = EXERCISE_META[entry.exercise_id];
    if (!meta) return;
    const key = meta.moduleTitle;
    if (!byModule[key]) byModule[key] = { emoji: meta.moduleEmoji, entries: [] };
    byModule[key].entries.push({ ...entry, meta });
  });

  // Sort each module's entries by date desc
  Object.values(byModule).forEach(mod => {
    mod.entries.sort((a, b) =>
      new Date(b.updated_date || b.created_date) - new Date(a.updated_date || a.created_date)
    );
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
        Loading your reflections...
      </div>
    );
  }

  const hasEntries = Object.keys(byModule).length > 0;

  return (
    <div className="max-w-xl mx-auto p-4 space-y-6 pb-12">
      <div>
        <button onClick={onBack} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 mb-3 transition-colors">
          <ChevronLeft className="w-3 h-3" /> Back to Learn
        </button>
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">My Reflections</h2>
        </div>
        <p className="text-sm text-muted-foreground mt-1">Your saved exercise responses, organized by module.</p>
      </div>

      {!hasEntries && (
        <div className="text-center py-12 space-y-2">
          <p className="text-3xl">📝</p>
          <p className="text-sm text-muted-foreground">No reflections saved yet. Work through topics in the Learn section and save your responses.</p>
        </div>
      )}

      {Object.entries(byModule).map(([moduleTitle, mod]) => (
        <div key={moduleTitle} className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">{mod.emoji}</span>
            <h3 className="text-sm font-semibold text-foreground">{moduleTitle}</h3>
          </div>

          {mod.entries.map(entry => (
            <ReflectionCard key={entry.id} entry={entry} />
          ))}
        </div>
      ))}
    </div>
  );
}