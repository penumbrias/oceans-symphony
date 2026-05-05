import React, { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  User, Zap, RefreshCw, X, Edit2, Smile, Activity, AlertTriangle,
  Check, Loader2, ChevronDown, MessageSquare
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import SetFrontModal from "@/components/fronting/SetFrontModal";
import PrivateMessagesIndicator from "./PrivateMessagesIndicator";
import { useTerms } from "@/lib/useTerms";
import EmotionWheelPicker from "@/components/emotions/EmotionWheelPicker";

const TRIGGER_CATEGORIES = [
  { id: "sensory",         label: "Sensory",          emoji: "👂", hint: "loud noise, smell, touch" },
  { id: "emotional",       label: "Emotional",         emoji: "💙", hint: "grief, fear, loneliness" },
  { id: "interpersonal",   label: "Interpersonal",     emoji: "👥", hint: "conflict, rejection" },
  { id: "trauma_reminder", label: "Trauma reminder",   emoji: "⚡", hint: "anniversary, place, memory" },
  { id: "physical",        label: "Physical",          emoji: "🫀", hint: "pain, fatigue, illness" },
  { id: "internal",        label: "Internal",          emoji: "🧠", hint: "intrusive thought, body memory" },
  { id: "unknown",         label: "Unknown",           emoji: "❓" },
];

function getContrastColor(hex) {
  if (!hex) return "#ffffff";
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.5 ? "#1a1a2e" : "#ffffff";
}

function FronterChip({ alter, isPrimary, startTime, onHold, coFronterLabel, isExpanded, onToggleExpand }) {
  const bg = alter?.color || null;
  const text = bg ? getContrastColor(bg) : null;
  const [longPressTimeoutId, setLongPressTimeoutId] = useState(null);
  const longPressFiredRef = useRef(false);

  const handleMouseDown = () => {
    longPressFiredRef.current = false;
    const timeoutId = setTimeout(() => {
      longPressFiredRef.current = true;
      onHold(alter);
    }, 500);
    setLongPressTimeoutId(timeoutId);
  };

  const handleMouseUp = () => {
    if (longPressTimeoutId) {
      clearTimeout(longPressTimeoutId);
      setLongPressTimeoutId(null);
    }
  };

  const handleClick = () => {
    if (!longPressFiredRef.current) {
      onToggleExpand(alter.id);
    }
  };

  return (
    <div
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onClick={handleClick}
      className={`flex items-center gap-2.5 bg-card border rounded-2xl px-1.5 py-2 transition-all cursor-pointer ${
        isExpanded ? "border-primary/60 bg-primary/5" : "border-border/50 hover:border-border"
      }`}
    >
      <div className="relative flex-shrink-0">
        <div
          className="w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center border border-border/30"
          style={{ backgroundColor: bg || "hsl(var(--muted))" }}
        >
          {alter.avatar_url ? (
            <img src={alter.avatar_url} alt={alter.name} className="w-full h-full object-cover" />
          ) : (
            <User className="w-5 h-5" style={{ color: text || "hsl(var(--muted-foreground))" }} />
          )}
        </div>
        {isPrimary && (
          <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-green-500 border-2 border-background flex items-center justify-center">
            <Zap className="w-2 h-2 text-white" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground truncate">{alter.name}</p>
        <p className="text-[11px] text-muted-foreground">
          {isPrimary ? "Primary · " : `${coFronterLabel} · `}
          {startTime ? formatDistanceToNow(new Date(startTime), { addSuffix: false }) : "—"}
        </p>
      </div>
      <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground flex-shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
    </div>
  );
}

function AlterPanel({ alter, session, onClose, onSaved }) {
  const queryClient = useQueryClient();

  const [note, setNote] = useState(() => {
    try {
      const parsed = JSON.parse(session?.note || "[]");
      return Array.isArray(parsed) ? (parsed[parsed.length - 1]?.text || "") : (session?.note || "");
    } catch { return session?.note || ""; }
  });

  const [showEmotions, setShowEmotions] = useState(false);
  const [localEmotions, setLocalEmotions] = useState(() => {
    try { return JSON.parse(session?.session_emotions || "[]"); } catch { return []; }
  });

  const [showSymptoms, setShowSymptoms] = useState(false);
  const [symptomValues, setSymptomValues] = useState(() => {
    try { return JSON.parse(session?.session_symptoms || "{}"); } catch { return {}; }
  });

  const [showTrigger, setShowTrigger] = useState(!!session?.is_triggered_switch);
  const [triggerCategory, setTriggerCategory] = useState(session?.trigger_category || "");
  const [triggerLabel, setTriggerLabel] = useState(session?.trigger_label || "");
  const [saving, setSaving] = useState(false);

  const { data: symptoms = [] } = useQuery({
    queryKey: ["symptoms"],
    queryFn: () => base44.entities.Symptom.list(),
  });
  const { data: customEmotions = [] } = useQuery({
    queryKey: ["customEmotions"],
    queryFn: () => base44.entities.CustomEmotion.list(),
  });

  const activeSymptoms = symptoms.filter(s => !s.is_archived);

  const handleSave = async () => {
    if (!session) return;
    setSaving(true);
    try {
      const nowIso = new Date().toISOString();
      const updates = {};

      if (note.trim()) {
        let existing = [];
        try { const parsed = JSON.parse(session.note || "[]"); existing = Array.isArray(parsed) ? parsed : []; } catch {}
        updates.note = JSON.stringify([...existing, { text: note.trim(), timestamp: nowIso }]);
      }

      if (localEmotions.length > 0) {
        updates.session_emotions = JSON.stringify(localEmotions);
      }

      const symptomArr = Object.entries(symptomValues)
        .filter(([, v]) => v !== null && v !== undefined && v !== 0 && v !== false)
        .map(([id, value]) => {
          const s = symptoms.find(x => x.id === id);
          return s ? { id, label: s.label, value, type: s.type } : null;
        })
        .filter(Boolean);
      if (symptomArr.length > 0) {
        updates.session_symptoms = JSON.stringify(symptomArr);
      }

      if (showTrigger && triggerCategory) {
        updates.is_triggered_switch = true;
        updates.trigger_category = triggerCategory;
        updates.trigger_label = triggerLabel;
      }

      await base44.entities.FrontingSession.update(session.id, updates);
      queryClient.invalidateQueries({ queryKey: ["frontHistory"] });
      toast.success("Saved");
      onSaved();
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="col-span-2 border border-primary/30 rounded-xl p-3 space-y-3 bg-primary/5 mt-1">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-primary">{alter.name}</p>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Note */}
      <div className="space-y-1">
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          <MessageSquare className="w-3 h-3" /> Note <span className="opacity-60">(shows as 💬 on timeline)</span>
        </label>
        <Textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="How is this front going..."
          className="h-16 text-sm resize-none"
        />
      </div>

      {/* Toggle buttons */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setShowEmotions(v => !v)}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
            showEmotions ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground border-border hover:bg-muted/50"
          }`}
        >
          <Smile className="w-3 h-3" /> Emotions {localEmotions.length > 0 && `(${localEmotions.length})`}
        </button>
        <button
          onClick={() => setShowSymptoms(v => !v)}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
            showSymptoms ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground border-border hover:bg-muted/50"
          }`}
        >
          <Activity className="w-3 h-3" /> Symptoms
        </button>
        <button
          onClick={() => setShowTrigger(v => !v)}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
            showTrigger
              ? "bg-orange-100 text-orange-800 border-orange-400/60 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-700"
              : "text-muted-foreground border-border hover:bg-muted/50"
          }`}
        >
          <AlertTriangle className="w-3 h-3" /> Triggered switch {session?.is_triggered_switch && "⚡"}
        </button>
      </div>

      {/* Emotion picker */}
      {showEmotions && (
        <div className="border border-border/40 rounded-lg p-2 bg-card">
          <EmotionWheelPicker
            selectedEmotions={localEmotions}
            onToggle={label => setLocalEmotions(prev =>
              prev.includes(label) ? prev.filter(e => e !== label) : [...prev, label]
            )}
            customEmotions={customEmotions}
            onAddCustom={() => {}}
          />
        </div>
      )}

      {/* Symptom list */}
      {showSymptoms && (
        <div className="border border-border/40 rounded-lg p-2 bg-card space-y-2 max-h-48 overflow-y-auto">
          {activeSymptoms.length === 0 && (
            <p className="text-xs text-muted-foreground italic">No symptoms configured yet.</p>
          )}
          {activeSymptoms.map(s => (
            <div key={s.id} className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color || "#8b5cf6" }} />
              <span className="text-xs flex-1 truncate">{s.label}</span>
              {s.type === "boolean" ? (
                <input
                  type="checkbox"
                  checked={!!symptomValues[s.id]}
                  onChange={e => setSymptomValues(v => ({ ...v, [s.id]: e.target.checked ? 1 : 0 }))}
                  className="w-4 h-4 accent-primary"
                />
              ) : (
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button
                      key={n}
                      onClick={() => setSymptomValues(v => ({
                        ...v, [s.id]: v[s.id] === n ? 0 : n
                      }))}
                      className={`w-5 h-5 rounded text-xs border transition-colors ${
                        (symptomValues[s.id] || 0) >= n
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-border text-muted-foreground hover:border-primary/50"
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

      {/* Trigger selector */}
      {showTrigger && (
        <div className="border border-orange-400/30 rounded-lg p-3 space-y-2 bg-orange-50/30 dark:bg-orange-900/10">
          <p className="text-xs font-medium text-muted-foreground">What triggered the switch?</p>
          <div className="flex flex-wrap gap-1">
            {TRIGGER_CATEGORIES.map(cat => (
              <button
                key={cat.id}
                onClick={() => setTriggerCategory(c => c === cat.id ? "" : cat.id)}
                title={cat.hint}
                className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs border transition-all ${
                  triggerCategory === cat.id
                    ? "bg-orange-100 text-orange-800 border-orange-400 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-700"
                    : "text-muted-foreground border-border hover:bg-muted/50"
                }`}
              >
                {cat.emoji} {cat.label}
              </button>
            ))}
          </div>
          <Input
            value={triggerLabel}
            onChange={e => setTriggerLabel(e.target.value)}
            placeholder="Optional: describe the trigger..."
            className="h-8 text-xs"
          />
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
        <Button size="sm" onClick={handleSave} disabled={saving} className="flex-1">
          {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Check className="w-3 h-3 mr-1" />}
          Save
        </Button>
      </div>
    </div>
  );
}

export default function CurrentFronters({ alters }) {
  const [showModal, setShowModal] = useState(false);
  const [expandedAlterId, setExpandedAlterId] = useState(null);

  useEffect(() => {
    const handler = () => setShowModal(true);
    window.addEventListener("open-set-front", handler);
    return () => window.removeEventListener("open-set-front", handler);
  }, []);

  const [editingStatus, setEditingStatus] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [tempStatus, setTempStatus] = useState("");
  const queryClient = useQueryClient();
  const terms = useTerms();

  const { data: sessions = [] } = useQuery({
    queryKey: ["frontHistory"],
    queryFn: () => base44.entities.FrontingSession.list("-start_time", 50),
  });

  const altersById = Object.fromEntries(alters.map((a) => [a.id, a]));

  const activeSessions = sessions.filter(s => s.is_active);
  const primarySession = activeSessions.find(s => s.alter_id ? s.is_primary : true);
  const active = primarySession || activeSessions[0] || null;

  useEffect(() => {
    if (!active) { setStatusText(""); setTempStatus(""); return; }
    try {
      const raw = active.note;
      if (raw) {
        const parsed = JSON.parse(raw);
        const text = Array.isArray(parsed) ? (parsed[parsed.length - 1]?.text || "") : raw;
        setStatusText(text);
        setTempStatus(text);
      } else {
        setStatusText("");
        setTempStatus("");
      }
    } catch {
      setStatusText(active.note || "");
      setTempStatus(active.note || "");
    }
  }, [active?.id]);

  // Clear expansion when front changes
  useEffect(() => {
    setExpandedAlterId(null);
  }, [active?.id]);

  const handleSetPrimaryFromHold = async (alter) => {
    try {
      const targetSession = activeSessions.find(s => (s.alter_id || s.primary_alter_id) === alter.id);
      const currentPrimarySession = activeSessions.find(s => s.alter_id ? s.is_primary : s.primary_alter_id === alter.id);

      if (targetSession?.alter_id) {
        if (currentPrimarySession && currentPrimarySession.id !== targetSession.id) {
          await base44.entities.FrontingSession.update(currentPrimarySession.id, { is_primary: false });
        }
        await base44.entities.FrontingSession.update(targetSession.id, { is_primary: true });
      } else if (active) {
        const newCoFronters = [active.primary_alter_id, ...(active.co_fronter_ids || [])].filter(id => id !== alter.id);
        await base44.entities.FrontingSession.update(active.id, { primary_alter_id: alter.id, co_fronter_ids: newCoFronters });
      }
      queryClient.invalidateQueries({ queryKey: ["frontHistory"] });
      toast.success(`${alter.name} is now primary!`);
    } catch {
      toast.error("Failed to update primary fronter");
    }
  };

  const handleSaveStatus = async () => {
    const note = tempStatus.trim();
    setStatusText(note);
    setEditingStatus(false);
    try {
      const nowIso = new Date().toISOString();
      for (const s of activeSessions) {
        let existing = [];
        try { const parsed = JSON.parse(s.note || "[]"); existing = Array.isArray(parsed) ? parsed : []; } catch {}
        const updated = [...existing, { text: note, timestamp: nowIso }];
        await base44.entities.FrontingSession.update(s.id, { note: JSON.stringify(updated) });
      }
      queryClient.invalidateQueries({ queryKey: ["frontHistory"] });
    } catch {}
    toast.success("Status saved");
  };

  const handleToggleExpand = (alterId) => {
    setExpandedAlterId(prev => prev === alterId ? null : alterId);
  };

  if (!active) {
    return (
      <>
        <div className="bg-muted/40 border border-border/40 rounded-2xl px-4 py-4 mb-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No one is currently {terms.fronting}</p>
          </div>
          <Button data-tour="set-front" size="sm" variant="outline" onClick={() => setShowModal(true)} className="gap-1.5 text-xs">
            <RefreshCw className="w-3 h-3" />
            Set {terms.Front}
          </Button>
        </div>
        <SetFrontModal open={showModal} onClose={() => setShowModal(false)} alters={alters} currentSession={null} />
      </>
    );
  }

  let primary = null;
  let coFronters = [];
  if (activeSessions.some(s => s.alter_id)) {
    const primarySess = activeSessions.find(s => s.alter_id && s.is_primary);
    const coSessions = activeSessions.filter(s => s.alter_id && !s.is_primary);
    primary = primarySess ? altersById[primarySess.alter_id] : null;
    coFronters = coSessions.map(s => altersById[s.alter_id]).filter(Boolean);
  } else {
    primary = altersById[active.primary_alter_id];
    coFronters = (active.co_fronter_ids || []).map(id => altersById[id]).filter(Boolean);
  }
  const all = [primary, ...coFronters].filter(Boolean);

  const expandedAlter = expandedAlterId ? altersById[expandedAlterId] : null;
  const expandedSession = expandedAlterId
    ? activeSessions.find(s => (s.alter_id || s.primary_alter_id) === expandedAlterId)
    : null;

  return (
    <>
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">Currently {terms.Fronting}</p>
          </div>
          <Button data-tour="set-front" size="sm" variant="outline" onClick={() => setShowModal(true)} className="gap-1.5 text-xs h-7 px-2.5">
            <RefreshCw className="w-3 h-3" />
            {terms.Switch}
          </Button>
        </div>

        <div className="mb-2 grid grid-cols-2 gap-2">
          {all.map((alter, i) => {
            const alterSession = activeSessions.find(s => (s.alter_id || s.primary_alter_id) === alter.id);
            return (
              <FronterChip
                key={alter.id}
                alter={alter}
                isPrimary={i === 0}
                startTime={alterSession?.start_time}
                onHold={handleSetPrimaryFromHold}
                coFronterLabel={`Co-${terms.fronting}`}
                isExpanded={expandedAlterId === alter.id}
                onToggleExpand={handleToggleExpand}
              />
            );
          })}

          {/* Expanded panel — full width inside the grid */}
          {expandedAlter && expandedSession && (
            <AlterPanel
              alter={expandedAlter}
              session={expandedSession}
              onClose={() => setExpandedAlterId(null)}
              onSaved={() => setExpandedAlterId(null)}
            />
          )}
        </div>

        {/* Private Messages Indicator */}
        <PrivateMessagesIndicator activeFronters={all} />

        {/* Custom Status */}
        {!expandedAlterId && (
          editingStatus ? (
            <div className="flex gap-2 items-center">
              <Input
                value={tempStatus}
                onChange={(e) => setTempStatus(e.target.value)}
                placeholder="Add a status..."
                className="text-sm h-8 flex-1"
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") handleSaveStatus(); }}
              />
              <Button size="sm" onClick={handleSaveStatus} className="gap-1.5 text-xs h-8 px-2.5">Save</Button>
              <Button size="sm" variant="outline" onClick={() => { setTempStatus(statusText); setEditingStatus(false); }} className="h-8 px-2">
                <X className="w-3 h-3" />
              </Button>
            </div>
          ) : (
            <button
              onClick={() => setEditingStatus(true)}
              className="w-full text-left px-3 py-2 rounded-lg bg-muted/30 border border-border/50 hover:bg-muted/50 transition-colors text-sm text-muted-foreground hover:text-foreground"
            >
              {statusText ? (
                <div className="flex items-center justify-between">
                  <span>{statusText}</span>
                  <Edit2 className="w-3 h-3" />
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="italic">Add a custom status...</span>
                  <Edit2 className="w-3 h-3" />
                </div>
              )}
            </button>
          )
        )}
      </div>
      <SetFrontModal open={showModal} onClose={() => setShowModal(false)} alters={alters} currentSession={active} />
    </>
  );
}
