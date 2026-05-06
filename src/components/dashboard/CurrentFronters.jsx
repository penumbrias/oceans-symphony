import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44, localEntities } from "@/api/base44Client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  User, Zap, RefreshCw, X, Edit2, Smile, Activity, AlertTriangle,
  Check, Loader2, MessageSquare
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
  { id: "sensory",         label: "Sensory",        emoji: "👂", hint: "loud noise, smell, touch" },
  { id: "emotional",       label: "Emotional",      emoji: "💙", hint: "grief, fear, loneliness" },
  { id: "interpersonal",   label: "Interpersonal",  emoji: "👥", hint: "conflict, rejection" },
  { id: "trauma_reminder", label: "Trauma reminder",emoji: "⚡", hint: "anniversary, place, memory" },
  { id: "physical",        label: "Physical",       emoji: "🫀", hint: "pain, fatigue, illness" },
  { id: "internal",        label: "Internal",       emoji: "🧠", hint: "intrusive thought, body memory" },
  { id: "unknown",         label: "Unknown",        emoji: "❓" },
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

function sessionNoteText(session) {
  if (!session?.note) return "";
  try {
    const parsed = JSON.parse(session.note);
    return Array.isArray(parsed) ? (parsed[parsed.length - 1]?.text || "") : session.note;
  } catch { return session.note; }
}

function FronterChip({ alter, isPrimary, startTime, session, onHold, coFronterLabel, isExpanded, onToggleExpand }) {
  const bg = alter?.color || null;
  const text = bg ? getContrastColor(bg) : null;
  const [longPressTimeoutId, setLongPressTimeoutId] = useState(null);
  const longPressFiredRef = useRef(false);

  const hasNote = !!sessionNoteText(session);
  const isTriggered = !!session?.is_triggered_switch;

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
    if (!longPressFiredRef.current) onToggleExpand(alter.id);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${alter.name} — ${isPrimary ? "primary" : "co-front"}, fronting for ${startTime ? formatDistanceToNow(new Date(startTime), { addSuffix: false }) : "unknown time"}. Long press for options.`}
      aria-expanded={isExpanded}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleMouseDown}
      onTouchEnd={handleMouseUp}
      onTouchMove={handleMouseUp}
      onClick={handleClick}
      onKeyDown={e => e.key === "Enter" || e.key === " " ? handleClick() : undefined}
      className={`flex items-center gap-2.5 bg-card border rounded-2xl px-1.5 py-2 transition-all cursor-pointer select-none ${
        isExpanded ? "border-primary/50 bg-primary/5" : "border-border/50 hover:border-border"
      }`}
    >
      {/* Avatar with badges */}
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
        {/* Primary indicator */}
        {isPrimary && (
          <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-green-500 border-2 border-background flex items-center justify-center">
            <Zap className="w-2 h-2 text-white" />
          </div>
        )}
        {/* Note indicator — thought bubble on this alter's avatar */}
        {hasNote && !isPrimary && (
          <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-background border border-border/60 flex items-center justify-center text-[9px] leading-none">
            💬
          </div>
        )}
        {hasNote && isPrimary && (
          <div className="absolute -bottom-1 -left-1 w-4 h-4 rounded-full bg-background border border-border/60 flex items-center justify-center text-[9px] leading-none">
            💬
          </div>
        )}
        {/* Triggered indicator */}
        {isTriggered && (
          <div className="absolute -top-1 -left-1 w-4 h-4 rounded-full bg-orange-500 border-2 border-background flex items-center justify-center text-[9px] leading-none">
            ⚡
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground truncate">{alter.name}</p>
        <p className="text-[11px] text-muted-foreground truncate">
          {isPrimary ? "Primary · " : `${coFronterLabel} · `}
          {startTime ? formatDistanceToNow(new Date(startTime), { addSuffix: false }) : "—"}
        </p>
      </div>
    </div>
  );
}

function AlterPanel({ alter, session, onClose, onSaved }) {
  const queryClient = useQueryClient();

  const [note, setNote] = useState(() => sessionNoteText(session));

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
  const { data: customTriggerTypes = [] } = useQuery({
    queryKey: ["customTriggerTypes"],
    queryFn: () => base44.entities.TriggerType.list(),
  });
  const allTriggerCategories = [
    ...TRIGGER_CATEGORIES,
    ...customTriggerTypes.map(t => ({ id: t.id, label: t.label, emoji: t.emoji || "🏷️", hint: t.hint || "" })),
  ];

  const activeSymptoms = symptoms.filter(s => !s.is_archived);

  const handleSave = async () => {
    if (!session) return;
    setSaving(true);
    try {
      const nowIso = new Date().toISOString();
      const updates = {};

      // Note — alter-specific, appended to this session's note array (shows as 💬 on timeline)
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
      if (symptomArr.length > 0) updates.session_symptoms = JSON.stringify(symptomArr);

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
    <div className="col-span-2 rounded-xl bg-card border border-border/50 overflow-hidden">

      {/* Note — bare textarea, no chrome */}
      <div className="px-3 pt-3 pb-2">
        <Textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder={`Note for ${alter.name}... appears as 💬 on their timeline`}
          className="text-sm resize-none border-0 bg-transparent p-0 focus-visible:ring-0 min-h-[52px] placeholder:text-muted-foreground/40 placeholder:text-xs"
          rows={2}
        />
      </div>

      {/* Action row */}
      <div className="px-3 pb-3 flex items-center gap-1.5">
        <button
          onClick={() => { setShowEmotions(v => !v); setShowSymptoms(false); setShowTrigger(false); }}
          aria-label="Add emotions"
          aria-expanded={showEmotions}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border transition-all ${
            showEmotions ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground border-border hover:bg-muted/50"
          }`}
        >
          <Smile className="w-3 h-3" />
          {localEmotions.length > 0 ? <span>{localEmotions.length}</span> : <span>Emotions</span>}
        </button>

        <button
          onClick={() => { setShowSymptoms(v => !v); setShowEmotions(false); setShowTrigger(false); }}
          aria-label="Add symptoms"
          aria-expanded={showSymptoms}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border transition-all ${
            showSymptoms ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground border-border hover:bg-muted/50"
          }`}
        >
          <Activity className="w-3 h-3" />
          <span>Symptoms</span>
        </button>

        <button
          onClick={() => { setShowTrigger(v => !v); setShowEmotions(false); setShowSymptoms(false); }}
          aria-label="Mark triggered switch"
          aria-expanded={showTrigger}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border transition-all ${
            showTrigger
              ? "bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-700"
              : "text-muted-foreground border-border hover:bg-muted/50"
          }`}
        >
          <AlertTriangle className="w-3 h-3" />
          <span>Triggered</span>
        </button>

        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={onClose} aria-label="Close panel" className="p-1 text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
            Save
          </button>
        </div>
      </div>

      {/* Emotion picker */}
      {showEmotions && (
        <div className="border-t border-border/30 px-3 py-2">
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
        <div className="border-t border-border/30 px-3 py-2 space-y-2 max-h-44 overflow-y-auto">
          {activeSymptoms.length === 0 && (
            <p className="text-xs text-muted-foreground/60 italic">No symptoms configured yet.</p>
          )}
          {activeSymptoms.map(s => (
            <div key={s.id} className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color || "#8b5cf6" }} />
              <span className="text-xs flex-1 truncate text-muted-foreground">{s.label}</span>
              {s.type === "boolean" ? (
                <input
                  type="checkbox"
                  checked={!!symptomValues[s.id]}
                  onChange={e => setSymptomValues(v => ({ ...v, [s.id]: e.target.checked ? 1 : 0 }))}
                  className="w-3.5 h-3.5 accent-primary"
                />
              ) : (
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button
                      key={n}
                      onClick={() => setSymptomValues(v => ({ ...v, [s.id]: v[s.id] === n ? 0 : n }))}
                      className={`w-5 h-5 rounded text-[10px] border transition-colors ${
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

      {/* Trigger selector */}
      {showTrigger && (
        <div className="border-t border-border/30 px-3 py-2.5 space-y-2">
          <div className="flex flex-wrap gap-1">
            {allTriggerCategories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setTriggerCategory(c => c === cat.id ? "" : cat.id)}
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
            onChange={e => setTriggerLabel(e.target.value)}
            placeholder="Describe what happened..."
            className="w-full text-xs bg-transparent border-0 border-b border-border/40 pb-1 outline-none text-foreground placeholder:text-muted-foreground/40 focus:border-border"
          />
        </div>
      )}
    </div>
  );
}

export default function CurrentFronters({ alters }) {
  const [showModal, setShowModal] = useState(false);
  const [expandedAlterId, setExpandedAlterId] = useState(null);
  const [holdMenuAlter, setHoldMenuAlter] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handler = () => setShowModal(true);
    window.addEventListener("open-set-front", handler);
    return () => window.removeEventListener("open-set-front", handler);
  }, []);

  const [editingStatus, setEditingStatus] = useState(false);
  const [tempStatus, setTempStatus] = useState("");
  const queryClient = useQueryClient();
  const terms = useTerms();

  const { data: sessions = [] } = useQuery({
    queryKey: ["frontHistory"],
    queryFn: () => base44.entities.FrontingSession.list("-start_time", 50),
  });

  // Latest status note for display — sorted descending, just grab first
  const { data: allStatusNotes = [] } = useQuery({
    queryKey: ["statusNotes"],
    queryFn: () => localEntities.StatusNote.list(),
  });
  const latestStatusNote = allStatusNotes
    .slice()
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0] ?? null;

  const altersById = Object.fromEntries(alters.map((a) => [a.id, a]));
  const activeSessions = sessions.filter(s => s.is_active);
  const primarySession = activeSessions.find(s => s.alter_id ? s.is_primary : true);
  const active = primarySession || activeSessions[0] || null;

  const primaryAlterId = primarySession?.alter_id || active?.primary_alter_id || null;

  useEffect(() => { setExpandedAlterId(null); }, [active?.id]);

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
    } catch { toast.error("Failed to update primary fronter"); }
  };

  const handleRemoveFromFront = async (alter) => {
    try {
      const targetSession = activeSessions.find(s => (s.alter_id || s.primary_alter_id) === alter.id);
      if (targetSession) {
        await base44.entities.FrontingSession.update(targetSession.id, { is_active: false, end_time: new Date().toISOString() });
      }
      queryClient.invalidateQueries({ queryKey: ["frontHistory"] });
      queryClient.invalidateQueries({ queryKey: ["activeFront"] });
      toast.success(`${alter.name} removed from front`);
    } catch { toast.error("Failed to remove"); }
    setHoldMenuAlter(null);
  };

  const handleSaveStatus = async () => {
    const note = tempStatus.trim();
    if (!note) { setEditingStatus(false); return; }
    setEditingStatus(false);
    setTempStatus("");
    // Each save creates a NEW immutable timestamped record — never overwrites old ones
    await localEntities.StatusNote.create({
      timestamp: new Date().toISOString(),
      note,
    });
    queryClient.invalidateQueries({ queryKey: ["statusNotes"] });
    toast.success("Status saved");
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
            <RefreshCw className="w-3 h-3" /> Set {terms.Front}
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
    const seenIds = new Set(primarySess?.alter_id ? [primarySess.alter_id] : []);
    coFronters = coSessions
      .filter(s => !seenIds.has(s.alter_id) && seenIds.add(s.alter_id))
      .map(s => altersById[s.alter_id]).filter(Boolean);
  } else {
    primary = altersById[active.primary_alter_id];
    coFronters = (active.co_fronter_ids || []).map(id => altersById[id]).filter(Boolean);
  }
  const all = [primary, ...coFronters].filter(Boolean);

  const expandedAlter = expandedAlterId ? altersById[expandedAlterId] : null;
  const expandedSession = expandedAlterId ? activeSessions.find(s => (s.alter_id || s.primary_alter_id) === expandedAlterId) : null;

  return (
    <>
      <div className="mb-4" data-tour="fronters-widget">
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">Currently {terms.Fronting}</p>
          </div>
          <Button data-tour="set-front" size="sm" variant="outline" onClick={() => setShowModal(true)} className="gap-1.5 text-xs h-7 px-2.5">
            <RefreshCw className="w-3 h-3" /> {terms.Switch}
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
                session={alterSession}
                onHold={setHoldMenuAlter}
                coFronterLabel={`Co-${terms.fronting}`}
                isExpanded={expandedAlterId === alter.id}
                onToggleExpand={id => setExpandedAlterId(prev => prev === id ? null : id)}
              />
            );
          })}

          {expandedAlter && expandedSession && (
            <AlterPanel
              alter={expandedAlter}
              session={expandedSession}
              onClose={() => setExpandedAlterId(null)}
              onSaved={() => setExpandedAlterId(null)}
            />
          )}
        </div>

        <PrivateMessagesIndicator activeFronters={all} />

        {/* Custom status — each save is a new timestamped record, old ones never change */}
        {editingStatus ? (
          <div className="flex gap-2 items-center">
            <Input
              value={tempStatus}
              onChange={e => setTempStatus(e.target.value)}
              placeholder="What's happening right now..."
              className="text-sm h-8 flex-1"
              autoFocus
              onKeyDown={e => { if (e.key === "Enter") handleSaveStatus(); if (e.key === "Escape") { setTempStatus(""); setEditingStatus(false); } }}
            />
            <Button size="sm" onClick={handleSaveStatus} className="gap-1.5 text-xs h-8 px-2.5">Save</Button>
            <Button size="sm" variant="outline" onClick={() => { setTempStatus(""); setEditingStatus(false); }} className="h-8 px-2">
              <X className="w-3 h-3" />
            </Button>
          </div>
        ) : (
          <button
            onClick={() => { setTempStatus(""); setEditingStatus(true); }}
            data-tour="status-note"
            className="w-full text-left px-3 py-2 rounded-lg bg-muted/30 border border-border/50 hover:bg-muted/50 transition-colors text-xs text-muted-foreground hover:text-foreground flex items-center justify-between gap-2"
          >
            {latestStatusNote
              ? <span className="truncate">💬 {latestStatusNote.note}</span>
              : <span className="italic">Set a new status...</span>
            }
            <Edit2 className="w-3 h-3 flex-shrink-0" />
          </button>
        )}
      </div>
      <SetFrontModal open={showModal} onClose={() => setShowModal(false)} alters={alters} currentSession={active} />

      {holdMenuAlter && (
        <Dialog open={!!holdMenuAlter} onOpenChange={() => setHoldMenuAlter(null)}>
          <DialogContent className="max-w-[280px] p-4 gap-0">
            <div className="flex items-center gap-3 pb-3 mb-3 border-b border-border/50">
              <div
                className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center border border-border/30"
                style={{ backgroundColor: holdMenuAlter.color || "hsl(var(--muted))" }}
              >
                {holdMenuAlter.avatar_url
                  ? <img src={holdMenuAlter.avatar_url} alt={holdMenuAlter.name} className="w-full h-full object-cover" />
                  : <User className="w-5 h-5 text-muted-foreground" />}
              </div>
              <div>
                <p className="font-semibold text-sm">{holdMenuAlter.name}</p>
                <p className="text-xs text-muted-foreground">
                  {holdMenuAlter.id === primaryAlterId ? `Primary ${terms.fronter || terms.alter}` : `Co-${terms.fronting}`}
                </p>
              </div>
            </div>
            <div className="space-y-0.5">
              <button
                onClick={async () => {
                  if (holdMenuAlter.id === primaryAlterId) {
                    try {
                      const sess = activeSessions.find(s => (s.alter_id || s.primary_alter_id) === holdMenuAlter.id);
                      if (sess?.alter_id) {
                        await base44.entities.FrontingSession.update(sess.id, { is_primary: false });
                        queryClient.invalidateQueries({ queryKey: ["frontHistory"] });
                        toast.success(`${holdMenuAlter.name} is now co-${terms.fronting}`);
                      }
                    } catch { toast.error("Failed to update"); }
                  } else {
                    await handleSetPrimaryFromHold(holdMenuAlter);
                  }
                  setHoldMenuAlter(null);
                }}
                className="w-full text-left px-3 py-2.5 rounded-lg text-sm hover:bg-muted/50 transition-colors"
              >
                {holdMenuAlter.id === primaryAlterId ? `Make Co-${terms.front}` : "Make Primary"}
              </button>
              <button
                onClick={() => handleRemoveFromFront(holdMenuAlter)}
                className="w-full text-left px-3 py-2.5 rounded-lg text-sm text-destructive hover:bg-destructive/10 transition-colors"
              >
                Remove from {terms.Front}
              </button>
              <button
                onClick={() => { navigate(`/alter/${holdMenuAlter.id}`); setHoldMenuAlter(null); }}
                className="w-full text-left px-3 py-2.5 rounded-lg text-sm hover:bg-muted/50 transition-colors"
              >
                View Profile
              </button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
