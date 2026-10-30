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
  Users, Heart, Zap, Pin, Sparkles, Clock,
  Inbox, HelpCircle, LayoutGrid, Bell, StickyNote, Activity as ActivityIcon,
  Contact, CalendarDays, ListTodo, Megaphone, Lightbulb, Rocket, Compass,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useTerms } from "@/lib/useTerms";
import { applyTerms } from "@/lib/dailyTaskSystem";
import { buildGridItems, findGridItem } from "@/lib/navCatalogue";
import { useModPagesVersion } from "@/lib/mods/registry";
import { getFrequentPages } from "@/lib/pageVisitTracker";
import { useCurrentFocus } from "@/lib/currentFocus";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { frontShare, coFrontingPairs } from "@/lib/analytics/fronting";
import { lastNDays } from "@/lib/analytics/range";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { useFrontLevels, filterCountedSessions } from "@/lib/frontLevels";
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
import QuickCheckinButtons, { resolveQuickButtons } from "@/components/dashboard/QuickCheckinButtons";
import SystemHeaderCard from "@/components/dashboard/SystemHeaderCard";
import { foldWidget } from "@/lib/widgetFold";

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
// What an UNNAMED widget instance goes by. A registry entry may declare
// autoLabel(settings) — the Song widget answers with the song's title — so
// the options sheet, edit-mode labels and placeholders show that instead
// of the generic catalogue name. The user's own display name (settings.
// label) always wins; callers check it first.
export function widgetAutoLabel(def, settings, terms) {
  let auto = "";
  try { auto = typeof def?.autoLabel === "function" ? def.autoLabel(settings || {}) : ""; } catch { auto = ""; }
  return (typeof auto === "string" && auto.trim()) ? auto.trim() : widgetLabel(def, terms);
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
  const modNavV = useModPagesVersion();
  const items = React.useMemo(() => buildGridItems(t.Alters, t.System), [t.Alters, t.System, modNavV]);
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
        <span className="text-[0.6875em] text-center leading-tight text-muted-foreground line-clamp-2 px-0.5">
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
  const modNavV = useModPagesVersion();
  const items = React.useMemo(() => buildGridItems(t.Alters, t.System), [t.Alters, t.System, modNavV]);
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
              <span className="text-[0.625em] text-center leading-tight text-muted-foreground line-clamp-2 px-0.5 w-full">
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
// co-fronting pairs (coFrontingPairs) over the last week, month or three
// months. The window, how many and the pairs are options (v0.324.0); the
// header chip steps the window and saves it. Tapping someone opens their
// profile.
const LEADER_WINDOWS = { week: 7, month: 30, quarter: 90 };
const LEADER_WINDOW_ORDER = ["week", "month", "quarter"];
function FrontingLeadersWidget({ mode, settings, api, updateSettings }) {
  const t = useTerms();
  const navigate = useNavigate();
  const formatAlter = useAlterLabel();
  const windowSel = LEADER_WINDOWS[settings?.window] ? settings.window : "week";
  const windowDays = LEADER_WINDOWS[windowSel];
  const topN = Math.max(1, Math.min(10, parseInt(settings?.top, 10) || 5));
  const showPairs = settings?.showPairs !== false;
  const stepWindow = () => {
    const next = LEADER_WINDOW_ORDER[(LEADER_WINDOW_ORDER.indexOf(windowSel) + 1) % LEADER_WINDOW_ORDER.length];
    updateSettings?.({ window: next });
  };
  const { data: sessions = [] } = useQuery({
    queryKey: ["frontingSessions"],
    queryFn: () => base44.entities.FrontingSession.list(),
  });
  const alters = api?.alters || [];
  const altersById = React.useMemo(() => Object.fromEntries(alters.map((a) => [a.id, a])), [alters]);

  const levelCfg = useFrontLevels();
  const { top, pairs } = React.useMemo(() => {
    const range = lastNDays(windowDays);
    // Fronting levels (opt-in): only counting levels feed the leaderboard.
    const counted = filterCountedSessions(sessions, levelCfg);
    const share = frontShare({ sessions: counted, range });
    const top = [...share.perAlterMs.entries()]
      .map(([id, ms]) => ({ alter: altersById[id], ms }))
      .filter((x) => x.alter && !x.alter.is_archived)
      .sort((a, b) => b.ms - a.ms)
      .slice(0, topN);
    const pairs = coFrontingPairs({ sessions: counted, range })
      .map((p) => ({ ...p, a: altersById[p.alterIdA], b: altersById[p.alterIdB] }))
      .filter((p) => p.a && p.b)
      .slice(0, 3);
    return { top, pairs };
  }, [sessions, altersById, windowDays, topN, levelCfg]);

  const fmtH = (ms) => {
    const h = ms / 3600000;
    return h >= 10 ? `${Math.round(h)}h` : h >= 1 ? `${h.toFixed(1)}h` : `${Math.round(ms / 60000)}m`;
  };

  if (top.length === 0) {
    return (
      <div className="px-3 py-2 rounded-xl border border-border/40 bg-card/50 text-xs text-muted-foreground">
        No {t.fronting} data in the last {windowDays} days yet.
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-border/40 bg-card/50 px-3 py-2">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[0.625em] font-semibold uppercase tracking-wider text-muted-foreground">
          {t.Fronting} leaders
        </p>
        <button
          type="button"
          onClick={stepWindow}
          aria-label={`Showing ${windowDays} days, tap for the next window`}
          className="text-[0.625em] px-1.5 py-0.5 rounded-full border border-border/40 text-muted-foreground hover:text-foreground"
        >
          {windowDays}d
        </button>
      </div>
      <div className="space-y-1">
        {(mode === "minimal" ? top.slice(0, 3) : top).map(({ alter, ms }, i) => (
          <button key={alter.id} type="button" onClick={() => navigate(`/alter/${alter.id}`)}
            className="w-full flex items-center gap-2 text-left rounded-md hover:bg-muted/40 -mx-1 px-1">
            <span className="text-[0.625em] text-muted-foreground w-3 text-right tabular-nums">{i + 1}</span>
            <AlterAvatar alter={alter} size="xs" />
            <span className="text-xs truncate flex-1">{formatAlter(alter)}</span>
            <span className="text-[0.6875em] text-muted-foreground tabular-nums">{fmtH(ms)}</span>
          </button>
        ))}
      </div>
      {mode !== "minimal" && showPairs && pairs.length > 0 && (
        <>
          <p className="text-[0.625em] font-semibold uppercase tracking-wider text-muted-foreground mt-2 mb-1">
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
                <span className="text-[0.6875em] text-muted-foreground tabular-nums">{fmtH(p.totalOverlap)}</span>
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
          <span className="ml-auto text-[0.785em] text-muted-foreground flex-shrink-0">+{items.length - 1}</span>
        )}
      </button>
    );
  }
  return (
    <div className="rounded-xl border border-border/40 bg-card/50 px-3 py-2">
      <p className="text-[0.625em] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Current focus</p>
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

// The home screen's corner buttons (board / guide / notifications) as
// one placeable row. Which buttons show, and in what order, is the
// widget's "buttons" option; a single button also shows its name (the old
// "Setup & tour" and "Notifications" tiles fold into this, v0.280.0).
const PAGE_BUTTON_IDS = ["board", "guide", "notifications"];
const PAGE_BUTTON_LABELS = { board: "Widget board", guide: "Setup & tour", notifications: "Notifications" };
function PageButtons({ api, settings }) {
  const picked = Array.isArray(settings?.buttons) ? settings.buttons.filter((b) => PAGE_BUTTON_IDS.includes(b)) : PAGE_BUTTON_IDS;
  const ids = picked.filter((b) => b !== "board" || api?.openWidgetBoard);
  const single = ids.length === 1;
  const btn = "relative min-w-[32px] min-h-[32px] flex items-center justify-center gap-2 rounded-lg hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors";
  const name = (id) => (single ? <span className="text-sm">{PAGE_BUTTON_LABELS[id]}</span> : null);
  const parts = {
    board: (
      <button key="board" type="button" onClick={() => api.openWidgetBoard()}
        aria-label="Open the widget board" title="Open the widget board (or swipe left)" className={`${btn} ${single ? "px-3" : ""}`}>
        <LayoutGrid className="w-4 h-4" />{name("board")}
      </button>
    ),
    guide: (
      <DropdownMenu key="guide">
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label="Guide & tour" title="Guide & tour" className={`${btn} ${single ? "px-3" : ""}`}>
            <HelpCircle className="w-4 h-4" />{name("guide")}
            {api?.checklistIncomplete && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-primary" aria-hidden="true" />}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onClick={() => api?.openTour?.()} className="gap-2 cursor-pointer">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="flex-1">Setup guide</span>
            {api?.checklistIncomplete && (
              <span className="text-[0.6875em] text-primary font-medium">In progress</span>
            )}
          </DropdownMenuItem>
          {api?.openFeatureTour && (
            <DropdownMenuItem onClick={() => api.openFeatureTour()} className="gap-2 cursor-pointer">
              <Compass className="w-4 h-4 text-muted-foreground" />
              <span className="flex-1">Feature tour</span>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    ),
    notifications: (
      <button key="notifications" type="button" onClick={() => api?.openNotifHistory?.()}
        aria-label="Notification history" title="Notification history" className={`${btn} ${single ? "px-3" : ""}`}>
        <Inbox className="w-4 h-4" />{name("notifications")}
        {api?.hasUnreadMentions && <span className="absolute top-1 right-1 w-2 h-2 bg-primary rounded-full" aria-hidden="true" />}
      </button>
    ),
  };
  return (
    // Compact and wrap-capable so the row lives happily beside the
    // header in a single grid column (v0.231.0 same-line default).
    <div className={`flex items-center ${single ? "justify-center" : "justify-end"} gap-0.5 h-full flex-wrap`}>
      {ids.map((id) => parts[id])}
    </div>
  );
}

export const WIDGET_REGISTRY = {
  // ── Chrome (formerly fixed header) ─────────────────────────────
  system_header: {
    label: "Header (name, date & time)", description: "Your {{system}}'s name with the live date and time — pick and reorder the elements in this widget's options.",
    icon: Sparkles, category: "chrome",
    render: ({ mode, api, settings }) => <SystemHeaderCard mode={mode} api={api} settings={settings} />,
    supportsModes: ["minimal", "normal"],
    supportsMultiInstance: false,
    configFields: [
      { key: "customName", type: "text", label: "Name", placeholder: "Your {{system}}'s name", maxLength: 60 },
      // First element = the big headline; the rest form the small line.
      { key: "parts", type: "orderToggle", label: "Elements", default: ["name", "date", "time"],
        options: [
          { value: "name", label: "Name" },
          { value: "date", label: "Date" },
          { value: "time", label: "Time" },
        ] },
    ],
    defaultSpan: { cols: 3, rows: 1 }, minSpan: { cols: 1, rows: 1 }, maxSpan: { cols: 12, rows: 2 },
  },
  clock: {
    label: "Clock", description: "Just the time and date — place as many as you like.",
    icon: Clock, category: "chrome",
    render: ({ mode }) => <ClockWidget mode={mode} />,
    supportsModes: ["minimal", "normal", "expanded"],
    supportsMultiInstance: true,
    defaultSpan: { cols: 2, rows: 1 }, minSpan: { cols: 1, rows: 1 }, maxSpan: { cols: 6, rows: 2 },
  },
  // The home screen's corner buttons (board / guide / notifications) as
  // one placeable tile — the static header row they lived in is gone,
  // so the page chrome is a widget like everything else (owner ask).
  page_buttons: {
    label: "Page buttons", description: "Widget board, guide & tour, and notifications buttons in one row — pick which in this widget's options.",
    icon: LayoutGrid, category: "chrome",
    render: ({ api, settings }) => <PageButtons api={api} settings={settings} />,
    supportsModes: ["normal"],
    supportsMultiInstance: true,
    configFields: [
      { key: "buttons", type: "orderToggle", label: "Buttons", default: PAGE_BUTTON_IDS,
        options: [
          { value: "board", label: "Widget board" },
          { value: "guide", label: "Guide & tour" },
          { value: "notifications", label: "Notifications" },
        ] },
    ],
    defaultSpan: { cols: 1, rows: 1 }, minSpan: { cols: 1, rows: 1 }, maxSpan: { cols: 6, rows: 1 },
  },
  // ── Quick actions ──────────────────────────────────────────────
  quick_checkin: {
    label: "Quick action buttons", description: "Quick Check-In and the start/quick buttons — pick, reorder and restyle them in this widget's options.",
    icon: Heart, category: "actions",
    render: ({ api, settings }) => (
      <QuickCheckinButtons
        hold={api?.hold || {}}
        holdProgress={api?.holdProgress || 0}
        holdActive={api?.holdActive || false}
        buttons={resolveQuickButtons(settings || {})}
        display={settings?.buttonDisplay || "both"}
        on={api?.quickOn || {}}
        quickActionsSlot={api?.quickActionsSlot || null}
      />
    ),
    supportsModes: ["normal"],
    supportsMultiInstance: false,
    configFields: [
      { key: "buttons", type: "quickButtons", label: "Buttons" },
      { key: "buttonDisplay", type: "select", label: "Button display", default: "both",
        options: [
          { value: "both", label: "Icon & label" },
          { value: "icon", label: "Icon only" },
          { value: "label", label: "Label only" },
        ] },
      // The saved quick-action list behind press-and-hold on Quick
      // Check-In — the same manager Settings hosts, right where the
      // button lives.
      { key: "_quickActions", type: "quickActionsManager", label: "Shortcuts (press & hold)" },
    ],
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
  // One card for everything running right now — symptoms, activity
  // timers, who you're with — with per-category toggles in the widget's
  // options (owner ask). The three single-category widgets below stay
  // in the drawer for anyone who wants them split out.
  active_now: {
    label: "Active now", description: "Running symptom sessions, activity timers and who you're with — toggle each category in this widget's options.",
    icon: ActivityIcon, category: "tracking",
    render: ({ settings }) => (
      <div>
        {settings?.showSymptoms !== false && <CurrentSymptoms />}
        {settings?.showActivities !== false && <CurrentActivities />}
        {settings?.showContacts !== false && <CurrentContacts />}
      </div>
    ),
    supportsModes: ["normal"],
    supportsMultiInstance: false,
    configFields: [
      { key: "showSymptoms", type: "toggle", label: "Active symptoms", default: true },
      { key: "showActivities", type: "toggle", label: "Active activities", default: true },
      { key: "showContacts", type: "toggle", label: "Currently with", default: true },
    ],
    defaultSpan: { cols: 4, rows: 1 }, minSpan: { cols: 1, rows: 1 }, maxSpan: { cols: 12, rows: 8 },
  },
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
    label: "{{Fronting}} leaders", description: "Who was {{fronting}} most and the top {{cofronting}} pairs over 7, 30 or 90 days. Tap someone to open their profile.",
    icon: Users, category: "meta",
    render: ({ mode, settings, api, updateSettings }) => (
      <FrontingLeadersWidget mode={mode} settings={settings} api={api} updateSettings={updateSettings} />
    ),
    supportsModes: ["minimal", "normal"],
    supportsMultiInstance: true,
    configFields: [
      { key: "window", type: "select", label: "Looking back", default: "week",
        options: [{ value: "week", label: "7 days" }, { value: "month", label: "30 days" }, { value: "quarter", label: "90 days" }] },
      { key: "top", type: "number", label: "How many to show", min: 1, max: 10, default: 5 },
      { key: "showPairs", type: "toggle", label: "Show top {{cofronting}} pairs", default: true },
    ],
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

// Classic components draw their own containers and never consume the look
// variables (the v2 Section is what does that) — so on the home screen,
// corner radius / borders / background / shadow / spacing set in a
// widget's options silently did nothing (owner report). The canvas
// wrapper paints the box for these widgets instead: every fallback is
// transparent/zero, so nothing changes until the user sets something.
for (const def of Object.values(WIDGET_REGISTRY)) {
  if (def.paintBox === undefined) def.paintBox = true;
}

// Folded duplicates (v0.280.0): the single-button tiles are page buttons
// showing just that button. Placed copies keep their spot and settings.
WIDGET_REGISTRY.help_button = foldWidget(WIDGET_REGISTRY.page_buttons, () => ({ buttons: ["guide"] }), { supportsMultiInstance: false });
WIDGET_REGISTRY.notification_inbox = foldWidget(WIDGET_REGISTRY.page_buttons, () => ({ buttons: ["notifications"] }), { supportsMultiInstance: false });

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

// Classic dashboard_layout element id → its V2 BOARD widget id (the ids
// differ from the legacy registry above — the board rebuilt functions
// under its own names). Drives the classic slot "upgrade to board
// widget" (entry.v2 in dashboard_layout). Ids missing here (pins,
// what's-new) have no board twin and simply aren't upgradable.
export const CLASSIC_TO_V2_WIDGET = {
  current_fronters: "fronting_panel",
  pinned_alters: "pinned_alters",
  status_note: "status",
  pinned_daily_tasks: "daily_tasks",
  current_symptoms: "running",
  current_activities: "running",
  current_contacts: "running",
  quick_checkin: "capture",
  quick_nav_menu: "quick_links",
  bulletin_board: "bulletin_board",
  upcoming_top: "upcoming_plans",
  upcoming_bottom: "plans",
  insight_spotlight: "emotion_analytics",
};

export const WIDGET_CATEGORIES = [
  // One section per PAGE of the app (owner, v0.126.0): the goal is that a
  // page's functions can be assembled on the home screen instead of
  // navigating to it, so the picker is organised the way the app is.
  { id: "home", label: "Home & dashboard" },
  { id: "actions", label: "Quick actions" },
  { id: "alters", label: "{{Alters}} & {{fronting}}" },
  { id: "checkin", label: "Check-in & tracking" },
  { id: "timeline", label: "Timeline" },
  { id: "activities", label: "Activity tracker" },
  { id: "tasks", label: "To-dos & daily tasks" },
  { id: "needs", label: "Needs & goals" },
  { id: "journals", label: "Journals" },
  { id: "bulletins", label: "Bulletins & polls" },
  { id: "chat", label: "{{System}} chat" },
  { id: "sleep", label: "Sleep" },
  { id: "reminders", label: "Reminders" },
  { id: "analytics", label: "Analytics" },
  { id: "support", label: "Support & grounding" },
  { id: "nav", label: "Navigation & shortcuts" },
  { id: "layout", label: "Page design" },
  // Anything not claimed above still shows, under these.
  { id: "chrome", label: "Header & chrome" },
  { id: "system", label: "{{System}}" },
  { id: "tracking", label: "Tracking" },
  { id: "activity", label: "Activities & plans" },
  { id: "content", label: "Journals & content" },
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
        <span className="text-[0.6875em] text-muted-foreground mt-0.5">{now.toLocaleDateString([], { year: "numeric" })}</span>
      )}
    </div>
  );
}
