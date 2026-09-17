// Manage groups — rebuilt around the same drill-in navigation as the
// alters page's groups section (owner ask): a breadcrumb, folders you tap
// into, and at every level you can SEE what a group contains — its
// subgroups and its members — instead of decoding one flat indented tree.
//
// Per level: subgroups reorder with arrows (Group.order — the same field
// byGroupOrder sorts by everywhere), rename inline, and carry a ⋯ menu
// (profile / move / members / colour / delete). Inside a group its members
// list reorders too (Group.member_order, read back through
// getMemberAlters so every member list in the app follows it) and members
// can be removed right there. "Select" turns on multi-select for mass
// move / recolour / delete of groups.
//
// Nesting rules stay in src/lib/groupTree.js; membership writes go through
// src/lib/groupMembership.js. Neither is duplicated here.

import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus, Search, ChevronRight, ChevronUp, ChevronDown, Crown, Users, Pencil,
  Trash2, FolderInput, X, AlertTriangle, ArrowLeft, Folder, MoreHorizontal,
  FolderTree, Palette, CheckSquare,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { confirm } from "@/components/shared/ConfirmDialog";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import ColorPicker from "@/components/shared/ColorPicker";
import CreateGroupModal from "@/components/groups/CreateGroupModal";
import ManageMembersModal from "@/components/groups/ManageMembersModal";
import GroupIcon from "@/components/shared/GroupIcon";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import {
  flattenGroupTree, childGroups, wouldNest, normalizeParent, strandedGroups,
  indexGroups, ancestorIds,
} from "@/lib/groupTree";
import { byGroupOrder } from "@/lib/groupTreeUtils";
import { getMemberAlters } from "@/lib/subsystemUtils";
import { setGroupMembers, currentMemberIds } from "@/lib/groupMembership";
import { isValidHexColor } from "@/lib/colorUtils";

const dotColor = (c) => (isValidHexColor(c) ? c : "hsl(var(--muted))");

// One subgroup row at the current level: tap the name to drill in, arrows
// to reorder among siblings, pencil to rename in place, ⋯ for the rest.
function GroupRow({
  group, t, contents, ownerLabel, stranded,
  selectMode, selected, onSelect,
  onOpen, onRename, canUp, canDown, onReorder, menu,
}) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(group.name || "");
  const commitRename = () => {
    const next = draft.trim();
    setRenaming(false);
    if (next && next !== group.name) onRename(next);
    else setDraft(group.name || "");
  };

  return (
    <div className="flex items-center gap-2 px-2 py-2 border-b border-border/30 last:border-0">
      {selectMode && (
        <input type="checkbox" checked={selected} onChange={onSelect}
          aria-label={`Select ${group.name}`} className="w-4 h-4 rounded accent-primary flex-shrink-0" />
      )}
      <GroupIcon group={group} boxed className="w-8 h-8 flex-shrink-0" boxClassName="rounded-lg border border-border/40" />
      {renaming ? (
        <Input
          autoFocus value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") { setDraft(group.name || ""); setRenaming(false); }
          }}
          className="h-8 text-sm flex-1 min-w-0"
        />
      ) : (
        <button type="button" onClick={selectMode ? onSelect : onOpen} className="flex-1 min-w-0 text-left">
          <span className="text-sm font-medium truncate block">
            {group.emoji ? `${group.emoji} ` : ""}{group.name || "Untitled group"}
            {stranded && (
              <AlertTriangle className="w-3 h-3 inline-block ml-1 text-amber-500" aria-label="Was buried — moved to the top" />
            )}
          </span>
          <span className="text-[0.6875rem] text-muted-foreground truncate block">
            {ownerLabel && <><Crown className="w-2.5 h-2.5 inline-block mr-0.5 -mt-0.5 text-amber-500" />{ownerLabel} · </>}
            {contents}
          </span>
        </button>
      )}
      {!selectMode && !renaming && (
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button type="button" disabled={!canUp} onClick={() => onReorder(-1)}
            aria-label={`Move ${group.name} up`}
            className="w-7 h-7 flex items-center justify-center rounded-lg border border-border/40 text-muted-foreground hover:text-foreground disabled:opacity-30">
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <button type="button" disabled={!canDown} onClick={() => onReorder(1)}
            aria-label={`Move ${group.name} down`}
            className="w-7 h-7 flex items-center justify-center rounded-lg border border-border/40 text-muted-foreground hover:text-foreground disabled:opacity-30">
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={() => { setDraft(group.name || ""); setRenaming(true); }}
            aria-label={`Rename ${group.name}`} title="Rename"
            className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          {menu}
        </div>
      )}
    </div>
  );
}

export default function GroupsManager() {
  const t = useTerms();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const formatAlter = useAlterLabel();

  const [navStack, setNavStack] = useState([]);
  const [query, setQuery] = useState("");
  const [rootFilter, setRootFilter] = useState("all"); // all | groups | subsystems
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [createOpen, setCreateOpen] = useState(false);
  const [membersFor, setMembersFor] = useState(null);
  const [movingIds, setMovingIds] = useState(null);   // array of group ids
  const [colorIds, setColorIds] = useState(null);     // array of group ids

  const { data: groups = [] } = useQuery({ queryKey: ["groups"], queryFn: () => base44.entities.Group.list() });
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  const byId = useMemo(() => indexGroups(groups), [groups]);
  const alterById = useMemo(() => Object.fromEntries(alters.map((a) => [a.id, a])), [alters]);
  const stranded = useMemo(() => new Set(strandedGroups(groups).map((g) => g.id)), [groups]);

  // Live version of whatever the breadcrumb points at (renames etc. show
  // immediately); drop levels whose group no longer exists.
  const liveStack = useMemo(
    () => navStack.map((id) => byId[id]).filter(Boolean),
    [navStack, byId]
  );
  const current = liveStack.length ? liveStack[liveStack.length - 1] : null;

  // The current level's subgroups, in display order. At the root the
  // filter chips narrow to plain groups or sub{systems}.
  const siblings = useMemo(() => {
    const kids = childGroups(groups, current?.id || null).sort(byGroupOrder);
    if (current || rootFilter === "all") return kids;
    return kids.filter((g) => (rootFilter === "subsystems" ? !!g.owner_alter_id : !g.owner_alter_id));
  }, [groups, current, rootFilter]);

  const members = useMemo(
    () => (current ? getMemberAlters(current, alters) : []),
    [current, alters]
  );
  const ownerAlter = current?.owner_alter_id ? alterById[current.owner_alter_id] : null;

  // Search cuts across every level; a result names its path and tapping it
  // jumps the breadcrumb straight inside that group.
  const needle = query.trim().toLowerCase();
  const searchResults = useMemo(() => {
    if (!needle) return null;
    return flattenGroupTree(groups)
      .filter((g) => (g.name || "").toLowerCase().includes(needle))
      .map((g) => {
        const path = ancestorIds(g, byId).map((id) => byId[id]?.name || "?").reverse();
        return { ...g, _path: path.length ? path.join(" / ") : "Top level" };
      });
  }, [groups, needle, byId]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["groups"] });
    qc.invalidateQueries({ queryKey: ["alters"] });
  };
  const fail = (e, msg) => toast.error(e?.message || msg);

  const jumpTo = (g) => {
    setQuery("");
    setNavStack([...ancestorIds(g, byId).reverse(), g.id]);
  };

  const handleRename = async (group, name) => {
    try { await base44.entities.Group.update(group.id, { name }); refresh(); }
    catch (e) { fail(e, "Couldn't rename that"); }
  };

  // Reorder among the CURRENT siblings: renumber the whole level so the
  // arrows always work, even when every group still has order 0.
  const handleReorder = async (group, dir) => {
    const list = [...siblings];
    const i = list.findIndex((g) => g.id === group.id);
    const j = i + dir;
    if (i === -1 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    try {
      await Promise.all(list.map((g, idx) => (
        (g.order || 0) === (idx + 1) * 10 ? null : base44.entities.Group.update(g.id, { order: (idx + 1) * 10 })
      )).filter(Boolean));
      refresh();
    } catch (e) { fail(e, "Couldn't reorder that"); }
  };

  const handleColor = async (ids, color) => {
    try {
      await Promise.all(ids.map((id) => base44.entities.Group.update(id, { color })));
      refresh();
    } catch (e) { fail(e, "Couldn't change the colour"); }
  };

  const handleMove = async (ids, targetId) => {
    const blocked = ids.filter((id) => wouldNest(groups, id, targetId));
    if (blocked.length) {
      toast.error("That would put a group inside itself");
      return;
    }
    try {
      await Promise.all(ids.map((id) => base44.entities.Group.update(id, { parent: targetId || "" })));
      refresh();
      setMovingIds(null);
      setSelected(new Set());
      setSelectMode(false);
      toast.success(targetId ? "Moved" : "Moved to the top level");
    } catch (e) { fail(e, "Couldn't move that"); }
  };

  const handleDelete = async (ids) => {
    const names = ids.map((id) => byId[id]?.name || "?");
    const kidCount = ids.reduce((n, id) => n + childGroups(groups, id).length, 0);
    const ok = await confirm({
      title: ids.length === 1 ? `Delete "${names[0]}"?` : `Delete ${ids.length} groups?`,
      body: `${kidCount ? `Nested groups move to the top level. ` : ""}No ${t.alters} are deleted — they just stop being in ${ids.length === 1 ? "this group" : "these groups"}.`,
      confirmLabel: "Delete", destructive: true,
    });
    if (!ok) return;
    try {
      for (const id of ids) {
        // Re-home the children FIRST, so a failure can't strand them under
        // a group that no longer exists.
        for (const kid of childGroups(groups, id)) {
          if (!ids.includes(kid.id)) await base44.entities.Group.update(kid.id, { parent: "" });
        }
        await base44.entities.Group.delete(id);
      }
      refresh();
      setSelected(new Set());
      setSelectMode(false);
      setNavStack((prev) => prev.filter((gid) => !ids.includes(gid)));
      toast.success("Deleted");
    } catch (e) { fail(e, "Couldn't delete that"); }
  };

  // Members of the CURRENT group: reorder (member_order) and remove.
  const handleMemberReorder = async (alterId, dir) => {
    const ids = members.map((a) => a.id);
    const i = ids.indexOf(alterId);
    const j = i + dir;
    if (i === -1 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    try {
      await base44.entities.Group.update(current.id, { member_order: ids });
      refresh();
    } catch (e) { fail(e, "Couldn't reorder that"); }
  };
  const handleMemberRemove = async (alter) => {
    const ok = await confirm({
      title: `Remove ${alter.name} from "${current.name}"?`,
      body: `They stay in your ${t.system} — they just leave this group.`,
      confirmLabel: "Remove", destructive: true,
    });
    if (!ok) return;
    try {
      await setGroupMembers({ group: current, alterIds: currentMemberIds(current, alters).filter((id) => id !== alter.id) });
      refresh();
    } catch (e) { fail(e, "Couldn't remove them"); }
  };

  // Move targets: the whole tree, indented, loops greyed out (house rule
  // for hierarchies — never a bare select).
  const moveOptions = useMemo(() => {
    if (!movingIds) return [];
    return [
      { id: "", label: "Top level", _depth: 0 },
      ...flattenGroupTree(groups)
        .filter((g) => !movingIds.includes(g.id))
        .map((g) => ({
          id: g.id,
          label: g.name || "Untitled group",
          _depth: g._depth,
          _blocked: movingIds.some((id) => wouldNest(groups, id, g.id)),
        })),
    ];
  }, [groups, movingIds]);

  const rowMenu = (g) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={`More actions for ${g.name}`}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground">
          <MoreHorizontal className="w-3.5 h-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 z-[60]">
        <DropdownMenuItem onSelect={() => navigate(`/group/${g.id}`)} className="gap-2 cursor-pointer">
          <FolderTree className="w-4 h-4" /> Open profile
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setMovingIds([g.id])} className="gap-2 cursor-pointer">
          <FolderInput className="w-4 h-4" /> Move to…
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setMembersFor(g)} className="gap-2 cursor-pointer">
          <Users className="w-4 h-4" /> Manage {t.alters}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setColorIds([g.id])} className="gap-2 cursor-pointer">
          <Palette className="w-4 h-4" /> Colour…
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => handleDelete([g.id])} className="gap-2 cursor-pointer text-destructive focus:text-destructive">
          <Trash2 className="w-4 h-4" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const contentsLabel = (g) => {
    const m = getMemberAlters(g, alters).length;
    const k = childGroups(groups, g.id).length;
    const parts = [`${m} ${m === 1 ? t.alter : t.alters}`];
    if (k) parts.push(`${k} group${k === 1 ? "" : "s"}`);
    return parts.join(" · ");
  };

  return (
    <div className="min-h-screen p-4 sm:p-6">
      <div className="os-page-shell space-y-4"
        style={{ paddingBottom: selectMode ? 72 : 0 }}>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Manage groups</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5"
              onClick={() => { setSelectMode((v) => !v); setSelected(new Set()); }}
              aria-pressed={selectMode}>
              <CheckSquare className="w-3.5 h-3.5" /> {selectMode ? "Done" : "Select"}
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5">
              <Plus className="w-4 h-4" /> New group
            </Button>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search all groups…" className="h-9 pl-8 text-sm" />
        </div>

        {searchResults ? (
          <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
            {searchResults.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10">No groups match that.</p>
            ) : searchResults.map((g) => (
              <button key={g.id} type="button" onClick={() => jumpTo(g)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left border-b border-border/30 last:border-0 hover:bg-muted/40">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: dotColor(g.color) }} />
                <span className="flex-1 min-w-0">
                  <span className="text-sm truncate block">
                    {g.owner_alter_id && <Crown className="w-3 h-3 inline-block mr-1 -mt-0.5 text-amber-500" />}
                    {g.name || "Untitled group"}
                  </span>
                  <span className="text-[0.6875rem] text-muted-foreground truncate block">{g._path}</span>
                </span>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              </button>
            ))}
          </div>
        ) : (
          <>
            {/* Breadcrumb — same drill-in the alters page uses. */}
            <div className="flex items-center gap-1.5 flex-wrap text-sm">
              {liveStack.length > 0 && (
                <button type="button" onClick={() => setNavStack((p) => p.slice(0, -1))}
                  aria-label="Back" className="p-1.5 -ml-1.5 rounded-lg text-muted-foreground hover:text-foreground">
                  <ArrowLeft className="w-4 h-4" />
                </button>
              )}
              <button type="button" onClick={() => setNavStack([])}
                className={liveStack.length === 0 ? "font-medium" : "text-muted-foreground hover:text-foreground"}>
                Root
              </button>
              {liveStack.map((g, i) => (
                <React.Fragment key={g.id}>
                  <span className="text-muted-foreground/60">/</span>
                  <button type="button"
                    onClick={() => setNavStack((p) => p.slice(0, i + 1))}
                    className={i === liveStack.length - 1 ? "font-medium truncate max-w-[10rem]" : "text-muted-foreground hover:text-foreground truncate max-w-[8rem]"}>
                    {g.name || "Untitled"}
                  </button>
                </React.Fragment>
              ))}
            </div>

            {/* Root-level filter — the old tabs, as chips. */}
            {!current && (
              <div className="flex gap-1.5">
                {[["all", "All"], ["groups", "Groups"], ["subsystems", `Sub${t.systems}`]].map(([id, label]) => (
                  <button key={id} type="button" onClick={() => setRootFilter(id)}
                    aria-pressed={rootFilter === id}
                    className={`text-xs px-3 py-1.5 rounded-full border ${
                      rootFilter === id ? "border-primary/60 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground hover:text-foreground"
                    }`}>
                    {id === "subsystems" && <Crown className="w-3 h-3 inline-block mr-1 -mt-0.5" />}
                    {label}
                  </button>
                ))}
              </div>
            )}

            {stranded.size > 0 && !current && (
              <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                {stranded.size} group{stranded.size === 1 ? "" : "s"} had a broken or looping parent and {stranded.size === 1 ? "is" : "are"} shown at the top level.
              </p>
            )}

            {/* Current group header — what you're inside, and its owner. */}
            {current && (
              <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-border/60 bg-card">
                <GroupIcon group={current} boxed className="w-9 h-9" boxClassName="rounded-lg border border-border/40" />
                <span className="flex-1 min-w-0">
                  <span className="text-sm font-semibold truncate block">{current.emoji ? `${current.emoji} ` : ""}{current.name}</span>
                  <span className="text-[0.6875rem] text-muted-foreground truncate block">
                    {ownerAlter && <><Crown className="w-2.5 h-2.5 inline-block mr-0.5 -mt-0.5 text-amber-500" />{formatAlter(ownerAlter)} · </>}
                    {contentsLabel(current)}
                  </span>
                </span>
                <Button variant="outline" size="sm" onClick={() => setMembersFor(current)} className="gap-1.5 flex-shrink-0">
                  <Users className="w-3.5 h-3.5" /> {t.Alters}
                </Button>
                {rowMenu(current)}
              </div>
            )}

            {/* Subgroups at this level. */}
            {siblings.length > 0 && (
              <div>
                <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground mb-1 px-1 flex items-center gap-1">
                  <Folder className="w-3 h-3" /> Groups
                </p>
                <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
                  {siblings.map((g, i) => (
                    <GroupRow
                      key={g.id}
                      group={g}
                      t={t}
                      stranded={stranded.has(g.id)}
                      ownerLabel={g.owner_alter_id ? formatAlter(alterById[g.owner_alter_id] || { name: "?" }) : null}
                      contents={contentsLabel(g)}
                      selectMode={selectMode}
                      selected={selected.has(g.id)}
                      onSelect={() => setSelected((prev) => {
                        const next = new Set(prev);
                        if (next.has(g.id)) next.delete(g.id); else next.add(g.id);
                        return next;
                      })}
                      onOpen={() => setNavStack((p) => [...p, g.id])}
                      onRename={(name) => handleRename(g, name)}
                      canUp={i > 0}
                      canDown={i < siblings.length - 1}
                      onReorder={(dir) => handleReorder(g, dir)}
                      menu={rowMenu(g)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Members of the group you're inside — reorder and remove in
                place; adding goes through the full members editor. */}
            {current && (
              <div>
                <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground mb-1 px-1 flex items-center gap-1">
                  <Users className="w-3 h-3" /> {t.Alters}{members.length ? ` (${members.length})` : ""}
                </p>
                <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
                  {members.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">
                      No {t.alters} yet — tap "{t.Alters}" above to add some.
                    </p>
                  ) : members.map((a, i) => (
                    <div key={a.id} className="flex items-center gap-2 px-3 py-2 border-b border-border/30 last:border-0">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: dotColor(a.color) }} />
                      <button type="button" onClick={() => navigate(`/alter/${a.id}`)} className="flex-1 min-w-0 text-left">
                        <span className="text-sm truncate block">{formatAlter(a)}</span>
                      </button>
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        <button type="button" disabled={i === 0} onClick={() => handleMemberReorder(a.id, -1)}
                          aria-label={`Move ${a.name} up`}
                          className="w-7 h-7 flex items-center justify-center rounded-lg border border-border/40 text-muted-foreground hover:text-foreground disabled:opacity-30">
                          <ChevronUp className="w-3.5 h-3.5" />
                        </button>
                        <button type="button" disabled={i === members.length - 1} onClick={() => handleMemberReorder(a.id, 1)}
                          aria-label={`Move ${a.name} down`}
                          className="w-7 h-7 flex items-center justify-center rounded-lg border border-border/40 text-muted-foreground hover:text-foreground disabled:opacity-30">
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>
                        <button type="button" onClick={() => handleMemberRemove(a)}
                          aria-label={`Remove ${a.name} from this group`}
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {siblings.length === 0 && !current && (
              <p className="text-sm text-muted-foreground text-center py-10">
                {rootFilter === "subsystems"
                  ? `No sub${t.systems} yet — make one by giving a group a root ${t.alter}.`
                  : "No groups yet."}
              </p>
            )}
          </>
        )}
      </div>

      {/* Mass-edit action bar. */}
      {selectMode && (
        <div className="fixed inset-x-0 z-[60] px-4"
          style={{ bottom: "calc(var(--bottom-nav-height, 56px) + var(--os-sab) + 8px)" }}>
          <div className="os-page-shell flex items-center gap-2 rounded-2xl border border-border bg-background/95 backdrop-blur px-3 py-2 shadow-lg">
            <span className="text-sm font-medium flex-1">{selected.size} selected</span>
            <Button variant="outline" size="sm" disabled={!selected.size}
              onClick={() => setMovingIds([...selected])} className="gap-1">
              <FolderInput className="w-3.5 h-3.5" /> Move
            </Button>
            <Button variant="outline" size="sm" disabled={!selected.size}
              onClick={() => setColorIds([...selected])} className="gap-1">
              <Palette className="w-3.5 h-3.5" /> Colour
            </Button>
            <Button variant="outline" size="sm" disabled={!selected.size}
              onClick={() => handleDelete([...selected])}
              className="gap-1 text-destructive border-destructive/40 hover:bg-destructive/10">
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </Button>
          </div>
        </div>
      )}

      {/* Move — a searchable, indented picker rather than a drag target. */}
      {movingIds && (
        <div className="fixed inset-0 z-[70] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "calc(var(--bottom-nav-height, 56px) + var(--os-sab))" }}
          onClick={(e) => { if (e.target === e.currentTarget) setMovingIds(null); }}>
          <div className="bg-card w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-border p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold truncate">
                Move {movingIds.length === 1 ? `"${byId[movingIds[0]]?.name || "?"}"` : `${movingIds.length} groups`}
              </h2>
              <button type="button" onClick={() => setMovingIds(null)} aria-label="Close"
                className="p-1 text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <SearchableSelect
              value={movingIds.length === 1 ? (normalizeParent(byId[movingIds[0]]) || "") : ""}
              onChange={(id) => handleMove(movingIds, id || "")}
              options={moveOptions}
              placeholder="Choose where they go"
              searchPlaceholder="Search groups…"
              renderOption={(o) => (
                <span className={`flex items-center gap-1 ${o._blocked ? "opacity-40" : ""}`}
                  style={{ paddingLeft: (o._depth || 0) * 12 }}>
                  {(o._depth || 0) > 0 && <span className="text-muted-foreground">↳</span>}
                  <span className="truncate">{o.label}</span>
                  {o._blocked && <span className="text-[0.625rem] text-muted-foreground">(inside itself)</span>}
                </span>
              )}
            />
          </div>
        </div>
      )}

      {/* Colour — one group or the whole selection. */}
      {colorIds && (
        <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setColorIds(null); }}>
          <div className="bg-card rounded-2xl border border-border p-4 space-y-2">
            <ColorPicker
              label={colorIds.length === 1 ? `${byId[colorIds[0]]?.name || "Group"} colour` : `Colour for ${colorIds.length} groups`}
              value={(colorIds.length === 1 && byId[colorIds[0]]?.color) || "#6b7280"}
              onChange={(c) => handleColor(colorIds, c)}
              onClear={() => handleColor(colorIds, "")} />
            <Button variant="outline" size="sm" className="w-full" onClick={() => setColorIds(null)}>Done</Button>
          </div>
        </div>
      )}

      <CreateGroupModal
        open={createOpen}
        onClose={() => { setCreateOpen(false); refresh(); }}
        parentGroup={current}
      />
      <ManageMembersModal
        group={membersFor}
        allAlters={alters}
        open={!!membersFor}
        onClose={() => { setMembersFor(null); refresh(); }}
      />
    </div>
  );
}
