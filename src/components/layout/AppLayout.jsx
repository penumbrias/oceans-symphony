import React, { useRef, useEffect, useState, useMemo } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import Base44MigrationBanner from "@/components/shared/MigrationBanner";
import { Settings, ChevronLeft, Wifi, Menu } from "lucide-react";
import { useTerms } from "@/lib/useTerms";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import NotificationPopups from "@/components/dashboard/NotificationPopups";
import MigrationBanner from "@/components/fronting/MigrationBanner";
import FloatingGroundingButton from "@/components/grounding/FloatingGroundingButton";
import SidebarNav from "@/components/layout/SidebarNav";
import { ALL_PAGES, DEFAULT_CONFIG } from "@/utils/navigationConfig";
import { useRemindersScheduler, usePendingReminderInstances } from "@/lib/remindersScheduler";
import ReminderToast from "@/components/reminders/ReminderToast";
import { Bell } from "lucide-react";
import useSwipeBack from "@/hooks/useSwipeBack";
import FeatureTour from "@/components/onboarding/FeatureTour";
import { useTheme } from "@/lib/ThemeContext";
import { setAccessibilityFontFamily } from "@/lib/useAccessibility";

function OfflineReadyBadge() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const check = () => setReady(!!navigator.serviceWorker?.controller);
    check();
    navigator.serviceWorker?.addEventListener('controllerchange', check);
    return () => navigator.serviceWorker?.removeEventListener('controllerchange', check);
  }, []);
  return (
    <span
      title={ready ? "Offline Ready — works without internet" : "Registering offline support…"}
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold transition-colors select-none",
        ready
          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
          : "bg-muted text-muted-foreground"
      )}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full", ready ? "bg-emerald-500" : "bg-muted-foreground/50")} />
      {ready ? "Offline Ready" : "…"}
    </span>
  );
}

const TAB_ROOTS = ["/", "/Home", "/system-checkin", "/journals", "/tasks"];

function isTabRoot(pathname) {
  return TAB_ROOTS.some((r) => pathname === r) || pathname === "/settings";
}

export default function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const terms = useTerms();
  const [historyDepth, setHistoryDepth] = useState(0);
  const [showFeatureTour, setShowFeatureTour] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  useRemindersScheduler();

const { data: systemSettings = [] } = useQuery({
  queryKey: ["systemSettings"],
  queryFn: () => base44.entities.SystemSettings.list(),
});

const { data: alters = [] } = useQuery({
  queryKey: ["alters"],
  queryFn: () => base44.entities.Alter.list(),
});

const { data: sessions = [] } = useQuery({
  queryKey: ["frontHistory"],
  queryFn: () => base44.entities.FrontingSession.list("-start_time", 50),
});

const { data: mentionLogs = [] } = useQuery({
  queryKey: ["mentionLogs"],
  queryFn: () => base44.entities.MentionLog.list("-created_date", 200),
  refetchInterval: 15000, // refetch every 15 seconds
  refetchIntervalInBackground: false, // only when tab is active
});

const navConfig = useMemo(() => {
  return systemSettings?.[0]?.navigation_config || DEFAULT_CONFIG;
}, [systemSettings]);

const termMap = useMemo(() => ({
  alters:           terms.Alters,
  checkin:          `${terms.System} Meeting`,
  "system-map":     `${terms.System} Map`,
  "system-history": `${terms.System} History`,
}), [terms]);

const navItems = useMemo(() => {
  return (navConfig.topBar || [])
    .map(pageId => ALL_PAGES.find(p => p.id === pageId))
    .filter(Boolean)
    .map(page => ({ ...page, label: termMap[page.id] || page.label }));
}, [navConfig.topBar, termMap]);


const bottomNavItems = useMemo(() => {
  return (navConfig.bottomBar || [])
    .map(pageId => ALL_PAGES.find(p => p.id === pageId))
    .filter(Boolean)
    .map(page => ({ ...page, label: termMap[page.id] || page.label }));
}, [navConfig.bottomBar, termMap]);

const { data: pendingReminders = [] } = usePendingReminderInstances();
const pendingCount = pendingReminders.filter(i => i.status === "fired").length;

const activeSession = sessions.find((s) => s.is_active);
const frontingAlterIds = activeSession
  ? activeSession.alter_id
    ? sessions.filter(s => s.is_active && s.alter_id).map(s => s.alter_id)
    : [activeSession.primary_alter_id, ...(activeSession.co_fronter_ids || [])].filter(Boolean)
  : [];

// Fronter-linked theme: when primary fronter changes, apply their linked preset
const { alterThemeLinks, setSelectedTheme, setThemeMode, clearCustomColors, allPresets, userCustomPresets } = useTheme();
const primaryFronter = frontingAlterIds[0] ?? null;
const lastAppliedFronterRef = useRef(null);
useEffect(() => {
  if (primaryFronter === lastAppliedFronterRef.current) return;
  lastAppliedFronterRef.current = primaryFronter;
  if (!primaryFronter) return;
  const linkedPreset = alterThemeLinks[primaryFronter];
  if (!linkedPreset) return;
  const preset = allPresets[linkedPreset] || userCustomPresets[linkedPreset];
  if (!preset) return;
  clearCustomColors();
  setSelectedTheme(linkedPreset);
  if (preset.font) setAccessibilityFontFamily(preset.font);
  const BUILTIN_MODES = { warm:'light',cool:'light',forest:'light',sunset:'light',ocean:'light',berry:'light',charcoal:'dark',ivory:'light' };
  const mode = preset.themeMode || BUILTIN_MODES[linkedPreset];
  if (mode) setThemeMode(mode);
}, [primaryFronter]);

const handleNotifClick = (mentionLog) => {
  if (mentionLog.navigate_path?.includes("?id=")) {
    // Already has ID in URL param — navigate directly
    navigate(mentionLog.navigate_path);
  } else {
    navigate(mentionLog.navigate_path || "/", {
      state: { highlightBulletinId: mentionLog.source_id }
    });
  }
};

  useEffect(() => {
    setHistoryDepth((prev) => isTabRoot(location.pathname) ? 0 : prev + 1);
  }, [location.pathname]);

  const canGoBack = historyDepth > 0 && !isTabRoot(location.pathname);
  const { indicatorVisible, indicatorProgress } = useSwipeBack();

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* ── Safe area top spacer (mobile only) ── */}
      <div style={{ height: 'env(safe-area-inset-top, 0px)', background: 'var(--background)' }} className="sm:hidden" />

      {/* ── Desktop top header (hidden on mobile) ── */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl hidden sm:block">
        <div className="mx-auto px-4 max-w-6xl sm:px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 select-none" aria-label="Symphony home">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <img src="/logo.png" className="w-7 h-7 object-contain rounded-md" alt="logo" />
            </div>
            <span className="font-display text-lg font-semibold tracking-tight text-foreground">Symphony</span>
            <OfflineReadyBadge />
          </Link>

          <nav className="flex items-center gap-1" aria-label="Main navigation">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.path === "/" ?
              location.pathname === "/" :
              item.path === "/Home" ?
              location.pathname === "/Home" || location.pathname.startsWith("/alter") :
              location.pathname.startsWith(item.path);
              return (
                <Link key={item.path} to={item.path}
                aria-label={item.label}
                aria-current={isActive ? "page" : undefined} className="text-muted-foreground px-2 text-sm font-medium rounded-lg flex items-center gap-2 transition-all duration-200 select-none min-h-[44px] hover:text-foreground hover:bg-muted/50">



                  
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </Link>);

            })}

            <Link to="/reminders" aria-label="Reminders"
              aria-current={location.pathname.startsWith("/reminders") ? "page" : undefined}
              className="relative text-muted-foreground px-3 text-sm font-medium rounded-lg flex items-center gap-2 transition-all duration-200 select-none min-h-[44px] hover:text-foreground hover:bg-muted/50">
              <Bell className="w-4 h-4" />
              <span>Reminders</span>
              {pendingCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-red-500 text-white rounded-full text-[9px] font-bold flex items-center justify-center">
                  {pendingCount > 9 ? "9+" : pendingCount}
                </span>
              )}
            </Link>
            <Link to="/settings"
            aria-label="Settings"
            aria-current={location.pathname.startsWith("/settings") ? "page" : undefined} className="text-muted-foreground px-3 text-sm font-medium rounded-lg flex items-center gap-2 transition-all duration-200 select-none min-h-[44px] hover:text-foreground hover:bg-muted/50">



              
              <Settings className="w-4 h-4" />
              <span>Settings</span>
            </Link>
          </nav>
        </div>
      </header>

      {/* ── Mobile top bar (shown only on mobile) ── */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/90 backdrop-blur-xl sm:hidden flex flex-col">
        <div className="flex items-center justify-between px-2 h-14">
        {/* Left: back button or logo */}
        {canGoBack ?
        <button
          onClick={() => navigate(-1)}
          aria-label="Go back"
          className="flex items-center gap-1 text-primary min-w-[44px] min-h-[44px] px-2 rounded-xl transition-colors hover:bg-muted/50">
            <ChevronLeft className="w-5 h-5" />
            <span className="text-sm font-medium">Back</span>
          </button> :

        <button
          onClick={() => setSidebarOpen(true)}
          aria-label="Open navigation menu"
          className="flex items-center gap-2 select-none min-h-[44px] px-2 rounded-xl transition-colors hover:bg-muted/50 text-left">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <img src="/logo.png" className="w-6 h-6 object-contain rounded-md" alt="logo" />
            </div>
            <span className="font-display text-base font-semibold text-foreground">Oceans Symphony</span>
            <OfflineReadyBadge />
          </button>
        }

        {/* Right: bell + settings icons */}
        <div className="flex items-center gap-1">
        <Link to="/reminders" aria-label="Reminders"
          className={cn(
            "relative flex items-center justify-center min-w-[44px] min-h-[44px] rounded-xl transition-colors",
            location.pathname.startsWith("/reminders") ? "text-primary bg-primary/10" : "text-muted-foreground hover:bg-muted/50"
          )}>
          <Bell className="w-5 h-5" />
          {pendingCount > 0 && (
            <span className="absolute top-2 right-2 w-3.5 h-3.5 bg-red-500 text-white rounded-full text-[9px] font-bold flex items-center justify-center">
              {pendingCount > 9 ? "9+" : pendingCount}
            </span>
          )}
        </Link>
        <Link
          to="/settings"
          aria-label="Settings"
          className={cn(
            "flex items-center justify-center min-w-[44px] min-h-[44px] rounded-xl transition-colors",
            location.pathname.startsWith("/settings") ? "text-primary bg-primary/10" : "text-muted-foreground hover:bg-muted/50"
          )}>
          
          <Settings className="w-5 h-5" />
        </Link>
        </div>
        </div>
      </header>

      {/* ── Page content ── */}
      <main
        className="app-content-main flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-0 sm:py-8 sm:pb-8">
        <div className="pt-3 sm:pt-0 pb-2 sm:pb-4">
          <Base44MigrationBanner />
        </div>
        <Outlet context={{ setShowFeatureTour }} />
      </main>

      {/* ── Fixed bottom tab bar (mobile only) ── */}
      <nav
        className="sm:hidden fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-xl border-t border-border/50"
        style={{ height: "var(--bottom-nav-height, 56px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        aria-label="Tab bar navigation">

        <div className="flex items-center justify-around" style={{ height: "var(--bottom-nav-height, 56px)" }}>
          {bottomNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.path === "/" ?
            location.pathname === "/" :
            item.path === "/Home" ?
            location.pathname === "/Home" || location.pathname.startsWith("/alter") :
            location.pathname.startsWith(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                aria-label={item.label}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 flex-1 min-h-[44px] py-1 select-none transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}>

                <Icon className={cn("w-5 h-5 transition-transform", isActive && "scale-110")} />
                <span className="text-[11px] font-medium">{item.label}</span>
              </Link>);

            })}
          </div>
      </nav>
      
      {/* Swipe-back indicator overlay */}
      {indicatorVisible && (
        <div
          className="fixed left-0 top-1/2 -translate-y-1/2 z-[200] pointer-events-none flex items-center justify-center"
          style={{
            opacity: indicatorProgress,
            transform: `translateY(-50%) translateX(${(indicatorProgress - 1) * 20}px)`,
            transition: indicatorProgress === 0 ? `opacity ${400}ms ease, transform ${400}ms ease` : "none",
          }}
        >
          <div className="w-10 h-10 rounded-full bg-foreground/20 backdrop-blur flex items-center justify-center shadow-lg">
            <ChevronLeft className="w-5 h-5 text-foreground" />
          </div>
        </div>
      )}

      <SidebarNav open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <MigrationBanner />
      <FloatingGroundingButton />
      <ReminderToast />
      {showFeatureTour && <FeatureTour onClose={() => setShowFeatureTour(false)} />}
      <NotificationPopups
        mentionLogs={mentionLogs}
        alters={alters}
        frontingAlterIds={frontingAlterIds}
        onNotifClick={handleNotifClick}
      />
    </div>);

}