import React from "react";
import { Label } from "@/components/ui/label";

const ROTATION_MODES = [
  { id: "off", label: "Off" },
  { id: "random", label: "Random" },
  { id: "sequential", label: "In order" },
];

// Shared Off/Random/Sequential toggle for image-pool rotation, used by both
// the avatar editor (AlterEditModal.jsx) and the background editor
// (ProfileStyleEditor.jsx) so the control stays visually/behaviorally
// identical in both places.
export default function RotationModeControl({ mode, onChange, disabled, onManagePool, showManage, hint, label = "Rotation" }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex rounded-lg border border-input overflow-hidden text-xs">
          {ROTATION_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              disabled={disabled}
              onClick={() => onChange(m.id)}
              className={`px-2.5 py-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                (mode || "off") === m.id ? "bg-primary text-primary-foreground" : "hover:bg-muted/60 text-muted-foreground"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        {showManage && (mode || "off") !== "off" && (
          <button type="button" onClick={onManagePool} className="text-xs text-primary hover:text-primary/80 font-medium">
            Manage pool images →
          </button>
        )}
      </div>
      <p className="text-[0.6875rem] text-muted-foreground leading-snug">{hint}</p>
    </div>
  );
}
