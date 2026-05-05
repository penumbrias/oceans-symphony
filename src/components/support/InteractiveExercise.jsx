import { useState, useEffect, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle, ChevronDown, ChevronUp, History } from "lucide-react";
import { format } from "date-fns";

export default function InteractiveExercise({ exerciseId, exerciseTitle, fields = [], onSaved }) {
  const queryClient = useQueryClient();
  const [responses, setResponses] = useState({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [keepHistory, setKeepHistory] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Refs for stable auto-save callback
  const responsesRef = useRef(responses);
  const latestEntryRef = useRef(null);
  const autoSaveTimerRef = useRef(null);
  responsesRef.current = responses;

  const { data: allEntries = [] } = useQuery({
    queryKey: ["supportJournal", exerciseId],
    queryFn: () => base44.entities.SupportJournalEntry.filter({ exercise_id: exerciseId }),
  });

  const latestEntry = allEntries.sort((a, b) =>
    new Date(b.updated_date || b.created_date) - new Date(a.updated_date || a.created_date)
  )[0];
  latestEntryRef.current = latestEntry;

  useEffect(() => {
    if (latestEntry?.responses) setResponses(latestEntry.responses);
  }, [latestEntry?.id]);

  // Auto-save: always updates existing entry (no history branching)
  const autoSave = useCallback(async () => {
    const currentResponses = responsesRef.current;
    const currentEntry = latestEntryRef.current;
    const hasContent = Object.values(currentResponses).some(v => String(v ?? "").trim().length > 0);
    if (!hasContent) return;
    setSaving(true);
    try {
      if (currentEntry) {
        await base44.entities.SupportJournalEntry.update(currentEntry.id, {
          responses: currentResponses,
          exercise_title: exerciseTitle,
        });
      } else {
        await base44.entities.SupportJournalEntry.create({
          exercise_id: exerciseId,
          exercise_title: exerciseTitle,
          responses: currentResponses,
          keep_history: false,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["supportJournal", exerciseId] });
      queryClient.invalidateQueries({ queryKey: ["supportJournalAll"] });
      setSaved(true);
      onSaved?.();
    } catch (e) {
      console.warn("Auto-save failed", e);
    }
    setSaving(false);
  }, [exerciseId, exerciseTitle]);

  const handleChange = (fieldId, value) => {
    setResponses(prev => ({ ...prev, [fieldId]: value }));
    setSaved(false);
    clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(autoSave, 1500);
  };

  // Manual save: respects keepHistory checkbox (can create new history entry)
  const handleSave = async () => {
    const hasContent = Object.values(responses).some(v => String(v ?? "").trim().length > 0);
    if (!hasContent) return;
    clearTimeout(autoSaveTimerRef.current);
    setSaving(true);
    try {
      if (keepHistory || !latestEntry) {
        await base44.entities.SupportJournalEntry.create({
          exercise_id: exerciseId,
          exercise_title: exerciseTitle,
          responses,
          keep_history: keepHistory,
        });
      } else {
        await base44.entities.SupportJournalEntry.update(latestEntry.id, {
          responses,
          exercise_title: exerciseTitle,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["supportJournal", exerciseId] });
      queryClient.invalidateQueries({ queryKey: ["supportJournalAll"] });
      setSaved(true);
      onSaved?.();
    } finally {
      setSaving(false);
    }
  };

  // Cleanup timer on unmount
  useEffect(() => () => clearTimeout(autoSaveTimerRef.current), []);

  const historyEntries = allEntries
    .sort((a, b) => new Date(b.updated_date || b.created_date) - new Date(a.updated_date || a.created_date))
    .slice(1);

  return (
    <div className="border border-border/60 rounded-xl bg-card/50 overflow-hidden">
      <div className="px-4 py-3 bg-primary/5 border-b border-border/40 flex items-center justify-between">
        <p className="text-sm font-semibold text-primary">✍️ Reflection exercise</p>
        <div className="flex items-center gap-2">
          {saving && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
          {!saving && saved && <span className="text-xs text-green-600 flex items-center gap-0.5"><CheckCircle className="w-3 h-3" /> Saved</span>}
          {allEntries.length > 1 && (
            <button
              onClick={() => setShowHistory(v => !v)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <History className="w-3 h-3" />
              {showHistory ? "Hide" : "Past responses"}
              {showHistory ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          )}
        </div>
      </div>

      {showHistory && historyEntries.length > 0 && (
        <div className="px-4 py-3 border-b border-border/40 bg-muted/20 space-y-3">
          {historyEntries.map(entry => (
            <div key={entry.id} className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">
                {format(new Date(entry.updated_date || entry.created_date), "MMM d, yyyy")}
              </p>
              {fields.map(f => entry.responses?.[f.id] ? (
                <div key={f.id}>
                  <p className="text-xs text-muted-foreground">{f.label}</p>
                  <p className="text-xs text-foreground/80 italic">"{entry.responses[f.id]}"</p>
                </div>
              ) : null)}
            </div>
          ))}
        </div>
      )}

      <div className="p-4 space-y-4">
        {fields.map(field => (
          <div key={field.id} className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">{field.label}</label>
            {field.type === "slider" ? (
              <div className="space-y-1">
                <input
                  type="range"
                  min={field.min ?? 0}
                  max={field.max ?? 10}
                  value={responses[field.id] ?? Math.floor(((field.max ?? 10) - (field.min ?? 0)) / 2)}
                  onChange={e => handleChange(field.id, Number(e.target.value))}
                  className="w-full accent-primary"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{field.minLabel ?? field.min ?? 0}</span>
                  <span className="font-semibold text-primary">{responses[field.id] ?? "—"}</span>
                  <span>{field.maxLabel ?? field.max ?? 10}</span>
                </div>
              </div>
            ) : field.type === "text" ? (
              <input
                type="text"
                value={responses[field.id] ?? ""}
                onChange={e => handleChange(field.id, e.target.value)}
                placeholder={field.placeholder || ""}
                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              />
            ) : (
              <textarea
                value={responses[field.id] ?? ""}
                onChange={e => handleChange(field.id, e.target.value)}
                placeholder={field.placeholder || ""}
                rows={field.rows || 3}
                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              />
            )}
          </div>
        ))}

        <div className="flex items-center justify-between pt-1">
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={keepHistory}
              onChange={e => setKeepHistory(e.target.checked)}
              className="accent-primary"
            />
            Keep all responses
          </label>
          <Button size="sm" variant="ghost" onClick={handleSave} disabled={saving} className="gap-1.5 text-xs h-7 px-2 text-muted-foreground hover:text-foreground">
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : saved ? <CheckCircle className="w-3 h-3" /> : null}
            {saved ? "Saved" : "Save now"}
          </Button>
        </div>

        {latestEntry && (
          <p className="text-xs text-muted-foreground">
            Last saved {format(new Date(latestEntry.updated_date || latestEntry.created_date), "MMM d, yyyy 'at' h:mm a")}
          </p>
        )}
      </div>
    </div>
  );
}
