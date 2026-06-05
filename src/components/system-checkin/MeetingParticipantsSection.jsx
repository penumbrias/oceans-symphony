import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Search, User, Smile, Activity, ChevronDown, ChevronUp, X, Users } from "lucide-react";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import EmotionWheelPicker from "@/components/emotions/EmotionWheelPicker";

// ── Meeting participants ─────────────────────────────────────────────────────
//
// The system-meeting equivalent of the dashboard's "Currently fronting"
// widget. The user scans/picks who's at the meeting from a searchable,
// scrollable alter list (the SetFrontModal pattern — NEVER a bare typed
// input), then writes how each participant is showing up *separately*:
// their feelings (emotions), symptoms, and a note — mirroring the
// per-alter session_emotions / session_symptoms / note UI from the
// fronting flow (CurrentFronters → AlterPanel).
//
// Data shape (stored on the SystemCheckIn record under `participants`):
//   [{ alter_id, emotions: string[], symptoms: [{id,label,value,type}],
//      note: "" }]
// Mirrors FrontingSession's per-alter payloads but kept as real arrays on
// the meeting record (no JSON-string round-trip needed since it's a fresh
// field). `normalizeParticipants` defends old/short records gracefully.

export function normalizeParticipants(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((p) => p && p.alter_id)
    .map((p) => ({
      alter_id: p.alter_id,
      emotions: Array.isArray(p.emotions) ? p.emotions : [],
      symptoms: Array.isArray(p.symptoms) ? p.symptoms : [],
      note: typeof p.note === "string" ? p.note : "",
    }));
}

function AlterAvatar({ alter, size = 32 }) {
  const url = useResolvedAvatarUrl(alter?.avatar_url);
  const [err, setErr] = useState(false);
  const px = `${size}px`;
  return (
    <div
      className="rounded-xl flex-shrink-0 flex items-center justify-center overflow-hidden border border-border/30"
      style={{ width: px, height: px, backgroundColor: alter?.color || "hsl(var(--muted))" }}
    >
      {url && !err ? (
        <img src={url} alt={alter?.name || ""} className="w-full h-full object-cover" onError={() => setErr(true)} />
      ) : (
        <User className="w-1/2 h-1/2 text-muted-foreground" />
      )}
    </div>
  );
}

// One expandable participant card — feelings / symptoms / note, mirroring
// the per-alter AlterPanel from CurrentFronters.jsx so the muscle memory
// carries across the app.
function ParticipantCard({ alter, participant, onChange, onRemove, customEmotions, onAddCustom, symptoms }) {
  const formatAlter = useAlterLabel();
  const [open, setOpen] = useState(false);
  const [showEmotions, setShowEmotions] = useState(false);
  const [showSymptoms, setShowSymptoms] = useState(false);

  const emotions = participant.emotions || [];
  // symptoms are stored as the same [{ id, label, value, type }] array the
  // fronting flow writes; expose an id→value map for the picker UI.
  const symptomValues = useMemo(() => {
    const map = {};
    for (const it of participant.symptoms || []) if (it?.id) map[it.id] = it.value;
    return map;
  }, [participant.symptoms]);

  const activeSymptoms = symptoms.filter((s) => !s.is_archived);

  const toggleEmotion = (label) => {
    const next = emotions.includes(label) ? emotions.filter((e) => e !== label) : [...emotions, label];
    onChange({ ...participant, emotions: next });
  };

  const setSymptomValue = (sym, value) => {
    const map = { ...symptomValues, [sym.id]: value };
    const arr = Object.entries(map)
      .filter(([, v]) => v !== null && v !== undefined && v !== 0 && v !== false)
      .map(([id, v]) => {
        const s = symptoms.find((x) => x.id === id);
        return s ? { id, label: s.label, value: v, type: s.type } : null;
      })
      .filter(Boolean);
    onChange({ ...participant, symptoms: arr });
  };

  const summaryBits = [];
  if (emotions.length) summaryBits.push(`${emotions.length} feeling${emotions.length === 1 ? "" : "s"}`);
  if ((participant.symptoms || []).length) summaryBits.push(`${participant.symptoms.length} symptom${participant.symptoms.length === 1 ? "" : "s"}`);
  if ((participant.note || "").trim()) summaryBits.push("note");

  return (
    <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
          aria-expanded={open}
        >
          <AlterAvatar alter={alter} size={32} />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-foreground truncate">{formatAlter(alter)}</span>
            <span className="block text-[0.6875rem] text-muted-foreground truncate">
              {summaryBits.length ? summaryBits.join(" · ") : "Tap to add feelings, symptoms, a note"}
            </span>
          </span>
          {open ? <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${alter.name} from the meeting`}
          className="p-1 rounded-full text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {open && (
        <div className="border-t border-border/30">
          {/* Note — bare textarea, same as the fronting per-alter panel */}
          <div className="px-3 pt-2 pb-1">
            <Textarea
              value={participant.note || ""}
              onChange={(e) => onChange({ ...participant, note: e.target.value })}
              placeholder={`How is ${alter.name} showing up? Anything they'd like recorded...`}
              className="text-sm resize-none border-0 bg-transparent p-0 focus-visible:ring-0 min-h-[48px] placeholder:text-muted-foreground/40 placeholder:text-xs"
              rows={2}
            />
          </div>

          {/* Action row — feelings / symptoms toggles */}
          <div className="px-3 pb-2 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => { setShowEmotions((v) => !v); setShowSymptoms(false); }}
              aria-label="Add feelings"
              aria-expanded={showEmotions}
              title="Feelings"
              className={`flex items-center justify-center gap-1 min-w-[34px] h-[28px] px-2 rounded-full text-xs border whitespace-nowrap transition-all ${
                showEmotions ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground border-border hover:bg-muted/50"
              }`}
            >
              <Smile className="w-3.5 h-3.5" />
              {emotions.length > 0 && <span>{emotions.length}</span>}
            </button>
            <button
              type="button"
              onClick={() => { setShowSymptoms((v) => !v); setShowEmotions(false); }}
              aria-label="Add symptoms"
              aria-expanded={showSymptoms}
              title="Symptoms"
              className={`flex items-center justify-center gap-1 min-w-[34px] h-[28px] px-2 rounded-full text-xs border whitespace-nowrap transition-all ${
                showSymptoms ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground border-border hover:bg-muted/50"
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              {(participant.symptoms || []).length > 0 && <span>{participant.symptoms.length}</span>}
            </button>
          </div>

          {/* Feelings picker — same EmotionWheelPicker the Quick Check-In + fronting panel use */}
          {showEmotions && (
            <div className="border-t border-border/30 px-3 py-2">
              <EmotionWheelPicker
                selectedEmotions={emotions}
                onToggle={toggleEmotion}
                customEmotions={customEmotions}
                onAddCustom={onAddCustom}
              />
            </div>
          )}

          {/* Symptom list — same 1–5 / boolean rows as the fronting panel */}
          {showSymptoms && (
            <div className="border-t border-border/30 px-3 py-2 space-y-2 max-h-44 overflow-y-auto">
              {activeSymptoms.length === 0 && (
                <p className="text-xs text-muted-foreground/60 italic">No symptoms configured yet.</p>
              )}
              {activeSymptoms.map((s) => (
                <div key={s.id} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color || "#8b5cf6" }} />
                  <span className="text-xs flex-1 truncate text-muted-foreground">{s.label}</span>
                  {s.type === "boolean" ? (
                    <input
                      type="checkbox"
                      checked={!!symptomValues[s.id]}
                      onChange={(e) => setSymptomValue(s, e.target.checked ? 1 : 0)}
                      className="w-3.5 h-3.5 accent-primary"
                    />
                  ) : (
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setSymptomValue(s, symptomValues[s.id] === n ? 0 : n)}
                          className={`w-5 h-5 rounded text-[0.625rem] border transition-colors ${
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
        </div>
      )}
    </div>
  );
}

// Searchable / scrollable "add participant" picker — the SetFrontModal
// pattern (search box + scrollable list of everyone). Never a bare typed
// input: systems can have dozens of members.
function AddParticipantPicker({ alters, selectedIds, onAdd }) {
  const terms = useTerms();
  const formatAlter = useAlterLabel();
  const [search, setSearch] = useState("");
  const available = useMemo(() => {
    const q = search.trim().toLowerCase();
    return alters
      .filter((a) => !a.is_archived && !selectedIds.includes(a.id))
      .filter((a) => !q || (a.name || "").toLowerCase().includes(q) || (a.alias && a.alias.toLowerCase().includes(q)))
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [alters, selectedIds, search]);

  return (
    <div className="rounded-xl border border-border/50 bg-muted/20 overflow-hidden">
      <div className="relative px-2.5 py-2 border-b border-border/40">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder={`Search ${terms.alters} to add...`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-9"
        />
      </div>
      <div className="max-h-56 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: "touch" }}>
        {available.length === 0 ? (
          <p className="px-3 py-4 text-xs text-muted-foreground text-center">
            {selectedIds.length > 0 ? "Everyone matching is already here." : "No matches."}
          </p>
        ) : (
          available.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => onAdd(a.id)}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-muted/50 transition-colors"
            >
              <AlterAvatar alter={a} size={28} />
              <span className="flex-1 min-w-0">
                <span className="block text-sm truncate">{formatAlter(a)}</span>
                {a.pronouns && <span className="block text-[0.6875rem] text-muted-foreground truncate">{a.pronouns}</span>}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

export default function MeetingParticipantsSection({ participants = [], onChange, alters = [] }) {
  const terms = useTerms();
  const queryClient = useQueryClient();
  const list = useMemo(() => normalizeParticipants(participants), [participants]);

  const { data: symptoms = [] } = useQuery({
    queryKey: ["symptoms"],
    queryFn: () => base44.entities.Symptom.list(),
  });
  const { data: customEmotions = [] } = useQuery({
    queryKey: ["customEmotions"],
    queryFn: () => base44.entities.CustomEmotion.list(),
  });

  const addCustomEmotionMutation = useMutation({
    mutationFn: async ({ label, category = "custom" }) => {
      const cleanLabel = (label || "").trim();
      if (!cleanLabel) return null;
      const existing = customEmotions.find((e) => e.label.toLowerCase() === cleanLabel.toLowerCase());
      if (existing) return existing;
      return base44.entities.CustomEmotion.create({ label: cleanLabel, category });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["customEmotions"] }),
  });

  const altersById = useMemo(() => Object.fromEntries(alters.map((a) => [a.id, a])), [alters]);
  const selectedIds = useMemo(() => list.map((p) => p.alter_id), [list]);

  const addParticipant = (alterId) => {
    if (list.some((p) => p.alter_id === alterId)) return;
    onChange([...list, { alter_id: alterId, emotions: [], symptoms: [], note: "" }]);
  };
  const updateParticipant = (alterId, next) => {
    onChange(list.map((p) => (p.alter_id === alterId ? next : p)));
  };
  const removeParticipant = (alterId) => {
    onChange(list.filter((p) => p.alter_id !== alterId));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />
          Meeting participants
        </CardTitle>
        <CardDescription>
          Add who's here, then write how each one is showing up — their feelings, symptoms, and notes, separately.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {list.length > 0 && (
          <div className="space-y-2">
            {list.map((p) => {
              const alter = altersById[p.alter_id];
              if (!alter) return null;
              return (
                <ParticipantCard
                  key={p.alter_id}
                  alter={alter}
                  participant={p}
                  onChange={(next) => updateParticipant(p.alter_id, next)}
                  onRemove={() => removeParticipant(p.alter_id)}
                  customEmotions={customEmotions}
                  onAddCustom={(label, category) => addCustomEmotionMutation.mutate({ label, category })}
                  symptoms={symptoms}
                />
              );
            })}
          </div>
        )}

        <AddParticipantPicker alters={alters} selectedIds={selectedIds} onAdd={addParticipant} />
      </CardContent>
    </Card>
  );
}
