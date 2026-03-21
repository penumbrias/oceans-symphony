import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { base44 } from "@/api/base44Client";
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
            <div className="flex gap-2 mt-1">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-10 w-20 rounded cursor-pointer"
              />
              <Input
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="flex-1"
              />
            </div>
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