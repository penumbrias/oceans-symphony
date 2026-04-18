import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";

export function SymptomSessionPopup({ symptom, session, onClose, onSave }) {
  const queryClient = useQueryClient();
  const [adjustedStartTime, setAdjustedStartTime] = useState(
    formatTimeValue(new Date(session.start_time))
  );
  const [adjustedEndTime, setAdjustedEndTime] = useState(
    session.end_time ? formatTimeValue(new Date(session.end_time)) : ""
  );
  const [saving, setSaving] = useState(false);

  function formatTimeValue(date) {
    const h = String(date.getHours()).padStart(2, "0");
    const m = String(date.getMinutes()).padStart(2, "0");
    return `${h}:${m}`;
  }

  function timeToDate(timeStr) {
    const [h, m] = timeStr.split(":").map(Number);
    const date = new Date(session.start_time);
    date.setHours(h, m, 0, 0);
    return date.toISOString();
  }

  const handleAdjustStartTime = async () => {
    setSaving(true);
    try {
      const newStartTime = timeToDate(adjustedStartTime);
      await base44.entities.SymptomSession.update(session.id, {
        start_time: newStartTime,
      });
      queryClient.invalidateQueries({ queryKey: ["symptomSessions"] });
    } finally {
      setSaving(false);
      onClose();
    }
  };

  const handleAdjustEndTime = async () => {
    setSaving(true);
    try {
      const newEndTime = timeToDate(adjustedEndTime);
      await base44.entities.SymptomSession.update(session.id, {
        end_time: newEndTime,
      });
      queryClient.invalidateQueries({ queryKey: ["symptomSessions"] });
    } finally {
      setSaving(false);
      onClose();
    }
  };

  const handleLogSeverity = async (severity) => {
    setSaving(true);
    try {
      const existingSnapshots = session.severity_snapshots || [];
      const newSnapshots = [...existingSnapshots, { severity, timestamp: new Date().toISOString() }];
      await base44.entities.SymptomSession.update(session.id, {
        severity_snapshots: newSnapshots,
      });
      await base44.entities.SymptomCheckIn.create({
        symptom_id: session.symptom_id,
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
      const newEndTime = timeToDate(adjustedEndTime || formatTimeValue(new Date()));
      await base44.entities.SymptomSession.update(session.id, {
        end_time: newEndTime,
        is_active: false,
      });
      queryClient.invalidateQueries({ queryKey: ["symptomSessions"] });
      queryClient.invalidateQueries({ queryKey: ["symptomCheckIns"] });
    } finally {
      setSaving(false);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
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
            type="time"
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
            type="time"
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

        {/* End session */}
        <button
          onClick={handleEndSession}
          disabled={saving}
          className="w-full py-2 rounded-lg text-sm font-medium bg-destructive/10 text-destructive hover:bg-destructive/20 disabled:opacity-50 transition-colors"
        >
          End session
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