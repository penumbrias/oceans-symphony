import React, { useState } from "react";
import { Plus, Minus } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const SEVERITY_LEVELS = ["—", "0", "1", "2", "3", "4", "5"];

export default function SymptomCard({ definition, activeSession, onSessionChange }) {
  const queryClient = useQueryClient();
  const [checked, setChecked] = useState(!!activeSession);
  const [severity, setSeverity] = useState(null); // null = none, 0-5 = value
  const [toggling, setToggling] = useState(false);
  const [holdTimer, setHoldTimer] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const color = definition.color || "#8B5CF6";
  const isActive = !!activeSession;

  const handleSeverityClick = async (idx) => {
    if (idx === 0) {
      // "—" pressed — clear
      setSeverity(null);
      setChecked(false);
      return;
    }
    const val = idx - 1; // 0-5
    setSeverity(val);
    setChecked(true);
    // If active session, append snapshot immediately
    if (activeSession) {
      const snapshots = activeSession.severity_snapshots || [];
      await base44.entities.SymptomSession.update(activeSession.id, {
        severity_snapshots: [...snapshots, { severity: val, timestamp: new Date().toISOString() }],
      });
      queryClient.invalidateQueries({ queryKey: ["symptomSessions"] });
    }
  };

  const handleToggleSession = async () => {
    if (toggling) return;
    setToggling(true);
    try {
      if (isActive) {
        await base44.entities.SymptomSession.update(activeSession.id, {
          is_active: false,
          end_time: new Date().toISOString(),
        });
        toast.success(`${definition.name} session ended`);
      } else {
        await base44.entities.SymptomSession.create({
          symptom_definition_id: definition.id,
          start_time: new Date().toISOString(),
          is_active: true,
          severity_snapshots: [],
        });
        setChecked(true);
        toast.success(`${definition.name} set to active`);
      }
      queryClient.invalidateQueries({ queryKey: ["symptomSessions"] });
      onSessionChange?.();
    } catch (e) {
      toast.error(e.message || "Failed to toggle session");
    } finally {
      setToggling(false);
    }
  };

  const handlePointerDown = () => {
    const t = setTimeout(() => setShowDeleteConfirm(true), 5000);
    setHoldTimer(t);
  };
  const handlePointerUp = () => {
    if (holdTimer) { clearTimeout(holdTimer); setHoldTimer(null); }
  };

  const handleArchive = async () => {
    await base44.entities.SymptomDefinition.update(definition.id, { is_archived: true });
    queryClient.invalidateQueries({ queryKey: ["symptomDefinitions"] });
    setShowDeleteConfirm(false);
    toast.success(`${definition.name} removed`);
  };

  return (
    <>
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-xl border transition-all"
        style={{
          borderColor: isActive ? color : "hsl(var(--border))",
          backgroundColor: isActive ? `${color}15` : "hsl(var(--card))",
        }}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {/* Checkbox */}
        <button
          onClick={() => setChecked(!checked)}
          className="w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors"
          style={{
            borderColor: checked ? color : "hsl(var(--border))",
            backgroundColor: checked ? color : "transparent",
          }}
        >
          {checked && <div className="w-2 h-2 rounded-sm bg-white" />}
        </button>

        {/* Name + Severity */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{definition.name}</p>
          <div className="flex gap-1 mt-1 flex-wrap">
            {SEVERITY_LEVELS.map((label, idx) => (
              <button
                key={idx}
                onClick={() => handleSeverityClick(idx)}
                className="w-6 h-6 rounded text-xs font-medium transition-colors"
                style={{
                  backgroundColor:
                    idx === 0
                      ? severity === null
                        ? `${color}30`
                        : "hsl(var(--muted))"
                      : severity === idx - 1
                      ? color
                      : "hsl(var(--muted))",
                  color:
                    (idx === 0 && severity === null) || (idx > 0 && severity === idx - 1)
                      ? idx === 0 ? color : "#fff"
                      : "hsl(var(--muted-foreground))",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Toggle session button */}
        <button
          onClick={handleToggleSession}
          disabled={toggling}
          className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-all border"
          style={{
            borderColor: isActive ? color : "hsl(var(--border))",
            backgroundColor: isActive ? color : "transparent",
            color: isActive ? "#fff" : color,
          }}
          title={isActive ? "End active session" : "Start active session"}
        >
          {isActive ? <Minus className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
        </button>
      </div>

      {/* Delete confirm */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card border border-border rounded-xl p-6 max-w-sm mx-4 space-y-4">
            <p className="text-sm font-medium">Delete "{definition.name}"?</p>
            <p className="text-xs text-muted-foreground">This will not delete existing session history.</p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-3 py-2 rounded-lg border border-border text-sm hover:bg-muted/50"
              >
                Cancel
              </button>
              <button
                onClick={handleArchive}
                className="flex-1 px-3 py-2 rounded-lg bg-destructive text-white text-sm"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Export checked/severity state so SymptomsSection can collect at save time
export function useSymptomCardState() {
  const [states, setStates] = useState({});
  const setCardState = (id, state) =>
    setStates((prev) => ({ ...prev, [id]: state }));
  const getChecked = () =>
    Object.entries(states)
      .filter(([, s]) => s.checked)
      .map(([id, s]) => ({ id, severity: s.severity }));
  return { states, setCardState, getChecked };
}