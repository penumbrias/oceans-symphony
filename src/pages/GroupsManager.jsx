import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronDown, ChevronRight, Plus, Trash2, Edit2, Loader2, FolderPlus } from "lucide-react";
import { toast } from "sonner";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import GroupTreeNode from "@/components/groups/GroupTreeNode";

export default function GroupsManager() {
  const queryClient = useQueryClient();
  const [expandedGroups, setExpandedGroups] = useState(new Set());
  const [editingGroup, setEditingGroup] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", color: "", tags: [] });
  const [creatingParentId, setCreatingParentId] = useState(null);
  const [newGroupName, setNewGroupName] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

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

  const handleEditGroup = (group) => {
    setEditingGroup(group);
    setEditForm({
      name: group.name || "",
      color: group.color || "",
      tags: group.tags || [],
    });
  };

  const handleSaveEdit = async () => {
    if (!editForm.name.trim()) {
      toast.error("Group name is required");
      return;
    }
    setSavingEdit(true);
    try {
      await base44.entities.Group.update(editingGroup.id, {
        name: editForm.name,
        color: editForm.color,
        tags: editForm.tags,
      });
      toast.success("Group updated!");
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      setEditingGroup(null);
    } catch (err) {
      toast.error(err.message || "Failed to update group");
    } finally {
      setSavingEdit(false);
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

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Manage Groups</h1>
          <p className="text-muted-foreground text-sm">Organize, edit, and delete groups. Alters will be preserved.</p>
        </div>

        {/* Edit Panel */}
        {editingGroup && (
          <div className="mb-8 p-6 bg-card border border-border/50 rounded-xl space-y-4">
            <h2 className="font-semibold text-foreground">Edit Group: {editingGroup.name}</h2>

            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Name</label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                placeholder="Group name"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Color</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={editForm.color || "#8b5cf6"}
                  onChange={(e) => setEditForm({ ...editForm, color: e.target.value })}
                  className="w-10 h-10 rounded-lg border border-border cursor-pointer bg-transparent"
                />
                <Input
                  value={editForm.color}
                  onChange={(e) => setEditForm({ ...editForm, color: e.target.value })}
                  placeholder="#8b5cf6"
                  className="font-mono text-sm"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleSaveEdit}
                disabled={savingEdit}
                className="flex-1 bg-primary hover:bg-primary/90"
              >
                {savingEdit ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Save
              </Button>
              <Button
                onClick={() => setEditingGroup(null)}
                variant="outline"
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Create at root */}
        {creatingParentId === null && (
          <div className="mb-6 p-4 bg-card border border-border/50 rounded-xl space-y-3">
            <div className="flex items-center gap-2">
              <FolderPlus className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-foreground">New Root Group</span>
            </div>
            <div className="flex gap-2">
              <Input
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateGroup(null);
                }}
                placeholder="Group name"
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
          </div>
        )}

        {/* Groups Tree */}
        <div className="space-y-2">
          {rootGroups.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-sm">No groups yet. Create one to get started.</p>
            </div>
          ) : (
            rootGroups.map((group) => (
              <GroupTreeNode
                key={group.id}
                group={group}
                allGroups={allGroups}
                expandedGroups={expandedGroups}
                onToggleExpanded={toggleExpanded}
                onEdit={handleEditGroup}
                onDelete={handleDeleteGroup}
                onCreateChild={setCreatingParentId}
                creatingParentId={creatingParentId}
                newGroupName={newGroupName}
                onNewGroupNameChange={setNewGroupName}
                onCreateGroup={handleCreateGroup}
                deletingId={deletingId}
              />
            ))
          )}
        </div>

        {/* Create Root Button */}
        {creatingParentId === undefined && (
          <div className="mt-6 flex gap-2">
            <Button
              onClick={() => setCreatingParentId(null)}
              className="gap-2 bg-primary hover:bg-primary/90"
            >
              <Plus className="w-4 h-4" />
              New Root Group
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}