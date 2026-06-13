import React, { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Search, Check, FolderTree, Loader2, ChevronRight, ChevronDown, Users, UserRound, Folder } from "lucide-react";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { getMemberAlters, getSubsystemsOwnedBy, isSubsystem, getAltersInsideSubsystems, MAX_SUBSYSTEM_DEPTH } from "@/lib/subsystemUtils";

// ── ONE standard alter-selection surface, reused everywhere alters are picked
// or listed (export, privacy-level assignment, per-alter sharing, per-friend
// visibility …). Two tabs, BOTH collapsible trees you can drill into:
//   • Members — alters organised BY SUBSYSTEM (nested) or flat.
//   • Groups  — FOLDER groups only (never subsystems as roots); expand a group
//               to see the alters inside it.
// Search, Select all / Clear all, per-group "+ all / − all", lazy loading.
//
// Selection is generic: the caller supplies isSelected/onToggle/onSetMany so
// the same UI drives a local Set (export), alter.privacy_levels (sharing), a
// per-friend hide list (visibility), etc. Pass `renderControl(alter)` to swap
// the default checkbox for a custom per-row control (e.g. level pills); bulk
// + all / − all / Select all only show when onSetMany is provided.

function groupKeyOf(g) { return g?.sp_id || g?.id; }
const PAGE = 60;

// Subsystem tree: top-level alters (NOT inside any subsystem), each with their
// owned subsystems nested + collapsible. A subsystem is expanded once (dedup).
function buildSubsystemItems(alters, groups, expanded) {
  const inside = getAltersInsideSubsystems(groups, alters);
  const top = alters.filter((a) => !inside.has(a.id));
  const renderedSubs = new Set();
  const items = [];
  const emit = (a, depth, visited) => {
    items.push({ type: "alter", depth, alter: a });
    if (depth > MAX_SUBSYSTEM_DEPTH || visited.has(a.id)) return;
    const nv = new Set(visited).add(a.id);
    for (const sub of getSubsystemsOwnedBy(groups, a.id)) {
      const members = getMemberAlters(sub, alters);
      if (!members.length) continue;
      if (renderedSubs.has(sub.id)) { items.push({ type: "ref", depth: depth + 1, name: sub.name }); continue; }
      renderedSubs.add(sub.id);
      items.push({ type: "group", depth: depth + 1, group: sub, members, subsystem: true });
      if (expanded.has(sub.id)) for (const m of members) emit(m, depth + 2, nv);
    }
  };
  for (const a of top) emit(a, 0, new Set());
  return items;
}

// Folder tree: non-subsystem groups nested by `parent`; expand a group to see
// its member alters + child groups, mirroring the alters-page folder nesting
// (GroupFolderView uses the same `g.parent === parentKey` rule, parentKey =
// sp_id||id). Subsystems ARE included and nested in place (marked with the
// subsystem icon) so a folder parented under a subsystem still nests correctly
// — excluding them used to orphan their children to the root.
//
// A group's `parent` references its target by EITHER id or sp_id, so resolve
// through a combined lookup. Reachability is computed by a FULL traversal that
// ignores expand state — otherwise collapsed children (only emitted when their
// parent is expanded) looked "unreached" and the survivor pass hoisted every
// one of them to the root, which is exactly why the tree rendered flat.
function buildFolderItems(alters, groups, expanded) {
  const all = groups || [];
  const byRef = {};
  for (const g of all) { byRef[g.id] = g; if (g.sp_id) byRef[g.sp_id] = g; }
  const resolveParentKey = (p) => {
    if (!p || p === "root") return null;
    const pg = byRef[p];
    return pg ? groupKeyOf(pg) : null; // dangling parent → treat as root
  };
  const childrenOf = (key) => all.filter((g) => resolveParentKey(g.parent) === key);

  // Structural reachability from the roots, independent of expand state, so we
  // can tell a genuinely-orphaned / cycle-trapped group from a merely-collapsed
  // child.
  const reachable = new Set();
  const markReach = (g, depth, vis) => {
    const k = groupKeyOf(g);
    if (vis.has(k) || depth > MAX_SUBSYSTEM_DEPTH) return;
    reachable.add(k);
    const nv = new Set(vis).add(k);
    for (const c of childrenOf(k)) markReach(c, depth + 1, nv);
  };
  for (const r of childrenOf(null)) markReach(r, 0, new Set());

  const items = [];
  const emit = (group, depth, visited) => {
    const key = groupKeyOf(group);
    if (visited.has(key) || depth > MAX_SUBSYSTEM_DEPTH) return;
    const nv = new Set(visited).add(key);
    const members = getMemberAlters(group, alters);
    items.push({ type: "group", depth, group, members, subsystem: isSubsystem(group) });
    if (!expanded.has(key)) return;
    for (const m of members) items.push({ type: "alter", depth: depth + 1, alter: m });
    for (const c of childrenOf(key)) emit(c, depth + 1, nv);
  };
  for (const r of childrenOf(null)) emit(r, 0, new Set());
  // Orphans / cycle-trapped groups that no root can reach — surface them at the
  // root so they stay selectable. Collapsed children are reachable, so they are
  // NOT hoisted here (that was the flat-tree bug).
  for (const g of all) if (!reachable.has(groupKeyOf(g))) emit(g, 0, new Set());
  return items;
}

// All alters in a folder group (+ its subsystems / subgroups when includeNested).
function collectGroupMembers(group, alters, groups, includeNested) {
  if (!group) return [];
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

export default function AlterTreeSelect({
  isSelected = () => false,
  onToggle,
  onSetMany,
  selectionMode = "multi", // "multi" | "single" (single hides bulk + uses a radio dot)
  renderControl = null,
  controlPosition = "below", // "below" (stacked, e.g. pills) | "right" (inline, e.g. an eye toggle)
  busy = false,
  maxHeight = "55vh",
  alters: altersProp = null, // optional: render a SUBSET instead of the whole system
  groups: groupsProp = null,
  excludeIds = null, // optional: alter ids to leave out entirely
  disabledIds = null, // optional: alter ids shown but dimmed + non-selectable (keeps the subtree reachable)
}) {
  const terms = useTerms();
  const formatAlter = useAlterLabel();
  const [tab, setTab] = useState("members");
  const [search, setSearch] = useState("");
  const [nested, setNested] = useState(true);
  const [expanded, setExpanded] = useState(() => new Set());
  const [groupExpanded, setGroupExpanded] = useState(() => new Set());
  const [includeNested, setIncludeNested] = useState(true);
  const [shown, setShown] = useState(PAGE);

  const { data: altersData = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list(), enabled: !altersProp });
  const { data: groupsData = [] } = useQuery({ queryKey: ["groups"], queryFn: () => base44.entities.Group.list(), enabled: !groupsProp });
  const alters = altersProp || altersData;
  const groups = groupsProp || groupsData;
  const excludeSet = useMemo(() => new Set(excludeIds || []), [excludeIds]);
  const disabledSet = useMemo(() => new Set(disabledIds || []), [disabledIds]);
  const liveAlters = useMemo(() => alters.filter((a) => !a.is_archived && !excludeSet.has(a.id)), [alters, excludeSet]);
  const single = selectionMode === "single";
  const bulk = typeof onSetMany === "function" && !single;

  useEffect(() => { setShown(PAGE); }, [tab, search, nested, includeNested]);
  const onScroll = (e) => {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 240) setShown((s) => s + PAGE);
  };
  const toggleKey = (setter) => (key) => setter((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });

  const searchHits = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return null;
    return liveAlters.filter((a) => a.name?.toLowerCase().includes(q) || a.alias?.toLowerCase().includes(q));
  }, [liveAlters, search]);
  const flatAlters = useMemo(() => [...liveAlters].sort((a, b) => (a.name || "").localeCompare(b.name || "")), [liveAlters]);
  const memberItems = useMemo(() => (tab === "members" && nested && !searchHits ? buildSubsystemItems(liveAlters, groups, expanded) : []), [tab, nested, searchHits, liveAlters, groups, expanded]);
  const folderItems = useMemo(() => (tab === "groups" ? buildFolderItems(liveAlters, groups, groupExpanded) : []), [tab, liveAlters, groups, groupExpanded]);

  // Plain render FUNCTIONS (not inline components) so React doesn't see a new
  // component type each render and remount the whole list — that remount was
  // resetting scroll-to-top every time a group expanded or a level changed.
  const renderAlterRow = (a, depth = 0, key) => {
    if (renderControl) {
      if (controlPosition === "right") {
        return (
          <div key={key} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/20" style={{ marginLeft: depth * 14 }}>
            <span className="w-3 h-3 rounded-full flex-shrink-0 border border-black/10 dark:border-white/15" style={{ backgroundColor: a.color || "#6366f1" }} />
            <span className="text-xs truncate flex-1">{formatAlter(a)}</span>
            {renderControl(a)}
          </div>
        );
      }
      return (
        <div key={key} className="rounded-lg border border-border/40 bg-muted/10 px-2 py-1.5" style={{ marginLeft: depth * 14 }}>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-3 h-3 rounded-full flex-shrink-0 border border-black/10 dark:border-white/15" style={{ backgroundColor: a.color || "#6366f1" }} />
            <span className="text-xs font-medium truncate">{formatAlter(a)}</span>
          </div>
          {renderControl(a)}
        </div>
      );
    }
    const on = isSelected(a.id);
    const dis = disabledSet.has(a.id);
    return (
      <button key={key} type="button" disabled={busy || dis} onClick={() => !dis && onToggle?.(a, single ? true : !on)}
        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg border text-left transition-colors ${dis ? "opacity-40 cursor-not-allowed border-transparent" : on ? "border-primary/50 bg-primary/10" : "border-transparent hover:bg-muted/30"}`}
        style={{ marginLeft: depth * 14, width: `calc(100% - ${depth * 14}px)` }}>
        <span className={`w-4 h-4 ${single ? "rounded-full" : "rounded-md"} border flex items-center justify-center flex-shrink-0 ${on ? "bg-primary border-primary text-primary-foreground" : "border-border"}`}>{on && (single ? <span className="w-1.5 h-1.5 rounded-full bg-current" /> : <Check className="w-3 h-3" />)}</span>
        <span className="w-3.5 h-3.5 rounded-full flex-shrink-0 border border-black/10 dark:border-white/15" style={{ backgroundColor: a.color || "#6366f1" }} />
        <span className={`text-xs truncate ${on ? "font-medium text-foreground" : "text-foreground/90"}`}>{formatAlter(a)}</span>
        {dis && <span className="ml-auto text-[0.5625rem] uppercase tracking-wide text-muted-foreground flex-shrink-0">✓</span>}
      </button>
    );
  };

  const renderGroupHeader = (item, expandedSet, onExpand, key) => {
    const gkey = groupKeyOf(item.group);
    const open = expandedSet.has(gkey);
    const bulkMembers = item.subsystem ? item.members : collectGroupMembers(item.group, liveAlters, groups, includeNested);
    const onCount = bulkMembers.filter((a) => isSelected(a.id)).length;
    return (
      <div key={key} className="flex items-center gap-1.5 pt-1.5 pb-0.5" style={{ paddingLeft: item.depth * 14 }}>
        <button type="button" onClick={() => onExpand(gkey)} className="flex items-center gap-1 min-w-0 flex-1">
          {open ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
          {item.subsystem ? <FolderTree className="w-3.5 h-3.5 text-violet-500 flex-shrink-0" /> : <Folder className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
          <span className="text-[0.6875rem] font-semibold uppercase tracking-wide truncate" style={{ color: item.group.color || undefined }}>{item.group.name}</span>
          {bulk && <span className="text-[0.625rem] text-muted-foreground">{onCount}/{bulkMembers.length}</span>}
        </button>
        {bulk && bulkMembers.length > 0 && (
          <div className="flex gap-1">
            <button type="button" disabled={busy || onCount === bulkMembers.length} onClick={() => onSetMany(bulkMembers, true)} className="text-[0.625rem] px-1.5 py-0.5 rounded border border-primary/40 text-primary hover:bg-primary/10 disabled:opacity-40">+ all</button>
            <button type="button" disabled={busy || onCount === 0} onClick={() => onSetMany(bulkMembers, false)} className="text-[0.625rem] px-1.5 py-0.5 rounded border border-border/50 text-muted-foreground hover:bg-muted/40 disabled:opacity-40">− all</button>
          </div>
        )}
      </div>
    );
  };

  const renderItems = (items, expandedSet, onExpand) => items.slice(0, shown).map((item, idx) => {
    if (item.type === "alter") return renderAlterRow(item.alter, item.depth, `a-${item.alter.id}-${idx}`);
    if (item.type === "ref") return <p key={`r-${idx}`} className="text-[0.625rem] text-muted-foreground italic py-0.5" style={{ paddingLeft: item.depth * 14 + 8 }}>↳ {item.name} — listed above</p>;
    return renderGroupHeader(item, expandedSet, onExpand, `g-${item.group.id}-${idx}`);
  });

  return (
    <div className="space-y-2">
      <div className="flex gap-1 rounded-lg bg-muted/30 p-0.5">
        {[["members", terms.Alters, UserRound], ["groups", "Groups", Users]].map(([id, label, Icon]) => (
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
            {bulk ? (
              <div className="flex gap-2">
                <button type="button" disabled={busy} onClick={() => onSetMany((searchHits || liveAlters).filter((a) => !isSelected(a.id)), true)} className="text-primary hover:underline disabled:opacity-40">Select all{searchHits ? " shown" : ""}</button>
                <button type="button" disabled={busy} onClick={() => onSetMany((searchHits || liveAlters).filter((a) => isSelected(a.id)), false)} className="text-muted-foreground hover:underline disabled:opacity-40">Clear all{searchHits ? " shown" : ""}</button>
              </div>
            ) : <span />}
            {!searchHits && <button type="button" onClick={() => setNested((v) => !v)} className="text-primary hover:underline">{nested ? "Flat list" : "By subsystem"}</button>}
          </div>

          <div className="space-y-0.5 overflow-y-auto overscroll-contain -mx-1 px-1" style={{ maxHeight }} onScroll={onScroll}>
            {searchHits ? (
              <>
                {searchHits.slice(0, shown).map((a) => renderAlterRow(a, 0, a.id))}
                {searchHits.length > shown && <p className="text-[0.625rem] text-muted-foreground italic py-2 text-center">Loading more… ({shown}/{searchHits.length})</p>}
                {searchHits.length === 0 && <p className="text-xs text-muted-foreground/60 italic py-4 text-center">No matches.</p>}
              </>
            ) : nested ? (
              <>
                {renderItems(memberItems, expanded, toggleKey(setExpanded))}
                {memberItems.length > shown && <p className="text-[0.625rem] text-muted-foreground italic py-2 text-center">Loading more…</p>}
              </>
            ) : (
              <>
                {flatAlters.slice(0, shown).map((a) => renderAlterRow(a, 0, a.id))}
                {flatAlters.length > shown && <p className="text-[0.625rem] text-muted-foreground italic py-2 text-center">Loading more… ({shown}/{flatAlters.length})</p>}
              </>
            )}
          </div>
        </>
      ) : (
        <>
          {bulk && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <input type="checkbox" checked={includeNested} onChange={(e) => setIncludeNested(e.target.checked)} className="accent-primary" />
              “+ all / − all” includes subsystems &amp; subgroups
            </label>
          )}
          <div className="space-y-0.5 overflow-y-auto overscroll-contain -mx-1 px-1" style={{ maxHeight }} onScroll={onScroll}>
            {folderItems.length === 0 && <p className="text-xs text-muted-foreground/60 italic py-4 text-center">No groups yet.</p>}
            {renderItems(folderItems, groupExpanded, toggleKey(setGroupExpanded))}
            {folderItems.length > shown && <p className="text-[0.625rem] text-muted-foreground italic py-2 text-center">Loading more…</p>}
          </div>
        </>
      )}
    </div>
  );
}
