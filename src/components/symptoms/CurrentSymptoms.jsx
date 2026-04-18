import React, { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { formatDistanceToNow } from "date-fns";
import { X } from "lucide-react";

const useLongPress = (onLongPress, delay = 500) => {
  const timerRef = useRef(null);
  return {
    onMouseDown: () => { timerRef.current = setTimeout(onLongPress, delay); },
    onMouseUp: () => clearTimeout(timerRef.current),
    onMouseLeave: () => clearTimeout(timerRef.current),
    onTouchStart: () => { timerRef.current = setTimeout(onLongPress, delay); },
    onTouchEnd: () => clearTimeout(timerRef.current),
  };
};

function SeverityDots({ severity }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} className="w-1 h-1 rounded-full" style={{ backgroundColor: i <= severity ? "currentColor" : "currentColor", opacity: i <= severity ? 1 : 0.3 }} />
      ))}
    </div>
  );
}

function SymptomActionMenu({ sess, symptom, onClose }) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const lastSnapshot = sess.severity_snapshots?.[sess.severity_snapshots.length - 1];
  const currentSeverity = lastSnapshot?.severity || 0;

  const handleSetSeverity = async (severity) => {
    setSaving(true);
    const newSnapshots = [...(sess.severity_snapshots || []), { severity, timestamp: new Date().toISOString() }];
    await base44.entities.SymptomSession.update(sess.id, { severity_snapshots: newSnapshots });
    queryClient.invalidateQueries({ queryKey: ["symptomSessions"] });
    setSaving(false);
    onClose();
  };

  const handleEndSession = async () => {
    setSaving(true);
    await base44.entities.SymptomSession.update(sess.id, { end_time: new Date().toISOString(), is_active: false });
    queryClient.invalidateQueries({ queryKey: ["symptomSessions"] });
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-xs p-4 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="font-semibold text-sm">{symptom.label}</p>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        
        {currentSeverity > 0 && <p className="text-xs text-muted-foreground">Current severity: {currentSeverity}/5</p>}
        
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Set Severity</p>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map(i => (
              <button
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

        <button
          onClick={handleEndSession}
          disabled={saving}
          className="w-full py-2 rounded-lg text-sm font-medium bg-destructive/10 text-destructive hover:bg-destructive/20 disabled:opacity-50 transition-colors"
        >
          End Session
        </button>
        <button
          onClick={onClose}
          className="w-full py-2 rounded-lg text-sm font-medium bg-muted/50 text-muted-foreground hover:bg-muted transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function CurrentSymptoms({ onOpenCheckIn }) {
  const [activeMenu, setActiveMenu] = useState(null);

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

  if (active.length === 0) return null;

  return (
    <div className="space-y-2 mt-3">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-1">Active Symptoms</p>
      <div className="flex flex-wrap gap-2">
        {active.map(({ sess, symptom }) => {
          const lastSnapshot = sess.severity_snapshots?.[sess.severity_snapshots.length - 1];
          const severity = lastSnapshot?.severity;
          const longPress = useLongPress(() => setActiveMenu({ sess, symptom }));

          return (
            <button
              key={sess.id}
              onClick={() => onOpenCheckIn?.("symptoms")}
              onContextMenu={(e) => {
                e.preventDefault();
                setActiveMenu({ sess, symptom });
              }}
              {...longPress}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-opacity hover:opacity-80 active:scale-95"
              style={{ borderColor: symptom.color || "#8B5CF6", backgroundColor: `${symptom.color || "#8B5CF6"}15`, color: symptom.color || "#8B5CF6" }}
            >
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: symptom.color || "#8B5CF6" }} />
              {symptom.label}
              {severity && <SeverityDots severity={severity} />}
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