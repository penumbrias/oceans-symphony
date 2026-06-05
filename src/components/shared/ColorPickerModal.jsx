import React, { useState } from "react";
import { HexColorPicker } from "react-colorful";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * Standard color picker modal used across the app.
 *
 * Implemented as a nested Radix dialog (not a hand-rolled portal). This is
 * deliberate: the parent Add New Alter / Add New Group screens are modal Radix
 * dialogs, which set `pointer-events: none` on <body>. A plain portaled overlay
 * appended to <body> inherits that and becomes un-tappable — taps fall straight
 * through to the scrollable dialog behind it. A nested Radix dialog registers
 * with the layer stack, so it gets its own interactive layer + focus scope and
 * stacks above the parent correctly.
 *
 * Props:
 *   color  - initial hex color string (e.g. "#8b5cf6")
 *   label  - title shown in the modal header
 *   onSave(hex) - called with the chosen hex when user clicks Save
 *   onClose()   - called when the user cancels / closes
 */
export default function ColorPickerModal({ color = "#8b5cf6", label = "Pick Color", onSave, onClose }) {
  const [hex, setHex] = useState(color);
  const valid = /^#[0-9A-F]{6}$/i.test(hex);

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose?.(); }}>
      <DialogContent
        className="max-w-sm"
        // Don't let a stray tap outside cancel an in-progress pick.
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <HexColorPicker color={hex} onChange={setHex} style={{ width: "100%" }} />
          <input
            type="text"
            value={hex}
            onChange={(e) => { if (/^#?[0-9A-F]{0,6}$/i.test(e.target.value)) setHex(e.target.value); }}
            placeholder="#000000"
            className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm font-mono"
          />
          <div className="w-full h-12 rounded-lg border-2 border-border" style={{ backgroundColor: valid ? hex : "transparent" }} />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onClose?.()}
              className="flex-1 px-4 py-2 rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 font-medium text-sm cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => { onSave?.(hex); onClose?.(); }}
              disabled={!valid}
              className="flex-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 font-medium text-sm cursor-pointer disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
