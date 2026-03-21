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
import { Grid3X3, List } from "lucide-react";
import { toast } from "sonner";

export default function GroupMembersModal({ group, allGroups, isOpen, onClose }) {
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
    const subgroups = allGroups.filter((g) => g.parent === groupId);
    subgroups.forEach((sg) => {
      ids.push(...getGroupIds(sg.id, true));
    });
    return ids;
  };

  const groupIds = useMemo(
    () => getGroupIds(group.id, includeSubgroups),
    [group.id, includeSubgroups, allGroups]
  );

  const altersInGroup = useMemo(() => {
    return new Set(
      alters
        .filter((alter) => alter.groups?.some((g) => groupIds.includes(g.id) || groupIds.includes(g.sp_id)))
        .map((a) => a.id)
    );
  }, [alters, groupIds]);

  const filteredAlters = useMemo(() => {
    return alters
      .filter((alter) => {
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

        {/* Controls */}
        <div className="space-y-3">
          {/* Search and View Toggle */}
          <div className="flex gap-2">
            <Input
              placeholder="Search alters..."
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
            filteredAlters.map((alter) => (
              <div
                key={alter.id}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted transition-colors"
              >
                <Checkbox
                  checked={altersInGroup.has(alter.id)}
                  onCheckedChange={(checked) =>
                    handleToggleAlter(alter.id, checked)
                  }
                />
                {alter.avatar_url && (
                  <img
                    src={alter.avatar_url}
                    alt={alter.name}
                    className="w-8 h-8 rounded-full object-cover"
                  />
                )}
                <span className="text-sm flex-1">{alter.name}</span>
              </div>
            ))
          ) : (
            filteredAlters.map((alter) => (
              <label
                key={alter.id}
                className="flex flex-col items-center gap-2 p-2 rounded-lg hover:bg-muted transition-colors cursor-pointer"
              >
                <Checkbox
                  checked={altersInGroup.has(alter.id)}
                  onCheckedChange={(checked) =>
                    handleToggleAlter(alter.id, checked)
                  }
                  className="absolute"
                />
                {alter.avatar_url && (
                  <img
                    src={alter.avatar_url}
                    alt={alter.name}
                    className="w-12 h-12 rounded-full object-cover"
                  />
                )}
                <span className="text-xs text-center font-medium truncate w-full">
                  {alter.alias?.slice(0, 5) || alter.name.slice(0, 5)}
                </span>
              </label>
            ))
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