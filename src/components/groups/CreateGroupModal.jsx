import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import ColorPickerModal from "@/components/shared/ColorPickerModal";

export default function CreateGroupModal({ open, onClose, parentGroup = null }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [color, setColor] = useState("#8b5cf6");
  const [saving, setSaving] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    try {
      await base44.entities.Group.create({
        name: name.trim(),
        color,
        parent: parentGroup ? (parentGroup.sp_id || parentGroup.id) : "",
        member_sp_ids: [],
      });
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      toast.success("Group created!");
      setName("");
      setColor("#8b5cf6");
      onClose();
    } catch (e) {
      toast.error(e.message || "Failed to create group");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            New Group{parentGroup ? ` in ${parentGroup.name}` : ""}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <div className="space-y-2">
            <Label>Group Name *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Age, Gender, Role..."
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
            />
          </div>
          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setShowColorPicker(true)}
                className="w-10 h-10 rounded-lg border-2 border-border cursor-pointer hover:ring-2 hover:ring-primary transition-all flex-shrink-0"
                style={{ backgroundColor: color }} />
              <Input value={color} onChange={e => setColor(e.target.value)} placeholder="#8b5cf6" className="font-mono text-sm" />
            </div>
            {showColorPicker && <ColorPickerModal color={color} onSave={setColor} onClose={() => setShowColorPicker(false)} />}
          </div>
          <Button onClick={handleSave} disabled={saving} className="w-full bg-primary hover:bg-primary/90">
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Create Group
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}