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
  Pin, Wind, Link2, Vote, CalendarDays, BarChart2, MessageSquare, Hash,
} from "lucide-react";
import { buildGridItems, findGridItem } from "@/lib/navCatalogue";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { AssetButton } from "@/components/shared/AssetPickerModal";
import DOMPurify from "dompurify";
import JournalEditorModal from "@/components/journal/JournalEditorModal";
import BulletinBoard from "@/components/bulletin/BulletinBoard";
import useFormDraft from "@/hooks/useFormDraft";
import CurrentFronters from "@/components/dashboard/CurrentFronters";
import PinnedAltersGallery from "@/components/alters/PinnedAltersGallery";
import BreathingExercise from "@/components/grounding/BreathingExercise";
import { BREATHING_PATTERNS } from "@/utils/groundingDefaults";
import { markGroundingTechniqueUsedToday } from "@/lib/dailyTaskSystem";
import { useFrontLevels, getSessionLevel, frontLevelLabel } from "@/lib/frontLevels";
import { useHoldDragLevel, commitFrontLevel, FrontLevelRail } from "@/components/fronting/FrontLevelRail";
import { AlterPanel } from "@/components/dashboard/CurrentFronters";
import AlterActionMenu from "@/components/alters/AlterActionMenu";
import { toggleFrontFor } from "@/hooks/useSwipeActions";
import { getMemberAlters } from "@/lib/subsystemUtils";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import ChannelView from "@/components/chat/ChannelView";
import { CreatePollModal } from "@/pages/Polls";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { getActiveActivities } from "@/lib/activitySession";
import { Section, Row, Muted, TextAction, Dot, boxStyle } from "@/v2/primitives";
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
// Row avatar for the presence widget (hook-per-row for local-image URLs).
function PresenceAvatar({ alter, ring }) {
  const resolved = useResolvedAvatarUrl(alter.avatar_url);
  return (
    <span className="w-7 h-7 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center"
      style={{
        backgroundColor: alter.color || "hsl(var(--muted))",
        boxShadow: ring ? `0 0 0 2px color-mix(in srgb, ${alter.color || "var(--v2-accent)"} 55%, transparent)` : undefined,
      }}>
      {resolved ? <img src={resolved} alt="" className="w-full h-full object-cover" /> : null}
    </span>
  );
}

function PresenceWidget({ mode, api, settings }) {
  const tr = useT();
  const navigate = useNavigate();
  const t = useTerms();
  const qc = useQueryClient();
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

  // Fronting levels (opt-in): each row shows its alter's level, and
  // press-and-hold a row → the vertical spectrum rail → drag → release.
  const levelCfg = useFrontLevels();
  // A committed rail gesture must not ALSO count as a tap when the finger
  // lifts — suppress the click that follows a hold.
  const suppressTapUntil = React.useRef(0);
  const { rail, getHoldProps } = useHoldDragLevel({
    cfg: levelCfg,
    onCommit: (alterId, levelId) => {
      suppressTapUntil.current = Date.now() + 400;
      commitFrontLevel({ alterId, levelId, queryClient: qc });
    },
    // One slot past the far end of the spectrum: remove from front (the
    // canonical toggleFrontFor — refetch-before-write, ends the session).
    onRemove: (alterId) => {
      suppressTapUntil.current = Date.now() + 400;
      const alter = byId[alterId];
      if (alter) toggleFrontFor(alter, sessions, base44, qc, toast, t);
    },
  });
  const railAlter = rail ? byId[rail.alterId] : null;
  // Owner-specified gesture model (mirrors the classic Currently Fronting
  // card): hold = level rail · tap = per-alter panel INLINE in the widget ·
  // double-tap = the alter action menu (which carries its own level
  // dropdown). Same 350ms double-tap window as FronterChip.
  const [expandedId, setExpandedId] = React.useState(null);
  const [menuFor, setMenuFor] = React.useState(null);
  const lastTap = React.useRef({});
  const showAvatar = !!settings?.showAvatar;
  const showPronouns = !!settings?.showPronouns;

  return (
    <Section
      label={tr("widget.presence.title")}
      action={<TextAction onClick={() => window.dispatchEvent(new CustomEvent("open-set-front"))}>{applyTerms(tr("common.switch"), t)}</TextAction>}
    >
      {fronters.length === 0 && <Muted>{applyTerms(tr("widget.presence.empty"), t)}</Muted>}
      {(mode === "minimal" ? fronters.slice(0, 1) : fronters).map(({ s, alter }) => {
        const level = getSessionLevel(s, levelCfg);
        const secondary = [showPronouns ? alter.pronouns : null, level ? frontLevelLabel(level, t) : null]
          .filter(Boolean).join(" · ") || undefined;
        return (
        <React.Fragment key={s.id}>
        <div {...getHoldProps(alter.id, s.front_level)} className="select-none">
        <Row
          // A ring marks the primary instead of a word — the name needs the
          // room more than the label does in a one-column widget.
          left={showAvatar
            ? <PresenceAvatar alter={alter} ring={s.is_primary} />
            : <Dot color={alter.color} ring={s.is_primary} />}
          primary={formatAlter(alter)}
          secondary={secondary}
          right={s.start_time ? fmtElapsed(s.start_time) : undefined}
          title={s.is_primary ? applyTerms(tr("widget.presence.primaryOf"), t) : undefined}
          onClick={() => {
            if (rail || Date.now() < suppressTapUntil.current) return;
            const now = Date.now();
            if (lastTap.current.id === alter.id && now - lastTap.current.t < 350) {
              lastTap.current = {};
              setMenuFor(alter);
              return;
            }
            lastTap.current = { id: alter.id, t: now };
            setExpandedId((prev) => (prev === alter.id ? null : alter.id));
          }}
        />
        </div>
        {/* The per-alter panel opens INLINE under its row, exactly like the
            classic Currently Fronting card — reused, not forked. */}
        {expandedId === alter.id && (
          <div className="-mx-1">
            <AlterPanel
              alter={alter}
              session={s}
              onClose={() => setExpandedId(null)}
              onSaved={() => setExpandedId(null)}
            />
          </div>
        )}
        </React.Fragment>
        );
      })}
      <FrontLevelRail rail={rail} cfg={levelCfg} withRemove alterName={railAlter ? formatAlter(railAlter) : ""} />
      {menuFor && (
        <AlterActionMenu alter={menuFor} activeSessions={sessions} onClose={() => setMenuFor(null)} />
      )}
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
        <p className="text-[0.625em] font-semibold uppercase tracking-wide text-muted-foreground pt-0.5">
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
        <p className="text-[0.625em] font-semibold uppercase tracking-wide text-muted-foreground pt-1">
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
  // Chromeless by default, but still the widget's visible box — a border or
  // background set in its look has somewhere to land (widget contract).
  return <p className={cls} style={{ ...boxStyle({ borderFallback: false, padFallback: false }), textAlign: align }}>{settings?.text || settings?.label || "Heading"}</p>;
}

function TextWidget({ settings }) {
  const align = settings?.align || "left";
  return (
    <p className="text-sm text-muted-foreground whitespace-pre-line"
      style={{ ...boxStyle({ borderFallback: false, padFallback: false }), textAlign: align }}>
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
  // Three looks: "tile" (outline icon), "card" (the colourful catalogue
  // icon from the apps list, framed with the name — the per-widget look's
  // border/background/gradient wraps it), "plain" (icon only). A custom
  // image beats all three. The card frame itself is the widget wrapper, so
  // borders and background images from the look settings apply.
  const display = settings?.display || (mode === "minimal" ? "plain" : "tile");
  const iconEl = customIcon
    ? <img src={customIcon} alt="" className="w-9 h-9 object-cover" style={{ borderRadius: "var(--v2-radius)" }} />
    : display === "card"
      ? <span className={`w-10 h-10 rounded-2xl flex items-center justify-center ${item.color}`}>
          <Icon className="w-5 h-5" />
        </span>
      : <span className="w-9 h-9 flex items-center justify-center"
          style={{ borderRadius: "var(--v2-radius)", border: "var(--v2-border-w) solid color-mix(in srgb, var(--v2-accent) 40%, transparent)" }}>
          <Icon className="w-4 h-4" />
        </span>;
  return (
    <button type="button" onClick={() => navigate(item.path)} title={label}
      className="w-full h-full min-h-[52px] flex flex-col items-center justify-center gap-1 py-1.5 hover:bg-muted/40"
      // The tile is this widget's visible box (widget contract).
      style={boxStyle({ borderFallback: false })}>
      {iconEl}
      {display !== "plain" && mode !== "minimal" && (
        <span className="text-[0.625em] text-center leading-tight text-muted-foreground line-clamp-2 px-0.5">{label}</span>
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
  const groups = useList("groups", "Group");
  const alters = api?.alters || [];
  const limit = parseInt(settings?.limit, 10) || 6;
  const sort = settings?.sort || "name";
  const group = settings?.groupId ? groups.find((g) => g.id === settings.groupId) : null;
  const list = React.useMemo(() => {
    // Scoped to one group/subsystem via the same membership resolution the
    // group pages use, so the two can never disagree.
    const pool = group ? getMemberAlters(group, alters) : alters;
    const live = pool.filter((a) => !a.is_archived);
    const sorted = sort === "recent"
      ? [...live].sort((a, b) => new Date(b.updated_date || b.created_date || 0) - new Date(a.updated_date || a.created_date || 0))
      : [...live].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    return sorted.slice(0, limit);
  }, [alters, sort, limit, group]);

  return (
    <Section label={group ? group.name : applyTerms(tr("widget.alters.label"), t)}
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
        // The folder tile is this widget's visible box (widget contract).
        style={boxStyle({ borderFallback: false })}>
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
          <span className="text-[0.625em] text-center leading-tight text-muted-foreground line-clamp-2 px-0.5">
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
                  <span className="text-[0.625em] text-center leading-tight text-muted-foreground line-clamp-2">
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
        <div className="pb-1">
          <SearchableSelect
            value={journal || ""}
            onChange={(v) => { updateSettings?.({ journal: v || "" }); setPicking(false); }}
            options={[{ id: "", label: tr("widget.book.allJournals") }, ...journals.map((f) => ({ id: f, label: f }))]}
            placeholder={journal || tr("widget.book.allJournals")}
            searchPlaceholder={tr("widget.chat.search")}
          />
          {journals.length === 0 && <Muted>{tr("widget.book.noJournals")}</Muted>}
        </div>
      )}

      {!entry && <Muted>{tr("widget.book.empty")}</Muted>}

      {entry && (
        <button type="button" onClick={() => navigate(`/journals?entry=${entry.id}`)}
          className="text-left w-full min-w-0">
          <p className="text-sm font-medium truncate">{entry.title || tr("widget.journal.untitled")}</p>
          <p className="text-[0.625em] text-muted-foreground mb-1">
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
          <span className="text-[0.625em] text-muted-foreground tabular-nums">
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
        <div className="pb-1">
          <SearchableSelect
            value={journal || ""}
            onChange={(v) => { updateSettings?.({ journal: v || "" }); setPicking(false); }}
            options={[{ id: "", label: tr("widget.book.allJournals") }, ...journals.map((f) => ({ id: f, label: f }))]}
            placeholder={journal || tr("widget.book.allJournals")}
            searchPlaceholder={tr("widget.chat.search")}
          />
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


// ── Bulletin board (stripped, multi-board) ─────────────────────────
// The REAL BulletinBoard component in boardOnly mode: composer + board,
// nothing else — quick task / quick plan / planned-events live in the
// quick-actions bar now. `settings.boards` holds which boards this widget
// carries ("system" and/or group ids); with several, arrows flip between
// them. Group boards are the same isolated boards the group pages show.
function BulletinBoardWidget({ api, settings, updateSettings }) {
  const tr = useT();
  const t = useTerms();
  const groups = useList("groups", "Group");
  const [idx, setIdx] = React.useState(0);
  const [picking, setPicking] = React.useState(false);

  const chosen = Array.isArray(settings?.boards) && settings.boards.length > 0 ? settings.boards : ["system"];
  const boards = chosen
    .map((id) => id === "system"
      ? { id: "system", label: applyTerms(tr("widget.bboard.system"), t), groupId: null }
      : (() => { const g = groups.find((x) => x.id === id); return g ? { id, label: g.name, groupId: id } : null; })())
    .filter(Boolean);
  const cur = boards[Math.min(idx, boards.length - 1)] || boards[0];

  const toggleBoard = (id) => {
    const next = chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id];
    updateSettings?.({ boards: next.length ? next : ["system"] });
    setIdx(0);
  };

  return (
    <Section
      label={
        boards.length > 1 ? (
          <span className="inline-flex items-center gap-1">
            <button type="button" aria-label={tr("widget.bboard.prev")}
              onClick={() => setIdx((i) => (i - 1 + boards.length) % boards.length)}
              className="p-0.5 text-muted-foreground hover:text-foreground"><ChevronLeft className="w-3.5 h-3.5" /></button>
            <span>{cur?.label}</span>
            <button type="button" aria-label={tr("widget.bboard.next")}
              onClick={() => setIdx((i) => (i + 1) % boards.length)}
              className="p-0.5 text-muted-foreground hover:text-foreground"><ChevronRight className="w-3.5 h-3.5" /></button>
          </span>
        ) : cur?.label
      }
      action={<TextAction onClick={() => setPicking((v) => !v)}>{tr("widget.bboard.boards")}</TextAction>}
    >
      {picking && (
        <SearchableMultiList
          options={[{ id: "system", label: applyTerms(tr("widget.bboard.system"), t) }, ...groups.map((g) => ({ id: g.id, label: g.name || "Group" }))]}
          selectedIds={chosen}
          onToggle={toggleBoard}
          searchPlaceholder={tr("widget.chat.search")}
        />
      )}
      {/* keyed by board so flipping fully remounts the board's own state */}
      <BulletinBoard
        key={cur?.id || "system"}
        boardOnly
        groupId={cur?.groupId || null}
        alters={api?.alters || []}
        currentAlterId={api?.currentAlterId || null}
        frontingAlterIds={api?.frontingAlterIds || []}
        highlightBulletinId={api?.highlightBulletinId || null}
      />
    </Section>
  );
}


// ── Sleep controls ─────────────────────────────────────────────────
// Start sleeping / wake up, right on the page. Ending sets wake_time on
// the running record — that's this entity's own lifecycle, not an
// immutable log like status notes.
function SleepControlWidget() {
  const tr = useT();
  const qc = useQueryClient();
  const sleeps = useList("sleep", "Sleep");
  const [busy, setBusy] = React.useState(false);
  const active = sleeps.find((x) => x.bedtime && !x.wake_time);

  const act = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (active) await base44.entities.Sleep.update(active.id, { wake_time: new Date().toISOString() });
      else await base44.entities.Sleep.create({ bedtime: new Date().toISOString() });
      qc.invalidateQueries({ queryKey: ["sleep"] });
    } finally { setBusy(false); }
  };

  return (
    <Section label={tr("widget.sleep.label")}>
      {active
        ? <Row left={<Dot color="#6a7bd6" />} primary={tr("widget.sleepCtl.sleeping")} right={fmtElapsed(active.bedtime)} />
        : <Muted>{tr("widget.sleepCtl.awake")}</Muted>}
      <button type="button" onClick={act} disabled={busy}
        className="w-full h-9 text-sm font-medium border text-center disabled:opacity-50"
        style={{
          borderRadius: "var(--v2-radius, 8px)",
          borderColor: "color-mix(in srgb, var(--v2-accent) 50%, transparent)",
          color: "var(--v2-accent)",
        }}>
        {active ? tr("widget.sleepCtl.wake") : tr("widget.sleepCtl.start")}
      </button>
    </Section>
  );
}

// ── Breathing ──────────────────────────────────────────────────────
// The guided breathing display itself, scaled to whatever size the widget
// is. autoRun loops it whenever it's on screen; otherwise the circle is a
// start/stop button. Minimal = animation only (technique set in the
// widget's options); normal adds technique chips; expanded adds the
// pattern's timing line.
function BreathingWidget({ settings, updateSettings, mode }) {
  const tr = useT();
  const boxRef = React.useRef(null);
  const [box, setBox] = React.useState({ w: 200, h: 200 });
  const [running, setRunning] = React.useState(!!settings?.autoRun);
  React.useEffect(() => { setRunning(!!settings?.autoRun); }, [settings?.autoRun]);
  React.useEffect(() => {
    const node = boxRef.current;
    if (!node) return undefined;
    const measure = () => {
      const r = node.getBoundingClientRect();
      if (r.width && r.height) setBox({ w: r.width, h: r.height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  const pattern = BREATHING_PATTERNS[settings?.pattern] ? settings.pattern : "Box breathing";
  const showChips = mode !== "minimal";
  const chrome = (showChips ? 40 : 0) + (mode === "expanded" ? 20 : 0) + 22;
  // Fit the circle to the SMALLER axis so resizing in either direction
  // actually resizes the animation instead of cropping it.
  const maxSize = Math.max(72, Math.min(box.w - 8, box.h - chrome, 260));

  return (
    // Section is this widget's visible box (widget contract) — without it,
    // border / background / shadow / padding looks had nothing to paint on.
    // The measuring div sits inside, so the circle sizes to the box's
    // content area and shrinks when the user adds padding or borders.
    <Section>
    <div ref={boxRef} className="h-full w-full min-h-0 flex flex-col items-center justify-center gap-1.5">
      <BreathingExercise
        key={`${pattern}_${maxSize}_${running}_${settings?.pace || 1}`}
        embedded
        loop
        autoStart={running}
        maxSize={maxSize}
        pace={parseFloat(settings?.pace) || 1}
        patternName={pattern}
        onStop={() => {
          try { markGroundingTechniqueUsedToday(); } catch { /* marker only */ }
          if (!settings?.autoRun) setRunning(false);
        }}
      />
      {showChips && (
        <div style={{ width: Math.max(160, maxSize) }}>
          <SearchableSelect
            value={pattern}
            onChange={(v) => { if (v) updateSettings?.({ pattern: v }); }}
            options={Object.keys(BREATHING_PATTERNS).map((name) => ({ id: name, label: name }))}
            placeholder={pattern}
            searchPlaceholder={tr("widget.chat.search")}
          />
        </div>
      )}
      {mode === "expanded" && (
        <p className="text-[0.625em] text-muted-foreground">{BREATHING_PATTERNS[pattern].pattern}</p>
      )}
    </div>
    </Section>
  );
}

// ── Plans (upcoming) ───────────────────────────────────────────────
function PlansWidget({ settings }) {
  const tr = useT();
  const navigate = useNavigate();
  const activities = useList("activities", "Activity");
  const days = parseInt(settings?.days, 10) || 7;
  const limit = parseInt(settings?.limit, 10) || 8;
  const now = Date.now();
  const upcoming = activities
    .filter((a) => a.status === "scheduled" && a.timestamp
      && new Date(a.timestamp).getTime() > now - 3600000
      && new Date(a.timestamp).getTime() < now + days * 86400000)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    .slice(0, limit);
  const fmtDay = (d) => new Date(d).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  return (
    <Section label={tr("widget.plans.label")}
      action={<TextAction onClick={() => navigate("/activities?tab=planned")}>{tr("widget.today.open")}</TextAction>}>
      {upcoming.length === 0 && <Muted>{tr("widget.plans.empty")}</Muted>}
      {upcoming.map((a) => (
        <Row key={a.id}
          left={<CalendarCheck className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />}
          primary={a.activity_name}
          secondary={sameDay(a.timestamp, now) ? undefined : fmtDay(a.timestamp)}
          right={fmtTime(a.timestamp)}
          onClick={() => navigate(`/activities?activityId=${a.id}`)} />
      ))}
    </Section>
  );
}

// ── Recent activities ──────────────────────────────────────────────
function RecentActivitiesWidget({ settings }) {
  const tr = useT();
  const navigate = useNavigate();
  const activities = useList("activities", "Activity");
  const limit = parseInt(settings?.limit, 10) || 6;
  const done = activities
    .filter((a) => ["logged", "done", "partial"].includes(a.status) && a.timestamp)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, limit);
  return (
    <Section label={tr("widget.recentActs.label")}
      action={<TextAction onClick={() => navigate("/activities")}>{tr("widget.today.open")}</TextAction>}>
      {done.length === 0 && <Muted>{tr("widget.recentActs.empty")}</Muted>}
      {done.map((a) => (
        <Row key={a.id} primary={a.activity_name}
          secondary={a.duration_minutes ? `${a.actual_duration_minutes || a.duration_minutes}m` : undefined}
          right={fmtTime(a.timestamp)}
          onClick={() => navigate(`/activities?activityId=${a.id}`)} />
      ))}
    </Section>
  );
}

// ── Quick links ────────────────────────────────────────────────────
// A tile row of app destinations the user picks — their own nav screen.
// One alter tile (own component so the avatar hook is legal in a list).
function AlterLinkTile({ alter, mode }) {
  const navigate = useNavigate();
  const formatAlter = useAlterLabel();
  const avatar = useResolvedAvatarUrl(alter.image_url || "");
  return (
    <button type="button" onClick={() => navigate(`/alter/${alter.id}`)}
      className="flex flex-col items-center justify-center gap-1 py-1.5 hover:bg-muted/40"
      style={{ borderRadius: "var(--v2-radius, 8px)" }}>
      {avatar
        ? <img src={avatar} alt="" className="w-9 h-9 rounded-full object-cover" />
        : <span className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold"
            style={{ background: `${alter.color || "#64748b"}33`, color: alter.color || undefined }}>
            {(formatAlter(alter) || "?")[0]}
          </span>}
      {mode !== "minimal" && (
        <span className="text-[0.625em] text-center leading-tight text-muted-foreground line-clamp-2">
          {formatAlter(alter)}
        </span>
      )}
    </button>
  );
}

// Links can point at app pages, journals, {{alters}} or groups — enough to
// build a whole nav page of your own. Legacy appIds keep working.
function QuickLinksWidget({ settings, mode, api }) {
  const t = useTerms();
  const tr = useT();
  const navigate = useNavigate();
  const groups = useList("groups", "Group");
  const items = React.useMemo(() => buildGridItems(t.Alters, t.System), [t.Alters, t.System]);
  const alters = api?.alters || [];

  const links = [
    ...(settings?.appIds || []).map((id) => ({ type: "app", id })),
    ...(Array.isArray(settings?.links) ? settings.links : []),
  ];
  if (links.length === 0) return <Muted>{tr("widget.links.empty")}</Muted>;

  const tile = (label, icon, onClick, key) => (
    <button key={key} type="button" onClick={onClick}
      className="flex flex-col items-center justify-center gap-1 py-1.5 hover:bg-muted/40"
      style={{ borderRadius: "var(--v2-radius, 8px)" }}>
      {icon}
      {mode !== "minimal" && (
        <span className="text-[0.625em] text-center leading-tight text-muted-foreground line-clamp-2">{label}</span>
      )}
    </button>
  );

  return (
    // The grid itself is this widget's visible box (widget contract).
    <div className="grid gap-1 h-full min-h-0"
      style={{ ...boxStyle({ borderFallback: false }), gridTemplateColumns: `repeat(auto-fill, minmax(64px, 1fr))` }}>
      {links.map((l, i) => {
        const key = `${l.type}_${l.id}_${i}`;
        if (l.type === "app") {
          const a = findGridItem(items, l.id);
          if (!a) return null;
          const Icon = a.icon;
          return tile(a.label, (
            <span className={`w-9 h-9 rounded-xl flex items-center justify-center ${a.color}`}>
              <Icon className="w-4 h-4" />
            </span>
          ), () => navigate(a.path), key);
        }
        if (l.type === "journal") {
          return tile(l.id, (
            <span className="w-9 h-9 rounded-xl flex items-center justify-center bg-amber-500/15 text-amber-500">
              <BookOpen className="w-4 h-4" />
            </span>
          ), () => navigate(`/journals?folder=${encodeURIComponent(l.id)}`), key);
        }
        if (l.type === "alter") {
          const a = alters.find((x) => x.id === l.id);
          return a ? <AlterLinkTile key={key} alter={a} mode={mode} /> : null;
        }
        if (l.type === "group") {
          const g = groups.find((x) => x.id === l.id);
          if (!g) return null;
          return tile(g.name, (
            <span className="w-9 h-9 rounded-xl flex items-center justify-center bg-lime-500/15 text-lime-500">
              <Users className="w-4 h-4" />
            </span>
          ), () => navigate(`/group/${g.id}`), key);
        }
        return null;
      })}
    </div>
  );
}

// ── Polls ──────────────────────────────────────────────────────────
function PollsWidget({ settings }) {
  const tr = useT();
  const navigate = useNavigate();
  const polls = useList("polls", "Poll");
  const limit = parseInt(settings?.limit, 10) || 4;
  const list = [...polls]
    .sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0))
    .slice(0, limit);
  const votes = (p) => Object.values(p.votes || {}).reduce((n, v) => n + (Array.isArray(v) ? v.length : 1), 0);
  return (
    <Section label={tr("widget.polls.label")}
      action={<TextAction onClick={() => navigate("/polls")}>{tr("widget.today.open")}</TextAction>}>
      {list.length === 0 && <Muted>{tr("widget.polls.empty")}</Muted>}
      {list.map((p) => (
        <Row key={p.id}
          left={<Vote className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />}
          primary={p.question}
          right={tr("widget.polls.votes", { count: votes(p) })}
          onClick={() => navigate("/polls")} />
      ))}
    </Section>
  );
}


// ── Chat channel ───────────────────────────────────────────────────
// A real chat channel on the page — the SAME ChannelView the chat page
// hosts, so sending, signposts, whispers and mentions all behave
// identically. Which channel is chosen in the widget's options.
function ChatChannelWidget({ settings, updateSettings, api }) {
  const tr = useT();
  const channels = useList("systemChatChannels", "SystemChatChannel");
  const chan = channels.find((c) => c.id === settings?.channelId) || channels[0] || null;
  return (
    <Section
      label={chan ? `#${chan.name}` : tr("widget.chat.label")}
      action={channels.length > 1 && (
        <span style={{ minWidth: 130 }}>
          <SearchableSelect
            value={chan?.id || ""}
            onChange={(v) => updateSettings?.({ channelId: v })}
            options={channels.map((c) => ({ id: c.id, label: `#${c.name}` }))}
            placeholder={tr("widget.chat.pick")}
            searchPlaceholder={tr("widget.chat.search")}
          />
        </span>
      )}
    >
      {!chan && <Muted>{tr("widget.chat.empty")}</Muted>}
      {chan && (
        <div className="min-h-0 flex-1 flex flex-col" style={{ minHeight: 220 }}>
          <ChannelView
            channel={chan}
            alters={api?.alters || []}
            defaultAuthorId={api?.currentAlterId || null}
            frontingAlterIds={api?.frontingAlterIds || []}
          />
        </div>
      )}
    </Section>
  );
}

// ── Poll results ───────────────────────────────────────────────────
function PollResultsWidget({ settings, updateSettings }) {
  const tr = useT();
  const navigate = useNavigate();
  const polls = useList("polls", "Poll");
  const sorted = [...polls].sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0));
  const poll = sorted.find((p) => p.id === settings?.pollId) || sorted[0] || null;
  const counts = (poll?.options || []).map((_, i) => {
    const v = poll?.votes?.[String(i)];
    return Array.isArray(v) ? v.length : (typeof v === "number" ? v : 0);
  });
  const total = counts.reduce((a, b) => a + b, 0);
  return (
    <Section
      label={tr("widget.pollResults.label")}
      action={sorted.length > 1 && (
        <span style={{ minWidth: 130 }}>
          <SearchableSelect
            value={poll?.id || ""}
            onChange={(v) => updateSettings?.({ pollId: v })}
            options={sorted.map((p) => ({ id: p.id, label: p.question }))}
            placeholder={tr("widget.pollResults.pick")}
            searchPlaceholder={tr("widget.chat.search")}
          />
        </span>
      )}
    >
      {!poll && <Muted>{tr("widget.polls.empty")}</Muted>}
      {poll && (
        <button type="button" onClick={() => navigate("/polls")} className="text-left w-full space-y-1.5">
          <p className="text-sm font-medium">{poll.question}</p>
          {(poll.options || []).map((opt, i) => {
            const pct = total ? Math.round((counts[i] / total) * 100) : 0;
            return (
              <div key={i}>
                <div className="flex items-center justify-between text-xs">
                  <span className="truncate">{opt}</span>
                  <span className="text-muted-foreground tabular-nums flex-shrink-0 ml-2">{counts[i]} · {pct}%</span>
                </div>
                <div className="h-1.5 mt-0.5 rounded-full bg-muted/50 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--v2-accent)" }} />
                </div>
              </div>
            );
          })}
        </button>
      )}
    </Section>
  );
}

// ── New poll ───────────────────────────────────────────────────────
function PollComposerWidget({ api }) {
  const tr = useT();
  const [open, setOpen] = React.useState(false);
  return (
    <Section label={tr("widget.polls.label")}>
      <button type="button" onClick={() => setOpen(true)}
        className="w-full h-10 text-sm font-medium border flex items-center justify-center gap-2"
        style={{
          borderRadius: "var(--v2-radius, 8px)",
          borderColor: "color-mix(in srgb, var(--v2-accent) 50%, transparent)",
          color: "var(--v2-accent)",
        }}>
        <Vote className="w-4 h-4" /> {tr("widget.pollNew.start")}
      </button>
      {open && (
        <CreatePollModal open onClose={() => setOpen(false)}
          alters={(api?.alters || []).filter((a) => !a.is_archived)} />
      )}
    </Section>
  );
}


// House picker rules apply INSIDE widgets too: anything with an unbounded
// option list (journals, groups, boards) is searchable and scrollable —
// never a wrap of pills that becomes unnavigable in a large system.
export function SearchableMultiList({ options, selectedIds, onToggle, searchPlaceholder }) {
  const [q, setQ] = React.useState("");
  const needle = q.trim().toLowerCase();
  const shown = needle ? options.filter((o) => o.label.toLowerCase().includes(needle)) : options;
  return (
    <div className="space-y-1 pb-1">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchPlaceholder}
        className="w-full h-8 px-2 rounded-lg border border-input bg-background text-xs focus:outline-none focus:ring-1 focus:ring-ring" />
      <div className="max-h-40 overflow-y-auto space-y-0.5">
        {shown.map((o) => {
          const on = selectedIds.includes(o.id);
          return (
            <button key={o.id} type="button" onClick={() => onToggle(o.id)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg border text-left text-xs ${
                on ? "border-primary/60 bg-primary/10" : "border-transparent hover:bg-muted/40"
              }`}>
              <span className="flex-1 truncate">{o.label}</span>
              {on && <span className="text-primary flex-shrink-0">✓</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export const V2_WIDGETS = {
  presence: {
    label: "Who's here", description: "Current {{fronters}}, with time since each arrived. Tap = their check-in panel inline; double-tap = the action menu; press-and-hold = the {{fronting}}-level spectrum.",
    icon: Users, category: "system",
    render: ({ mode, api, settings }) => <PresenceWidget mode={mode} api={api} settings={settings} />,
    supportsModes: ["minimal", "normal"], supportsMultiInstance: false,
    configFields: [
      { key: "showAvatar", type: "toggle", label: "Show avatars", default: false },
      { key: "showPronouns", type: "toggle", label: "Show pronouns", default: false },
    ],
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
      { key: "groupId", type: "group", label: "Only show one group / subsystem" },
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
    configFields: [
      { key: "journal", type: "dynamicSelect", source: "journalFolders", label: "Journal", emptyLabel: "All journals" },
    ],
    defaultSpan: { cols: 4, rows: 3 }, minSpan: { cols: 2, rows: 2 }, maxSpan: { cols: 12, rows: 10 },
  },
  notebook: {
    label: "Notebook", description: "Write straight onto the page — it saves as a journal entry in the journal you pick.",
    icon: PenLine, category: "content",
    render: ({ settings, updateSettings, instanceId }) =>
      <NotebookWidget settings={settings} updateSettings={updateSettings} instanceId={instanceId} />,
    supportsModes: ["normal"], supportsMultiInstance: true,
    configFields: [
      { key: "journal", type: "dynamicSelect", source: "journalFolders", label: "Journal", emptyLabel: "All journals" },
    ],
    defaultSpan: { cols: 4, rows: 3 }, minSpan: { cols: 2, rows: 2 }, maxSpan: { cols: 12, rows: 10 },
  },
  bulletin_board: {
    label: "Bulletin board", description: "The board itself — post and read. Can show group boards too, with arrows to flip between them.",
    icon: Megaphone, category: "content",
    render: ({ api, settings, updateSettings }) => (
      <BulletinBoardWidget api={api} settings={settings} updateSettings={updateSettings} />
    ),
    supportsModes: ["normal"], supportsMultiInstance: true,
    configFields: [
      { key: "boards", type: "dynamicMulti", source: "boards", label: "Boards" },
    ],
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
  fronting_panel: {
    label: "{{Fronting}} panel", description: "The classic currently-{{fronting}} panel — per-{{alter}} feelings, symptoms and notes.",
    icon: Users, category: "system",
    // hideStatusNote ALWAYS: the classic panel bundles the status bar for
    // dashboard convenience, but widgets are building blocks — status entry
    // is its own widget, so the panel carries only the fronting feature.
    render: ({ api }) => (
      <CurrentFronters alters={api?.alters || []} hideStatusNote />
    ),
    supportsModes: ["normal"], supportsMultiInstance: false,
    defaultSpan: { cols: 6, rows: 4 }, minSpan: { cols: 3, rows: 2 }, maxSpan: { cols: 12, rows: 12 },
  },
  pinned_alters: {
    label: "Pinned {{alters}}", description: "Your pinned {{alters}}, as a gallery.",
    icon: Pin, category: "system",
    render: () => <PinnedAltersGallery showHeader={false} />,
    supportsModes: ["normal"], supportsMultiInstance: false,
    defaultSpan: { cols: 4, rows: 1 }, minSpan: { cols: 2, rows: 1 }, maxSpan: { cols: 12, rows: 4 },
  },
  sleep_controls: {
    label: "Sleep controls", description: "Start sleeping or wake up with one tap, with the running time.",
    icon: Moon, category: "tracking",
    render: () => <SleepControlWidget />,
    supportsModes: ["normal"], supportsMultiInstance: false,
    defaultSpan: { cols: 4, rows: 1 }, minSpan: { cols: 2, rows: 1 }, maxSpan: { cols: 12, rows: 3 },
  },
  breathing: {
    label: "Breathing", description: "The guided breathing animation, right on the page.",
    icon: Wind, category: "support",
    render: ({ settings, updateSettings, mode }) =>
      <BreathingWidget settings={settings} updateSettings={updateSettings} mode={mode} />,
    supportsModes: ["minimal", "normal", "expanded"], supportsMultiInstance: true,
    configFields: [
      { key: "pattern", type: "select", label: "Technique", default: "Box breathing",
        options: Object.keys(BREATHING_PATTERNS).map((k) => ({ value: k, label: k })) },
      { key: "autoRun", type: "toggle", label: "Always running (no start button)", default: false },
      { key: "pace", type: "select", label: "Pace", default: "1",
        options: [
          { value: "0.75", label: "Quicker" },
          { value: "1", label: "Normal" },
          { value: "1.25", label: "Gentler" },
          { value: "1.5", label: "Slow" },
          { value: "2", label: "Very slow" },
        ] },
    ],
    defaultSpan: { cols: 4, rows: 4 }, minSpan: { cols: 2, rows: 2 }, maxSpan: { cols: 12, rows: 8 },
  },
  plans: {
    label: "Plans", description: "What's scheduled over the coming days.",
    icon: CalendarDays, category: "activity",
    render: ({ settings }) => <PlansWidget settings={settings} />,
    supportsModes: ["normal"], supportsMultiInstance: true,
    configFields: [
      { key: "days", type: "number", label: "Days ahead", min: 1, max: 60, default: 7 },
      { key: "limit", type: "number", label: "How many to show", min: 1, max: 20, default: 8 },
    ],
    defaultSpan: { cols: 4, rows: 2 }, minSpan: { cols: 2, rows: 1 }, maxSpan: { cols: 12, rows: 8 },
  },
  recent_activities: {
    label: "Recent activities", description: "The most recently logged activities, with durations.",
    icon: BarChart2, category: "activity",
    render: ({ settings }) => <RecentActivitiesWidget settings={settings} />,
    supportsModes: ["normal"], supportsMultiInstance: true,
    configFields: [{ key: "limit", type: "number", label: "How many to show", min: 1, max: 20, default: 6 }],
    defaultSpan: { cols: 4, rows: 2 }, minSpan: { cols: 2, rows: 1 }, maxSpan: { cols: 12, rows: 8 },
  },
  quick_links: {
    label: "Quick links", description: "A tile of shortcuts you choose — build your own nav page.",
    icon: Link2, category: "nav",
    render: ({ settings, mode, api }) => <QuickLinksWidget settings={settings} mode={mode} api={api} />,
    supportsModes: ["minimal", "normal"], supportsMultiInstance: true,
    configFields: [
      { key: "appIds", type: "apps", label: "App pages" },
      { key: "links", type: "links", label: "Journals, {{alters}} & groups" },
    ],
    defaultSpan: { cols: 4, rows: 1 }, minSpan: { cols: 1, rows: 1 }, maxSpan: { cols: 12, rows: 6 },
  },
  polls: {
    label: "Polls", description: "The latest polls and their vote counts.",
    icon: Vote, category: "content",
    render: ({ settings }) => <PollsWidget settings={settings} />,
    supportsModes: ["normal"], supportsMultiInstance: true,
    configFields: [{ key: "limit", type: "number", label: "How many to show", min: 1, max: 12, default: 4 }],
    defaultSpan: { cols: 4, rows: 2 }, minSpan: { cols: 2, rows: 1 }, maxSpan: { cols: 12, rows: 6 },
  },
  chat_channel: {
    label: "Chat channel", description: "A {{system}}-chat channel you can read and send in, right here.",
    icon: MessageSquare, category: "content",
    render: ({ settings, updateSettings, api }) =>
      <ChatChannelWidget settings={settings} updateSettings={updateSettings} api={api} />,
    supportsModes: ["normal"], supportsMultiInstance: true,
    configFields: [
      { key: "channelId", type: "dynamicSelect", source: "chatChannels", label: "Channel" },
    ],
    defaultSpan: { cols: 6, rows: 4 }, minSpan: { cols: 3, rows: 3 }, maxSpan: { cols: 12, rows: 12 },
  },
  poll_results: {
    label: "Poll results", description: "One poll's live results as bars — pick which in the header.",
    icon: BarChart2, category: "content",
    render: ({ settings, updateSettings }) =>
      <PollResultsWidget settings={settings} updateSettings={updateSettings} />,
    supportsModes: ["normal"], supportsMultiInstance: true,
    configFields: [
      { key: "pollId", type: "dynamicSelect", source: "polls", label: "Poll" },
    ],
    defaultSpan: { cols: 4, rows: 2 }, minSpan: { cols: 2, rows: 2 }, maxSpan: { cols: 12, rows: 8 },
  },
  poll_new: {
    label: "New poll", description: "A button that opens the real poll composer.",
    icon: Vote, category: "content",
    render: ({ api }) => <PollComposerWidget api={api} />,
    supportsModes: ["normal"], supportsMultiInstance: false,
    defaultSpan: { cols: 4, rows: 1 }, minSpan: { cols: 2, rows: 1 }, maxSpan: { cols: 6, rows: 2 },
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
    configFields: [
      { key: "display", type: "select", label: "Display", default: "tile",
        options: [
          { value: "tile", label: "Tile" },
          { value: "card", label: "Card (colourful icon + name)" },
          { value: "plain", label: "Icon only" },
        ] },
    ],
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
