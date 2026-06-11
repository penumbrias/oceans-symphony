import React, { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, Check, FolderTree, Folder, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { getMemberAlters, getSubsystemsOwnedBy, isSubsystem, MAX_SUBSYSTEM_DEPTH } from "@/lib/subsystemUtils";
import { pushAlterShares } from "@/lib/friendsShare";

function groupKeyOf(g) { return g?.sp_id || g?.id; }

// Build a depth-tagged, cycle-guarded list of the system's group/subsystem
// tree: folder groups nest by `parent`, subsystems nest under their owner.
// Each item is { type:"group", group, depth, subsystem } or { type:"alter", alter, depth }.
function buildTreeItems(alters, groups) {
  const folderGroups = (groups || []).filter((g) => !isSubsystem(g));
  const folderKeys = new Set(folderGroups.map(groupKeyOf));
  const childrenOf = (key) =>
    folderGroups.filter((g) => {
      const p = g.parent || "";
      if (key === null) return !p || p === "root" || !folderKeys.has(p);
      return p === key;
    });
  const rendered = new Set();

  const alterItems = (a, depth, visited) => {
    rendered.add(a.id);
    const out = [{ type: "alter", depth, alter: a }];
    if (depth <= MAX_SUBSYSTEM_DEPTH && !visited.has(a.id)) {
      const nv = new Set(visited).add(a.id);
      for (const sub of getSubsystemsOwnedBy(groups, a.id)) {
        const members = getMemberAlters(sub, alters);
        if (!members.length) continue;
        out.push({ type: "group", depth: depth + 1, group: sub, subsystem: true });
        for (const m of members) out.push(...alterItems(m, depth + 2, nv));
      }
    }
    return out;
  };

  const renderFolder = (group, depth, visited) => {
    const key = groupKeyOf(group);
    if (visited.has(key) || depth > MAX_SUBSYSTEM_DEPTH) return [];
    const nv = new Set(visited).add(key);
    const members = getMemberAlters(group, alters);
    const inner = [];
    for (const m of members) inner.push(...alterItems(m, depth + 1, new Set()));
    for (const sub of childrenOf(key)) inner.push(...renderFolder(sub, depth + 1, nv));
    if (!inner.length) return [];
    return [{ type: "group", depth, group, subsystem: false }, ...inner];
  };

  const items = [];
  for (const root of childrenOf(null)) items.push(...renderFolder(root, 0, new Set()));
  const ungrouped = alters.filter((a) => !rendered.has(a.id));
  if (ungrouped.length) {
    items.push({ type: "group", depth: 0, group: { id: "__ungrouped", name: "Ungrouped" }, subsystem: false, ungrouped: true });
    for (const a of ungrouped) items.push({ type: "alter", depth: 1, alter: a });
  }
  return items;
}

// All alters belonging to a group (and, if requested, its owned subsystems and
// nested subgroups). Used by the per-group "Add all / Remove all" actions.
function collectGroupMembers(group, alters, groups, includeNested) {
  if (group.id === "__ungrouped") return [];
  const seen = new Map();
  const walkGroup = (g, depth, visited) => {
    if (!g || depth > MAX_SUBSYSTEM_DEPTH || visited.has(groupKeyOf(g))) return;
    const nv = new Set(visited).add(groupKeyOf(g));
    for (const m of getMemberAlters(g, alters)) {
      seen.set(m.id, m);
      if (includeNested) for (const sub of getSubsystemsOwnedBy(groups, m.id)) walkGroup(sub, depth + 1, nv);
    }
    if (includeNested) {
      const key = groupKeyOf(g);
      for (const child of (groups || []).filter((x) => !isSubsystem(x) && (x.parent || "") === key)) walkGroup(child, depth + 1, nv);
    }
  };
  walkGroup(group, 0, new Set());
  return [...seen.values()];
}

// Assign / remove ALTERS to a single privacy level — the inverse of the
// per-alter pills. Shows the system's group/subsystem tree so you can toggle
// individuals or add/remove a whole group (optionally including its
// subsystems + subgroups). Writes alter.privacy_levels directly.
export default function LevelMembersModal({ isOpen, onClose, level }) {
  const terms = useTerms();
  const formatAlter = useAlterLabel();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [includeNested, setIncludeNested] = useState(true);
  const [busy, setBusy] = useState(false);

  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  const { data: groups = [] } = useQuery({ queryKey: ["groups"], queryFn: () => base44.entities.Group.list() });

  const liveAlters = useMemo(() => alters.filter((a) => !a.is_archived), [alters]);
  const inLevel = (a) => Array.isArray(a.privacy_levels) && a.privacy_levels.includes(level?.id);

  const items = useMemo(() => {
    if (!isOpen || !level) return [];
    if (search.trim()) {
      const q = search.toLowerCase();
      return liveAlters
        .filter((a) => a.name?.toLowerCase().includes(q) || a.alias?.toLowerCase().includes(q))
        .map((a) => ({ type: "alter", depth: 0, alter: a }));
    }
    return buildTreeItems(liveAlters, groups);
  }, [isOpen, level, search, liveAlters, groups]);

  const setLevelOn = async (targetAlters, on) => {
    setBusy(true);
    try {
      for (const a of targetAlters) {
        const cur = Array.isArray(a.privacy_levels) ? a.privacy_levels : [];
        const has = cur.includes(level.id);
        if (on && !has) await base44.entities.Alter.update(a.id, { privacy_levels: [...cur, level.id] });
        else if (!on && has) await base44.entities.Alter.update(a.id, { privacy_levels: cur.filter((id) => id !== level.id) });
      }
      qc.invalidateQueries({ queryKey: ["alters"] });
      pushAlterShares().catch(() => {});
    } catch (e) { toast.error(e?.message || "Couldn't update"); }
    finally { setBusy(false); }
  };

  const countFor = (group) => {
    const members = collectGroupMembers(group, liveAlters, groups, includeNested);
    return { total: members.length, on: members.filter(inLevel).length, members };
  };

  if (!level) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(o) => { if (!o) onClose?.(); }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <FolderTree className="w-4 h-4" /> {terms.Alters} in “{level.number}. {level.name}”
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-1">
          Tap an {terms.alter} to add or remove them from this level. Use a group's <strong>+ all</strong> / <strong>− all</strong> to do a whole group at once.
        </p>

        <div className="flex items-center justify-between gap-2">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${terms.alters}…`}
              className="w-full h-8 pl-8 pr-2 text-xs rounded-lg border border-border/50 bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>
          {busy && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
        </div>

        {!search.trim() && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={includeNested} onChange={(e) => setIncludeNested(e.target.checked)} className="accent-primary" />
            “+ all / − all” includes subsystems &amp; subgroups
          </label>
        )}

        <div className="space-y-0.5 max-h-[55vh] overflow-y-auto overscroll-contain -mx-1 px-1">
          {items.map((item, idx) => {
            if (item.type === "group") {
              const { total, on, members } = item.ungrouped
                ? { total: 0, on: 0, members: [] }
                : countFor(item.group);
              return (
                <div key={`g-${item.group.id}-${idx}`} className="flex items-center gap-1.5 pt-2 pb-0.5" style={{ paddingLeft: item.depth * 14 }}>
                  {item.subsystem ? <FolderTree className="w-3.5 h-3.5 text-violet-500 flex-shrink-0" /> : <Folder className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
                  <span className="text-[0.6875rem] font-semibold uppercase tracking-wide truncate" style={{ color: item.group.color || undefined }}>{item.group.name}</span>
                  {!item.ungrouped && total > 0 && (
                    <>
                      <span className="text-[0.625rem] text-muted-foreground">{on}/{total}</span>
                      <div className="ml-auto flex gap-1">
                        <button type="button" disabled={busy || on === total} onClick={() => setLevelOn(members, true)}
                          className="text-[0.625rem] px-1.5 py-0.5 rounded border border-primary/40 text-primary hover:bg-primary/10 disabled:opacity-40">+ all</button>
                        <button type="button" disabled={busy || on === 0} onClick={() => setLevelOn(members, false)}
                          className="text-[0.625rem] px-1.5 py-0.5 rounded border border-border/50 text-muted-foreground hover:bg-muted/40 disabled:opacity-40">− all</button>
                      </div>
                    </>
                  )}
                </div>
              );
            }
            const a = item.alter;
            const on = inLevel(a);
            return (
              <button key={`a-${a.id}-${idx}`} type="button" disabled={busy} onClick={() => setLevelOn([a], !on)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg border text-left transition-colors ${on ? "border-primary/50 bg-primary/10" : "border-transparent hover:bg-muted/30"}`}
                style={{ marginLeft: item.depth * 14, width: `calc(100% - ${item.depth * 14}px)` }}>
                <span className={`w-4 h-4 rounded-md border flex items-center justify-center flex-shrink-0 ${on ? "bg-primary border-primary text-primary-foreground" : "border-border"}`}>
                  {on && <Check className="w-3 h-3" />}
                </span>
                <span className="w-3.5 h-3.5 rounded-full flex-shrink-0 border border-black/10 dark:border-white/15" style={{ backgroundColor: a.color || "#6366f1" }} />
                <span className={`text-xs truncate ${on ? "font-medium text-foreground" : "text-foreground/90"}`}>{formatAlter(a)}</span>
              </button>
            );
          })}
          {items.length === 0 && <p className="text-xs text-muted-foreground/60 italic px-1 py-4 text-center">No {terms.alters}.</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
