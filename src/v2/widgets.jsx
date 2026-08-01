// UI v2 widget set — the redesigned elements for the customizable
// homescreen.
//
// The canvas (grid, drag, edge-resize, pages, edit mode) is REUSED from
// the experimental homescreen; the app's data layer and hooks are reused
// too. What is rebuilt here is every widget's own UI: instead of
// embedding the legacy dashboard components, each widget renders its data
// through the small v2 primitive vocabulary (Section / Row / Muted /
// TextAction / Dot). That's the "reuse the functions, redesign the
// elements" split.
//
// Entry shape matches the canvas contract:
//   { label, description, icon, category, render({mode,settings,instanceId,api}),
//     supportsModes, supportsMultiInstance, defaultSpan, minSpan, maxSpan }
// Labels may use {{System}} / {{Alters}} placeholders — resolved by
// widgetLabel() through the user's own terminology.

import React from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  Users, StickyNote, CalendarCheck, Timer, History, Heart, CheckSquare,
} from "lucide-react";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { getActiveActivities } from "@/lib/activitySession";
import { Section, Row, Muted, TextAction, Dot } from "@/v2/primitives";
import { useT } from "@/lib/i18n";
import { applyTerms } from "@/lib/dailyTaskSystem";

const fmtTime = (d) => new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
// Compact "how long so far" — reads better than a clock time in a narrow
// tile, and answers the question the row is actually asked.
const fmtElapsed = (start) => {
  const mins = Math.max(0, Math.round((Date.now() - new Date(start).getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
};
const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
const useList = (key, entity) => useQuery({ queryKey: [key], queryFn: () => base44.entities[entity].list() }).data || [];

// ── Who's here ─────────────────────────────────────────────────────
function PresenceWidget({ mode, api }) {
  const tr = useT();
  const navigate = useNavigate();
  const t = useTerms();
  const formatAlter = useAlterLabel();
  const { data: sessions = [] } = useQuery({
    queryKey: ["activeFront"],
    queryFn: () => base44.entities.FrontingSession.filter({ is_active: true }),
  });
  const alters = api?.alters || [];
  const byId = React.useMemo(() => Object.fromEntries(alters.map((a) => [a.id, a])), [alters]);
  const fronters = sessions
    .map((s) => ({ s, alter: byId[s.alter_id || s.primary_alter_id] }))
    .filter((x) => x.alter)
    .sort((a, b) => (b.s.is_primary === true) - (a.s.is_primary === true));

  return (
    <Section
      label={tr("widget.presence.title")}
      action={<TextAction onClick={() => window.dispatchEvent(new CustomEvent("open-set-front"))}>{applyTerms(tr("common.switch"), t)}</TextAction>}
    >
      {fronters.length === 0 && <Muted>{applyTerms(tr("widget.presence.empty"), t)}</Muted>}
      {(mode === "minimal" ? fronters.slice(0, 1) : fronters).map(({ s, alter }) => (
        <Row
          key={s.id}
          // A ring marks the primary instead of a word — the name needs the
          // room more than the label does in a one-column widget.
          left={<Dot color={alter.color} ring={s.is_primary} />}
          primary={formatAlter(alter)}
          right={s.start_time ? fmtElapsed(s.start_time) : undefined}
          title={s.is_primary ? applyTerms(tr("widget.presence.primaryOf"), t) : undefined}
          onClick={() => navigate(`/alter/${alter.id}`)}
        />
      ))}
    </Section>
  );
}

// ── Running right now ──────────────────────────────────────────────
function RunningWidget({ api }) {
  const tr = useT();
  const navigate = useNavigate();
  const symptomSessions = useQuery({
    queryKey: ["symptomSessions"],
    queryFn: () => base44.entities.SymptomSession.filter({ is_active: true }),
  }).data || [];
  const symptoms = useList("symptoms", "Symptom");
  const sleeps = useList("sleep", "Sleep");
  const activities = getActiveActivities();
  const symById = React.useMemo(() => Object.fromEntries(symptoms.map((s) => [s.id, s])), [symptoms]);
  const activeSleep = sleeps.find((s) => s.bedtime && !s.wake_time);
  const nothing = activities.length === 0 && symptomSessions.length === 0 && !activeSleep;

  return (
    <Section label={tr("widget.running.label")}>
      {nothing && <Muted>{tr("widget.running.empty")}</Muted>}
      {activities.map((a) => (
        <Row key={a.id} left={<Dot color="var(--v2-accent)" />} primary={a.activity_name || tr("widget.running.activity")}
          right={a.start ? fmtTime(a.start) : undefined} onClick={() => navigate("/activities")} />
      ))}
      {symptomSessions.map((s) => {
        const def = symById[s.symptom_id || s.symptom_definition_id];
        if (!def) return null;
        return (
          <Row key={s.id} left={<Dot color={def.color || "#a78bfa"} />} primary={def.label || def.name}
            right={s.start_time ? fmtTime(s.start_time) : undefined} onClick={() => navigate("/system-checkin")} />
        );
      })}
      {activeSleep && (
        <Row left={<Dot color="#6a7bd6" />} primary={tr("widget.running.sleep")} right={fmtTime(activeSleep.bedtime)}
          onClick={() => navigate("/sleep")} />
      )}
    </Section>
  );
}

// ── Today ──────────────────────────────────────────────────────────
function TodayWidget() {
  const tr = useT();
  const navigate = useNavigate();
  const now = Date.now();
  const activities = useList("activities", "Activity");
  const tasks = useList("tasks", "Task");
  const plans = activities
    .filter((a) => a.status === "scheduled" && a.timestamp && sameDay(a.timestamp, now))
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const due = tasks
    .filter((x) => !x.completed && x.due_date && new Date(x.due_date).getTime() < now + 24 * 3600000)
    .sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
  const unresolved = activities.filter(
    (a) => a.status === "scheduled" && a.timestamp && new Date(a.timestamp).getTime() < now - 3600000
  ).length;

  return (
    <Section label={tr("widget.today.label")} action={<TextAction onClick={() => navigate("/activities")}>{tr("widget.today.open")}</TextAction>}>
      {plans.length === 0 && due.length === 0 && <Muted>{tr("widget.today.empty")}</Muted>}
      {/* Plan vs task is carried by the icon rather than a word — in a
          one-column tile a "task" label just eats the title. Overdue plans
          take the accent colour. */}
      {plans.map((a) => {
        const late = new Date(a.timestamp).getTime() < now;
        return (
          <Row key={a.id}
            left={<CalendarCheck className="w-3.5 h-3.5 flex-shrink-0"
              style={{ color: late ? "var(--v2-accent)" : "hsl(var(--muted-foreground))" }} />}
            primary={a.activity_name} right={fmtTime(a.timestamp)}
            title={late ? tr("widget.today.unresolved") : undefined}
            onClick={() => navigate(`/activities?activityId=${a.id}`)} />
        );
      })}
      {due.map((x) => (
        <Row key={x.id}
          left={<CheckSquare className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />}
          primary={x.title} title={tr("widget.today.task")}
          right={sameDay(x.due_date, now) ? tr("widget.today.dueToday") : fmtTime(x.due_date)}
          onClick={() => navigate(`/todo?id=${x.id}`)} />
      ))}
      {unresolved > 0 && (
        <Muted>
          {tr("widget.today.unresolvedCount", { count: unresolved })} —{" "}
          <TextAction onClick={() => navigate("/activities?tab=planned")}>{tr("widget.today.review")}</TextAction>
        </Muted>
      )}
    </Section>
  );
}

// ── Status note ────────────────────────────────────────────────────
function StatusWidget() {
  const tr = useT();
  const navigate = useNavigate();
  const notes = useList("statusNotes", "StatusNote");
  const latest = [...notes].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
  return (
    <Section label={tr("widget.status.label")} action={<TextAction onClick={() => navigate("/checkin-log")}>{tr("widget.status.log")}</TextAction>}>
      {latest
        ? <Row primary={latest.note} right={fmtTime(latest.timestamp)}
            onClick={() => navigate(`/timeline?highlightStatus=${latest.id}`)} />
        : <Muted>{tr("widget.status.empty")}</Muted>}
    </Section>
  );
}

// ── Recent captures ────────────────────────────────────────────────
function RecentWidget({ settings }) {
  const tr = useT();
  const navigate = useNavigate();
  const limit = Math.max(1, Math.min(10, parseInt(settings?.limit, 10) || 4));
  const checkIns = useList("emotionCheckIns", "EmotionCheckIn");
  const recent = [...checkIns]
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, limit);
  return (
    <Section label={tr("widget.recent.label")} action={<TextAction onClick={() => navigate("/checkin-log")}>{tr("widget.recent.all")}</TextAction>}>
      {recent.length === 0 && <Muted>{tr("widget.recent.empty")}</Muted>}
      {recent.map((c) => (
        <Row key={c.id} primary={(c.emotions || []).join(", ") || tr("widget.recent.item")}
          right={sameDay(c.timestamp, Date.now()) ? fmtTime(c.timestamp)
            : new Date(c.timestamp).toLocaleDateString([], { month: "short", day: "numeric" })}
          onClick={() => navigate(`/checkin-log?id=${c.id}`)} />
      ))}
    </Section>
  );
}

// ── Capture keys (widget form of the frame's row) ───────────────────
const CAPTURE = [
  { id: "quick-checkin", key: "capture.checkIn" },
  { id: "start-activity", key: "capture.activity" },
  { id: "start-symptom", key: "capture.symptom" },
  { id: "quick-task", key: "capture.task" },
  { id: "quick-plan", key: "capture.plan" },
];
function CaptureWidget({ api }) {
  const tr = useT();
  const on = api?.quickOn || {};
  const fire = (id) => {
    if (id === "quick-checkin") return window.dispatchEvent(new CustomEvent("open-quick-checkin"));
    if (id === "start-activity") return on.startActivity?.();
    if (id === "start-symptom") return on.startSymptom?.();
    if (id === "quick-task") return on.quickTask?.();
    if (id === "quick-plan") return on.quickPlan?.();
  };
  return (
    <Section label={tr("widget.capture.label")}>
      <div className="flex flex-wrap" style={{ gap: "calc(var(--v2-space, 6px) * 0.75)" }}>
        {CAPTURE.map((c) => (
          <button key={c.id} type="button" onClick={() => fire(c.id)}
            className="text-xs px-2.5 py-1.5 border border-border/60 hover:border-primary/60 transition-colors"
            style={{ borderRadius: "var(--v2-radius, 8px)" }}>
            {tr(c.key)}
          </button>
        ))}
      </div>
    </Section>
  );
}

export const V2_WIDGETS = {
  presence: {
    label: "Who's here", description: "Current {{fronters}}, with time since each arrived.",
    icon: Users, category: "system",
    render: ({ mode, api }) => <PresenceWidget mode={mode} api={api} />,
    supportsModes: ["minimal", "normal"], supportsMultiInstance: false,
    defaultSpan: { cols: 4, rows: 1 }, minSpan: { cols: 2, rows: 1 }, maxSpan: { cols: 12, rows: 4 },
  },
  running: {
    label: "Running", description: "Activity timers, symptom episodes and sleep in progress.",
    icon: Timer, category: "tracking",
    render: ({ api }) => <RunningWidget api={api} />,
    supportsModes: ["normal"], supportsMultiInstance: false,
    defaultSpan: { cols: 4, rows: 1 }, minSpan: { cols: 2, rows: 1 }, maxSpan: { cols: 12, rows: 4 },
  },
  today: {
    label: "Today", description: "Plans and tasks due today, plus anything unresolved.",
    icon: CalendarCheck, category: "tracking",
    render: () => <TodayWidget />,
    supportsModes: ["normal"], supportsMultiInstance: false,
    defaultSpan: { cols: 4, rows: 2 }, minSpan: { cols: 2, rows: 1 }, maxSpan: { cols: 12, rows: 6 },
  },
  status: {
    label: "Status", description: "The latest status note.",
    icon: StickyNote, category: "system",
    render: () => <StatusWidget />,
    supportsModes: ["normal"], supportsMultiInstance: false,
    defaultSpan: { cols: 4, rows: 1 }, minSpan: { cols: 2, rows: 1 }, maxSpan: { cols: 12, rows: 3 },
  },
  recent: {
    label: "Recent check-ins", description: "Your most recent check-ins.",
    icon: History, category: "tracking",
    render: ({ settings }) => <RecentWidget settings={settings} />,
    supportsModes: ["normal"], supportsMultiInstance: true,
    defaultSpan: { cols: 4, rows: 2 }, minSpan: { cols: 2, rows: 1 }, maxSpan: { cols: 12, rows: 6 },
  },
  capture: {
    label: "Capture", description: "One-tap buttons for the things you log most.",
    icon: Heart, category: "actions",
    render: ({ api }) => <CaptureWidget api={api} />,
    supportsModes: ["normal"], supportsMultiInstance: false,
    defaultSpan: { cols: 4, rows: 1 }, minSpan: { cols: 2, rows: 1 }, maxSpan: { cols: 12, rows: 2 },
  },
};

// Layout for someone opening the v2 home for the first time.
export function seedV2Home() {
  const mk = (widgetId, cols, rows) => ({
    instanceId: `w_${widgetId}_${Math.random().toString(36).slice(2, 8)}`,
    widgetId, span: { cols, rows }, mode: "normal", settings: {},
  });
  return {
    version: 2, enabled: true, defaultPageId: "p1", styleMode: "current",
    actionBar: { enabled: false, buttonIds: [] },
    altersBar: { enabled: false, position: "bottom" },
    wallpaper: { url: "" }, grid: { phoneCols: 4 }, drawer: { folders: [] },
    pages: [{
      id: "p1", label: "Home",
      widgets: [mk("presence", 4, 1), mk("today", 4, 2), mk("running", 4, 1), mk("status", 4, 1)],
    }],
  };
}
