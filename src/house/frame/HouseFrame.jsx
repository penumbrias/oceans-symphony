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
  Search, MoreHorizontal, LifeBuoy, PanelLeft, PanelRight, SlidersHorizontal, Pencil,
  Settings as SettingsIcon, PlayCircle, Map as MapIcon, ShoppingCart, Boxes, LogOut, Eye, Compass, Users,
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
import { setHouseSwitch, useHouseSizeClass } from "@/lib/houseSwitch";
import { lazyWhenOpen } from "@/lib/lazyWhenOpen";
import { useHouseTokens } from "@/house/tokens/useHouseTokens";
import { HouseScope } from "@/house/tokens/HouseRoot";
import { Button, IconButton } from "@/house/kit/Button";
import Menu from "@/house/kit/Menu";
import { Sheet } from "@/house/kit/Sheet";
import { TreeView, RowText } from "@/house/kit/TreeList";
import { KitPopover } from "@/house/kit/KitLayer";
import OpenTabs from "@/house/kit/frame/OpenTabs";
import DockResizer from "@/house/kit/frame/DockResizer";
import SigningSwatch from "@/house/kit/frame/SigningSwatch";
import { StatusBar, StatusItem, StatusLink, StatusButton, StatusSpacer } from "@/house/kit/frame/StatusBar";
import DockPanels, { useFreshPageHelp } from "@/house/frame/DockPanels";
import { DOCK_LIMITS, HOUSE_LAYOUT_EVENT, dockFor, layoutPageKey, loadLayout, saveDock, clampDockSize } from "@/house/frame/dockPrefs";
import { documentTitleFor, resolvePageTitle, APP_NAME } from "@/house/frame/pageTitle";
import { HOUSE_TABS_KEY, readTabs, followTo, openTab, selectTab, closeTab } from "@/house/frame/openTabs";
import { useSettingsRow, useSaveHealth, useLastSync, usePreviewOn, useNextReminder, useFrontTrackingOff, usePageTitle } from "@/house/frame/useFrameData";
import "@/house/kit/kit.css";
import "@/house/kit/panels.css";
import "@/house/kit/frame/frameKit.css";
import "@/house/frame/frame.css";

const GlobalSearch = React.lazy(() => import("@/components/dashboard/GlobalSearch"));
const SetFrontSheet = lazyWhenOpen(() => import("@/components/fronting/SetFrontSheet"), (p) => p.open);

const RAIL_REM = 3;
const CANVAS_MIN = { full: 30, compact: 20 };
const timeOf = (d) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", ...clockOpts() });
const remPx = () => { try { return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16; } catch { return 16; } };

function useViewportRem() {
  const read = () => (typeof window === "undefined" ? { w: 80, h: 50 } : { w: window.innerWidth / remPx(), h: window.innerHeight / remPx() });
  const [v, setV] = useState(read);
  useEffect(() => {
    const on = () => setV(read());
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

// ── Top bar ────────────────────────────────────────────────────────────
function TopBar({ size, groups, moreItems, onPages, pagesOpen, searchOpen, setSearchOpen }) {
  const navigate = useNavigate();
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
      <Link to="/" className="hf-home" aria-label="Home" title="Home">
        <img src="/logo.png" alt="" className="hf-logo" />
      </Link>
      <div ref={areasRef} className="hf-areas" data-collapsed={collapsed || undefined}>
        {collapsed ? (
          <Button rank="quiet" icon={Compass} aria-expanded={pagesOpen} onClick={onPages}>Pages</Button>
        ) : (
          groups.map((g) => (
            <Menu key={g.id} label={`${g.label} pages`} rank="quiet"
              items={g.items.map((p) => ({ id: p.id, label: p.label, icon: p.icon, onSelect: () => navigate(p.path) }))}>
              {g.label}
            </Menu>
          ))
        )}
      </div>
      <Button ref={searchRef} rank="secondary" icon={Search} aria-expanded={searchOpen} aria-haspopup="dialog"
        onClick={() => setSearchOpen((o) => !o)} className="hf-search-btn">
        <span>Search</span>
        <span className="hf-kbd" aria-hidden="true">{mac ? "⌘K" : "Ctrl K"}</span>
      </Button>
      <KitPopover open={searchOpen} anchorRef={searchRef} onClose={() => setSearchOpen(false)} label="Search everything" className="hf-search-pop">
        <Suspense fallback={<p className="hf-muted">Loading search…</p>}>
          <GlobalSearch autoFocus onNavigate={() => setSearchOpen(false)} />
        </Suspense>
      </KitPopover>
      <Menu label="More" icon={MoreHorizontal} items={moreItems} />
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

// ── Status bar ─────────────────────────────────────────────────────────
function FrameStatus({ size, pageTitle, onEditPage, editReason }) {
  const health = useSaveHealth();
  const lastSync = useLastSync();
  const next = useNextReminder();
  const preview = usePreviewOn();
  const [retrying, setRetrying] = useState(false);
  return (
    <StatusBar label="Status" tall={!health.ok}>
      <StatusButton icon={Pencil} label={`Edit ${pageTitle}`} onClick={onEditPage} disabledReason={editReason} />
      {health.ok
        ? <StatusItem>Saved</StatusItem>
        : (
          <StatusButton tone="warn" label="Not saved. Try again" onClick={async () => { setRetrying(true); try { await retrySave(); } finally { setRetrying(false); } }}>
            {retrying ? "Saving…" : "Not saved yet · Try again"}
          </StatusButton>
        )}
      {lastSync ? <StatusLink to="/settings#device-sync" title="Sync between devices">Synced {timeOf(new Date(lastSync))}</StatusLink> : null}
      {next ? <StatusLink to="/reminders" title="Your next reminder">Next: {next.title} {timeOf(new Date(next.at))}</StatusLink> : null}
      <StatusSpacer />
      {preview ? <span data-house-example=""><StatusItem tone="label" title="Preview Mode: example data, not yours. Leave it from the More menu.">Example system</StatusItem></span> : null}
      <StatusItem>{size === "compact" ? "Compact studio" : "Studio"}</StatusItem>
    </StatusBar>
  );
}

// ── The frame ──────────────────────────────────────────────────────────
export default function HouseFrame({ children, mainRef }) {
  const tokens = useHouseTokens();
  const sizeClass = useHouseSizeClass();
  const size = sizeClass === "compact" ? "compact" : "full";
  const location = useLocation();
  const navigate = useNavigate();
  const terms = useTerms();
  const formatAlter = useAlterLabel();
  const row = useSettingsRow();
  const vp = useViewportRem();
  const here = location.pathname + location.search;

  const page = usePageTitle(location.pathname, location.search, { terms, formatAlter });
  const groups = useMemo(() => navAreaGroups(terms, { omit: [] }), [terms]);
  const areaGroups = useMemo(() => groups.filter((g) => g.id !== "more"), [groups]);
  const morePages = useMemo(() => (groups.find((g) => g.id === "more")?.items || []), [groups]);

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
  const minCanvas = CANVAS_MIN[size];
  const room = vp.w - RAIL_REM;
  const rightDocked = size === "full" && right.shown && room - (left.shown ? leftW : 0) - rightW >= minCanvas;
  const [sheetOpen, setSheetOpen] = useState(false);
  useEffect(() => { setSheetOpen(false); }, [pageKey]);
  const leftFits = room - leftW - (rightDocked ? rightW : 0) >= minCanvas;
  // Compact: one side panel at a time.
  const leftDocked = left.shown && leftFits && !(size === "compact" && sheetOpen);
  const dockAsSheet = !rightDocked;

  const toggleLeft = () => {
    if (leftDocked) { keep("left", { shown: false }); return; }
    setSheetOpen(false);
    keep("left", { shown: true });
  };
  const toggleRight = () => {
    if (dockAsSheet) { setSheetOpen((o) => !o); return; }
    keep("right", { shown: !right.shown });
  };
  // From the docked dock being hidden in a narrow full studio, the toggle
  // opens it as a sheet; from the sheet, "Dock it" puts it back.
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

  // ── Open-page tabs ──
  const [tabs, setTabs] = useOpenTabState(here);
  const tabTitle = (path) => {
    if (path === here) return page.title;
    return null;
  };
  // Titles for tabs that aren't on screen come from the same resolver.
  const tabNames = useTabNames(tabs.tabs, { terms, formatAlter });
  const tabList = tabs.tabs.map((t) => ({ id: t.id, path: t.path, title: tabTitle(t.path) || tabNames[t.id] || "Page" }));

  // ── The signing swatch ──
  const { fronters } = useFrontPresence();
  const trackingOff = useFrontTrackingOff();
  const [frontOpen, setFrontOpen] = useState(false);
  const systemName = row?.system_name || terms.System;
  const swatch = (() => {
    if (trackingOff || !fronters.length) {
      const why = trackingOff ? `${terms.Front} isn't tracked, so entries are signed by the ${terms.system}` : `Nobody is set as ${terms.fronting}, so entries are signed by the ${terms.system}`;
      return { label: `Signing as ${systemName}. ${why}. Set ${terms.front}`, colours: [], initials: String(systemName || "").trim().slice(0, 1).toUpperCase(), icon: systemName ? null : Users };
    }
    const names = fronters.map(({ alter }) => formatAlter(alter));
    const colours = fronters.map(({ alter }) => (/^#[0-9a-f]{3,8}$/i.test(alter.color || "") ? alter.color : "var(--house-muted)"));
    return { label: `Signing as ${names.join(", ")}. Set ${terms.front}`, colours, more: Math.max(0, fronters.length - 3) };
  })();

  // ── The pencil: the existing Edit page where there is one (edit mode is Phase 4) ──
  const boards = useBoardsOnScreen();
  const editTarget = location.pathname === "/"
    ? (boards.includes("os-classic") || !boards.includes("os-v2") ? "os-classic-edit-home" : "os-v2-edit-home")
    : boards.includes("os-profile") ? "os-profile-edit-home" : null;
  const editPage = () => { if (editTarget) window.dispatchEvent(new CustomEvent(editTarget)); };

  const preview = usePreviewOn();
  const moreItems = [
    ...morePages.map((p) => ({ id: p.id, label: p.label, icon: p.icon || SettingsIcon, onSelect: () => navigate(p.path) })),
    { id: "display", label: "Display options", icon: SlidersHorizontal, onSelect: () => window.dispatchEvent(new CustomEvent("os-open-display-options")) },
    { id: "around", label: "Show me around this page", icon: PlayCircle, onSelect: () => openPageTour(location.pathname) },
    { id: "tour", label: "Take the tour", icon: MapIcon, onSelect: openFullTour },
    { id: "systems", label: `Switch ${terms.system}`, icon: Boxes, onSelect: () => openSystemSwitcher() },
    { id: "cover", label: "Grocery list (privacy cover)", icon: ShoppingCart, onSelect: () => window.dispatchEvent(new CustomEvent("open-grocery-list")) },
    ...(preview ? [{ id: "leave-example", label: "Leave the example system", icon: Eye, onSelect: () => exitPreview() }] : []),
    { id: "old-house", label: "Use the old house", icon: LogOut, onSelect: () => setHouseSwitch(false) },
  ];

  const scope = (extra = {}) => ({ tokens, "data-house-size": size, ...extra });
  const dockBody = <DockPanels tab={right.tab} onTab={setTab} page={page} fresh={fresh} />;
  const limL = DOCK_LIMITS[size].left;
  const limR = DOCK_LIMITS[size].right;

  return (
    <div className="hf" data-house-frame="" data-size={size}>
      <HouseScope {...scope()} className="hf-skips">
        <a href="#main-content" className="hf-skip">Skip to the page</a>
      </HouseScope>
      <div aria-live="polite" role="status" className="hf-sr">{page.title}</div>

      <HouseScope {...scope()} as="header" className="hf-top">
        <TopBar size={size} groups={areaGroups} moreItems={moreItems} onPages={toggleLeft} pagesOpen={leftDocked}
          searchOpen={searchOpen} setSearchOpen={setSearchOpen} />
        <OpenTabs tabs={tabList} current={tabs.active}
          onSelect={(t) => { setTabs((s) => selectTab(s, t.id)); if (t.path !== here) navigate(t.path); }}
          onClose={(t) => {
            let goTo = null;
            setTabs((s) => { const r = closeTab(s, t.id); goTo = r.goTo; return r.state; });
            setTimeout(() => { if (goTo && goTo !== here) navigate(goTo); }, 0);
          }}
          onNew={() => { setTabs((s) => openTab(s, "/")); navigate("/"); }}
          max={size === "compact" ? 4 : 8} />
      </HouseScope>

      <div className="hf-body">
        <HouseScope {...scope()} as="nav" className="hf-rail" aria-label="Tools">
          <SigningSwatch {...swatch} onClick={() => setFrontOpen(true)} />
          <IconButton icon={LifeBuoy} rank="primary" label="Support" onClick={() => navigate("/grounding")} />
          <span className="hf-rail-gap" />
          <IconButton icon={PanelLeft} label={leftDocked ? "Hide the pages panel" : "Show the pages panel"} aria-pressed={leftDocked} onClick={toggleLeft} />
          <IconButton icon={PanelRight} label={(rightDocked || sheetOpen) ? "Hide the side panel" : "Show the side panel"} aria-pressed={rightDocked || sheetOpen} onClick={toggleRight} />
          <IconButton icon={SlidersHorizontal} label="Display options" onClick={() => window.dispatchEvent(new CustomEvent("os-open-display-options"))} />
        </HouseScope>

        {leftDocked ? (
          <HouseScope {...scope()} as="aside" className="hf-left" aria-label="Pages panel" style={{ width: `${leftW}rem` }}>
            <div className="hf-dock-scroll"><BrowsePanel groups={groups} currentId={page.pageId} /></div>
            <DockResizer label="the pages panel" side="left" value={leftW} min={limL.min} max={limL.max} def={limL.def}
              onChange={(v) => setLive((l) => ({ ...l, left: v }))} onCommit={(v) => { keep("left", { size: v }); setLive((l) => ({ ...l, left: undefined })); }} />
          </HouseScope>
        ) : null}

        <main ref={mainRef} id="main-content" tabIndex={-1} role="main" aria-label={page.title}
          className="app-content-main hf-canvas focus:outline-none relative isolate flex-1 min-w-0 px-4 lg:px-6 py-4 lg:py-8 overflow-y-auto overflow-x-hidden">
          {children}
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
        <FrameStatus size={size} pageTitle={page.title} onEditPage={editPage}
          editReason={editTarget ? null : "This page has no layout to edit yet"} />
      </HouseScope>

      {/* Compact studio (and a full studio too narrow to dock it): the
          dock opens as a sheet from the right. */}
      <HouseScope {...scope()} className="hf-sheet-host">
        <Sheet open={dockAsSheet && sheetOpen} onClose={() => setSheetOpen(false)} side="right" title={page.title}
          tools={size === "full" ? <Button rank="quiet" onClick={() => { setSheetOpen(false); keep("right", { shown: true }); }}>Dock it</Button> : null}>
          {dockBody}
        </Sheet>
      </HouseScope>

      {frontOpen ? <SetFrontSheet open onClose={() => setFrontOpen(false)} /> : null}
    </div>
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
