import React, { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import MentionTextarea from "@/components/shared/MentionTextarea";
import { prepareAuthoredText, recordAuthoredText, isLogCommandError } from "@/lib/authoredText";
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
// ISO -> value for <input type="datetime-local"> in the user's local time.
function toLocalInput(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

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
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [note, setNote] = useState("");
  const [noteEditIndex, setNoteEditIndex] = useState(null);
  const [noteWhen, setNoteWhen] = useState("");
  const [localEmotions, setLocalEmotions] = useState([]);
  const [symptomValues, setSymptomValues] = useState({});
  const [showEmotions, setShowEmotions] = useState(focusKind === "emotion");
  const [showSymptoms, setShowSymptoms] = useState(focusKind === "symptom");
  const [showTrigger, setShowTrigger] = useState(false);
  const [triggerCategory, setTriggerCategory] = useState("");
  // What the editor loaded for this entry (per-note stamp, else legacy
  // session values) — used to tell whether the user actually changed it.
  const [loaded, setLoaded] = useState({ emotions: [], trigOn: false, trigCat: "", trigLabel: "" });
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

  const addCustomEmotionMutation = useMutation({
    mutationFn: async ({ label, category = "custom", color }) => {
      const cleanLabel = (label || "").trim();
      if (!cleanLabel) return null;
      const existing = customEmotions.find((e) => e.label.toLowerCase() === cleanLabel.toLowerCase());
      if (existing) return existing;
      return base44.entities.CustomEmotion.create({ label: cleanLabel, category, ...(color ? { color } : {}) });
    },
    onSuccess: (emotion) => {
      if (!emotion) return;
      setLocalEmotions((prev) => prev.includes(emotion.label) ? prev : [...prev, emotion.label]);
      queryClient.invalidateQueries({ queryKey: ["customEmotions"] });
    },
    onError: (e) => {
      toast.error(e?.message || "Couldn't add custom emotion");
    },
  });

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
        try { setNoteWhen(noteIdx != null ? toLocalInput(JSON.parse(s?.note || "[]")[noteIdx]?.timestamp) : ""); } catch { setNoteWhen(""); }

        // Emotions + trigger: a note carries its OWN stamp. Legacy notes
        // (nothing stamped in the session) fall back to the session values
        // for the latest note only — same rule the Check-In Log uses.
        const parseArr = (raw) => { try { const v = JSON.parse(raw || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };
        const sessEmos = parseArr(s?.session_emotions);
        const sessTrig = s?.is_triggered_switch
          ? { category: s.trigger_category || "", label: s.trigger_label || "" } : null;
        let emos = sessEmos;
        let trig = sessTrig;
        if (noteIdx != null) {
          const arr = parseArr(s?.note);
          const own = arr[noteIdx] || {};
          const legacyLast = !Array.isArray(own.emotions) && noteIdx === arr.length - 1;
          emos = Array.isArray(own.emotions) ? own.emotions : (legacyLast ? sessEmos : []);
          trig = own.trigger || (legacyLast ? sessTrig : null);
        }
        setLocalEmotions(emos);
        setShowTrigger(!!trig);
        setTriggerCategory(trig?.category || "");
        setTriggerLabel(trig?.label || "");
        setLoaded({ emotions: emos, trigOn: !!trig, trigCat: trig?.category || "", trigLabel: trig?.label || "" });

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
    // ONE pipeline for the note: ~commands, whispers, signposts, @mentions.
    // The alter whose note this is signs it unless a signpost says otherwise.
    let prepared;
    try { prepared = await prepareAuthoredText(note || "", { alters, terms, surfaceLabel: "note", baseAuthorIds: alter?.id ? [alter.id] : [] }); }
    catch (e) { if (isLogCommandError(e)) { toast.error(e.message); return; } throw e; }
    if (prepared === null) return;
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
      const cleanText = prepared.content.trim();
      // Per-note stamp: this note's own emotions + trigger. When editing an
      // existing note, keep its stamp unless the user actually changed the
      // emotions/trigger here (so merely fixing a typo in an older note
      // doesn't stamp it with today's session-level values).
      const emotionsChanged = JSON.stringify(loaded.emotions) !== JSON.stringify(localEmotions);
      const triggerChanged = loaded.trigOn !== showTrigger
        || (showTrigger && ((loaded.trigCat || "") !== (triggerCategory || "") || (loaded.trigLabel || "") !== (triggerLabel || "")));
      const newStamp = () => {
        const st = {};
        st.emotions = [...localEmotions];
        st.trigger = null;
        // Category is optional — toggling the caution on (with or without a
        // category / description) must save, so default to "unknown".
        if (showTrigger) st.trigger = { category: triggerCategory || "unknown", label: triggerLabel };
        return st;
      };
      if (noteEditIndex != null && noteEditIndex >= 0 && noteEditIndex < noteArr.length) {
        if (cleanText) {
          noteArr = noteArr.map((n, i) => {
            if (i !== noteEditIndex) return n;
            const next = { ...n, text: cleanText };
            // Legacy (unstamped) notes get stamped on save so what the editor
            // showed is what stays; stamped notes only change if edited.
            const legacy = !Array.isArray(n.emotions);
            const st = newStamp();
            if (legacy || emotionsChanged) next.emotions = st.emotions;
            if (legacy || triggerChanged) next.trigger = st.trigger;
            if (noteWhen) {
              const t = new Date(noteWhen);
              if (!isNaN(t.getTime()) && noteWhen !== toLocalInput(n.timestamp)) next.timestamp = t.toISOString();
            }
            return next;
          });
        } else {
          noteArr = noteArr.filter((_, i) => i !== noteEditIndex);
        }
        updates.note = JSON.stringify(noteArr);
      } else if (cleanText) {
        // No existing note for this entry but the user typed one —
        // append it.
        updates.note = JSON.stringify([...noteArr, { text: cleanText, timestamp: new Date().toISOString(), ...newStamp() }]);
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
        updates.is_triggered_switch = true;
        updates.trigger_category = triggerCategory || "unknown";
        updates.trigger_label = triggerLabel;
      } else {
        updates.is_triggered_switch = false;
        updates.trigger_category = "";
        updates.trigger_label = "";
      }

      await base44.entities.FrontingSession.update(session.id, updates);
      if (cleanText) {
        await recordAuthoredText({ ...prepared, alters, sourceType: "session-note", sourceId: session.id, sourceLabel: "Session note", navigatePath: "/timeline" });
      }
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
              {noteEditIndex != null && (
                <div className="px-4 pt-4 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Date &amp; time</span>
                  <input
                    type="datetime-local"
                    value={noteWhen}
                    onChange={(e) => setNoteWhen(e.target.value)}
                    className="flex-1 min-w-0 bg-background border border-border/60 rounded-md px-2 py-1 text-sm text-foreground"
                  />
                </div>
              )}
              <div className="px-4 pt-4 pb-2">
                <MentionTextarea
                  value={note}
                  onChange={setNote}
                  alters={alters}
                  signposts
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
                    onAddCustom={(label, category, color) => addCustomEmotionMutation.mutate({ label, category, color })}
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
