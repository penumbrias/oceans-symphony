import React, { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { formatDistanceToNow, format } from "date-fns";
import { X, Clock } from "lucide-react";
import { PENDING_SYMPTOM_MENU_KEY, OPEN_SYMPTOM_MENU_EVENT } from "@/lib/symptomMenuLink";

function toLocalDatetimeValue(iso) {
  if (!iso) return "";
  try {
    return format(new Date(iso), "yyyy-MM-dd'T'HH:mm");
  } catch { return ""; }
}

function SeverityDots({ severity }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <span key={i} className="text-xs">
          {i <= severity ? "●" : "○"}
        </span>
      ))}
    </div>
  );
}

function SymptomActionMenu({ sess, symptom, onClose }) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [editingStart, setEditingStart] = useState(false);
  const [startDraft, setStartDraft] = useState(() => toLocalDatetimeValue(sess.start_time));
  const lastSnapshot = sess.severity_snapshots?.[sess.severity_snapshots.length - 1];
  // null when no snapshot exists — distinct from an explicit 0 severity.
  // The popup uses this to decide whether to highlight a button and to
  // render the "Current severity" line.
  const currentSeverity = typeof lastSnapshot?.severity === "number" ? lastSnapshot.severity : null;

  const handleSaveStart = async () => {
    if (!startDraft) return;
    setSaving(true);
    try {
      const iso = new Date(startDraft).toISOString();
      await base44.entities.SymptomSession.update(sess.id, { start_time: iso });
      queryClient.invalidateQueries({ queryKey: ["symptomSessions"] });
      queryClient.invalidateQueries({ queryKey: ["symptomCheckIns"] });
      queryClient.invalidateQueries({ queryKey: ["timeline"] });
      setEditingStart(false);
    } finally { setSaving(false); }
  };

  const handleSetSeverity = async (severity) => {
    setSaving(true);
    try {
      const existingSnapshots = sess.severity_snapshots || [];
      const newSnapshots = [...existingSnapshots, { severity, timestamp: new Date().toISOString() }];
      await base44.entities.SymptomSession.update(sess.id, { severity_snapshots: newSnapshots });
      await base44.entities.SymptomCheckIn.create({
        symptom_id: sess.symptom_id,
        severity,
        timestamp: new Date().toISOString(),
      });
      queryClient.invalidateQueries({ queryKey: ["symptomSessions"] });
      queryClient.invalidateQueries({ queryKey: ["symptomCheckIns"] });
    } finally {
      setSaving(false);
      onClose();
    }
  };

  const handleEndSession = async () => {
    setSaving(true);
    try {
      await base44.entities.SymptomSession.update(sess.id, { end_time: new Date().toISOString(), is_active: false });
      queryClient.invalidateQueries({ queryKey: ["symptomSessions"] });
      queryClient.invalidateQueries({ queryKey: ["symptomCheckIns"] });
    } finally {
      setSaving(false);
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-2xl w-full sm:max-w-xs p-4 space-y-4 max-h-[85vh] overflow-y-auto my-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <p className="font-semibold text-sm">{symptom.label}</p>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>

        {currentSeverity != null && <p className="text-xs text-muted-foreground">Current severity: {currentSeverity}/5</p>}

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Set Severity</p>
          <p className="text-[0.6875rem] text-muted-foreground/80">
            0 means "not bothering right now" — the session stays active so you can adjust again later without re-starting it.
          </p>
          <div className="flex gap-2">
            {[0, 1, 2, 3, 4, 5].map(i => (
              <button
                type="button"
                key={i}
                onClick={() => handleSetSeverity(i)}
                disabled={saving}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                  currentSeverity === i
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/50 text-muted-foreground hover:bg-muted"
                } disabled:opacity-50`}
              >
                {i}
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-border" />

        {editingStart ? (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Edit start time</p>
            <input
              type="datetime-local"
              value={startDraft}
              onChange={(e) => setStartDraft(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSaveStart}
                disabled={saving || !startDraft}
                className="flex-1 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => { setStartDraft(toLocalDatetimeValue(sess.start_time)); setEditingStart(false); }}
                className="flex-1 py-2 rounded-lg text-sm font-medium bg-muted/50 text-muted-foreground hover:bg-muted"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditingStart(true)}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium bg-muted/50 text-foreground hover:bg-muted transition-colors"
          >
            <Clock className="w-3.5 h-3.5" />
            Edit start time
            <span className="text-xs text-muted-foreground">({format(new Date(sess.start_time), "MMM d, h:mm a")})</span>
          </button>
        )}

        <button
          type="button"
          onClick={handleEndSession}
          disabled={saving}
          className="w-full py-2 rounded-lg text-sm font-medium bg-destructive/10 text-destructive hover:bg-destructive/20 disabled:opacity-50 transition-colors"
        >
          End Session
        </button>
        <button
          type="button"
          onClick={onClose}
          className="w-full py-2 rounded-lg text-sm font-medium bg-muted/50 text-muted-foreground hover:bg-muted transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function CurrentSymptoms() {
  const [activeMenu, setActiveMenu] = useState(null);
  // A sessionId we've been asked to open the menu for (from a notification tap)
  // but whose session data may not have loaded yet.
  const [pendingSessId, setPendingSessId] = useState(null);

  const { data: activeSessions = [] } = useQuery({
    queryKey: ["symptomSessions"],
    queryFn: () => base44.entities.SymptomSession.filter({ is_active: true }),
    refetchInterval: 60000,
  });

  const { data: symptoms = [] } = useQuery({
    queryKey: ["symptoms"],
    queryFn: () => base44.entities.Symptom.list(),
  });

  const symptomsById = Object.fromEntries(symptoms.map(s => [s.id, s]));

  const active = activeSessions
    .map(sess => ({ sess, symptom: symptomsById[sess.symptom_id] }))
    .filter(x => x.symptom && !x.symptom.is_archived);

  // Pick up a deep-link request (notification tap) — from the live event or a
  // flag left in localStorage if the app was launched cold by the tap.
  useEffect(() => {
    const onEvent = (e) => { const id = e?.detail?.sessionId; if (id) setPendingSessId(id); };
    window.addEventListener(OPEN_SYMPTOM_MENU_EVENT, onEvent);
    try {
      const stored = localStorage.getItem(PENDING_SYMPTOM_MENU_KEY);
      if (stored) setPendingSessId(stored);
    } catch { /* storage off */ }
    return () => window.removeEventListener(OPEN_SYMPTOM_MENU_EVENT, onEvent);
  }, []);

  // Once the requested session is loaded, open its menu and clear the request.
  useEffect(() => {
    if (!pendingSessId) return;
    const match = active.find((x) => x.sess.id === pendingSessId);
    if (match) {
      setActiveMenu(match);
      setPendingSessId(null);
      try { localStorage.removeItem(PENDING_SYMPTOM_MENU_KEY); } catch { /* */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSessId, activeSessions, symptoms]);

  if (active.length === 0) return null;

  return (
    <div className="space-y-2 mt-3">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-1">Active Symptoms</p>
      <div className="flex flex-wrap gap-2">
        {active.map(({ sess, symptom }) => {
          const lastSnapshot = sess.severity_snapshots?.[sess.severity_snapshots.length - 1];
          const severity = lastSnapshot?.severity;

          return (
            <button
              key={sess.id}
              onClick={() => setActiveMenu({ sess, symptom })}
              onContextMenu={(e) => {
                e.preventDefault();
                setActiveMenu({ sess, symptom });
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-opacity hover:opacity-80 active:scale-95"
              style={{ borderColor: symptom.color || "#8B5CF6", backgroundColor: `${symptom.color || "#8B5CF6"}15`, color: symptom.color || "#8B5CF6" }}
            >
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: symptom.color || "#8B5CF6" }} />
              {symptom.label}
              {typeof severity === "number" && <SeverityDots severity={severity} />}
              <span className="opacity-60 font-normal">
                · {formatDistanceToNow(new Date(sess.start_time))}
              </span>
            </button>
          );
        })}
      </div>

      {activeMenu && (
        <SymptomActionMenu
          sess={activeMenu.sess}
          symptom={activeMenu.symptom}
          onClose={() => setActiveMenu(null)}
        />
      )}
    </div>
  );
}