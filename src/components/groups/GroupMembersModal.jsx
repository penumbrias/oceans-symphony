import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Grid3X3, List, Ban } from "lucide-react";
import { toast } from "sonner";
import { useTerms } from "@/lib/useTerms";
import { wouldAddingMemberCycle, isSubsystem } from "@/lib/subsystemUtils";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";

// Avatar that resolves local-image:// (and the SW /local-image/ path) the
// way the rest of the app does — a raw <img src> on a legacy
// local-image:// URL renders broken, which is why member pictures weren't
// showing in this picker.
function MemberThumb({ alter, size = "w-8 h-8", grayscale = false, fallbackInitial = false }) {
  const resolved = useResolvedAvatarUrl(alter?.avatar_url);
  if (resolved) {
    return <img src={resolved} alt={alter?.name || ""} className={`${size} rounded-full object-cover flex-shrink-0 ${grayscale ? "grayscale" : ""}`} />;
  }
  if (fallbackInitial) {
    return (
      <div className={`${size} rounded-full flex-shrink-0 flex items-center justify-center text-white text-lg font-bold ${grayscale ? "grayscale" : ""}`}
        style={{ backgroundColor: alter?.color || "#9333ea" }}>
        {alter?.name?.charAt(0)?.toUpperCase()}
      </div>
    );
  }
  return null;
}

export default function GroupMembersModal({ group, allGroups, isOpen, onClose }) {
  const terms = useTerms();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMode, setFilterMode] = useState("all"); // all, not-in, in
  const [includeSubgroups, setIncludeSubgroups] = useState(false);
  const [viewMode, setViewMode] = useState("list"); // list or grid

  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });

  // Get all group IDs including subgroups if needed
  const getGroupIds = (groupId, includeSubgroups) => {
    if (!includeSubgroups) return [groupId];
    const ids = [groupId];
    // Check both parent === groupId and parent === sp_id of groupId
    const currentGroup = allGroups.find((g) => g.id === groupId);
    const parentMatch = currentGroup?.sp_id || groupId;
    const subgroups = allGroups.filter((g) => g.parent === groupId || g.parent === parentMatch);
    subgroups.forEach((sg) => {
      ids.push(...getGroupIds(sg.id, true));
    });
    return ids;
  };

  const groupIds = useMemo(
    () => getGroupIds(group.id, includeSubgroups),
    [group.id, includeSubgroups, allGroups]
  );

  // Also include sp_id of all groups (current + subgroups) when matching
  const groupKeysToMatch = useMemo(() => {
    const keys = new Set(groupIds);
    // Add sp_id for all groups in the list
    groupIds.forEach((gid) => {
      const g = allGroups.find((grp) => grp.id === gid);
      if (g?.sp_id) keys.add(g.sp_id);
    });
    return keys;
  }, [groupIds, allGroups]);

  const altersInGroup = useMemo(() => {
    return new Set(
      alters
        .filter((alter) => alter.groups?.some((g) => groupKeysToMatch.has(g.id) || groupKeysToMatch.has(g.sp_id)))
        .map((a) => a.id)
    );
  }, [alters, groupKeysToMatch]);

  // When this group is a subsystem (alter-owned), adding certain alters
  // would create an ownership loop (they're an ancestor of the owner).
  // Pre-compute those so the picker can grey them out with an explanation
  // instead of letting the user corrupt the tree.
  const subsystem = isSubsystem(group);
  const owner = useMemo(
    () => (subsystem ? alters.find((a) => a.id === group.owner_alter_id) : null),
    [subsystem, alters, group.owner_alter_id]
  );
  const blockedAlterIds = useMemo(() => {
    if (!subsystem) return new Set();
    const ids = new Set();
    for (const a of alters) {
      if (altersInGroup.has(a.id)) continue; // already in → always removable
      if (wouldAddingMemberCycle(allGroups, alters, group, a.id)) ids.add(a.id);
    }
    return ids;
  }, [subsystem, alters, altersInGroup, allGroups, group]);

  const filteredAlters = useMemo(() => {
    return alters
      .filter((alter) => {
        if (alter.is_archived) return false; // archived alters don't belong in the member picker
        const inGroup = altersInGroup.has(alter.id);
        if (filterMode === "in" && !inGroup) return false;
        if (filterMode === "not-in" && inGroup) return false;
        if (
          searchQuery &&
          !alter.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
          !alter.alias?.toLowerCase().includes(searchQuery.toLowerCase())
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [alters, filterMode, searchQuery, altersInGroup]);

  const handleToggleAlter = async (alterId, isAdding) => {
    try {
      const alter = alters.find((a) => a.id === alterId);
      if (!alter) return;

      // Cycle guard: refuse to add an alter that would loop the ownership
      // tree (the owner is already nested inside this alter's subsystem).
      if (isAdding && blockedAlterIds.has(alterId)) {
        toast.error(
          `Can't add ${alter.name} — ${owner?.name || "the owner"} is already inside ${alter.name}'s ${terms.system}, so this would create a loop.`
        );
        return;
      }

      let updatedGroups = alter.groups || [];
      if (isAdding) {
        if (!updatedGroups.find((g) => g.id === group.id || g.sp_id === group.id)) {
          updatedGroups = [...updatedGroups, { id: group.id, name: group.name, color: group.color }];
        }
      } else {
        updatedGroups = updatedGroups.filter((g) => g.id !== group.id && g.sp_id !== group.id);
      }

      await base44.entities.Alter.update(alterId, { groups: updatedGroups });
      queryClient.invalidateQueries({ queryKey: ["alters"] });
      toast.success(isAdding ? "Alter added!" : "Alter removed!");
    } catch (err) {
      toast.error(err.message || "Failed to update alter");
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Manage {group.name} Members</DialogTitle>
        </DialogHeader>
        {subsystem && (
          <p className="text-xs text-muted-foreground -mt-1">
            {owner?.name ? `${owner.name} owns this ${terms.system}. ` : ""}
            Greyed-out {terms.alters} can't be added — they'd create a loop (the owner is already nested inside their own {terms.system}).
          </p>
        )}

        {/* Controls */}
        <div className="space-y-3">
          {/* Search and View Toggle */}
          <div className="flex gap-2">
            <Input
              placeholder={`Search ${terms.alters}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1"
            />
            <Button
              variant={viewMode === "list" ? "default" : "outline"}
              size="icon"
              onClick={() => setViewMode("list")}
            >
              <List className="w-4 h-4" />
            </Button>
            <Button
              variant={viewMode === "grid" ? "default" : "outline"}
              size="icon"
              onClick={() => setViewMode("grid")}
            >
              <Grid3X3 className="w-4 h-4" />
            </Button>
          </div>

          {/* Filter Buttons */}
          <div className="flex gap-2 flex-wrap">
            <Button
              variant={filterMode === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterMode("all")}
            >
              All Alters
            </Button>
            <Button
              variant={filterMode === "not-in" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterMode("not-in")}
            >
              Not in Group
            </Button>
            <Button
              variant={filterMode === "in" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterMode("in")}
            >
              In Group
            </Button>
          </div>

          {/* Subgroups Checkbox */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="subgroups"
              checked={includeSubgroups}
              onCheckedChange={setIncludeSubgroups}
            />
            <label htmlFor="subgroups" className="text-sm cursor-pointer">
              Include alters from subgroups
            </label>
          </div>
        </div>

        {/* Alter List/Grid */}
        <div
          className={`flex-1 overflow-y-auto border border-border rounded-lg p-4 ${
            viewMode === "grid" ? "grid grid-cols-4 gap-3" : "space-y-2"
          }`}
        >
          {filteredAlters.length === 0 ? (
            <div className="text-center text-muted-foreground text-sm py-8 col-span-full">
              No alters found
            </div>
          ) : viewMode === "list" ? (
            filteredAlters.map((alter) => {
              const inGroup = altersInGroup.has(alter.id);
              const blocked = blockedAlterIds.has(alter.id);
              if (blocked) {
                return (
                  <div
                    key={alter.id}
                    title={`${owner?.name || "The owner"} is already inside ${alter.name}'s ${terms.system} — adding them would loop.`}
                    className="flex items-center gap-3 p-2 rounded-lg opacity-50 cursor-not-allowed"
                  >
                    <Ban className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                    <MemberThumb alter={alter} grayscale />
                    <span className="text-sm flex-1 line-through">{alter.name}</span>
                    <span className="text-[0.625rem] text-muted-foreground italic flex-shrink-0">would loop</span>
                  </div>
                );
              }
              return (
              <div
                key={alter.id}
                onClick={() => handleToggleAlter(alter.id, !inGroup)}
                role="button"
                tabIndex={0}
                className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
                  inGroup ? "bg-primary/10 hover:bg-primary/15" : "hover:bg-muted"
                }`}
              >
                {/* Whole row toggles; checkbox is a visual indicator only
                    (pointer-events-none) so taps anywhere on the row work
                    without having to hit the small box. */}
                <Checkbox
                  checked={inGroup}
                  className="pointer-events-none flex-shrink-0"
                  tabIndex={-1}
                />
                <MemberThumb alter={alter} />
                <span className="text-sm flex-1">{alter.name}</span>
              </div>
              );
            })
          ) : (
            filteredAlters.map((alter) => {
              const inGroup = altersInGroup.has(alter.id);
              const blocked = blockedAlterIds.has(alter.id);
              if (blocked) {
                return (
                  <div
                    key={alter.id}
                    title={`${owner?.name || "The owner"} is already inside ${alter.name}'s ${terms.system} — adding them would loop.`}
                    className="relative flex flex-col items-center gap-1.5 p-2 rounded-lg opacity-50 cursor-not-allowed"
                  >
                    <Ban className="absolute top-1.5 right-1.5 w-3.5 h-3.5 text-muted-foreground" />
                    <MemberThumb alter={alter} size="w-12 h-12" grayscale fallbackInitial />
                    <span className="text-xs text-center font-medium w-full truncate leading-tight line-through">{alter.alias || alter.name}</span>
                  </div>
                );
              }
              return (
                <div
                  key={alter.id}
                  onClick={() => handleToggleAlter(alter.id, !inGroup)}
                  role="button"
                  tabIndex={0}
                  className={`relative flex flex-col items-center gap-1.5 p-2 rounded-lg cursor-pointer transition-colors ${
                    inGroup ? "bg-primary/10 hover:bg-primary/15" : "hover:bg-muted"
                  }`}
                >
                  <Checkbox
                    checked={inGroup}
                    className="absolute top-1.5 right-1.5 w-3.5 h-3.5 pointer-events-none"
                    tabIndex={-1}
                  />
                  <MemberThumb alter={alter} size="w-12 h-12" fallbackInitial />
                  <span className="text-xs text-center font-medium w-full truncate leading-tight">
                    {alter.alias || alter.name}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* Close Button */}
        <Button onClick={onClose} variant="outline">
          Done
        </Button>
      </DialogContent>
    </Dialog>
  );
}