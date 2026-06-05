import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, List, FolderTree, ArrowUpFromLine, Users, Crown, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import GroupTreeRow from "@/components/groups/GroupTreeRow.jsx";
import GroupMembersModal from "@/components/groups/GroupMembersModal";
import CreateGroupModal from "@/components/groups/CreateGroupModal";
import { findRootGroups, findOrphanGroups, wouldCreateCycle, isRootParent } from "@/lib/groupTreeUtils";
import { useTerms } from "@/lib/useTerms";

export default function GroupsManager() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const terms = useTerms();
  // Top-level tab: regular groups vs subsystems (groups owned by an alter).
  const [mainTab, setMainTab] = useState("groups");
  const [managingSubsystem, setManagingSubsystem] = useState(null);
  const [expandedGroups, setExpandedGroups] = useState(new Set());
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [newGroupName, setNewGroupName] = useState("");
  const [isCreatingRoot, setIsCreatingRoot] = useState(false);
  const [draggedGroupId, setDraggedGroupId] = useState(null);
  const [creatingSubgroupFor, setCreatingSubgroupFor] = useState(null);
  // New-group flow now uses the full "Add New Group" modal (avatar, colour,
  // bio, profile style, config) instead of a bare name input.
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [createGroupParent, setCreateGroupParent] = useState(null);
  // "tree" (normal nested view) | "flat" (every group as a flat list,
  // so a buried group is always findable + one tap from being
  // rescued back to root).
  const [viewMode, setViewMode] = useState("tree");

  const { data: allGroups = [] } = useQuery({
    queryKey: ["groups"],
    queryFn: () => base44.entities.Group.list(),
  });
  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });
  const alterById = useMemo(() => Object.fromEntries(alters.map((a) => [a.id, a])), [alters]);

  // Subsystems (owned by an alter) live in their own tab; the regular
  // group tree below only deals with un-owned groups.
  const unownedGroups = useMemo(() => allGroups.filter((g) => !g.owner_alter_id), [allGroups]);
  const ownedGroups = useMemo(
    () => allGroups.filter((g) => g.owner_alter_id).sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    [allGroups]
  );

  // findRootGroups returns true roots PLUS orphans (groups whose
  // parent chain is broken or cyclic), so a buried group always
  // renders at the top level — never invisible. The previous filter
  // only matched literal root parents, which is how groups got
  // "lost" in the abyss.
  const rootGroups = useMemo(() => findRootGroups(unownedGroups), [unownedGroups]);
  const orphanGroups = useMemo(() => findOrphanGroups(unownedGroups), [unownedGroups]);
  const flatGroups = useMemo(
    () => [...unownedGroups].sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    [unownedGroups]
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
    // Open the full Add New Group modal with this group pre-set as the parent.
    const parent = allGroups.find((g) => g.id === groupId) || null;
    setCreateGroupParent(parent);
    setCreateGroupOpen(true);
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
    <div className="min-h-screen p-6">
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

        {/* Main tab: regular groups vs subsystems (owned by an alter). */}
        <div className="inline-flex rounded-lg border border-border overflow-hidden text-sm mb-4">
          <button
            type="button"
            onClick={() => setMainTab("groups")}
            className={`px-3 py-1.5 transition-colors ${mainTab === "groups" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted/50"}`}
          >
            Groups
          </button>
          <button
            type="button"
            onClick={() => setMainTab("subsystems")}
            className={`inline-flex items-center gap-1 px-3 py-1.5 border-l border-border transition-colors ${mainTab === "subsystems" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted/50"}`}
          >
            <Crown className="w-3.5 h-3.5" /> {`Sub${terms.System}s`}{ownedGroups.length > 0 ? ` (${ownedGroups.length})` : ""}
          </button>
        </div>

        {mainTab === "subsystems" ? (
          <div className="space-y-2 bg-card rounded-lg p-4 border border-border">
            {ownedGroups.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No sub{terms.system}s yet — create one from an {terms.alter}'s profile.
              </div>
            ) : (
              ownedGroups.map((g) => {
                const owner = alterById[g.owner_alter_id];
                return (
                  <div
                    key={g.id}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg border border-border/50 hover:bg-muted/30 transition-colors"
                  >
                    {/* Main tap manages members in place (like the Groups
                        tab); the arrow opens the rich profile page. */}
                    <button type="button" onClick={() => setManagingSubsystem(g)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: g.color || "hsl(var(--muted))" }} />
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium text-foreground truncate">{g.name}</span>
                        {owner && (
                          <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                            <Crown className="w-3 h-3 text-amber-500" /> {owner.name}
                          </span>
                        )}
                      </span>
                      <Users className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    </button>
                    <button type="button" onClick={() => navigate(`/group/${g.id}`)} title="Open profile"
                      className="flex-shrink-0 p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors">
                      <ExternalLink className="w-4 h-4" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        ) : (
        <>
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

        {/* Create Root Group — opens the full Add New Group modal */}
        <Button
          onClick={() => { setCreateGroupParent(null); setCreateGroupOpen(true); }}
          variant="outline"
          className="gap-2"
        >
          <Plus className="w-4 h-4" />
          New Group
        </Button>
        </>
        )}

        <CreateGroupModal
          open={createGroupOpen}
          parentGroup={createGroupParent}
          onClose={() => {
            setCreateGroupOpen(false);
            setCreateGroupParent(null);
            queryClient.invalidateQueries({ queryKey: ["groups"] });
          }}
        />

        {managingSubsystem && (
          <GroupMembersModal
            group={managingSubsystem}
            allGroups={allGroups}
            isOpen={!!managingSubsystem}
            onClose={() => {
              setManagingSubsystem(null);
              queryClient.invalidateQueries({ queryKey: ["groups"] });
            }}
          />
        )}
      </div>
    </div>
  );
}