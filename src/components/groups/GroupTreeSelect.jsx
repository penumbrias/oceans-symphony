import React, { useState, useMemo } from "react";
import { ChevronDown, ChevronRight, Folder, Crown, Search, X } from "lucide-react";

// Inline, nested, parent-respecting group/subsystem multi-select — the group
// analogue of the activity-category picker (ActivityPillSelector). Used where
// an alter is being assigned to groups before it exists (the Add New Alter
// create flow), so it just manages a Set of selected ids + onToggle; the
// caller persists membership on save.
//
// Groups nest via `parent` (a group id OR sp_id). Cycle-safe: a `seen` set
// guards against a malformed parent chain spinning the recursion.

function childrenOf(group, groups) {
  return groups.filter((g) => {
    const p = g.parent || "";
    if (!p || p === "root") return false;
    return p === group.id || (group.sp_id && p === group.sp_id);
  });
}

function GroupNode({ group, groups, selectedIds, onToggle, level, expanded, onToggleExpand, seen }) {
  if (seen.has(group.id)) return null;
  const kids = childrenOf(group, groups);
  const hasKids = kids.length > 0;
  const isOpen = expanded.has(group.id);
  const isSel = selectedIds.has(group.id);
  const nextSeen = new Set(seen); nextSeen.add(group.id);
  return (
    <div>
      <div className="flex items-center gap-1" style={{ paddingLeft: `${level * 14}px` }}>
        <button type="button" aria-label={isOpen ? "Collapse" : "Expand"} onClick={() => onToggleExpand(group.id)}
          className="w-5 h-5 flex items-center justify-center flex-shrink-0">
          {hasKids
            ? (isOpen ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />)
            : <span className="w-3.5 h-3.5" />}
        </button>
        <button type="button" onClick={() => onToggle(group.id)} aria-pressed={isSel}
          className={`flex-1 min-w-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm text-left transition-colors ${
            isSel ? "text-white" : "bg-muted/50 text-muted-foreground hover:bg-muted"}`}
          style={isSel && group.color ? { backgroundColor: group.color } : {}}>
          {group.owner_alter_id
            ? <Crown className={`w-3 h-3 flex-shrink-0 ${isSel ? "text-white/90" : "text-amber-500"}`} />
            : group.color && !isSel
              ? <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: group.color }} />
              : <Folder className="w-3 h-3 flex-shrink-0 opacity-70" />}
          <span className="truncate flex-1">{group.emoji ? `${group.emoji} ` : ""}{group.name}</span>
        </button>
      </div>
      {hasKids && isOpen && (
        <div className="mt-0.5 space-y-0.5">
          {kids.map((k) => (
            <GroupNode key={k.id} group={k} groups={groups} selectedIds={selectedIds} onToggle={onToggle}
              level={level + 1} expanded={expanded} onToggleExpand={onToggleExpand} seen={nextSeen} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function GroupTreeSelect({ groups = [], selectedIds, onToggle, subTerm = "subsystem" }) {
  const [expanded, setExpanded] = useState(new Set());
  const [search, setSearch] = useState("");

  // Roots: no parent, parent "root"/"", or a parent that doesn't resolve to a
  // real group (orphan) — so every group is reachable even with bad data.
  const roots = useMemo(() => groups.filter((g) => {
    const p = g.parent || "";
    if (!p || p === "root") return true;
    return !groups.some((x) => x.id === p || x.sp_id === p);
  }), [groups]);

  const toggleExpand = (id) => setExpanded((prev) => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const q = search.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!q) return null;
    return groups.filter((g) => (g.name || "").toLowerCase().includes(q))
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [groups, q]);

  return (
    <div className="rounded-lg border border-border/40 bg-muted/10 p-2 space-y-1.5">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search groups / ${subTerm}s…`}
          className="w-full h-8 pl-7 pr-7 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
        {search && (
          <button type="button" onClick={() => setSearch("")} aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="max-h-52 overflow-y-auto overscroll-contain space-y-0.5">
        {groups.length === 0 ? (
          <p className="text-xs text-muted-foreground italic px-1 py-2">No groups yet.</p>
        ) : q ? (
          matches.length > 0 ? matches.map((g) => {
            const isSel = selectedIds.has(g.id);
            return (
              <button key={g.id} type="button" onClick={() => onToggle(g.id)} aria-pressed={isSel}
                className={`w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm text-left transition-colors ${
                  isSel ? "text-white" : "bg-muted/50 text-muted-foreground hover:bg-muted"}`}
                style={isSel && g.color ? { backgroundColor: g.color } : {}}>
                {g.owner_alter_id
                  ? <Crown className={`w-3 h-3 flex-shrink-0 ${isSel ? "text-white/90" : "text-amber-500"}`} />
                  : <Folder className="w-3 h-3 flex-shrink-0 opacity-70" />}
                <span className="truncate flex-1">{g.emoji ? `${g.emoji} ` : ""}{g.name}</span>
              </button>
            );
          }) : <p className="text-xs text-muted-foreground italic px-1 py-2">No matches.</p>
        ) : (
          roots.map((g) => (
            <GroupNode key={g.id} group={g} groups={groups} selectedIds={selectedIds} onToggle={onToggle}
              level={0} expanded={expanded} onToggleExpand={toggleExpand} seen={new Set()} />
          ))
        )}
      </div>
    </div>
  );
}
