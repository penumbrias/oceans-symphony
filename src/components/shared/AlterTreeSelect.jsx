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
// its member alters + child groups. Subsystems never appear as roots here.
function buildFolderItems(alters, groups, expanded) {
  const folderGroups = (groups || []).filter((g) => !isSubsystem(g));
  const folderKeys = new Set(folderGroups.map(groupKeyOf));
  const childrenOf = (key) =>
    folderGroups.filter((g) => {
      const p = g.parent || "";
      if (key === null) return !p || p === "root" || !folderKeys.has(p);
      return p === key;
    });
  const items = [];
  const emit = (group, depth, visited) => {
    const key = groupKeyOf(group);
    if (visited.has(key) || depth > MAX_SUBSYSTEM_DEPTH) return;
    const nv = new Set(visited).add(key);
    const members = getMemberAlters(group, alters);
    items.push({ type: "group", depth, group, members, subsystem: false });
    if (!expanded.has(key)) return;
    for (const m of members) items.push({ type: "alter", depth: depth + 1, alter: m });
    for (const sub of childrenOf(key)) emit(sub, depth + 1, nv);
  };
  for (const root of childrenOf(null)) emit(root, 0, new Set());
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
  renderControl = null,
  controlPosition = "below", // "below" (stacked, e.g. pills) | "right" (inline, e.g. an eye toggle)
  busy = false,
  maxHeight = "55vh",
  alters: altersProp = null, // optional: render a SUBSET instead of the whole system
  groups: groupsProp = null,
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
  const liveAlters = useMemo(() => alters.filter((a) => !a.is_archived), [alters]);
  const bulk = typeof onSetMany === "function";

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

  const AlterRow = ({ a, depth = 0 }) => {
    if (renderControl) {
      if (controlPosition === "right") {
        return (
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/20" style={{ marginLeft: depth * 14 }}>
            <span className="w-3 h-3 rounded-full flex-shrink-0 border border-black/10 dark:border-white/15" style={{ backgroundColor: a.color || "#6366f1" }} />
            <span className="text-xs truncate flex-1">{formatAlter(a)}</span>
            {renderControl(a)}
          </div>
        );
      }
      return (
        <div className="rounded-lg border border-border/40 bg-muted/10 px-2 py-1.5" style={{ marginLeft: depth * 14 }}>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-3 h-3 rounded-full flex-shrink-0 border border-black/10 dark:border-white/15" style={{ backgroundColor: a.color || "#6366f1" }} />
            <span className="text-xs font-medium truncate">{formatAlter(a)}</span>
          </div>
          {renderControl(a)}
        </div>
      );
    }
    const on = isSelected(a.id);
    return (
      <button type="button" disabled={busy} onClick={() => onToggle?.(a, !on)}
        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg border text-left transition-colors ${on ? "border-primary/50 bg-primary/10" : "border-transparent hover:bg-muted/30"}`}
        style={{ marginLeft: depth * 14, width: `calc(100% - ${depth * 14}px)` }}>
        <span className={`w-4 h-4 rounded-md border flex items-center justify-center flex-shrink-0 ${on ? "bg-primary border-primary text-primary-foreground" : "border-border"}`}>{on && <Check className="w-3 h-3" />}</span>
        <span className="w-3.5 h-3.5 rounded-full flex-shrink-0 border border-black/10 dark:border-white/15" style={{ backgroundColor: a.color || "#6366f1" }} />
        <span className={`text-xs truncate ${on ? "font-medium text-foreground" : "text-foreground/90"}`}>{formatAlter(a)}</span>
      </button>
    );
  };

  const GroupHeader = ({ item, expandedSet, onExpand }) => {
    const key = groupKeyOf(item.group);
    const open = expandedSet.has(key);
    const bulkMembers = item.subsystem ? item.members : collectGroupMembers(item.group, liveAlters, groups, includeNested);
    const onCount = bulkMembers.filter((a) => isSelected(a.id)).length;
    return (
      <div className="flex items-center gap-1.5 pt-1.5 pb-0.5" style={{ paddingLeft: item.depth * 14 }}>
        <button type="button" onClick={() => onExpand(key)} className="flex items-center gap-1 min-w-0 flex-1">
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
    if (item.type === "alter") return <AlterRow key={`a-${item.alter.id}-${idx}`} a={item.alter} depth={item.depth} />;
    if (item.type === "ref") return <p key={`r-${idx}`} className="text-[0.625rem] text-muted-foreground italic py-0.5" style={{ paddingLeft: item.depth * 14 + 8 }}>↳ {item.name} — listed above</p>;
    return <GroupHeader key={`g-${item.group.id}-${idx}`} item={item} expandedSet={expandedSet} onExpand={onExpand} />;
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
                {searchHits.slice(0, shown).map((a) => <AlterRow key={a.id} a={a} />)}
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
                {flatAlters.slice(0, shown).map((a) => <AlterRow key={a.id} a={a} />)}
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
