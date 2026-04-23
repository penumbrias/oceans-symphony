import React, { useState } from "react";
import { HexColorPicker } from "react-colorful";
import { X } from "lucide-react";

/**
 * Standard color picker modal used across the app.
 * Props:
 *   color  - initial hex color string (e.g. "#8b5cf6")
 *   label  - title shown in the modal header
 *   onSave(hex) - called with the chosen hex when user clicks Save
 *   onClose()   - called when user clicks Cancel or the X button
 */
export default function ColorPickerModal({ color = "#8b5cf6", label = "Pick Color", onSave, onClose }) {
  const [hex, setHex] = useState(color);
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background border-2 border-border rounded-xl p-6 space-y-4 max-w-sm mx-4 w-full">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">{label}</h3>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
        <HexColorPicker color={hex} onChange={setHex} style={{ width: "100%" }} />
        <input
          type="text"
          value={hex}
          onChange={(e) => { if (/^#?[0-9A-F]{0,6}$/i.test(e.target.value)) setHex(e.target.value); }}
          placeholder="#000000"
          className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm font-mono"
        />
        <div className="w-full h-12 rounded-lg border-2 border-border" style={{ backgroundColor: hex }} />
        <div className="flex gap-2">
          <button type="button" onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 font-medium text-sm cursor-pointer">
            Cancel
          </button>
          <button type="button" onClick={() => { onSave(hex); onClose(); }}
            disabled={!/^#[0-9A-F]{6}$/i.test(hex)}
            className="flex-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 font-medium text-sm cursor-pointer disabled:opacity-50">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}