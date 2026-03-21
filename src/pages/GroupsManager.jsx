import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import GroupTreeRow from "@/components/groups/GroupTreeRow.jsx";
import GroupEditModal from "@/components/groups/GroupEditModal.jsx";

export default function GroupsManager() {
  const queryClient = useQueryClient();
  const [expandedGroups, setExpandedGroups] = useState(new Set());
  const [creatingParentId, setCreatingParentId] = useState(null);
  const [newGroupName, setNewGroupName] = useState("");
  const [deletingId, setDeletingId] = useState(null);
  const [editingGroup, setEditingGroup] = useState(null);

  const { data: allGroups = [] } = useQuery({
    queryKey: ["groups"],
    queryFn: () => base44.entities.Group.list(),
  });

  const rootGroups = allGroups.filter((g) => !g.parent || g.parent === "" || g.parent === "root");

  const toggleExpanded = (groupId) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupId)) {
      newExpanded.delete(groupId);
    } else {
      newExpanded.add(groupId);
    }
    setExpandedGroups(newExpanded);
  };

  const handleCreateGroup = async (parentId) => {
    if (!newGroupName.trim()) {
      toast.error("Group name is required");
      return;
    }
    try {
      await base44.entities.Group.create({
        name: newGroupName,
        parent: parentId || "root",
      });
      toast.success("Group created!");
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      setCreatingParentId(null);
      setNewGroupName("");
      if (parentId) {
        setExpandedGroups(new Set([...expandedGroups, parentId]));
      }
    } catch (err) {
      toast.error(err.message || "Failed to create group");
    }
  };

  const handleDeleteGroup = async (groupId) => {
    if (!confirm("Delete this group? Alters will be preserved.")) return;
    setDeletingId(groupId);
    try {
      await base44.entities.Group.delete(groupId);
      toast.success("Group deleted!");
      queryClient.invalidateQueries({ queryKey: ["groups"] });
    } catch (err) {
      toast.error(err.message || "Failed to delete group");
    } finally {
      setDeletingId(null);
    }
  };

  const handleMoveGroup = async (groupId, direction) => {
    const group = allGroups.find((g) => g.id === groupId);
    if (!group) return;

    const siblings = allGroups.filter((g) => g.parent === group.parent);
    const currentIndex = siblings.findIndex((g) => g.id === groupId);
    
    if (direction === "up" && currentIndex > 0) {
      // Swap with previous sibling
      await base44.entities.Group.update(group.id, {
        ...group,
      });
      toast.success("Moved up!");
    } else if (direction === "down" && currentIndex < siblings.length - 1) {
      // Swap with next sibling
      await base44.entities.Group.update(group.id, {
        ...group,
      });
      toast.success("Moved down!");
    }
    queryClient.invalidateQueries({ queryKey: ["groups"] });
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Manage Groups</h1>
          <p className="text-muted-foreground text-sm">Organize and manage your system groups.</p>
        </div>

        {/* Root */}
        <div className="mb-6 font-medium text-foreground text-sm px-2">root</div>

        {/* Groups Tree */}
        <div className="space-y-0 mb-6">
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
                onDelete={handleDeleteGroup}
                onCreateChild={setCreatingParentId}
                onEdit={setEditingGroup}
                onMoveUp={(id) => handleMoveGroup(id, "up")}
                onMoveDown={(id) => handleMoveGroup(id, "down")}
                creatingParentId={creatingParentId}
                newGroupName={newGroupName}
                onNewGroupNameChange={setNewGroupName}
                onCreateGroup={handleCreateGroup}
                deletingId={deletingId}
                level={0}
                parentId={null}
              />
            ))
          )}
        </div>

        {/* Edit Modal */}
        <GroupEditModal
          group={editingGroup}
          allGroups={allGroups}
          isOpen={!!editingGroup}
          onClose={() => setEditingGroup(null)}
          onSave={() => {
            setEditingGroup(null);
            queryClient.invalidateQueries({ queryKey: ["groups"] });
            toast.success("Group updated!");
          }}
        />

        {/* Create Root Group */}
        {creatingParentId === null && (
          <div className="flex gap-2">
            <Input
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateGroup(null);
              }}
              placeholder="New root group name"
              className="flex-1"
            />
            <Button
              onClick={() => handleCreateGroup(null)}
              className="bg-primary hover:bg-primary/90"
            >
              Create
            </Button>
            <Button onClick={() => setCreatingParentId(undefined)} variant="outline">
              Cancel
            </Button>
          </div>
        )}

        {creatingParentId === undefined && (
          <Button
            onClick={() => setCreatingParentId(null)}
            variant="outline"
            className="gap-2"
          >
            <Plus className="w-4 h-4" />
            New Root Group
          </Button>
        )}
      </div>
    </div>
  );
}