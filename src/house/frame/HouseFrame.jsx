// The new house's desktop and tablet frame (step 2.1, plan §3 "Floor plan").
//
// Loaded ONLY when the person turned on "Try the new house" on this device
// and the window is studio-sized (src/lib/houseSwitch.js); AppLayout imports
// this file lazily, so with the switch off none of src/house is downloaded.
//
//   ┌ top bar: Home · area menus (NAV_AREAS) · Search · ⋯ ──────────────┐
//   ├ open-page tabs ────────────────────────────────────────────────────┤
//   │rail│ left panel │        the page (old room)       │ right dock     │
//   │    │  (Browse)  │                                  │ Info Layers    │
//   │    │            │                                  │ History Help   │
//   ├ bottom dock (when a room provides one) ────────────────────────────┤
//   └ status bar: ✎ · Saved · Synced · Next reminder · Example system ───┘
//
// Full studio (≥ 1024 effective px): everything. Compact (640–1023): the
// rail, the left panel and the page; Info and the other dock tabs open as a
// sheet from the right; one side panel at a time. Docks show, hide and
// resize within the building code's limits and are kept per device and per
// page through dockPrefs.js (the one writer). Drag-to-dock is Phase 4.
//
// A room that isn't rebuilt is the OLD page, rendered as `children` (the
// route outlet) in the middle. Same records, same save paths: the frame
// writes nothing but its own docks and tabs.
//
// Paint: every piece of chrome is a HouseScope sharing one reading of the
// person's paint (useHouseTokens), so the chrome is drawn with house tokens
// only. The page in the middle is NOT inside a house root, so the old room
// keeps its own fonts and colours, and its wallpaper (page looks, the home
// board) shows as it always did.

import React, { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  Search, PanelLeft, PanelRight, SlidersHorizontal,
  PlayCircle, Map as MapIcon, ShoppingCart, Boxes, LogOut, Eye, Compass,
} from "lucide-react";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { useFrontPresence } from "@/lib/useFrontPresence";
import { useBoardsOnScreen } from "@/lib/boardPresence";
import { navAreaGroups } from "@/utils/navigationConfig";
import { openPageTour, openFullTour } from "@/lib/pageTutorials";
import { openSystemSwitcher } from "@/components/systems/SystemSwitcherSheet";
import { exitPreview } from "@/lib/previewMode";
import { retrySave } from "@/lib/localDb";
import { clockOpts } from "@/lib/timeFormat";
import { setHouseSwitch, useHouseSizeClass, announceSupportJump, isHouseHomeRoom, houseSupportRoom, houseTimelineRoom, housePlannerRoom, houseAltersRoom, houseWriteRoom, houseNotebookRoom, houseSettingsRoom, houseMapRoom, houseAnalyticsRoom, houseRemindersRoom, houseGroupsRoom } from "@/lib/houseSwitch";
import { APP_VERSION } from "@/lib/appVersion";
import { isSupportRoute } from "@/house/phone/phonePlaces";
import { lazyWhenOpen } from "@/lib/lazyWhenOpen";
import { useHouseTokens } from "@/house/tokens/useHouseTokens";
import { HouseScope } from "@/house/tokens/HouseRoot";
import HouseSheets from "@/house/checkin/HouseSheets";
import { Button, IconButton } from "@/house/kit/Button";
import { Sheet } from "@/house/kit/Sheet";
import { ToastHost } from "@/house/kit/Toast";
import { TreeView, RowText } from "@/house/kit/TreeList";
import { KitPopover } from "@/house/kit/KitLayer";
import OpenTabs from "@/house/kit/frame/OpenTabs";
import DockResizer from "@/house/kit/frame/DockResizer";
import AreaMenus from "@/house/kit/frame/AreaMenus";
import HeaderWave from "@/house/kit/frame/HeaderWave";
import {
  PixelHeart, PixelSwitch, PixelCalendar, PixelPerson, PixelPen, PixelBubble, PixelPlus, PixelGrid, PixelGear, PixelSupport,
} from "@/house/tokens/PixelGlyphs";
import DoSheet from "@/house/frame/DoSheet";
import { QuickNoteSheet } from "@/components/v2/V2Frame";
import { StatusBar, StatusItem, StatusLink, StatusButton, StatusSpacer } from "@/house/kit/frame/StatusBar";
import DockPanels, { useFreshPageHelp } from "@/house/frame/DockPanels";
import { signingWords } from "@/house/frame/signing";
import { DOCK_LIMITS, HOUSE_LAYOUT_EVENT, dockFor, layoutPageKey, loadLayout, saveDock, clampDockSize } from "@/house/frame/dockPrefs";
import { documentTitleFor, resolvePageTitle, APP_NAME } from "@/house/frame/pageTitle";
import { HOUSE_TABS_KEY, readTabs, followTo, openTab, selectTab, closeTab } from "@/house/frame/openTabs";
import { useSaveHealth, useLastSync, usePreviewOn, useNextReminder, useAttributionPolicy, usePageTitle } from "@/house/frame/useFrameData";
import "@/house/kit/kit.css";
import "@/house/kit/panels.css";
import "@/house/kit/frame/frameKit.css";
import "@/house/frame/frame.css";

const GlobalSearch = React.lazy(() => import("@/components/dashboard/GlobalSearch"));
// The house's own Home room (boards 01-Main and 08-Phone), its own chunk.
const HouseHome = React.lazy(() => import("@/house/home/HouseHome"));
const HouseSupport = React.lazy(() => import("@/house/support/HouseSupport"));
const HouseTimeline = React.lazy(() => import("@/house/timeline/HouseTimeline"));
const HousePlanner = React.lazy(() => import("@/house/planner/HousePlanner"));
const HouseAlters = React.lazy(() => import("@/house/alters/HouseAlters"));
const HouseAlterProfile = React.lazy(() => import("@/house/alters/HouseAlterProfile"));
const HouseJournals = React.lazy(() => import("@/house/write/HouseJournals"));
const HouseChat = React.lazy(() => import("@/house/write/HouseChat"));
const HouseNotebook = React.lazy(() => import("@/house/notebook/HouseNotebook"));
const HouseSettings = React.lazy(() => import("@/house/settings/HouseSettings"));
const HouseMap = React.lazy(() => import("@/house/map/HouseMap"));
const HouseAnalytics = React.lazy(() => import("@/house/analytics/HouseAnalytics"));
const HouseReminders = React.lazy(() => import("@/house/reminders/HouseReminders"));
const HouseGroups = React.lazy(() => import("@/house/groups/HouseGroups"));
const SetFrontSheet = lazyWhenOpen(() => import("@/components/fronting/SetFrontSheet"), (p) => p.open);

const RAIL_REM = 3.5;
const CANVAS_MIN = { full: 30, compact: 20 };
const timeOf = (d) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", ...clockOpts() });
const remPx = () => { try { return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16; } catch { return 16; } };

function useViewportRem() {
  const read = () => (typeof window === "undefined" ? { w: 80, h: 50 } : { w: window.innerWidth / remPx(), h: window.innerHeight / remPx() });
  const [v, setV] = useState(read);
  useEffect(() => {
    // Only a real change re-renders the frame: <html> also changes class
    // and style for things that have nothing to do with its size (the
    // phone frame's bar height, themes), and a new object each time would
    // redraw the whole frame for nothing.
    const on = () => setV((prev) => {
      const next = read();
      return Math.abs(next.w - prev.w) < 0.01 && Math.abs(next.h - prev.h) < 0.01 ? prev : next;
    });
    window.addEventListener("resize", on);
    const mo = new MutationObserver(on);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
    return () => { window.removeEventListener("resize", on); mo.disconnect(); };
  }, []);
  return v;
}

// The docks' saved state, live (this tab's writes and other tabs').
function useLayout() {
  const [layout, setLayout] = useState(() => loadLayout());
  useEffect(() => {
    const on = () => setLayout(loadLayout());
    window.addEventListener(HOUSE_LAYOUT_EVENT, on);
    const onStorage = (e) => { if (!e.key || e.key.startsWith("symphony_house_layout")) on(); };
    window.addEventListener("storage", onStorage);
    return () => { window.removeEventListener(HOUSE_LAYOUT_EVENT, on); window.removeEventListener("storage", onStorage); };
  }, []);
  return layout;
}

function useOpenTabState(here) {
  const [state, setState] = useState(() => {
    let raw = null;
    try { raw = localStorage.getItem(HOUSE_TABS_KEY); } catch { /* blocked */ }
    return readTabs(raw, here);
  });
  const write = (next) => { try { localStorage.setItem(HOUSE_TABS_KEY, JSON.stringify(next)); } catch { /* runtime state only */ } return next; };
  useEffect(() => { setState((s) => write(followTo(s, here))); }, [here]);
  return [state, (fn) => setState((s) => write(fn(s)))];
}

// ── Top bar (board 01-Main): wave · logo + name · area menus · search ──
function TopBar({ size, groups, currentPath, onGo, onNewTab, onPages, pagesOpen, searchOpen, setSearchOpen, waveOn }) {
  const areasRef = useRef(null);
  const searchRef = useRef(null);
  const needRef = useRef(0);
  const [collapsed, setCollapsed] = useState(size === "compact");
  // Area menus while they fit; one "Pages" button (the Browse panel) when
  // they don't, so long custom words never push Search off the bar.
  useLayoutEffect(() => {
    if (size === "compact") { setCollapsed(true); return undefined; }
    const el = areasRef.current;
    if (!el) return undefined;
    const check = () => {
      if (!collapsed) {
        if (el.scrollWidth > el.clientWidth + 1) { needRef.current = el.scrollWidth; setCollapsed(true); }
      } else if (needRef.current && el.clientWidth >= needRef.current) {
        setCollapsed(false);
      } else if (!needRef.current) {
        setCollapsed(false);
      }
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [size, collapsed, groups]);

  const mac = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform || "");
  return (
    <div className="hf-topbar">
      {waveOn ? <HeaderWave /> : null}
      <Link to="/" className="hf-home" aria-label={`${APP_NAME}: Home`} title="Home">
        <img src="/logo.png" alt="" className="hf-logo" />
        <span className="hf-appname house-label" aria-hidden="true">{APP_NAME}</span>
      </Link>
      <div ref={areasRef} className="hf-areas" data-collapsed={collapsed || undefined}>
        {collapsed ? (
          <Button rank="quiet" icon={Compass} aria-expanded={pagesOpen} onClick={onPages}>Pages</Button>
        ) : (
          <AreaMenus groups={groups} currentPath={currentPath} onGo={onGo} onNewTab={onNewTab} />
        )}
      </div>
      <Button ref={searchRef} rank="secondary" aria-expanded={searchOpen} aria-haspopup="dialog"
        onClick={() => setSearchOpen((o) => !o)} className="hf-search-btn" icon={size === "compact" ? Search : undefined}>
        <span>{size === "compact" ? "Search" : "Search everything"}</span>
        <span className="hf-kbd" aria-hidden="true">{mac ? "⌘K" : "Ctrl K"}</span>
      </Button>
      <KitPopover open={searchOpen} anchorRef={searchRef} onClose={() => setSearchOpen(false)} label="Search everything" className="hf-search-pop">
        <Suspense fallback={<p className="hf-muted">Loading search…</p>}>
          <GlobalSearch autoFocus onNavigate={() => setSearchOpen(false)} />
        </Suspense>
      </KitPopover>
    </div>
  );
}

// ── Browse (the left panel for an old room): every page by area ────────
function BrowsePanel({ groups, currentId }) {
  const navigate = useNavigate();
  const nodes = useMemo(() => {
    const out = [];
    for (const g of groups) {
      out.push({ id: `area:${g.id}`, parent: null, label: g.label, area: true });
      for (const p of g.items) out.push({ id: p.id, parent: `area:${g.id}`, label: p.label, path: p.path });
    }
    return out;
  }, [groups]);
  return (
    <div className="hf-browse">
      <h2 className="house-label hf-panel-title">Pages</h2>
      <TreeView label="Every page, by area" nodes={nodes} getParentId={(n) => n.parent} value={currentId}
        onSelect={(n) => { if (n.path) navigate(n.path); }}
        renderRow={(n) => <RowText title={n.label} />} />
    </div>
  );
}

// ── Status bar (board 01-Main): Saved · Synced · Next reminder · … · Look · version ──
function FrameStatus({ size, look }) {
  const terms = useTerms();
  const health = useSaveHealth();
  const lastSync = useLastSync();
  const next = useNextReminder();
  const preview = usePreviewOn();
  const [retrying, setRetrying] = useState(false);
  return (
    <StatusBar label="Status" tall={!health.ok}>
      {health.ok
        ? <StatusItem>Saved</StatusItem>
        : (
          <StatusButton tone="warn" label="Not saved. Try again" onClick={async () => { setRetrying(true); try { await retrySave(); } finally { setRetrying(false); } }}>
            {retrying ? "Saving…" : "Not saved yet · Try again"}
          </StatusButton>
        )}
      {lastSync ? <StatusLink to="/settings#device-sync" title="Sync between devices">Synced {timeOf(new Date(lastSync))}</StatusLink> : null}
      {next ? <StatusLink to="/reminders" title="Your next reminder">Next reminder: {next.title} {timeOf(new Date(next.at))}</StatusLink> : null}
      <StatusSpacer />
      {preview ? <span data-house-example=""><StatusItem tone="label" title="Preview Mode: example data, not yours. Leave it from the More menu.">{`Example ${terms.system}`}</StatusItem></span> : null}
      <StatusButton label="Look: change it in Display options" onClick={() => window.dispatchEvent(new CustomEvent("os-open-display-options"))}>
        {`Look: ${look === "pixel" ? "Pixel" : "Smooth"}${size === "compact" ? " · compact" : ""}`}
      </StatusButton>
      <StatusItem>{`v${APP_VERSION}`}</StatusItem>
    </StatusBar>
  );
}

// ── The frame ──────────────────────────────────────────────────────────
export default function HouseFrame({ children, mainRef, tail = null }) {
  const tokens = useHouseTokens();
  const sizeClass = useHouseSizeClass();
  const size = sizeClass === "compact" ? "compact" : "full";
  const location = useLocation();
  const navigate = useNavigate();
  const terms = useTerms();
  const formatAlter = useAlterLabel();
  const vp = useViewportRem();
  const here = location.pathname + location.search;

  const page = usePageTitle(location.pathname, location.search, { terms, formatAlter });
  const homeRoom = isHouseHomeRoom(location.pathname, location.search);
  const supportRoom = houseSupportRoom(location.pathname);
  // The Timeline room draws its own Info and Layers too (board 01's right dock).
  const timelineRoom = houseTimelineRoom(location.pathname);
  // The Planner room draws its own side columns (board 04).
  const plannerRoom = housePlannerRoom(location.pathname);
  // The Alters room draws Groups and Info itself (board 03) and the profile's own columns.
  const altersRoom = houseAltersRoom(location.pathname);
  // The Write room (boards 05 and 14): Journals and System chat.
  const writeRoom = houseWriteRoom(location.pathname);
  // The Notebook room (boards 18, 19 and 20): pages, notes & lists, flash cards.
  const notebookRoom = houseNotebookRoom(location.pathname);
  // The Settings room (board 07): the section list, the page, the Preview.
  const settingsRoom = houseSettingsRoom(location.pathname);
  // The System map room (board 02): tools, the maps over the canvas, Layers and Info.
  const mapRoom = houseMapRoom(location.pathname);
  // The Analytics room (board 06): the range toolbar, the board, the old views.
  const analyticsRoom = houseAnalyticsRoom(location.pathname);
  // The Reminders room (boards 23 and 24): Due now, Your reminders, the editor, the status line.
  const remindersRoom = houseRemindersRoom(location.pathname);
  // The Groups room (board 26): the tree, the group's page and its panels.
  const groupsRoom = houseGroupsRoom(location.pathname);
  const ownDocks = homeRoom || timelineRoom || plannerRoom || !!altersRoom || !!writeRoom || notebookRoom || settingsRoom || mapRoom || analyticsRoom || remindersRoom || !!groupsRoom;
  const preview = usePreviewOn();

  // Real names in the browser title (and back to the app's name on leaving).
  useEffect(() => { document.title = documentTitleFor(page.title); }, [page.title]);
  useEffect(() => () => { document.title = APP_NAME; }, []);

  // ── Docks ──
  const layout = useLayout();
  const pageKey = layoutPageKey(location.pathname);
  const left = dockFor(layout, pageKey, "left", size, { pageHeightRem: vp.h });
  const right = dockFor(layout, pageKey, "right", size, { pageHeightRem: vp.h });
  const [live, setLive] = useState({}); // sizes while a resizer is being dragged
  useEffect(() => setLive({}), [pageKey, size]);
  const leftW = live.left ?? left.size;
  const rightW = live.right ?? right.size;
  const keep = useCallback((dock, patch) => saveDock(pageKey, dock, patch, { sizeClass: size, pageHeightRem: vp.h }), [pageKey, size, vp.h]);

  // Collapse order (building code §4): the right dock becomes a sheet
  // first, then the left panel folds; the page never drops under its minimum.
  // The house's Home room draws its own docks (Info, Layers, the timeline),
  // as board 01-Main does, so the frame's side panels stay away from it.
  const minCanvas = CANVAS_MIN[size];
  const room = vp.w - RAIL_REM;
  const rightDocked = !ownDocks && size === "full" && right.shown && room - (left.shown ? leftW : 0) - rightW >= minCanvas;
  const [sheetOpen, setSheetOpen] = useState(false);
  useEffect(() => { setSheetOpen(false); }, [pageKey]);
  const leftFits = room - leftW - (rightDocked ? rightW : 0) >= minCanvas;
  // Compact: one side panel at a time.
  const [pagesOverHome, setPagesOverHome] = useState(false);
  useEffect(() => { setPagesOverHome(false); }, [here]);
  const leftDocked = homeRoom ? pagesOverHome : (left.shown && leftFits && !(size === "compact" && sheetOpen));
  const dockAsSheet = !rightDocked;

  const toggleLeft = () => {
    if (homeRoom) { setPagesOverHome((o) => !o); return; }
    if (leftDocked) { keep("left", { shown: false }); return; }
    setSheetOpen(false);
    keep("left", { shown: true });
  };
  const toggleRight = () => {
    if (dockAsSheet) { setSheetOpen((o) => !o); return; }
    keep("right", { shown: !right.shown });
  };
  const setTab = (tab) => keep("right", { tab });

  const fresh = useFreshPageHelp(location.pathname);

  // ── Search (Ctrl/Cmd+K) ──
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => {
    const key = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) { e.preventDefault(); setSearchOpen((o) => !o); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  useEffect(() => { setSearchOpen(false); }, [here]);
  // Support one tap away over the OLD dialogs too (§14): the rail's Support
  // button sits above their scrim (frame.css), and arriving at Support
  // closes any still open the way their own close would, so a draft they
  // keep is kept.
  useEffect(() => { if (isSupportRoute(location.pathname)) announceSupportJump(); }, [location.pathname]);

  // ── Open-page tabs ──
  const [tabs, setTabs] = useOpenTabState(here);
  const tabTitle = (path) => (path === here ? page.title : null);
  const tabNames = useTabNames(tabs.tabs, { terms, formatAlter });
  const tabList = tabs.tabs.map((t) => ({ id: t.id, path: t.path, title: tabTitle(t.path) || tabNames[t.id] || "Page" }));
  const openInTab = (path) => { setTabs((s) => openTab(s, path)); navigate(path); };

  // ── Who is in front, for the rail's Switch tool: what the person's
  // "Entries belong to" setting does with them (signing.js). ──
  const { fronters } = useFrontPresence();
  const policy = useAttributionPolicy();
  const [frontOpen, setFrontOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [doOpen, setDoOpen] = useState(false);
  useEffect(() => { setFrontOpen(false); setDoOpen(false); }, [location.pathname]);
  const signLabel = signingWords({ names: fronters.map(({ alter }) => formatAlter(alter)), policy, terms }).label;

  // ── The page tools: the existing Edit page where there is one ──
  const boards = useBoardsOnScreen();
  const editTarget = location.pathname === "/"
    ? (homeRoom ? null : (boards.includes("os-classic") || !boards.includes("os-v2") ? "os-classic-edit-home" : "os-v2-edit-home"))
    : boards.includes("os-profile") ? "os-profile-edit-home" : null;
  const editPage = () => { if (editTarget) window.dispatchEvent(new CustomEvent(editTarget)); };
  const displayOptions = () => window.dispatchEvent(new CustomEvent("os-open-display-options"));
  const checkIn = () => {
    if (location.pathname === "/") window.dispatchEvent(new CustomEvent("open-quick-checkin"));
    else navigate("/?action=quick-checkin");
  };

  // The area menus (board 01-Main): every area, and the More area also
  // carries the frame's own tools (rows without a path run their action).
  const groups = useMemo(() => {
    const all = navAreaGroups(terms, { omit: [] });
    const tools = [
      { id: "t-display", label: "Display options", icon: SlidersHorizontal, onSelect: displayOptions },
      { id: "t-pages", label: leftDocked ? "Hide the pages panel" : "Show the pages panel", icon: PanelLeft, onSelect: toggleLeft },
      ...(ownDocks ? [] : [{ id: "t-side", label: (rightDocked || sheetOpen) ? "Hide the side panel" : "Show the side panel", icon: PanelRight, onSelect: toggleRight }]),
      { id: "t-around", label: "Show me around this page", icon: PlayCircle, onSelect: () => openPageTour(location.pathname) },
      { id: "t-tour", label: "Take the tour", icon: MapIcon, onSelect: openFullTour },
      { id: "t-systems", label: `Switch ${terms.system}`, icon: Boxes, onSelect: () => openSystemSwitcher() },
      { id: "t-cover", label: "Grocery list (privacy cover)", icon: ShoppingCart, onSelect: () => window.dispatchEvent(new CustomEvent("open-grocery-list")) },
      ...(preview ? [{ id: "t-leave", label: `Leave the example ${terms.system}`, icon: Eye, onSelect: () => exitPreview() }] : []),
      { id: "t-old", label: "Use the old house", icon: LogOut, onSelect: () => setHouseSwitch(false) },
    ];
    const hasMore = all.some((g) => g.id === "more");
    const out = all.map((g) => (g.id === "more" ? { ...g, items: [...g.items, ...tools] } : g));
    return hasMore ? out : [...out, { id: "more", label: "More", items: tools }];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terms, preview, homeRoom, ownDocks, leftDocked, rightDocked, sheetOpen, location.pathname]);
  const browseGroups = useMemo(() => groups.map((g) => ({ ...g, items: g.items.filter((it) => it.path) })).filter((g) => g.items.length), [groups]);

  const scope = (extra = {}) => ({ tokens, "data-house-size": size, ...extra });
  const dockBody = <DockPanels tab={right.tab} onTab={setTab} page={page} fresh={fresh} />;
  const limL = DOCK_LIMITS[size].left;
  const limR = DOCK_LIMITS[size].right;
  const waveOn = !tokens?.paint?.tokens?.waveOff;

  return (
    <HouseSheets tokens={tokens} size={size}>
    <div className="hf" data-house-frame="" data-size={size} data-home-room={homeRoom || undefined}>
      <HouseScope {...scope()} className="hf-skips">
        <a href="#main-content" className="hf-skip">Skip to the page</a>
      </HouseScope>
      <div aria-live="polite" role="status" className="hf-sr">{page.title}</div>

      <HouseScope {...scope()} as="header" className="hf-top">
        <TopBar size={size} groups={groups} currentPath={location.pathname} onGo={(p) => navigate(p)} onNewTab={openInTab}
          onPages={toggleLeft} pagesOpen={leftDocked} searchOpen={searchOpen} setSearchOpen={setSearchOpen} waveOn={waveOn} />
        <OpenTabs tabs={tabList} current={tabs.active}
          onSelect={(t) => { setTabs((s) => selectTab(s, t.id)); if (t.path !== here) navigate(t.path); }}
          onClose={(t) => {
            let goTo = null;
            setTabs((s) => { const r = closeTab(s, t.id); goTo = r.goTo; return r.state; });
            setTimeout(() => { if (goTo && goTo !== here) navigate(goTo); }, 0);
          }}
          onNew={() => openInTab("/")}
          max={size === "compact" ? 4 : 8} />
      </HouseScope>

      <div className="hf-body">
        {/* The rail (board 01-Main): QUICK tools, then PAGE tools. Support
            stays one tap away here (building code §14). */}
        <HouseScope {...scope()} as="nav" className="hf-rail" aria-label="Tools">
          <span className="hf-rail-label house-label" aria-hidden="true">Quick</span>
          <IconButton icon={PixelHeart} rank="primary" label="Check in" onClick={checkIn} />
          <IconButton icon={PixelSwitch} label={`${terms.Switch}: ${signLabel}`} onClick={() => setFrontOpen(true)} />
          <IconButton icon={PixelCalendar} label="Plan or to-do" onClick={() => navigate("/?action=quick-thing")} />
          <IconButton icon={PixelPerson} label="Start an activity" onClick={() => navigate("/?action=start-activity")} />
          <IconButton icon={PixelPen} label="Write" onClick={() => navigate("/journals?compose=1")} />
          <IconButton icon={PixelBubble} label="Status or note" onClick={() => setNoteOpen(true)} />
          <IconButton icon={PixelPlus} label="More quick tools" onClick={() => setDoOpen(true)} />
          <IconButton icon={PixelSupport} label="Support" className="hf-rail-support" data-house-support="" onClick={() => navigate("/grounding")} />
          <span className="hf-rail-gap" />
          <span className="hf-rail-label house-label" aria-hidden="true">Page</span>
          <IconButton icon={PixelGrid} label="Edit page" onClick={editPage}
            disabledReason={editTarget ? undefined : "This page has no layout to edit yet"} />
          <IconButton icon={PixelGear} label="Display options" onClick={displayOptions} />
        </HouseScope>

        {leftDocked ? (
          <HouseScope {...scope()} as="aside" className="hf-left" aria-label="Pages panel" style={{ width: `${leftW}rem` }}>
            <div className="hf-dock-scroll"><BrowsePanel groups={browseGroups} currentId={page.pageId} /></div>
            <DockResizer label="the pages panel" side="left" value={leftW} min={limL.min} max={limL.max} def={limL.def}
              onChange={(v) => setLive((l) => ({ ...l, left: v }))} onCommit={(v) => { keep("left", { size: v }); setLive((l) => ({ ...l, left: undefined })); }} />
          </HouseScope>
        ) : null}

        <main ref={mainRef} id="main-content" tabIndex={-1} role="main" aria-label={page.title}
          className={ownDocks
            ? "app-content-main hf-canvas hf-canvas--room focus:outline-none relative isolate flex-1 min-w-0 overflow-hidden"
            : "app-content-main hf-canvas focus:outline-none relative isolate flex-1 min-w-0 px-4 lg:px-6 py-4 lg:py-8 overflow-y-auto overflow-x-hidden"}>
          {children}
          {supportRoom ? (
            <Suspense fallback={null}>
              <HouseSupport room={supportRoom} size={size} tokens={tokens} />
            </Suspense>
          ) : null}
          {timelineRoom ? (
            <Suspense fallback={null}>
              <HouseTimeline size={size} tokens={tokens} onSetFront={() => setFrontOpen(true)} />
            </Suspense>
          ) : null}
          {plannerRoom ? (
            <Suspense fallback={null}>
              <HousePlanner size={size} tokens={tokens} />
            </Suspense>
          ) : null}
          {altersRoom === "directory" ? (
            <Suspense fallback={null}>
              <HouseAlters size={size} tokens={tokens} />
            </Suspense>
          ) : null}
          {altersRoom === "profile" ? (
            <Suspense fallback={null}>
              <HouseAlterProfile size={size} tokens={tokens} />
            </Suspense>
          ) : null}
          {writeRoom === "journals" ? (
            <Suspense fallback={null}>
              <HouseJournals size={size} tokens={tokens} />
            </Suspense>
          ) : null}
          {writeRoom === "chat" ? (
            <Suspense fallback={null}>
              <HouseChat size={size} tokens={tokens} />
            </Suspense>
          ) : null}
          {notebookRoom ? (
            <Suspense fallback={null}>
              <HouseNotebook size={size} tokens={tokens} />
            </Suspense>
          ) : null}
          {settingsRoom ? (
            <Suspense fallback={null}>
              <HouseSettings size={size} tokens={tokens} />
            </Suspense>
          ) : null}
          {mapRoom ? (
            <Suspense fallback={null}>
              <HouseMap size={size} tokens={tokens} />
            </Suspense>
          ) : null}
          {analyticsRoom ? (
            <Suspense fallback={null}>
              <HouseAnalytics size={size} tokens={tokens} />
            </Suspense>
          ) : null}
          {remindersRoom ? (
            <Suspense fallback={null}>
              <HouseReminders size={size} tokens={tokens} />
            </Suspense>
          ) : null}
          {groupsRoom ? (
            <Suspense fallback={null}>
              <HouseGroups size={size} tokens={tokens} />
            </Suspense>
          ) : null}
          {homeRoom ? (
            <Suspense fallback={null}>
              <HouseHome size={size} tokens={tokens} onSetFront={() => setFrontOpen(true)} />
            </Suspense>
          ) : null}
        </main>

        {rightDocked ? (
          <HouseScope {...scope()} as="aside" className="hf-right" aria-label={`Side panel for ${page.title}`} style={{ width: `${rightW}rem` }}>
            <DockResizer label="the side panel" side="right" value={rightW} min={limR.min} max={limR.max} def={limR.def}
              onChange={(v) => setLive((l) => ({ ...l, right: v }))} onCommit={(v) => { keep("right", { size: clampDockSize("right", v, size) }); setLive((l) => ({ ...l, right: undefined })); }} />
            <div className="hf-dock-scroll">{dockBody}</div>
          </HouseScope>
        ) : null}
      </div>

      <HouseScope {...scope()}>
        <FrameStatus size={size} look={tokens?.look} />
      </HouseScope>

      {/* Compact studio (and a full studio too narrow to dock it): the
          dock opens as a sheet from the right. */}
      <HouseScope {...scope()} className="hf-sheet-host">
        <Sheet open={!ownDocks && dockAsSheet && sheetOpen} onClose={() => setSheetOpen(false)} side="right" title={page.title}
          tools={size === "full" ? <Button rank="quiet" onClick={() => { setSheetOpen(false); keep("right", { shown: true }); }}>Dock it</Button> : null}>
          {dockBody}
        </Sheet>
        <DoSheet open={doOpen} onClose={() => setDoOpen(false)} onSetFront={() => setFrontOpen(true)} onNote={() => setNoteOpen(true)} />
        {/* The kit's toasts (Undo after a change), as the phone frame has. */}
        <ToastHost />
      </HouseScope>

      {frontOpen ? <SetFrontSheet open onClose={() => setFrontOpen(false)} /> : null}
      {noteOpen ? <QuickNoteSheet open onClose={() => setNoteOpen(false)} /> : null}
    </div>
    {/* The app-wide hosts (reminder toasts, quick actions…) sit inside the
        house's sheet look too, so a check-in they open is drawn as board 16. */}
    {tail}
    </HouseSheets>
  );
}

// Names for the tabs that aren't on screen, from the same resolver as the
// page title. Profiles are named from the shared caches when they're loaded;
// otherwise by their kind (tabs are bookmarks, not live pages).
function useTabNames(tabs, { terms, formatAlter }) {
  const qc = useQueryClient();
  return useMemo(() => {
    const records = {
      alters: qc.getQueryData(["alters"]) || [],
      groups: qc.getQueryData(["groups"]) || [],
      contacts: qc.getQueryData(["contacts"]) || [],
      innerWorldLocations: qc.getQueryData(["innerWorldLocations"]) || [],
    };
    const out = {};
    for (const t of tabs) {
      const at = String(t.path).indexOf("?");
      const p = at < 0 ? t.path : t.path.slice(0, at);
      const q = at < 0 ? "" : t.path.slice(at);
      out[t.id] = resolvePageTitle(p, { search: q, terms, formatAlter, records }).title;
    }
    return out;
  }, [tabs, terms, formatAlter, qc]);
}
