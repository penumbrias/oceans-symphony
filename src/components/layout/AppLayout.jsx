import React, { useRef, useEffect, useState, useMemo } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import Base44MigrationBanner from "@/components/shared/MigrationBanner";
import { Settings, ChevronLeft, Wifi, Menu, Users, Clock, BarChart2, BookOpen, CheckSquare, Sparkles, Activity, Zap, GitBranch, GitMerge, FileText, Heart, Vote, Shield, MapPin, UserRound, ClipboardList } from "lucide-react";
import { useTerms } from "@/lib/useTerms";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import NotificationPopups from "@/components/dashboard/NotificationPopups";
import FloatingGroundingButton from "@/components/grounding/FloatingGroundingButton";
import GroceryListPanel from "@/components/grocery/GroceryListPanel";
import HeaderWaveBlock from "@/components/layout/HeaderWaveBlock";
import useTripleTapPanic from "@/hooks/useTripleTapPanic";
import useFrontSessionSweep from "@/hooks/useFrontSessionSweep";
import SidebarNav from "@/components/layout/SidebarNav";
import { ALL_PAGES, DEFAULT_CONFIG } from "@/utils/navigationConfig";
import { useRemindersScheduler, usePendingReminderInstances } from "@/lib/remindersScheduler";
import { useFriendsFrontSync } from "@/lib/useFriendsFrontSync";
import ReminderToast from "@/components/reminders/ReminderToast";
import { Bell } from "lucide-react";
import useSwipeBack from "@/hooks/useSwipeBack";
import FeatureTour from "@/components/onboarding/FeatureTour";
import { useTheme } from "@/lib/ThemeContext";
import { setAccessibilityFontFamily, setAccessibilityFontSize } from "@/lib/useAccessibility";
import AnnouncementBanner from "@/components/layout/AnnouncementBanner";
import PreviewModeBanner from "@/components/preview/PreviewModeBanner";
import { toast } from "sonner";
import { getLocalIdentity, fetchFriendsList } from "@/lib/friendsApi";


const TAB_ROOTS = ["/", "/Home", "/system-checkin", "/journals", "/tasks"];

function isTabRoot(pathname) {
  return TAB_ROOTS.some((r) => pathname === r) || pathname === "/settings";
}

export default function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const terms = useTerms();
  // Push front-status snapshots to the Friends server whenever the active
  // front changes — covers all paths (modal, dashboard hold, alters swipe).
  useFriendsFrontSync();
  // Whether the in-app Back button should be shown (vs the menu icon).
  // Was previously a manual increment-on-each-pathname-change counter,
  // which mis-incremented on backward navigation and didn't reset on
  // refresh, so the button could appear when there was actually no
  // history to go back to — tapping it did nothing visible. We now read
  // React Router's own history index (window.history.state.idx) which
  // it bumps on PUSH and decrements on POP; falling back to "show menu"
  // when idx is 0 or unavailable.
  const [historyIdx, setHistoryIdx] = useState(() => (typeof window !== "undefined" ? (window.history.state?.idx ?? 0) : 0));
  const [showFeatureTour, setShowFeatureTour] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  useRemindersScheduler();
  // Three quick taps anywhere → open Grocery List as a privacy cover.
  useTripleTapPanic();
  // Reconcile any corrupt fronting-session state (duplicates, ghost-active
  // rows, multiple is_primary) once per session, so users who never open
  // the Set Fronters modal don't sit with stuck data forever.
  useFrontSessionSweep();

  // Poll friends every 60 s and show in-app banner when a friend's front changes.
  // On first run (app open) this replaces the old one-time check.
  useEffect(() => {
    async function checkFriendFrontChanges() {
      try {
        const identity = await getLocalIdentity();
        if (!identity) return;
        const data = await fetchFriendsList().catch(() => null);
        if (!data?.friends?.length) return;

        const snapshots = JSON.parse(localStorage.getItem("friends_front_snapshots") || "{}");
        const newSnapshots = { ...snapshots };

        for (const friend of data.friends) {
          const updatedAt = friend.front?.updatedAt;
          const fronters = friend.front?.fronters || [];
          const privacyLevel = friend.front?.privacyLevel || 'names';

          const prev = snapshots[friend.userId];
          // Initialise snapshot without toasting on first sight
          if (!prev) { newSnapshots[friend.userId] = { updatedAt, fronters }; continue; }
          if (!updatedAt || updatedAt === prev.updatedAt) continue;

          const label = friend.displayName || friend.systemName || 'A friend';
          let fronterLine;
          if (privacyLevel === 'hidden') {
            fronterLine = 'updated their front';
          } else if (privacyLevel === 'count_only') {
            fronterLine = `${fronters.length} fronting`;
          } else {
            fronterLine = fronters.length
              ? fronters.map(f => f.name).join(', ')
              : 'no one fronting';
          }

          toast(`🔔 ${label}: ${fronterLine}`, {
            description: 'Front updated',
            duration: 10000,
          });

          newSnapshots[friend.userId] = { updatedAt, fronters };
        }

        localStorage.setItem("friends_front_snapshots", JSON.stringify(newSnapshots));
      } catch (_) {}
    }

    checkFriendFrontChanges();
    const id = setInterval(checkFriendFrontChanges, 60_000);
    return () => clearInterval(id);
  }, []); // intentional — runs once on mount, interval keeps it live

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

// Count tasks the user should "see" right now — urgent + anything with a
// due_date or scheduled_at coming up in the next 72 hours. Drives the
// notification badge on the To-Do nav item.
const { data: todoTasks = [] } = useQuery({
  queryKey: ["tasks"],
  queryFn: () => base44.entities.Task.list(),
});
const todoAlertCount = React.useMemo(() => {
  const now = Date.now();
  const horizon = now + 72 * 60 * 60 * 1000;
  return todoTasks.filter(t => {
    if (t.completed) return false;
    if (t.is_urgent) return true;
    if (t.scheduled_at) {
      const s = new Date(t.scheduled_at).getTime();
      if (s >= now && s <= horizon) return true;
    }
    if (t.due_date) {
      // Handle both YYYY-MM-DD (anchor at end-of-day local) and full ISO
      // (parse straight) — concatenating "T23:59:59" to an already-ISO
      // string produced Invalid Date and silently zeroed the badge count.
      const hasTime = typeof t.due_date === "string" && t.due_date.includes("T");
      const d = hasTime
        ? new Date(t.due_date).getTime()
        : new Date(`${t.due_date}T23:59:59`).getTime();
      if (!Number.isNaN(d) && d >= now && d <= horizon) return true;
    }
    return false;
  }).length;
}, [todoTasks]);

const activeSession = sessions.find((s) => s.is_active);
const frontingAlterIds = activeSession
  ? activeSession.alter_id
    ? sessions.filter(s => s.is_active && s.alter_id).map(s => s.alter_id)
    : [activeSession.primary_alter_id, ...(activeSession.co_fronter_ids || [])].filter(Boolean)
  : [];

// Fronter-linked theme: when primary fronter changes, apply their linked preset
const { alterThemeLinks, setSelectedTheme, setThemeMode, clearCustomColors, allPresets, userCustomPresets } = useTheme();

// Resolve the true primary fronter by is_primary flag (not list order)
const primaryFronter = activeSession?.alter_id
  ? (sessions.find(s => s.is_active && s.alter_id && s.is_primary)?.alter_id ?? frontingAlterIds[0] ?? null)
  : (activeSession?.primary_alter_id ?? null);
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
  if (preset.themeMode) setThemeMode(preset.themeMode);
  if (preset.fontSize) setAccessibilityFontSize(preset.fontSize);
  // Apply terminology saved with the preset
  if (preset.terms) {
    const settings = systemSettings?.[0];
    const termData = {
      term_system: preset.terms.system || 'system',
      term_alter:  preset.terms.alter  || 'alter',
      term_switch: preset.terms.switch || 'switch',
      term_front:  preset.terms.front  || 'front',
    };
    const op = settings?.id
      ? base44.entities.SystemSettings.update(settings.id, termData)
      : base44.entities.SystemSettings.create(termData);
    op.catch(() => {});
  }
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
    // Track React Router's own history index on each navigation. PUSH
    // bumps it, POP decrements, REPLACE leaves it where it is.
    setHistoryIdx(window.history.state?.idx ?? 0);
  }, [location.pathname]);

  const canGoBack = historyIdx > 0 && !isTabRoot(location.pathname);

  // Bulletproof back: try navigate(-1) if we genuinely have history to
  // pop, otherwise fall back to the Dashboard. Prevents the "tap does
  // nothing" case where the user opened the page via deep link / fresh
  // reload (no history) but the button was still being rendered.
  const handleBack = () => {
    if ((window.history.state?.idx ?? 0) > 0) {
      navigate(-1);
    } else {
      navigate("/");
    }
  };
  const { indicatorVisible, indicatorProgress } = useSwipeBack();

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* ── Safe area top spacer (mobile only) ── */}
      <div style={{ height: 'env(safe-area-inset-top, 0px)', background: 'var(--background)' }} className="sm:hidden" />

      {/* ── Preview Mode Banner ── */}
      <PreviewModeBanner />

      {/* ── Announcement Banner ── */}
      <AnnouncementBanner />

      {/* ── Desktop top header (hidden on mobile) ──
          The inner row spans the full viewport width so the logo + name
          sit flush to the left edge and the nav buttons sit flush to the
          right edge, instead of being centred inside a max-w-6xl block. */}
      <header className="sticky top-0 z-50 bg-background/85 backdrop-blur-xl hidden sm:block border-b border-border/50">
        <HeaderWaveBlock />
        <div className="w-full px-4 sm:px-6 h-16 flex items-center justify-between relative" style={{ zIndex: 1 }}>
          <Link to="/" className="flex items-center gap-2.5 select-none" aria-label="Oceans Symphony home">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <img src="/logo.png" className="w-7 h-7 object-contain rounded-md" alt="logo" />
            </div>
            <span className="font-display text-lg font-semibold tracking-tight text-foreground">Oceans Symphony</span>
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
                <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-red-500 text-white rounded-full text-[0.5625rem] font-bold flex items-center justify-center">
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

      {/* ── Mobile top bar (shown only on mobile) ──
          Layout: animated wave-tinted block fills the top half behind
          everything; the title is centered horizontally; the back/menu
          button sits on the left and the bell+settings on the right.
          The wave's bottom edge crosses through the centre of the
          title and the icons, like a horizon line. */}
      <header className="sticky top-0 z-50 bg-background/90 backdrop-blur-xl sm:hidden flex flex-col border-b border-border/50">
        <HeaderWaveBlock />
        <div className="flex items-center justify-between px-2 h-14 relative" style={{ zIndex: 1 }}>
          {/* Left: back button or menu icon */}
          {canGoBack ?
            <button
              onClick={handleBack}
              aria-label="Go back"
              className="flex items-center gap-1 text-primary min-w-[44px] min-h-[44px] px-2 rounded-xl transition-colors hover:bg-muted/50">
              <ChevronLeft className="w-5 h-5" />
              <span className="text-sm font-medium">Back</span>
            </button> :
            <button
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation menu"
              className="flex items-center justify-center min-w-[44px] min-h-[44px] rounded-xl transition-colors hover:bg-muted/50 flex-shrink-0">
              <img src="/logo.png" className="w-7 h-7 object-contain rounded-md" alt="logo" />
            </button>
          }

          {/* Centered title — absolutely positioned so it stays in the
              true middle regardless of how wide the side controls are. */}
          <button
            onClick={() => navigate("/")}
            aria-label="Home"
            className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 select-none px-2 max-w-[60%] truncate"
          >
            <span className="font-display text-lg font-normal tracking-tight text-foreground">
              Oceans Symphony
            </span>
          </button>

          {/* Right: bell + settings */}
          <div className="flex items-center gap-1">
            <Link to="/reminders" aria-label="Reminders"
              className={cn(
                "relative flex items-center justify-center min-w-[44px] min-h-[44px] rounded-xl transition-colors",
                location.pathname.startsWith("/reminders") ? "text-primary bg-primary/10" : "text-muted-foreground hover:bg-muted/50"
              )}>
              <Bell className="w-5 h-5" />
              {pendingCount > 0 && (
                <span className="absolute top-2 right-2 w-3.5 h-3.5 bg-red-500 text-white rounded-full text-[0.5625rem] font-bold flex items-center justify-center">
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

      {/* ── Desktop: sidebar + content / Mobile: content only ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Desktop persistent sidebar */}
        <aside className="hidden sm:flex flex-col w-52 shrink-0 border-r border-border/40 overflow-y-auto sticky top-16 self-start h-[calc(100vh-4rem)]">
          <nav className="px-2 py-4 space-y-5 flex-1 overflow-y-auto" aria-label="Sidebar navigation">
            {[
              {
                label: terms.System,
                items: [
                  { id: "alters",   label: terms.Alters,           icon: Users,       path: "/Home" },
                  { id: "friends",  label: "Friends",              icon: UserRound,   path: "/friends" },
                  { id: "groups",   label: "Groups",               icon: Users,       path: "/groups" },
                  { id: "settings", label: "Settings",             icon: Settings,    path: "/settings" },
                ],
              },
              {
                label: "Tracking",
                items: [
                  { id: "checkin",         label: `${terms.System} Meeting`, icon: Sparkles,    path: "/system-checkin" },
                  { id: "checkin-log",     label: "Check-In Log",           icon: Heart,       path: "/checkin-log" },
                  { id: "activities",      label: "Activities",             icon: Zap,         path: "/activities" },
                  { id: "tasks",           label: "Daily Tasks",            icon: CheckSquare, path: "/tasks" },
                  { id: "todo",            label: "To-Do List",             icon: ClipboardList,path: "/todo" },
                  { id: "sleep",           label: "Sleep",                  icon: Activity,    path: "/sleep" },
                  { id: "location-history",label: "Locations",              icon: MapPin,      path: "/location-history" },
                ],
              },
              {
                label: "Journal & Content",
                items: [
                  { id: "journals", label: "Journals", icon: BookOpen, path: "/journals" },
                  { id: "polls",    label: "Polls",    icon: Vote,     path: "/polls" },
                ],
              },
              {
                label: "Tools",
                items: [
                  { id: "reminders",      label: "Reminders",       icon: Bell,     path: "/reminders" },
                  { id: "therapy-report", label: "Therapy Report",  icon: FileText, path: "/therapy-report" },
                  { id: "support",        label: "Support & Learn", icon: BookOpen, path: "/grounding" },
                  { id: "safety-plan",    label: "Safety Plan",     icon: Shield,   path: "/safety-plan" },
                ],
              },
              {
                label: "Analytics",
                items: [
                  { id: "analytics",      label: "Analytics",              icon: BarChart2, path: "/analytics" },
                  { id: "system-map",     label: `${terms.System} Map`,    icon: GitBranch, path: "/system-map" },
                  { id: "timeline",       label: "Timeline",               icon: Clock,     path: "/timeline" },
                  { id: "system-history", label: `${terms.System} History`,icon: GitMerge,  path: "/system-history" },
                ],
              },
            ].map(({ label, items }) => (
              <div key={label}>
                <p className="text-[0.625rem] font-semibold uppercase tracking-wider text-muted-foreground px-2 mb-1">
                  {label}
                </p>
                <div className="space-y-0.5">
                  {items.map((item) => {
                    const Icon = item.icon;
                    const isActive = item.path === "/"
                      ? location.pathname === "/"
                      : item.path === "/Home"
                      ? location.pathname === "/Home" || location.pathname.startsWith("/alter")
                      : location.pathname.startsWith(item.path);
                    return (
                      <Link
                        key={item.id}
                        to={item.path}
                        aria-current={isActive ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors",
                          isActive
                            ? "bg-primary/10 text-primary"
                            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                        )}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.id === "reminders" && pendingCount > 0 && (
                          <span className="w-4 h-4 bg-red-500 text-white rounded-full text-[0.5625rem] font-bold flex items-center justify-center shrink-0">
                            {pendingCount > 9 ? "9+" : pendingCount}
                          </span>
                        )}
                        {item.id === "todo" && todoAlertCount > 0 && (
                          <span className="w-4 h-4 bg-amber-500 text-white rounded-full text-[0.5625rem] font-bold flex items-center justify-center shrink-0" title="Urgent or due-soon to-dos">
                            {todoAlertCount > 9 ? "9+" : todoAlertCount}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </aside>

        {/* Main content */}
        <main className="app-content-main flex-1 min-w-0 px-4 sm:px-6 py-0 sm:py-8 sm:pb-8 overflow-auto">
          <div className="pt-3 sm:pt-0 pb-2 sm:pb-4">
            <Base44MigrationBanner />
          </div>
          <Outlet context={{ setShowFeatureTour }} />
        </main>

      </div>

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
                <span className="text-[0.6875rem] font-medium text-center leading-tight">{item.label}</span>
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
      <FloatingGroundingButton />
      <GroceryListPanel />
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