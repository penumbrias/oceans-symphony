import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { HexColorPicker } from "react-colorful";

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

// Cycles: a_to_b → b_to_a → bidirectional → a_to_b
const DIRECTION_CYCLE = ["a_to_b", "b_to_a", "bidirectional"];

function directionLabel(direction, nameA, nameB) {
  if (!nameA || !nameB) return "↔";
  if (direction === "a_to_b") return `${nameA} → ${nameB}`;
  if (direction === "b_to_a") return `${nameB} → ${nameA}`;
  return `${nameA} ↔ ${nameB}`;
}

function AlterPickerDropdown({ label, selected, allAlters, excludeId, onSelect }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = allAlters.filter(a =>
    a.id !== excludeId &&
    (search === "" || a.name.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-1 relative">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-background hover:bg-muted/30 transition-colors text-left">
        {selected ? (
          <>
            {selected.avatar_url ? (
              <img src={selected.avatar_url} className="w-5 h-5 rounded-full object-cover flex-shrink-0" />
            ) : (
              <div className="w-5 h-5 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 text-xs"
                style={{ backgroundColor: selected.color || "#8b5cf6" }}>
                {selected.name?.charAt(0)?.toUpperCase()}
              </div>
            )}
            <p className="text-sm font-medium text-foreground truncate">{selected.name}</p>
          </>
        ) : (
          <span className="text-sm text-muted-foreground">Select an alter...</span>
        )}
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-50">
          <input
            type="text"
            placeholder="Search alters..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full px-3 py-2 border-b border-border/50 bg-background rounded-t-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">No alters found</p>
            ) : (
              filtered.map(alter => (
                <button
                  key={alter.id}
                  onClick={() => { onSelect(alter); setOpen(false); setSearch(""); }}
                  className="w-full flex items-center gap-2 px-3 py-2 border-b border-border/30 hover:bg-muted/40 transition-colors text-left">
                  {alter.avatar_url ? (
                    <img src={alter.avatar_url} className="w-5 h-5 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-5 h-5 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 text-xs"
                      style={{ backgroundColor: alter.color || "#8b5cf6" }}>
                      {alter.name?.charAt(0)?.toUpperCase()}
                    </div>
                  )}
                  <p className="text-sm font-medium text-foreground truncate">{alter.name}</p>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function CreateRelationshipModal({ alterA: initialAlterA, allAlters = [], alterB: initialAlterB, onSave, onClose }) {
  const [selectedAlterA, setSelectedAlterA] = useState(initialAlterA || null);
  const [selectedAlterB, setSelectedAlterB] = useState(initialAlterB || null);
  const [direction, setDirection] = useState("bidirectional");
  const [relType, setRelType] = useState("Friends");
  const [customLabel, setCustomLabel] = useState("");
  const [color, setColor] = useState("#3b82f6");
  const [notes, setNotes] = useState("");
  const [showColorPicker, setShowColorPicker] = useState(false);

  const handleTypeChange = (type) => {
    setRelType(type);
    const preset = RELATIONSHIP_PRESETS.find(p => p.type === type);
    if (preset) setColor(preset.color);
  };

  const cycleDirection = () => {
    const idx = DIRECTION_CYCLE.indexOf(direction);
    setDirection(DIRECTION_CYCLE[(idx + 1) % DIRECTION_CYCLE.length]);
  };

  const handleSave = () => {
    if (!selectedAlterA || !selectedAlterB) return;
    onSave({
      alter_id_a: selectedAlterA.id,
      alter_id_b: selectedAlterB.id,
      relationship_type: relType,
      custom_label: relType === "Custom" ? customLabel : "",
      direction,
      color,
      notes,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 pb-16 sm:pb-0" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl p-5 shadow-xl w-full max-w-sm mx-4 space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-foreground">Create Relationship</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>

        {/* Alter A */}
        <AlterPickerDropdown
          label="Alter A"
          selected={selectedAlterA}
          allAlters={allAlters}
          excludeId={selectedAlterB?.id}
          onSelect={setSelectedAlterA}
        />

        {/* Alter B */}
        <AlterPickerDropdown
          label="Alter B"
          selected={selectedAlterB}
          allAlters={allAlters}
          excludeId={selectedAlterA?.id}
          onSelect={setSelectedAlterB}
        />

        {/* Direction — tap arrow to cycle */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Direction</p>
          <button
            onClick={cycleDirection}
            className="w-full px-4 py-3 rounded-xl border-2 border-primary/40 bg-primary/5 text-primary font-semibold text-sm text-center hover:bg-primary/10 transition-colors select-none"
          >
            {directionLabel(direction, selectedAlterA?.name, selectedAlterB?.name)}
            <span className="block text-xs text-primary/60 font-normal mt-0.5">tap to change direction</span>
          </button>
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
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Color</p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowColorPicker(v => !v)}
              className="w-9 h-9 rounded-lg border-2 border-border cursor-pointer hover:ring-2 hover:ring-primary transition-all flex-shrink-0"
              style={{ backgroundColor: color }}
            />
            <span className="text-xs text-muted-foreground font-mono">{color}</span>
          </div>
          {showColorPicker && (
            <div className="mt-2 p-3 bg-card border border-border rounded-xl shadow-lg space-y-2">
              <HexColorPicker color={color} onChange={setColor} style={{ width: "100%" }} />
              <input
                type="text"
                value={color}
                onChange={e => { if (/^#?[0-9A-F]{0,6}$/i.test(e.target.value)) setColor(e.target.value); }}
                className="w-full h-8 px-2 rounded border border-border bg-background text-xs font-mono"
              />
            </div>
          )}
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
            disabled={!selectedAlterA || !selectedAlterB || (relType === "Custom" && !customLabel.trim())}>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}