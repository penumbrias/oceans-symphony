import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { X, Trash2 } from "lucide-react";
import { toast } from "sonner";

export function SymptomSessionPopup({ symptom, session, onClose, onSave }) {
  const queryClient = useQueryClient();
  const [adjustedStartTime, setAdjustedStartTime] = useState(
    formatDateTimeValue(new Date(session.start_time))
  );
  const [adjustedEndTime, setAdjustedEndTime] = useState(
    session.end_time ? formatDateTimeValue(new Date(session.end_time)) : ""
  );
  const [saving, setSaving] = useState(false);

  // Local "YYYY-MM-DDTHH:mm" for a <input type="datetime-local">. We capture
  // the full DATE as well as the time so a symptom that crosses midnight (or
  // spans multiple days — a migraine from 8pm to 2am the next day) ends on
  // the right day. The old time-only input pinned the end to the START date,
  // so "2am" became 2am the morning the session began — BEFORE the start —
  // which collapsed the bar to nothing.
  function formatDateTimeValue(date) {
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  // datetime-local string (interpreted as local time) → ISO, or null if blank/invalid.
  function dtToISO(value) {
    if (!value) return null;
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  const handleAdjustStartTime = async () => {
    if (saving) return;
    const iso = dtToISO(adjustedStartTime);
    if (!iso) { toast.error("Pick a valid start time"); return; }
    if (session.end_time && new Date(iso) > new Date(session.end_time)) {
      toast.error("Start can't be after the end time");
      return;
    }
    setSaving(true);
    try {
      await base44.entities.SymptomSession.update(session.id, { start_time: iso });
      queryClient.invalidateQueries({ queryKey: ["symptomSessions"] });
      toast.success("Start time updated");
      onClose();
    } catch (err) {
      toast.error(err.message || "Failed to update");
    } finally {
      setSaving(false);
    }
  };

  const handleAdjustEndTime = async () => {
    if (saving) return;
    const iso = dtToISO(adjustedEndTime);
    if (!iso) { toast.error("Pick a valid end time"); return; }
    if (new Date(iso) < new Date(session.start_time)) {
      toast.error("End can't be before the start time");
      return;
    }
    setSaving(true);
    try {
      // A session with an end time is ENDED — flip is_active off too, or it
      // lingers as a ghost-active session (kept reading as active in the
      // "active symptoms" notification + current-symptoms list).
      await base44.entities.SymptomSession.update(session.id, { end_time: iso, is_active: false });
      queryClient.invalidateQueries({ queryKey: ["symptomSessions"] });
      toast.success("End time updated");
      onClose();
    } catch (err) {
      toast.error(err.message || "Failed to update");
    } finally {
      setSaving(false);
    }
  };

  const handleLogSeverity = async (severity) => {
    if (saving) return;
    setSaving(true);
    try {
      const existingSnapshots = session.severity_snapshots || [];
      await base44.entities.SymptomSession.update(session.id, {
        severity_snapshots: [...existingSnapshots, { severity, timestamp: new Date().toISOString() }],
      });
      await base44.entities.SymptomCheckIn.create({
        symptom_id: session.symptom_id,
        severity,
        timestamp: new Date().toISOString(),
      });
      queryClient.invalidateQueries({ queryKey: ["symptomSessions"] });
      queryClient.invalidateQueries({ queryKey: ["symptomCheckIns"] });
      toast.success(`Severity ${severity} logged`);
      onClose();
    } catch (err) {
      toast.error(err.message || "Failed to log");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (saving) return;
    if (!window.confirm("Delete this symptom session? This can't be undone.")) return;
    setSaving(true);
    try {
      await base44.entities.SymptomSession.delete(session.id);
      queryClient.invalidateQueries({ queryKey: ["symptomSessions"] });
      queryClient.invalidateQueries({ queryKey: ["symptomCheckIns"] });
      toast.success("Session deleted");
      onClose();
    } catch (err) {
      toast.error(err.message || "Failed to delete");
    } finally {
      setSaving(false);
    }
  };

  const handleEndSession = async () => {
    if (saving) return;
    // Default to "now" when no explicit end was picked.
    const iso = adjustedEndTime ? dtToISO(adjustedEndTime) : new Date().toISOString();
    if (!iso) { toast.error("Pick a valid end time"); return; }
    if (new Date(iso) < new Date(session.start_time)) {
      toast.error("End can't be before the start time");
      return;
    }
    setSaving(true);
    try {
      await base44.entities.SymptomSession.update(session.id, {
        end_time: iso,
        is_active: false,
      });
      queryClient.invalidateQueries({ queryKey: ["symptomSessions"] });
      queryClient.invalidateQueries({ queryKey: ["symptomCheckIns"] });
      toast.success("Session ended");
      onClose();
    } catch (err) {
      toast.error(err.message || "Failed to end session");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 pb-16 sm:pb-0" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-xl p-4 shadow-xl max-w-xs w-full mx-4 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">{symptom?.label || "Symptom"}</p>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Adjust start time */}
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground font-medium">Adjust start time</p>
          <input
            type="datetime-local"
            value={adjustedStartTime}
            onChange={(e) => setAdjustedStartTime(e.target.value)}
            className="w-full h-8 px-2 rounded-md border border-input bg-background text-sm"
          />
          <button
            onClick={handleAdjustStartTime}
            disabled={saving}
            className="w-full px-2 py-1.5 text-xs rounded-lg bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50 transition-colors"
          >
            Save start time
          </button>
        </div>

        {/* Adjust end time */}
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground font-medium">Adjust end time</p>
          <input
            type="datetime-local"
            value={adjustedEndTime}
            onChange={(e) => setAdjustedEndTime(e.target.value)}
            className="w-full h-8 px-2 rounded-md border border-input bg-background text-sm"
          />
          <button
            onClick={handleAdjustEndTime}
            disabled={saving || !adjustedEndTime}
            className="w-full px-2 py-1.5 text-xs rounded-lg bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50 transition-colors"
          >
            Save end time
          </button>
        </div>

        <div className="border-t border-border" />

        {/* Log severity */}
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground font-medium">Log severity now</p>
          <div className="flex gap-1.5">
            {[1, 2, 3, 4, 5].map((i) => (
              <button
                key={i}
                onClick={() => handleLogSeverity(i)}
                disabled={saving}
                className="flex-1 py-1.5 rounded-lg text-xs font-medium bg-muted/50 text-muted-foreground hover:bg-muted disabled:opacity-50 transition-colors"
              >
                {i}
              </button>
            ))}
          </div>
        </div>

        {/* End / Delete session */}
        {!session.end_time && (
          <button
            onClick={handleEndSession}
            disabled={saving}
            className="w-full py-2 rounded-lg text-sm font-medium bg-destructive/10 text-destructive hover:bg-destructive/20 disabled:opacity-50 transition-colors"
          >
            End session
          </button>
        )}

        <button
          onClick={handleDelete}
          disabled={saving}
          className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Delete session
        </button>

        <button
          onClick={onClose}
          className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors pt-1"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}