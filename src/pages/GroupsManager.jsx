import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, List, FolderTree, ArrowUpFromLine } from "lucide-react";
import { toast } from "sonner";
import GroupTreeRow from "@/components/groups/GroupTreeRow.jsx";
import { findRootGroups, findOrphanGroups, wouldCreateCycle, isRootParent } from "@/lib/groupTreeUtils";

export default function GroupsManager() {
  const queryClient = useQueryClient();
  const [expandedGroups, setExpandedGroups] = useState(new Set());
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [newGroupName, setNewGroupName] = useState("");
  const [isCreatingRoot, setIsCreatingRoot] = useState(false);
  const [draggedGroupId, setDraggedGroupId] = useState(null);
  const [creatingSubgroupFor, setCreatingSubgroupFor] = useState(null);
  // "tree" (normal nested view) | "flat" (every group as a flat list,
  // so a buried group is always findable + one tap from being
  // rescued back to root).
  const [viewMode, setViewMode] = useState("tree");

  const { data: allGroups = [] } = useQuery({
    queryKey: ["groups"],
    queryFn: () => base44.entities.Group.list(),
  });

  // findRootGroups returns true roots PLUS orphans (groups whose
  // parent chain is broken or cyclic), so a buried group always
  // renders at the top level — never invisible. The previous filter
  // only matched literal root parents, which is how groups got
  // "lost" in the abyss.
  const rootGroups = useMemo(() => findRootGroups(allGroups), [allGroups]);
  const orphanGroups = useMemo(() => findOrphanGroups(allGroups), [allGroups]);
  const flatGroups = useMemo(
    () => [...allGroups].sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    [allGroups]
  );

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



  const handleDropGroup = async (draggedGroupId, targetGroupId) => {
    if (draggedGroupId === targetGroupId) return;

    try {
      // Refuse drops that would create a cycle. Without this guard,
      // dragging a parent into one of its own descendants disconnects
      // the parent from the root and buries every nested group along
      // with it — exactly what produced the "lost in the abyss" bug.
      if (targetGroupId && wouldCreateCycle(targetGroupId, draggedGroupId, allGroups)) {
        toast.error("Can't move a group into one of its own subgroups");
        return;
      }
      const parent = targetGroupId === null ? "root" : targetGroupId;
      await base44.entities.Group.update(draggedGroupId, { parent });
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      toast.success("Group moved!");
      setSelectedGroupId(null);
    } catch (err) {
      toast.error(err.message || "Failed to move group");
    }
  };

  const handleMoveToRoot = async (groupId) => {
    try {
      await base44.entities.Group.update(groupId, { parent: "root" });
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      toast.success("Moved to root");
    } catch (err) {
      toast.error(err.message || "Failed to move group");
    }
  };

  const handleRescueAllOrphans = async () => {
    if (orphanGroups.length === 0) return;
    try {
      for (const g of orphanGroups) {
        await base44.entities.Group.update(g.id, { parent: "root" });
      }
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      toast.success(`Moved ${orphanGroups.length} buried group${orphanGroups.length === 1 ? "" : "s"} to root`);
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
    if (!newGroupName.trim()) {
      toast.error("Group name is required");
      return;
    }
    try {
      await base44.entities.Group.create({
        name: newGroupName,
        parent: parentGroupId,
      });
      toast.success("Subgroup created!");
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      setNewGroupName("");
      setCreatingSubgroupFor(null);
      setExpandedGroups(new Set([...expandedGroups, parentGroupId]));
    } catch (err) {
      toast.error(err.message || "Failed to create subgroup");
    }
  };

  const handleStartCreateSubgroup = (groupId) => {
    setCreatingSubgroupFor(groupId);
    setNewGroupName("");
  };

  const handleDeleteGroup = async (groupId) => {
    try {
      await base44.entities.Group.delete(groupId);
      toast.success("Group deleted!");
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      setSelectedGroupId(null);
    } catch (err) {
      toast.error(err.message || "Failed to delete group");
    }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6 flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">Manage Groups</h1>
            <p className="text-muted-foreground text-sm">Drag groups to move them into folders, or use arrows to reorder.</p>
          </div>
          <div className="inline-flex rounded-md border border-border overflow-hidden text-xs">
            <button
              type="button"
              onClick={() => setViewMode("tree")}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 transition-colors ${
                viewMode === "tree" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted/50"
              }`}
            >
              <FolderTree className="w-3.5 h-3.5" /> Nested
            </button>
            <button
              type="button"
              onClick={() => setViewMode("flat")}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 border-l border-border transition-colors ${
                viewMode === "flat" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted/50"
              }`}
            >
              <List className="w-3.5 h-3.5" /> All groups (flat)
            </button>
          </div>
        </div>

        {/* Orphan-recovery banner — surfaces buried groups (broken
            parent chains, cycles, self-parents) so they can be
            rescued back to root with one tap. */}
        {orphanGroups.length > 0 && (
          <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 flex items-start gap-3">
            <ArrowUpFromLine className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0 space-y-1">
              <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                {orphanGroups.length} buried group{orphanGroups.length === 1 ? "" : "s"} found
              </p>
              <p className="text-xs text-muted-foreground">
                These groups got nested under a folder whose chain doesn't lead back to root.
                They're listed here at the top level and can also be moved back to root in one tap.
              </p>
              <button
                type="button"
                onClick={handleRescueAllOrphans}
                className="text-xs font-medium text-amber-600 dark:text-amber-400 hover:underline"
              >
                Move all to root →
              </button>
            </div>
          </div>
        )}

        {/* Groups list — nested tree by default, or flat list of all
            groups when the user wants to find a buried one. */}
        <div className="space-y-0 mb-6 bg-card rounded-lg p-4 border border-border">
          {viewMode === "flat" ? (
            flatGroups.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">No groups yet.</div>
            ) : (
              <div className="space-y-1.5">
                {flatGroups.map((group) => (
                  <div key={group.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/40">
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: group.color || "hsl(var(--muted))" }}
                    />
                    <span className="flex-1 truncate text-sm">{group.name}</span>
                    {!isRootParent(group.parent) && (
                      <button
                        type="button"
                        onClick={() => handleMoveToRoot(group.id)}
                        className="text-[0.6875rem] font-medium text-primary hover:underline inline-flex items-center gap-1"
                      >
                        <ArrowUpFromLine className="w-3 h-3" /> Move to root
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )
          ) : rootGroups.length === 0 ? (
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
                onDropGroup={handleDropGroup}
                draggedGroupId={draggedGroupId}
                setDraggedGroupId={setDraggedGroupId}
                level={0}
                creatingSubgroupFor={creatingSubgroupFor}
                onCreateSubgroup={handleCreateSubgroup}
                onStartCreateSubgroup={handleStartCreateSubgroup}
                onCancelCreateSubgroup={() => setCreatingSubgroupFor(null)}
                newSubgroupName={newGroupName}
                onSubgroupNameChange={setNewGroupName}
                onDeleteGroup={handleDeleteGroup}
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