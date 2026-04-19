import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { base44 } from "@/api/base44Client";
import { HexColorPicker } from "react-colorful";
import { X } from "lucide-react";

function ColorPickerModal({ color, onSave, onClose }) {
  const [hex, setHex] = useState(color || "#000000");
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background border-2 border-border rounded-xl p-6 space-y-4 max-w-sm mx-4 w-full">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Pick Color</h3>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        <HexColorPicker color={hex} onChange={setHex} style={{ width: "100%" }} />
        <input type="text" value={hex}
          onChange={e => { if (/^#?[0-9A-F]{0,6}$/i.test(e.target.value)) setHex(e.target.value); }}
          className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm font-mono" />
        <div className="w-full h-10 rounded-lg border-2 border-border" style={{ backgroundColor: hex }} />
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2 rounded-lg bg-muted text-muted-foreground text-sm font-medium">Cancel</button>
          <button type="button" onClick={() => { onSave(hex); onClose(); }}
            disabled={!/^#[0-9A-F]{6}$/i.test(hex)}
            className="flex-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">Save</button>
        </div>
      </div>
    </div>
  );
}
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function GroupEditModal({
  group,
  allGroups,
  isOpen,
  onClose,
  onSave,
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("");
  const [parent, setParent] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);

  useEffect(() => {
    if (group) {
      setName(group.name || "");
      setColor(group.color || "#000000");
      setParent(group.parent || "root");
    }
  }, [group, isOpen]);

  const handleSave = async () => {
    if (!name.trim()) {
      alert("Group name is required");
      return;
    }
    setIsSaving(true);
    try {
      await base44.entities.Group.update(group.id, {
        name,
        color,
        parent: parent === "root" ? "" : parent,
      });
      onSave();
    } finally {
      setIsSaving(false);
    }
  };

  const parentOptions = allGroups.filter((g) => g.id !== group?.id);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Group</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1"
            />
          </div>

          <div>
            <label className="text-sm font-medium">Color</label>
            <div className="flex gap-2 mt-1 items-center">
              <button type="button" onClick={() => setShowColorPicker(true)}
                className="w-10 h-10 rounded-lg border-2 border-border cursor-pointer hover:ring-2 hover:ring-primary transition-all flex-shrink-0"
                style={{ backgroundColor: color || "#000000" }} />
              <Input value={color} onChange={e => setColor(e.target.value)} className="flex-1" />
            </div>
            {showColorPicker && <ColorPickerModal color={color} onSave={setColor} onClose={() => setShowColorPicker(false)} />}
          </div>

          <div>
            <label className="text-sm font-medium">Parent Group</label>
            <Select value={parent} onValueChange={setParent}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="root">Root (No parent)</SelectItem>
                {parentOptions.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}