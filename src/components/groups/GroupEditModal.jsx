import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import ColorPickerModal from "@/components/shared/ColorPickerModal";
import { wouldCreateCycle } from "@/lib/groupTreeUtils";
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
    // Refuse parent changes that would create a cycle (group becomes
    // an ancestor of itself). Mirrors GroupsManager's drag-drop guard
    // — without this, picking a descendant as the new parent would
    // brick navigation, the same class of bug that hit Activity
    // categories before cycle-safety was added.
    const nextParentId = parent === "root" ? "" : parent;
    if (nextParentId && wouldCreateCycle(nextParentId, group.id, allGroups)) {
      toast.error("Can't move a group into one of its own subgroups");
      return;
    }
    setIsSaving(true);
    try {
      await base44.entities.Group.update(group.id, {
        name,
        color,
        parent: nextParentId,
      });
      onSave();
    } finally {
      setIsSaving(false);
    }
  };

  // Exclude self AND any descendants from the parent picker so the
  // user can't even attempt to create a cycle. handleSave still
  // calls wouldCreateCycle as a defence-in-depth check for stale
  // dropdown state.
  const parentOptions = (allGroups || []).filter((g) => {
    if (!g.id || g.id === group?.id) return false;
    if (!group?.id) return true;
    return !wouldCreateCycle(g.id, group.id, allGroups);
  });

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