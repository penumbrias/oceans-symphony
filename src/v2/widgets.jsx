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
  Users, StickyNote, CalendarCheck, Timer, History, Heart, CheckSquare, PenLine,
  IdCard, Type, AlignLeft, Minus, MoveVertical, Rocket, BookOpen, ListTodo,
  Moon, Megaphone, Bell, FolderOpen, ChevronLeft, ChevronRight, Plus, NotebookPen,
} from "lucide-react";
import { buildGridItems, findGridItem } from "@/lib/navCatalogue";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { AssetButton } from "@/components/shared/AssetPickerModal";
import DOMPurify from "dompurify";
import JournalEditorModal from "@/components/journal/JournalEditorModal";
import BulletinBoard from "@/components/bulletin/BulletinBoard";
import useFormDraft from "@/hooks/useFormDraft";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { getActiveActivities } from "@/lib/activitySession";
import { Section, Row, Muted, TextAction, Dot } from "@/v2/primitives";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription,
} from "@/components/ui/drawer";
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
const endOfToday = () => { const d = new Date(); d.setHours(23, 59, 59, 999); return d.getTime(); };
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
function ActiveWidget({ api }) {
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
    <Section label={tr("widget.active.label")}>
      {nothing && <Muted>{tr("widget.active.empty")}</Muted>}
      {activities.map((a) => (
        <Row key={a.id}
          left={<Dot color={a.color || "var(--v2-accent)"} />}
          primary={a.name || tr("widget.active.activity")}
          secondary={a.notes || undefined}
          right={a.startTime ? fmtElapsed(a.startTime) : undefined}
          onClick={() => navigate("/activities")} />
      ))}
      {symptomSessions.map((s) => {
        const def = symById[s.symptom_id || s.symptom_definition_id];
        if (!def) return null;
        return (
          <Row key={s.id} left={<Dot color={def.color || "#a78bfa"} />} primary={def.label || def.name}
            right={s.start_time ? fmtElapsed(s.start_time) : undefined} onClick={() => navigate("/system-checkin")} />
        );
      })}
      {activeSleep && (
        <Row left={<Dot color="#6a7bd6" />} primary={tr("widget.active.sleep")} right={fmtElapsed(activeSleep.bedtime)}
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
    .filter((x) => !x.completed && x.due_date && new Date(x.due_date).getTime() <= endOfToday())
    .sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
  const unresolved = activities.filter(
    (a) => a.status === "scheduled" && a.timestamp && new Date(a.timestamp).getTime() < now - 3600000
  ).length;

  return (
    <Section label={tr("widget.today.label")} action={<TextAction onClick={() => navigate("/activities")}>{tr("widget.today.open")}</TextAction>}>
      {plans.length === 0 && due.length === 0 && <Muted>{tr("widget.today.empty")}</Muted>}
      {plans.length > 0 && due.length > 0 && (
        <p className="text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground pt-0.5">
          {tr("widget.today.planned")}
        </p>
      )}
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
      {plans.length > 0 && due.length > 0 && (
        <p className="text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground pt-1">
          {tr("widget.today.dueLabel")}
        </p>
      )}
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
  const qc = useQueryClient();
  const notes = useList("statusNotes", "StatusNote");
  const [draft, setDraft] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const latest = [...notes].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];

  // Every save is a NEW note — the status log is a timeline, never an edit
  // of what you said before.
  const save = async () => {
    const text = draft.trim();
    if (!text || saving) return;
    setSaving(true);
    try {
      await base44.entities.StatusNote.create({ timestamp: new Date().toISOString(), note: text });
      qc.invalidateQueries({ queryKey: ["statusNotes"] });
      setDraft("");
    } finally { setSaving(false); }
  };

  return (
    <Section label={tr("widget.status.label")} action={<TextAction onClick={() => navigate("/checkin-log")}>{tr("widget.status.log")}</TextAction>}>
      {latest
        ? <Row primary={latest.note} right={fmtTime(latest.timestamp)}
            onClick={() => navigate(`/timeline?highlightStatus=${latest.id}`)} />
        : <Muted>{tr("widget.status.empty")}</Muted>}
      <div className="flex items-center gap-1.5 pt-0.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") save(); }}
          placeholder={tr("widget.status.placeholder")}
          className="flex-1 min-w-0 h-8 px-2 text-sm bg-background border border-input focus:outline-none focus:ring-1 focus:ring-ring"
          style={{ borderRadius: "var(--v2-radius, 8px)" }}
        />
        <TextAction onClick={save}>{tr("widget.status.save")}</TextAction>
      </div>
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


// ── System identity ────────────────────────────────────────────────
// The system's own header: picture, name, description. Modes decide how
// much of it shows, so a page can open with just a name or with a full
// profile block.
function SystemIdentityWidget({ mode = "normal", api }) {
  const tr = useT();
  const t = useTerms();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ["systemSettings"], queryFn: () => base44.entities.SystemSettings.list() }).data?.[0];
  // The picture is the system's own (SystemSettings.system_avatar_url), not
  // a widget decoration — set it here and every other surface that shows it
  // updates too.
  const setAvatar = async (url) => {
    if (!settings?.id) return;
    await base44.entities.SystemSettings.update(settings.id, { system_avatar_url: url });
    qc.invalidateQueries({ queryKey: ["systemSettings"] });
  };
  const alters = useList("alters", "Alter");
  const avatar = useResolvedAvatarUrl(settings?.system_avatar_url || settings?.system_avatar || "");
  const name = settings?.system_name || `${t.Your || "Your"} ${t.system}`.trim();
  const desc = settings?.system_description || settings?.system_bio || "";
  const count = alters.filter((a) => !a.is_archived).length;

  const size = mode === "expanded" ? 56 : 36;
  const avatarEl = avatar
    ? (
      <span className="relative flex-shrink-0" style={{ width: size, height: size }}>
        <img src={avatar} alt="" className="rounded-full object-cover w-full h-full" />
        <AssetButton onPick={setAvatar} title={tr("widget.identity.changePicture")}
          className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full border border-border bg-background flex items-center justify-center" />
      </span>
    )
    : (
      <AssetButton onPick={setAvatar} title={tr("widget.identity.addPicture")}
        className="flex items-center justify-center rounded-full border border-dashed border-border text-muted-foreground flex-shrink-0"
        style={{ width: size, height: size }} />
    );

  if (mode === "minimal") {
    return <Section><h2 className="font-display font-semibold text-lg truncate">{name}</h2></Section>;
  }

  return (
    <Section>
      <div className="flex items-center gap-3 min-w-0">
        {avatarEl}
        <div className="min-w-0 flex-1">
          <h2 className="font-display font-semibold text-lg truncate">{name}</h2>
          <Muted>{applyTerms(tr("widget.identity.count", { count }), t)}</Muted>
        </div>
        <TextAction onClick={() => navigate("/Home")}>{applyTerms(tr("widget.identity.open"), t)}</TextAction>
      </div>
      {mode === "expanded" && desc && (
        <p className="text-xs text-muted-foreground whitespace-pre-line line-clamp-6">{desc}</p>
      )}
    </Section>
  );
}

// ── Page-design elements ───────────────────────────────────────────
// These hold no data — they exist so a page can be composed: a heading,
// a paragraph, a rule, a gap. The text lives in the layout itself.
function HeadingWidget({ settings }) {
  const size = settings?.size || "lg";
  const cls = size === "sm" ? "text-xs font-semibold uppercase tracking-wide text-muted-foreground"
    : size === "md" ? "text-base font-semibold"
    : "font-display text-2xl font-semibold";
  const align = settings?.align || "left";
  return <p className={cls} style={{ textAlign: align }}>{settings?.text || settings?.label || "Heading"}</p>;
}

function TextWidget({ settings }) {
  const align = settings?.align || "left";
  return (
    <p className="text-sm text-muted-foreground whitespace-pre-line" style={{ textAlign: align }}>
      {settings?.text || ""}
    </p>
  );
}

function DividerWidget({ settings }) {
  return (
    <div className="w-full flex items-center" style={{ minHeight: 16 }}>
      <span className="w-full" style={{
        borderTopWidth: `${settings?.thickness || 1}px`,
        borderTopStyle: settings?.dashed ? "dashed" : "solid",
        borderColor: "color-mix(in srgb, var(--v2-accent) 35%, transparent)",
      }} />
    </div>
  );
}

function SpacerWidget() { return <div aria-hidden="true" className="w-full h-full" />; }

// A single app tile. Mirrors the classic shortcut's data (nav catalogue +
// optional custom icon) with v2's flatter treatment.
function AppTileWidget({ mode, settings }) {
  const tr = useT();
  const t = useTerms();
  const navigate = useNavigate();
  const items = React.useMemo(() => buildGridItems(t.Alters, t.System), [t.Alters, t.System]);
  const item = findGridItem(items, settings?.targetId);
  const customIcon = useResolvedAvatarUrl(settings?.iconUrl || "");
  if (!item) return <Muted>{tr("widget.app.missing")}</Muted>;
  const Icon = item.icon;
  const label = (settings?.label || item.label).slice(0, 60);
  return (
    <button type="button" onClick={() => navigate(item.path)} title={label}
      className="w-full h-full min-h-[52px] flex flex-col items-center justify-center gap-1 py-1.5 hover:bg-muted/40"
      style={{ borderRadius: "var(--v2-radius)" }}>
      {customIcon
        ? <img src={customIcon} alt="" className="w-9 h-9 object-cover" style={{ borderRadius: "var(--v2-radius)" }} />
        : <span className="w-9 h-9 flex items-center justify-center"
            style={{ borderRadius: "var(--v2-radius)", border: "var(--v2-border-w) solid color-mix(in srgb, var(--v2-accent) 40%, transparent)" }}>
            <Icon className="w-4 h-4" />
          </span>}
      {mode !== "minimal" && (
        <span className="text-[0.625rem] text-center leading-tight text-muted-foreground line-clamp-2 px-0.5">{label}</span>
      )}
    </button>
  );
}

// ── Content lists ──────────────────────────────────────────────────
function AltersListWidget({ settings, api }) {
  const tr = useT();
  const t = useTerms();
  const navigate = useNavigate();
  const formatAlter = useAlterLabel();
  const alters = api?.alters || [];
  const limit = parseInt(settings?.limit, 10) || 6;
  const sort = settings?.sort || "name";
  const list = React.useMemo(() => {
    const live = alters.filter((a) => !a.is_archived);
    const sorted = sort === "recent"
      ? [...live].sort((a, b) => new Date(b.updated_date || b.created_date || 0) - new Date(a.updated_date || a.created_date || 0))
      : [...live].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    return sorted.slice(0, limit);
  }, [alters, sort, limit]);

  return (
    <Section label={applyTerms(tr("widget.alters.label"), t)}
      action={<TextAction onClick={() => navigate("/Home")}>{tr("widget.today.open")}</TextAction>}>
      {list.length === 0 && <Muted>{applyTerms(tr("widget.alters.empty"), t)}</Muted>}
      {list.map((a) => (
        <Row key={a.id} left={<Dot color={a.color} />} primary={formatAlter(a)}
          right={a.role || undefined} onClick={() => navigate(`/alter/${a.id}`)} />
      ))}
    </Section>
  );
}

function JournalWidget({ settings }) {
  const tr = useT();
  const navigate = useNavigate();
  const entries = useList("journalEntries", "JournalEntry");
  const limit = parseInt(settings?.limit, 10) || 4;
  const list = [...entries]
    .sort((a, b) => new Date(b.timestamp || b.created_date || 0) - new Date(a.timestamp || a.created_date || 0))
    .slice(0, limit);
  return (
    <Section label={tr("widget.journal.label")}
      action={<TextAction onClick={() => navigate("/journals?compose=1")}>{tr("widget.journal.new")}</TextAction>}>
      {list.length === 0 && <Muted>{tr("widget.journal.empty")}</Muted>}
      {list.map((e) => (
        <Row key={e.id} primary={e.title || tr("widget.journal.untitled")}
          right={fmtTime(e.timestamp || e.created_date)}
          onClick={() => navigate(`/journals?entry=${e.id}`)} />
      ))}
    </Section>
  );
}

function TasksWidget({ settings }) {
  const tr = useT();
  const navigate = useNavigate();
  const tasks = useList("tasks", "Task");
  const limit = parseInt(settings?.limit, 10) || 6;
  const open = tasks.filter((x) => !x.completed)
    .sort((a, b) => new Date(a.due_date || 8.64e15) - new Date(b.due_date || 8.64e15))
    .slice(0, limit);
  return (
    <Section label={tr("widget.tasks.label")}
      action={<TextAction onClick={() => navigate("/todo")}>{tr("widget.today.open")}</TextAction>}>
      {open.length === 0 && <Muted>{tr("widget.tasks.empty")}</Muted>}
      {open.map((x) => (
        <Row key={x.id} left={<CheckSquare className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />}
          primary={x.title} right={x.due_date ? fmtTime(x.due_date) : undefined}
          onClick={() => navigate(`/todo?id=${x.id}`)} />
      ))}
    </Section>
  );
}

function SleepWidget() {
  const tr = useT();
  const navigate = useNavigate();
  const sleeps = useList("sleep", "Sleep");
  const last = [...sleeps].filter((s) => s.wake_time)
    .sort((a, b) => new Date(b.wake_time) - new Date(a.wake_time))[0];
  const active = sleeps.find((s) => s.bedtime && !s.wake_time);
  const hours = last ? ((new Date(last.wake_time) - new Date(last.bedtime)) / 3600000) : 0;
  return (
    <Section label={tr("widget.sleep.label")}
      action={<TextAction onClick={() => navigate("/sleep")}>{tr("widget.status.log")}</TextAction>}>
      {active && <Row left={<Dot color="#6a7bd6" />} primary={tr("widget.sleep.inProgress")} right={fmtTime(active.bedtime)} onClick={() => navigate("/sleep")} />}
      {!active && last && (
        <Row primary={tr("widget.sleep.lastNight", { hours: hours.toFixed(1) })}
          right={fmtTime(last.wake_time)} onClick={() => navigate("/sleep")} />
      )}
      {!active && !last && <Muted>{tr("widget.sleep.empty")}</Muted>}
    </Section>
  );
}

function BulletinsWidget({ settings }) {
  const tr = useT();
  const navigate = useNavigate();
  const bulletins = useList("bulletins", "Bulletin");
  const limit = parseInt(settings?.limit, 10) || 4;
  const list = [...bulletins]
    .sort((a, b) => new Date(b.timestamp || b.created_date || 0) - new Date(a.timestamp || a.created_date || 0))
    .slice(0, limit);
  const strip = (html) => String(html || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return (
    <Section label={tr("widget.board.label")}
      action={<TextAction onClick={() => navigate("/bulletins")}>{tr("widget.today.open")}</TextAction>}>
      {list.length === 0 && <Muted>{tr("widget.board.empty")}</Muted>}
      {list.map((b) => (
        <Row key={b.id} primary={strip(b.content) || tr("widget.board.item")}
          right={fmtTime(b.timestamp || b.created_date)} onClick={() => navigate("/bulletins")} />
      ))}
    </Section>
  );
}

function RemindersWidget({ settings }) {
  const tr = useT();
  const navigate = useNavigate();
  const instances = useList("reminderInstances", "ReminderInstance");
  const limit = parseInt(settings?.limit, 10) || 4;
  const now = Date.now();
  const next = instances
    .filter((i) => i.status !== "acted" && i.status !== "dismissed" && i.scheduled_for)
    .filter((i) => new Date(i.scheduled_for).getTime() > now - 12 * 3600000)
    .sort((a, b) => new Date(a.scheduled_for) - new Date(b.scheduled_for))
    .slice(0, limit);
  return (
    <Section label={tr("widget.reminders.label")}
      action={<TextAction onClick={() => navigate("/reminders")}>{tr("widget.today.open")}</TextAction>}>
      {next.length === 0 && <Muted>{tr("widget.reminders.empty")}</Muted>}
      {next.map((i) => (
        <Row key={i.id} left={<Bell className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />}
          primary={i.title || tr("widget.reminders.item")} right={fmtTime(i.scheduled_for)}
          onClick={() => navigate("/reminders")} />
      ))}
    </Section>
  );
}


// ── Folder ─────────────────────────────────────────────────────────
// A folder that lives ON the page, phone-homescreen style: a tile showing
// what's inside, which opens to the full list. Its contents are chosen in
// the widget's own options (Apps in this folder).
function FolderWidget({ settings, mode }) {
  const tr = useT();
  const t = useTerms();
  const navigate = useNavigate();
  const [open, setOpen] = React.useState(false);
  const items = React.useMemo(() => buildGridItems(t.Alters, t.System), [t.Alters, t.System]);
  const apps = (settings?.appIds || []).map((id) => findGridItem(items, id)).filter(Boolean);
  const label = settings?.label || tr("widget.folder.label");

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="w-full h-full min-h-[52px] flex flex-col items-center justify-center gap-1 py-1.5 hover:bg-muted/40"
        style={{ borderRadius: "var(--v2-radius)" }}>
        {/* The tile previews what's inside — the first four, in a 2×2, the
            way a phone folder does. */}
        <span className="grid grid-cols-2 gap-0.5 p-1 flex-shrink-0"
          style={{
            borderRadius: "var(--v2-radius)",
            border: "var(--v2-border-w) solid color-mix(in srgb, var(--v2-accent) 40%, transparent)",
          }}>
          {apps.slice(0, 4).map((a) => {
            const Icon = a.icon;
            return <Icon key={a.id} className="w-3.5 h-3.5 text-muted-foreground" />;
          })}
          {apps.length === 0 && <FolderOpen className="w-3.5 h-3.5 text-muted-foreground col-span-2" />}
        </span>
        {mode !== "minimal" && (
          <span className="text-[0.625rem] text-center leading-tight text-muted-foreground line-clamp-2 px-0.5">
            {label}
          </span>
        )}
      </button>

      <Drawer open={open} onOpenChange={(v) => { if (!v) setOpen(false); }}>
        <DrawerContent className="max-h-[70vh]">
          <DrawerHeader className="pb-1">
            <DrawerTitle className="text-base">{label}</DrawerTitle>
            <DrawerDescription className="text-xs">
              {apps.length ? tr("widget.folder.count", { count: apps.length }) : tr("widget.folder.empty")}
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-4 grid grid-cols-4 sm:grid-cols-6 gap-3"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}>
            {apps.map((a) => {
              const Icon = a.icon;
              return (
                <button key={a.id} type="button"
                  onClick={() => { setOpen(false); navigate(a.path); }}
                  className="flex flex-col items-center gap-1 py-2 hover:bg-muted/40"
                  style={{ borderRadius: "var(--v2-radius)" }}>
                  <span className="w-10 h-10 flex items-center justify-center"
                    style={{
                      borderRadius: "var(--v2-radius)",
                      border: "var(--v2-border-w) solid color-mix(in srgb, var(--v2-accent) 40%, transparent)",
                    }}>
                    <Icon className="w-4 h-4" />
                  </span>
                  <span className="text-[0.625rem] text-center leading-tight text-muted-foreground line-clamp-2">
                    {a.label}
                  </span>
                </button>
              );
            })}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}


// ── Journal (a book you can page through) ──────────────────────────
// One journal at a time, one entry per page, newest page first. The
// journals themselves are the app's journal folders, so this widget reads
// and writes exactly what the Journals page does — no parallel storage.
// Which journal you're reading is remembered in the widget's own settings.
const JOURNAL_FOLDERS_KEY = "os_journal_folders";
const readJournalFolders = () => {
  try { return JSON.parse(localStorage.getItem(JOURNAL_FOLDERS_KEY) || "[]"); }
  catch { return []; }
};

function JournalBookWidget({ settings, updateSettings, api, mode }) {
  const tr = useT();
  const navigate = useNavigate();
  const entries = useList("journalEntries", "JournalEntry");
  const [page, setPage] = React.useState(0);
  const [picking, setPicking] = React.useState(false);
  const [composing, setComposing] = React.useState(false);

  const journal = settings?.journal ?? "";           // "" = every journal
  const journals = React.useMemo(() => {
    const fromEntries = new Set(entries.map((e) => e.folder).filter(Boolean));
    readJournalFolders().forEach((f) => fromEntries.add(f));
    return [...fromEntries].sort((a, b) => a.localeCompare(b));
  }, [entries]);

  const pages = React.useMemo(() => entries
    .filter((e) => (journal ? e.folder === journal : true))
    .sort((a, b) => new Date(b.timestamp || b.created_date || 0) - new Date(a.timestamp || a.created_date || 0)),
  [entries, journal]);

  // Land on the newest page whenever the journal changes or a new entry
  // arrives, but don't yank the page out from under someone reading.
  const lastTop = React.useRef("");
  React.useEffect(() => {
    const topId = pages[0]?.id || "";
    if (topId !== lastTop.current) { lastTop.current = topId; setPage(0); }
  }, [pages, journal]);

  const idx = Math.min(page, Math.max(0, pages.length - 1));
  const entry = pages[idx];
  const isHtml = entry && /<[a-z][\s\S]*>/i.test(entry.content || "");

  return (
    <Section
      label={journal || tr("widget.book.allJournals")}
      action={
        <span className="flex items-center gap-2">
          <TextAction onClick={() => setPicking((v) => !v)}>{tr("widget.book.switch")}</TextAction>
          <TextAction onClick={() => setComposing(true)}>{tr("widget.book.newPage")}</TextAction>
        </span>
      }
    >
      {picking && (
        <div className="flex flex-wrap gap-1 pb-1">
          <button type="button" onClick={() => { updateSettings?.({ journal: "" }); setPicking(false); }}
            className={`text-[0.6875rem] px-2 py-1 border ${!journal ? "border-primary/60 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground"}`}
            style={{ borderRadius: "var(--v2-radius, 8px)" }}>
            {tr("widget.book.allJournals")}
          </button>
          {journals.map((f) => (
            <button key={f} type="button" onClick={() => { updateSettings?.({ journal: f }); setPicking(false); }}
              className={`text-[0.6875rem] px-2 py-1 border ${journal === f ? "border-primary/60 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground"}`}
              style={{ borderRadius: "var(--v2-radius, 8px)" }}>
              {f}
            </button>
          ))}
          {journals.length === 0 && <Muted>{tr("widget.book.noJournals")}</Muted>}
        </div>
      )}

      {!entry && <Muted>{tr("widget.book.empty")}</Muted>}

      {entry && (
        <button type="button" onClick={() => navigate(`/journals?entry=${entry.id}`)}
          className="text-left w-full min-w-0">
          <p className="text-sm font-medium truncate">{entry.title || tr("widget.journal.untitled")}</p>
          <p className="text-[0.625rem] text-muted-foreground mb-1">
            {new Date(entry.timestamp || entry.created_date).toLocaleString([], {
              month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
            })}
          </p>
          {mode !== "minimal" && (
            isHtml
              ? <div className="text-xs text-muted-foreground [&_p]:mb-1 [&_*]:!text-inherit"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(entry.content || "") }} />
              : <p className="text-xs text-muted-foreground whitespace-pre-line">{entry.content}</p>
          )}
        </button>
      )}

      {pages.length > 1 && (
        <div className="flex items-center justify-between pt-1 mt-auto">
          <button type="button" aria-label={tr("widget.book.newer")}
            onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={idx === 0}
            className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-[0.625rem] text-muted-foreground tabular-nums">
            {tr("widget.book.page", { n: idx + 1, total: pages.length })}
          </span>
          <button type="button" aria-label={tr("widget.book.older")}
            onClick={() => setPage((p) => Math.min(pages.length - 1, p + 1))} disabled={idx >= pages.length - 1}
            className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {composing && (
        <JournalEditorModal
          isOpen
          onClose={() => setComposing(false)}
          alters={api?.alters || []}
          defaultFolder={journal || null}
        />
      )}
    </Section>
  );
}


// ── Notebook (write in place) ──────────────────────────────────────
// A journal page you write ON the home screen — no modal, no navigation.
// Saving CREATES a JournalEntry in the chosen journal (never updates one:
// journals are a log). Half-written text survives closing the app via the
// shared draft hook, per instance so two notebooks never share a draft.
function NotebookWidget({ settings, updateSettings, instanceId }) {
  const tr = useT();
  const qc = useQueryClient();
  const entries = useList("journalEntries", "JournalEntry");
  const [title, setTitle] = React.useState("");
  const [text, setText] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [picking, setPicking] = React.useState(false);

  const journal = settings?.journal ?? "";
  const journals = React.useMemo(() => {
    const set = new Set(entries.map((e) => e.folder).filter(Boolean));
    readJournalFolders().forEach((f) => set.add(f));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [entries]);

  const { clearDraft } = useFormDraft(`symphony_draft_notebook_${instanceId}`, { title, text }, {
    onRestore: (d) => { setTitle(d.title || ""); setText(d.text || ""); },
    isEmpty: (d) => !d.title?.trim() && !d.text?.trim(),
  });

  const save = async () => {
    const content = text.trim();
    if (!content || saving) return;
    setSaving(true);
    try {
      await base44.entities.JournalEntry.create({
        title: title.trim() || null,
        content,
        timestamp: new Date().toISOString(),
        folder: journal || null,
      });
      qc.invalidateQueries({ queryKey: ["journalEntries"] });
      clearDraft();
      setTitle("");
      setText("");
      toast.success(tr("widget.notebook.saved"));
    } catch (e) {
      toast.error(e?.message || "Couldn't save");
    } finally { setSaving(false); }
  };

  return (
    <Section
      label={journal || tr("widget.book.allJournals")}
      action={
        <span className="flex items-center gap-2">
          <TextAction onClick={() => setPicking((v) => !v)}>{tr("widget.book.switch")}</TextAction>
          <TextAction onClick={save}>{saving ? "…" : tr("widget.notebook.save")}</TextAction>
        </span>
      }
    >
      {picking && (
        <div className="flex flex-wrap gap-1 pb-1">
          <button type="button" onClick={() => { updateSettings?.({ journal: "" }); setPicking(false); }}
            className={`text-[0.6875rem] px-2 py-1 border ${!journal ? "border-primary/60 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground"}`}
            style={{ borderRadius: "var(--v2-radius, 8px)" }}>
            {tr("widget.book.allJournals")}
          </button>
          {journals.map((f) => (
            <button key={f} type="button" onClick={() => { updateSettings?.({ journal: f }); setPicking(false); }}
              className={`text-[0.6875rem] px-2 py-1 border ${journal === f ? "border-primary/60 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground"}`}
              style={{ borderRadius: "var(--v2-radius, 8px)" }}>
              {f}
            </button>
          ))}
        </div>
      )}
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={tr("widget.notebook.titlePlaceholder")}
        className="w-full h-8 px-2 text-sm font-medium bg-transparent border-0 border-b border-border/40 focus:outline-none focus:border-primary/50"
      />
      {/* The page itself: grows with the widget, scrolls when it outgrows it. */}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={tr("widget.notebook.placeholder")}
        className="w-full flex-1 min-h-[72px] px-2 py-1 text-sm bg-transparent border-0 resize-none focus:outline-none leading-relaxed"
        style={{ overscrollBehavior: "contain" }}
      />
    </Section>
  );
}

export const V2_WIDGETS = {
  presence: {
    label: "Who's here", description: "Current {{fronters}}, with time since each arrived.",
    icon: Users, category: "system",
    render: ({ mode, api }) => <PresenceWidget mode={mode} api={api} />,
    supportsModes: ["minimal", "normal"], supportsMultiInstance: false,
    defaultSpan: { cols: 4, rows: 1 }, minSpan: { cols: 2, rows: 1 }, maxSpan: { cols: 12, rows: 8 },
  },
  running: {
    label: "Active", description: "What's running right now — activities, symptom episodes, sleep — and how long for.",
    icon: Timer, category: "tracking",
    render: ({ api }) => <ActiveWidget api={api} />,
    supportsModes: ["normal"], supportsMultiInstance: false,
    defaultSpan: { cols: 4, rows: 1 }, minSpan: { cols: 2, rows: 1 }, maxSpan: { cols: 12, rows: 8 },
  },
  today: {
    label: "Today", description: "Today's schedule: plans at their times, anything due today, and anything left unresolved.",
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
    defaultSpan: { cols: 4, rows: 1 }, minSpan: { cols: 2, rows: 1 }, maxSpan: { cols: 12, rows: 6 },
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
    defaultSpan: { cols: 4, rows: 1 }, minSpan: { cols: 2, rows: 1 }, maxSpan: { cols: 12, rows: 6 },
  },
  system_identity: {
    label: "{{System}} header", description: "Your {{system}}'s picture, name and description.",
    icon: IdCard, category: "system",
    render: ({ mode, api }) => <SystemIdentityWidget mode={mode} api={api} />,
    supportsModes: ["minimal", "normal", "expanded"], supportsMultiInstance: false,
    defaultSpan: { cols: 4, rows: 1 }, minSpan: { cols: 2, rows: 1 }, maxSpan: { cols: 12, rows: 8 },
  },
  alters_list: {
    label: "{{Alters}} list", description: "A list of {{alters}} that opens their profiles.",
    icon: Users, category: "system",
    render: ({ settings, api }) => <AltersListWidget settings={settings} api={api} />,
    supportsModes: ["normal"], supportsMultiInstance: true,
    configFields: [
      { key: "limit", type: "number", label: "How many to show", min: 1, max: 20, default: 6 },
      { key: "sort", type: "select", label: "Order", default: "name",
        options: [{ value: "name", label: "By name" }, { value: "recent", label: "Recently updated" }] },
    ],
    defaultSpan: { cols: 4, rows: 2 }, minSpan: { cols: 2, rows: 1 }, maxSpan: { cols: 12, rows: 8 },
  },
  journal: {
    label: "Journal", description: "Your most recent entries, and a button to start a new one.",
    icon: BookOpen, category: "content",
    render: ({ settings }) => <JournalWidget settings={settings} />,
    supportsModes: ["normal"], supportsMultiInstance: true,
    configFields: [{ key: "limit", type: "number", label: "How many to show", min: 1, max: 20, default: 6 },],
    defaultSpan: { cols: 4, rows: 2 }, minSpan: { cols: 2, rows: 1 }, maxSpan: { cols: 12, rows: 8 },
  },
  journal_book: {
    label: "Journal pages", description: "Read one journal a page at a time, turn pages, switch journals, and start a new page.",
    icon: NotebookPen, category: "content",
    render: ({ mode, settings, updateSettings, api }) =>
      <JournalBookWidget mode={mode} settings={settings} updateSettings={updateSettings} api={api} />,
    supportsModes: ["minimal", "normal"], supportsMultiInstance: true,
    defaultSpan: { cols: 4, rows: 3 }, minSpan: { cols: 2, rows: 2 }, maxSpan: { cols: 12, rows: 10 },
  },
  notebook: {
    label: "Notebook", description: "Write straight onto the page — it saves as a journal entry in the journal you pick.",
    icon: PenLine, category: "content",
    render: ({ settings, updateSettings, instanceId }) =>
      <NotebookWidget settings={settings} updateSettings={updateSettings} instanceId={instanceId} />,
    supportsModes: ["normal"], supportsMultiInstance: true,
    defaultSpan: { cols: 4, rows: 3 }, minSpan: { cols: 2, rows: 2 }, maxSpan: { cols: 12, rows: 10 },
  },
  bulletin_board: {
    label: "Bulletin board", description: "The full board — post, comment and vote right here.",
    icon: Megaphone, category: "content",
    // The REAL BulletinBoard component, not a copy — posts, comments,
    // polls, mentions all behave exactly like the /bulletins page.
    render: ({ api }) => (
      <Section label={null}>
        <BulletinBoard
          alters={api?.alters || []}
          currentAlterId={api?.currentAlterId || null}
          frontingAlterIds={api?.frontingAlterIds || []}
          highlightBulletinId={api?.highlightBulletinId || null}
        />
      </Section>
    ),
    supportsModes: ["normal"], supportsMultiInstance: false,
    defaultSpan: { cols: 6, rows: 5 }, minSpan: { cols: 3, rows: 3 }, maxSpan: { cols: 12, rows: 12 },
  },
  tasks: {
    label: "To-dos", description: "Your open to-do list — everything still to do, not just today's.",
    icon: ListTodo, category: "tracking",
    render: ({ settings }) => <TasksWidget settings={settings} />,
    supportsModes: ["normal"], supportsMultiInstance: true,
    configFields: [{ key: "limit", type: "number", label: "How many to show", min: 1, max: 20, default: 6 },],
    defaultSpan: { cols: 4, rows: 2 }, minSpan: { cols: 2, rows: 1 }, maxSpan: { cols: 12, rows: 8 },
  },
  sleep: {
    label: "Sleep", description: "Last night's sleep, or the one in progress.",
    icon: Moon, category: "tracking",
    render: () => <SleepWidget />,
    supportsModes: ["normal"], supportsMultiInstance: false,
    defaultSpan: { cols: 4, rows: 1 }, minSpan: { cols: 2, rows: 1 }, maxSpan: { cols: 12, rows: 6 },
  },
  board: {
    label: "Board", description: "The latest posts on the bulletin board.",
    icon: Megaphone, category: "content",
    render: ({ settings }) => <BulletinsWidget settings={settings} />,
    supportsModes: ["normal"], supportsMultiInstance: true,
    configFields: [{ key: "limit", type: "number", label: "How many to show", min: 1, max: 20, default: 6 },],
    defaultSpan: { cols: 4, rows: 2 }, minSpan: { cols: 2, rows: 1 }, maxSpan: { cols: 12, rows: 8 },
  },
  reminders: {
    label: "Reminders", description: "What's coming up from your reminders.",
    icon: Bell, category: "tracking",
    render: ({ settings }) => <RemindersWidget settings={settings} />,
    supportsModes: ["normal"], supportsMultiInstance: true,
    configFields: [{ key: "limit", type: "number", label: "How many to show", min: 1, max: 20, default: 6 },],
    defaultSpan: { cols: 4, rows: 2 }, minSpan: { cols: 2, rows: 1 }, maxSpan: { cols: 12, rows: 6 },
  },

  // ── Page-design elements. No data of their own: they exist so a page
  // can be laid out the way the user wants it. ──
  heading: {
    label: "Heading", description: "A line of your own text, for labelling a part of the page.",
    icon: Type, category: "layout",
    render: ({ settings }) => <HeadingWidget settings={settings} />,
    supportsModes: ["normal"], supportsMultiInstance: true,
    configFields: [
      { key: "text", type: "text", label: "Text", placeholder: "Heading" },
      { key: "size", type: "select", label: "Size", default: "lg",
        options: [{ value: "sm", label: "Small" }, { value: "md", label: "Medium" }, { value: "lg", label: "Large" }] },
      { key: "align", type: "select", label: "Alignment", default: "left",
        options: [{ value: "left", label: "Left" }, { value: "center", label: "Centre" }, { value: "right", label: "Right" }] },
    ],
    defaultSpan: { cols: 4, rows: 1 }, minSpan: { cols: 1, rows: 1 }, maxSpan: { cols: 12, rows: 6 },
  },
  text: {
    label: "Text", description: "A paragraph of your own — notes, reminders to yourself, anything.",
    icon: AlignLeft, category: "layout",
    render: ({ settings }) => <TextWidget settings={settings} />,
    supportsModes: ["normal"], supportsMultiInstance: true,
    configFields: [
      { key: "text", type: "textarea", label: "Text", rows: 4, placeholder: "Write anything here…" },
      { key: "align", type: "select", label: "Alignment", default: "left",
        options: [{ value: "left", label: "Left" }, { value: "center", label: "Centre" }, { value: "right", label: "Right" }] },
    ],
    defaultSpan: { cols: 4, rows: 1 }, minSpan: { cols: 1, rows: 1 }, maxSpan: { cols: 12, rows: 8 },
  },
  divider: {
    label: "Divider", description: "A line to separate parts of a page.",
    icon: Minus, category: "layout",
    render: ({ settings }) => <DividerWidget settings={settings} />,
    supportsModes: ["normal"], supportsMultiInstance: true,
    configFields: [
      { key: "thickness", type: "number", label: "Thickness", min: 1, max: 8, default: 1 },
      { key: "dashed", type: "toggle", label: "Dashed", default: false },
    ],
    defaultSpan: { cols: 4, rows: 1 }, minSpan: { cols: 1, rows: 1 }, maxSpan: { cols: 12, rows: 1 },
  },
  spacer: {
    label: "Spacer", description: "Empty space, for pushing things apart.",
    icon: MoveVertical, category: "layout",
    render: () => <SpacerWidget />,
    supportsModes: ["normal"], supportsMultiInstance: true,
    defaultSpan: { cols: 4, rows: 1 }, minSpan: { cols: 1, rows: 1 }, maxSpan: { cols: 12, rows: 6 },
  },
  folder: {
    label: "Folder", description: "A folder on the page that holds apps — tap to open it.",
    icon: FolderOpen, category: "nav",
    render: ({ mode, settings }) => <FolderWidget mode={mode} settings={settings} />,
    supportsModes: ["minimal", "normal"], supportsMultiInstance: true,
    configFields: [
      { key: "label", type: "text", label: "Folder name", placeholder: "Folder" },
      { key: "appIds", type: "apps", label: "Apps in this folder" },
    ],
    defaultSpan: { cols: 1, rows: 1 }, minSpan: { cols: 1, rows: 1 }, maxSpan: { cols: 4, rows: 2 },
  },
  app_shortcut: {
    label: "App shortcut", description: "An icon that opens one page. Pin apps from the drawer's Apps tab.",
    icon: Rocket, category: "nav",
    render: ({ mode, settings }) => <AppTileWidget mode={mode} settings={settings} />,
    supportsModes: ["minimal", "normal"], supportsMultiInstance: true,
    hiddenFromDrawer: true,
    defaultSpan: { cols: 1, rows: 1 }, minSpan: { cols: 1, rows: 1 }, maxSpan: { cols: 4, rows: 2 },
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
