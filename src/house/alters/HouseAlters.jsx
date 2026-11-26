// The house's Alters room, the directory (plan step 5.3, "who we are"):
// board 03-Alters drawn by the house itself on /Home (remember: /Home is
// the alters directory, "/" is home). House mode only: the frames draw it
// (houseAltersRoom); the old page is gated off (HouseRoomGate) and stays
// exactly as it was with the new house off.
//
//   Studio  Groups (left: Everyone, the nested groups and sub-systems, No
//           group, Archived, Import); Find · Sort · Grid/List/Tree · ⋯ ·
//           + New (top); the cards on the floor; Info for the picked card
//           (right); the status line (bottom).
//   Phone   (not drawn on a board; the boards' language) Find and the
//           toolbar, the cards, then Groups folded, Not sure yet and the
//           doors at the foot. A tap opens the profile.
//
// Nothing here writes a record by itself: front through toggleFrontFor /
// changeFront (setFront.js), group membership through addGroupMember
// (groupMembership.js), the label mode through the settings writer; new
// alters, imports, exports, groups and archiving open the old sheets that
// already own those writes. The view (sort, filters, layout, folded
// groups) is read from and written to the old page's own keys.

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { HouseScope } from "@/house/tokens/HouseRoot";
import { Button } from "@/house/kit/Button";
import { Panel } from "@/house/kit/Panel";
import { Segmented } from "@/house/kit/Choices";
import { TextField } from "@/house/kit/Field";
import Menu from "@/house/kit/Menu";
import { Sheet } from "@/house/kit/Sheet";
import { NestedPicker } from "@/house/kit/Pickers";
import { EmptyBlock, LoadingBlock } from "@/house/kit/States";
import { showToast } from "@/house/kit/Toast";
import { useTerms } from "@/lib/useTerms";
import { an } from "@/lib/articles";
import { useAlterLabel, useAlterLabelMode } from "@/lib/useAlterLabel";
import { sharedList } from "@/lib/sharedLists";
import { useAlterOrder } from "@/lib/alterOrder";
import { flattenGroupTree } from "@/lib/groupTree";
import { getMemberAlters, getSubsystemsOwnedBy } from "@/lib/subsystemUtils";
import { usesNewProfile } from "@/lib/profileBoard";
import { toggleFrontFor } from "@/hooks/useSwipeActions";
import { changeFront } from "@/lib/setFront";
import { addGroupMember } from "@/lib/groupMembership";
import { writeSettings } from "@/lib/settingsWriter";
import { pickPrimarySystemSettings } from "@/lib/systemSettingsSingleton";
import { headerLookOnCards, setHeaderLookOnCards } from "@/lib/headerLook";
import { useDeepLinkHighlight } from "@/lib/useDeepLinkHighlight";
import useAnonymizeMode from "@/hooks/useAnonymizeMode";
import AlterActionMenu from "@/components/alters/AlterActionMenu";
import AlterEditModal from "@/components/alters/AlterEditModal";
import AlterExportModal from "@/components/alters/AlterExportModal";
import ImportAltersModal from "@/components/alters/ImportAltersModal";
import MassArchiveModal from "@/components/alters/MassArchiveModal";
import AlterFilterPopup from "@/components/alters/AlterFilterPopup";
import SubsystemAlterList from "@/components/alters/SubsystemAlterList";
import PinnedAltersGallery from "@/components/alters/PinnedAltersGallery";
import CreateGroupModal from "@/components/groups/CreateGroupModal";
import QuickPeopleSheet from "@/components/shared/QuickPeopleSheet";
import NotSureYetSection from "@/components/presences/NotSureYetSection";
import SystemHeaderCard from "@/components/system/SystemHeaderCard";
import {
  readDirectoryPrefs, writeDirectoryPref, viewOf, pickView, sortOptions, frontRanks, frontTotals, lastFrontTimes,
  frontLine, weekOf, directoryList, rolesInUse, groupRows, filtersForGroup, pickedGroupId, groupedIds, statusWords,
  feelsLately, membersOf, LAYOUTS,
} from "@/house/alters/altersModel";
import { AlterCardTile, AlterListRow, GroupsTree, AlterInfoPanel, infoFacts } from "@/house/alters/AlterParts";
import "@/house/kit/kit.css";
import "@/house/kit/panels.css";
import "@/house/alters/alters.css";

const stores = () => ({
  session: typeof sessionStorage === "undefined" ? null : sessionStorage,
  local: typeof localStorage === "undefined" ? null : localStorage,
});
const LAYOUT_WORDS = { 2: "2 columns", 3: "3 columns", 4: "4 columns", 5: "5 columns" };
const ANON_WORDS = { off: "Off", names: "Blur names", avatars: "Blur pictures", all: "Blur names and pictures" };
const LABEL_WORDS = { name: "name", alias: "alias", both: "name and alias" };

// toggleFrontFor speaks through a toast object; the house's toast says it.
const houseToast = {
  success: (message) => showToast({ message }),
  error: (message) => showToast({ tone: "failed", message: message || "That didn't save.", detail: "Nothing changed." }),
};

export default function HouseAlters({ size = "full", tokens }) {
  const t = useTerms();
  const formatAlter = useAlterLabel();
  const labelMode = useAlterLabelMode();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const phone = size === "phone";
  useDeepLinkHighlight("bulletinId", "bulletin-");

  // ── The view, on the old page's keys ──
  const [prefs, setPrefs] = useState(() => readDirectoryPrefs(stores()));
  const { entries: manualEntries, placedIndex } = useAlterOrder();
  const [sort, setSortRaw] = useState(() => prefs.sort || "alpha-asc");
  useEffect(() => { if (manualEntries.length && !prefs.sort) setSortRaw("manual"); }, [manualEntries.length, prefs.sort]);
  const setSort = (v) => { setSortRaw(v); writeDirectoryPref(stores(), "sort", v); };
  const setPref = (key, value) => { setPrefs((p) => ({ ...p, [key]: value })); writeDirectoryPref(stores(), key, value); };
  const setFilters = (next) => setPref("filters", typeof next === "function" ? next(prefs.filters) : next);
  const [search, setSearch] = useState("");
  const { mode: anonymize, setMode: setAnonymize } = useAnonymizeMode();
  const [headerBg, setHeaderBg] = useState(() => headerLookOnCards());

  // ── Records ──
  const { data: alters = [], isLoading } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  const { data: groups = [] } = useQuery({ queryKey: ["groups"], queryFn: () => base44.entities.Group.list() });
  const { data: activeSessions = [] } = useQuery({ queryKey: ["activeFront"], queryFn: () => base44.entities.FrontingSession.filter({ is_active: true }) });
  const { data: allSessions = [] } = useQuery({ queryKey: ["frontSessionsAll"], queryFn: () => base44.entities.FrontingSession.filter({}), staleTime: 60000 });
  const { data: systemFields = [] } = useQuery({ ...sharedList("customFields") });
  const { data: checkIns = [] } = useQuery({ ...sharedList("emotionCheckIns"), enabled: !phone });
  const { data: settingsRows = [] } = useQuery({ queryKey: ["systemSettings"], queryFn: () => base44.entities.SystemSettings.list() });
  const systemSettings = pickPrimarySystemSettings(settingsRows) || null;

  const active = useMemo(() => alters.filter((a) => !a.is_archived), [alters]);
  const archivedCount = alters.length - active.length;
  const ranks = useMemo(() => frontRanks(activeSessions), [activeSessions]);
  const totals = useMemo(() => frontTotals(allSessions), [allSessions]);
  const last = useMemo(() => lastFrontTimes(allSessions), [allSessions]);
  const manualIndex = useMemo(() => (manualEntries.length ? placedIndex(active) : null), [manualEntries, placedIndex, active]);
  const { visible, top, flat, explicit } = useMemo(() => directoryList({
    alters, groups, systemFields, search, filters: prefs.filters, hideGrouped: prefs.hideGrouped, sort, ranks, totals, manualIndex,
  }), [alters, groups, systemFields, search, prefs.filters, prefs.hideGrouped, sort, ranks, totals, manualIndex]);
  const roles = useMemo(() => rolesInUse(active), [active]);
  const regularGroups = groups.filter((g) => !g.owner_alter_id);
  const subsystemGroups = groups.filter((g) => g.owner_alter_id);
  const tree = useMemo(() => flattenGroupTree(groups, { sort: "order" }), [groups]);
  const rows = useMemo(() => groupRows(tree, prefs.folded), [tree, prefs.folded]);
  const pickedId = pickedGroupId(prefs.filters);
  const grouped = useMemo(() => groupedIds(groups, active), [groups, active]);
  const view = viewOf(prefs.layout, prefs.filters.nested);
  const [lastCols, setLastCols] = useState(() => (prefs.layout !== "list" ? prefs.layout : "5"));
  const onView = (v) => {
    if (prefs.layout !== "list") setLastCols(prefs.layout);
    const next = pickView(v, { layout: prefs.layout, lastCols });
    setPrefs((p) => ({ ...p, layout: next.layout, filters: { ...p.filters, nested: next.nested } }));
    writeDirectoryPref(stores(), "layout", next.layout);
    writeDirectoryPref(stores(), "filters", { ...prefs.filters, nested: next.nested });
  };

  // ── Picking: a card shows in Info; Shift or Ctrl picks several ──
  const [selectedId, setSelectedId] = useState(null);
  const [picked, setPicked] = useState([]);
  const selected = selectedId ? active.find((a) => a.id === selectedId) || null : null;
  const open = (a, q = "") => navigate(`/alter/${a.id}${q}`);
  const activate = (a, e) => {
    if (phone) { open(a); return; }
    if (e?.shiftKey || e?.ctrlKey || e?.metaKey) {
      setPicked((cur) => {
        const base = cur.length === 0 && selectedId && selectedId !== a.id ? [selectedId] : cur;
        return base.includes(a.id) ? base.filter((x) => x !== a.id) : [...base, a.id];
      });
      return;
    }
    setPicked([]);
    if (selectedId === a.id) open(a); else setSelectedId(a.id);
  };
  const [menuFor, setMenuFor] = useState(null);
  const lineOf = (a) => frontLine(a.id, { ranks, last, terms: t });
  const front = (a) => toggleFrontFor(a, activeSessions, base44, qc, houseToast, t);
  const message = (a) => open(a, `?tab=${usesNewProfile(a) ? "messages" : "private-messages"}&compose=1`);

  // ── Sheets ──
  const [addOpen, setAddOpen] = useState(false);
  const [severalOpen, setSeveralOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [toGroupOpen, setToGroupOpen] = useState(false);
  const [toGroup, setToGroup] = useState(null);

  const pickGroup = (g) => {
    if (prefs.hideGrouped) setPref("hideGrouped", false);
    setFilters(filtersForGroup(prefs.filters, g));
  };
  const pickNoGroup = () => {
    const v = !prefs.hideGrouped;
    setPrefs((p) => ({ ...p, hideGrouped: v, filters: v ? { ...p.filters, groupIds: [], subsystemIds: [] } : p.filters }));
    writeDirectoryPref(stores(), "hideGrouped", v);
    if (v) writeDirectoryPref(stores(), "filters", { ...prefs.filters, groupIds: [], subsystemIds: [] });
  };
  const fold = (id) => setPref("folded", prefs.folded.includes(id) ? prefs.folded.filter((x) => x !== id) : [...prefs.folded, id]);

  const pickedAlters = picked.map((id) => active.find((a) => a.id === id)).filter(Boolean);
  const addPickedToFront = async () => {
    const ids = pickedAlters.map((a) => a.id);
    try {
      await changeFront((cur) => [...cur, ...ids.filter((id) => !cur.some((s) => s.alterId === id)).map((alterId) => ({ alterId, isPrimary: false }))], { queryClient: qc, terms: t });
      showToast({ message: `${ids.length} added to ${t.front}.` });
    } catch (e) { houseToast.error(e?.message); }
  };
  const addPickedToGroup = async () => {
    const g = groups.find((x) => x.id === toGroup);
    if (!g) return;
    try {
      for (const a of pickedAlters) await addGroupMember({ group: g, alterId: a.id });
      qc.invalidateQueries({ queryKey: ["groups"] }); qc.invalidateQueries({ queryKey: ["alters"] });
      showToast({ message: `${pickedAlters.length} added to ${g.name || "the group"}.` });
      setToGroupOpen(false); setToGroup(null);
    } catch (e) { houseToast.error(e?.message); }
  };
  const setLabelMode = async (mode) => {
    try { await writeSettings({ alter_label_mode: mode }, { create: true, queryClient: qc }); }
    catch (e) { houseToast.error(e?.message); }
  };

  const sortOpts = sortOptions(t, { manual: manualEntries.length > 0 || sort === "manual" });
  const sortLabel = (sortOpts.find((o) => o.id === sort) || sortOpts[0]).label;
  const optionsItems = [
    ...LAYOUTS.filter((l) => l !== "list").map((l) => ({ id: `cols-${l}`, label: `${prefs.layout === l ? "✓ " : ""}Grid: ${LAYOUT_WORDS[l]}`, onSelect: () => { setLastCols(l); setPref("layout", l); } })),
    { id: "filter", label: `Filter by group, sub${t.system} or role…`, onSelect: () => setFilterOpen(true) },
    { id: "flat", label: `${prefs.filters.nested === false ? "✓ " : ""}Everyone in one flat list`, onSelect: () => setFilters({ ...prefs.filters, nested: prefs.filters.nested === false }) },
    { id: "hide", label: `${prefs.hideGrouped ? "✓ " : ""}Hide ${t.alters} already in a group`, onSelect: pickNoGroup },
    { id: "header", label: `${headerBg ? "✓ " : ""}Profile header look on cards (Tree)`, onSelect: () => { setHeaderBg(!headerBg); setHeaderLookOnCards(!headerBg); } },
    ...Object.entries(ANON_WORDS).map(([k, w]) => ({ id: `anon-${k}`, label: `${anonymize === k ? "✓ " : ""}Screenshot mode: ${w}`, onSelect: () => setAnonymize(k) })),
    { id: "several", label: "Add several at once…", onSelect: () => setSeveralOpen(true) },
    { id: "export", label: `Export ${t.alters}…`, onSelect: () => setExportOpen(true) },
    { id: "groups", label: "Manage groups…", onSelect: () => navigate("/groups") },
    { id: "presences", label: "New presences…", onSelect: () => navigate("/presences") },
    { id: "archive", label: `Archive several ${t.alters}…`, onSelect: () => setArchiveOpen(true) },
  ];

  const toolbar = (
    <div className="hal-toolbar" role="toolbar" aria-label={`${t.Alters}: find and view`}>
      <div className="hal-find"><TextField label="Find" value={search} onChange={setSearch} placeholder="Name, alias, role, field..." type="search" /></div>
      {!phone ? <span className="hal-lbl house-label" aria-hidden="true">Sort</span> : null}
      <span data-tour="alter-sort"><Menu label={`Sort: ${sortLabel}`} rank="secondary" items={sortOpts.map((o) => ({ id: o.id, label: `${o.id === sort ? "✓ " : ""}${o.label}`, onSelect: () => setSort(o.id) }))}>{`${sortLabel} ▾`}</Menu></span>
      <span className="hal-flex" />
      <span className="hal-views"><Segmented label="View" value={view} onChange={onView} options={[{ value: "grid", label: "Grid" }, { value: "list", label: "List" }, { value: "tree", label: "Tree" }]} /></span>
      <span data-tour="alter-view-toggle"><Menu label={`More for ${t.Alters}`} rank="secondary" items={optionsItems} /></span>
      <span data-tour="alter-add-btn"><Button rank={phone ? "primary" : "secondary"} onClick={() => setAddOpen(true)}>{`+ New ${t.alter}`}</Button></span>
    </div>
  );

  const subsOf = (a) => (flat ? [] : getSubsystemsOwnedBy(groups, a.id));
  let floor;
  if (isLoading) floor = <LoadingBlock label={`Loading ${t.alters}`} kind="cards" />;
  else if (active.length === 0) {
    floor = (
      <EmptyBlock title={`No ${t.alters} yet`} body={`Add your first ${t.alter}, add several at once, or bring them in from another plural app.`}
        action={{ label: `+ New ${t.alter}`, onClick: () => setAddOpen(true) }} />
    );
  } else if (visible.length === 0) {
    floor = (
      <EmptyBlock compact title={search ? "No matches found" : explicit ? `No ${t.alters} in this filter` : prefs.hideGrouped ? `All ${t.alters} are in groups` : `No ${t.alters} here`}
        body={search ? "Try a different word." : "Pick Everyone to see them all."}
        action={{ label: "Show everyone", onClick: () => { setSearch(""); pickGroup(null); if (prefs.hideGrouped) setPref("hideGrouped", false); } }} />
    );
  } else if (view === "grid") {
    const cols = phone ? Math.min(3, Number(prefs.layout) || 3) : Number(prefs.layout) || 5;
    floor = (
      <div className="hal-grid" style={{ "--hal-cols": cols }} data-tour="alters-grid">
        {visible.map((a) => (
          <AlterCardTile key={a.id} alter={a} line={lineOf(a)} selected={selectedId === a.id && !picked.length} picked={picked.includes(a.id)}
            anonymize={anonymize} subsystems={subsOf(a)} onActivate={(e) => activate(a, e)} onHold={() => setMenuFor(a)}
            onOpenSub={(g) => pickGroup(g)} />
        ))}
      </div>
    );
  } else if (view === "list" || flat) {
    floor = (
      <ul className="hal-list" data-tour="alters-grid" aria-label={t.Alters}>
        {visible.map((a) => (
          <AlterListRow key={a.id} alter={a} line={lineOf(a)} selected={selectedId === a.id && !picked.length} picked={picked.includes(a.id)}
            anonymize={anonymize} onActivate={(e) => activate(a, e)} onHold={() => setMenuFor(a)} onFront={front} />
        ))}
      </ul>
    );
  } else {
    // Tree: the old nested list (sub-systems under their owners), reused as it is.
    floor = (
      <div className="hal-old" data-tour="alters-grid">
        <SubsystemAlterList topAlters={top} allAlters={alters} allGroups={groups} activeSessions={activeSessions} anonymize={anonymize} persistKey="altersMain" />
      </div>
    );
  }

  const countOf = (g) => getMemberAlters(g, active).length;
  const groupsTree = (
    <GroupsTree rows={rows} everyoneCount={active.length} ungroupedCount={active.filter((a) => !grouped.has(a.id)).length}
      pickedId={pickedId} hideGrouped={prefs.hideGrouped} anonymize={anonymize} countOf={countOf}
      onPick={pickGroup} onPickNoGroup={pickNoGroup} onFold={fold} onOpen={(g) => navigate(`/group/${g.id}`)} />
  );
  const doors = (
    <div className="hal-doors">
      <Button rank="secondary" block onClick={() => navigate("/settings#archived-alters")}>{`Archived (${archivedCount})`}</Button>
      <Button rank="secondary" block onClick={() => setImportOpen(true)}>Import from another app</Button>
    </div>
  );
  const status = statusWords({ alters, ranks, groups, terms: t });
  const statusLine = (
    <div className="hal-status" role="status">
      {status.map((s) => <span key={s}>{s}</span>)}
      <span className="hal-flex" />
      {anonymize !== "off" ? <Button rank="quiet" className="hal-status-btn" onClick={() => setAnonymize("off")}>{`${ANON_WORDS[anonymize]} · turn off`}</Button> : null}
      <Menu label="Labels in lists" rank="quiet" items={Object.entries(LABEL_WORDS).map(([k, w]) => ({ id: k, label: `${labelMode === k ? "✓ " : ""}${w[0].toUpperCase()}${w.slice(1)}`, onSelect: () => setLabelMode(k) }))}>{`Labels: ${LABEL_WORDS[labelMode] || "name"}`}</Menu>
      {!phone ? <span>Shift-click to pick several</span> : null}
    </div>
  );

  // ── The Info column ──
  let info;
  if (pickedAlters.length > 1) {
    info = (
      <Panel className="hal-info" headingLevel={2} title={`${pickedAlters.length} picked`} tools={<Button rank="quiet" onClick={() => setPicked([])}>Clear</Button>}>
        <div className="hal-info-body">
          <p className="hal-muted">{pickedAlters.map((a) => formatAlter(a)).join(", ")}</p>
          <div className="hal-actions">
            <Button rank="primary" onClick={addPickedToFront}>{`Add all to ${t.front}`}</Button>
            <Button rank="secondary" onClick={() => setToGroupOpen(true)}>Add to a group…</Button>
            <Button rank="secondary" onClick={() => setArchiveOpen(true)}>Archive several…</Button>
          </div>
        </div>
      </Panel>
    );
  } else if (selected) {
    const mySession = activeSessions.find((s) => membersOf(s).includes(selected.id));
    const myGroups = groups.filter((g) => getMemberAlters(g, [selected]).length > 0);
    info = (
      <AlterInfoPanel alter={selected} anonymize={anonymize} front={!!mySession}
        facts={infoFacts(selected, { groups: myGroups, session: mySession, feels: feelsLately(checkIns, selected.id), terms: t })}
        week={weekOf(selected.id, allSessions)}
        onOpen={() => open(selected)} onEdit={() => open(selected, "?edit=1")} onFront={() => front(selected)}
        onMessage={() => message(selected)} onMenu={() => setMenuFor(selected)} />
    );
  } else {
    info = (
      <Panel className="hal-info" headingLevel={2} title={`Info: ${t.System}`}>
        <div className="hal-info-body" data-tour="alters-info-panel">
          <div className="hal-old" data-tour="system-profile"><SystemHeaderCard settings={systemSettings} /></div>
          <p className="hal-muted">{`Click ${an(t.alter)} to see them here; click again to open their profile. Hold or right-click for their menu.`}</p>
        </div>
      </Panel>
    );
  }

  const pinned = <div className="hal-old hal-pinned"><PinnedAltersGallery /></div>;
  const notSure = <div className="hal-old"><NotSureYetSection /></div>;

  const sheets = (
    <>
      {menuFor ? <AlterActionMenu alter={menuFor} activeSessions={activeSessions} onClose={() => setMenuFor(null)} /> : null}
      <AlterEditModal open={addOpen} onClose={() => setAddOpen(false)} />
      <QuickPeopleSheet open={severalOpen} onClose={() => setSeveralOpen(false)} />
      <ImportAltersModal open={importOpen} onClose={() => setImportOpen(false)} />
      <AlterExportModal isOpen={exportOpen} onClose={() => setExportOpen(false)} alters={alters} />
      <CreateGroupModal open={groupOpen} onClose={() => setGroupOpen(false)} />
      <MassArchiveModal open={archiveOpen} onClose={() => setArchiveOpen(false)} />
      {filterOpen ? (
        <AlterFilterPopup filters={prefs.filters} onChange={setFilters} regularGroups={regularGroups}
          subsystemGroups={subsystemGroups} roles={roles} terms={t} onClose={() => setFilterOpen(false)} />
      ) : null}
      <Sheet open={toGroupOpen} onClose={() => setToGroupOpen(false)} title="Add to a group" size="half"
        footer={<Button rank="primary" disabledReason={toGroup ? undefined : "Pick a group first"} onClick={addPickedToGroup}>Save</Button>}>
        <NestedPicker label="Group" value={toGroup} onChange={setToGroup} placeholder="Choose a group…"
          options={tree.map((g) => ({ id: g.id, label: g.name || "Unnamed group", color: g.color, _depth: g._depth }))} />
      </Sheet>
    </>
  );

  if (phone) {
    return (
      <HouseScope tokens={tokens} className="hal hal--phone" data-house-size="phone" data-alters-room="">
        <div className="hal-stack">
          <section className="hal-panelish" aria-label={`${t.Alters}: find and view`}>{toolbar}</section>
          {pinned}
          <div className="hal-floor">{floor}</div>
          <Panel className="hal-groups" headingLevel={2} title="Groups" collapsible defaultOpen={false}
            tools={<Button rank="quiet" onClick={() => setGroupOpen(true)}>+ group</Button>}>
            <div data-tour="alters-groups-panel">{groupsTree}</div>
          </Panel>
          {notSure}
          {doors}
          {statusLine}
        </div>
        {sheets}
      </HouseScope>
    );
  }

  return (
    <HouseScope tokens={tokens} className="hal hal--studio" data-house-size={size} data-alters-room="">
      <aside className="hal-left" aria-label="Groups">
        <Panel className="hal-groups" headingLevel={2} title="Groups" tools={<Button rank="quiet" onClick={() => setGroupOpen(true)}>+ group</Button>}>
          <div className="hal-groups-body" data-tour="alters-groups-panel">
            <div className="hal-groups-scroll" data-tour="alter-groups-controls">{groupsTree}</div>
            {doors}
          </div>
        </Panel>
      </aside>
      <section className="hal-main" aria-label={t.Alters}>
        <div className="hal-bar">{toolbar}</div>
        <div className="hal-floor">
          {pinned}
          {floor}
          {notSure}
        </div>
      </section>
      <aside className="hal-right" aria-label="Info">{info}</aside>
      <div className="hal-foot">{statusLine}</div>
      {sheets}
    </HouseScope>
  );
}
