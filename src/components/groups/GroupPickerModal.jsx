import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { setAlterGroups, isMemberOf } from "@/lib/groupMembership";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Save, ChevronDown, ChevronRight, Check, Crown, Ban, Folder } from "lucide-react";
import { toast } from "sonner";
import { useTerms } from "@/lib/useTerms";
import { wouldAddingMemberCycle } from "@/lib/subsystemUtils";
import { byGroupOrder, indexGroups, ancestorIds, rootGroups, childGroups, MAX_GROUP_DEPTH } from "@/lib/groupTree";

// One row in the nested group tree
function GroupRow({ group, depth, isSelected, subgroupDotColors, onToggle, children }) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = children && children.length > 0;
  const color = group.color || "hsl(var(--primary))";

  return (
    <div>
      <div
        className="flex items-center gap-2 py-2 rounded-lg transition-all cursor-pointer"
        style={{
          paddingLeft: `${depth * 20 + 8}px`,
          paddingRight: 8,
          backgroundColor: isSelected ? `${color}18` : undefined,
          boxShadow: isSelected ? `0 0 0 2px ${color}` : undefined,
          userSelect: "none",
        }}
        onClick={() => onToggle(group.id)}
      >
        {/* Expand/collapse chevron */}
        <button
          className="w-5 h-5 flex-shrink-0 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
        >
          {hasChildren ? (
            expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />
          ) : (
            <span className="w-3.5" />
          )}
        </button>

        {/* Color dot */}
        <div
          className="w-3 h-3 rounded-full flex-shrink-0 border border-white/20"
          style={{ backgroundColor: color }}
        />

        {/* Group name */}
        <span
          className="text-sm font-medium flex-1 leading-tight"
          style={{ color: isSelected ? color : undefined }}
        >
          {group.name}
        </span>

        {/* Subgroup dots: colored circles for subgroups that directly contain the alter */}
        {subgroupDotColors && subgroupDotColors.length > 0 && (
          <div className="flex gap-1 mr-1">
            {subgroupDotColors.map((c, i) => (
              <div
                key={i}
                className="w-2.5 h-2.5 rounded-full border border-background"
                style={{ backgroundColor: c }}
                title="Alter is in a subgroup"
              />
            ))}
          </div>
        )}

        {/* Checkmark when selected */}
        {isSelected && (
          <Check className="w-4 h-4 flex-shrink-0" style={{ color }} />
        )}
      </div>

      {hasChildren && expanded && (
        <div>{children}</div>
      )}
    </div>
  );
}

export default function GroupPickerModal({ alter, open, onClose }) {
  const queryClient = useQueryClient();
  const t = useTerms();
  const [selectedGroupIds, setSelectedGroupIds] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState("groups"); // "groups" | "subsystems"

  const { data: allGroups = [] } = useQuery({
    queryKey: ["groups"],
    queryFn: () => base44.entities.Group.list(),
    staleTime: 0,
  });
  const { data: allAlters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });

  const subTerm = t.system === "system" ? "subsystem" : `sub${t.system}`;
  // Subsystems this alter could JOIN as a member — exclude ones they own
  // (can't be a member of your own subsystem).
  const subsystems = useMemo(
    () => allGroups.filter((g) => g.owner_alter_id && g.owner_alter_id !== alter?.id),
    [allGroups, alter?.id]
  );

  // Open showing what's really stored: either representation, either key
  // (the same union every reader uses).
  useEffect(() => {
    if (!open || !alter || allGroups.length === 0) return;
    const initialSelected = new Set(
      allGroups
        .filter((g) => isMemberOf(g, alter))
        .map((g) => g.id)
    );
    setSelectedGroupIds(initialSelected);
  }, [open, alter?.id, allGroups]);

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
      await setAlterGroups({ alterId: alter.id, groupIds: [...selectedGroupIds] });

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

  // Compute ancestor group IDs (groups that transitively contain the alter via a selected subgroup)
  const ancestorGroupIds = useMemo(() => {
    const ancestors = new Set();
    // Cycle-guarded walk (a looping chain from an import used to freeze
    // the app the moment the picker opened).
    const groupById = indexGroups(allGroups);
    for (const id of selectedGroupIds) {
      for (const a of ancestorIds(groupById[id], groupById)) ancestors.add(a);
    }
    return ancestors;
  }, [allGroups, selectedGroupIds]);

  // Build nested tree
  const tree = useMemo(() => {
    function getSubgroupDotColors(parentId) {
      // Direct children of parentId that are selected or are ancestors
      return childGroups(allGroups, parentId)
        .filter((g) => selectedGroupIds.has(g.id) || ancestorGroupIds.has(g.id))
        .map((g) => g.color || "hsl(var(--primary))");
    }

    // groupTree resolves id / sp_id parents; groups whose parent is gone or
    // loops sit at the top so they can still be picked.
    function buildTree(parentId, depth) {
      if (depth > MAX_GROUP_DEPTH) return [];
      return (parentId === null ? rootGroups(allGroups) : childGroups(allGroups, parentId))
        .filter((g) => !g.owner_alter_id) // subsystems live in their own tab
        .sort(byGroupOrder)
        .map((g) => {
          const childNodes = buildTree(g.id, depth + 1);
          const dotColors = !selectedGroupIds.has(g.id) && ancestorGroupIds.has(g.id)
            ? getSubgroupDotColors(g.id)
            : [];
          return (
            <GroupRow
              key={g.id}
              group={g}
              depth={depth}
              isSelected={selectedGroupIds.has(g.id)}
              subgroupDotColors={dotColors}
              onToggle={toggleGroup}
            >
              {childNodes}
            </GroupRow>
          );
        });
    }

    return buildTree(null, 0);
  }, [allGroups, selectedGroupIds, ancestorGroupIds]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Edit Groups — {alter?.name}</DialogTitle>
        </DialogHeader>

        {/* Groups vs subsystems tabs */}
        <div className="flex items-center gap-1 -mt-1">
          <button
            type="button"
            onClick={() => setTab("groups")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${tab === "groups" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}
          >
            <Folder className="w-3.5 h-3.5" /> Groups
          </button>
          <button
            type="button"
            onClick={() => setTab("subsystems")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${tab === "subsystems" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}
          >
            <Crown className="w-3.5 h-3.5" /> {subTerm.charAt(0).toUpperCase() + subTerm.slice(1)}s
          </button>
        </div>

        <p className="text-xs text-muted-foreground">
          {tab === "groups" ? "Tap a group to add or remove this alter." : `Tap a ${subTerm} to add or remove this alter as a member.`}
        </p>

        <div className="flex-1 overflow-y-auto py-2 space-y-0.5 min-h-0">
          {tab === "groups" ? (
            allGroups.filter((g) => !g.owner_alter_id).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No groups yet.</p>
            ) : (
              tree
            )
          ) : (
            subsystems.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No {subTerm}s yet. Create one from an {t.alter}'s profile.
              </p>
            ) : (
              subsystems.map((g) => {
                const owner = allAlters.find((a) => a.id === g.owner_alter_id);
                const cycles = alter ? wouldAddingMemberCycle(allGroups, allAlters, g, alter.id) : false;
                const selected = selectedGroupIds.has(g.id);
                const color = g.color || "hsl(var(--primary))";
                if (cycles) {
                  return (
                    <div key={g.id} title="Would create a loop in the subsystem nesting"
                      className="flex items-center gap-2 py-2 px-2 rounded-lg opacity-50 cursor-not-allowed">
                      <Ban className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                      <span className="text-sm flex-1 line-through">{g.name}</span>
                      <span className="text-[0.625rem] text-muted-foreground italic">would loop</span>
                    </div>
                  );
                }
                return (
                  <div key={g.id} onClick={() => toggleGroup(g.id)} role="button" tabIndex={0}
                    className="flex items-center gap-2 py-2 px-2 rounded-lg cursor-pointer transition-all"
                    style={{ backgroundColor: selected ? `${color}18` : undefined, boxShadow: selected ? `0 0 0 2px ${color}` : undefined, userSelect: "none" }}>
                    <span className="w-3 h-3 rounded-full flex-shrink-0 border border-white/20" style={{ backgroundColor: color }} />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium leading-tight truncate" style={{ color: selected ? color : undefined }}>{g.name}</span>
                      {owner && <span className="text-[0.625rem] text-muted-foreground inline-flex items-center gap-1"><Crown className="w-2.5 h-2.5 text-amber-500" /> {owner.name}</span>}
                    </span>
                    {selected && <Check className="w-4 h-4 flex-shrink-0" style={{ color }} />}
                  </div>
                );
              })
            )
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