// Widget registry for the experimental homescreen — one entry per widget,
// wrapping the SAME self-fetching components the classic dashboard renders
// (no rewrites; the homescreen is a second renderer over the same parts).
//
// Entry shape:
//   { label, description, icon, category,
//     render({ mode, settings, instanceId, api }) → JSX,
//     supportsModes, supportsMultiInstance,
//     defaultSpan, minSpan, maxSpan }
//
// Labels/descriptions may contain {{term}} tokens ({{fronters}}, {{Alters}},
// …) — the registry is a static module and can't call useTerms(), so
// consumers resolve them via widgetLabel(def, t) / widgetDescription(def, t)
// below (same pattern as AUTO_TRIGGER_LABELS in dailyTaskSystem.js). Never
// render def.label / def.description raw.
//
// `api` is the HomeApi bundle provided by ExperimentalDashboard (handlers
// hosted in Dashboard.jsx — modal openers, hold gesture, notification
// state) so chrome widgets and quick-action buttons work without every
// widget re-implementing Dashboard's plumbing.

import React from "react";
import { useNavigate } from "react-router-dom";
import {
  Users, Heart, ClipboardList, Zap, MessageSquare, Pin, Sparkles, Clock,
  Inbox, HelpCircle, LayoutGrid, Bell, StickyNote, Activity as ActivityIcon,
  Contact, CalendarDays, ListTodo, Megaphone, Lightbulb, Rocket,
} from "lucide-react";
import { useTerms } from "@/lib/useTerms";
import { applyTerms } from "@/lib/dailyTaskSystem";
import { buildGridItems, findGridItem } from "@/lib/navCatalogue";
import { getFrequentPages } from "@/lib/pageVisitTracker";
import { useCurrentFocus } from "@/lib/currentFocus";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { frontShare, coFrontingPairs } from "@/lib/analytics/fronting";
import { lastNDays } from "@/lib/analytics/range";
import { useAlterLabel } from "@/lib/useAlterLabel";
import AlterAvatar from "@/components/shared/AlterAvatar";

import UpcomingPlans from "@/components/dashboard/UpcomingPlans";
import CurrentFronters from "@/components/dashboard/CurrentFronters";
import PinnedAltersGallery from "@/components/alters/PinnedAltersGallery";
import StatusNoteCard from "@/components/dashboard/StatusNoteCard";
import DashboardPins from "@/components/dashboard/DashboardPins";
import PinnedDailyTasksWidget from "@/components/dashboard/PinnedDailyTasksWidget";
import CurrentSymptoms from "@/components/symptoms/CurrentSymptoms";
import CurrentActivities from "@/components/activities/CurrentActivities";
import CurrentContacts from "@/components/contacts/CurrentContacts";
import NewFeaturesBar from "@/components/dashboard/NewFeaturesBar";
import InsightSpotlight from "@/components/dashboard/InsightSpotlight";
import QuickNavMenu from "@/components/dashboard/QuickNavMenu";
import BulletinBoard from "@/components/bulletin/BulletinBoard";
import QuickCheckinButtons from "@/components/dashboard/QuickCheckinButtons";
import SystemHeaderCard from "@/components/dashboard/SystemHeaderCard";

// Generic minimal-mode shell — gives every widget a "minimal" rendering
// for free: icon + label (+ the widget can still be tapped via settings
// later). Widgets that implement richer minimal modes can opt out by
// listing "minimal" in supportsModes and handling it in render().
function MinimalShell({ icon: Icon, label }) {
  const t = useTerms();
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border/40 bg-card/50 text-sm">
      {Icon && <Icon className="w-4 h-4 text-primary flex-shrink-0" />}
      <span className="truncate font-medium">{applyTerms(label, t)}</span>
    </div>
  );
}

// Resolve a registry entry's {{term}} tokens with the user's terminology.
// Every surface that shows def.label / def.description goes through these.
export function widgetLabel(def, terms) {
  return applyTerms(def?.label || "", terms);
}
export function widgetDescription(def, terms) {
  return applyTerms(def?.description || "", terms);
}

// Phone-style app shortcut tile — settings.targetId points at an entry in
// the shared nav catalogue (navCatalogue.js), so icon/colour/label always
// match the app drawer and quick-nav grid. Multi-instance: pin as many
// apps to the homescreen as you like.
function AppShortcutWidget({ mode, settings }) {
  const t = useTerms();
  const navigate = useNavigate();
  const items = React.useMemo(() => buildGridItems(t.Alters, t.System), [t.Alters, t.System]);
  const item = findGridItem(items, settings?.targetId);
  // Custom icon/name from the widget's advanced config (gear menu).
  const customIcon = useResolvedAvatarUrl(settings?.iconUrl || "");
  if (!item) {
    return (
      <div className="w-full h-full min-h-[44px] flex items-center justify-center rounded-xl border border-dashed border-border/50 text-xs text-muted-foreground px-2 text-center">
        Missing shortcut — remove me
      </div>
    );
  }
  const Icon = item.icon;
  const label = (settings?.label || item.label).slice(0, 60);
  return (
    <button
      type="button"
      onClick={() => navigate(item.path)}
      title={label}
      className="w-full h-full min-h-[56px] flex flex-col items-center justify-center gap-1 rounded-xl hover:bg-muted/40 transition-colors py-1.5"
    >
      {customIcon ? (
        <img src={customIcon} alt="" className="w-11 h-11 rounded-2xl object-cover" />
      ) : (
        <span className={`w-11 h-11 rounded-2xl flex items-center justify-center ${item.color}`}>
          <Icon className="w-5 h-5" />
        </span>
      )}
      {mode !== "minimal" && (
        <span className="text-[0.6875rem] text-center leading-tight text-muted-foreground line-clamp-2 px-0.5">
          {label}
        </span>
      )}
    </button>
  );
}

// "Frequently opened" — the top visited pages (weekly-decayed counts from
// pageVisitTracker), rendered as a row of app icons. Only pages that exist
// in the nav catalogue are shown; the dashboard itself is excluded.
function FrequentlyOpenedWidget({ mode }) {
  const t = useTerms();
  const navigate = useNavigate();
  const items = React.useMemo(() => buildGridItems(t.Alters, t.System), [t.Alters, t.System]);
  const byPath = React.useMemo(() => new Map(items.map((i) => [i.path, i])), [items]);
  // Visit data only changes on navigation, so a per-render read is fresh
  // enough — no state/subscription needed.
  const top = getFrequentPages(24)
    .map((v) => byPath.get(v.path))
    .filter((i) => i && i.path !== "/")
    .slice(0, mode === "expanded" ? 8 : 4);
  if (top.length === 0) {
    return (
      <div className="px-3 py-2 rounded-xl border border-border/40 bg-card/50 text-xs text-muted-foreground">
        Frequently opened — appears once you've used the app a little.
      </div>
    );
  }
  return (
    <div className="flex items-start justify-around gap-1 py-1">
      {top.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => navigate(item.path)}
            title={item.label}
            className="flex flex-col items-center gap-1 min-w-0 flex-1 rounded-xl hover:bg-muted/40 transition-colors py-1"
          >
            <span className={`w-10 h-10 rounded-2xl flex items-center justify-center ${item.color}`}>
              <Icon className="w-4.5 h-4.5" />
            </span>
            {mode !== "minimal" && (
              <span className="text-[0.625rem] text-center leading-tight text-muted-foreground line-clamp-2 px-0.5 w-full">
                {item.label}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// "Fronting leaders" — top fronters by time (frontShare) and top
// co-fronting pairs (coFrontingPairs) over the last week or month.
// settings.window: "week" | "month" (configurable via the gear menu is
// future work — the widget itself offers a small toggle).
function FrontingLeadersWidget({ mode, settings, instanceId, api }) {
  const t = useTerms();
  const formatAlter = useAlterLabel();
  const [windowSel, setWindowSel] = React.useState(settings?.window === "month" ? "month" : "week");
  const { data: sessions = [] } = useQuery({
    queryKey: ["frontingSessions"],
    queryFn: () => base44.entities.FrontingSession.list(),
  });
  const alters = api?.alters || [];
  const altersById = React.useMemo(() => Object.fromEntries(alters.map((a) => [a.id, a])), [alters]);

  const { top, pairs } = React.useMemo(() => {
    const range = lastNDays(windowSel === "month" ? 30 : 7);
    const share = frontShare({ sessions, range });
    const top = [...share.perAlterMs.entries()]
      .map(([id, ms]) => ({ alter: altersById[id], ms }))
      .filter((x) => x.alter && !x.alter.is_archived)
      .sort((a, b) => b.ms - a.ms)
      .slice(0, 5);
    const pairs = coFrontingPairs({ sessions, range })
      .map((p) => ({ ...p, a: altersById[p.alterIdA], b: altersById[p.alterIdB] }))
      .filter((p) => p.a && p.b)
      .slice(0, 3);
    return { top, pairs };
  }, [sessions, altersById, windowSel]);

  const fmtH = (ms) => {
    const h = ms / 3600000;
    return h >= 10 ? `${Math.round(h)}h` : h >= 1 ? `${h.toFixed(1)}h` : `${Math.round(ms / 60000)}m`;
  };

  if (top.length === 0) {
    return (
      <div className="px-3 py-2 rounded-xl border border-border/40 bg-card/50 text-xs text-muted-foreground">
        No {t.fronting} data in the last {windowSel === "month" ? "month" : "week"} yet.
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-border/40 bg-card/50 px-3 py-2">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[0.625rem] font-semibold uppercase tracking-wider text-muted-foreground">
          {t.Fronting} leaders
        </p>
        <button
          type="button"
          onClick={() => setWindowSel((w) => (w === "week" ? "month" : "week"))}
          className="text-[0.625rem] px-1.5 py-0.5 rounded-full border border-border/40 text-muted-foreground hover:text-foreground"
        >
          {windowSel === "month" ? "30d" : "7d"}
        </button>
      </div>
      <div className="space-y-1">
        {(mode === "minimal" ? top.slice(0, 3) : top).map(({ alter, ms }, i) => (
          <div key={alter.id} className="flex items-center gap-2">
            <span className="text-[0.625rem] text-muted-foreground w-3 text-right tabular-nums">{i + 1}</span>
            <AlterAvatar alter={alter} size="xs" />
            <span className="text-xs truncate flex-1">{formatAlter(alter)}</span>
            <span className="text-[0.6875rem] text-muted-foreground tabular-nums">{fmtH(ms)}</span>
          </div>
        ))}
      </div>
      {mode !== "minimal" && pairs.length > 0 && (
        <>
          <p className="text-[0.625rem] font-semibold uppercase tracking-wider text-muted-foreground mt-2 mb-1">
            Top {t.cofronting || "co-fronting"} pairs
          </p>
          <div className="space-y-1">
            {pairs.map((p) => (
              <div key={`${p.alterIdA}--${p.alterIdB}`} className="flex items-center gap-1.5">
                <span className="flex -space-x-1.5">
                  <AlterAvatar alter={p.a} size="xs" />
                  <AlterAvatar alter={p.b} size="xs" />
                </span>
                <span className="text-xs truncate flex-1">
                  {formatAlter(p.a)} + {formatAlter(p.b)}
                </span>
                <span className="text-[0.6875rem] text-muted-foreground tabular-nums">{fmtH(p.totalOverlap)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const FOCUS_DOT = {
  fronting: "bg-green-500",
  activity: "bg-amber-500",
  sleep: "bg-indigo-500",
  symptom: "bg-violet-500",
  status: "bg-sky-500",
};

// "Current Focus" — what's going on right now, in one glance. minimal =
// one-line banner; normal = tappable list.
function CurrentFocusWidget({ mode }) {
  const navigate = useNavigate();
  const { items } = useCurrentFocus();
  if (items.length === 0) {
    return (
      <div className="px-3 py-2 rounded-xl border border-border/40 bg-card/50 text-xs text-muted-foreground">
        Nothing in focus right now.
      </div>
    );
  }
  if (mode === "minimal") {
    const first = items[0];
    return (
      <button
        type="button"
        onClick={() => navigate(first.path)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-xl border border-border/40 bg-card/50 text-sm text-left hover:bg-muted/40 transition-colors"
      >
        <span className={`w-2 h-2 rounded-full animate-pulse flex-shrink-0 ${FOCUS_DOT[first.type] || "bg-primary"}`} />
        <span className="truncate">{first.label}</span>
        {items.length > 1 && (
          <span className="ml-auto text-[0.6875rem] text-muted-foreground flex-shrink-0">+{items.length - 1}</span>
        )}
      </button>
    );
  }
  return (
    <div className="rounded-xl border border-border/40 bg-card/50 px-3 py-2">
      <p className="text-[0.625rem] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Current focus</p>
      <div className="space-y-1">
        {items.slice(0, 6).map((it, i) => (
          <button
            key={`${it.type}_${i}`}
            type="button"
            onClick={() => navigate(it.path)}
            className="w-full flex items-center gap-2 text-sm text-left rounded-lg px-1.5 py-1 hover:bg-muted/40 transition-colors"
          >
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${FOCUS_DOT[it.type] || "bg-primary"}`} />
            <span className="truncate">{it.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// Wrap a plain component: normal/expanded/detailed all render the real
// component (deeper modes are opt-in improvements over time); minimal
// renders the shell.
function simple(label, icon, Component, extraProps = {}) {
  return ({ mode }) =>
    mode === "minimal" ? <MinimalShell icon={icon} label={label} /> : <Component {...extraProps} />;
}

export const WIDGET_REGISTRY = {
  // ── Chrome (formerly fixed header) ─────────────────────────────
  system_header: {
    label: "Header (name, date & time)", description: "Your {{system}}'s name with the live date and time.",
    icon: Sparkles, category: "chrome",
    render: ({ mode, api }) => <SystemHeaderCard mode={mode} api={api} />,
    supportsModes: ["minimal", "normal"],
    supportsMultiInstance: false,
    defaultSpan: { cols: 4, rows: 1 }, minSpan: { cols: 1, rows: 1 }, maxSpan: { cols: 12, rows: 2 },
  },
  clock: {
    label: "Clock", description: "Just the time and date — place as many as you like.",
    icon: Clock, category: "chrome",
    render: ({ mode }) => <ClockWidget mode={mode} />,
    supportsModes: ["minimal", "normal", "expanded"],
    supportsMultiInstance: true,
    defaultSpan: { cols: 2, rows: 1 }, minSpan: { cols: 1, rows: 1 }, maxSpan: { cols: 6, rows: 2 },
  },
  help_button: {
    label: "Setup & tour", description: "The guide/tour button, as a placeable tile.",
    icon: HelpCircle, category: "chrome",
    render: ({ api }) => (
      <button
        type="button"
        onClick={() => api?.openTour?.()}
        className="w-full h-full min-h-[44px] flex items-center justify-center gap-2 rounded-xl border border-border/40 bg-card/50 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <HelpCircle className="w-4 h-4" /> Setup & tour
        {api?.checklistIncomplete && <span className="w-2 h-2 rounded-full bg-primary" aria-hidden="true" />}
      </button>
    ),
    supportsModes: ["normal"],
    supportsMultiInstance: false,
    defaultSpan: { cols: 2, rows: 1 }, minSpan: { cols: 1, rows: 1 }, maxSpan: { cols: 4, rows: 1 },
  },
  notification_inbox: {
    label: "Notifications", description: "The notification-history button, as a placeable tile.",
    icon: Inbox, category: "chrome",
    render: ({ api }) => (
      <button
        type="button"
        onClick={() => api?.openNotifHistory?.()}
        className="relative w-full h-full min-h-[44px] flex items-center justify-center gap-2 rounded-xl border border-border/40 bg-card/50 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <Inbox className="w-4 h-4" /> Notifications
        {api?.hasUnreadMentions && <span className="absolute top-2 right-2 w-2 h-2 bg-primary rounded-full" aria-hidden="true" />}
      </button>
    ),
    supportsModes: ["normal"],
    supportsMultiInstance: false,
    defaultSpan: { cols: 2, rows: 1 }, minSpan: { cols: 1, rows: 1 }, maxSpan: { cols: 4, rows: 1 },
  },

  // ── Quick actions ──────────────────────────────────────────────
  quick_checkin: {
    label: "Quick action buttons", description: "Quick Check-In plus the start/quick buttons.",
    icon: Heart, category: "actions",
    render: ({ api }) => (
      <QuickCheckinButtons
        hold={api?.hold || {}}
        holdProgress={api?.holdProgress || 0}
        holdActive={api?.holdActive || false}
        show={{ start_activity: true, start_symptom: true, quick_task: true, quick_plan: true }}
        on={api?.quickOn || {}}
        quickActionsSlot={api?.quickActionsSlot || null}
      />
    ),
    supportsModes: ["normal"],
    supportsMultiInstance: false,
    defaultSpan: { cols: 4, rows: 1 }, minSpan: { cols: 1, rows: 1 }, maxSpan: { cols: 12, rows: 2 },
  },

  // ── System ─────────────────────────────────────────────────────
  current_fronters: {
    label: "Current {{fronters}}", description: "Who's {{fronting}} right now, with per-{{alter}} panels.",
    icon: Users, category: "system",
    render: ({ mode, api }) =>
      mode === "minimal"
        ? <MinimalShell icon={Users} label="Current {{fronters}}" />
        : <CurrentFronters alters={api?.alters || []} hideStatusNote={api?.statusNotePlaced ?? true} />,
    supportsModes: ["minimal", "normal"],
    supportsMultiInstance: false,
    defaultSpan: { cols: 4, rows: 2 }, minSpan: { cols: 1, rows: 1 }, maxSpan: { cols: 12, rows: 4 },
  },
  pinned_alters: {
    label: "Pinned {{alters}}", description: "The pinned-{{alters}} gallery.",
    icon: Pin, category: "system",
    render: simple("Pinned {{alters}}", Pin, PinnedAltersGallery),
    supportsModes: ["minimal", "normal"],
    supportsMultiInstance: false,
    defaultSpan: { cols: 4, rows: 1 }, minSpan: { cols: 1, rows: 1 }, maxSpan: { cols: 12, rows: 3 },
  },
  status_note: {
    label: "Status note", description: "Set a new status; shows the latest one.",
    icon: StickyNote, category: "system",
    render: simple("Status note", StickyNote, StatusNoteCard),
    supportsModes: ["minimal", "normal"],
    supportsMultiInstance: false,
    defaultSpan: { cols: 4, rows: 1 }, minSpan: { cols: 1, rows: 1 }, maxSpan: { cols: 12, rows: 2 },
  },
  bulletin_board: {
    label: "Bulletin board", description: "{{System}}-wide posts, comments, and polls.",
    icon: Megaphone, category: "system",
    render: ({ mode, api }) =>
      mode === "minimal"
        ? <MinimalShell icon={Megaphone} label="Bulletin board" />
        : (
          <BulletinBoard
            alters={api?.alters || []}
            currentAlterId={api?.currentAlterId || null}
            frontingAlterIds={api?.frontingAlterIds || []}
            highlightBulletinId={api?.highlightBulletinId || null}
          />
        ),
    supportsModes: ["minimal", "normal"],
    supportsMultiInstance: false,
    defaultSpan: { cols: 4, rows: 3 }, minSpan: { cols: 1, rows: 1 }, maxSpan: { cols: 12, rows: 6 },
  },

  // ── Tracking ───────────────────────────────────────────────────
  current_symptoms: {
    label: "Active symptoms", description: "Symptom sessions currently running.",
    icon: ActivityIcon, category: "tracking",
    render: simple("Active symptoms", ActivityIcon, CurrentSymptoms),
    supportsModes: ["minimal", "normal"],
    supportsMultiInstance: false,
    defaultSpan: { cols: 2, rows: 1 }, minSpan: { cols: 1, rows: 1 }, maxSpan: { cols: 12, rows: 2 },
  },
  current_activities: {
    label: "Active activities", description: "Activity timers currently running.",
    icon: Zap, category: "tracking",
    render: simple("Active activities", Zap, CurrentActivities),
    supportsModes: ["minimal", "normal"],
    supportsMultiInstance: false,
    defaultSpan: { cols: 2, rows: 1 }, minSpan: { cols: 1, rows: 1 }, maxSpan: { cols: 12, rows: 2 },
  },
  current_contacts: {
    label: "Currently with", description: "Contacts you're currently with.",
    icon: Contact, category: "tracking",
    render: simple("Currently with", Contact, CurrentContacts),
    supportsModes: ["minimal", "normal"],
    supportsMultiInstance: false,
    defaultSpan: { cols: 2, rows: 1 }, minSpan: { cols: 1, rows: 1 }, maxSpan: { cols: 12, rows: 2 },
  },
  upcoming_top: {
    label: "Upcoming plans", description: "Scheduled activities coming up.",
    icon: CalendarDays, category: "tracking",
    render: simple("Upcoming plans", CalendarDays, UpcomingPlans, { placement: "home_top" }),
    supportsModes: ["minimal", "normal"],
    supportsMultiInstance: false,
    defaultSpan: { cols: 4, rows: 1 }, minSpan: { cols: 1, rows: 1 }, maxSpan: { cols: 12, rows: 3 },
  },
  upcoming_bottom: {
    label: "Upcoming plans (secondary)", description: "A second upcoming-plans surface.",
    icon: CalendarDays, category: "tracking",
    render: simple("Upcoming plans", CalendarDays, UpcomingPlans, { placement: "home_bottom" }),
    supportsModes: ["minimal", "normal"],
    supportsMultiInstance: false,
    defaultSpan: { cols: 4, rows: 1 }, minSpan: { cols: 1, rows: 1 }, maxSpan: { cols: 12, rows: 3 },
  },
  pinned_daily_tasks: {
    label: "Daily tasks", description: "Pinned daily tasks with check-off.",
    icon: ListTodo, category: "tracking",
    render: simple("Daily tasks", ListTodo, PinnedDailyTasksWidget),
    supportsModes: ["minimal", "normal"],
    supportsMultiInstance: false,
    defaultSpan: { cols: 4, rows: 2 }, minSpan: { cols: 1, rows: 1 }, maxSpan: { cols: 12, rows: 4 },
  },
  dashboard_pins: {
    label: "Pinned items", description: "Bulletins and notes pinned to the dashboard.",
    icon: Pin, category: "tracking",
    render: simple("Pinned items", Pin, DashboardPins),
    supportsModes: ["minimal", "normal"],
    supportsMultiInstance: false,
    defaultSpan: { cols: 4, rows: 1 }, minSpan: { cols: 1, rows: 1 }, maxSpan: { cols: 12, rows: 3 },
  },

  // ── Meta / nav ─────────────────────────────────────────────────
  fronting_leaders: {
    label: "{{Fronting}} leaders", description: "Most frequent {{fronters}} and {{cofronting}} pairs this week or month.",
    icon: Users, category: "meta",
    render: ({ mode, settings, instanceId, api }) => (
      <FrontingLeadersWidget mode={mode} settings={settings} instanceId={instanceId} api={api} />
    ),
    supportsModes: ["minimal", "normal"],
    supportsMultiInstance: false,
    defaultSpan: { cols: 4, rows: 2 }, minSpan: { cols: 2, rows: 1 }, maxSpan: { cols: 12, rows: 4 },
  },
  current_focus: {
    label: "Current focus", description: "What's going on right now — {{fronting}}, running timers, active symptoms, today's status.",
    icon: Lightbulb, category: "meta",
    render: ({ mode }) => <CurrentFocusWidget mode={mode} />,
    supportsModes: ["minimal", "normal"],
    supportsMultiInstance: false,
    defaultSpan: { cols: 4, rows: 1 }, minSpan: { cols: 1, rows: 1 }, maxSpan: { cols: 12, rows: 3 },
  },
  frequently_opened: {
    label: "Frequently opened", description: "Your most-visited pages as quick icons (learned automatically, fades weekly).",
    icon: Zap, category: "nav",
    render: ({ mode }) => <FrequentlyOpenedWidget mode={mode} />,
    supportsModes: ["minimal", "normal", "expanded"],
    supportsMultiInstance: false,
    defaultSpan: { cols: 4, rows: 1 }, minSpan: { cols: 2, rows: 1 }, maxSpan: { cols: 12, rows: 2 },
  },
  app_shortcut: {
    label: "App shortcut", description: "A phone-style icon that opens one app page. Pin apps from the drawer's Apps tab.",
    icon: Rocket, category: "nav",
    render: ({ mode, settings }) => <AppShortcutWidget mode={mode} settings={settings} />,
    supportsModes: ["minimal", "normal"],
    supportsMultiInstance: true,
    // Added via the pin button on the drawer's Apps tab (needs a targetId),
    // so it's hidden from the generic Add-widget list.
    hiddenFromDrawer: true,
    defaultSpan: { cols: 1, rows: 1 }, minSpan: { cols: 1, rows: 1 }, maxSpan: { cols: 4, rows: 2 },
  },
  quick_nav_menu: {
    label: "App grid & search", description: "The full navigation grid with global search.",
    icon: LayoutGrid, category: "nav",
    render: simple("App grid & search", LayoutGrid, QuickNavMenu),
    supportsModes: ["minimal", "normal"],
    supportsMultiInstance: false,
    defaultSpan: { cols: 4, rows: 3 }, minSpan: { cols: 1, rows: 1 }, maxSpan: { cols: 12, rows: 6 },
  },
  new_features_bar: {
    label: "What's new", description: "The latest changelog entries.",
    icon: Bell, category: "meta",
    render: simple("What's new", Bell, NewFeaturesBar),
    supportsModes: ["minimal", "normal"],
    supportsMultiInstance: false,
    defaultSpan: { cols: 4, rows: 1 }, minSpan: { cols: 1, rows: 1 }, maxSpan: { cols: 12, rows: 2 },
  },
  insight_spotlight: {
    label: "Insight spotlight", description: "A rotating insight from your data.",
    icon: Lightbulb, category: "meta",
    render: simple("Insight spotlight", Lightbulb, InsightSpotlight),
    supportsModes: ["minimal", "normal"],
    supportsMultiInstance: false,
    defaultSpan: { cols: 4, rows: 1 }, minSpan: { cols: 1, rows: 1 }, maxSpan: { cols: 12, rows: 2 },
  },
};

// Classic dashboard_layout element id → widget id (identity for everything
// that exists in both worlds; the sub-toggle button ids intentionally have
// no widget — they live on the action bar instead).
export const CLASSIC_TO_WIDGET = Object.fromEntries(
  [
    "upcoming_top", "current_fronters", "pinned_alters", "status_note",
    "dashboard_pins", "current_symptoms", "current_activities", "current_contacts",
    "quick_checkin", "pinned_daily_tasks", "new_features_bar", "insight_spotlight",
    "quick_nav_menu", "bulletin_board", "upcoming_bottom",
  ].map((id) => [id, id])
);

export const WIDGET_CATEGORIES = [
  { id: "chrome", label: "Header & chrome" },
  { id: "actions", label: "Quick actions" },
  { id: "system", label: "{{System}}" },
  { id: "tracking", label: "Tracking" },
  { id: "content", label: "Journals & content" },
  { id: "nav", label: "Navigation" },
  // Page-design pieces (headings, text, dividers, spacers) — they carry no
  // data, they're what lets a user compose a page rather than fill one.
  { id: "layout", label: "Page design" },
  { id: "meta", label: "App" },
];

// Standalone clock (multi-instance chrome widget).
function ClockWidget({ mode }) {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  if (mode === "minimal") {
    return (
      <div className="flex items-center justify-center h-full rounded-xl border border-border/40 bg-card/50 px-2 py-1.5 text-sm font-medium tabular-nums">
        {now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center h-full rounded-xl border border-border/40 bg-card/50 px-3 py-2">
      <span className="text-xl font-semibold tabular-nums">{now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
      <span className="text-xs text-muted-foreground">{now.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}</span>
      {mode === "expanded" && (
        <span className="text-[0.6875rem] text-muted-foreground mt-0.5">{now.toLocaleDateString([], { year: "numeric" })}</span>
      )}
    </div>
  );
}
