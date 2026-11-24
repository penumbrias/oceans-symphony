// The pixel look's app frame (Display options → Shape → App look → Pixel).
//
// Drawn to the "Pixel app preview" mockups: on a computer, one header bar
// with the wave, the logo, a menu per area (Today, {System}, Plan & do,
// Write, Support, Look back, More), a "Search everything" box and the
// page menu, then a strip of page tabs like a pixel editor's open files.
// On a phone, a header with the logo (or back), the page's name, the
// reminders bell and the page menu.
//
// It replaces the classic headers and the desktop sidebar ONLY while the
// pixel look is on (AppLayout mounts it; pixel-look.css hides the classic
// chrome). Nothing is lost: every page is in its area's menu (the same
// navAreaGroups the sidebar reads), the app grid and the grocery cover
// sit in the More menu, and the page menu is the same HeaderPageMenu.
//
// The open page tabs are a per-device convenience kept in localStorage.
// They hold only paths, never anything a person wrote.
import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { pickPrimarySystemSettings } from "@/lib/systemSettingsSingleton";
import { resolveUiV2 } from "@/lib/uiV2";
import { useFrontPresence, useClock, alterNameColorVar } from "@/lib/useFrontPresence";
import { openSystemSwitcher } from "@/components/systems/SystemSwitcherSheet";
import { ActiveNowChip } from "@/components/v2/ActiveNow";
import { readPixelLook } from "@/lib/uiLook";
import { APP_VERSION } from "@/lib/appVersion";
import { getSaveHealth, retrySave } from "@/lib/localDb";
import { getLastRun, getSyncFolder } from "@/lib/deviceSyncRunner";
import { useMedications, useMedicationDoses, dosesOnDay, MEDICATIONS_PATH } from "@/lib/medications";
import { clockOpts } from "@/lib/timeFormat";
import { isScheduled } from "@/lib/activityStatus";
import { Bell, ChevronLeft, X, Plus, HelpCircle, Search } from "lucide-react";
import { useTerms } from "@/lib/useTerms";
import { navAreaGroups, pageLabel, ALL_PAGES } from "@/utils/navigationConfig";
import { pageForPath } from "@/lib/pageLooks";
import HeaderWaveBlock from "@/components/layout/HeaderWaveBlock";
import HeaderPageMenu from "@/components/layout/HeaderPageMenu";
import GlobalSearch from "@/components/dashboard/GlobalSearch";
import PixelHelpPanel, { usePixelHelp } from "@/components/layout/PixelHelpPanel";

const TABS_KEY = "symphony_pixel_tabs_v1";
const MAX_TABS = 12;
export const PIXEL_OPEN_TAB_EVENT = "os-pixel-open-tab";

/** Open a path in a new page tab (pixel look, computer). */
export function openInPixelTab(path) {
  window.dispatchEvent(new CustomEvent(PIXEL_OPEN_TAB_EVENT, { detail: { path } }));
}

function isActivePath(itemPath, pathname) {
  if (itemPath === "/") return pathname === "/";
  if (itemPath === "/Home") return pathname === "/Home" || pathname.startsWith("/alter");
  return pathname === itemPath || pathname.startsWith(`${itemPath}/`);
}

// The name a tab or the phone header shows for a path.
function usePathLabel() {
  const terms = useTerms();
  const queryClient = useQueryClient();
  return React.useCallback((fullPath) => {
    const pathname = String(fullPath || "/").split("?")[0];
    if (pathname === "/") return "Home";
    const profile = pathname.match(/^\/(alter|group|contacts|location)\/([^/]+)/);
    if (profile) {
      const key = { alter: "alters", group: "groups", contacts: "contacts", location: "locations" }[profile[1]];
      const list = queryClient.getQueryData([key]);
      const rec = Array.isArray(list) ? list.find((r) => String(r.id) === profile[2]) : null;
      if (rec?.name) return rec.name;
      return profile[1] === "alter" ? terms.Alter : profile[1] === "group" ? "Group" : profile[1] === "contacts" ? "Contact" : "Place";
    }
    const page = pageForPath(pathname) || ALL_PAGES.find((p) => p.path === pathname);
    return page ? pageLabel(page, terms) : pathname.replace(/^\//, "");
  }, [terms, queryClient]);
}

function readTabs() {
  try {
    const raw = JSON.parse(localStorage.getItem(TABS_KEY) || "null");
    if (raw && Array.isArray(raw.tabs) && raw.tabs.length) {
      const tabs = raw.tabs.filter((t) => t && typeof t.path === "string" && t.id).slice(0, MAX_TABS);
      if (tabs.length) return { tabs, active: tabs.some((t) => t.id === raw.active) ? raw.active : tabs[0].id };
    }
  } catch { /* fall through */ }
  const id = `t${Date.now().toString(36)}`;
  return { tabs: [{ id, path: "/" }], active: id };
}

function writeTabs(state) {
  try { localStorage.setItem(TABS_KEY, JSON.stringify(state)); } catch { /* non-fatal */ }
}

// ── Page tabs (computer) ───────────────────────────────────────────
function PixelPageTabs({ help }) {
  const location = useLocation();
  const navigate = useNavigate();
  const label = usePathLabel();
  const [state, setState] = React.useState(readTabs);
  const here = location.pathname + location.search;

  // The active tab follows wherever the person goes.
  React.useEffect(() => {
    setState((s) => {
      const tabs = s.tabs.map((t) => (t.id === s.active ? { ...t, path: here } : t));
      const next = { ...s, tabs };
      writeTabs(next);
      return next;
    });
  }, [here]);

  const select = (tab) => {
    setState((s) => { const next = { ...s, active: tab.id }; writeTabs(next); return next; });
    if (tab.path !== here) navigate(tab.path);
  };
  const open = React.useCallback((path) => {
    const id = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    setState((s) => {
      const tabs = [...s.tabs, { id, path }].slice(-MAX_TABS);
      const next = { tabs, active: id };
      writeTabs(next);
      return next;
    });
    navigate(path);
  }, [navigate]);
  const close = (tab, e) => {
    e.stopPropagation();
    setState((s) => {
      if (s.tabs.length <= 1) return s;
      const i = s.tabs.findIndex((t) => t.id === tab.id);
      const tabs = s.tabs.filter((t) => t.id !== tab.id);
      let active = s.active;
      if (tab.id === s.active) {
        const neighbour = tabs[Math.max(0, i - 1)];
        active = neighbour.id;
        if (neighbour.path !== here) navigate(neighbour.path);
      }
      const next = { tabs, active };
      writeTabs(next);
      return next;
    });
  };

  React.useEffect(() => {
    const on = (e) => { if (e.detail?.path) open(e.detail.path); };
    window.addEventListener(PIXEL_OPEN_TAB_EVENT, on);
    return () => window.removeEventListener(PIXEL_OPEN_TAB_EVENT, on);
  }, [open]);

  return (
    <div className="px-tabstrip" role="tablist" aria-label="Open pages" data-tour="px-page-tabs">
      {state.tabs.map((tab) => {
        const sel = tab.id === state.active;
        const name = label(tab.path);
        return (
          <div key={tab.id} className={sel ? "px-doctab sel" : "px-doctab"}>
            <button type="button" role="tab" aria-selected={sel} onClick={() => select(tab)} className="px-doctab-name">
              {name}
            </button>
            {state.tabs.length > 1 && (
              <button type="button" aria-label={`Close ${name}`} onClick={(e) => close(tab, e)} className="px-doctab-x">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        );
      })}
      <button type="button" className="px-doctab px-doctab-new" aria-label="New tab" title="New tab" onClick={() => open("/")}>
        <Plus className="w-3.5 h-3.5" />
      </button>
      <span className="flex-1" />
      {help && <button
        type="button"
        className={help.open ? "px-doctab px-doctab-new px-help-toggle sel" : "px-doctab px-doctab-new px-help-toggle"}
        data-tour="px-help-toggle"
        aria-pressed={help.open}
        onClick={() => help.setOpen(!help.open)}
        title="How this page works"
      >
        <HelpCircle className="w-3.5 h-3.5" /> <span>How this page works</span>
      </button>}
    </div>
  );
}

// ── Area menus (computer) ──────────────────────────────────────────
function AreaMenus({ extraMore, pendingCount, todoAlertCount }) {
  const terms = useTerms();
  const location = useLocation();
  const navigate = useNavigate();
  const groups = React.useMemo(() => navAreaGroups(terms), [terms]);
  const [openId, setOpenId] = React.useState(null);
  const ref = React.useRef(null);

  React.useEffect(() => { setOpenId(null); }, [location.pathname]);
  React.useEffect(() => {
    if (!openId) return undefined;
    const down = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpenId(null); };
    const key = (e) => { if (e.key === "Escape") setOpenId(null); };
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", down); document.removeEventListener("keydown", key); };
  }, [openId]);

  const activeArea = groups.find((g) => g.items.some((it) => isActivePath(it.path, location.pathname)))?.id;

  return (
    <nav ref={ref} className="px-areas" aria-label="Main navigation" data-tour="px-area-menus">
      {groups.map((g) => {
        const open = openId === g.id;
        return (
          <div key={g.id} className="relative">
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={open}
              onClick={() => setOpenId(open ? null : g.id)}
              onMouseEnter={() => { if (openId && openId !== g.id) setOpenId(g.id); }}
              className={activeArea === g.id || open ? "px-area sel" : "px-area"}
            >
              {g.label}
            </button>
            {open && (
              <div className="px-menu" role="menu" aria-label={g.label}>
                {g.items.map((it) => {
                  const Icon = it.icon;
                  const badge = it.id === "reminders" ? pendingCount : it.id === "todo" ? todoAlertCount : 0;
                  return (
                    <div key={it.id} className={isActivePath(it.path, location.pathname) ? "px-menu-row sel" : "px-menu-row"}>
                      <button
                        type="button"
                        role="menuitem"
                        className="px-menu-item"
                        onClick={(e) => {
                          setOpenId(null);
                          if (e.ctrlKey || e.metaKey) openInPixelTab(it.path);
                          else navigate(it.path);
                        }}
                        onAuxClick={(e) => { if (e.button === 1) { setOpenId(null); openInPixelTab(it.path); } }}
                      >
                        {Icon && <Icon className="w-4 h-4 shrink-0 opacity-80" />}
                        <span className="flex-1 truncate">{it.label}</span>
                        {badge > 0 && <span className="px-badge">{badge > 9 ? "9+" : badge}</span>}
                      </button>
                      <button
                        type="button"
                        className="px-menu-newtab"
                        aria-label={`Open ${it.label} in a new tab`}
                        title="Open in a new tab"
                        onClick={() => { setOpenId(null); openInPixelTab(it.path); }}
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
                {g.id === "more" && extraMore}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

// ── Search (computer) ──────────────────────────────────────────────
function PixelSearch({ phone = false }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (phone) return undefined; // the computer's search owns Ctrl+K
    const key = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) { e.preventDefault(); setOpen((o) => !o); }
      else if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [phone]);
  React.useEffect(() => {
    if (!open) return undefined;
    const down = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("pointerdown", down);
    return () => document.removeEventListener("pointerdown", down);
  }, [open]);
  const mac = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform || "");
  return (
    <div ref={ref} className={phone ? "" : "relative"}>
      {phone ? (
        <button type="button" className="px-iconbtn px-iconbtn-lg" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Search everything" title="Search everything">
          <Search className="w-5 h-5" />
        </button>
      ) : (
        <button type="button" className="px-search" data-tour="px-search" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Search everything">
          <span>Search everything</span>
          <span className="px-kbd">{mac ? "⌘K" : "Ctrl K"}</span>
        </button>
      )}
      {open && (
        <div className={phone ? "px-menu px-search-panel px-search-panel-phone" : "px-menu px-search-panel"}>
          <GlobalSearch autoFocus onNavigate={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

// The header's own items — the SAME arrangeable list as the new UI's top
// bar (ui_v2.topBar, Display options → Bars → Top bar), so the old
// headers' system name, who's fronting and clock come with the pixel look
// and nothing gets a second editor. Hidden items are skipped; "spacer"
// is where the row splits left and right.
function useTopBarItems() {
  const { data: list = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  const row = pickPrimarySystemSettings(list);
  const topBar = resolveUiV2(row?.ui_v2).topBar;
  return { row, items: topBar.order.filter((id) => !topBar.hidden.includes(id)) };
}

function FrontingNames({ max = 3 }) {
  const location = useLocation();
  const navigate = useNavigate();
  const terms = useTerms();
  const { fronters, presenceText, formatAlter } = useFrontPresence();
  const openFront = () => {
    if (location.pathname === "/") window.dispatchEvent(new CustomEvent("open-set-front"));
    else navigate("/?action=set-front");
  };
  const shown = fronters.slice(0, max);
  return (
    <button type="button" className="px-hitem px-front" onClick={openFront}
      aria-label={`${presenceText}. Set ${terms.front}`} title={`Who's ${terms.fronting}: set ${terms.front}`}>
      {shown.length === 0 && <span className="px-hitem-muted">{presenceText}</span>}
      {/* Each name follows its own colour swatch, so no commas are needed. */}
      {shown.map(({ s, alter }) => (
        <span key={s.id} className="px-front-one">
          <span className="px-front-swatch" style={{ background: /^#[0-9a-f]{6}$/i.test(alter.color || "") ? alter.color : "var(--color-muted)" }} aria-hidden="true" />
          <span className="os-alter-name px-front-name" style={alterNameColorVar(alter)}>{formatAlter(alter)}</span>
        </span>
      ))}
      {fronters.length > max && <span className="px-hitem-muted">+{fronters.length - max}</span>}
    </button>
  );
}

function HeaderItems({ items, row, search, bell }) {
  const terms = useTerms();
  const clock = useClock();
  return items.map((id) => {
    if (id === "spacer") return <span key={id} className="flex-1 min-w-2" />;
    if (id === "name") return (
      <button key={id} type="button" className="px-hitem px-sysname" onClick={() => openSystemSwitcher()} data-tour="px-header-items"
        title={`Switch or manage ${terms.systems || "systems"}`}>
        {row?.system_name || terms.System}
      </button>
    );
    if (id === "presence") return <FrontingNames key={id} />;
    if (id === "clock") return <span key={id} className="px-hitem px-clock tabular-nums">{clock}</span>;
    if (id === "active") return <span key={id} className="px-hitem"><ActiveNowChip /></span>;
    if (id === "search") return <React.Fragment key={id}>{search}</React.Fragment>;
    if (id === "bell") return <React.Fragment key={id}>{bell}</React.Fragment>;
    return null;
  });
}

// Both headers are mounted (CSS shows one), so the parts that keep state or
// listen for events — page tabs, search's Ctrl+K, the help panel — run only
// in the one on screen. Otherwise "open in a new tab" would open two.
function useDesk() {
  const query = "(min-width: 1024px)";
  const get = () => { try { return window.matchMedia(query).matches; } catch { return true; } };
  const [desk, setDesk] = React.useState(get);
  React.useEffect(() => {
    let mq;
    try { mq = window.matchMedia(query); } catch { return undefined; }
    const on = () => setDesk(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return desk;
}

// ── The whole frame ────────────────────────────────────────────────
export function PixelDesktopHeader(props) {
  // Mounted only on a computer-width screen (see useDesk).
  return useDesk() ? <DesktopHeader {...props} /> : null;
}

function DesktopHeader({ pendingCount = 0, todoAlertCount = 0, onHome, onAppGrid }) {
  const help = usePixelHelp();
  const top = useTopBarItems();
  const extraMore = (
    <>
      <div className="px-menu-sep" />
      <button type="button" role="menuitem" className="px-menu-item" onClick={onAppGrid}>App grid</button>
      <button
        type="button"
        role="menuitem"
        className="px-menu-item"
        title="Also a privacy cover. Triple-tap anywhere to open it."
        onClick={() => window.dispatchEvent(new CustomEvent("open-grocery-list"))}
      >
        Grocery list
      </button>
    </>
  );
  return (
    <header className="px-chrome px-chrome-desktop sticky top-0 z-50 hidden lg:block">
      <div className="px-headbar">
        <HeaderWaveBlock />
        <div className="px-headrow">
          <Link to="/" onClick={onHome} className="px-brand" aria-label="Oceans Symphony home">
            <img src="/logo.png" alt="" className="px-logo" />
            {/* The system name item names the header when it's shown. */}
            {!top.items.includes("name") && <span className="px-appname">Oceans Symphony</span>}
          </Link>
          <AreaMenus extraMore={extraMore} pendingCount={pendingCount} todoAlertCount={todoAlertCount} />
          <HeaderItems items={top.items} row={top.row}
            search={<PixelSearch />}
            bell={(
              <Link to="/reminders" className="px-iconbtn relative" aria-label="Reminders" title="Reminders">
                <Bell className="w-4 h-4" />
                {pendingCount > 0 && <span className="px-badge px-badge-corner">{pendingCount > 9 ? "9+" : pendingCount}</span>}
              </Link>
            )} />
          <HeaderPageMenu className="px-iconbtn ml-auto" />
        </div>
      </div>
      <PixelPageTabs help={help} />
      <PixelHelpPanel open={help.open} onClose={() => help.setOpen(false)} />
    </header>
  );
}

export function PixelPhoneHeader(props) {
  return useDesk() ? null : <PhoneHeader {...props} />;
}

function PhonePresence() {
  const { fronters, presenceText, formatAlter } = useFrontPresence();
  return (
    <span className="px-phone-front">
      {fronters.length === 0 ? presenceText : fronters.slice(0, 3).map(({ s, alter }, i, arr) => (
        <span key={s.id}>
          <span className="os-alter-name" style={alterNameColorVar(alter)}>{formatAlter(alter)}</span>
          {i < arr.length - 1 ? ", " : ""}
        </span>
      ))}
      {fronters.length > 3 && ` +${fronters.length - 3}`}
    </span>
  );
}

// The phone gets the computer's parts in a phone shape: search behind an
// icon, the page tabs under the header, and "How this page works" as a
// sheet behind the ? (a dot on it when this page has tips you haven't
// seen — the phone never pops the sheet open by itself).
function PhoneHeader({ pendingCount = 0, canGoBack, onBack, onOpenMenu }) {
  const location = useLocation();
  const label = usePathLabel();
  const help = usePixelHelp({ auto: false });
  const top = useTopBarItems();
  const title = location.pathname === "/"
    ? (top.items.includes("name") && top.row?.system_name) || "Oceans Symphony"
    : label(location.pathname);
  return (
    <header className="px-chrome px-chrome-phone sticky top-0 z-50 lg:hidden">
      <div className="px-headbar px-headbar-phone">
        <HeaderWaveBlock />
        <div className="px-headrow">
          {canGoBack ? (
            <button type="button" onClick={onBack} className="px-iconbtn px-iconbtn-lg" aria-label="Go back">
              <ChevronLeft className="w-5 h-5" />
            </button>
          ) : (
            <button type="button" onClick={onOpenMenu} className="px-brandbtn" aria-label="Open navigation menu">
              <img src="/logo.png" alt="" className="px-logo" />
            </button>
          )}
          <span className="px-phone-title">
            <span className="px-phone-title-text">{title}</span>
            {/* Who's fronting fits under the title (Bars → Top bar). */}
            {top.items.includes("presence") && <PhonePresence />}
          </span>
          {top.items.includes("search") && <PixelSearch phone />}
          <button
            type="button"
            className={help.open ? "px-iconbtn px-iconbtn-lg relative sel" : "px-iconbtn px-iconbtn-lg relative"}
            aria-pressed={help.open}
            aria-label={help.fresh ? "How this page works (new tips)" : "How this page works"}
            title="How this page works"
            onClick={() => help.setOpen(!help.open)}
          >
            <HelpCircle className="w-5 h-5" />
            {help.fresh && !help.open && <span className="px-dot" aria-hidden="true" />}
          </button>
          <Link to="/reminders" className="px-iconbtn px-iconbtn-lg relative" aria-label="Reminders">
            <Bell className="w-5 h-5" />
            {pendingCount > 0 && <span className="px-badge px-badge-corner">{pendingCount > 9 ? "9+" : pendingCount}</span>}
          </Link>
          <HeaderPageMenu className="px-iconbtn px-iconbtn-lg" />
        </div>
      </div>
      <PixelPageTabs />
      <PixelHelpPanel open={help.open} onClose={() => help.setOpen(false)} />
    </header>
  );
}

// ── Status bar (computer, pixel look) ──────────────────────────────
// The mockup's bottom bar: whether the last save got through, the last
// device sync, the next plan and the next medication, the look and the
// version. On by default in the pixel look; switched off, or items hidden,
// in Display options → Bars → Status bar (SystemSettings.ui_pixel).
const timeOf = (d) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", ...clockOpts() });

function useSaveHealth() {
  const [health, setHealth] = React.useState(getSaveHealth);
  React.useEffect(() => {
    const on = (e) => setHealth(e.detail || getSaveHealth());
    window.addEventListener("symphony-save-health", on);
    return () => window.removeEventListener("symphony-save-health", on);
  }, []);
  return health;
}

function useMinuteTick() {
  const [, tick] = React.useState(0);
  React.useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 60000);
    return () => clearInterval(id);
  }, []);
}

export function PixelStatusBar() {
  return useDesk() ? <StatusBar /> : null;
}

function StatusBar() {
  useMinuteTick();
  const { data: list = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  const px = readPixelLook(pickPrimarySystemSettings(list));
  const on = (id) => !px.statusHidden.includes(id);
  const health = useSaveHealth();
  const { data: plans = [] } = useQuery({
    queryKey: ["activities", "statusbar-next"],
    // Newest timestamps first: plans ahead sort to the top, and older rows
    // without a status are still read as plans (isScheduled).
    queryFn: () => base44.entities.Activity.list("-timestamp", 200),
    enabled: px.statusBar && on("nextPlan"),
  });
  const { medications: meds } = useMedications({ enabled: px.statusBar && on("nextMeds") });
  const { doses } = useMedicationDoses({ enabled: px.statusBar && on("nextMeds") });

  React.useEffect(() => {
    if (!px.statusBar) return undefined;
    document.documentElement.setAttribute("data-px-status", "1");
    return () => document.documentElement.removeAttribute("data-px-status");
  }, [px.statusBar]);
  if (!px.statusBar) return null;

  const now = new Date();
  const nextPlan = plans
    .filter((a) => !a.trashed_at && a.timestamp && new Date(a.timestamp) > now && isScheduled(a))
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))[0];
  const nextDose = dosesOnDay(meds, doses, { now }).find((d) => d.state === "later" || d.state === "due");
  const lastSync = getSyncFolder() ? getLastRun() : "";

  return (
    <footer className="px-status hidden lg:flex" aria-label="Status">
      {on("saved") && (health.ok
        ? <span className="px-status-item">Saved</span>
        : <button type="button" className="px-status-item px-status-warn" onClick={() => retrySave()} title="A save didn't get through. Try again.">Not saved · try again</button>)}
      {on("synced") && lastSync && (
        <Link to="/settings" className="px-status-item" title="Sync between devices is in Settings">Synced {timeOf(new Date(lastSync))}</Link>
      )}
      {on("nextPlan") && nextPlan && (
        <Link to="/activities" className="px-status-item">Next: {nextPlan.activity_name || "Plan"} {timeOf(new Date(nextPlan.timestamp))}</Link>
      )}
      {on("nextMeds") && nextDose && (
        <Link to={MEDICATIONS_PATH} className={nextDose.state === "due" ? "px-status-item px-status-warn" : "px-status-item"}>
          {nextDose.state === "due" ? "Due" : "Meds"}: {nextDose.med.name} {timeOf(nextDose.at)}
        </Link>
      )}
      <span className="flex-1" />
      {on("look") && <span className="px-status-item">Look: Pixel</span>}
      {on("version") && <span className="px-status-item">v{APP_VERSION}</span>}
    </footer>
  );
}
