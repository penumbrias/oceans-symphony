import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DEFAULT_THRESHOLDS } from "@/lib/reportSections";

const THRESHOLD_LABELS = {
  urge_min: "Urge rating ≥",
  symptom_severity_min: "Symptom severity ≥",
  symptom_session_min_minutes: "Active symptom session ≥ (minutes)",
  rapid_switch_count: "Rapid switching (N switches in window)",
  rapid_switch_window_minutes: "Rapid switching window (minutes)",
  mood_avg_below: "Daily mood average below",
};

export default function NoteworthySettings({ thresholds, onChange }) {
  const [expanded, setExpanded] = useState(false);
  const [local, setLocal] = useState(thresholds || DEFAULT_THRESHOLDS);

  const handleChange = (key, value) => {
    const updated = { ...local, [key]: parseInt(value) || 0 };
    setLocal(updated);
    onChange(updated);
  };

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="text-sm text-primary hover:underline"
      >
        Customize thresholds →
      </button>
    );
  }

  return (
    <div className="space-y-3 p-4 bg-muted/20 rounded-lg border border-border/50">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-foreground">What counts as noteworthy</h4>
        <button
          onClick={() => setExpanded(false)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Done
        </button>
      </div>

      <div className="space-y-2.5">
        {Object.entries(THRESHOLD_LABELS).map(([key, label]) => (
          <div key={key} className="flex items-center gap-3">
            <label className="text-sm text-foreground flex-1">{label}</label>
            <Input
              type="number"
              value={local[key] || 0}
              onChange={(e) => handleChange(key, e.target.value)}
              className="w-20 text-sm"
              min="0"
            />
          </div>
        ))}
      </div>

      <div className="pt-2 flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setLocal(DEFAULT_THRESHOLDS);
            onChange(DEFAULT_THRESHOLDS);
          }}
        >
          Reset to defaults
        </Button>
      </div>
    </div>
  );
}