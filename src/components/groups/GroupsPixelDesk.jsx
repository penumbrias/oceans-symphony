// Groups in the pixel look — the "Groups" desktop board: the whole group tree
// down the left (drag a group onto another to nest it), and the chosen
// group's page on the right (header with Info · Edit page · ⋯, its pages as
// tabs, and About / Members / Nested groups / Latest on its board / Notes as
// panels). "Manage" swaps the main area for the full manager (reorder,
// rename, multi-select move / recolour / delete), so nothing the classic page
// does is lost.
//
// Rendering only: every write goes through the handlers GroupsManager passes
// in (which use src/lib/groupMembership.js), every tree walk through
// src/lib/groupTree.js, and the sections are GroupSections.jsx's own.
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import { MoreHorizontal, FolderTree, FolderInput, Users, Palette, Trash2, Pencil, ArrowLeft } from "lucide-react";
import { base44 } from "@/api/base44Client";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { promptText } from "@/components/shared/ConfirmDialog";
import { useTerms } from "@/lib/useTerms";
import { An } from "@/lib/articles";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { usePixelDesk } from "@/lib/uiLook";
import { flattenGroupTree, ancestorIds, childGroups } from "@/lib/groupTree";
import { getMemberAlters } from "@/lib/subsystemUtils";
import { isValidHexColor } from "@/lib/colorUtils";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { stripHtml } from "@/lib/globalSearch";
import { groupNotesKey, listGroupNotes } from "@/lib/groupNotes";
import {
  useGroupContext, useSubTerm, GroupBioSection, GroupBoardSection, GroupJournalSection, GroupNotesTab,
} from "@/components/groups/GroupSections";
import { PxPanel, PxTabs, useDeskHeight } from "@/components/pixel/PxDesk";
import "@/styles/pixel/groups.css";

const swatch = (c) => (isValidHexColor(c) ? c : undefined);
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

function GroupMark({ group, className = "pg-sq" }) {
  const src = useResolvedAvatarUrl(group?.avatar_url || null);
  return (
    <span className={className} style={{ background: swatch(group?.color) }} aria-hidden="true">
      {src ? <img src={src} alt="" /> : (className !== "pg-sq" && group?.emoji ? group.emoji : null)}
    </span>
  );
}

function AlterMark({ alter }) {
  const src = useResolvedAvatarUrl(alter?.avatar_url || null);
  return (
    <span className="pg-av" style={{ background: swatch(alter?.color) }} aria-hidden="true">
      {src ? <img src={src} alt="" /> : null}
    </span>
  );
}

// The ⋯ menu for one group: the same actions the manager's row menu has.
function GroupMenu({ group, t, actions, trigger }) {
  const navigate = useNavigate();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 z-[60]">
        <DropdownMenuItem onSelect={() => navigate(`/group/${group.id}`)} className="gap-2 cursor-pointer">
          <FolderTree className="w-4 h-4" /> Open profile
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => actions.rename(group)} className="gap-2 cursor-pointer">
          <Pencil className="w-4 h-4" /> Rename
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => actions.move([group.id])} className="gap-2 cursor-pointer">
          <FolderInput className="w-4 h-4" /> Move to…
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => actions.members(group)} className="gap-2 cursor-pointer">
          <Users className="w-4 h-4" /> Manage {t.alters}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => actions.color([group.id])} className="gap-2 cursor-pointer">
          <Palette className="w-4 h-4" /> Colour…
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => actions.remove([group.id])} className="gap-2 cursor-pointer text-destructive focus:text-destructive">
          <Trash2 className="w-4 h-4" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// The chosen group's page.
function GroupPage({ group, onSelectGroup, actions }) {
  const t = useTerms();
  const navigate = useNavigate();
  const formatAlter = useAlterLabel();
  const subTerm = useSubTerm();
  const { alters, ownerAlter, parentGroup, members, childGroups: kids } = useGroupContext(group);
  const [tab, setTab] = useState("profile");
  useEffect(() => { setTab("profile"); }, [group.id]);

  const { data: bulletins = [] } = useQuery({
    queryKey: ["bulletins", "all"],
    queryFn: () => base44.entities.Bulletin.list("-created_date"),
  });
  const latest = useMemo(() => bulletins.find((b) => b.group_id === group.id) || null, [bulletins, group.id]);
  const { data: notes = [] } = useQuery({ queryKey: groupNotesKey(group.id), queryFn: () => listGroupNotes(group.id) });
  const alterById = useMemo(() => Object.fromEntries(alters.map((a) => [a.id, a])), [alters]);
  const latestAuthor = latest ? alterById[latest.author_alter_id || latest.author_alter_ids?.[0]] : null;
  const latestWhen = latest && (latest.created_date || latest.timestamp);

  const sub = (
    <>
      {ownerAlter && <>{cap(subTerm)}  ·  root: <button type="button" onClick={() => navigate(`/alter/${ownerAlter.id}`)}>{formatAlter(ownerAlter)}</button></>}
      {!ownerAlter && <>{members.length} {members.length === 1 ? t.alter : t.alters}</>}
      {parentGroup && <>  ·  inside <button type="button" onClick={() => onSelectGroup(parentGroup.id)}>{parentGroup.name}</button></>}
    </>
  );

  const profile = (
    <div className="pg-cols">
      <div className="pg-col">
        <PxPanel title="About">
          <div className="pg-text pg-about"><GroupBioSection group={group} /></div>
        </PxPanel>
        <PxPanel className="pg-grow" title={t.Alters}
          actions={<>
            <span className="pg-count">{members.length}</span>
            <button type="button" className="pg-btn sm" onClick={() => actions.members(group)}>Choose {t.alters}</button>
          </>}>
          {members.length === 0 ? (
            <p className="pg-empty">No {t.alters} yet — choose some to add them.</p>
          ) : (
            <div className="pg-members">
              {members.map((m) => (
                <button key={m.id} type="button" className="pg-member pg-sunk" onClick={() => navigate(`/alter/${m.id}`)}>
                  <AlterMark alter={m} />
                  <span className="pg-member-text">
                    <span>{formatAlter(m)}</span>
                    {(m.role || m.pronouns) && <span className="sub">{m.role || m.pronouns}</span>}
                  </span>
                  {ownerAlter?.id === m.id && <span className="pg-root">root</span>}
                </button>
              ))}
            </div>
          )}
        </PxPanel>
      </div>
      <div className="pg-col">
        <PxPanel title="Nested groups"
          actions={<button type="button" className="pg-ttl-link" onClick={() => actions.create(group)}>+ nest</button>}>
          {kids.length === 0 ? (
            <p className="pg-empty">None yet.</p>
          ) : (
            <div className="pg-lines">
              {kids.map((k) => {
                const n = getMemberAlters(k, alters).length;
                return (
                  <button key={k.id} type="button" className="pg-line" onClick={() => onSelectGroup(k.id)}>
                    <GroupMark group={k} />
                    <span className="pg-row-name">{k.emoji ? `${k.emoji} ` : ""}{k.name}</span>
                    <span className="end">{n} {n === 1 ? t.alter : t.alters}</span>
                  </button>
                );
              })}
            </div>
          )}
        </PxPanel>
        <PxPanel title="Latest on its board"
          actions={<button type="button" className="pg-ttl-link" onClick={() => setTab("board")}>Board</button>}>
          {latest ? (
            <button type="button" className="pg-text" style={{ textAlign: "left" }} onClick={() => setTab("board")}>
              <span className="flex items-center gap-2">
                {latestAuthor && <span className="pg-sq" style={{ background: swatch(latestAuthor.color) }} />}
                {latestAuthor && <b>{formatAlter(latestAuthor)}</b>}
                {latestWhen && <span className="pg-count">{formatDistanceToNowStrict(new Date(latestWhen), { addSuffix: true })}</span>}
              </span>
              <span className="block mt-1 line-clamp-3">{stripHtml(latest.content || "")}</span>
            </button>
          ) : (
            <p className="pg-empty">Nothing posted on its board yet.</p>
          )}
        </PxPanel>
        <PxPanel className="pg-grow" title="Notes" actions={<span className="pg-count">{notes.length}</span>}>
          <div className="pg-embed pg-notes"><GroupNotesTab groupId={group.id} /></div>
        </PxPanel>
      </div>
    </div>
  );

  return (
    <div className="pg-main">
      <PxPanel className="pg-head" as="header">
        <GroupMark group={group} className="pg-head-av" />
        <div className="pg-head-text">
          <h2 className="pg-head-name">{group.name || "Untitled group"}</h2>
          <p className="pg-head-sub">{sub}</p>
        </div>
        <div className="pg-head-btns">
          <button type="button" className="pg-btn tall" title="Its name, picture, description and settings"
            onClick={() => navigate(`/group/${group.id}`, { state: { pxOpen: "info" } })}>Info</button>
          <button type="button" className="pg-btn tall" title="Edit page — move, resize and add widgets"
            onClick={() => navigate(`/group/${group.id}`, { state: { pxOpen: "layout" } })}>Edit page</button>
          <GroupMenu group={group} t={t} actions={actions}
            trigger={<button type="button" className="pg-btn tall" aria-label={`More actions for ${group.name}`}><MoreHorizontal className="w-4 h-4" /></button>} />
        </div>
      </PxPanel>
      <PxTabs label="Group pages" value={tab} onChange={setTab}
        tabs={[{ id: "profile", label: "Profile" }, { id: "board", label: "Board" }, { id: "journal", label: "Journal" }, { id: "notes", label: "Notes" }]} />
      <div className="pg-body">
        {tab === "profile" && profile}
        {tab === "board" && <PxPanel className="pg-full" title="Board"><div className="pg-embed"><GroupBoardSection group={group} /></div></PxPanel>}
        {tab === "journal" && <PxPanel title="Journal"><div className="pg-embed"><GroupJournalSection group={group} /></div></PxPanel>}
        {tab === "notes" && <PxPanel title="Notes" actions={<span className="pg-count">{notes.length}</span>}><div className="pg-embed pg-notes"><GroupNotesTab groupId={group.id} /></div></PxPanel>}
      </div>
    </div>
  );
}

export default function GroupsPixelDesk({
  groups, alters, byId, stranded, managerBody, onRename, onMovePick, onMoveTo, onDelete, onColor, onMembers, onCreate, initialGroupId,
}) {
  const desk = usePixelDesk();
  const subTerm = useSubTerm();
  const [deskRef, height] = useDeskHeight();
  const [manage, setManage] = useState(false);
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [selId, setSelId] = useState(initialGroupId || null);
  const [dragId, setDragId] = useState(null);
  const [dropId, setDropId] = useState(null);

  const tree = useMemo(() => flattenGroupTree(groups, { sort: "order" }), [groups]);
  const hasKids = useMemo(() => {
    const s = new Set();
    for (const g of groups) if (childGroups(groups, g.id).length) s.add(g.id);
    return s;
  }, [groups]);

  // On the desk something is always open: the first group.
  const selected = selId ? byId[selId] : null;
  useEffect(() => {
    if (desk && !selected && tree.length) setSelId(tree[0].id);
  }, [desk, selected, tree]);

  const needle = query.trim().toLowerCase();
  const rows = useMemo(() => {
    if (needle) return tree.filter((g) => (g.name || "").toLowerCase().includes(needle)).map((g) => ({ ...g, _depth: 0 }));
    return tree.filter((g) => !ancestorIds(g, byId).some((id) => collapsed.has(id)));
  }, [tree, needle, collapsed, byId]);

  const toggle = (id) => setCollapsed((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const select = (id) => {
    setManage(false);
    setSelId(id);
    // Opening a nested group from its parent unfolds the path to it.
    const g = byId[id];
    if (g) setCollapsed((prev) => {
      const anc = ancestorIds(g, byId);
      if (!anc.some((a) => prev.has(a))) return prev;
      const next = new Set(prev);
      anc.forEach((a) => next.delete(a));
      return next;
    });
  };

  const actions = {
    rename: async (g) => {
      const name = (await promptText({ title: "Rename group", defaultValue: g.name || "" }))?.trim();
      if (name && name !== g.name) onRename(g, name);
    },
    move: (ids) => onMovePick(ids),
    members: (g) => onMembers(g),
    color: (ids) => onColor(ids),
    remove: (ids) => onDelete(ids),
    create: (parent) => onCreate(parent),
  };

  const drop = (targetId) => {
    const id = dragId;
    setDragId(null); setDropId(null);
    if (!id || id === targetId) return;
    onMoveTo([id], targetId);
  };

  const side = (
    <PxPanel as="aside" className="pg-side" title="Groups"
      actions={<>
        <button type="button" className="pg-btn sm" data-tour="groups-new-btn" onClick={() => actions.create(null)}>+ group</button>
        <button type="button" className="pg-btn sm" aria-pressed={manage} onClick={() => setManage((v) => !v)}>Manage</button>
      </>}>
      <div className="pg-pad">
        <label className="pg-input">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search all groups…" aria-label="Search all groups" />
        </label>
      </div>
      <div className="pg-list"
        onDragOver={(e) => { if (dragId && e.target === e.currentTarget) { e.preventDefault(); setDropId(""); } }}
        onDrop={(e) => { if (e.target === e.currentTarget) { e.preventDefault(); drop(""); } }}>
        {rows.length === 0 && <p className="pg-empty">{needle ? "No groups match that." : "No groups yet."}</p>}
        {rows.map((g) => {
          const n = getMemberAlters(g, alters).length;
          const kids = hasKids.has(g.id);
          return (
            <div key={g.id}
              className={`pg-row${(!manage && selected?.id === g.id) ? " sel" : ""}${dropId === g.id ? " drop" : ""}`}
              style={{ paddingLeft: 6 + (g._depth || 0) * 16 }}
              draggable={desk && !needle}
              onDragStart={(e) => { setDragId(g.id); e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", g.id); } catch { /* ignore */ } }}
              onDragEnd={() => { setDragId(null); setDropId(null); }}
              onDragOver={(e) => { if (dragId && dragId !== g.id) { e.preventDefault(); setDropId(g.id); } }}
              onDragLeave={() => setDropId((d) => (d === g.id ? null : d))}
              onDrop={(e) => { e.preventDefault(); drop(g.id); }}>
              {kids && !needle ? (
                <button type="button" className="pg-row-arrow" onClick={() => toggle(g.id)}
                  aria-expanded={!collapsed.has(g.id)} aria-label={`${collapsed.has(g.id) ? "Open" : "Fold"} ${g.name}`}>
                  {collapsed.has(g.id) ? ">" : "v"}
                </button>
              ) : <span className="pg-row-arrow" />}
              <button type="button" className="flex items-center gap-2 flex-1 min-w-0 self-stretch text-left" onClick={() => select(g.id)}
                aria-current={selected?.id === g.id ? "true" : undefined}>
                <GroupMark group={g} />
                <span className="pg-row-name">{g.emoji ? `${g.emoji} ` : ""}{g.name || "Untitled group"}</span>
                {g.owner_alter_id && <span className="pg-row-tag">{cap(subTerm)}</span>}
                <span className="pg-row-num">{n}</span>
              </button>
            </div>
          );
        })}
      </div>
      {stranded.size > 0 && (
        <p className="pg-warn">{stranded.size} group{stranded.size === 1 ? "" : "s"} had a broken or looping parent and {stranded.size === 1 ? "is" : "are"} shown at the top.</p>
      )}
      <p className="pg-foot">
        {desk ? "Drag a group onto another to nest it, or onto the empty list to bring it to the top. " : ""}
        {An(subTerm)} has its own root.
      </p>
    </PxPanel>
  );

  const manageView = (
    <PxPanel className="pg-main pg-manage" title="Manage groups"
      actions={<button type="button" className="pg-btn sm" onClick={() => setManage(false)}>Done</button>}>
      <div className="pg-body">{managerBody}</div>
    </PxPanel>
  );

  if (!desk) {
    // Phone: the list, or one group's page with a way back.
    if (manage) {
      return (
        <div className="pg-phone" data-tour="groups-page">
          <button type="button" className="pg-back" onClick={() => setManage(false)}><ArrowLeft className="w-4 h-4" /> Groups</button>
          {manageView}
        </div>
      );
    }
    if (selected) {
      return (
        <div className="pg-phone" data-tour="groups-page">
          <button type="button" className="pg-back" onClick={() => setSelId(null)}><ArrowLeft className="w-4 h-4" /> Groups</button>
          <GroupPage group={selected} onSelectGroup={select} actions={actions} />
        </div>
      );
    }
    return <div className="pg-phone" data-tour="groups-page">{side}</div>;
  }

  return (
    <div ref={deskRef} className="pg-desk groups" data-tour="groups-page" style={height ? { height } : undefined}>
      {side}
      {manage ? manageView : selected ? (
        <GroupPage group={selected} onSelectGroup={select} actions={actions} />
      ) : (
        <PxPanel className="pg-main" title="Groups"><p className="pg-empty">Make a group with “+ group”.</p></PxPanel>
      )}
    </div>
  );
}
