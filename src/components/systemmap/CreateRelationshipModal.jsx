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

export default function CreateRelationshipModal({ alterA, allAlters = [], alterB, onSave, onClose }) {
  const [selectedAlterB, setSelectedAlterB] = useState(alterB || null);
  const [searchQuery, setSearchQuery] = useState("");
  const [direction, setDirection] = useState("bidirectional");
  const [relType, setRelType] = useState("Friends");
  const [customLabel, setCustomLabel] = useState("");
  const [color, setColor] = useState("#3b82f6");
  const [notes, setNotes] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);

  const handleTypeChange = (type) => {
    setRelType(type);
    const preset = RELATIONSHIP_PRESETS.find(p => p.type === type);
    if (preset) setColor(preset.color);
  };

  const handleSave = () => {
    if (!selectedAlterB) return;
    onSave({
      alter_id_a: alterA.id,
      alter_id_b: selectedAlterB.id,
      relationship_type: relType,
      custom_label: relType === "Custom" ? customLabel : "",
      direction,
      color,
      notes,
    });
  };

  // Filter alters for dropdown — exclude alterA and optionally filterByQuery
  const filteredAlters = allAlters.filter(a => 
    a.id !== alterA.id && 
    (searchQuery === "" || a.name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const directionOptions = selectedAlterB ? [
    { value: "a_to_b", label: `${alterA.name} → ${selectedAlterB.name}` },
    { value: "b_to_a", label: `${selectedAlterB.name} → ${alterA.name}` },
    { value: "bidirectional", label: `${alterA.name} ↔ ${selectedAlterB.name}` },
  ] : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl p-5 shadow-xl w-full max-w-sm mx-4 space-y-4"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-foreground">Create Relationship</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>

        {/* Alter A (pre-filled, not editable) */}
        <div className="space-y-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Alter A (selected)</p>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border/50 bg-muted/20">
            {alterA.avatar_url ? (
              <img src={alterA.avatar_url} className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
            ) : (
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 text-xs"
                style={{ backgroundColor: alterA.color || "#8b5cf6" }}>
                {alterA.name?.charAt(0)?.toUpperCase()}
              </div>
            )}
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">{alterA.name}</p>
              {alterA.pronouns && <p className="text-xs text-muted-foreground">{alterA.pronouns}</p>}
            </div>
          </div>
        </div>

        {/* Alter B (searchable dropdown) */}
        <div className="space-y-1 relative">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Alter B (choose alter)</p>
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-background hover:bg-muted/30 transition-colors text-left">
            {selectedAlterB ? (
              <>
                {selectedAlterB.avatar_url ? (
                  <img src={selectedAlterB.avatar_url} className="w-5 h-5 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 text-xs"
                    style={{ backgroundColor: selectedAlterB.color || "#8b5cf6" }}>
                    {selectedAlterB.name?.charAt(0)?.toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{selectedAlterB.name}</p>
                  {selectedAlterB.pronouns && <p className="text-xs text-muted-foreground truncate">{selectedAlterB.pronouns}</p>}
                </div>
              </>
            ) : (
              <span className="text-sm text-muted-foreground">Select an alter...</span>
            )}
          </button>

          {showDropdown && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-50">
              <input
                type="text"
                placeholder="Search alters..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full px-3 py-2 border-b border-border/50 bg-background rounded-t-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <div className="max-h-48 overflow-y-auto">
                {filteredAlters.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-muted-foreground">No alters found</p>
                ) : (
                  filteredAlters.map(alter => (
                    <button
                      key={alter.id}
                      onClick={() => {
                        setSelectedAlterB(alter);
                        setShowDropdown(false);
                        setSearchQuery("");
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 border-b border-border/30 hover:bg-muted/40 transition-colors text-left">
                      {alter.avatar_url ? (
                        <img src={alter.avatar_url} className="w-5 h-5 rounded-full object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-5 h-5 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 text-xs"
                          style={{ backgroundColor: alter.color || "#8b5cf6" }}>
                          {alter.name?.charAt(0)?.toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{alter.name}</p>
                        {alter.pronouns && <p className="text-xs text-muted-foreground truncate">{alter.pronouns}</p>}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
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
            disabled={!selectedAlterB || (relType === "Custom" && !customLabel.trim())}>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}