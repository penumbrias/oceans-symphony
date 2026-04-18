import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { X } from "lucide-react";
import { toast } from "sonner";

export default function GroupPickerModal({ alter, open, onClose }) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  const { data: groups = [] } = useQuery({
    queryKey: ["groups"],
    queryFn: () => base44.entities.Group.list(),
  });

  const [selectedGroupIds, setSelectedGroupIds] = useState(
    new Set(
      groups.filter((g) => g.alter_ids?.includes(alter?.id)).map((g) => g.id)
    )
  );

  const toggleGroup = (groupId) => {
    const newSet = new Set(selectedGroupIds);
    if (newSet.has(groupId)) newSet.delete(groupId);
    else newSet.add(groupId);
    setSelectedGroupIds(newSet);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Update each group
      for (const group of groups) {
        const isSelected = selectedGroupIds.has(group.id);
        const currentMembers = new Set(group.alter_ids || []);
        const shouldBeMember = isSelected;

        if (shouldBeMember && !currentMembers.has(alter.id)) {
          currentMembers.add(alter.id);
        } else if (!shouldBeMember && currentMembers.has(alter.id)) {
          currentMembers.delete(alter.id);
        }

        await base44.entities.Group.update(group.id, {
          alter_ids: Array.from(currentMembers),
        });
      }

      toast.success("Group membership updated!");
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      queryClient.invalidateQueries({ queryKey: ["alters"] });
      onClose();
    } catch (err) {
      toast.error(err.message || "Failed to update groups");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Groups for {alter?.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-4">
          {groups.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No groups yet</p>
          ) : (
            groups.map((group) => (
              <label
                key={group.id}
                className="flex items-center gap-3 p-3 rounded-lg border border-border/50 hover:bg-muted/30 transition-colors cursor-pointer"
              >
                <Checkbox
                  checked={selectedGroupIds.has(group.id)}
                  onChange={() => toggleGroup(group.id)}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{group.name}</p>
                  {group.description && (
                    <p className="text-xs text-muted-foreground truncate">{group.description}</p>
                  )}
                </div>
                {group.icon && <span className="text-lg flex-shrink-0">{group.icon}</span>}
              </label>
            ))
          )}
        </div>

        <div className="flex gap-2 pt-4 border-t border-border/50">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button className="flex-1 bg-primary hover:bg-primary/90" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}