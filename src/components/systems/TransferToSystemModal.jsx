import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ArrowRightLeft, Copy, Boxes, Check, Loader2, User } from "lucide-react";
import { useTerms } from "@/lib/useTerms";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { listSystems, getActiveSystemId, appendEntitiesToSystem } from "@/lib/systems";
import { getMemberAlters, getSubsystemsOwnedBy, MAX_SUBSYSTEM_DEPTH } from "@/lib/subsystemUtils";

// Move or COPY an alter (or a group + its members) from the ACTIVE system into
// another system. Reuses the cross-system blob writer (appendEntitiesToSystem):
// writes the target FIRST, then — only for a move — removes from the source, so
// a failure never loses data. Avatars live in the shared global image store, so
// they keep resolving in the target with no image copying.
//
// Pass exactly one of `alter` or `group`.

function alterKey(a) {
  return a.sp_id || a.id;
}

// Collect the FULL subtree to move/copy with a group: the group itself, every
// descendant subgroup (subsystems owned by member alters) and folder-child
// group (via `parent`), plus all the alters at every level (members + each
// subsystem's owner). Cycle-guarded + depth-clamped (mirrors subsystemUtils)
// so a bad ownership/parent loop can't spin forever. Deep nesting travels.
function collectGroupSubtree(rootGroup, allGroups, allAlters) {
  const groupIds = new Set();
  const alterIds = new Set();
  const stack = [{ g: rootGroup, depth: 0 }];
  while (stack.length) {
    const { g, depth } = stack.pop();
    if (!g || groupIds.has(g.id) || depth > MAX_SUBSYSTEM_DEPTH) continue;
    groupIds.add(g.id);
    if (g.owner_alter_id) alterIds.add(g.owner_alter_id); // a subsystem's parent alter travels too
    for (const m of getMemberAlters(g, allAlters)) {
      alterIds.add(m.id);
      for (const owned of getSubsystemsOwnedBy(allGroups, m.id)) {
        if (!groupIds.has(owned.id)) stack.push({ g: owned, depth: depth + 1 });
      }
    }
    for (const child of allGroups) {
      if (child.parent && child.parent === g.id && !groupIds.has(child.id)) {
        stack.push({ g: child, depth: depth + 1 });
      }
    }
  }
  return {
    groups: allGroups.filter((g) => groupIds.has(g.id)),
    alters: allAlters.filter((a) => alterIds.has(a.id)),
  };
}

function TargetRow({ system, selected, onSelect }) {
  const avatar = useResolvedAvatarUrl(system.avatar);
  return (
    <button
      type="button"
      onClick={() => onSelect(system.id)}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors ${
        selected ? "border-primary bg-primary/5" : "border-border/50 bg-card hover:bg-muted/30"
      }`}
    >
      <div className="w-9 h-9 rounded-lg overflow-hidden flex items-center justify-center border border-border/40 flex-shrink-0 bg-muted">
        {avatar ? (
          <img src={avatar} alt="" className="w-full h-full object-cover" />
        ) : (
          <Boxes className="w-4 h-4 text-muted-foreground" />
        )}
      </div>
      <span className="flex-1 min-w-0 text-sm font-medium truncate">{system.name}</span>
      {selected && <Check className="w-4 h-4 text-primary flex-shrink-0" />}
    </button>
  );
}

export default function TransferToSystemModal({ alter = null, group = null, onClose }) {
  const t = useTerms();
  const qc = useQueryClient();
  const resolvedAvatar = useResolvedAvatarUrl(alter?.avatar_url);

  const targets = useMemo(() => {
    const activeId = getActiveSystemId();
    return listSystems().filter((s) => s.id !== activeId);
  }, []);

  const [targetId, setTargetId] = useState(targets[0]?.id || "");
  const [mode, setMode] = useState("move"); // "move" | "copy"
  const [busy, setBusy] = useState(false);

  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list(), enabled: !!group });
  const { data: groups = [] } = useQuery({ queryKey: ["groups"], queryFn: () => base44.entities.Group.list() });
  const { data: customFields = [] } = useQuery({ queryKey: ["customFields"], queryFn: () => base44.entities.CustomField.list() });

  // For a group transfer, the WHOLE subtree that travels with it (the group +
  // every nested subgroup + all their alters). Deep nesting travels.
  const subtree = useMemo(
    () => (group ? collectGroupSubtree(group, groups, alters) : { groups: [], alters: [] }),
    [group, groups, alters]
  );
  const groupMembers = subtree.alters;
  const subgroupCount = Math.max(0, subtree.groups.length - 1); // excludes the root group

  const cfDefsFor = (alterRecords) =>
    customFields.filter((cf) =>
      alterRecords.some((a) => a.custom_fields && Object.prototype.hasOwnProperty.call(a.custom_fields, cf.name))
    );

  const targetName = targets.find((s) => s.id === targetId)?.name || t.system;

  const transferAlter = async () => {
    // Single alter: drop group refs (target's groups differ), bring its custom-
    // field defs so the target's editor knows them.
    const rec = { ...alter, groups: [] };
    const defs = cfDefsFor([alter]);
    await appendEntitiesToSystem(targetId, { Alter: [rec], ...(defs.length ? { CustomField: defs } : {}) });
    if (mode === "move") {
      const key = alterKey(alter);
      for (const g of groups) {
        if ((g.member_sp_ids || []).includes(key)) {
          await base44.entities.Group.update(g.id, {
            member_sp_ids: (g.member_sp_ids || []).filter((x) => x !== key),
          });
        }
      }
      await base44.entities.Alter.delete(alter.id);
    }
  };

  const transferGroup = async () => {
    // The whole subtree travels: the group, every nested subgroup, and all the
    // alters. Each alter keeps only the membership refs that point at groups in
    // the subtree (others don't travel). Inner groups keep their `parent` (it's
    // in the subtree too); only the ROOT group's parent is cleared so it lands
    // at top level in the target.
    const keepGroupIds = new Set(subtree.groups.map((g) => g.id));
    const memberRecs = subtree.alters.map((a) => ({
      ...a,
      groups: (a.groups || []).filter((x) => keepGroupIds.has(x.id) || keepGroupIds.has(x.sp_id)),
    }));
    const groupRecs = subtree.groups.map((g) => (g.id === group.id ? { ...g, parent: "" } : { ...g }));
    const defs = cfDefsFor(subtree.alters);
    await appendEntitiesToSystem(targetId, {
      Group: groupRecs,
      ...(memberRecs.length ? { Alter: memberRecs } : {}),
      ...(defs.length ? { CustomField: defs } : {}),
    });
    if (mode === "move") {
      const memberKeys = new Set(subtree.alters.map(alterKey));
      for (const g of groups) {
        if (keepGroupIds.has(g.id)) continue;
        const filtered = (g.member_sp_ids || []).filter((x) => !memberKeys.has(x));
        if (filtered.length !== (g.member_sp_ids || []).length) {
          await base44.entities.Group.update(g.id, { member_sp_ids: filtered });
        }
      }
      for (const a of subtree.alters) await base44.entities.Alter.delete(a.id);
      for (const g of subtree.groups) await base44.entities.Group.delete(g.id);
    }
  };

  const handleConfirm = async () => {
    if (!targetId) return;
    setBusy(true);
    try {
      if (group) await transferGroup();
      else await transferAlter();
      qc.invalidateQueries({ queryKey: ["alters"] });
      qc.invalidateQueries({ queryKey: ["groups"] });
      const what = group ? group.name : alter.name;
      toast.success(`${mode === "move" ? "Moved" : "Copied"} ${what} to ${targetName}`);
      onClose?.();
    } catch (e) {
      toast.error(e.message || "Transfer failed — nothing was changed");
      setBusy(false);
    }
  };

  const subjectAvatar = group ? null : resolvedAvatar;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ArrowRightLeft className="w-4 h-4 text-primary" />
            Move or copy to another {t.system}
          </DialogTitle>
        </DialogHeader>

        {/* Subject */}
        <div className="flex items-center gap-2.5 rounded-xl border border-border/50 bg-muted/20 px-3 py-2">
          <div
            className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center border border-border/40 flex-shrink-0"
            style={{ backgroundColor: (group?.color || alter?.color) || "hsl(var(--muted))" }}
          >
            {subjectAvatar ? (
              <img src={subjectAvatar} alt="" className="w-full h-full object-cover" />
            ) : group ? (
              <Boxes className="w-4 h-4 text-white" />
            ) : (
              <User className="w-4 h-4 text-white" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{group ? group.name : alter?.name}</p>
            {group && (
              <p className="text-xs text-muted-foreground">
                {groupMembers.length} {groupMembers.length === 1 ? t.alter : t.alters}
                {subgroupCount > 0 ? ` + ${subgroupCount} ${subgroupCount === 1 ? "subgroup" : "subgroups"}` : ""} travel with it
              </p>
            )}
          </div>
        </div>

        {targets.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            You only have one {t.system}. Create another first to move {t.alters} between them.
          </p>
        ) : (
          <>
            {/* Move / Copy */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode("move")}
                className={`flex items-center justify-center gap-1.5 rounded-xl border py-2 text-sm font-medium transition-colors ${
                  mode === "move" ? "border-primary bg-primary/10 text-primary" : "border-border/50 text-muted-foreground hover:bg-muted/30"
                }`}
              >
                <ArrowRightLeft className="w-4 h-4" /> Move
              </button>
              <button
                type="button"
                onClick={() => setMode("copy")}
                className={`flex items-center justify-center gap-1.5 rounded-xl border py-2 text-sm font-medium transition-colors ${
                  mode === "copy" ? "border-primary bg-primary/10 text-primary" : "border-border/50 text-muted-foreground hover:bg-muted/30"
                }`}
              >
                <Copy className="w-4 h-4" /> Copy
              </button>
            </div>
            <p className="text-xs text-muted-foreground -mt-1">
              {mode === "move"
                ? `Removes ${group ? "the group and its members" : `this ${t.alter}`} from this ${t.system} and places ${group ? "them" : "it"} in the other.`
                : `Keeps ${group ? "them" : `this ${t.alter}`} here and adds a copy to the other ${t.system}.`}
            </p>

            {/* Target picker */}
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              <p className="text-xs font-medium text-muted-foreground">Destination {t.system}</p>
              {targets.map((s) => (
                <TargetRow key={s.id} system={s} selected={targetId === s.id} onSelect={setTargetId} />
              ))}
            </div>

            <div className="flex gap-2 pt-1">
              <Button variant="outline" onClick={onClose} disabled={busy} className="flex-1">
                Cancel
              </Button>
              <Button onClick={handleConfirm} disabled={busy || !targetId} className="flex-1 gap-1.5">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : mode === "move" ? <ArrowRightLeft className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {mode === "move" ? "Move" : "Copy"}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
