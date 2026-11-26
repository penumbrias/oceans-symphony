// The new house's phone frame (step 2.2, plan §3 "Phone: one room at a
// time", building code §5 and §14).
//
//   ┌ header: Back (or Everything) · page name, area beneath · Search · ⋯ ┐
//   ├ page tabs (a rebuilt room's own; old rooms have none) ──────────────┤
//   │ the page (the old room), nothing floating over it                   │
//   ├ attention line: one item, +N (only when something needs it) ────────┤
//   └ bottom bar: Home · Alters · Timeline · Write · Support (board 08) ──┘
//
// Do (the quick tools) opens from the ⋯ menu. On "/" the middle is the
// house's own Home room (board 08-Phone's stacked panels); the old
// Dashboard stays mounted underneath only to host its dialogs.
//
// Loaded ONLY when "Try the new house" is on for this device and the window
// is phone-sized (src/lib/houseSwitch.js); AppLayout imports it lazily, so
// the old house downloads none of it. The page in the middle is the OLD
// room, rendered as `children`, outside any house root, so it keeps its own
// fonts, colours and wallpaper. Same records, same save paths: the frame
// writes nothing but its own runtime list of recent pages (lastTime.js).
//
// Old floating pieces (the reminder card, the save-failed banner, the
// Soundscape pill, the running-activity bubble) hand their contents to the
// attention line through src/lib/houseZones.js while this frame is on
// screen. The floating Support bubble isn't drawn: Support is the bar's last
// place, on every screen, and sheets stop above the bar so it stays live.

import React, { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { LayoutGrid, Info as InfoIcon, Layers as LayersIcon, History, GraduationCap, Pencil,
  SlidersHorizontal, PlayCircle, Map as MapIcon, Boxes, ShoppingCart, Eye, LogOut, Settings as SettingsIcon, Clock,
} from "lucide-react";
import { localEntities } from "@/api/base44Client";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { useBoardsOnScreen } from "@/lib/boardPresence";
import { ALL_PAGES, navAreaGroups, pageLabel } from "@/utils/navigationConfig";
import { openPageTour, openFullTour } from "@/lib/pageTutorials";
import { openSystemSwitcher } from "@/components/systems/SystemSwitcherSheet";
import { exitPreview } from "@/lib/previewMode";
import { setHouseSwitch, announceSupportJump, isHouseHomeRoom, houseSupportRoom, houseTimelineRoom, housePlannerRoom, houseAltersRoom, houseWriteRoom, houseNotebookRoom, houseSettingsRoom, houseMapRoom, houseAnalyticsRoom, houseRemindersRoom, houseGroupsRoom, houseFriendsRoom, housePollsRoom } from "@/lib/houseSwitch";
import { useRoomToolsValue } from "@/house/frame/roomTools";
import { lazyWhenOpen } from "@/lib/lazyWhenOpen";
import { activateHouseZones, useZoneItems } from "@/lib/houseZones";
import { useAttentionSlot, ATTENTION } from "@/lib/attentionSlot";
import { useHouseTokens } from "@/house/tokens/useHouseTokens";
import { HouseScope } from "@/house/tokens/HouseRoot";
import HouseSheets from "@/house/checkin/HouseSheets";
import { Button, IconButton } from "@/house/kit/Button";
import Menu from "@/house/kit/Menu";
import { Sheet } from "@/house/kit/Sheet";
import { Row, Card } from "@/house/kit/Content";
import { ToastHost } from "@/house/kit/Toast";
import PhoneBar from "@/house/kit/frame/PhoneBar";
import AttentionLine from "@/house/kit/frame/AttentionLine";
import DockPanels, { useFreshPageHelp } from "@/house/frame/DockPanels";
import { documentTitleFor, resolvePageTitle, APP_NAME } from "@/house/frame/pageTitle";
import { usePreviewOn, usePageTitle } from "@/house/frame/useFrameData";
import { resolvePlaces, isSupportRoute, pickAttention } from "@/house/phone/phonePlaces";
import { HOUSE_RECENT_KEY, readRecent, recordVisit, touch, lastTimeFrom, awayWords, placePath } from "@/house/phone/lastTime";
import DoSheet, { HouseIconLite } from "@/house/frame/DoSheet";
import { QuickNoteSheet } from "@/components/v2/V2Frame";
import HeaderWave from "@/house/kit/frame/HeaderWave";
import { PixelHome, PixelAlters, PixelTimeline, PixelPen, PixelSupport, PixelSearch, PixelDots, PixelPlus, PixelBack } from "@/house/tokens/PixelGlyphs";
import "@/house/kit/kit.css";
import "@/house/kit/panels.css";
import "@/house/kit/frame/phoneKit.css";
import "@/house/phone/phone.css";

const GlobalSearch = React.lazy(() => import("@/components/dashboard/GlobalSearch"));
// The house's own Home room (board 08-Phone), its own chunk.
const HouseHome = React.lazy(() => import("@/house/home/HouseHome"));
const HouseSupport = React.lazy(() => import("@/house/support/HouseSupport"));
const HouseTimeline = React.lazy(() => import("@/house/timeline/HouseTimeline"));
const HousePlanner = React.lazy(() => import("@/house/planner/HousePlanner"));
const HouseAlters = React.lazy(() => import("@/house/alters/HouseAlters"));
const HouseAlterProfile = React.lazy(() => import("@/house/alters/HouseAlterProfile"));
const HouseJournals = React.lazy(() => import("@/house/write/HouseJournals"));
const HouseChat = React.lazy(() => import("@/house/write/HouseChat"));
const HouseNotebook = React.lazy(() => import("@/house/notebook/HouseNotebook"));
const HouseMap = React.lazy(() => import("@/house/map/HouseMap"));
const HouseAnalytics = React.lazy(() => import("@/house/analytics/HouseAnalytics"));
const HouseReminders = React.lazy(() => import("@/house/reminders/HouseReminders"));
const HouseGroups = React.lazy(() => import("@/house/groups/HouseGroups"));
const HouseFriends = React.lazy(() => import("@/house/friends/HouseFriends"));
const HousePolls = React.lazy(() => import("@/house/polls/HousePolls"));
const HouseSettings = React.lazy(() => import("@/house/settings/HouseSettings"));
// The bar's pixel icons (board 08-Phone), by place.
const PLACE_GLYPHS = { home: PixelHome, alters: PixelAlters, day: PixelTimeline, write: PixelPen, support: PixelSupport, do: PixelPlus };
const SetFrontSheet = lazyWhenOpen(() => import("@/components/fronting/SetFrontSheet"), (p) => p.open);

// ── Runtime: recent pages and the gap since last time ──────────────────
function readRecentStore() {
  try { return readRecent(localStorage.getItem(HOUSE_RECENT_KEY)); } catch { return readRecent(null); }
}
function writeRecentStore(state) {
  try { localStorage.setItem(HOUSE_RECENT_KEY, JSON.stringify(state)); } catch { /* runtime state only */ }
}

function useRecentPages(here) {
  // What was stored before this visit decides "Last time…".
  const [before] = useState(readRecentStore);
  const [lastTime, setLastTime] = useState(() => lastTimeFrom(before));
  const [recent, setRecent] = useState(before.recent);
  const firstHere = useRef(here);
  useEffect(() => {
    const next = recordVisit(readRecentStore(), here);
    writeRecentStore(next);
    setRecent(next.recent);
    // Once the person has gone somewhere else, the card has done its job.
    if (here !== firstHere.current) setLastTime(null);
    firstHere.current = here;
  }, [here]);
  // Leaving (or coming back to) the app: remember when, and offer Last
  // time… again after a long gap away.
  useEffect(() => {
    const onVis = () => {
      const s = readRecentStore();
      if (document.visibilityState === "hidden") { writeRecentStore(touch(s)); return; }
      const lt = lastTimeFrom(s);
      if (lt) setLastTime(lt);
      writeRecentStore(touch(s));
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", onVis);
    return () => { document.removeEventListener("visibilitychange", onVis); window.removeEventListener("pagehide", onVis); };
  }, []);
  return { recent, lastTime, dismissLastTime: () => setLastTime(null) };
}

// The on-screen keyboard is open: a text field has focus and the visual
// viewport is much shorter than the window. The bar hides then (§5).
function useKeyboardOpen() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const vv = window.visualViewport;
    const editable = (el) => !!el && (el.isContentEditable || el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && !/^(checkbox|radio|button|submit|range|color|file)$/i.test(el.type || "text")));
    const check = () => {
      const short = vv ? window.innerHeight - vv.height > 150 : false;
      setOpen(short && editable(document.activeElement));
    };
    let timer = 0;
    const later = () => { clearTimeout(timer); timer = setTimeout(check, 0); };
    vv?.addEventListener("resize", check);
    document.addEventListener("focusin", check);
    document.addEventListener("focusout", later);
    return () => {
      clearTimeout(timer);
      vv?.removeEventListener("resize", check);
      document.removeEventListener("focusin", check);
      document.removeEventListener("focusout", later);
    };
  }, []);
  return open;
}

// Sheets stop at the top of the bottom zone so Support stays one tap away
// (§5, §14): its height goes to --house-sheet-bottom on the document, which
// the kit's portaled sheets and toast inherit, and so do the OLD dialogs
// (phone.css: their scrim ends there, and --house-dialog-sab stands in for
// the bottom safe area they already keep clear).
function useBottomZoneHeight(ref, hidden) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const el = ref.current;
    const set = () => {
      const h = hidden || !el ? 0 : el.offsetHeight;
      root.style.setProperty("--house-sheet-bottom", `${h}px`);
      root.style.setProperty("--house-dialog-sab", `max(var(--os-sab, 0px), ${h}px)`);
    };
    set();
    let ro;
    try { if (el) { ro = new ResizeObserver(set); ro.observe(el); } } catch { /* old engine */ }
    return () => { ro?.disconnect(); };
  }, [ref, hidden]);
  useEffect(() => () => {
    document.documentElement.style.removeProperty("--house-sheet-bottom");
    document.documentElement.style.removeProperty("--house-dialog-sab");
  }, []);
}

// ── Everything: every page by area, and what's open recently ───────────
function EverythingSheet({ open, onClose, groups, recent, terms, formatAlter, here }) {
  const recentRows = useMemo(() => recent
    .filter((r) => r.path !== placePath(here))
    .slice(0, 5)
    .map((r) => {
      const at = r.path.indexOf("?");
      const p = at < 0 ? r.path : r.path.slice(0, at);
      return { path: r.path, title: resolvePageTitle(p, { search: at < 0 ? "" : r.path.slice(at), terms, formatAlter }).title };
    })
    .filter((r) => r.title !== "Page not found"), [recent, here, terms, formatAlter]);
  return (
    <Sheet open={open} onClose={onClose} title="Everything" size="full">
      {recentRows.length ? (
        <section aria-labelledby="hp-ev-recent" className="hp-ev-group">
          <h3 id="hp-ev-recent" className="house-label hp-subhead">Open recently</h3>
          <ul className="hp-list">
            {recentRows.map((r) => <li key={r.path}><Row title={r.title} lead={<HouseIconLite icon={Clock} />} href={r.path} /></li>)}
          </ul>
        </section>
      ) : null}
      {groups.map((g) => (
        <section key={g.id} aria-labelledby={`hp-ev-${g.id}`} className="hp-ev-group">
          <h3 id={`hp-ev-${g.id}`} className="house-label hp-subhead">{g.label}</h3>
          <ul className="hp-list">
            {g.items.map((p) => <li key={p.id}><Row title={p.label} lead={p.icon ? <HouseIconLite icon={p.icon} page={p.id} /> : null} href={p.path} /></li>)}
          </ul>
        </section>
      ))}
    </Sheet>
  );
}

// ── Last time… (on Home after a gap) ───────────────────────────────────
function LastTimeCard({ lastTime, onDismiss, terms, formatAlter }) {
  const navigate = useNavigate();
  const { data: notes = [] } = useQuery({
    queryKey: ["statusNotes"],
    queryFn: () => localEntities.StatusNote.list(),
  });
  const latest = useMemo(() => [...notes].filter((n) => n && !n.trashed_at && n.note)
    .sort((a, b) => String(b.timestamp || "").localeCompare(String(a.timestamp || "")))[0], [notes]);
  const at = lastTime.path.indexOf("?");
  const title = resolvePageTitle(at < 0 ? lastTime.path : lastTime.path.slice(0, at), { search: at < 0 ? "" : lastTime.path.slice(at), terms, formatAlter }).title;
  const when = new Date(lastTime.at).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });
  return (
    <div className="hp-lasttime">
      <Card title="Last time…"
        footer={(
          <>
            <Button rank="primary" onClick={() => { onDismiss(); navigate(lastTime.path); }}>{`Open ${title}`}</Button>
            <Button rank="quiet" onClick={onDismiss}>Not now</Button>
          </>
        )}>
        <p className="hp-lasttime-words">{`You were on ${title} (${when}), ${awayWords(lastTime.away)} ago.`}</p>
        {latest ? <p className="hp-lasttime-words hp-muted">{`Last status: ${latest.note}`}</p> : null}
      </Card>
    </div>
  );
}

// ── The frame ──────────────────────────────────────────────────────────
export default function HousePhoneFrame({ children, mainRef, tail = null }) {
  const tokens = useHouseTokens();
  const location = useLocation();
  const navigate = useNavigate();
  const terms = useTerms();
  const formatAlter = useAlterLabel();
  const here = location.pathname + location.search;
  const page = usePageTitle(location.pathname, location.search, { terms, formatAlter });
  const preview = usePreviewOn();
  const groups = useMemo(() => navAreaGroups(terms, { omit: [] }), [terms]);
  const places = useMemo(() => resolvePlaces(null, ALL_PAGES, terms).map((p) => ({ ...p, icon: PLACE_GLYPHS[p.id] || p.icon })), [terms]);
  const homeRoom = isHouseHomeRoom(location.pathname, location.search);
  const supportRoom = houseSupportRoom(location.pathname);
  const timelineRoom = houseTimelineRoom(location.pathname);
  const plannerRoom = housePlannerRoom(location.pathname);
  const altersRoom = houseAltersRoom(location.pathname);
  // The Write room (boards 05 and 14): Journals and System chat.
  const writeRoom = houseWriteRoom(location.pathname);
  // The Notebook room (boards 18, 19 and 20): pages, notes & lists, flash cards.
  const notebookRoom = houseNotebookRoom(location.pathname);
  // The Settings room (board 07, as a list that drills into each page).
  const settingsRoom = houseSettingsRoom(location.pathname);
  // The System map room (board 11): the canvas, the place's panel, the room's bar.
  const mapRoom = houseMapRoom(location.pathname);
  // The Analytics room (board 06): the range toolbar, the board, the old views.
  const analyticsRoom = houseAnalyticsRoom(location.pathname);
  // The Reminders room (boards 23 and 24): Inbox · Manage, the editor on its own address.
  const remindersRoom = houseRemindersRoom(location.pathname);
  // The Groups room (board 26): the tree, then one group's page with Info · ⋯.
  const groupsRoom = houseGroupsRoom(location.pathname);
  // The Friends room (board 22): Friends · Sharing, one friend on its own history entry.
  const friendsRoom = houseFriendsRoom(location.pathname);
  // The Polls room (board 25): poll cards voted on in place, the poll's sheet.
  const pollsRoom = housePollsRoom(location.pathname);
  // A rebuilt room's own header tools (board 12: Back · name · Info · ⋯, Search moves into ⋯).
  const published = useRoomToolsValue();
  const roomTools = altersRoom || writeRoom || notebookRoom || settingsRoom || mapRoom || analyticsRoom || remindersRoom || groupsRoom || pollsRoom || friendsRoom ? published : null;

  useEffect(() => activateHouseZones(), []);
  useEffect(() => { document.title = documentTitleFor(page.title); }, [page.title]);
  useEffect(() => () => { document.title = APP_NAME; }, []);

  const { recent, lastTime, dismissLastTime } = useRecentPages(here);

  // ── Sheets (one at a time) ──
  const [sheet, setSheet] = useState(null); // "do" | "everything" | "search" | "panels"
  const [panelTab, setPanelTab] = useState("info");
  const [frontOpen, setFrontOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const closeSheet = useCallback(() => setSheet(null), []);
  useEffect(() => { setSheet(null); }, [here]);
  // Support one tap away over the OLD dialogs too (§14): their scrim ends
  // above the bar (phone.css), and arriving at Support closes any still
  // open the way their own close would, so a draft they keep is kept.
  useEffect(() => { if (isSupportRoute(location.pathname)) announceSupportJump(); }, [location.pathname]);
  useEffect(() => { setFrontOpen(false); }, [location.pathname]);
  const openPanels = (tab) => { setPanelTab(tab); setSheet("panels"); };
  const fresh = useFreshPageHelp(location.pathname);

  // ── Header: Back on a page under a place, Everything on a place ──
  const atPlace = places.some((p) => p.path && p.path === location.pathname) || location.pathname === "/settings";
  const back = () => {
    if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
    else navigate("/");
  };

  // ── The pencil: the existing Edit page where there is one ──
  const boards = useBoardsOnScreen();
  const editTarget = location.pathname === "/"
    ? (homeRoom ? null : (boards.includes("os-classic") || !boards.includes("os-v2") ? "os-classic-edit-home" : "os-v2-edit-home"))
    : boards.includes("os-profile") ? "os-profile-edit-home" : null;

  const moreItems = [
    ...(roomTools?.items || []),
    ...(roomTools?.info ? [{ id: "search", label: "Search everything", icon: PixelSearch, onSelect: () => setSheet("search") }] : []),
    { id: "do", label: "Do: quick tools", icon: PixelPlus, onSelect: () => setSheet("do") },
    { id: "everything", label: "Everything", icon: LayoutGrid, onSelect: () => setSheet("everything") },
    { id: "info", label: "Info", icon: InfoIcon, onSelect: () => openPanels("info") },
    { id: "layers", label: "Layers", icon: LayersIcon, onSelect: () => openPanels("layers") },
    { id: "history", label: "History", icon: History, onSelect: () => openPanels("history") },
    { id: "help", label: fresh ? "Help (new for this page)" : "Help", icon: GraduationCap, onSelect: () => openPanels("help") },
    { id: "edit", label: `Edit ${page.title}`, icon: Pencil, disabledReason: editTarget ? undefined : "This page has no layout to edit yet",
      onSelect: () => { if (editTarget) window.dispatchEvent(new CustomEvent(editTarget)); } },
    { id: "display", label: "Display options", icon: SlidersHorizontal, onSelect: () => window.dispatchEvent(new CustomEvent("os-open-display-options")) },
    { id: "around", label: "Show me around this page", icon: PlayCircle, onSelect: () => openPageTour(location.pathname) },
    { id: "tour", label: "Take the tour", icon: MapIcon, onSelect: openFullTour },
    { id: "settings", label: pageLabel("settings", terms), icon: SettingsIcon, onSelect: () => navigate("/settings") },
    { id: "systems", label: `Switch ${terms.system}`, icon: Boxes, onSelect: () => openSystemSwitcher() },
    { id: "cover", label: "Grocery list (privacy cover)", icon: ShoppingCart, onSelect: () => window.dispatchEvent(new CustomEvent("open-grocery-list")) },
    ...(preview ? [{ id: "leave-example", label: `Leave the example ${terms.system}`, icon: Eye, onSelect: () => exitPreview() }] : []),
    { id: "old-house", label: "Use the old house", icon: LogOut, onSelect: () => setHouseSwitch(false) },
  ];

  // ── Attention line ──
  const items = useZoneItems();
  const quiet = isSupportRoute(location.pathname);
  const [at, setAt] = useState(0);
  const { item, rest } = pickAttention(items, { quiet, at });
  useAttentionSlot("house-attention", { priority: ATTENTION.REMINDER, active: !!item, always: true });

  // ── Bottom zone ──
  const keyboard = useKeyboardOpen();
  // A failed save keeps the line even while typing (RULE ZERO).
  const hideBar = keyboard;
  const hideLine = keyboard && !item?.sticky;
  const bottomRef = useRef(null);
  useBottomZoneHeight(bottomRef, hideBar && hideLine);

  const scope = (extra = {}) => ({ tokens, "data-house-size": "phone", ...extra });

  return (
    <HouseSheets tokens={tokens} size="phone">
    <div className="hp" data-house-frame="" data-house-phone="" data-size="phone">
      <HouseScope {...scope()} className="hp-skips">
        <a href="#main-content" className="hp-skip">Skip to the page</a>
      </HouseScope>
      <div aria-live="polite" role="status" className="hp-sr">{page.title}</div>

      <HouseScope {...scope()} as="header" className="hp-head">
        {tokens?.paint?.tokens?.waveOff ? null : <HeaderWave />}
        {atPlace
          ? (
            <Link to="/" className="hp-logo-link" aria-label={`${APP_NAME}: Home`}>
              <img src="/logo.png" alt="" className="hp-logo" />
            </Link>
          )
          : <IconButton icon={PixelBack} rank="secondary" label="Back" onClick={back} />}
        <div className="hp-titles">
          <span className="hp-title house-label">{page.title}</span>
          <span className="hp-sub">
            {page.area?.label ? <span className="hp-area">{page.area.label}</span> : null}
            {preview ? (
              <span className="hp-example" data-house-example="" title="Preview Mode: example data, not yours. Leave it from the ⋯ menu.">{`Example ${terms.system}`}</span>
            ) : null}
          </span>
        </div>
        {roomTools?.info ? (
          <Button rank={roomTools.info.pressed ? "primary" : "secondary"} aria-pressed={roomTools.info.pressed == null ? undefined : !!roomTools.info.pressed}
            aria-label={roomTools.info.ariaLabel} title={roomTools.info.ariaLabel}
            data-tour={roomTools.info.tour || "alter-profile-edit-btn"} onClick={roomTools.info.onSelect}>{roomTools.info.label}</Button>
        ) : (
          <IconButton icon={PixelSearch} label="Search everything" rank="secondary" onClick={() => setSheet("search")} aria-haspopup="dialog" aria-expanded={sheet === "search"} />
        )}
        <Menu label={`More for ${page.title}`} icon={PixelDots} rank="secondary" items={moreItems} />
      </HouseScope>

      <main ref={mainRef} id="main-content" tabIndex={-1} role="main" aria-label={page.title}
        className={homeRoom
          ? "app-content-main hp-canvas hp-canvas--room focus:outline-none relative isolate flex-1 min-w-0 overflow-hidden"
          : `app-content-main hp-canvas focus:outline-none relative isolate flex-1 min-w-0 ${supportRoom || timelineRoom || plannerRoom || altersRoom || writeRoom || notebookRoom || settingsRoom || mapRoom || analyticsRoom || remindersRoom || groupsRoom || pollsRoom || friendsRoom ? "px-0" : "px-4"} py-0 overflow-y-auto overflow-x-hidden`}>
        {location.pathname === "/" && lastTime && !homeRoom ? (
          <HouseScope {...scope()}>
            <LastTimeCard lastTime={lastTime} onDismiss={dismissLastTime} terms={terms} formatAlter={formatAlter} />
          </HouseScope>
        ) : null}
        {children}
        {supportRoom ? (
          <Suspense fallback={null}>
            <HouseSupport room={supportRoom} size="phone" tokens={tokens} />
          </Suspense>
        ) : null}
        {timelineRoom ? (
          <Suspense fallback={null}>
            <HouseTimeline size="phone" tokens={tokens} onSetFront={() => setFrontOpen(true)} />
          </Suspense>
        ) : null}
        {plannerRoom ? (
          <Suspense fallback={null}>
            <HousePlanner size="phone" tokens={tokens} />
          </Suspense>
        ) : null}
        {altersRoom === "directory" ? (
          <Suspense fallback={null}>
            <HouseAlters size="phone" tokens={tokens} />
          </Suspense>
        ) : null}
        {altersRoom === "profile" ? (
          <Suspense fallback={null}>
            <HouseAlterProfile size="phone" tokens={tokens} />
          </Suspense>
        ) : null}
        {writeRoom === "journals" ? (
          <Suspense fallback={null}>
            <HouseJournals size="phone" tokens={tokens} />
          </Suspense>
        ) : null}
        {writeRoom === "chat" ? (
          <Suspense fallback={null}>
            <HouseChat size="phone" tokens={tokens} />
          </Suspense>
        ) : null}
        {notebookRoom ? (
          <Suspense fallback={null}>
            <HouseNotebook size="phone" tokens={tokens} />
          </Suspense>
        ) : null}
        {settingsRoom ? (
          <Suspense fallback={null}>
            <HouseSettings size="phone" tokens={tokens} />
          </Suspense>
        ) : null}
        {mapRoom ? (
          <Suspense fallback={null}>
            <HouseMap size="phone" tokens={tokens} />
          </Suspense>
        ) : null}
        {analyticsRoom ? (
          <Suspense fallback={null}>
            <HouseAnalytics size="phone" tokens={tokens} />
          </Suspense>
        ) : null}
        {remindersRoom ? (
          <Suspense fallback={null}>
            <HouseReminders size="phone" tokens={tokens} />
          </Suspense>
        ) : null}
        {groupsRoom ? (
          <Suspense fallback={null}>
            <HouseGroups size="phone" tokens={tokens} />
          </Suspense>
        ) : null}
        {pollsRoom ? (
          <Suspense fallback={null}>
            <HousePolls size="phone" tokens={tokens} />
          </Suspense>
        ) : null}
        {friendsRoom ? (
          <Suspense fallback={null}>
            <HouseFriends size="phone" tokens={tokens} />
          </Suspense>
        ) : null}
        {homeRoom ? (
          <Suspense fallback={null}>
            <HouseHome size="phone" tokens={tokens} onSetFront={() => setFrontOpen(true)}
              lead={lastTime ? <LastTimeCard lastTime={lastTime} onDismiss={dismissLastTime} terms={terms} formatAlter={formatAlter} /> : null} />
          </Suspense>
        ) : null}
      </main>

      <HouseScope {...scope()} className="hp-bottom" data-keyboard={keyboard || undefined}>
        <div ref={bottomRef} className="hp-bottom-in">
        {hideLine ? null : <AttentionLine item={item} rest={rest} onNext={() => setAt((n) => n + 1)} />}
        {/* A room's own bar (board 12's Edit page · Profile style · Write note):
            docked under the attention line and right above the frame's bar,
            so the page never scrolls under it and Support stays one tap away. */}
        {hideBar || !roomTools?.bar ? null : <div className="hp-roombar">{roomTools.bar}</div>}
        {hideBar ? null : (
          <PhoneBar places={places} pathname={location.pathname} openSheet={sheet}
            onSheet={(p) => setSheet((s) => (s === p.sheet ? null : p.sheet))} />
        )}
        </div>
      </HouseScope>

      <HouseScope {...scope()} className="hp-sheet-host">
        <DoSheet open={sheet === "do"} onClose={closeSheet} onSetFront={() => setFrontOpen(true)} onNote={() => setNoteOpen(true)} />
        <EverythingSheet open={sheet === "everything"} onClose={closeSheet} groups={groups} recent={recent} terms={terms} formatAlter={formatAlter} here={here} />
        <Sheet open={sheet === "search"} onClose={closeSheet} title="Search" size="full">
          <Suspense fallback={<p className="hp-muted">Loading search…</p>}>
            <GlobalSearch autoFocus onNavigate={closeSheet} />
          </Suspense>
        </Sheet>
        <Sheet open={sheet === "panels"} onClose={closeSheet} title={page.title} size="half">
          <DockPanels tab={panelTab} onTab={setPanelTab} page={page} fresh={fresh} />
        </Sheet>
        <ToastHost />
      </HouseScope>

      {frontOpen ? <SetFrontSheet open onClose={() => setFrontOpen(false)} /> : null}
      <QuickNoteSheet open={noteOpen} onClose={() => setNoteOpen(false)} />
    </div>
    {/* The app-wide hosts (reminder toasts, quick actions…) sit inside the
        house's sheet look too, so a check-in they open is drawn as board 16. */}
    {tail}
    </HouseSheets>
  );
}
