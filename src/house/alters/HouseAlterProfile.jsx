// The house's Alters room, the profile (plan step 5.3): board
// 12-AlterProfilePhone drawn by the house itself on /alter/:id, and its
// desktop equivalent in board 26-Groups' language (a header panel with
// Info · Edit page · ⋯, the tabs, the panels in two columns). House mode
// only: the frames draw it (houseAltersRoom); the old page is gated off
// (HouseRoomGate) and stays exactly as it was with the new house off.
//
// Tabs: Profile · Notes · {Fronting} · Links, as board 12 draws them;
// every other page of the old profile (Board, Messages, Journal, Wishes,
// Custom fields, Options: archive, merge, delete) is under More. Every old
// ?tab= name lands on the page that holds it now (altersModel.profileTabOf),
// and a page the person added to their own layout opens that layout.
//
// The person's own layout is never redrawn or rewritten here: "Your own
// layout" (?view=layout, and Edit page) mounts the old profile page as it
// is, with its board, look, song and editors, inside the house frame. A
// machine write never creates a ProfileBoard row (that rule lives in
// ProfileBoardCanvas, which this room does not touch).
//
// Nothing here writes a record by itself: Info is the old AlterInfo (and
// the classic form behind it), which write through alterEntry.js; pin
// through setAlterFields; front through toggleFrontFor (setFront.js);
// relationships through saveRelationship; the reused tabs keep their own
// write paths.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Routes, Route, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Pin, Star, Mail, Palette, LayoutGrid, PencilLine, IdCard } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { HouseScope } from "@/house/tokens/HouseRoot";
import { Button } from "@/house/kit/Button";
import { Panel, PageTabs } from "@/house/kit/Panel";
import Menu from "@/house/kit/Menu";
import { EmptyBlock, LoadingBlock } from "@/house/kit/States";
import { showToast } from "@/house/kit/Toast";
import { useRoomTools } from "@/house/frame/roomTools";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { sharedList } from "@/lib/sharedLists";
import { usesNewProfile } from "@/lib/profileBoard";
import { setAlterFields, refreshAlter } from "@/lib/alterEntry";
import { toggleFrontFor } from "@/hooks/useSwipeActions";
import { saveRelationship, relationshipsOf, relationshipTypeLabel, RELATIONSHIPS_KEY } from "@/lib/alterRelationships";
import { isLogCommandError } from "@/lib/authoredText";
import { useRegisterLookSubject, openProfileLook } from "@/lib/lookSubject";
import { useLookDefaults, withLookDefaults } from "@/lib/profileLookDefaults";
import { setPageWaveOverride } from "@/lib/pageWaveOverride";
import { alterSongOf } from "@/lib/soundManager";
import { migrateAlterCustomFieldsObject, needsAlterCustomFieldsMigration } from "@/lib/alterCustomFieldsMigration";
import { openProfileLayoutEditor } from "@/components/profile/ProfileBoardCanvas";
import { getMemberAlters } from "@/lib/subsystemUtils";
import { PS } from "@/lib/profileStyle";
import { useProfileViewPrefs } from "@/lib/profileViewPrefs";
import AlterProfile from "@/pages/AlterProfile";
import AlterInfo from "@/components/alters/info/AlterInfo";
import ProfileTab from "@/components/alters/profile/ProfileTab";
import ProfileSongPlayer from "@/components/alters/ProfileSongPlayer";
import NewAlterGuide from "@/components/profile/NewAlterGuide";
import CreateRelationshipModal from "@/components/systemmap/CreateRelationshipModal";
import InfoTab from "@/components/alters/profile/InfoTab";
import HistoryTab from "@/components/alters/profile/HistoryTab";
import NotesTab from "@/components/alters/profile/NotesTab";
import WishlistTab from "@/components/alters/profile/WishlistTab";
import MessagesTab from "@/components/alters/profile/MessagesTab";
import PrivateMessagesTab from "@/components/alters/profile/PrivateMessagesTab";
import OptionsTab from "@/components/alters/profile/OptionsTab";
import LineageTab from "@/components/alters/profile/LineageTab";
import RelationshipsTab from "@/components/alters/profile/RelationshipsTab";
import LocationsTab from "@/components/alters/profile/LocationsTab";
import ActivitiesTab from "@/components/alters/profile/ActivitiesTab";
import ProfileJournalTab from "@/components/journal/ProfileJournalTab";
import {
  profileTabOf, tabParamOf, PROFILE_TABS, MORE_TABS, filledFields, subLine, bioParagraphs, weekOf, hoursWords, neighbours, membersOf,
} from "@/house/alters/altersModel";
import { SquareAvatar, RoleChips, WeekLanes, colourOf } from "@/house/alters/AlterParts";
import "@/house/kit/kit.css";
import "@/house/kit/panels.css";
import "@/house/alters/alters.css";

const houseToast = {
  success: (message) => showToast({ message }),
  error: (message) => showToast({ tone: "failed", message: message || "That didn't save.", detail: "Nothing changed." }),
};

function alterIdOf(pathname) {
  const m = String(pathname || "").match(/^\/alter\/([^/]+)\/?$/);
  try { return m ? decodeURIComponent(m[1]) : null; } catch { return m ? m[1] : null; }
}

export default function HouseAlterProfile({ size = "full", tokens }) {
  const t = useTerms();
  const formatAlter = useAlterLabel();
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const phone = size === "phone";
  const alterId = alterIdOf(location.pathname);
  const viewPrefs = useProfileViewPrefs();

  // ── Records (the old page's keys, so both houses share the cache) ──
  const { data: alter, isLoading } = useQuery({
    queryKey: ["alter", alterId],
    queryFn: async () => {
      const all = await base44.entities.Alter.list();
      return all.find((a) => String(a.id) === String(alterId)) || null;
    },
    enabled: !!alterId,
    staleTime: 0,
  });
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  const { data: groups = [] } = useQuery({ queryKey: ["groups"], queryFn: () => base44.entities.Group.list() });
  const { data: systemFields = [] } = useQuery({ ...sharedList("customFields") });
  const { data: activeSessions = [] } = useQuery({ queryKey: ["activeFront"], queryFn: () => base44.entities.FrontingSession.filter({ is_active: true }) });
  const { data: allSessions = [] } = useQuery({ queryKey: ["frontSessionsAll"], queryFn: () => base44.entities.FrontingSession.filter({}), staleTime: 60000 });
  const { data: relationships = [] } = useQuery({ queryKey: RELATIONSHIPS_KEY, queryFn: () => base44.entities.AlterRelationship.list() });

  const newLayout = usesNewProfile(alter);
  const { tab } = profileTabOf(searchParams.get("tab"), { view: searchParams.get("view"), newLayout });
  const setTab = useCallback((next) => {
    setSearchParams((prev) => {
      const q = new URLSearchParams(prev);
      q.delete("view"); q.delete("compose"); q.delete("messageId");
      if (next === "layout") { q.set("view", "layout"); q.delete("tab"); return q; }
      const p = tabParamOf(next, { newLayout });
      if (p) q.set("tab", p); else q.delete("tab");
      return q;
    }, { replace: true });
  }, [setSearchParams, newLayout]);

  // ── Info (the one door to everything about them) ──
  const [editMode, setEditMode] = useState(false); // false | "info" | "classic"
  const saveRef = useRef(null);
  useEffect(() => { setEditMode(false); }, [alterId]);
  useEffect(() => {
    if (searchParams.get("edit") !== "1" || !alter) return;
    setEditMode(viewPrefs.classicForm ? "classic" : "info");
    setSearchParams((prev) => { const q = new URLSearchParams(prev); q.delete("edit"); return q; }, { replace: true });
  }, [searchParams, alter, viewPrefs.classicForm, setSearchParams]);
  const toggleInfo = useCallback(() => {
    if (tab === "layout") setTab("profile");
    if (editMode === "classic") { saveRef.current?.(); return; }
    setEditMode((m) => (m ? false : (viewPrefs.classicForm ? "classic" : "info")));
  }, [editMode, tab, setTab, viewPrefs.classicForm]);

  // ── Edit page: the person's own layout, in its editor ──
  const [wantEdit, setWantEdit] = useState(false);
  const editPage = useCallback(() => { setEditMode(false); setTab("layout"); setWantEdit(true); }, [setTab]);
  useEffect(() => {
    if (!wantEdit || tab !== "layout") return undefined;
    let n = 0;
    const onState = (e) => { if (e?.detail?.scope === "os-profile" && e.detail.editing) setWantEdit(false); };
    window.addEventListener("os-home-edit-state", onState);
    const id = setInterval(() => { n += 1; openProfileLayoutEditor(); if (n > 20) { clearInterval(id); setWantEdit(false); } }, 200);
    return () => { clearInterval(id); window.removeEventListener("os-home-edit-state", onState); };
  }, [wantEdit, tab]);

  // ── The look: Profile style edits this alter; the header wave wears their colour (board 12) ──
  useRegisterLookSubject("alter", alter, alter?.name);
  const lookCf = withLookDefaults(alter?.custom_fields, useLookDefaults("alter"));
  const ownWave = lookCf[PS.THEME_WAVE];
  useEffect(() => {
    if (tab === "layout") return undefined; // the old page paints its own
    const concrete = typeof ownWave === "string" && !/^var\(/.test(ownWave) ? ownWave : null;
    setPageWaveOverride(concrete || (alter ? colourOf(alter) : null));
    return () => setPageWaveOverride(null);
  }, [ownWave, alter, tab]);

  // The old page's one-shot custom-field migration (idempotent, its own lib).
  useEffect(() => {
    if (!alter || !needsAlterCustomFieldsMigration(alter)) return undefined;
    let cancelled = false;
    (async () => {
      try { await migrateAlterCustomFieldsObject(alter); if (!cancelled) refreshAlter(qc, alter.id); } catch { /* the reads guard the old shape */ }
    })();
    return () => { cancelled = true; };
  }, [alter, qc]);

  // ── Actions ──
  const mySession = alter ? activeSessions.find((s) => membersOf(s).includes(alter.id)) : null;
  const fronting = !!mySession;
  const { prev, next } = useMemo(() => neighbours(alters, alter?.id), [alters, alter?.id]);
  const togglePin = useCallback(async () => {
    if (!alter) return;
    try {
      await setAlterFields(alter.id, { is_pinned: !alter.is_pinned });
      refreshAlter(qc, alter.id);
      showToast({ message: alter.is_pinned ? `${formatAlter(alter)} unpinned.` : `${formatAlter(alter)} pinned to the top of the ${t.alters} page.` });
    } catch (e) { houseToast.error(e?.message); }
  }, [alter, qc, formatAlter, t]);
  const front = useCallback(() => { if (alter) toggleFrontFor(alter, activeSessions, base44, qc, houseToast, t); }, [alter, activeSessions, qc, t]);
  const message = useCallback(() => {
    setSearchParams((prev0) => {
      const q = new URLSearchParams(prev0);
      q.delete("view"); q.set("tab", tabParamOf("inbox", { newLayout })); q.set("compose", "1");
      return q;
    }, { replace: true });
  }, [setSearchParams, newLayout]);
  const writeNote = useCallback(() => { setEditMode(false); setTab("notes"); }, [setTab]);

  const menuItems = useMemo(() => (alter ? [
    ...(prev ? [{ id: "prev", label: `Previous: ${formatAlter(prev)}`, icon: ArrowLeft, onSelect: () => navigate(`/alter/${prev.id}`) }] : []),
    ...(next ? [{ id: "next", label: `Next: ${formatAlter(next)}`, icon: ArrowRight, onSelect: () => navigate(`/alter/${next.id}`) }] : []),
    { id: "front", label: fronting ? `Remove from ${t.front}` : `Add to ${t.front}`, icon: Star, onSelect: front },
    { id: "message", label: "Message", icon: Mail, onSelect: message },
    { id: "pin", label: alter.is_pinned ? `Unpin from the ${t.alters} page` : `Pin to the top of the ${t.alters} page`, icon: Pin, onSelect: togglePin },
    { id: "style", label: "Profile style", icon: Palette, onSelect: openProfileLook },
    { id: "layout", label: tab === "layout" ? "Back to this page" : "Your own layout", icon: LayoutGrid, onSelect: () => setTab(tab === "layout" ? "profile" : "layout") },
    { id: "edit-page", label: "Edit page", icon: PencilLine, onSelect: editPage },
    { id: "options", label: "Archive, merge or delete…", onSelect: () => setTab("options") },
  ] : []), [alter, prev, next, fronting, t, front, message, togglePin, tab, setTab, editPage, navigate, formatAlter]);

  // The phone frame's header: Back · name · Info · ⋯, and board 12's bar
  // (Edit page · Profile style · Write note), which the frame docks in its
  // bottom zone right above its own bar, so nothing on the page runs under it.
  const bar = useMemo(() => (editMode ? null : (
    <div className="hal-pf-bar" data-tour="alter-profile-actions">
      <span data-tour="alter-profile-layout-btn"><Button rank="secondary" block onClick={editPage}>Edit page</Button></span>
      <Button rank="secondary" block onClick={openProfileLook}>Profile style</Button>
      <Button rank="primary" block onClick={writeNote}>Write note</Button>
    </div>
  )), [editMode, editPage, writeNote]);
  const roomTools = useMemo(() => (alter ? { info: { label: editMode ? "Done" : "Info", pressed: !!editMode, onSelect: toggleInfo }, items: menuItems, bar } : null), [alter, editMode, toggleInfo, menuItems, bar]);
  useRoomTools(phone ? roomTools : null);

  // ── Relationships (+ add) ──
  const alterMap = useMemo(() => Object.fromEntries(alters.map((a) => [a.id, a])), [alters]);
  const myRels = useMemo(() => (alter ? relationshipsOf(relationships, alter.id, alterMap) : []), [relationships, alter, alterMap]);
  const [relOpen, setRelOpen] = useState(false);
  // A long bio shows its start; the rest is one tap away (board 12's About is a few lines).
  const [bioAll, setBioAll] = useState(false);
  const saveRel = async (data) => {
    try {
      const row = await saveRelationship({ id: null, data, alters, terms: t, navigatePath: `/alter/${alter.id}?tab=relationships` });
      if (row === null) return;
    } catch (e) {
      if (isLogCommandError(e)) { houseToast.error(e.message); return; }
      houseToast.error(e?.message); return;
    }
    qc.invalidateQueries({ queryKey: RELATIONSHIPS_KEY });
    setRelOpen(false);
  };

  if (!alterId) return null;
  if (isLoading) {
    return <HouseScope tokens={tokens} className={`hal hal-pf hal-pf--${phone ? "phone" : "studio"}`} data-house-size={size}><LoadingBlock label={`Loading ${t.alter}`} /></HouseScope>;
  }
  if (!alter) {
    return (
      <HouseScope tokens={tokens} className={`hal hal-pf hal-pf--${phone ? "phone" : "studio"}`} data-house-size={size}>
        <EmptyBlock title={`This ${t.alter} isn't here`} body={`They may have been deleted or moved to another ${t.system}. Deleted things wait in Recent changes.`}
          action={{ label: `Back to ${t.alters}`, onClick: () => navigate("/Home") }} />
      </HouseScope>
    );
  }

  const label = formatAlter(alter) || "Unnamed";
  const week = weekOf(alter.id, allSessions, Date.now(), { from: "monday" });
  const weekTotal = week.reduce((n, d) => n + d.hours, 0);
  const fields = filledFields(alter, systemFields, { orderKey: PS.FIELD_ORDER });
  const bio = bioParagraphs(alter.description);
  const myGroups = groups.filter((g) => getMemberAlters(g, [alter]).length > 0);

  // ── The panels of the Profile page (board 12) ──
  const about = (
    <Panel key="about" className="hal-pf-panel" title="About" tools={<Button rank="quiet" onClick={() => setEditMode("info")}>edit</Button>}>
      {bio === null ? <p className="hal-muted">The bio can't be shown here. Open Info and save it again to fix it.</p>
        : bio.length ? (
          <>
            {(bioAll || bio.length <= 5 ? bio : bio.slice(0, 4)).map((p, i) => <p key={i} className="hal-p">{p}</p>)}
            {bio.length > 5 ? <Button rank="quiet" onClick={() => setBioAll((v) => !v)}>{bioAll ? "Show less" : "Show all"}</Button> : null}
          </>
        ) : <p className="hal-muted">{`No bio yet. Tap edit to write one.`}</p>}
    </Panel>
  );
  const custom = (
    <Panel key="fields" className="hal-pf-panel" title="Custom fields" tools={<Button rank="quiet" onClick={() => setTab("fields")}>fill in</Button>}>
      {fields.length ? (
        <dl className="hal-kv">{fields.map((f) => <div key={f.id}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}</dl>
      ) : <p className="hal-muted">Nothing filled in yet.</p>}
    </Panel>
  );
  const frontWeek = (
    <Panel key="week" className="hal-pf-panel" title={`${t.Fronting}, this week`} tools={<span className="hal-muted">{hoursWords(weekTotal)}</span>}>
      <WeekLanes week={week} colour={colourOf(alter)} label={`${t.Fronting}, this week`} />
    </Panel>
  );
  const rels = (
    <Panel key="rels" className="hal-pf-panel" title="Relationships" tools={<Button rank="quiet" onClick={() => setRelOpen(true)}>+ add</Button>}>
      {myRels.length ? (
        <ul className="hal-rels">
          {myRels.map((r) => (
            <li key={r.id}>
              <Button rank="quiet" className="hal-rel" onClick={() => navigate(`/alter/${r.other.id}`)}>
                <span className="hal-sq hal-sq--lg" style={{ background: colourOf(r.other) }} aria-hidden="true" />
                <span className="hal-rel-name">{formatAlter(r.other)}</span>
                <span className="hal-rel-type">{relationshipTypeLabel(r).toLowerCase()}</span>
              </Button>
            </li>
          ))}
        </ul>
      ) : <p className="hal-muted">{`No relationships yet. + add shows how ${label} connects to the others.`}</p>}
    </Panel>
  );
  const groupsPanel = myGroups.length ? (
    <Panel key="groups" className="hal-pf-panel" title="Groups">
      <ul className="hal-rels">
        {myGroups.map((g) => (
          <li key={g.id}>
            <Button rank="quiet" className="hal-rel" onClick={() => navigate(`/group/${g.id}`)}>
              <span className="hal-sq hal-sq--lg" style={{ background: g.color || "var(--house-title)" }} aria-hidden="true" />
              <span className="hal-rel-name">{g.name || "Unnamed group"}</span>
              <span className="hal-rel-type">{g.owner_alter_id ? `sub${t.system}` : "group"}</span>
            </Button>
          </li>
        ))}
      </ul>
    </Panel>
  ) : null;

  const old = (title, body, key = title) => <Panel key={key} className="hal-pf-panel" title={title}><div className="hal-old">{body}</div></Panel>;
  let body;
  if (editMode === "info") {
    body = <div className="hal-old hal-pf-edit"><AlterInfo alter={alter} onOpenClassic={() => setEditMode("classic")} /></div>;
  } else if (editMode === "classic") {
    body = <div className="hal-old hal-pf-edit"><ProfileTab alter={alter} onEditModeChange={setEditMode} saveRef={saveRef} /></div>;
  } else if (tab === "layout") {
    body = (
      <div className="hal-pf-layout">
        <div className="hal-pf-layout-bar" role="note">
          <span>{`Your own layout for ${label}, as you arranged it.`}</span>
          <Button rank="secondary" onClick={() => setTab("profile")}>Back to this page</Button>
        </div>
        <div className="hal-old hal-pf-oldpage">
          <Routes><Route path="/alter/:id" element={<AlterProfile />} /></Routes>
        </div>
      </div>
    );
  } else if (tab === "profile") {
    body = phone
      ? <div className="hal-pf-col"><div className="hal-old"><NewAlterGuide alter={alter} /></div>{about}{custom}{frontWeek}{rels}{groupsPanel}</div>
      : (
        <div className="hal-pf-cols">
          <div className="hal-pf-col"><div className="hal-old"><NewAlterGuide alter={alter} /></div>{about}{custom}</div>
          <div className="hal-pf-col">{frontWeek}{rels}{groupsPanel}</div>
        </div>
      );
  } else if (tab === "notes") body = <div className="hal-pf-col">{old("Notes", <NotesTab alterId={alter.id} />)}</div>;
  else if (tab === "fronting") body = <div className="hal-pf-col">{frontWeek}{old(`${t.Fronting} history`, <HistoryTab alterId={alter.id} />)}</div>;
  else if (tab === "links") {
    body = (
      <div className={phone ? "hal-pf-col" : "hal-pf-cols"}>
        <div className="hal-pf-col">{old("Relationships", <RelationshipsTab alter={alter} alters={alters} />)}{old("Lineage", <LineageTab alterId={alter.id} />)}</div>
        <div className="hal-pf-col">{old("Places", <LocationsTab alter={alter} />)}{old("Activities", <ActivitiesTab alter={alter} />)}</div>
      </div>
    );
  } else if (tab === "board") body = <div className="hal-pf-col">{old("Board", <MessagesTab alterId={alter.id} alters={alters} />)}</div>;
  else if (tab === "inbox") {
    body = <div className="hal-pf-col">{old("Messages", <PrivateMessagesTab alterId={alter.id} alters={alters} highlightMessageId={searchParams.get("messageId") || null} autoOpenCompose={searchParams.get("compose") === "1"} />)}</div>;
  } else if (tab === "journal") body = <div className="hal-pf-col">{old("Journal", <ProfileJournalTab alterIds={[alter.id]} defaultAuthorId={alter.id} />)}</div>;
  else if (tab === "wishes") body = <div className="hal-pf-col">{old("Wishes", <WishlistTab alter={alter} alters={alters} />)}</div>;
  else if (tab === "fields") body = <div className="hal-pf-col">{old("Custom fields", <InfoTab alter={alter} systemFields={systemFields} />)}</div>;
  else body = <div className="hal-pf-col">{old("Options", <OptionsTab alter={alter} />)}</div>;

  const TAB_WORDS = { profile: "Profile", notes: "Notes", fronting: t.Fronting, links: "Links", board: "Board", inbox: "Messages", journal: "Journal", wishes: "Wishes", fields: "Custom fields", options: "Options", layout: "Your own layout" };
  const tabs = [...PROFILE_TABS, ...(PROFILE_TABS.includes(tab) ? [] : [tab])].map((id) => ({ id, label: TAB_WORDS[id] }));
  const moreItems = [...MORE_TABS.map((id) => ({ id, label: TAB_WORDS[id], onSelect: () => { setEditMode(false); setTab(id); } })),
    { id: "layout", label: "Your own layout", icon: LayoutGrid, onSelect: () => { setEditMode(false); setTab("layout"); } }];

  const head = (
    <section className="hal-pf-head" aria-label={`${label}: who they are`}>
      <SquareAvatar alter={alter} size="xl" />
      <div className="hal-pf-who">
        <h1 className="hal-pf-name house-label">{alter.emoji ? `${alter.emoji} ` : ""}{label}</h1>
        {subLine(alter) ? <span className="hal-muted">{subLine(alter)}</span> : null}
        <RoleChips alter={alter} extra={fronting ? <span className="hal-chip hal-chip--on">{t.fronting}</span> : null} />
      </div>
      {!phone ? (
        <div className="hal-pf-tools">
          <span data-tour="alter-profile-edit-btn"><Button rank="secondary" icon={IdCard} aria-pressed={!!editMode} onClick={toggleInfo}>{editMode === "classic" ? "Save" : editMode ? "Done" : "Info"}</Button></span>
          <span data-tour="alter-profile-layout-btn"><Button rank="secondary" onClick={editPage}>Edit page</Button></span>
          <Button rank="primary" onClick={writeNote}>Write note</Button>
          <Menu label={`More for ${label}`} rank="secondary" items={menuItems} />
        </div>
      ) : null}
    </section>
  );
  const tabStrip = editMode ? null : (
    <div className="hal-pf-tabs" data-tour="alter-profile-tabs">
      <PageTabs label={`Pages of ${label}`} value={tab} onChange={(id) => setTab(id)} tabs={tabs} />
      <Menu label={`More pages of ${label}`} rank="quiet" items={moreItems}>More ▾</Menu>
    </div>
  );
  const song = alterSongOf(alter, lookCf);

  return (
    <HouseScope tokens={tokens} className={`hal hal-pf hal-pf--${phone ? "phone" : "studio"}`} data-house-size={size} data-alter-profile-room="">
      {song && tab !== "layout" ? <ProfileSongPlayer song={song} /> : null}
      <div className="hal-pf-scroll">
        {head}
        {tabStrip}
        {editMode ? (
          <div className="hal-pf-editbar">
            <span className="house-label">{`Info: ${label}`}</span>
            <Button rank="primary" onClick={toggleInfo}>{editMode === "classic" ? "Save" : "Done"}</Button>
          </div>
        ) : null}
        <div className="hal-pf-body">{body}</div>
      </div>
      {relOpen ? (
        <CreateRelationshipModal allAlters={alters.filter((a) => !a.is_archived || a.id === alter.id)} alterA={alter} alterB={null}
          onSave={saveRel} onClose={() => setRelOpen(false)} />
      ) : null}
    </HouseScope>
  );
}
