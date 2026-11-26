// The house's Groups room: board 26-Groups drawn by the house itself on
// /groups and /group/:id. On a computer: the whole group tree down the
// left (search, + group, Manage, drag a group onto another to nest it), and
// the chosen group's page beside it (header with Info · Edit page · ⋯, its
// pages as tabs, and About / Members / Nested groups / Latest on its board
// / Notes as panels). On a phone: the tree, then one group's page with
// Back · name · Info · ⋯ in the frame's header. House mode only: the
// frames draw it (houseGroupsRoom); the old pages are gated off
// (HouseRoomGate) and stay exactly as they were with the new house off.
//
// Nothing the old pages did is lost:
//   - Manage (?view=manage) is the old Manage groups page (multi-select
//     move / recolour / delete, reorder a level, member order and remove),
//     inside the room;
//   - Info (?view=info) and the person's own layout (?view=layout, and
//     Edit page) mount the old group page as it is, with its form, board,
//     look and song; every old ?tab= lands on the page that holds it now.
//
// Writes, all through the existing paths:
//   - a group's own record: src/lib/groupEntry.js (rename, colour, move /
//     nest, delete into one trash batch) — shared with the old manager;
//   - membership: GroupMembersModal → groupMembership.js;
//   - a new group: CreateGroupModal;
//   - notes: src/lib/groupNotes.js (the shared grammar: saveGroupNote);
//   - the board, journal and fronting pages are the old sections.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import {
  ChevronDown, ChevronRight, Plus, Users, FolderInput, Palette, Pencil, LayoutGrid, PencilLine, IdCard,
  FolderTree, Trash2, BarChart3, ListChecks, ArrowLeft,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { HouseScope } from "@/house/tokens/HouseRoot";
import { Button, IconButton } from "@/house/kit/Button";
import { Panel, PageTabs } from "@/house/kit/Panel";
import { TextField, AuthoredField } from "@/house/kit/Field";
import { NestedPicker, ColourField } from "@/house/kit/Pickers";
import Menu from "@/house/kit/Menu";
import { Sheet, ConfirmSheet } from "@/house/kit/Sheet";
import { EmptyBlock, LoadingBlock } from "@/house/kit/States";
import { showToast, trashWithUndo } from "@/house/kit/Toast";
import { useRoomTools } from "@/house/frame/roomTools";
import { useTerms } from "@/lib/useTerms";
import { An } from "@/lib/articles";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { isValidHexColor } from "@/lib/colorUtils";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { indexGroups, strandedGroups, resolvedParentId } from "@/lib/groupTree";
import { renameGroup, setGroupsColour, moveGroups, deleteGroups } from "@/lib/groupEntry";
import { groupNotesKey, listGroupNotes, saveGroupNote, deleteGroupNote } from "@/lib/groupNotes";
import { isLogCommandError } from "@/lib/authoredText";
import { stripHtml } from "@/lib/globalSearch";
import { useRegisterLookSubject, openProfileLook } from "@/lib/lookSubject";
import { useLookDefaults, withLookDefaults } from "@/lib/profileLookDefaults";
import { setPageWaveOverride } from "@/lib/pageWaveOverride";
import { hasAnySong } from "@/lib/soundManager";
import { PS } from "@/lib/profileStyle";
import { BoardSubjectContext } from "@/lib/boardSubject";
import { htmlToBlocks } from "@/components/shared/BlockEditor";
import SimplePreview from "@/components/shared/SimplePreview";
import RichText from "@/components/shared/RichText";
import ProfileSongPlayer from "@/components/alters/ProfileSongPlayer";
import CreateGroupModal from "@/components/groups/CreateGroupModal";
import GroupMembersModal from "@/components/groups/GroupMembersModal";
import { GroupBoardSection, GroupJournalSection } from "@/components/groups/GroupSections";
import { GroupFrontingWidget } from "@/v2/gardenGroupWidgets";
import GroupProfile from "@/pages/GroupProfile";
import GroupsManager from "@/pages/GroupsManager";
import { SquareAvatar } from "@/house/alters/AlterParts";
import {
  groupsRoomOf, groupIdOf, findGroup, groupPageOf, groupHref, GROUP_TABS, treeRows, moveTargets, canDrop,
  cap, subTermOf, headerLine, countWords, memberCount, visibleMembers, nestedOf, latestPost, shortDate,
} from "@/house/groups/groupsModel";
import "@/house/kit/kit.css";
import "@/house/kit/panels.css";
import "@/house/alters/alters.css";
import "@/house/groups/groups.css";

const swatch = (c) => (isValidHexColor(c) ? c : "var(--house-title)");

function GroupSquare({ group, size = "sm" }) {
  const url = useResolvedAvatarUrl(size === "sm" ? null : group?.avatar_url || null);
  return (
    <span className={`hgr-sq hgr-sq--${size}`} style={{ background: swatch(group?.color) }} aria-hidden="true">
      {url ? <img src={url} alt="" draggable={false} /> : size !== "sm" && group?.emoji ? <span className="hgr-sq-emoji">{group.emoji}</span> : null}
    </span>
  );
}

export default function HouseGroups({ size = "full", tokens }) {
  const phone = size === "phone";
  const t = useTerms();
  const formatAlter = useAlterLabel();
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();

  // ── Records (the old pages' keys, so both houses share the cache) ──
  const { data: groups = [], isLoading } = useQuery({ queryKey: ["groups"], queryFn: () => base44.entities.Group.list() });
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  const { data: bulletins = [] } = useQuery({ queryKey: ["bulletins", "all"], queryFn: () => base44.entities.Bulletin.list("-created_date") });
  const byId = useMemo(() => indexGroups(groups), [groups]);
  const alterById = useMemo(() => Object.fromEntries(alters.map((a) => [a.id, a])), [alters]);
  const stranded = useMemo(() => strandedGroups(groups), [groups]);
  const refresh = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["groups"] });
    qc.invalidateQueries({ queryKey: ["alters"] });
  }, [qc]);

  // ── Which group, which page (the address) ──
  const kind = groupsRoomOf(location.pathname);
  const q = new URLSearchParams(location.search);
  const routeId = kind === "group" ? groupIdOf(location.pathname) : q.get("group");
  const page = groupPageOf(location.search);
  const manage = page === "manage";
  const oldView = page === "info" || page === "layout";
  // On a computer something is always open: the first group in the tree.
  const rowsAll = useMemo(() => treeRows(groups), [groups]);
  const picked = findGroup(groups, routeId) || (!phone && !routeId && !manage ? rowsAll[0]?.g || null : null);

  const openGroup = useCallback((id, nextPage = "profile") => {
    // A computer swaps the one open group (one place in the history); a
    // phone steps into it, so Back comes out again.
    navigate(groupHref(id, nextPage), { replace: !phone });
  }, [navigate, phone]);
  const setPage = useCallback((next) => {
    if (!picked) return;
    if (next === "info" || next === "layout") {
      navigate(groupHref(picked.id, next), { state: { pxOpen: next } });
      return;
    }
    navigate(groupHref(picked.id, next), { replace: true });
  }, [picked, navigate]);
  const openManage = useCallback(() => navigate("/groups?view=manage"), [navigate]);
  const closeManage = useCallback(() => {
    if ((window.history.state?.idx ?? 0) > 0) navigate(-1); else navigate("/groups", { replace: true });
  }, [navigate]);

  // ── The tree ──
  const [query, setQuery] = useState("");
  const [folded, setFolded] = useState(() => new Set());
  const rows = useMemo(() => treeRows(groups, { folded, query }), [groups, folded, query]);
  // Opening a nested group unfolds the path to it.
  useEffect(() => {
    if (!picked) return;
    setFolded((prev) => {
      let next = prev;
      let p = resolvedParentId(picked, byId);
      const seen = new Set();
      while (p && !seen.has(p)) {
        seen.add(p);
        if (next.has(p)) { if (next === prev) next = new Set(prev); next.delete(p); }
        p = resolvedParentId(byId[p], byId);
      }
      return next;
    });
  }, [picked?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sheets ──
  const [createParent, setCreateParent] = useState(undefined); // undefined = closed, null = top level
  const [membersFor, setMembersFor] = useState(null);
  const [renaming, setRenaming] = useState(null);
  const [nameDraft, setNameDraft] = useState("");
  const [moving, setMoving] = useState(null);
  const [moveTo, setMoveTo] = useState("");
  const [colouring, setColouring] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const fail = (e, words) => showToast({ tone: "failed", message: words, detail: e?.message || "Nothing was changed." });
  const doRename = async () => {
    try { await renameGroup(renaming, nameDraft); refresh(); setRenaming(null); }
    catch (e) { fail(e, "Couldn't rename that."); }
  };
  const doMove = async (ids, targetId) => {
    try {
      await moveGroups(groups, ids, targetId);
      refresh();
      setMoving(null);
      const g = byId[ids[0]];
      showToast({ message: targetId ? `${g?.name || "The group"} is now inside ${byId[targetId]?.name || "that group"}.` : `${g?.name || "The group"} is at the top level.` });
    } catch (e) { fail(e, "Couldn't move that."); }
  };
  const doColour = async (c) => {
    if (!colouring) return;
    try { await setGroupsColour([colouring.id], c); refresh(); }
    catch (e) { fail(e, "Couldn't change the colour."); }
  };
  const doDelete = async () => {
    const g = deleting;
    await deleteGroups(groups, [g.id]);
    refresh();
    setDeleting(null);
    showToast({ message: `${g.name || "The group"} moved to trash.`, detail: `No ${t.alters} were deleted. Find it in Recent changes.` });
    if (picked?.id === g.id) navigate("/groups", { replace: true });
  };

  // ── Drag a group onto another to nest it (computer) ──
  const [dragId, setDragId] = useState(null);
  const [dropId, setDropId] = useState(null);
  const drop = (targetId) => {
    const id = dragId;
    setDragId(null); setDropId(null);
    if (canDrop(groups, id, targetId)) doMove([id], targetId);
  };

  // ── The look: Display options offers this group's look; its wave colours the header (the old page's rule) ──
  useRegisterLookSubject("group", picked, picked?.name);
  const lookCf = withLookDefaults(picked?.custom_fields, useLookDefaults("group"));
  const ownWave = lookCf[PS.THEME_WAVE];
  useEffect(() => {
    if (oldView) return undefined; // the old page paints its own
    const concrete = typeof ownWave === "string" && !/^var\(/.test(ownWave) ? ownWave : null;
    setPageWaveOverride(concrete);
    return () => setPageWaveOverride(null);
  }, [ownWave, oldView]);

  const groupMenu = (g) => (g ? [
    { id: "members", label: `Choose ${t.alters}`, icon: Users, onSelect: () => setMembersFor(g) },
    { id: "nest", label: "New group inside this one", icon: Plus, onSelect: () => setCreateParent(g) },
    { id: "rename", label: "Rename", icon: Pencil, onSelect: () => { setNameDraft(g.name || ""); setRenaming(g); } },
    { id: "move", label: "Move to…", icon: FolderInput, onSelect: () => { setMoveTo(resolvedParentId(g, byId) || ""); setMoving(g); } },
    { id: "colour", label: "Colour…", icon: Palette, onSelect: () => setColouring(g) },
    { id: "style", label: "Profile style", icon: Palette, onSelect: openProfileLook },
    { id: "fronting", label: `${t.Fronting} page`, icon: BarChart3, onSelect: () => setPage("fronting") },
    { id: "layout", label: "Your own layout", icon: LayoutGrid, onSelect: () => setPage("layout") },
    { id: "manage", label: "Manage all groups", icon: ListChecks, onSelect: openManage },
    { id: "delete", label: `Delete ${g.name || "this group"}`, icon: Trash2, danger: true, onSelect: () => setDeleting(g) },
  ] : []);

  // ── The phone's header: Info · ⋯ on a group; + and ⋯ on the tree ──
  const tools = useMemo(() => {
    if (!phone) return null;
    if (picked && !manage) {
      return {
        info: oldView ? { label: "Done", pressed: true, onSelect: () => setPage("profile") } : { label: "Info", ariaLabel: `Info: ${picked.name}`, tour: "groups-info", onSelect: () => setPage("info") },
        items: [{ id: "edit-page", label: "Edit page", icon: PencilLine, onSelect: () => setPage("layout") }, ...groupMenu(picked)],
      };
    }
    return {
      info: manage ? null : { label: "+", ariaLabel: "New group", tour: "groups-new-btn", onSelect: () => setCreateParent(null) },
      items: [
        { id: "new", label: "New group", icon: Plus, onSelect: () => setCreateParent(null) },
        manage ? { id: "done", label: "Back to the groups", icon: FolderTree, onSelect: closeManage } : { id: "manage", label: "Manage groups", icon: ListChecks, onSelect: openManage },
      ],
    };
  }, [phone, picked, manage, oldView, groups, t]); // eslint-disable-line react-hooks/exhaustive-deps
  useRoomTools(tools);

  const subTerm = subTermOf(t);

  // ── The tree panel ──
  const treeBody = (
    <div className="hgr-tree-body">
      <div className="hgr-find"><TextField label="Find" value={query} onChange={setQuery} placeholder="Search all groups…" type="search" /></div>
      {isLoading ? <LoadingBlock label="Loading groups" rows={4} /> : groups.length === 0 ? (
        <EmptyBlock compact title="No groups yet"
          body={`A group gathers ${t.alters} who belong together. A ${subTerm} is a group with its own root.`}
          action={{ label: "New group", icon: Plus, onClick: () => setCreateParent(null) }} />
      ) : (
        <ul className="hgr-tree" aria-label="Groups" data-tour="groups-tree" data-drop={dropId === "" || undefined}
          onDragOver={(e) => { if (dragId && e.target === e.currentTarget && canDrop(groups, dragId, "")) { e.preventDefault(); setDropId(""); } }}
          onDragLeave={(e) => { if (e.target === e.currentTarget) setDropId(null); }}
          onDrop={(e) => { if (e.target === e.currentTarget) { e.preventDefault(); drop(""); } }}>
          {rows.length === 0 ? <li className="hgr-empty">No groups match that.</li> : rows.map(({ g, depth, hasKids, open, path }) => {
            const sel = !manage && picked?.id === g.id;
            const n = memberCount(g, alters);
            return (
              <li key={g.id} className="hgr-row" data-selected={sel || undefined} data-drop={dropId === g.id || undefined}
                data-highlight-id={g.id} style={{ "--hgr-depth": depth }}
                draggable={!phone && !query}
                onDragStart={(e) => { setDragId(g.id); e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", g.id); } catch { /* ignore */ } }}
                onDragEnd={() => { setDragId(null); setDropId(null); }}
                onDragOver={(e) => { if (dragId && canDrop(groups, dragId, g.id)) { e.preventDefault(); e.stopPropagation(); setDropId(g.id); } }}
                onDragLeave={() => setDropId((d) => (d === g.id ? null : d))}
                onDrop={(e) => { e.preventDefault(); e.stopPropagation(); drop(g.id); }}>
                {hasKids
                  ? <IconButton icon={open ? ChevronDown : ChevronRight} label={`${open ? "Fold" : "Unfold"} ${g.name || "group"}`} aria-expanded={open}
                      className="hgr-arrow" onClick={() => setFolded((prev) => { const next = new Set(prev); if (next.has(g.id)) next.delete(g.id); else next.add(g.id); return next; })} />
                  : <span className="hgr-arrow" aria-hidden="true" />}
                <Button rank="quiet" className="hgr-pick" aria-current={sel || undefined} onClick={() => openGroup(g.id)}>
                  <GroupSquare group={g} />
                  <span className="hgr-name">
                    <span className="hgr-name-text">{g.emoji ? `${g.emoji} ` : ""}{g.name || "Untitled group"}</span>
                    {path ? <span className="hgr-path">{path}</span> : null}
                  </span>
                  {g.owner_alter_id ? <span className="hgr-tag">{cap(subTerm)}</span> : null}
                  <span className="hgr-count">{n}</span>
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {stranded.length ? (
        <p className="hgr-warn" role="note">{`${stranded.length} ${stranded.length === 1 ? "group" : "groups"} had a broken or looping parent and ${stranded.length === 1 ? "shows" : "show"} at the top.`}</p>
      ) : null}
    </div>
  );
  const treeFoot = (
    <p className="hgr-foot">{phone ? "" : "Drag a group onto another to nest it, or onto the empty list to bring it to the top. "}{`${An(subTerm)} has its own root.`}</p>
  );
  const treePanel = (
    <Panel className="hgr-side" headingLevel={2} title="Groups"
      tools={phone ? null : (
        <>
          <Button rank="secondary" data-tour="groups-new-btn" onClick={() => setCreateParent(null)}>+ group</Button>
          <Button rank="secondary" aria-pressed={manage} data-tour="groups-manage" onClick={manage ? closeManage : openManage}>Manage</Button>
        </>
      )}>
      {treeBody}
      {treeFoot}
    </Panel>
  );

  // ── The main area ──
  let main;
  if (manage) {
    main = (
      <Panel className="hgr-manage" headingLevel={2} title="Manage groups" tools={<Button rank="secondary" onClick={closeManage}>Done</Button>}>
        <div className="hgr-old" data-tour="groups-manage-view"><GroupsManager embedded /></div>
      </Panel>
    );
  } else if (!picked) {
    main = isLoading ? <LoadingBlock label="Loading groups" /> : routeId ? (
      <EmptyBlock title="This group isn't here" body="It may have been deleted. Deleted things wait in Recent changes."
        action={{ label: "Back to the groups", onClick: () => navigate("/groups", { replace: true }) }} />
    ) : (
      <Panel className="hgr-pn" title="Groups">
        <EmptyBlock title="Make a first group" body={`Gather ${t.alters} who belong together: a folder, a team, a place they share. Give it a root ${t.alter} and it becomes ${An(subTerm).toLowerCase()} of its own.`}
          action={{ label: "New group", icon: Plus, onClick: () => setCreateParent(null) }} />
      </Panel>
    );
  } else if (oldView) {
    main = (
      <div className="hgr-oldpage">
        <div className="hgr-oldbar" role="note">
          <span>{page === "info" ? `Info: ${picked.name}. Its name, picture, description and settings.` : `Your own layout for ${picked.name}, as you arranged it.`}</span>
          <Button rank="secondary" icon={ArrowLeft} onClick={() => setPage("profile")}>Back to this page</Button>
        </div>
        <div className="hgr-old">
          <Routes><Route path="/group/:id" element={<GroupProfile />} /></Routes>
        </div>
      </div>
    );
  } else {
    main = (
      <GroupPage key={picked.id} group={picked} groups={groups} alters={alters} alterById={alterById} bulletins={bulletins}
        page={page} setPage={setPage} phone={phone} terms={t} formatAlter={formatAlter} navigate={navigate}
        onPickGroup={(id) => openGroup(id)} onMembers={() => setMembersFor(picked)} onNest={() => setCreateParent(picked)}
        menuItems={groupMenu(picked)} />
    );
  }
  const song = picked && !oldView && !manage && hasAnySong(lookCf[PS.SONG]) ? <ProfileSongPlayer song={lookCf[PS.SONG]} /> : null;

  const sheets = (
    <>
      <CreateGroupModal open={createParent !== undefined} parentGroup={createParent || null}
        onClose={() => { setCreateParent(undefined); refresh(); }} />
      {membersFor ? <GroupMembersModal group={membersFor} allGroups={groups} isOpen onClose={() => { setMembersFor(null); refresh(); }} /> : null}
      <Sheet open={!!renaming} onClose={() => setRenaming(null)} title={`Rename ${renaming?.name || "group"}`} size="half" holdsTyping
        footer={<Button rank="primary" disabledReason={nameDraft.trim() ? undefined : "Give it a name first"} onClick={doRename}>Save</Button>}>
        <TextField label="Name" value={nameDraft} onChange={setNameDraft} maxLength={120} />
      </Sheet>
      <Sheet open={!!moving} onClose={() => setMoving(null)} title={`Move ${moving?.name || "group"}`} size="half"
        footer={<Button rank="primary" onClick={() => doMove([moving.id], moveTo || "")}>Save</Button>}>
        <NestedPicker label="Put it inside" value={moveTo} onChange={(v) => setMoveTo(v || "")} placeholder="Top level"
          options={moving ? moveTargets(groups, [moving.id]) : []} />
        <p className="hgr-hint">A group can't go inside itself or one of its own nested groups, so those aren't listed.</p>
      </Sheet>
      <Sheet open={!!colouring} onClose={() => setColouring(null)} title={`Colour of ${colouring?.name || "group"}`} size="half"
        footer={<Button rank="primary" onClick={() => setColouring(null)}>Done</Button>}>
        <ColourField label="Colour" value={byId[colouring?.id]?.color || ""} onChange={doColour} onClear={() => doColour("")} />
      </Sheet>
      <ConfirmSheet open={!!deleting} thing={deleting?.name || "this group"} onCancel={() => setDeleting(null)} onConfirm={doDelete}
        detail={deleting ? `${nestedOf(groups, deleting).length ? "Its nested groups move to the top level. " : ""}No ${t.alters} are deleted: they just leave the group.` : null} />
    </>
  );

  if (phone) {
    return (
      <HouseScope tokens={tokens} className="hgr hgr--phone" data-house-size="phone" data-groups-room="">
        {song}
        <div className="hgr-stack" data-tour="groups-page">
          {manage || picked || routeId ? main : treePanel}
        </div>
        {sheets}
      </HouseScope>
    );
  }

  return (
    <HouseScope tokens={tokens} className="hgr hgr--studio" data-house-size={size} data-groups-room="">
      {song}
      <aside className="hgr-left" aria-label="Groups" data-tour="groups-page">{treePanel}</aside>
      <section className="hgr-main" aria-label={picked ? picked.name : "Groups"}>{main}</section>
      {sheets}
    </HouseScope>
  );
}

// ── One group's page (board 26's right side) ─────────────────────────────
function GroupPage({ group, groups, alters, alterById, bulletins, page, setPage, phone, terms: t, formatAlter, navigate, onPickGroup, onMembers, onNest, menuItems }) {
  const members = visibleMembers(group, alters);
  const owner = group.owner_alter_id ? alterById[group.owner_alter_id] || null : null;
  const parent = findGroup(groups, resolvedParentId(group, indexGroups(groups)));
  const kids = nestedOf(groups, group);
  const latest = latestPost(bulletins, group);
  const latestAuthor = latest ? alterById[latest.author_alter_id || latest.author_alter_ids?.[0]] : null;
  const latestWhen = latest && (latest.created_date || latest.timestamp);
  const line = headerLine(group, { owner, parent, memberCount: members.length, terms: t, formatAlter });
  const label = group.name || "Untitled group";

  const head = (
    <section className="hgr-head" aria-label={`${label}: the group`}>
      <GroupSquare group={group} size="xl" />
      <div className="hgr-who">
        <h1 className="hgr-title house-label">{group.emoji ? `${group.emoji} ` : ""}{label}</h1>
        <span className="hgr-line">{line}</span>
      </div>
      {phone ? null : (
        <div className="hgr-head-tools">
          <span data-tour="groups-info"><Button rank="secondary" icon={IdCard} onClick={() => setPage("info")}>Info</Button></span>
          <span data-tour="group-profile-layout-btn"><Button rank="secondary" onClick={() => setPage("layout")}>Edit page</Button></span>
          <Menu label={`More for ${label}`} rank="secondary" items={menuItems} />
        </div>
      )}
    </section>
  );
  const TAB_WORDS = { profile: "Profile", board: "Board", journal: "Journal", notes: "Notes", fronting: t.Fronting };
  const tabs = [...GROUP_TABS, ...(GROUP_TABS.includes(page) ? [] : [page])].filter((id) => TAB_WORDS[id]).map((id) => ({ id, label: TAB_WORDS[id] }));
  const tabStrip = (
    <div className="hgr-tabs" data-tour="group-profile-tabs">
      <PageTabs label={`Pages of ${label}`} value={page} onChange={setPage} tabs={tabs} />
    </div>
  );

  const about = (
    <Panel key="about" className="hgr-pn" title="About" tools={<Button rank="quiet" onClick={() => setPage("info")}>edit</Button>}>
      {group.description ? (
        <div className="hgr-about"><SimplePreview blocks={htmlToBlocks(group.description)} onBlockChange={() => {}} readOnly scopeId={group.id} /></div>
      ) : <p className="hgr-empty">No description yet. Tap edit to write one.</p>}
    </Panel>
  );
  const memberCard = (a, root = false) => (
    <li key={a.id}>
      <Button rank="quiet" className="hgr-member" onClick={() => navigate(`/alter/${a.id}`)}>
        <SquareAvatar alter={a} size="md" />
        <span className="hgr-member-text">
          <span className="hgr-member-name" style={a.color ? { "--hgr-name": a.color } : undefined}>{formatAlter(a)}</span>
          {a.role || a.pronouns ? <span className="hgr-member-sub">{a.role || a.pronouns}</span> : null}
        </span>
        {root ? <span className="hgr-root">root</span> : null}
      </Button>
    </li>
  );
  const membersPanel = (
    <Panel key="members" className="hgr-pn hgr-grow" title={t.Alters}
      tools={<><span className="hgr-note">{members.length}</span><Button rank="secondary" data-tour="groups-members" onClick={onMembers}>{`Choose ${t.alters}`}</Button></>}>
      {members.length || owner ? (
        <ul className="hgr-members">
          {owner ? memberCard(owner, true) : null}
          {members.map((a) => memberCard(a))}
        </ul>
      ) : <p className="hgr-empty">{`No ${t.alters} yet. Choose some to add them.`}</p>}
    </Panel>
  );
  const nestedPanel = (
    <Panel key="nested" className="hgr-pn" title="Nested groups" tools={<Button rank="quiet" onClick={onNest}>+ nest</Button>}>
      {kids.length ? (
        <ul className="hgr-lines">
          {kids.map((k) => (
            <li key={k.id}>
              <Button rank="quiet" className="hgr-line-btn" onClick={() => onPickGroup(k.id)}>
                <GroupSquare group={k} />
                <span className="hgr-line-name">{k.emoji ? `${k.emoji} ` : ""}{k.name || "Untitled group"}</span>
                <span className="hgr-note">{countWords(memberCount(k, alters), t)}</span>
              </Button>
            </li>
          ))}
        </ul>
      ) : <p className="hgr-empty">None yet.</p>}
    </Panel>
  );
  const latestPanel = (
    <Panel key="latest" className="hgr-pn" title="Latest on its board" tools={<Button rank="quiet" onClick={() => setPage("board")}>Board</Button>}>
      {latest ? (
        <Button rank="quiet" className="hgr-post" onClick={() => setPage("board")}>
          <span className="hgr-post-top">
            {latestAuthor ? <span className="hgr-sq hgr-sq--sm" style={{ background: swatch(latestAuthor.color) }} aria-hidden="true" /> : null}
            {latestAuthor ? <b className="hgr-post-who">{formatAlter(latestAuthor)}</b> : null}
            {latestWhen ? <span className="hgr-note">{formatDistanceToNowStrict(new Date(latestWhen), { addSuffix: true })}</span> : null}
          </span>
          <span className="hgr-post-text">{stripHtml(latest.content || "").slice(0, 240)}</span>
        </Button>
      ) : <p className="hgr-empty">Nothing posted on its board yet.</p>}
    </Panel>
  );
  const notesPanel = (full) => <GroupNotes key="notes" group={group} terms={t} full={full} />;

  let body;
  if (page === "board") body = <Panel className="hgr-pn" title="Board"><div className="hgr-old"><GroupBoardSection group={group} /></div></Panel>;
  else if (page === "journal") body = <Panel className="hgr-pn" title="Journal"><div className="hgr-old"><GroupJournalSection group={group} /></div></Panel>;
  else if (page === "notes") body = notesPanel(true);
  else if (page === "fronting") {
    body = (
      <Panel className="hgr-pn" title={t.Fronting}>
        <div className="hgr-old"><BoardSubjectContext.Provider value={{ type: "group", id: group.id }}><GroupFrontingWidget settings={{}} mode="expanded" /></BoardSubjectContext.Provider></div>
      </Panel>
    );
  } else {
    body = phone ? (
      <div className="hgr-col">{about}{membersPanel}{nestedPanel}{latestPanel}{notesPanel(false)}</div>
    ) : (
      <div className="hgr-cols">
        <div className="hgr-col">{about}{membersPanel}</div>
        <div className="hgr-col">{nestedPanel}{latestPanel}{notesPanel(false)}</div>
      </div>
    );
  }

  return (
    <div className="hgr-page">
      {head}
      {tabStrip}
      <div className="hgr-body">{body}</div>
    </div>
  );
}

// ── The group's notes (board 26's Notes panel; the Notes page shows them all) ──
function GroupNotes({ group, terms, full }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const typed = useRef(false);
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  const { data: notes = [] } = useQuery({ queryKey: groupNotesKey(group.id), queryFn: () => listGroupNotes(group.id) });
  const refresh = () => qc.invalidateQueries({ queryKey: groupNotesKey(group.id) });
  const add = async () => {
    if (!text.trim() || saving) return;
    setSaving(true);
    try {
      // Notes show as plain text, so ~commands become "icon label" tokens (the old tab's rule).
      const row = await saveGroupNote({ groupId: group.id, text, alters, terms, chips: false });
      if (row === null) return; // backed out of the whisper warning
      setText(""); typed.current = false;
      refresh();
    } catch (e) {
      showToast({ tone: "failed", message: isLogCommandError(e) ? e.message : "Couldn't save the note.", detail: isLogCommandError(e) ? "Fix the command and save again." : e?.message || "Nothing was changed." });
    } finally { setSaving(false); }
  };
  const remove = (n) => trashWithUndo({ thing: "The note", run: () => deleteGroupNote(n.id), refresh });
  const shown = full ? notes : notes.slice(0, 5);
  return (
    <Panel className={`hgr-pn${full ? "" : " hgr-grow"}`} title="Notes" tools={<span className="hgr-note">{notes.length}</span>}>
      <div className="hgr-notes" data-tour="groups-notes">
        <div className="hgr-note-add">
          <AuthoredField label="New note" value={text} onChange={setText} alters={alters} rows={2} toolbar={false}
            placeholder="Add a note for this group…" />
          {text.trim() ? <Button rank="primary" busy={saving} busyLabel="Saving…" onClick={add}>Save note</Button> : null}
        </div>
        {notes.length === 0 ? <p className="hgr-empty">No notes yet for this group.</p> : (
          <ul className="hgr-notelist">
            {shown.map((n) => (
              <li key={n.id} className="hgr-noterow">
                <span className="hgr-notedate">{shortDate(n.created_date)}</span>
                <span className="hgr-notetext"><RichText content={n.content} /></span>
                <IconButton icon={Trash2} label="Delete this note" className="hgr-notedel" onClick={() => remove(n)} />
              </li>
            ))}
          </ul>
        )}
        {!full && notes.length > shown.length ? <p className="hgr-empty">{`${notes.length - shown.length} more on the Notes page.`}</p> : null}
      </div>
    </Panel>
  );
}
