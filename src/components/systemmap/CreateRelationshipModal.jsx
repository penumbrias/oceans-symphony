import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

export const RELATIONSHIP_PRESETS = [
  { type: "Friends", color: "#3b82f6" },
  { type: "Close friends", color: "#8b5cf6" },
  { type: "Romantic", color: "#ec4899" },
  { type: "Family", color: "#f59e0b" },
  { type: "Rivals", color: "#ef4444" },
  { type: "Conflicted", color: "#f97316" },
  { type: "Protects", color: "#10b981" },
  { type: "Protected by", color: "#10b981" },
  { type: "Created by", color: "#6366f1" },
  { type: "Split from", color: "#a855f7" },
  { type: "Caretaker of", color: "#14b8a6" },
  { type: "Avoids", color: "#6b7280" },
  { type: "Doesn't know", color: "#9ca3af" },
  { type: "Custom", color: "#6b7280" },
];

export default function CreateRelationshipModal({ alterA, alterB, onSave, onClose }) {
  const [direction, setDirection] = useState("bidirectional");
  const [relType, setRelType] = useState("Friends");
  const [customLabel, setCustomLabel] = useState("");
  const [color, setColor] = useState("#3b82f6");
  const [notes, setNotes] = useState("");

  const handleTypeChange = (type) => {
    setRelType(type);
    const preset = RELATIONSHIP_PRESETS.find(p => p.type === type);
    if (preset) setColor(preset.color);
  };

  const handleSave = () => {
    onSave({
      alter_id_a: alterA.id,
      alter_id_b: alterB.id,
      relationship_type: relType,
      custom_label: relType === "Custom" ? customLabel : "",
      direction,
      color,
      notes,
    });
  };

  const directionOptions = [
    { value: "a_to_b", label: `${alterA.name} → ${alterB.name}` },
    { value: "b_to_a", label: `${alterB.name} → ${alterA.name}` },
    { value: "bidirectional", label: `${alterA.name} ↔ ${alterB.name}` },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl p-5 shadow-xl w-full max-w-sm mx-4 space-y-4"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-foreground">Create Relationship</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>

        {/* Direction */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Direction</p>
          <div className="space-y-1">
            {directionOptions.map(opt => (
              <button key={opt.value}
                onClick={() => setDirection(opt.value)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm border transition-colors ${direction === opt.value ? "bg-primary/10 border-primary/40 text-primary" : "border-border hover:bg-muted/40"}`}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Type */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Type</p>
          <select value={relType} onChange={e => handleTypeChange(e.target.value)}
            className="w-full h-9 px-3 rounded-md border border-border bg-background text-sm">
            {RELATIONSHIP_PRESETS.map(p => (
              <option key={p.type} value={p.type}>{p.type}</option>
            ))}
          </select>
          {relType === "Custom" && (
            <input
              value={customLabel} onChange={e => setCustomLabel(e.target.value)}
              placeholder="Enter custom label..."
              className="mt-2 w-full h-9 px-3 rounded-md border border-border bg-background text-sm"
            />
          )}
        </div>

        {/* Color */}
        <div className="flex items-center gap-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Color</p>
          <div className="flex items-center gap-2">
            <input type="color" value={color} onChange={e => setColor(e.target.value)}
              className="w-8 h-8 rounded border border-border cursor-pointer bg-transparent" />
            <span className="text-xs text-muted-foreground">{color}</span>
          </div>
        </div>

        {/* Notes */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Notes (optional)</p>
          <textarea value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Add context..."
            rows={2}
            className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm resize-none" />
        </div>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" onClick={handleSave}
            disabled={relType === "Custom" && !customLabel.trim()}>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}