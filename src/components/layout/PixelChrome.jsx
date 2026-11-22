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
import { useQueryClient } from "@tanstack/react-query";
import { Bell, ChevronLeft, X, Plus } from "lucide-react";
import { useTerms } from "@/lib/useTerms";
import { navAreaGroups, pageLabel, ALL_PAGES } from "@/utils/navigationConfig";
import { pageForPath } from "@/lib/pageLooks";
import HeaderWaveBlock from "@/components/layout/HeaderWaveBlock";
import HeaderPageMenu from "@/components/layout/HeaderPageMenu";
import GlobalSearch from "@/components/dashboard/GlobalSearch";

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
function PixelPageTabs() {
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
    <div className="px-tabstrip" role="tablist" aria-label="Open pages">
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
    <nav ref={ref} className="px-areas" aria-label="Main navigation">
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
function PixelSearch() {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    const key = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) { e.preventDefault(); setOpen((o) => !o); }
      else if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  React.useEffect(() => {
    if (!open) return undefined;
    const down = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("pointerdown", down);
    return () => document.removeEventListener("pointerdown", down);
  }, [open]);
  const mac = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform || "");
  return (
    <div ref={ref} className="relative">
      <button type="button" className="px-search" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Search everything">
        <span>Search everything</span>
        <span className="px-kbd">{mac ? "⌘K" : "Ctrl K"}</span>
      </button>
      {open && (
        <div className="px-menu px-search-panel">
          <GlobalSearch autoFocus onNavigate={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

// ── The whole frame ────────────────────────────────────────────────
export function PixelDesktopHeader({ pendingCount = 0, todoAlertCount = 0, onHome, onAppGrid }) {
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
            <span className="px-appname">Oceans Symphony</span>
          </Link>
          <AreaMenus extraMore={extraMore} pendingCount={pendingCount} todoAlertCount={todoAlertCount} />
          <span className="flex-1" />
          <PixelSearch />
          <Link to="/reminders" className="px-iconbtn relative" aria-label="Reminders" title="Reminders">
            <Bell className="w-4 h-4" />
            {pendingCount > 0 && <span className="px-badge px-badge-corner">{pendingCount > 9 ? "9+" : pendingCount}</span>}
          </Link>
          <HeaderPageMenu className="px-iconbtn" />
        </div>
      </div>
      <PixelPageTabs />
    </header>
  );
}

export function PixelPhoneHeader({ pendingCount = 0, canGoBack, onBack, onOpenMenu }) {
  const location = useLocation();
  const label = usePathLabel();
  const title = location.pathname === "/" ? "Oceans Symphony" : label(location.pathname);
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
          <span className="px-phone-title">{title}</span>
          <Link to="/reminders" className="px-iconbtn px-iconbtn-lg relative" aria-label="Reminders">
            <Bell className="w-5 h-5" />
            {pendingCount > 0 && <span className="px-badge px-badge-corner">{pendingCount > 9 ? "9+" : pendingCount}</span>}
          </Link>
          <HeaderPageMenu className="px-iconbtn px-iconbtn-lg" />
        </div>
      </div>
    </header>
  );
}
