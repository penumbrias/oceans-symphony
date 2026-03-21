import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import GroupTreeRow from "@/components/groups/GroupTreeRow.jsx";

export default function GroupsManager() {
  const queryClient = useQueryClient();
  const [expandedGroups, setExpandedGroups] = useState(new Set());
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [newGroupName, setNewGroupName] = useState("");
  const [isCreatingRoot, setIsCreatingRoot] = useState(false);
  const [creatingSubgroupFor, setCreatingSubgroupFor] = useState(null);

  const { data: allGroups = [] } = useQuery({
    queryKey: ["groups"],
    queryFn: () => base44.entities.Group.list(),
  });

  // Get root groups: those with no parent, empty parent, or "root" parent
  const rootGroupIds = new Set(
    allGroups
      .filter((g) => !g.parent || g.parent === "" || g.parent === "root")
      .map((g) => g.id)
  );

  const rootGroups = allGroups
    .filter((g) => !g.parent || g.parent === "" || g.parent === "root")
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  const toggleExpanded = (groupId) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupId)) {
      newExpanded.delete(groupId);
    } else {
      newExpanded.add(groupId);
    }
    setExpandedGroups(newExpanded);
  };

  const handleSelectGroup = (groupId) => {
    setSelectedGroupId(groupId === selectedGroupId ? null : groupId);
  };

  const handleChangeColor = async (groupId, color) => {
    try {
      await base44.entities.Group.update(groupId, { color });
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      toast.success("Color updated!");
    } catch (err) {
      toast.error(err.message || "Failed to update color");
    }
  };

  const handleMoveGroupsIn = async (groupIds, targetParentId) => {
    try {
      for (const groupId of groupIds) {
        await base44.entities.Group.update(groupId, { parent: targetParentId });
      }
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      toast.success(`Moved ${groupIds.length} group(s) in!`);
    } catch (err) {
      toast.error(err.message || "Failed to move groups");
    }
  };

  const handleMoveGroupsOut = async (groupIds) => {
    try {
      // Get the current parent of the first group (they should all be siblings)
      const group = allGroups.find((g) => g.id === groupIds[0]);
      if (!group || !group.parent) {
        toast.error("Cannot move out of root");
        return;
      }

      // Move all selected groups to root
      for (const groupId of groupIds) {
        await base44.entities.Group.update(groupId, { parent: "root" });
      }
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      toast.success(`Moved ${groupIds.length} group(s) out!`);
    } catch (err) {
      toast.error(err.message || "Failed to move groups");
    }
  };

  const handleCreateRootGroup = async () => {
    if (!newGroupName.trim()) {
      toast.error("Group name is required");
      return;
    }
    try {
      await base44.entities.Group.create({
        name: newGroupName,
        parent: "root",
      });
      toast.success("Group created!");
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      setNewGroupName("");
      setIsCreatingRoot(false);
    } catch (err) {
      toast.error(err.message || "Failed to create group");
    }
  };

  const handleCreateSubgroup = async (parentGroupId) => {
    setCreatingSubgroupFor(parentGroupId);
  };

  const handleSaveSubgroup = async () => {
    if (!newGroupName.trim()) {
      toast.error("Group name is required");
      return;
    }
    try {
      await base44.entities.Group.create({
        name: newGroupName,
        parent: creatingSubgroupFor,
      });
      toast.success("Subgroup created!");
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      setNewGroupName("");
      setCreatingSubgroupFor(null);
      setExpandedGroups(new Set([...expandedGroups, creatingSubgroupFor]));
    } catch (err) {
      toast.error(err.message || "Failed to create subgroup");
    }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Manage Groups</h1>
          <p className="text-muted-foreground text-sm">Click a group to select it and change its color. Use arrows to move groups in and out.</p>
        </div>

        {/* Groups Tree */}
        <div className="space-y-0 mb-6 bg-card rounded-lg p-4 border border-border">
          {rootGroups.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No groups yet. Create one to get started.
            </div>
          ) : (
            rootGroups.map((group) => (
              <GroupTreeRow
                key={group.id}
                group={group}
                allGroups={allGroups}
                expandedGroups={expandedGroups}
                onToggleExpanded={toggleExpanded}
                selectedGroupId={selectedGroupId}
                onSelectGroup={handleSelectGroup}
                onChangeColor={handleChangeColor}
                onMoveGroupsIn={handleMoveGroupsIn}
                onMoveGroupsOut={handleMoveGroupsOut}
                onCreateSubgroup={handleCreateSubgroup}
                level={0}
                parentId="root"
              />
            ))
          )}
        </div>

        {/* Create Root Group */}
        {!isCreatingRoot ? (
          <Button
            onClick={() => setIsCreatingRoot(true)}
            variant="outline"
            className="gap-2"
          >
            <Plus className="w-4 h-4" />
            New Root Group
          </Button>
        ) : (
          <div className="flex gap-2">
            <Input
              autoFocus
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateRootGroup();
                if (e.key === "Escape") setIsCreatingRoot(false);
              }}
              placeholder="New group name"
              className="flex-1"
            />
            <Button onClick={handleCreateRootGroup} className="bg-primary hover:bg-primary/90">
              Create
            </Button>
            <Button onClick={() => setIsCreatingRoot(false)} variant="outline">
              Cancel
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}