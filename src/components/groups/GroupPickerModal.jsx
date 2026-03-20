import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Save, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";

// Recursive group row with indentation
function GroupRow({ group, depth, checked, onToggle, children }) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = children && children.length > 0;
  const color = group.color || "";

  return (
    <div>
      <div
        className="flex items-center gap-2 py-2 px-2 rounded-lg hover:bg-muted/30 transition-colors"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {hasChildren ? (
          <button onClick={() => setExpanded(!expanded)} className="w-4 h-4 flex-shrink-0 text-muted-foreground">
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        ) : (
          <div className="w-4 flex-shrink-0" />
        )}
        <Checkbox
          id={group.id}
          checked={checked}
          onCheckedChange={() => onToggle(group.id)}
          className="flex-shrink-0"
          style={color ? { borderColor: color, backgroundColor: checked ? color : "transparent" } : {}}
        />
        <label
          htmlFor={group.id}
          className="text-sm font-medium cursor-pointer flex-1 select-none"
          style={{ color: color || undefined }}
          onClick={() => onToggle(group.id)}
        >
          {group.name}
        </label>
      </div>
      {hasChildren && expanded && (
        <div>
          {children.map((child) => child)}
        </div>
      )}
    </div>
  );
}

export default function GroupPickerModal({ alter, open, onClose }) {
  const queryClient = useQueryClient();
  const [selectedGroupIds, setSelectedGroupIds] = useState(new Set());
  const [saving, setSaving] = useState(false);

  const { data: allGroups = [] } = useQuery({
    queryKey: ["groups"],
    queryFn: () => base44.entities.Group.list(),
  });

  // Initialize selected groups from alter's current groups array (source of truth for display)
  useEffect(() => {
    if (!open || !alter || allGroups.length === 0) return;
    const alterGroupIds = new Set((alter.groups || []).map((g) => g.id));
    const initialSelected = new Set(
      allGroups
        .filter((g) => alterGroupIds.has(g.sp_id || g.id))
        .map((g) => g.id)
    );
    setSelectedGroupIds(initialSelected);
  }, [open, alter?.id, allGroups.length]);

  const toggleGroup = (groupId) => {
    setSelectedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const handleSave = async () => {
    if (!alter) return;
    setSaving(true);
    try {
      // For each group, update its member_sp_ids
      const alterId = alter.sp_id || alter.id;
      for (const group of allGroups) {
        const currentMembers = new Set(group.member_sp_ids || []);
        const shouldBeIn = selectedGroupIds.has(group.id);
        const isIn = currentMembers.has(alterId);
        if (shouldBeIn && !isIn) {
          currentMembers.add(alterId);
          await base44.entities.Group.update(group.id, { member_sp_ids: [...currentMembers] });
        } else if (!shouldBeIn && isIn) {
          currentMembers.delete(alterId);
          await base44.entities.Group.update(group.id, { member_sp_ids: [...currentMembers] });
        }
      }
      // Also update groups array on alter for display
      const newGroups = allGroups
        .filter((g) => selectedGroupIds.has(g.id))
        .map((g) => ({ id: g.sp_id || g.id, name: g.name, color: g.color || "" }));
      await base44.entities.Alter.update(alter.id, { groups: newGroups });

      queryClient.invalidateQueries({ queryKey: ["groups"] });
      queryClient.invalidateQueries({ queryKey: ["alters"] });
      queryClient.invalidateQueries({ queryKey: ["alter", alter.id] });
      toast.success("Groups updated!");
      onClose();
    } catch (e) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  // Build tree structure
  function buildTree(groups, parentSpId = null, depth = 0) {
    return groups
      .filter((g) => {
        const parent = g.parent || "";
        if (parentSpId === null) return !parent || parent === "" || parent === "root";
        return parent === parentSpId;
      })
      .map((g) => {
        const children = buildTree(groups, g.sp_id || g.id, depth + 1);
        return (
          <GroupRow
            key={g.id}
            group={g}
            depth={depth}
            checked={selectedGroupIds.has(g.id)}
            onToggle={toggleGroup}
          >
            {children}
          </GroupRow>
        );
      });
  }

  const tree = buildTree(allGroups);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Edit Groups for {alter?.name}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-2 space-y-0.5 min-h-0">
          {allGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No groups found. Sync from Settings to import groups.
            </p>
          ) : (
            tree
          )}
        </div>

        <div className="pt-3 border-t border-border/50">
          <Button onClick={handleSave} disabled={saving} className="w-full bg-primary hover:bg-primary/90">
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save Groups
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}