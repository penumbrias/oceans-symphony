import React, { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Smile, Activity, AlertTriangle, Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import EmotionWheelPicker from "@/components/emotions/EmotionWheelPicker";
import { useTerms } from "@/lib/useTerms";

// Edit dialog for per-alter session entries (per-alter notes /
// emotions / symptoms / triggered-switch flag stored inside a
// FrontingSession). Same UI as the AlterPanel quick-editor on the
// dashboard, but the save REPLACES the underlying values instead
// of appending — so re-saving a check-in log row updates what's
// there rather than spawning a new note alongside it.
const TRIGGER_CATEGORIES = [
  { id: "sensory",         label: "Sensory",        emoji: "👂", hint: "loud noise, smell, touch" },
  { id: "emotional",       label: "Emotional",      emoji: "💙", hint: "grief, fear, loneliness" },
  { id: "interpersonal",   label: "Interpersonal",  emoji: "👥", hint: "conflict, rejection" },
  { id: "trauma_reminder", label: "Trauma reminder",emoji: "⚡", hint: "anniversary, place, memory" },
  { id: "physical",        label: "Physical",       emoji: "🫀", hint: "pain, fatigue, illness" },
  { id: "internal",        label: "Internal",       emoji: "🧠", hint: "intrusive thought, body memory" },
  { id: "unknown",         label: "Unknown",        emoji: "❓" },
];

export default function PerAlterEntryEditor({ isOpen, onClose, entry, alter, focusKind }) {
  const terms = useTerms();
  const queryClient = useQueryClient();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [note, setNote] = useState("");
  const [noteEditIndex, setNoteEditIndex] = useState(null);
  const [localEmotions, setLocalEmotions] = useState([]);
  const [symptomValues, setSymptomValues] = useState({});
  const [showEmotions, setShowEmotions] = useState(focusKind === "emotion");
  const [showSymptoms, setShowSymptoms] = useState(focusKind === "symptom");
  const [showTrigger, setShowTrigger] = useState(false);
  const [triggerCategory, setTriggerCategory] = useState("");
  const [triggerLabel, setTriggerLabel] = useState("");

  const { data: symptoms = [] } = useQuery({
    queryKey: ["symptoms"],
    queryFn: () => base44.entities.Symptom.list(),
  });
  const { data: customEmotions = [] } = useQuery({
    queryKey: ["customEmotions"],
    queryFn: () => base44.entities.CustomEmotion.list(),
  });
  const { data: customTriggerTypes = [] } = useQuery({
    queryKey: ["customTriggerTypes"],
    queryFn: () => base44.entities.TriggerType.list(),
  });
  const allTriggerCategories = useMemo(() => [
    ...TRIGGER_CATEGORIES,
    ...customTriggerTypes.map((t) => ({ id: t.id, label: t.label, emoji: t.emoji || "🏷️", hint: t.hint || "" })),
  ], [customTriggerTypes]);

  const activeSymptoms = useMemo(() => symptoms.filter((s) => !s.is_archived), [symptoms]);

  // Fetch the full session when the dialog opens, then hydrate every
  // field so the user sees current state pre-filled.
  useEffect(() => {
    if (!isOpen || !entry?.sessionId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const rows = await base44.entities.FrontingSession.filter({ id: entry.sessionId });
        const s = rows?.[0];
        if (cancelled) return;
        setSession(s || null);

        // Notes: array of { text, timestamp }. Edit mode pulls the
        // specific index that produced this entry id (pa-note-<sid>-<i>).
        let noteIdx = null;
        let noteText = "";
        try {
          const noteArr = JSON.parse(s?.note || "[]");
          if (Array.isArray(noteArr)) {
            const m = (entry.id || "").match(/-(\d+)$/);
            const idx = m ? Number(m[1]) : null;
            if (idx != null && idx >= 0 && idx < noteArr.length) {
              noteIdx = idx;
              noteText = noteArr[idx]?.text || "";
            }
          }
        } catch { /* note is non-array legacy */ }
        setNote(noteText);
        setNoteEditIndex(noteIdx);

        try {
          const emos = JSON.parse(s?.session_emotions || "[]");
          setLocalEmotions(Array.isArray(emos) ? emos : []);
        } catch { setLocalEmotions([]); }

        // session_symptoms historically saves as either:
        //   - an array of { id, label, value, type } (per AlterPanel)
        //   - a map { [id]: value } (older path)
        try {
          const syms = JSON.parse(s?.session_symptoms || "[]");
          if (Array.isArray(syms)) {
            const map = {};
            for (const it of syms) if (it?.id) map[it.id] = it.value;
            setSymptomValues(map);
          } else if (syms && typeof syms === "object") {
            setSymptomValues(syms);
          } else {
            setSymptomValues({});
          }
        } catch { setSymptomValues({}); }

        setShowTrigger(!!s?.is_triggered_switch);
        setTriggerCategory(s?.trigger_category || "");
        setTriggerLabel(s?.trigger_label || "");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, entry?.sessionId, entry?.id]);

  useEffect(() => {
    if (!isOpen) return;
    setShowEmotions(focusKind === "emotion");
    setShowSymptoms(focusKind === "symptom");
  }, [isOpen, focusKind]);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["frontingSessions"] });
    queryClient.invalidateQueries({ queryKey: ["activeFront"] });
    queryClient.invalidateQueries({ queryKey: ["frontHistory"] });
    queryClient.invalidateQueries({ queryKey: ["timeline"] });
  };

  const handleSave = async () => {
    if (!session) return;
    setSaving(true);
    try {
      const updates = {};

      // Notes: replace the existing entry at noteEditIndex; or remove
      // the entry if the text was cleared; or append if there was no
      // index (shouldn't happen via this editor but stay defensive).
      let noteArr = [];
      try {
        const parsed = JSON.parse(session.note || "[]");
        noteArr = Array.isArray(parsed) ? parsed : [];
      } catch { noteArr = []; }
      const cleanText = note.trim();
      if (noteEditIndex != null && noteEditIndex >= 0 && noteEditIndex < noteArr.length) {
        if (cleanText) {
          noteArr = noteArr.map((n, i) => i === noteEditIndex ? { ...n, text: cleanText } : n);
        } else {
          noteArr = noteArr.filter((_, i) => i !== noteEditIndex);
        }
        updates.note = JSON.stringify(noteArr);
      } else if (cleanText) {
        // No existing note for this entry but the user typed one —
        // append it.
        updates.note = JSON.stringify([...noteArr, { text: cleanText, timestamp: new Date().toISOString() }]);
      } else if (noteEditIndex == null && !cleanText) {
        // Nothing to do for note.
      }

      // Emotions + symptoms: REPLACE the whole array. Empty array
      // means the user cleared everything.
      updates.session_emotions = JSON.stringify(localEmotions);
      const symptomArr = Object.entries(symptomValues)
        .filter(([, v]) => v !== null && v !== undefined && v !== 0 && v !== false)
        .map(([id, value]) => {
          const s = symptoms.find((x) => x.id === id);
          return s ? { id, label: s.label, value, type: s.type } : null;
        })
        .filter(Boolean);
      updates.session_symptoms = JSON.stringify(symptomArr);

      // Trigger metadata — toggled off clears, on writes the picked
      // category + label.
      if (showTrigger) {
        if (triggerCategory) {
          updates.is_triggered_switch = true;
          updates.trigger_category = triggerCategory;
          updates.trigger_label = triggerLabel;
        }
      } else {
        updates.is_triggered_switch = false;
        updates.trigger_category = "";
        updates.trigger_label = "";
      }

      await base44.entities.FrontingSession.update(session.id, updates);
      invalidateAll();
      toast.success("Saved");
      onClose();
    } catch (e) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/50">
          <DialogTitle>Edit {alter?.name || "alter"}'s entry</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0">
          {loading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Loading…</div>
          ) : !session ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Session not found.</div>
          ) : (
            <>
              <div className="px-4 pt-4 pb-2">
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={`Note for ${alter?.name || terms.alter || "alter"}… appears as 💬 on their timeline`}
                  className="text-sm resize-none min-h-[60px] placeholder:text-muted-foreground/40 placeholder:text-xs"
                  rows={2}
                />
              </div>

              <div className="px-4 pb-3 flex items-center gap-1.5 flex-wrap">
                <button
                  onClick={() => { setShowEmotions((v) => !v); setShowSymptoms(false); setShowTrigger(false); }}
                  aria-pressed={showEmotions}
                  className={`flex items-center justify-center gap-1 min-w-[34px] h-[28px] px-2 rounded-full text-xs border whitespace-nowrap transition-all ${
                    showEmotions ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground border-border hover:bg-muted/50"
                  }`}
                >
                  <Smile className="w-3.5 h-3.5" />
                  {localEmotions.length > 0 && <span>{localEmotions.length}</span>}
                </button>
                <button
                  onClick={() => { setShowSymptoms((v) => !v); setShowEmotions(false); setShowTrigger(false); }}
                  aria-pressed={showSymptoms}
                  className={`flex items-center justify-center min-w-[34px] h-[28px] px-2 rounded-full text-xs border whitespace-nowrap transition-all ${
                    showSymptoms ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground border-border hover:bg-muted/50"
                  }`}
                >
                  <Activity className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => { setShowTrigger((v) => !v); setShowEmotions(false); setShowSymptoms(false); }}
                  aria-pressed={showTrigger}
                  className={`flex items-center justify-center min-w-[34px] h-[28px] px-2 rounded-full text-xs border whitespace-nowrap transition-all ${
                    showTrigger
                      ? "bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-700"
                      : "text-muted-foreground border-border hover:bg-muted/50"
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                </button>
              </div>

              {showEmotions && (
                <div className="border-t border-border/30 px-4 py-3">
                  <EmotionWheelPicker
                    selectedEmotions={localEmotions}
                    onToggle={(label) => setLocalEmotions((prev) => (prev.includes(label) ? prev.filter((e) => e !== label) : [...prev, label]))}
                    customEmotions={customEmotions}
                    onAddCustom={() => {}}
                  />
                </div>
              )}

              {showSymptoms && (
                <div className="border-t border-border/30 px-4 py-3 space-y-2 max-h-60 overflow-y-auto">
                  {activeSymptoms.length === 0 && (
                    <p className="text-xs text-muted-foreground/60 italic">No symptoms configured yet.</p>
                  )}
                  {activeSymptoms.map((s) => (
                    <div key={s.id} className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color || "#8b5cf6" }} />
                      <span className="text-xs flex-1 truncate text-foreground">{s.label}</span>
                      {s.type === "boolean" ? (
                        <input
                          type="checkbox"
                          checked={!!symptomValues[s.id]}
                          onChange={(e) => setSymptomValues((v) => ({ ...v, [s.id]: e.target.checked ? 1 : 0 }))}
                          className="w-4 h-4 accent-primary"
                        />
                      ) : (
                        <div className="flex gap-0.5">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <button
                              key={n}
                              onClick={() => setSymptomValues((v) => ({ ...v, [s.id]: v[s.id] === n ? 0 : n }))}
                              className={`w-6 h-6 rounded text-[0.6875rem] border transition-colors ${
                                (symptomValues[s.id] || 0) >= n
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : "border-border text-muted-foreground"
                              }`}
                            >
                              {n}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {showTrigger && (
                <div className="border-t border-border/30 px-4 py-3 space-y-2">
                  <div className="flex flex-wrap gap-1">
                    {allTriggerCategories.map((cat) => (
                      <button
                        key={cat.id}
                        onClick={() => setTriggerCategory((c) => (c === cat.id ? "" : cat.id))}
                        title={cat.hint}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-all ${
                          triggerCategory === cat.id
                            ? "bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-700"
                            : "text-muted-foreground border-border/60 hover:bg-muted/50"
                        }`}
                      >
                        {cat.emoji} {cat.label}
                      </button>
                    ))}
                  </div>
                  <input
                    value={triggerLabel}
                    onChange={(e) => setTriggerLabel(e.target.value)}
                    placeholder="Describe what happened…"
                    className="w-full text-xs bg-transparent border-0 border-b border-border/40 pb-1 outline-none text-foreground placeholder:text-muted-foreground/40 focus:border-border"
                  />
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex-shrink-0 border-t border-border/50 px-4 py-3 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving} className="gap-1">
            <X className="w-3.5 h-3.5" /> Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || loading || !session}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            <span className="ml-1">Save</span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
