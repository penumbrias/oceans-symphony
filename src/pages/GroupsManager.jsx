import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import CreateGroupModal from "@/components/groups/CreateGroupModal";

export default function GroupsManager() {
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);

  const { data: groups = [] } = useQuery({
    queryKey: ["groups"],
    queryFn: () => base44.entities.Group.list(),
  });

  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });

  const handleDeleteGroup = async (groupId) => {
    try {
      await base44.entities.Group.delete(groupId);
      toast.success("Group deleted!");
      queryClient.invalidateQueries({ queryKey: ["groups"] });
    } catch (err) {
      toast.error(err.message || "Failed to delete group");
    }
  };

  const handleDeleteGroup = async (group) => {
    if (window.confirm(`Delete group "${group.name}"?`)) {
      try {
        await base44.entities.Group.delete(group.id);
        toast.success("Group deleted!");
        queryClient.invalidateQueries({ queryKey: ["groups"] });
      } catch (err) {
        toast.error(err.message || "Failed to delete group");
      }
    }
  };

  const handleSaveGroup = () => {
    setShowCreateModal(false);
    setEditingGroup(null);
  };

  const topLevelGroups = groups.filter(g => !g.parent_group_id);
  const getChildren = (parentId) => groups.filter(g => g.parent_group_id === parentId);

  function GroupItem({ group, depth = 0 }) {
    const children = getChildren(group.id);
    return (
      <>
        <div
          style={{ marginLeft: depth * 20 }}
          className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
            depth > 0
              ? "border-l-2 border-l-primary/30 border-border/50 bg-card hover:bg-muted/20"
              : "border-border/50 bg-card hover:bg-muted/20"
          }`}
        >
          {depth > 0 && <span className="text-muted-foreground text-xs">↳</span>}
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
            style={{ backgroundColor: group.color || "#8b5cf6" }}
          >
            {group.icon || group.name?.charAt(0)?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">{group.name}</p>
            {group.description && <p className="text-xs text-muted-foreground truncate">{group.description}</p>}
            <p className="text-xs text-muted-foreground">{group.alter_ids?.length || 0} members</p>
          </div>
          <div className="flex gap-1 flex-shrink-0">
            <button
              onClick={() => setEditingGroup(group)}
              className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
              title="Edit"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleDeleteGroup(group)}
              className="p-1.5 text-muted-foreground hover:text-destructive transition-colors"
              title="Delete"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        {children.map(child => (
          <GroupItem key={child.id} group={child} depth={depth + 1} />
        ))}
      </>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">Manage Groups</h1>
            <p className="text-muted-foreground text-sm">Organize {alters.length} alters into custom groups</p>
          </div>
          <Button onClick={() => setShowCreateModal(true)} className="bg-primary hover:bg-primary/90 gap-2">
            <Plus className="w-4 h-4" />
            New Group
          </Button>
        </div>

        {/* Groups hierarchy */}
         {groups.length === 0 ? (
           <div className="flex flex-col items-center justify-center py-24 text-center">
             <p className="text-muted-foreground mb-4">No groups yet. Create one to get started.</p>
             <Button onClick={() => setShowCreateModal(true)} className="bg-primary hover:bg-primary/90 gap-2">
               <Plus className="w-4 h-4" />
               Create First Group
             </Button>
           </div>
         ) : (
           <div className="space-y-2">
             {topLevelGroups.map(group => (
               <GroupItem key={group.id} group={group} />
             ))}
           </div>
         )}
      </div>

      {/* Create/Edit Modal */}
      {(showCreateModal || editingGroup) && (
        <CreateGroupModal
          group={editingGroup}
          onClose={() => {
            setShowCreateModal(false);
            setEditingGroup(null);
          }}
          onSave={handleSaveGroup}
        />
      )}
    </div>
  );
}