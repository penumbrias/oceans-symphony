// The nested "who" list — members under the user's own groups and
// subsystems, nested the way they nested them (owner ask, 2026-10-25: the
// old group view was the flat list cut into headed chunks; nested groups
// didn't sit inside their parents, a whole group couldn't be picked at once,
// you couldn't narrow to groups or subsystems, and search only found names).
//
// • Folders nest by `parent` (groupTree.js). A subsystem whose owner is a
//   member of another subsystem nests inside that one too, so a system of
//   subsystems reads as the tree it is. The owner leads their subsystem's
//   rows, and picking the subsystem picks them with it.
// • Each group row folds open/closed and carries its own tick: tap it to add
//   everyone in the group (nested groups included), tap again to take them
//   all off. A partly picked group shows a dash and its count.
// • Show: All / Groups / Subsystems narrows which kind of group is listed.
// • Search finds group names as well as member names: a matching group
//   shows with everyone in it; a matching member shows under their groups.
//
// Selection is by id, so someone in several groups ticks in every place
// they appear. Writes nothing — the caller owns the selection.
//
// LOAD-BEARING: every walk is cycle-guarded and depth-clamped (house rule
// for any tree). One bad parent or ownership loop must never hang a render.

import React, { useMemo, useState } from "react";
import { ChevronRight, Folder, Network } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useTerms } from "@/lib/useTerms";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { byGroupOrder, childGroups, indexGroups, MAX_GROUP_DEPTH, rootGroups } from "@/lib/groupTree";
import { getMemberAlters, isSubsystem } from "@/lib/subsystemUtils";

const INDENT = 14;

function Avatar({ alter }) {
  const resolved = useResolvedAvatarUrl(alter?.avatar_url || null);
  return (
    <span className="w-5 h-5 rounded-full overflow-hidden flex-shrink-0"
      style={{ backgroundColor: alter?.color || "hsl(var(--muted))" }}>
      {resolved ? <img src={resolved} alt="" className="w-full h-full object-cover" /> : null}
    </span>
  );
}

// ✓ all · – some · empty none. A real button so the whole group is one tap.
function GroupTick({ state, onClick, label }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label}
      aria-pressed={state === "all" ? true : state === "some" ? "mixed" : false}
      className={`w-6 h-6 rounded-md border flex items-center justify-center text-xs flex-shrink-0 ${
        state === "none" ? "border-border text-transparent" : "border-[var(--v2-accent)] text-[var(--v2-accent)]"
      }`}
      style={state === "all" ? { background: "color-mix(in srgb, var(--v2-accent) 15%, transparent)" } : undefined}>
      {state === "all" ? "✓" : state === "some" ? "–" : "✓"}
    </button>
  );
}

// Build the tree for the groups of the chosen kind. Pure.
export function buildMemberTree({ alters, groups, kind = "all", sort = (x) => x }) {
  const live = (alters || []).filter((a) => !a.is_archived);
  const alterById = new Map(live.map((a) => [a.id, a]));
  const shown = (groups || []).filter((g) =>
    kind === "groups" ? !isSubsystem(g) : kind === "subsystems" ? isSubsystem(g) : true);
  const byId = indexGroups(shown);
  const membersOf = new Map(shown.map((g) => [g.id, getMemberAlters(g, live)]));
  // Subsystems inside subsystems: B's owner is a member of A → B sits in A
  // (only when B has no folder parent of its own among the shown groups).
  const ownedInside = new Map();
  for (const b of shown) {
    if (!isSubsystem(b) || (b.parent && byId[b.parent])) continue;
    const host = shown.find((a) => a.id !== b.id && isSubsystem(a)
      && (membersOf.get(a.id) || []).some((m) => m.id === b.owner_alter_id));
    if (host) ownedInside.set(b.id, host.id);
  }
  const visited = new Set();
  const build = (g, depth) => {
    if (depth > MAX_GROUP_DEPTH || visited.has(g.id)) return null;
    visited.add(g.id);
    const owner = isSubsystem(g) ? alterById.get(g.owner_alter_id) || null : null;
    const kids = [
      ...childGroups(shown, g.id),
      ...shown.filter((x) => ownedInside.get(x.id) === g.id),
    ].sort(byGroupOrder);
    const children = kids.map((c) => build(c, depth + 1)).filter(Boolean);
    const members = sort(membersOf.get(g.id) || []);
    const ids = new Set(members.map((m) => m.id));
    if (owner) ids.add(owner.id);
    for (const c of children) for (const id of c.ids) ids.add(id);
    if (!ids.size) return null;
    return { group: g, owner, depth, children, members, ids };
  };
  const roots = rootGroups(shown).filter((g) => !ownedInside.has(g.id)).sort(byGroupOrder);
  const tree = roots.map((g) => build(g, 0)).filter(Boolean);
  // Whatever a loop kept out still gets listed, so nobody is unreachable.
  for (const g of [...shown].sort(byGroupOrder)) {
    if (!visited.has(g.id)) { const n = build(g, 0); if (n) tree.push(n); }
  }
  const placed = new Set();
  const walk = (n) => { n.ids.forEach((id) => placed.add(id)); n.children.forEach(walk); };
  tree.forEach(walk);
  const rest = sort(live.filter((a) => !placed.has(a.id)));
  return { tree, rest, alterById };
}

// Narrow the tree to a search. A group whose name matches keeps everything.
function filterTree(nodes, needle, labelOf) {
  const out = [];
  for (const n of nodes) {
    if ((n.group.name || "").toLowerCase().includes(needle)) { out.push(n); continue; }
    const children = filterTree(n.children, needle, labelOf);
    const members = n.members.filter((m) => labelOf(m).toLowerCase().includes(needle));
    const ownerHit = n.owner && labelOf(n.owner).toLowerCase().includes(needle);
    if (children.length || members.length || ownerHit) {
      out.push({ ...n, children, members, owner: ownerHit ? n.owner : null });
    }
  }
  return out;
}

export default function NestedMemberList({
  alters = [],
  groups = [],
  selectedIds = [],
  onToggle,             // (alterId) — one member
  onSetMany,            // (ids[], on) — a whole group at once
  labelOf = (a) => a.name || "",
  sort = (x) => x,
  searchPlaceholder,
}) {
  const tr = useT();
  const t = useTerms();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("all");
  const [openIds, setOpenIds] = useState(() => new Set());
  const needle = q.trim().toLowerCase();
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);

  const { tree, rest } = useMemo(
    () => buildMemberTree({ alters, groups, kind, sort }),
    [alters, groups, kind, sort]
  );
  const shownTree = useMemo(() => (needle ? filterTree(tree, needle, labelOf) : tree), [tree, needle, labelOf]);
  const shownRest = needle ? rest.filter((a) => labelOf(a).toLowerCase().includes(needle)) : rest;
  const hasSubsystems = groups.some(isSubsystem);
  const hasFolders = groups.some((g) => !isSubsystem(g));

  const toggleOpen = (id) => setOpenIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const stateOf = (ids) => {
    let n = 0;
    ids.forEach((id) => { if (selected.has(id)) n += 1; });
    return n === 0 ? "none" : n === ids.size ? "all" : "some";
  };
  const countOf = (ids) => { let n = 0; ids.forEach((id) => { if (selected.has(id)) n += 1; }); return n; };

  const memberRow = (a, depth, key, tag = null) => {
    const on = selected.has(a.id);
    return (
      <button key={key} type="button" onClick={() => onToggle?.(a.id)}
        className={`w-full flex items-center gap-2 py-1.5 pr-2 rounded-lg border text-left text-xs ${
          on ? "border-primary/60 bg-primary/10" : "border-transparent hover:bg-muted/40"
        }`}
        style={{ paddingLeft: 8 + depth * INDENT }}>
        <Avatar alter={a} />
        <span className="flex-1 truncate">{labelOf(a)}</span>
        {tag && <span className="text-[0.625em] text-muted-foreground flex-shrink-0">{tag}</span>}
        {on && <span className="flex-shrink-0" style={{ color: "var(--v2-accent)" }}>✓</span>}
      </button>
    );
  };

  const renderNode = (n, depth) => {
    const g = n.group;
    const open = !!needle || openIds.has(g.id);
    const state = stateOf(n.ids);
    const sub = isSubsystem(g);
    const Icon = sub ? Network : Folder;
    return (
      <div key={`${g.id}:${depth}`}>
        <div className="flex items-center gap-1.5 py-0.5 pr-1" style={{ paddingLeft: depth * INDENT }}>
          <button type="button" onClick={() => toggleOpen(g.id)} aria-expanded={open}
            className="flex-1 min-w-0 flex items-center gap-1.5 py-1 px-1 rounded-lg hover:bg-muted/40 text-left">
            <ChevronRight className={`w-3.5 h-3.5 flex-shrink-0 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />
            <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: g.color || "var(--v2-text-muted, hsl(var(--muted-foreground)))" }} />
            <span className="text-xs font-semibold truncate" style={g.color ? { color: g.color } : undefined}>{g.name || tr("who.unnamedGroup")}</span>
            {sub && n.owner && !open && (
              <span className="text-[0.625em] text-muted-foreground truncate">· {labelOf(n.owner)}</span>
            )}
            <span className="ml-auto text-[0.625em] text-muted-foreground tabular-nums flex-shrink-0">
              {countOf(n.ids)}/{n.ids.size}
            </span>
          </button>
          <GroupTick state={state}
            label={state === "all" ? tr("who.removeGroup", { name: g.name || "" }) : tr("who.addGroup", { name: g.name || "" })}
            onClick={() => onSetMany?.([...n.ids], state !== "all")} />
        </div>
        {open && (
          <div>
            {n.owner && memberRow(n.owner, depth + 1, `${g.id}:owner`, tr("who.owner"))}
            {n.children.map((c) => renderNode(c, depth + 1))}
            {n.members.map((m) => memberRow(m, depth + 1, `${g.id}:${m.id}`))}
          </div>
        )}
      </div>
    );
  };

  const kinds = [["all", tr("who.kindAll")], ["groups", tr("who.kindGroups")], ["subsystems", tr("who.kindSubsystems")]];

  return (
    <div className="space-y-1.5 pb-1">
      <input value={q} onChange={(e) => setQ(e.target.value)}
        placeholder={searchPlaceholder || tr("who.searchBoth", { members: t.alters })}
        aria-label={searchPlaceholder || tr("who.searchBoth", { members: t.alters })}
        className="w-full h-8 px-2 rounded-lg border border-input bg-background text-xs focus:outline-none focus:ring-1 focus:ring-ring" />
      {hasSubsystems && hasFolders && (
        <div role="radiogroup" aria-label={tr("who.kindLabel")} className="flex rounded-full border border-border/60 p-0.5 gap-0.5">
          {kinds.map(([id, label]) => (
            <button key={id} type="button" role="radio" aria-checked={kind === id} onClick={() => setKind(id)}
              className={`flex-1 text-[0.6875em] py-1 rounded-full ${
                kind === id ? "bg-[var(--v2-accent)]/10 text-[var(--v2-accent)] font-semibold" : "text-muted-foreground"
              }`}>{label}</button>
          ))}
        </div>
      )}
      <div className="max-h-64 overflow-y-auto overscroll-contain space-y-0.5">
        {shownTree.map((n) => renderNode(n, 0))}
        {shownRest.length > 0 && (
          <>
            {shownTree.length > 0 && (
              <p className="text-[0.625em] font-semibold uppercase tracking-wide text-muted-foreground pt-1.5 px-1">
                {kind === "subsystems" ? tr("who.notInSubsystem") : tr("who.notInGroup")}
              </p>
            )}
            {shownRest.map((a) => memberRow(a, 0, `rest:${a.id}`))}
          </>
        )}
        {!shownTree.length && !shownRest.length && (
          <p className="text-[0.6875em] text-muted-foreground px-1 py-2">{tr("who.noMatch")}</p>
        )}
      </div>
    </div>
  );
}
