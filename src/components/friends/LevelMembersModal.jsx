import React, { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, Check, FolderTree, Folder, Loader2, ChevronRight, ChevronDown, Users, UserRound } from "lucide-react";
import { toast } from "sonner";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { getMemberAlters, getSubsystemsOwnedBy, isSubsystem, MAX_SUBSYSTEM_DEPTH } from "@/lib/subsystemUtils";
import { pushAlterShares } from "@/lib/friendsShare";

function groupKeyOf(g) { return g?.sp_id || g?.id; }

// Build a depth-tagged, COLLAPSIBLE, cycle-guarded list of the group/subsystem
// tree. Only the children of groups whose key is in `expanded` are emitted —
// so a system with thousands of members renders just the top-level group
// headers until the user drills in (scalable). A subsystem's members are
// emitted once (dedup) even if its owner sits in several folders.
function buildNestedItems(alters, groups, expanded) {
  const folderGroups = (groups || []).filter((g) => !isSubsystem(g));
  const folderKeys = new Set(folderGroups.map(groupKeyOf));
  const childrenOf = (key) =>
    folderGroups.filter((g) => {
      const p = g.parent || "";
      if (key === null) return !p || p === "root" || !folderKeys.has(p);
      return p === key;
    });
  const renderedSubs = new Set();
  const placed = new Set();
  const items = [];

  const emitAlter = (a, depth, visited) => {
    placed.add(a.id);
    items.push({ type: "alter", depth, alter: a });
    if (depth > MAX_SUBSYSTEM_DEPTH || visited.has(a.id)) return;
    const nv = new Set(visited).add(a.id);
    for (const sub of getSubsystemsOwnedBy(groups, a.id)) {
      if (!getMemberAlters(sub, alters).length) continue;
      if (renderedSubs.has(sub.id)) { items.push({ type: "ref", depth: depth + 1, name: sub.name }); continue; }
      renderedSubs.add(sub.id);
      items.push({ type: "group", depth: depth + 1, group: sub, subsystem: true });
      if (expanded.has(sub.id)) for (const m of getMemberAlters(sub, alters)) emitAlter(m, depth + 2, nv);
    }
  };

  const emitFolder = (group, depth, visited) => {
    const key = groupKeyOf(group);
    if (visited.has(key) || depth > MAX_SUBSYSTEM_DEPTH) return;
    const nv = new Set(visited).add(key);
    items.push({ type: "group", depth, group, subsystem: false });
    if (!expanded.has(key)) return;
    for (const m of getMemberAlters(group, alters)) emitAlter(m, depth + 1, new Set());
    for (const sub of childrenOf(key)) emitFolder(sub, depth + 1, nv);
  };

  for (const root of childrenOf(null)) emitFolder(root, 0, new Set());
  const ungrouped = alters.filter((a) => !placed.has(a.id));
  if (ungrouped.length) {
    items.push({ type: "group", depth: 0, group: { id: "__ungrouped", name: "Ungrouped" }, ungrouped: true });
    if (expanded.has("__ungrouped")) for (const a of ungrouped) items.push({ type: "alter", depth: 1, alter: a });
  }
  return items;
}

// All alters in a group (+ its subsystems / subgroups when includeNested).
function collectGroupMembers(group, alters, groups, includeNested) {
  if (!group || group.id === "__ungrouped") return [];
  const seen = new Map();
  const walk = (g, depth, visited) => {
    if (!g || depth > MAX_SUBSYSTEM_DEPTH || visited.has(groupKeyOf(g))) return;
    const nv = new Set(visited).add(groupKeyOf(g));
    for (const m of getMemberAlters(g, alters)) {
      seen.set(m.id, m);
      if (includeNested) for (const sub of getSubsystemsOwnedBy(groups, m.id)) walk(sub, depth + 1, nv);
    }
    if (includeNested) {
      const key = groupKeyOf(g);
      for (const child of (groups || []).filter((x) => !isSubsystem(x) && (x.parent || "") === key)) walk(child, depth + 1, nv);
    }
  };
  walk(group, 0, new Set());
  return [...seen.values()];
}

const FLAT_CAP = 200;

// Assign ALTERS to a single privacy level. Two tabs: "Members" (individuals,
// nested-by-subsystem or flat, scalable + collapsible, with select/clear-all)
// and "Groups" (assign a whole group / subsystem at once). The inverse of the
// per-alter pills; writes alter.privacy_levels directly.
export default function LevelMembersModal({ isOpen, onClose, level }) {
  const terms = useTerms();
  const formatAlter = useAlterLabel();
  const qc = useQueryClient();
  const [tab, setTab] = useState("members");
  const [search, setSearch] = useState("");
  const [nested, setNested] = useState(true);
  const [expanded, setExpanded] = useState(() => new Set());
  const [includeNested, setIncludeNested] = useState(true);
  const [busy, setBusy] = useState(false);

  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  const { data: groups = [] } = useQuery({ queryKey: ["groups"], queryFn: () => base44.entities.Group.list() });

  const liveAlters = useMemo(() => alters.filter((a) => !a.is_archived), [alters]);
  const inLevel = (a) => Array.isArray(a.privacy_levels) && a.privacy_levels.includes(level?.id);
  const toggleExpand = (key) => setExpanded((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });

  const searchHits = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return liveAlters;
    return liveAlters.filter((a) => a.name?.toLowerCase().includes(q) || a.alias?.toLowerCase().includes(q));
  }, [liveAlters, search]);

  const nestedItems = useMemo(() => (isOpen && level && nested && !search.trim() ? buildNestedItems(liveAlters, groups, expanded) : []), [isOpen, level, nested, search, liveAlters, groups, expanded]);

  const allGroups = useMemo(() => {
    const folders = groups.filter((g) => !isSubsystem(g));
    const subs = groups.filter(isSubsystem);
    return [...folders, ...subs];
  }, [groups]);

  const setLevelOn = async (targets, on) => {
    setBusy(true);
    try {
      for (const a of targets) {
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

  if (!level) return null;

  const AlterRow = ({ a, depth = 0 }) => {
    const on = inLevel(a);
    return (
      <button type="button" disabled={busy} onClick={() => setLevelOn([a], !on)}
        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg border text-left transition-colors ${on ? "border-primary/50 bg-primary/10" : "border-transparent hover:bg-muted/30"}`}
        style={{ marginLeft: depth * 14, width: `calc(100% - ${depth * 14}px)` }}>
        <span className={`w-4 h-4 rounded-md border flex items-center justify-center flex-shrink-0 ${on ? "bg-primary border-primary text-primary-foreground" : "border-border"}`}>{on && <Check className="w-3 h-3" />}</span>
        <span className="w-3.5 h-3.5 rounded-full flex-shrink-0 border border-black/10 dark:border-white/15" style={{ backgroundColor: a.color || "#6366f1" }} />
        <span className={`text-xs truncate ${on ? "font-medium text-foreground" : "text-foreground/90"}`}>{formatAlter(a)}</span>
      </button>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => { if (!o) onClose?.(); }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base"><FolderTree className="w-4 h-4" /> “{level.number}. {level.name}”</DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex gap-1 rounded-lg bg-muted/30 p-0.5">
          {[["members", `${terms.Alters}`, UserRound], ["groups", "Groups", Users]].map(([id, label, Icon]) => (
            <button key={id} type="button" onClick={() => setTab(id)}
              className={`flex-1 flex items-center justify-center gap-1.5 h-8 rounded-md text-xs font-medium transition-colors ${tab === id ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
          {busy && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground self-center mx-1" />}
        </div>

        {tab === "members" ? (
          <>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${terms.alters}…`}
                className="w-full h-8 pl-8 pr-2 text-xs rounded-lg border border-border/50 bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div className="flex items-center justify-between gap-2 text-[0.6875rem]">
              <div className="flex gap-2">
                <button type="button" disabled={busy} onClick={() => setLevelOn(searchHits.filter((a) => !inLevel(a)), true)} className="text-primary hover:underline disabled:opacity-40">Select all{search.trim() ? " shown" : ""}</button>
                <button type="button" disabled={busy} onClick={() => setLevelOn(searchHits.filter(inLevel), false)} className="text-muted-foreground hover:underline disabled:opacity-40">Clear all{search.trim() ? " shown" : ""}</button>
              </div>
              {!search.trim() && (
                <button type="button" onClick={() => setNested((v) => !v)} className="text-primary hover:underline">{nested ? "Flat list" : "By subsystem"}</button>
              )}
            </div>

            <div className="space-y-0.5 max-h-[55vh] overflow-y-auto overscroll-contain -mx-1 px-1">
              {search.trim() ? (
                <>
                  {searchHits.slice(0, FLAT_CAP).map((a) => <AlterRow key={a.id} a={a} />)}
                  {searchHits.length > FLAT_CAP && <p className="text-[0.625rem] text-muted-foreground italic px-1 py-2 text-center">Showing {FLAT_CAP} of {searchHits.length} — refine your search.</p>}
                  {searchHits.length === 0 && <p className="text-xs text-muted-foreground/60 italic px-1 py-4 text-center">No matches.</p>}
                </>
              ) : nested ? (
                nestedItems.map((item, idx) => {
                  if (item.type === "alter") return <AlterRow key={`a-${item.alter.id}-${idx}`} a={item.alter} depth={item.depth} />;
                  if (item.type === "ref") return <p key={`r-${idx}`} className="text-[0.625rem] text-muted-foreground italic py-0.5" style={{ paddingLeft: item.depth * 14 + 8 }}>↳ {item.name} — listed above</p>;
                  const key = item.ungrouped ? "__ungrouped" : groupKeyOf(item.group);
                  const isOpen = expanded.has(key);
                  const members = item.ungrouped ? [] : collectGroupMembers(item.group, liveAlters, groups, includeNested);
                  const on = members.filter(inLevel).length;
                  return (
                    <div key={`g-${key}-${idx}`} className="flex items-center gap-1.5 pt-2 pb-0.5" style={{ paddingLeft: item.depth * 14 }}>
                      <button type="button" onClick={() => toggleExpand(key)} className="flex items-center gap-1 min-w-0 flex-1">
                        {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
                        {item.subsystem ? <FolderTree className="w-3.5 h-3.5 text-violet-500 flex-shrink-0" /> : <Folder className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
                        <span className="text-[0.6875rem] font-semibold uppercase tracking-wide truncate" style={{ color: item.group.color || undefined }}>{item.group.name}</span>
                        {!item.ungrouped && <span className="text-[0.625rem] text-muted-foreground">{on}/{members.length}</span>}
                      </button>
                      {!item.ungrouped && members.length > 0 && (
                        <div className="flex gap-1">
                          <button type="button" disabled={busy || on === members.length} onClick={() => setLevelOn(members, true)} className="text-[0.625rem] px-1.5 py-0.5 rounded border border-primary/40 text-primary hover:bg-primary/10 disabled:opacity-40">+ all</button>
                          <button type="button" disabled={busy || on === 0} onClick={() => setLevelOn(members, false)} className="text-[0.625rem] px-1.5 py-0.5 rounded border border-border/50 text-muted-foreground hover:bg-muted/40 disabled:opacity-40">− all</button>
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <>
                  {[...liveAlters].sort((a, b) => (a.name || "").localeCompare(b.name || "")).slice(0, FLAT_CAP).map((a) => <AlterRow key={a.id} a={a} />)}
                  {liveAlters.length > FLAT_CAP && <p className="text-[0.625rem] text-muted-foreground italic px-1 py-2 text-center">Showing {FLAT_CAP} of {liveAlters.length} — search to find others.</p>}
                </>
              )}
            </div>
          </>
        ) : (
          <>
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <input type="checkbox" checked={includeNested} onChange={(e) => setIncludeNested(e.target.checked)} className="accent-primary" />
              Include subsystems &amp; subgroups when adding a group
            </label>
            <div className="space-y-1 max-h-[60vh] overflow-y-auto overscroll-contain">
              {allGroups.length === 0 && <p className="text-xs text-muted-foreground/60 italic px-1 py-4 text-center">No groups yet.</p>}
              {allGroups.map((g) => {
                const members = collectGroupMembers(g, liveAlters, groups, includeNested);
                const on = members.filter(inLevel).length;
                return (
                  <div key={g.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-border/40 bg-muted/10">
                    {isSubsystem(g) ? <FolderTree className="w-3.5 h-3.5 text-violet-500 flex-shrink-0" /> : <Folder className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
                    <span className="text-xs font-medium flex-1 truncate" style={{ color: g.color || undefined }}>{g.name}</span>
                    <span className="text-[0.625rem] text-muted-foreground">{on}/{members.length}</span>
                    <div className="flex gap-1">
                      <button type="button" disabled={busy || members.length === 0 || on === members.length} onClick={() => setLevelOn(members, true)} className="text-[0.625rem] px-1.5 py-0.5 rounded border border-primary/40 text-primary hover:bg-primary/10 disabled:opacity-40">+ all</button>
                      <button type="button" disabled={busy || on === 0} onClick={() => setLevelOn(members, false)} className="text-[0.625rem] px-1.5 py-0.5 rounded border border-border/50 text-muted-foreground hover:bg-muted/40 disabled:opacity-40">− all</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
