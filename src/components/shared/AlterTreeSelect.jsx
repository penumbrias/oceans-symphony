import React, { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Search, Check, FolderTree, Loader2, ChevronRight, ChevronDown, Users, UserRound, Folder } from "lucide-react";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { getMemberAlters, getSubsystemsOwnedBy, isSubsystem, getAltersInsideSubsystems, MAX_SUBSYSTEM_DEPTH } from "@/lib/subsystemUtils";

// ── ONE standard alter-selection surface, reused everywhere alters are picked
// (export, privacy-level assignment, …). Two tabs:
//   • Members — alters organised BY SUBSYSTEM (nested) or flat; search; lazy.
//   • Groups  — FOLDER groups only (never subsystems), each with + all / − all.
// Selection is generic: the caller supplies isSelected/onToggle/onSetMany so
// the same UI drives a local Set (export) or alter.privacy_levels (sharing).
//
// Lazy loading: long flat lists render incrementally as you scroll (no hard
// cap). The nested view stays cheap because groups are collapsed by default.

function groupKeyOf(g) { return g?.sp_id || g?.id; }
const PAGE = 60;

// Subsystem tree: top-level alters (those NOT inside any subsystem), each with
// their owned subsystems nested + collapsible. A subsystem is expanded once
// (dedup) — repeats get a "listed above" line.
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
      items.push({ type: "group", depth: depth + 1, group: sub, members });
      if (expanded.has(sub.id)) for (const m of members) emit(m, depth + 2, nv);
    }
  };
  for (const a of top) emit(a, 0, new Set());
  return items;
}

// All alters in a FOLDER group (+ its subsystems / subgroups when includeNested).
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

export default function AlterTreeSelect({ isSelected, onToggle, onSetMany, busy = false, maxHeight = "55vh" }) {
  const terms = useTerms();
  const formatAlter = useAlterLabel();
  const [tab, setTab] = useState("members");
  const [search, setSearch] = useState("");
  const [nested, setNested] = useState(true);
  const [expanded, setExpanded] = useState(() => new Set());
  const [includeNested, setIncludeNested] = useState(true);
  const [shown, setShown] = useState(PAGE);

  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  const { data: groups = [] } = useQuery({ queryKey: ["groups"], queryFn: () => base44.entities.Group.list() });
  const liveAlters = useMemo(() => alters.filter((a) => !a.is_archived), [alters]);
  const folderGroups = useMemo(() => groups.filter((g) => !isSubsystem(g)), [groups]);

  const toggleExpand = (key) => setExpanded((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  useEffect(() => { setShown(PAGE); }, [tab, search, nested, includeNested]);
  const onScroll = (e) => {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 240) setShown((s) => s + PAGE);
  };

  const searchHits = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return null;
    return liveAlters.filter((a) => a.name?.toLowerCase().includes(q) || a.alias?.toLowerCase().includes(q));
  }, [liveAlters, search]);

  const flatAlters = useMemo(() => [...liveAlters].sort((a, b) => (a.name || "").localeCompare(b.name || "")), [liveAlters]);
  const nestedItems = useMemo(() => (tab === "members" && nested && !searchHits ? buildSubsystemItems(liveAlters, groups, expanded) : []), [tab, nested, searchHits, liveAlters, groups, expanded]);

  const AlterRow = ({ a, depth = 0 }) => {
    const on = isSelected(a.id);
    return (
      <button type="button" disabled={busy} onClick={() => onToggle(a, !on)}
        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg border text-left transition-colors ${on ? "border-primary/50 bg-primary/10" : "border-transparent hover:bg-muted/30"}`}
        style={{ marginLeft: depth * 14, width: `calc(100% - ${depth * 14}px)` }}>
        <span className={`w-4 h-4 rounded-md border flex items-center justify-center flex-shrink-0 ${on ? "bg-primary border-primary text-primary-foreground" : "border-border"}`}>{on && <Check className="w-3 h-3" />}</span>
        <span className="w-3.5 h-3.5 rounded-full flex-shrink-0 border border-black/10 dark:border-white/15" style={{ backgroundColor: a.color || "#6366f1" }} />
        <span className={`text-xs truncate ${on ? "font-medium text-foreground" : "text-foreground/90"}`}>{formatAlter(a)}</span>
      </button>
    );
  };

  const GroupBulkRow = ({ group, icon: Icon, subsystem }) => {
    const members = collectGroupMembers(group, liveAlters, groups, includeNested);
    const on = members.filter((a) => isSelected(a.id)).length;
    return (
      <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-border/40 bg-muted/10">
        <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${subsystem ? "text-violet-500" : "text-muted-foreground"}`} />
        <span className="text-xs font-medium flex-1 truncate" style={{ color: group.color || undefined }}>{group.name}</span>
        <span className="text-[0.625rem] text-muted-foreground">{on}/{members.length}</span>
        <div className="flex gap-1">
          <button type="button" disabled={busy || members.length === 0 || on === members.length} onClick={() => onSetMany(members, true)} className="text-[0.625rem] px-1.5 py-0.5 rounded border border-primary/40 text-primary hover:bg-primary/10 disabled:opacity-40">+ all</button>
          <button type="button" disabled={busy || on === 0} onClick={() => onSetMany(members, false)} className="text-[0.625rem] px-1.5 py-0.5 rounded border border-border/50 text-muted-foreground hover:bg-muted/40 disabled:opacity-40">− all</button>
        </div>
      </div>
    );
  };

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
            <div className="flex gap-2">
              <button type="button" disabled={busy} onClick={() => onSetMany((searchHits || liveAlters).filter((a) => !isSelected(a.id)), true)} className="text-primary hover:underline disabled:opacity-40">Select all{searchHits ? " shown" : ""}</button>
              <button type="button" disabled={busy} onClick={() => onSetMany((searchHits || liveAlters).filter((a) => isSelected(a.id)), false)} className="text-muted-foreground hover:underline disabled:opacity-40">Clear all{searchHits ? " shown" : ""}</button>
            </div>
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
                {nestedItems.slice(0, shown).map((item, idx) => {
                  if (item.type === "alter") return <AlterRow key={`a-${item.alter.id}-${idx}`} a={item.alter} depth={item.depth} />;
                  if (item.type === "ref") return <p key={`r-${idx}`} className="text-[0.625rem] text-muted-foreground italic py-0.5" style={{ paddingLeft: item.depth * 14 + 8 }}>↳ {item.name} — listed above</p>;
                  const open = expanded.has(item.group.id);
                  const onCount = item.members.filter((a) => isSelected(a.id)).length;
                  return (
                    <div key={`g-${item.group.id}-${idx}`} className="flex items-center gap-1.5 pt-1.5 pb-0.5" style={{ paddingLeft: item.depth * 14 }}>
                      <button type="button" onClick={() => toggleExpand(item.group.id)} className="flex items-center gap-1 min-w-0 flex-1">
                        {open ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
                        <FolderTree className="w-3.5 h-3.5 text-violet-500 flex-shrink-0" />
                        <span className="text-[0.6875rem] font-semibold uppercase tracking-wide truncate" style={{ color: item.group.color || undefined }}>{item.group.name}</span>
                        <span className="text-[0.625rem] text-muted-foreground">{onCount}/{item.members.length}</span>
                      </button>
                      <div className="flex gap-1">
                        <button type="button" disabled={busy || onCount === item.members.length} onClick={() => onSetMany(item.members, true)} className="text-[0.625rem] px-1.5 py-0.5 rounded border border-primary/40 text-primary hover:bg-primary/10 disabled:opacity-40">+ all</button>
                        <button type="button" disabled={busy || onCount === 0} onClick={() => onSetMany(item.members, false)} className="text-[0.625rem] px-1.5 py-0.5 rounded border border-border/50 text-muted-foreground hover:bg-muted/40 disabled:opacity-40">− all</button>
                      </div>
                    </div>
                  );
                })}
                {nestedItems.length > shown && <p className="text-[0.625rem] text-muted-foreground italic py-2 text-center">Loading more…</p>}
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
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={includeNested} onChange={(e) => setIncludeNested(e.target.checked)} className="accent-primary" />
            Include subsystems &amp; subgroups when adding a group
          </label>
          <div className="space-y-1 overflow-y-auto overscroll-contain" style={{ maxHeight }} onScroll={onScroll}>
            {folderGroups.length === 0 && <p className="text-xs text-muted-foreground/60 italic py-4 text-center">No groups yet.</p>}
            {folderGroups.slice(0, shown).map((g) => <GroupBulkRow key={g.id} group={g} icon={Folder} subsystem={false} />)}
            {folderGroups.length > shown && <p className="text-[0.625rem] text-muted-foreground italic py-2 text-center">Loading more…</p>}
          </div>
        </>
      )}
    </div>
  );
}
