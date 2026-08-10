// Manage groups — rebuilt.
//
// The old page (a base44 leftover) split groups and subsystems into two
// tabs, could only nest the first kind, and moved things by drag-and-drop,
// which is unusable on a phone. Nesting rules lived in three files with
// three different cycle guards.
//
// This is ONE tree. A subsystem is just a group an alter owns, so it sits in
// the same list wearing its owner's name, and nests exactly like anything
// else. Every action is reachable by tap — no drag required — so the page
// works the same on a phone and a desktop.
//
// Nesting rules come from src/lib/groupTree.js; membership writes go through
// src/lib/groupMembership.js. Neither is duplicated here.

import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus, Search, ChevronRight, Crown, Users, Pencil, Trash2,
  FolderInput, X, AlertTriangle,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { confirm } from "@/components/shared/ConfirmDialog";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import ColorPicker from "@/components/shared/ColorPicker";
import CreateGroupModal from "@/components/groups/CreateGroupModal";
import ManageMembersModal from "@/components/groups/ManageMembersModal";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import {
  flattenGroupTree, childGroups, wouldNest, normalizeParent, strandedGroups,
} from "@/lib/groupTree";
import { getMemberAlters } from "@/lib/subsystemUtils";

function GroupRow({
  group, depth, memberCount, ownerLabel, expandable, expanded,
  onToggle, onOpen, onRename, onMove, onMembers, onColor, onDelete, stranded, t,
}) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(group.name || "");

  const commitRename = () => {
    const next = draft.trim();
    setRenaming(false);
    if (next && next !== group.name) onRename(group, next);
    else setDraft(group.name || "");
  };

  return (
    <div
      className="flex items-center gap-1.5 py-1.5 pr-1 border-b border-border/30 last:border-0"
      style={{ paddingLeft: Math.min(depth, 8) * 16 }}
    >
      <button
        type="button"
        onClick={expandable ? onToggle : undefined}
        aria-label={expandable ? (expanded ? "Collapse" : "Expand") : undefined}
        className={`w-5 h-5 flex items-center justify-center flex-shrink-0 ${
          expandable ? "text-muted-foreground hover:text-foreground" : "opacity-0 pointer-events-none"
        }`}
      >
        <ChevronRight
          className="w-3.5 h-3.5 transition-transform"
          style={{ transform: expanded ? "rotate(90deg)" : "none" }}
        />
      </button>

      <span
        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: group.color || "hsl(var(--muted))" }}
      />

      {renaming ? (
        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") { setDraft(group.name || ""); setRenaming(false); }
          }}
          className="h-7 text-sm flex-1 min-w-0"
        />
      ) : (
        <button type="button" onClick={onOpen} className="flex-1 min-w-0 text-left">
          <span className="text-sm truncate block">
            {group.name || "Untitled group"}
            {stranded && (
              <AlertTriangle className="w-3 h-3 inline-block ml-1 text-amber-500" aria-label="Was buried — moved to the top" />
            )}
          </span>
          <span className="text-[0.6875rem] text-muted-foreground truncate block">
            {ownerLabel && <><Crown className="w-2.5 h-2.5 inline-block mr-0.5 -mt-0.5" />{ownerLabel} · </>}
            {memberCount} {memberCount === 1 ? t.alter : t.alters}
          </span>
        </button>
      )}

      {/* Every action is a tap target — the old page needed drag-and-drop to
          move anything, which simply doesn't work on a phone. */}
      <div className="flex items-center gap-0.5 flex-shrink-0">
        <button type="button" onClick={() => { setDraft(group.name || ""); setRenaming(true); }}
          aria-label={`Rename ${group.name}`} title="Rename"
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground">
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={onMove}
          aria-label={`Move ${group.name}`} title="Move into another group"
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground">
          <FolderInput className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={onMembers}
          aria-label={`Manage members of ${group.name}`} title={`Manage ${t.alters}`}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground">
          <Users className="w-3.5 h-3.5" />
        </button>
        <div className="hidden sm:block">
          <ColorPicker compact label={`${group.name} colour`}
            value={group.color || "#6b7280"}
            onChange={onColor}
            onClear={() => onColor("")} />
        </div>
        <button type="button" onClick={onDelete}
          aria-label={`Delete ${group.name}`} title="Delete"
          className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

export default function GroupsManager() {
  const t = useTerms();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const formatAlter = useAlterLabel();

  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [createOpen, setCreateOpen] = useState(false);
  const [createParent, setCreateParent] = useState(null);
  const [movingGroup, setMovingGroup] = useState(null);
  const [membersFor, setMembersFor] = useState(null);
  const [colorFor, setColorFor] = useState(null);

  React.useEffect(() => {
    if (!movingGroup && !colorFor) return undefined;
    const onKey = (e) => { if (e.key === "Escape") { setMovingGroup(null); setColorFor(null); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [movingGroup, colorFor]);

  const { data: groups = [] } = useQuery({ queryKey: ["groups"], queryFn: () => base44.entities.Group.list() });
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  const alterById = useMemo(() => Object.fromEntries(alters.map((a) => [a.id, a])), [alters]);

  const stranded = useMemo(() => new Set(strandedGroups(groups).map((g) => g.id)), [groups]);

  // Searching flattens the tree: when you're looking for a group you want to
  // find it, not navigate to it.
  const needle = query.trim().toLowerCase();
  const rows = useMemo(() => {
    const flat = flattenGroupTree(groups);
    if (needle) {
      return flat
        .filter((g) => (g.name || "").toLowerCase().includes(needle))
        .map((g) => ({ ...g, _depth: 0 }));
    }
    // Hide anything under a collapsed ancestor.
    const hidden = new Set();
    const out = [];
    for (const g of flat) {
      const parent = normalizeParent(g);
      if (parent && hidden.has(parent)) { hidden.add(g.id); continue; }
      out.push(g);
      if (collapsed.has(g.id)) hidden.add(g.id);
    }
    return out;
  }, [groups, needle, collapsed]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["groups"] });
    qc.invalidateQueries({ queryKey: ["alters"] });
  };

  const handleRename = async (group, name) => {
    try {
      await base44.entities.Group.update(group.id, { name });
      refresh();
    } catch (e) { toast.error(e.message || "Couldn't rename that"); }
  };

  const handleColor = async (group, color) => {
    try {
      await base44.entities.Group.update(group.id, { color });
      refresh();
    } catch (e) { toast.error(e.message || "Couldn't change the colour"); }
  };

  const handleMove = async (group, targetId) => {
    if (wouldNest(groups, group.id, targetId)) {
      toast.error("That would put the group inside itself");
      return;
    }
    try {
      await base44.entities.Group.update(group.id, { parent: targetId || "" });
      refresh();
      setMovingGroup(null);
      toast.success(targetId ? "Moved" : "Moved to the top level");
    } catch (e) { toast.error(e.message || "Couldn't move that"); }
  };

  const handleDelete = async (group) => {
    const kids = childGroups(groups, group.id);
    const ok = await confirm({
      title: `Delete "${group.name}"?`,
      body: kids.length
        ? `Its ${kids.length} nested group${kids.length === 1 ? "" : "s"} move to the top level. No ${t.alters} are deleted — they just stop being in this group.`
        : `No ${t.alters} are deleted — they just stop being in this group.`,
      confirmLabel: "Delete", destructive: true,
    });
    if (!ok) return;
    try {
      // Re-home the children FIRST, so a failure can't strand them under a
      // group that no longer exists.
      for (const kid of kids) await base44.entities.Group.update(kid.id, { parent: "" });
      await base44.entities.Group.delete(group.id);
      refresh();
      toast.success("Deleted");
    } catch (e) { toast.error(e.message || "Couldn't delete that"); }
  };

  // Move targets: the whole tree, indented, with anything that would create a
  // loop greyed out — the house rule for hierarchies (never a bare select).
  const moveOptions = useMemo(() => {
    if (!movingGroup) return [];
    return [
      { id: "", label: "Top level", _depth: 0 },
      ...flattenGroupTree(groups)
        .filter((g) => g.id !== movingGroup.id)
        .map((g) => ({
          id: g.id,
          label: g.name || "Untitled group",
          _depth: g._depth,
          _blocked: wouldNest(groups, movingGroup.id, g.id),
        })),
    ];
  }, [groups, movingGroup]);

  return (
    <div className="min-h-screen p-4 sm:p-6">
      <div className="os-page-shell space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Manage groups</h1>
            <p className="text-muted-foreground text-sm">
              Groups and sub{t.systems} together. Tap a name to open it.
            </p>
          </div>
          <Button onClick={() => { setCreateParent(null); setCreateOpen(true); }} className="gap-1.5">
            <Plus className="w-4 h-4" /> New group
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search groups…" className="h-9 pl-8 text-sm" />
        </div>

        {stranded.size > 0 && !needle && (
          <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
            {stranded.size} group{stranded.size === 1 ? "" : "s"} had a broken or looping parent and {stranded.size === 1 ? "is" : "are"} shown at the top level.
          </p>
        )}

        <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">
              {needle ? "No groups match that." : "No groups yet."}
            </p>
          ) : rows.map((g) => {
            const owner = g.owner_alter_id ? alterById[g.owner_alter_id] : null;
            const kids = childGroups(groups, g.id);
            return (
              <GroupRow
                key={g.id}
                group={g}
                depth={g._depth || 0}
                t={t}
                stranded={stranded.has(g.id)}
                ownerLabel={owner ? formatAlter(owner) : null}
                memberCount={getMemberAlters(g, alters).length}
                expandable={kids.length > 0 && !needle}
                expanded={!collapsed.has(g.id)}
                onToggle={() => setCollapsed((prev) => {
                  const next = new Set(prev);
                  if (next.has(g.id)) next.delete(g.id); else next.add(g.id);
                  return next;
                })}
                onOpen={() => navigate(`/group/${g.id}`)}
                onRename={handleRename}
                onMove={() => setMovingGroup(g)}
                onMembers={() => setMembersFor(g)}
                onColor={(c) => handleColor(g, c)}
                onDelete={() => handleDelete(g)}
              />
            );
          })}
        </div>
      </div>

      {/* Move — a searchable, indented picker rather than a drag target. */}
      {movingGroup && (
        <div className="fixed inset-0 z-[70] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          // Only a click on the backdrop ITSELF dismisses. React portals
          // propagate events through the React tree rather than the DOM, so
          // a plain onClick here also fires for clicks inside the picker's
          // portaled dropdown — which closed the dialog before the choice
          // could land, making "move" look like it did nothing.
          onClick={(e) => { if (e.target === e.currentTarget) setMovingGroup(null); }}>
          <div className="bg-card w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-border p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold truncate">Move "{movingGroup.name}"</h2>
              <button type="button" onClick={() => setMovingGroup(null)} aria-label="Close"
                className="p-1 text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <SearchableSelect
              value={normalizeParent(movingGroup) || ""}
              onChange={(id) => handleMove(movingGroup, id || "")}
              options={moveOptions}
              placeholder="Choose where it goes"
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

      {/* Colour on narrow screens, where the inline swatch is hidden. */}
      {colorFor && (
        <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setColorFor(null); }}>
          <div className="bg-card rounded-2xl border border-border p-4">
            <ColorPicker label={`${colorFor.name} colour`} value={colorFor.color || "#6b7280"}
              onChange={(c) => handleColor(colorFor, c)} onClear={() => handleColor(colorFor, "")} />
          </div>
        </div>
      )}

      <CreateGroupModal
        open={createOpen}
        onClose={() => { setCreateOpen(false); setCreateParent(null); refresh(); }}
        parentGroup={createParent}
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
