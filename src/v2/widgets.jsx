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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import QuickTaskComposer from "@/components/bulletin/QuickTaskComposer";
import MentionTextarea from "@/components/shared/MentionTextarea";
import PlannedActivitiesList from "@/components/activities/PlannedActivitiesList";
import PlanCompletionTracker from "@/components/activities/PlanCompletionTracker";
import { statusFor as statusForActivity } from "@/lib/activityStatus";
import { applyLogCommands } from "@/lib/logCommands";
import {
  Users, StickyNote, CalendarCheck, Timer, History, Heart, CheckSquare, PenLine,
  IdCard, Type, AlignLeft, Minus, MoveVertical, Rocket, BookOpen, ClipboardList, Smile, AlertTriangle, ListTodo,
  Moon, Megaphone, Bell, FolderOpen, ChevronLeft, ChevronRight, NotebookPen,
  Pin, Wind, Link2, Vote, CalendarDays, BarChart2, MessageSquare, Hash, Activity,
  CalendarRange, Grid2X2, CalendarClock, AlarmClock, ListChecks, GraduationCap, CheckCircle2, Music
, Map, MapPin
} from "lucide-react";
import { buildGridItems, findGridItem } from "@/lib/navCatalogue";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { AssetButton } from "@/components/shared/AssetPickerModal";
import DOMPurify from "dompurify";
import JournalEditorModal from "@/components/journal/JournalEditorModal";
import BulletinBoard from "@/components/bulletin/BulletinBoard";
import useFormDraft from "@/hooks/useFormDraft";
import CurrentFronters from "@/components/dashboard/CurrentFronters";
import BreathingExercise from "@/components/grounding/BreathingExercise";
import { BREATHING_PATTERNS } from "@/utils/groundingDefaults";
import { markGroundingTechniqueUsedToday } from "@/lib/dailyTaskSystem";
import { useFrontLevels, getSessionLevel, frontLevelLabel } from "@/lib/frontLevels";
import { useHoldDragLevel, commitFrontLevel, FrontLevelRail, useFrontGesture } from "@/components/fronting/FrontLevelRail";
import { AlterPanel } from "@/components/dashboard/CurrentFronters";
import AlterActionMenu from "@/components/alters/AlterActionMenu";
import { parseSessionEmotions, parseSessionSymptoms, parseSessionNote } from "@/lib/perAlterSessionEntries";
import { parsePreferences, PREF_LEVELS } from "@/lib/alterPreferences";
import { useAlterOrder } from "@/lib/alterOrder";
import TriggerEditModal from "@/components/fronting/TriggerEditModal";
import SwitchJournalModal from "@/components/journal/SwitchJournalModal";
import EmotionWheelPicker from "@/components/emotions/EmotionWheelPicker";
import SymptomsSection from "@/components/symptoms/SymptomsSection";
import DiarySection, { hasDiaryData } from "@/components/diary/DiarySection";
import EmotionAnalytics from "@/components/emotions/EmotionAnalytics";
import SymptomAnalytics from "@/components/analytics/SymptomAnalytics";
import { toggleFrontFor, removeFrontFor } from "@/hooks/useSwipeActions";
import { sheetPortalGuards } from "@/lib/sheetPortalGuards";
import useAnonymizeMode, { anonymizeBlurNames, anonymizeBlurAvatars } from "@/hooks/useAnonymizeMode";
import { getMemberAlters } from "@/lib/subsystemUtils";
import { endSymptomSessions } from "@/lib/symptomSessions";
import { contactDisplayName } from "@/lib/contacts";
import ProfileSongPlayer from "@/components/alters/ProfileSongPlayer";
import SleepEndModal from "@/components/sleep/SleepEndModal";
import UpcomingPlans from "@/components/dashboard/UpcomingPlans";
import { SymptomActionMenu } from "@/components/symptoms/CurrentSymptoms";
import { buildSubsystemItems } from "@/components/shared/AlterTreeSelect";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import ChannelView from "@/components/chat/ChannelView";
// Lazy: the Polls PAGE only enters the bundle when someone opens this
// modal — a static import dragged the whole page into the entry chunk.
const CreatePollModal = React.lazy(() => import("@/pages/Polls").then((m) => ({ default: m.CreatePollModal })));
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { getActiveActivities } from "@/lib/activitySession";
import { ActivityActionMenu } from "@/components/activities/CurrentActivities";
import { IconSlot } from "@/components/shared/LucideByName";
import { Section, Row, Muted, TextAction, Dot, boxStyle, WidgetModeContext, useWidgetMode, rowsForMode } from "@/v2/primitives";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription,
} from "@/components/ui/drawer";
import { useT } from "@/lib/i18n";
import { applyTerms } from "@/lib/dailyTaskSystem";
import {
  ActivityWeekWidget, ActivityDayWidget, ActivityDayViewWidget,
  ActivityMonthWidget, ActivityYearWidget,
} from "@/v2/activityWidgets";
import {
  TimelineWidget, DailySummaryWidget, CheckInLogWidget, DailyTasksWidget,
  ChatChannelsWidget, GroundingWidget, LearnWidget,
  InnerMapWidget, InnerLocationsWidget,
} from "@/v2/moreWidgets";
import { COMMAND_WIDGETS, CommandWidget } from "@/v2/commandWidgets";

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
    // One slot past the far end of the spectrum: remove from front.
    // One-way removeFrontFor — a non-fronter stays out (never a toggle).
    onRemove: (alterId) => {
      suppressTapUntil.current = Date.now() + 400;
      const alter = byId[alterId];
      if (alter) removeFrontFor(alter, base44, qc, toast, t);
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
  // Owner spec for the three display modes:
  //   minimal  — name + their colour, nothing else
  //   normal   — avatar, name, {fronting} status (level + elapsed)
  //   expanded — normal plus the extras each toggle allows: pronouns and
  //              this session's own feelings / symptoms / note
  const isMinimal = mode === "minimal";
  const isExpanded = mode === "expanded";
  const showAvatar = isMinimal ? false : (settings?.showAvatar !== false);
  const showStatus = !isMinimal;
  const showPronouns = isExpanded && settings?.showPronouns !== false;
  const showSessionBits = isExpanded && settings?.showSessionDetail !== false;

  // Switch tools, same as the classic Currently Fronting card: flag the
  // switch as triggered, or journal it. Both act on the LIVE sessions.
  const [triggerOpen, setTriggerOpen] = React.useState(false);
  const [journalFor, setJournalFor] = React.useState(null);
  const openJournal = async () => {
    try {
      const fresh = await base44.entities.FrontingSession.filter({ is_active: true });
      const lead = fresh.find((x) => x.is_primary) || fresh[0];
      setJournalFor({ sessionId: lead?.id || null, authorAlterId: lead?.alter_id || null });
    } catch { setJournalFor({ sessionId: null, authorAlterId: null }); }
  };

  return (
    <Section
      label={tr("widget.presence.title")}
      action={
        <span className="flex items-center gap-1.5">
          {fronters.length > 0 && (
            <>
              <button type="button" onClick={() => setTriggerOpen(true)}
                aria-label={applyTerms(tr("widget.presence.triggered"), t)}
                title={applyTerms(tr("widget.presence.triggered"), t)}
                className="text-muted-foreground hover:text-amber-500">
                <AlertTriangle className="w-3.5 h-3.5" />
              </button>
              <button type="button" onClick={openJournal}
                aria-label={applyTerms(tr("widget.presence.journal"), t)}
                title={applyTerms(tr("widget.presence.journal"), t)}
                className="text-muted-foreground hover:text-primary">
                <BookOpen className="w-3.5 h-3.5" />
              </button>
            </>
          )}
          <TextAction onClick={() => window.dispatchEvent(new CustomEvent("open-set-front"))}>{applyTerms(tr("common.switch"), t)}</TextAction>
        </span>
      }
    >
      {fronters.length === 0 && <Muted>{applyTerms(tr("widget.presence.empty"), t)}</Muted>}
      {fronters.map(({ s, alter }) => {
        const level = getSessionLevel(s, levelCfg);
        const secondary = isMinimal ? undefined : ([
          showPronouns ? alter.pronouns : null,
          showStatus && level ? frontLevelLabel(level, t) : null,
        ].filter(Boolean).join(" · ") || undefined);
        // Expanded rows summarise what this session already carries, so
        // "who's here" answers "and how are they doing" at a glance.
        const bits = showSessionBits ? [
          ...parseSessionEmotions(s.session_emotions).slice(0, 3),
          ...parseSessionSymptoms(s.session_symptoms).slice(0, 3).map((x) => x.label).filter(Boolean),
        ] : [];
        const noteText = showSessionBits ? (parseSessionNote(s.note).slice(-1)[0]?.text || "") : "";
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
          right={showStatus && s.start_time ? fmtElapsed(s.start_time) : undefined}
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
        {(bits.length > 0 || noteText) && (
          <div className="pl-6 -mt-0.5 space-y-0.5">
            {bits.length > 0 && (
              <p className="text-[0.6875em] text-muted-foreground truncate">{bits.join(" · ")}</p>
            )}
            {noteText && (
              <p className="text-[0.6875em] text-muted-foreground truncate">💬 {noteText}</p>
            )}
          </div>
        )}
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
        <AlterActionMenu alter={menuFor} activeSessions={sessions}
          session={sessions.find((s) => (s.alter_id || s.primary_alter_id) === menuFor.id)}
          onClose={() => setMenuFor(null)} />
      )}
      <TriggerEditModal open={triggerOpen} onClose={() => setTriggerOpen(false)} sessions={sessions} />
      {journalFor && (
        <SwitchJournalModal
          open
          onClose={() => setJournalFor(null)}
          sessionId={journalFor.sessionId}
          authorAlterId={journalFor.authorAlterId}
        />
      )}
    </Section>
  );
}

// ── Running right now ──────────────────────────────────────────────
function ActiveWidget({ api }) {
  const tr = useT();
  const navigate = useNavigate();
  const qc = useQueryClient();
  // Pressing a symptom row opens the SAME menu the classic pill opens
  // (severity / start time / note / end) — not a navigation.
  const [symptomMenu, setSymptomMenu] = React.useState(null);
  // Same for a running activity: its end/edit menu opens HERE (the classic
  // CurrentActivities menu), not the tracker page with the pill to find.
  const [activityMenu, setActivityMenu] = React.useState(null);
  const symptomSessions = useQuery({
    queryKey: ["symptomSessions", "active"],
    queryFn: () => base44.entities.SymptomSession.filter({ is_active: true }),
  }).data || [];
  const symptoms = useList("symptoms", "Symptom");
  const sleeps = useList("sleep", "Sleep");
  const activities = getActiveActivities();
  const encounters = useQuery({
    queryKey: ["contactEncounters", "active"],
    queryFn: () => base44.entities.ContactEncounter.filter({ is_active: true }),
  }).data || [];
  const contacts = useList("contacts", "Contact");
  // ~commands write outside react-query; their announcements keep this
  // widget honest without waiting for a refetch interval.
  React.useEffect(() => {
    const onSym = () => qc.invalidateQueries({ queryKey: ["symptomSessions", "active"] });
    const onEnc = () => qc.invalidateQueries({ queryKey: ["contactEncounters", "active"] });
    window.addEventListener("symphony-symptoms-changed", onSym);
    window.addEventListener("symphony-encounters-changed", onEnc);
    return () => {
      window.removeEventListener("symphony-symptoms-changed", onSym);
      window.removeEventListener("symphony-encounters-changed", onEnc);
    };
  }, [qc]);
  const symById = React.useMemo(() => Object.fromEntries(symptoms.map((s) => [s.id, s])), [symptoms]);
  const contactById = React.useMemo(() => Object.fromEntries(contacts.map((c) => [c.id, c])), [contacts]);
  const activeSleep = sleeps.find((s) => s.bedtime && !s.wake_time);
  const nothing = activities.length === 0 && symptomSessions.length === 0 && !activeSleep && encounters.length === 0;

  return (
    <Section label={tr("widget.active.label")}>
      {nothing && <Muted>{tr("widget.active.empty")}</Muted>}
      {activities.map((a) => (
        <Row key={a.id}
          left={<Dot color={a.color || "var(--v2-accent)"} />}
          primary={a.name || tr("widget.active.activity")}
          secondary={a.notes || undefined}
          right={a.startTime ? fmtElapsed(a.startTime) : undefined}
          onClick={() => setActivityMenu(a)} />
      ))}
      {activityMenu && <ActivityActionMenu activity={activityMenu} onClose={() => setActivityMenu(null)} />}
      {symptomSessions.map((s) => {
        const def = symById[s.symptom_id || s.symptom_definition_id];
        if (!def) return null;
        const snaps = s.severity_snapshots || [];
        const sev = snaps.length ? snaps[snaps.length - 1]?.severity : null;
        return (
          <Row key={s.id} left={<Dot color={def.color || "#a78bfa"} />} primary={`${def.label || def.name}${sev != null ? ` · ${sev}` : ""}`}
            secondary={s.start_time ? fmtElapsed(s.start_time) : undefined}
            right={
              <button type="button"
                onClick={async (e) => {
                  e.stopPropagation();
                  // Ends every active session for this symptom, duplicates
                  // included (the "it came back after refresh" bug).
                  await endSymptomSessions(s.symptom_id || s.symptom_definition_id);
                  qc.invalidateQueries({ queryKey: ["symptomSessions"] });
                  toast.success(`${def.label || def.name} ended`);
                }}
                className="text-[0.625em] px-1.5 py-0.5 border border-border/60 hover:border-primary/60"
                style={{ borderRadius: "var(--v2-radius, 8px)" }}>
                {tr("widget.active.end")}
              </button>
            }
            onClick={() => setSymptomMenu({ sess: s, symptom: { ...def, label: def.label || def.name } })} />
        );
      })}
      {encounters.map((enc) => {
        const ct = contactById[enc.contact_id];
        return (
          <Row key={enc.id} left={<Dot color="#34d399" />}
            primary={`with ${ct ? contactDisplayName(ct) : "someone"}`}
            secondary={enc.start_time ? fmtElapsed(enc.start_time) : undefined}
            right={
              <button type="button"
                onClick={async (e) => {
                  e.stopPropagation();
                  const { endEncounter } = await import("@/lib/contactEncounters");
                  await endEncounter(enc.id, new Date().toISOString());
                  qc.invalidateQueries({ queryKey: ["contactEncounters", "active"] });
                  try { window.dispatchEvent(new Event("symphony-encounters-changed")); } catch { /* SSR */ }
                }}
                className="text-[0.625em] px-1.5 py-0.5 border border-border/60 hover:border-primary/60"
                style={{ borderRadius: "var(--v2-radius, 8px)" }}>
                {tr("widget.active.end")}
              </button>
            }
            onClick={() => navigate(`/contacts/${enc.contact_id}`)} />
        );
      })}
      {activeSleep && (
        <Row left={<Dot color="#6a7bd6" />} primary={tr("widget.active.sleep")} right={fmtElapsed(activeSleep.bedtime)}
          onClick={() => navigate("/sleep")} />
      )}
      {symptomMenu && (
        <SymptomActionMenu sess={symptomMenu.sess} symptom={symptomMenu.symptom}
          onClose={() => setSymptomMenu(null)} />
      )}
    </Section>
  );
}

// ── Today ──────────────────────────────────────────────────────────
// Tap the Today widget → add something for today: a NEW task (the same
// quick composer the Add key uses, due today) or pick from the to-do list
// (sets its due date to today). Hosted in the widget so it works on the
// v2 board, not only the classic dashboard.
function TodayAddSheet({ open, onClose }) {
  const tr = useT();
  const qc = useQueryClient();
  const [tab, setTab] = React.useState("new");
  const [q, setQ] = React.useState("");
  const tasks = useList("tasks", "Task");
  const todayKey = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })();
  const { data: activeSessions = [] } = useQuery({ queryKey: ["activeFront"], queryFn: () => base44.entities.FrontingSession.filter({ is_active: true }) });
  const frontingAlterIds = activeSessions.map((s) => s.alter_id).filter(Boolean);
  const candidates = tasks
    .filter((t) => !t.completed && !(t.due_date && sameDay(t.due_date, Date.now())))
    .filter((t) => (t.title || "").toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (a.title || "").localeCompare(b.title || ""));
  const addToToday = async (t) => {
    try {
      await base44.entities.Task.update(t.id, { due_date: new Date(`${todayKey}T12:00:00`).toISOString() });
      qc.invalidateQueries({ queryKey: ["tasks"] });
    } catch { /* non-fatal */ }
  };
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{tr("widget.today.addTitle")}</DialogTitle></DialogHeader>
        <div className="flex gap-1 bg-muted/50 rounded-lg p-1" role="tablist">
          {[["new", tr("widget.today.addNew")], ["list", tr("widget.today.addFromList")]].map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
              className={`flex-1 text-sm py-1.5 rounded-md ${tab === id ? "bg-background shadow-sm font-medium" : "text-muted-foreground"}`}>{label}</button>
          ))}
        </div>
        {tab === "new" ? (
          <QuickTaskComposer frontingAlterIds={frontingAlterIds} initialDueDate={todayKey} hideCancelButton onSaved={onClose} />
        ) : (
          <div className="space-y-1.5">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("widget.today.searchTasks")}
              className="w-full h-9 px-2 rounded-lg border border-input bg-background text-sm" />
            <div className="max-h-64 overflow-y-auto space-y-1 overscroll-contain">
              {candidates.length === 0 && <Muted>{tr("widget.today.noTasks")}</Muted>}
              {candidates.map((t) => (
                <button key={t.id} type="button" onClick={() => addToToday(t)}
                  className="w-full flex items-center gap-2 px-2 py-2 rounded-lg border border-border/40 text-left text-sm hover:bg-muted/30">
                  <CheckSquare className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <span className="flex-1 truncate">{t.title}</span>
                  <span className="text-xs" style={{ color: "var(--v2-accent)" }}>{tr("widget.today.addBtn")}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TodayWidget() {
  const tr = useT();
  const navigate = useNavigate();
  const now = Date.now();
  const [addOpen, setAddOpen] = React.useState(false);
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
    <Section label={tr("widget.today.label")}
      action={<span className="flex items-center gap-2">
        <TextAction onClick={() => setAddOpen(true)}>+ {tr("widget.today.addBtn")}</TextAction>
        <TextAction onClick={() => navigate("/activities")}>{tr("widget.today.open")}</TextAction>
      </span>}>
      <TodayAddSheet open={addOpen} onClose={() => setAddOpen(false)} />
      {plans.length === 0 && due.length === 0 && (
        <button type="button" onClick={() => setAddOpen(true)} className="text-left w-full">
          <Muted>{tr("widget.today.empty")} — {tr("widget.today.tapToAdd")}</Muted>
        </button>
      )}
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
  const alters = useList("alters", "Alter");
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
      // Same pipeline as the classic status card: inline ~commands run
      // (plain-label tokens — statuses render as plain text).
      const { content: note } = await applyLogCommands(text, { chips: false });
      await base44.entities.StatusNote.create({ timestamp: new Date().toISOString(), note });
      qc.invalidateQueries({ queryKey: ["statusNotes"] });
      setDraft("");
    } catch (e) {
      // A malformed ~command blocks the save with a fixable message — the
      // draft stays in the box.
      toast.error(e?.message || "Couldn't save");
    } finally { setSaving(false); }
  };

  return (
    <Section label={tr("widget.status.label")} action={<TextAction onClick={() => navigate("/checkin-log")}>{tr("widget.status.log")}</TextAction>}>
      {latest
        ? <Row primary={latest.note} right={fmtTime(latest.timestamp)}
            onClick={() => navigate(`/timeline?highlightStatus=${latest.id}`)} />
        : <Muted>{tr("widget.status.empty")}</Muted>}
      <div className="flex items-center gap-1.5 pt-0.5">
        <div className="flex-1 min-w-0">
          {/* @mentions and ~commands, exactly like the classic status box. */}
          <MentionTextarea
            value={draft}
            onChange={setDraft}
            alters={alters}
            rows={1}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); save(); } }}
            placeholder={tr("widget.status.placeholder")}
            className="w-full min-w-0 px-2 py-1.5 text-sm bg-background border border-input focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            style={{ borderRadius: "var(--v2-radius, 8px)" }}
          />
        </div>
        <TextAction onClick={save}>{tr("widget.status.save")}</TextAction>
      </div>
    </Section>
  );
}

// ── Recent captures ────────────────────────────────────────────────
function RecentWidget({ settings }) {
  const tr = useT();
  const navigate = useNavigate();
  const limit = rowsForMode(useWidgetMode(), Math.max(1, Math.min(10, parseInt(settings?.limit, 10) || 4)));
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
        <AssetButton onPick={setAvatar} title={tr("widget.identity.changePicture")} allowFolders
          className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full border border-border bg-background flex items-center justify-center" />
      </span>
    )
    : (
      <AssetButton onPick={setAvatar} title={tr("widget.identity.addPicture")} allowFolders
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
          <IconSlot override={{ iconName: settings?.iconName }} Default={Icon} className="w-5 h-5" />
        </span>
      : <span className="w-9 h-9 flex items-center justify-center"
          style={{ borderRadius: "var(--v2-radius)", border: "var(--v2-border-w) solid color-mix(in srgb, var(--v2-accent) 40%, transparent)" }}>
          <IconSlot override={{ iconName: settings?.iconName }} Default={Icon} className="w-4 h-4" />
        </span>;
  return (
    <button type="button" onClick={() => navigate(item.path)} title={label}
      className="w-full h-full min-h-[52px] flex flex-col items-center justify-center gap-1 py-1.5 hover:bg-muted/40"
      // The tile is this widget's visible box (widget contract).
      style={boxStyle({ borderFallback: false })}>
      {iconEl}
      {display !== "plain" && mode !== "minimal" && (
        <span className="os-tile-label text-[0.625em] text-center leading-tight text-muted-foreground line-clamp-2 px-0.5">{label}</span>
      )}
    </button>
  );
}

// ── Content lists ──────────────────────────────────────────────────
function AltersListWidget({ settings, api, mode }) {
  const tr = useT();
  const t = useTerms();
  const navigate = useNavigate();
  const formatAlter = useAlterLabel();
  const groups = useList("groups", "Group");
  const alters = api?.alters || [];
  // 0 / empty = everyone. The widget scrolls, so a cap is a choice — not
  // something the widget quietly imposes (it used to stop at six).
  const capRaw = parseInt(settings?.limit, 10);
  const limit = Number.isFinite(capRaw) && capRaw > 0 ? capRaw : Infinity;
  // Ordering is the user's call (owner request): what to sort by, which
  // direction, and whether to break the list into their groups /
  // subsystems or keep it flat.
  const sort = settings?.sort || "name";
  const reverse = !!settings?.reverse;
  const arrangement = settings?.arrangement || "flat";
  const group = settings?.groupId ? groups.find((g) => g.id === settings.groupId) : null;
  const isExpanded = mode === "expanded";

  const { data: sessions = [] } = useQuery({
    queryKey: ["activeFront"],
    queryFn: () => base44.entities.FrontingSession.filter({ is_active: true }),
  });
  const { entries: globalOrderEntries } = useAlterOrder();
  const sessionFor = (id) => sessions.find((x) => (x.alter_id || x.primary_alter_id) === id);
  const frontingIds = React.useMemo(
    () => new Set(sessions.map((x) => x.alter_id || x.primary_alter_id).filter(Boolean)),
    [sessions]
  );
  // Same gesture grammar as everywhere else: tap opens the profile, press and
  // hold brings up the level rail (with the Remove stop). Holding someone who
  // isn't here adds them at the level you release on.
  const gesture = useFrontGesture();
  // Fronting frequency needs history, and only when that sort is chosen.
  const { data: allSessions = [] } = useQuery({
    queryKey: ["frontSessionsAll"],
    queryFn: () => base44.entities.FrontingSession.filter({}),
    enabled: sort === "front_time" || sort === "front_count",
    staleTime: 60000,
  });
  const frontStats = React.useMemo(() => {
    const stat = {};
    for (const x of allSessions) {
      const ids = x.alter_id ? [x.alter_id] : [x.primary_alter_id, ...(x.co_fronter_ids || [])].filter(Boolean);
      const ms = x.start_time && x.end_time ? new Date(x.end_time) - new Date(x.start_time) : 0;
      for (const id of ids) {
        if (!stat[id]) stat[id] = { ms: 0, count: 0 };
        stat[id].ms += ms;
        stat[id].count += 1;
      }
    }
    return stat;
  }, [allSessions]);

  const sortAlters = React.useCallback((pool) => {
    const cmp = {
      name: (a, b) => (formatAlter(a) || "").localeCompare(formatAlter(b) || ""),
      recent: (a, b) => new Date(b.updated_date || b.created_date || 0) - new Date(a.updated_date || a.created_date || 0),
      front_time: (a, b) => (frontStats[b.id]?.ms || 0) - (frontStats[a.id]?.ms || 0),
      front_count: (a, b) => (frontStats[b.id]?.count || 0) - (frontStats[a.id]?.count || 0),
      created: (a, b) => new Date(a.created_date || 0) - new Date(b.created_date || 0),
      role: (a, b) => (a.role || "~").localeCompare(b.role || "~"),
    }[sort] || ((a, b) => (formatAlter(a) || "").localeCompare(formatAlter(b) || ""));
    const out = [...pool].sort(cmp);
    if (reverse) out.reverse();
    // Presence outranks arrangement: whoever is here right now floats to the
    // top of whatever order was chosen (including after a reverse), so the
    // list always answers "who's around" before "how did I sort this".
    if (!frontingIds?.size) return out;
    return [
      ...out.filter((a) => frontingIds.has(a.id)),
      ...out.filter((a) => !frontingIds.has(a.id)),
    ];
  }, [sort, reverse, frontStats, formatAlter, frontingIds]);

  // Flat → one sorted list. Grouped → a section per group/subsystem the
  // user has, with anyone ungrouped gathered at the end.
  const sections = React.useMemo(() => {
    const pool = (group ? getMemberAlters(group, alters) : alters).filter((a) => !a.is_archived);

    // Custom: the user's own hand-placed order — each entry is either one
    // {alter} or a whole group/subsystem, rendered exactly where they put
    // it. Consecutive loose {alters} share one unlabelled section so the
    // list reads as a single run rather than a stack of one-row groups.
    if (arrangement === "custom") {
      // The widget can carry its own order; with none set it follows the
      // system-wide arrangement (Settings → {Alter} setup) so the board
      // matches every other list by default.
      const own = Array.isArray(settings?.customOrder) ? settings.customOrder : [];
      const order = own.length ? own : globalOrderEntries;
      const byId = Object.fromEntries(pool.map((a) => [a.id, a]));
      const out = [];
      const placed = new Set();
      for (const entry of order) {
        if (entry?.type === "alter") {
          const a = byId[entry.id];
          if (!a || placed.has(a.id)) continue;
          placed.add(a.id);
          const last = out[out.length - 1];
          if (last && last.id.startsWith("_loose")) last.items.push(a);
          else out.push({ id: `_loose${out.length}`, label: null, items: [a] });
        } else if (entry?.type === "group") {
          const g = groups.find((x) => x.id === entry.id);
          if (!g) continue;
          const members = getMemberAlters(g, pool).filter((m) => !placed.has(m.id));
          if (members.length === 0) continue;
          members.forEach((m) => placed.add(m.id));
          out.push({ id: g.id, label: g.name || "Group", items: sortAlters(members) });
        }
      }
      // Anyone the user didn't place can follow (or not — their call).
      if (settings?.customRest !== false) {
        const rest = pool.filter((a) => !placed.has(a.id));
        if (rest.length) out.push({ id: "_rest", label: applyTerms(tr("widget.alters.ungrouped"), t), items: sortAlters(rest) });
      }
      let left = limit;
      return out.map((sec) => {
        const items = sec.items.slice(0, Math.max(0, left));
        left -= items.length;
        return { ...sec, items };
      }).filter((sec) => sec.items.length > 0);
    }

    // grouped renders through the tree path below, not sections.
    return [{ id: "_all", label: null, items: sortAlters(pool).slice(0, limit) }];
  }, [alters, groups, group, arrangement, sortAlters, limit, tr, t, settings?.customOrder, settings?.customRest, globalOrderEntries]);

  // "Group / subsystem tree": the SAME nested structure as the house alter
  // tree (buildSubsystemItems) — top-level {alters} with the subsystems they
  // own folded beneath them, expandable — instead of a flat run of
  // group-labelled sections that read as separate lists.
  const [treeOpen, setTreeOpen] = React.useState(() => new Set());
  const treeItems = React.useMemo(() => {
    if (arrangement !== "grouped" || group) return null;
    const pool = alters.filter((a) => !a.is_archived);
    return buildSubsystemItems(sortAlters(pool), groups, treeOpen);
  }, [arrangement, group, alters, groups, sortAlters, treeOpen]);
  const toggleTree = (id) => setTreeOpen((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const total = sections.reduce((n, sec) => n + sec.items.length, 0);

  return (
    <Section label={group ? group.name : applyTerms(tr("widget.alters.label"), t)}
      action={<TextAction onClick={() => navigate("/Home")}>{tr("widget.today.open")}</TextAction>}>
      {gesture.node}
      {total === 0 && !treeItems && <Muted>{applyTerms(tr("widget.alters.empty"), t)}</Muted>}
      {treeItems && treeItems.length === 0 && <Muted>{applyTerms(tr("widget.alters.empty"), t)}</Muted>}
      {treeItems && treeItems.map((item, i) => {
        if (item.type === "group") {
          const open = treeOpen.has(item.group.id);
          return (
            <button key={`g-${item.group.id}-${i}`} type="button" onClick={() => toggleTree(item.group.id)}
              className="w-full flex items-center gap-1.5 py-1 text-left"
              style={{ paddingLeft: item.depth * 14 }}>
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 transition-transform"
                style={{ transform: open ? "rotate(90deg)" : "none" }} />
              <span className="text-[0.6875em] font-semibold uppercase tracking-wide truncate"
                style={{ color: item.group.color || undefined }}>{item.group.name}</span>
              <span className="text-[0.625em] text-muted-foreground">{item.members?.length ?? ""}</span>
            </button>
          );
        }
        const a = item.alter;
        const session = sessionFor(a.id);
        return (
          <div key={`a-${a.id}-${i}`} style={{ paddingLeft: item.depth * 14 }}>
            {isExpanded
              ? <ExpandedAlterRow alter={a} session={session} t={t} formatAlter={formatAlter}
                  holdProps={gesture.getHoldProps(a, session?.front_level)}
                  onOpen={() => { if (!gesture.suppressed()) navigate(`/alter/${a.id}`); }} />
              : <Row left={<Dot color={a.color} ring={!!session} />} primary={formatAlter(a)}
                  right={a.role || undefined}
                  holdProps={gesture.getHoldProps(a, session?.front_level)}
                  onClick={() => { if (!gesture.suppressed()) navigate(`/alter/${a.id}`); }} />}
          </div>
        );
      })}
      {!treeItems && sections.map((sec) => (
        <React.Fragment key={sec.id}>
          {sec.label && (
            <p className="text-[0.625em] font-semibold uppercase tracking-wide text-muted-foreground pt-1">{sec.label}</p>
          )}
          {sec.items.map((a) => {
            const session = sessionFor(a.id);
            if (!isExpanded) {
              return (
                <Row key={a.id} left={<Dot color={a.color} ring={!!session} />} primary={formatAlter(a)}
                  right={a.role || undefined}
                  holdProps={gesture.getHoldProps(a, session?.front_level)}
                  onClick={() => { if (!gesture.suppressed()) navigate(`/alter/${a.id}`); }} />
              );
            }
            return <ExpandedAlterRow key={a.id} alter={a} session={session} t={t} formatAlter={formatAlter}
              holdProps={gesture.getHoldProps(a, session?.front_level)}
              onOpen={() => { if (!gesture.suppressed()) navigate(`/alter/${a.id}`); }} />;
          })}
        </React.Fragment>
      ))}
    </Section>
  );
}

// Expanded alters-list row: avatar, emoji + name (alias per the label
// mode), role, pronouns/preferences, and whatever this {alter} has going
// right now (level, feelings, symptoms, note) when they're {fronting}.
function ExpandedAlterRow({ alter, session, onOpen, t, formatAlter, holdProps }) {
  const resolved = useResolvedAvatarUrl(alter.avatar_url);
  const levelCfg = useFrontLevels();
  const level = session ? getSessionLevel(session, levelCfg) : null;
  const prefs = React.useMemo(() => parsePreferences(alter), [alter]);
  const prefChips = prefs.filter((p) => p.level >= 4 || p.level === 1).slice(0, 4);
  const bits = session ? [
    ...parseSessionEmotions(session.session_emotions).slice(0, 3),
    ...parseSessionSymptoms(session.session_symptoms).slice(0, 2).map((x) => x.label).filter(Boolean),
  ] : [];
  const note = session ? (parseSessionNote(session.note).slice(-1)[0]?.text || "") : "";
  return (
    <button type="button" onClick={onOpen} {...(holdProps || {})}
      className="w-full flex items-start gap-2 text-left rounded-lg px-1 py-1 hover:bg-muted/40">
      <span className="w-9 h-9 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center mt-0.5"
        style={{
          backgroundColor: alter.color || "hsl(var(--muted))",
          boxShadow: session ? `0 0 0 2px color-mix(in srgb, ${alter.color || "var(--v2-accent)"} 55%, transparent)` : undefined,
        }}>
        {resolved ? <img src={resolved} alt="" className="w-full h-full object-cover" /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-1.5 min-w-0">
          <span className="text-sm truncate">
            {alter.emoji ? `${alter.emoji} ` : ""}{formatAlter(alter)}
          </span>
          {alter.role && <span className="text-[0.6875em] text-muted-foreground truncate">{alter.role}</span>}
        </span>
        {(alter.pronouns || level) && (
          <span className="block text-[0.6875em] text-muted-foreground truncate">
            {[alter.pronouns, level ? frontLevelLabel(level, t) : null].filter(Boolean).join(" · ")}
          </span>
        )}
        {prefChips.length > 0 && (
          <span className="flex flex-wrap gap-1 mt-0.5">
            {prefChips.map((p) => (
              <span key={p.id} className="text-[0.625em] px-1.5 py-0.5 rounded-full border"
                style={{ borderColor: `${PREF_LEVELS[p.level].color}55`, color: PREF_LEVELS[p.level].color }}>
                {PREF_LEVELS[p.level].emoji} {p.label}
              </span>
            ))}
          </span>
        )}
        {bits.length > 0 && <span className="block text-[0.6875em] text-muted-foreground truncate">{bits.join(" · ")}</span>}
        {note && <span className="block text-[0.6875em] text-muted-foreground truncate">💬 {note}</span>}
      </span>
    </button>
  );
}

function JournalWidget({ settings }) {
  const tr = useT();
  const navigate = useNavigate();
  const entries = useList("journalEntries", "JournalEntry");
  const limit = rowsForMode(useWidgetMode(), parseInt(settings?.limit, 10) || 4);
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
  // 0 / empty = everyone. The widget scrolls, so a cap is a choice — not
  // something the widget quietly imposes (it used to stop at six).
  const capRaw = parseInt(settings?.limit, 10);
  const limit = Number.isFinite(capRaw) && capRaw > 0 ? capRaw : Infinity;
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
  const limit = rowsForMode(useWidgetMode(), parseInt(settings?.limit, 10) || 4);
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
  const limit = rowsForMode(useWidgetMode(), parseInt(settings?.limit, 10) || 4);
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
          <span className="os-tile-label text-[0.625em] text-center leading-tight text-muted-foreground line-clamp-2 px-0.5">
            {label}
          </span>
        )}
      </button>

      <Drawer open={open} onOpenChange={(v) => { if (!v) setOpen(false); }}>
        <DrawerContent className="max-h-[70vh]" {...sheetPortalGuards}>
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
                  <span className="os-tile-label text-[0.625em] text-center leading-tight text-muted-foreground line-clamp-2">
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
const WysiwygEditorLazy = React.lazy(() => import("@/components/shared/WysiwygEditor"));

function NotebookWidget({ settings, updateSettings, instanceId }) {
  const notebookAlters = useList("alters", "Alter");
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
      {/* The page itself: grows with the widget, scrolls when it outgrows it.
          "Formatting & images" (widget config) swaps in the journal's own
          rich editor — the SAME WysiwygEditor + MiniToolbar the journal
          page uses, so images, colours and headings work identically. */}
      {settings?.rich ? (
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          <React.Suspense fallback={<Muted>…</Muted>}>
            <WysiwygEditorLazy value={text} onChange={setText} placeholder={tr("widget.notebook.placeholder")} floatingToolbar />
          </React.Suspense>
        </div>
      ) : (
      <MentionTextarea
        value={text}
        onChange={setText}
        alters={notebookAlters}
        commands={false}
        placeholder={tr("widget.notebook.placeholder")}
        className="w-full flex-1 min-h-[72px] px-2 py-1 text-sm bg-transparent border-0 resize-none focus:outline-none leading-relaxed"
      />
      )}
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
// Start sleeping / wake up, right on the page — running the SAME flow the
// Sleep page runs, not a shortcut version of it.
//
// Ending used to just stamp wake_time straight onto the record. That
// skipped everything the Sleep page's End modal does: quality, notes,
// interruptions, whether you dreamed, saving a dream to the journal, and
// the linked Sleep activity that mirrors the record into the tracker. So a
// night ended from the widget was a bare pair of timestamps, and the
// details were gone with no way to add them.
function SleepControlWidget() {
  const tr = useT();
  const qc = useQueryClient();
  const sleeps = useList("sleep", "Sleep");
  const [busy, setBusy] = React.useState(false);
  const [ending, setEnding] = React.useState(null);
  const active = sleeps.find((x) => x.bedtime && !x.wake_time);

  const act = async () => {
    if (busy) return;
    // Waking up opens the full entry, exactly like the Sleep page.
    if (active) { setEnding(active); return; }
    setBusy(true);
    try {
      // `date` is how the Sleep tracker files a record under a day —
      // records without it are invisible there (owner bug, 2026-08-06).
      const d = new Date();
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      await base44.entities.Sleep.create({ date: dateStr, bedtime: d.toISOString() });
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
      {/* Same modal the Sleep page uses — it owns the writes (dream journal
          entry, linked activity), so there's one place that knows how a
          night is finished. It portals to the body, so the v2 board's
          transform can't strand it. */}
      <SleepEndModal
        isOpen={!!ending}
        sleep={ending}
        onClose={() => setEnding(null)}
        onSave={() => {
          setEnding(null);
          qc.invalidateQueries({ queryKey: ["sleep"] });
          qc.invalidateQueries({ queryKey: ["activities"] });
          qc.invalidateQueries({ queryKey: ["journalEntries"] });
          toast.success("✅ Sleep logged!");
        }}
      />
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
  // null until measured — the exercise must never mount against the
  // placeholder, because settling to the real size milliseconds later is
  // indistinguishable from a resize and always corrupts the first breath.
  const [box, setBox] = React.useState(null);
  const [running, setRunning] = React.useState(!!settings?.autoRun);
  React.useEffect(() => { setRunning(!!settings?.autoRun); }, [settings?.autoRun]);
  // useLayoutEffect: the first measurement must land BEFORE first paint —
  // with a plain effect the circle's opening frame sized itself to the
  // 200px placeholder, overflowed the tile, then slowly shrank to fit
  // (which read as a phantom exhale on the first inhale step).
  React.useLayoutEffect(() => {
    const node = boxRef.current;
    if (!node) return undefined;
    const measure = () => {
      const w = node.offsetWidth, h = node.offsetHeight;
      if (w && h) setBox({ w, h });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  const pattern = BREATHING_PATTERNS[settings?.pattern] ? settings.pattern : "Box breathing";
  const showChips = mode !== "minimal";
  // The measured box IS the space left for the circle: the pattern picker
  // and caption sit outside it as fixed-height rows, so nothing below the
  // circle can be pushed past the widget's edge and clipped.
  // The step label under the circle is a fixed ~2.4em block (so it can't
  // bounce the circle); reserve it here so circle + label always fit.
  const labelH = 36;
  const maxSize = box
    ? Math.round(Math.max(56, Math.min(box.w - 8, box.h - labelH - 8, 260)))
    : null;

  return (
    // Section is this widget's visible box (widget contract) — without it,
    // border / background / shadow / padding looks had nothing to paint on.
    <Section>
    <div className="h-full w-full min-h-0 flex flex-col items-center gap-1.5">
    <div ref={boxRef} className="flex-1 min-h-0 w-full flex items-center justify-center">
      {maxSize !== null && (
      <BreathingExercise
        key={`${pattern}_${running}`}
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
      )}
      </div>
      {showChips && (
        <div className="flex-shrink-0 w-full" style={{ maxWidth: Math.max(120, (box?.w ?? 200) - 4) }}>
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
        <p className="flex-shrink-0 text-[0.625em] text-muted-foreground">{BREATHING_PATTERNS[pattern].pattern}</p>
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
  const alters = useList("alters", "Alter");
  const days = parseInt(settings?.days, 10) || 7;
  const limit = rowsForMode(useWidgetMode(), parseInt(settings?.limit, 10) || 8);
  const now = Date.now();
  // The SAME renderer the classic "Coming up" uses (PlannedActivitiesList)
  // — critical ⚡ pins, relative times, who/where, recurrence-aware rows.
  // The old hand-rolled list checked `a.status === "scheduled"` directly,
  // which dropped every legacy plan whose status is derived (statusFor) —
  // that was "the plans widget displays way less".
  const upcoming = activities.filter((a) => {
    if (statusForActivity(a) !== "scheduled" || !a.timestamp) return false;
    const ts = new Date(a.timestamp).getTime();
    return ts > now - 3600000 && ts < now + days * 86400000;
  });
  return (
    <Section label={tr("widget.plans.label")}
      action={<TextAction onClick={() => navigate("/activities?tab=planned")}>{tr("widget.today.open")}</TextAction>}>
      {upcoming.length === 0 && <Muted>{tr("widget.plans.empty")}</Muted>}
      {upcoming.length > 0 && (
        <PlannedActivitiesList
          activities={upcoming}
          alters={alters}
          compact
          limit={limit}
          onClick={(activity) => navigate(activity?.id ? `/activities?activityId=${activity.id}` : "/activities")}
        />
      )}
    </Section>
  );
}

// ── Recent activities ──────────────────────────────────────────────
function RecentActivitiesWidget({ settings }) {
  const tr = useT();
  const navigate = useNavigate();
  const activities = useList("activities", "Activity");
  // 0 / empty = everyone. The widget scrolls, so a cap is a choice — not
  // something the widget quietly imposes (it used to stop at six).
  const capRaw = parseInt(settings?.limit, 10);
  const limit = Number.isFinite(capRaw) && capRaw > 0 ? capRaw : Infinity;
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
        <span className="os-tile-label text-[0.625em] text-center leading-tight text-muted-foreground line-clamp-2">
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
        <span className="os-tile-label text-[0.625em] text-center leading-tight text-muted-foreground line-clamp-2">{label}</span>
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
  const limit = rowsForMode(useWidgetMode(), parseInt(settings?.limit, 10) || 4);
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
        <React.Suspense fallback={null}>
          <CreatePollModal open onClose={() => setOpen(false)}
            alters={(api?.alters || []).filter((a) => !a.is_archived)} />
        </React.Suspense>
      )}
    </Section>
  );
}


// House picker rules apply INSIDE widgets too: anything with an unbounded
// option list (journals, groups, boards) is searchable and scrollable —
// never a wrap of pills that becomes unnavigable in a large system.
// Option rows can carry identity: `color` draws the dot, `avatarUrl` draws
// the picture over it (resolved per row — local-image URLs need the hook).
function MultiListRowIcon({ option }) {
  const resolved = useResolvedAvatarUrl(option.avatarUrl || null);
  if (!option.color && !option.avatarUrl) return null;
  return (
    <span className="w-5 h-5 rounded-full overflow-hidden flex-shrink-0"
      style={{ backgroundColor: option.color || "hsl(var(--muted))" }}>
      {resolved ? <img src={resolved} alt="" className="w-full h-full object-cover" /> : null}
    </span>
  );
}

// `sections` (optional) renders the list under the user's own group /
// subsystem headings, indented by nesting depth. Searching flattens back to
// `options` — when you're typing a name you want to find it, not navigate
// to it (same behaviour as the groups manager).
export function SearchableMultiList({ options, selectedIds, onToggle, searchPlaceholder, sections }) {
  const [q, setQ] = React.useState("");
  const needle = q.trim().toLowerCase();
  const shown = needle ? options.filter((o) => o.label.toLowerCase().includes(needle)) : options;
  const renderRow = (o) => {
    const on = selectedIds.includes(o.id);
    return (
      <button key={o.id} type="button" onClick={() => onToggle(o.id)}
        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg border text-left text-xs ${
          on ? "border-primary/60 bg-primary/10" : "border-transparent hover:bg-muted/40"
        }`}>
        <MultiListRowIcon option={o} />
        <span className="flex-1 truncate">{o.label}</span>
        {on && <span className="flex-shrink-0" style={{ color: "var(--v2-accent)" }}>✓</span>}
      </button>
    );
  };
  return (
    <div className="space-y-1 pb-1">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchPlaceholder}
        className="w-full h-8 px-2 rounded-lg border border-input bg-background text-xs focus:outline-none focus:ring-1 focus:ring-ring" />
      <div className="max-h-40 overflow-y-auto overscroll-contain space-y-0.5">
        {sections && !needle
          ? sections.map((sec) => (
              <React.Fragment key={sec.id}>
                {sec.label && (
                  <p className="text-[0.625em] font-semibold uppercase tracking-wide truncate pt-1"
                    style={{ paddingLeft: (sec.depth || 0) * 10, color: sec.color || "var(--v2-text-muted, hsl(var(--muted-foreground)))" }}>
                    {sec.label}
                  </p>
                )}
                {sec.options.map(renderRow)}
              </React.Fragment>
            ))
          : shown.map(renderRow)}
      </div>
    </div>
  );
}


// ── Pinned alters (v2-native) ──────────────────────────────────────
// Built fresh for the widget board (owner call: don't adapt the classic
// gallery, which never resized with its box). A row of avatars that
// scales PROPORTIONALLY with the widget: the box is measured and the
// avatar diameter follows its height. No scroll-lock and no swipe
// gestures — set-front is the new hold gesture (hold an avatar → the
// level spectrum with its Remove stop; holding a non-fronter adds them
// at the picked level; with levels off, hold simply toggles front).
// Tap = profile · double-tap = the action menu. Widget contract: Section
// is the visible box; names via useAlterLabel; avatars resolved.
function PinnedAvatar({ alter, size, fronting, isPrimary, blurAvatar }) {
  const resolved = useResolvedAvatarUrl(alter.avatar_url);
  const ring = fronting
    ? (isPrimary ? "#f59e0b" : (alter.color || "var(--v2-accent)"))
    : "hsl(var(--border))";
  return (
    <span
      className={`rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 ${blurAvatar ? "blur-sm" : ""}`}
      style={{
        width: size, height: size,
        border: `2px solid ${ring}`,
        backgroundColor: alter.color ? `${alter.color}22` : "hsl(var(--muted))",
        // Fronting alters render slightly larger via scale so the row
        // doesn't reflow — same "who's active at a glance" cue as the
        // classic gallery, minus its fixed sizing.
        transform: fronting ? "scale(1.06)" : undefined,
      }}
    >
      {resolved
        ? <img src={resolved} alt="" className="w-full h-full object-cover" draggable={false} />
        : <span className="font-semibold text-muted-foreground" style={{ fontSize: Math.max(10, size * 0.3) }}>
            {(alter.name || "?").slice(0, 2)}
          </span>}
    </span>
  );
}

function PinnedAltersWidget({ api, settings }) {
  const tr = useT();
  const t = useTerms();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const formatAlter = useAlterLabel();
  const alters = (api?.alters || []).filter((a) => a.is_pinned && !a.is_archived);
  const { data: sessions = [] } = useQuery({
    queryKey: ["activeFront"],
    queryFn: () => base44.entities.FrontingSession.filter({ is_active: true }),
  });
  const sessionFor = (id) => sessions.find((s) => (s.alter_id || s.primary_alter_id) === id);
  const showNames = settings?.showNames !== false;

  // Proportional sizing: avatars follow the box height (single row), and
  // wrap into more rows when the user makes the widget taller than wide.
  const boxRef = React.useRef(null);
  const [boxH, setBoxH] = React.useState(64);
  React.useEffect(() => {
    const node = boxRef.current;
    if (!node) return undefined;
    const measure = () => setBoxH(node.offsetHeight || 64);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    return () => ro.disconnect();
  }, []);
  // The user's size wins; 0/empty means fit the widget's height (one row,
  // wrapping into more when the box is taller than wide). In a tile too
  // short for avatars AND names, the names bow out first — a clipped name
  // under a clipped circle helps nobody.
  const cfgSize = parseInt(settings?.iconSize, 10) || 0;
  const namesFit = boxH >= 54;
  const showNamesNow = showNames && namesFit;
  const size = cfgSize > 0
    ? Math.max(24, Math.min(cfgSize, 160))
    : Math.max(24, Math.min(boxH - (showNamesNow ? 22 : 4), 96));

  const levelCfg = useFrontLevels();
  const suppressTapUntil = React.useRef(0);
  const addOrLevel = async (alterId, levelId) => {
    // Holding a non-fronter and picking a level ADDS them at that level.
    const fresh = await base44.entities.FrontingSession.filter({ is_active: true });
    const existing = fresh.find((s) => (s.alter_id || s.primary_alter_id) === alterId);
    if (!existing) {
      const alter = alters.find((a) => a.id === alterId);
      if (alter) await toggleFrontFor(alter, fresh, base44, qc, toast, t);
    }
    await commitFrontLevel({ alterId, levelId, queryClient: qc, cfg: levelCfg });
  };
  const { rail, getHoldProps } = useHoldDragLevel({
    cfg: levelCfg,
    onCommit: (alterId, levelId) => {
      suppressTapUntil.current = Date.now() + 400;
      addOrLevel(alterId, levelId);
    },
    onRemove: (alterId) => {
      suppressTapUntil.current = Date.now() + 400;
      const alter = alters.find((a) => a.id === alterId);
      if (alter) removeFrontFor(alter, base44, qc, toast, t);
    },
  });
  const railAlter = rail ? alters.find((a) => a.id === rail.alterId) : null;

  const [menuFor, setMenuFor] = React.useState(null);
  const lastTap = React.useRef({});
  const { mode: anonymize } = useAnonymizeMode();

  return (
    <Section label={applyTerms(tr("widget.pinned.label"), t)}>
      {/* One row, scrolling sideways — the widget IS a strip of avatars,
          so more pins mean more to scroll, never a second, clipped row. */}
      <div ref={boxRef} className="h-full min-h-0 flex flex-nowrap items-center overflow-x-auto overscroll-contain gap-x-3"
        style={{ WebkitOverflowScrolling: "touch" }}>
        {alters.length === 0 && <Muted>{applyTerms(tr("widget.pinned.empty"), t)}</Muted>}
        {alters.map((alter) => {
          const session = sessionFor(alter.id);
          return (
            <button
              key={alter.id}
              type="button"
              {...getHoldProps(alter.id, session?.front_level)}
              onClick={() => {
                if (rail || Date.now() < suppressTapUntil.current) return;
                const now = Date.now();
                if (lastTap.current.id === alter.id && now - lastTap.current.t < 350) {
                  lastTap.current = {};
                  setMenuFor(alter);
                  return;
                }
                lastTap.current = { id: alter.id, t: now };
                navigate(`/alter/${alter.id}`);
              }}
              className="flex flex-col items-center select-none flex-shrink-0"
              style={{ width: Math.max(size + 8, 44) }}
              title={formatAlter(alter)}
            >
              <PinnedAvatar alter={alter} size={size} fronting={!!session}
                isPrimary={!!session?.is_primary} blurAvatar={anonymizeBlurAvatars(anonymize)} />
              {showNamesNow && (
                <span className={`text-[0.625em] text-center truncate w-full mt-0.5 ${anonymizeBlurNames(anonymize) ? "blur-sm" : "text-muted-foreground"}`}>
                  {formatAlter(alter)}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <FrontLevelRail rail={rail} cfg={levelCfg} withRemove alterName={railAlter ? formatAlter(railAlter) : ""} />
      {menuFor && (
        <AlterActionMenu alter={menuFor} activeSessions={sessions}
          session={sessions.find((s) => (s.alter_id || s.primary_alter_id) === menuFor.id)}
          onClose={() => setMenuFor(null)} />
      )}
    </Section>
  );
}


// ── Check-in capture widgets ───────────────────────────────────────
// The quick check-in's parts as widgets in their own right (owner: there
// were none for emotions, symptoms or the diary). Each is the REAL
// component/flow, not a lookalike: the emotion picker is
// EmotionWheelPicker, symptoms write SymptomCheckIn rows the same way the
// check-in does, and the diary widget opens the card for today.
function LogEmotionWidget({ mode, settings }) {
  const tr = useT();
  const t = useTerms();
  const qc = useQueryClient();
  const [picked, setPicked] = React.useState([]);
  const [intensity, setIntensity] = React.useState(3);
  const [saving, setSaving] = React.useState(false);
  const isExpanded = mode === "expanded";
  const customEmotions = useList("customEmotions", "CustomEmotion");

  const save = async () => {
    if (picked.length === 0) return;
    setSaving(true);
    try {
      // Attribute to whoever is closest to front, like the check-in does.
      const active = await base44.entities.FrontingSession.filter({ is_active: true });
      const lead = active.find((x) => x.is_primary) || active[0];
      await base44.entities.EmotionCheckIn.create({
        timestamp: new Date().toISOString(),
        emotions: picked,
        intensity: Number(intensity) || 3,
        alter_id: lead?.alter_id || null,
      });
      qc.invalidateQueries({ queryKey: ["emotionCheckIns"] });
      toast.success(applyTerms(tr("widget.logEmotion.saved"), t));
      setPicked([]);
    } catch (e) {
      toast.error(e?.message || "Couldn't save");
    } finally { setSaving(false); }
  };

  return (
    <Section label={tr("widget.logEmotion.label")}
      action={<TextAction onClick={() => window.dispatchEvent(new CustomEvent("open-quick-checkin"))}>{tr("widget.logEmotion.full")}</TextAction>}>
      <EmotionWheelPicker
        selectedEmotions={picked}
        onToggle={(e) => setPicked((prev) => prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e])}
        customEmotions={customEmotions}
      />
      {isExpanded && (
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex-shrink-0">{tr("widget.logEmotion.intensity")}</span>
          <input type="range" min={1} max={5} step={1} value={intensity}
            onChange={(e) => setIntensity(parseInt(e.target.value, 10))} className="flex-1" />
          <span className="tabular-nums w-4 text-right">{intensity}</span>
        </label>
      )}
      <button type="button" onClick={save} disabled={saving || picked.length === 0}
        className="w-full h-9 text-sm font-medium border disabled:opacity-50"
        style={{ borderRadius: "var(--v2-radius, 8px)", borderColor: "color-mix(in srgb, var(--v2-accent) 50%, transparent)", color: "var(--v2-accent)" }}>
        {saving ? "…" : tr("widget.logEmotion.save")}
      </button>
    </Section>
  );
}

function LogSymptomFullWidget({ api }) {
  const tr = useT();
  const qc = useQueryClient();
  const getterRef = React.useRef(null);
  const [saving, setSaving] = React.useState(false);
  const [dirtyTick, setDirtyTick] = React.useState(0);
  // The check-ins created by the LAST save — Undo deletes exactly those.
  const [lastSaved, setLastSaved] = React.useState(null);
  const [saveGen, setSaveGen] = React.useState(0);
  const { data: activeFront = [] } = useQuery({
    queryKey: ["activeFront"],
    queryFn: () => base44.entities.FrontingSession.filter({ is_active: true }),
  });
  const fronterIds = activeFront.map((x) => x.alter_id || x.primary_alter_id).filter(Boolean);
  const pending = getterRef.current ? getterRef.current() : [];

  const save = async () => {
    const rows = getterRef.current ? getterRef.current() : [];
    if (!rows.length || saving) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const ids = [];
      // Same record shape the Quick Check-In writes, minus the parent
      // check-in id (there is no emotion check-in here to attach to).
      for (const sc of rows) {
        const created = await base44.entities.SymptomCheckIn.create({
          symptom_id: sc.symptom_id,
          timestamp: now,
          severity: sc.severity,
          fronting_alter_ids: sc.alter_ids ?? fronterIds,
        });
        ids.push(created.id);
      }
      qc.invalidateQueries({ queryKey: ["symptomCheckIns"] });
      setLastSaved({ ids, at: now });
      // Remount the section so the form comes back clean — leaving the
      // rows checked after a save read as "did that go through?", and it
      // also kept the Undo hidden behind a still-armed Save.
      setSaveGen((g) => g + 1);
      getterRef.current = null;
      toast.success(tr("widget.logSymptom.saved", { n: rows.length }));
    } catch (e) { toast.error(e?.message || "Couldn't save"); }
    finally { setSaving(false); }
  };

  const undo = async () => {
    if (!lastSaved) return;
    try {
      for (const id of lastSaved.ids) await base44.entities.SymptomCheckIn.delete(id);
      qc.invalidateQueries({ queryKey: ["symptomCheckIns"] });
      setLastSaved(null);
      toast.success(tr("widget.logSymptom.undone"));
    } catch (e) { toast.error(e?.message || "Couldn't undo"); }
  };

  return (
    <Section label={tr("widget.logSymptom.label")}
      action={
        <span className="flex items-center gap-2">
          {lastSaved && !pending.length && (
            <TextAction onClick={undo}>{tr("widget.logSymptom.undoSave")}</TextAction>
          )}
          {pending.length > 0 && (
            <TextAction onClick={save}>{saving ? "…" : `${tr("widget.status.save")} (${pending.length})`}</TextAction>
          )}
        </span>
      }>
      {/* THE check-in symptom section, verbatim — tabs, search, severity
          anchors, per-{alter} assignment, and the active-episode toggles
          (those write immediately, exactly as they do in the check-in). */}
      <div className="min-h-0 flex-1 overflow-y-auto pr-0.5"
        // Deferred a tick: the section publishes its selections in an
        // effect AFTER its own render — reading synchronously on click made
        // the Save counter lag one tap behind.
        onClickCapture={() => setTimeout(() => setDirtyTick((t) => t + 1), 0)} data-dirty-tick={dirtyTick}>
        <SymptomsSection
          key={saveGen}
          onCheckInsReady={(fn) => { getterRef.current = fn; }}
          alters={(api?.alters || []).filter((a) => !a.is_archived)}
          assignDefaultIds={fronterIds}
        />
      </div>
    </Section>
  );
}

function LogSymptomWidget({ settings }) {
  const tr = useT();
  const qc = useQueryClient();
  const symptoms = useList("symptoms", "Symptom");
  const chosenIds = Array.isArray(settings?.symptomIds) ? settings.symptomIds : [];
  const live = symptoms.filter((x) => !x.is_archived);
  const shown = chosenIds.length ? live.filter((x) => chosenIds.includes(x.id)) : live.slice(0, 8);

  // What was just logged, per symptom: the tapped value stays lit on its
  // button (so a tap visibly DID something) and the row grows an Undo that
  // deletes exactly that check-in. Cleared when undone or re-logged;
  // remembering it for the widget's whole mounted life doubles as a
  // "what I last logged" readout.
  const [recent, setRecent] = React.useState({}); // { [symptomId]: { id, value } }
  const [busyId, setBusyId] = React.useState(null);

  const log = async (symptom, value) => {
    if (busyId) return;
    setBusyId(symptom.id);
    try {
      const active = await base44.entities.FrontingSession.filter({ is_active: true });
      const lead = active.find((x) => x.is_primary) || active[0];
      const created = await base44.entities.SymptomCheckIn.create({
        timestamp: new Date().toISOString(),
        symptom_id: symptom.id,
        intensity: value,
        alter_id: lead?.alter_id || null,
      });
      setRecent((prev) => ({ ...prev, [symptom.id]: { id: created.id, value } }));
      qc.invalidateQueries({ queryKey: ["symptomCheckIns"] });
      toast.success(symptom.label || symptom.name);
    } catch (e) { toast.error(e?.message || "Couldn't log"); }
    finally { setBusyId(null); }
  };

  const undo = async (symptom) => {
    const entry = recent[symptom.id];
    if (!entry) return;
    try {
      await base44.entities.SymptomCheckIn.delete(entry.id);
      setRecent((prev) => { const n = { ...prev }; delete n[symptom.id]; return n; });
      qc.invalidateQueries({ queryKey: ["symptomCheckIns"] });
      toast.success(tr("widget.logSymptom.undone"));
    } catch (e) { toast.error(e?.message || "Couldn't undo"); }
  };

  return (
    <Section label={tr("widget.logSymptom.label")}
      action={<TextAction onClick={() => window.dispatchEvent(new CustomEvent("open-quick-checkin"))}>{tr("widget.logEmotion.full")}</TextAction>}>
      {shown.length === 0 && <Muted>{tr("widget.logSymptom.empty")}</Muted>}
      {shown.map((sym) => {
        const done = recent[sym.id];
        return (
          <div key={sym.id} className="flex items-center gap-2">
            <span className="text-sm truncate flex-1 min-w-0">{sym.label || sym.name}</span>
            {done && (
              <button type="button" onClick={() => undo(sym)}
                className="text-[0.625em] text-muted-foreground hover:text-foreground underline flex-shrink-0">
                {tr("widget.logSymptom.undo")}
              </button>
            )}
            {sym.type === "rating" ? (
              <span className="flex gap-1 flex-shrink-0">
                {[1, 2, 3, 4, 5].map((n) => {
                  const picked = done?.value === n;
                  return (
                    <button key={n} type="button" onClick={() => (picked ? undo(sym) : log(sym, n))}
                      disabled={busyId === sym.id}
                      aria-pressed={picked}
                      className={`w-6 h-6 text-[0.6875em] border transition-all active:scale-90 disabled:opacity-50 ${
                        picked
                          ? "border-transparent font-semibold"
                          : "border-border/60 hover:border-primary/60"
                      }`}
                      style={{
                        borderRadius: "var(--v2-radius, 8px)",
                        ...(picked ? { background: "var(--v2-accent, hsl(var(--primary)))", color: "hsl(var(--primary-foreground))" } : null),
                      }}>{n}</button>
                  );
                })}
              </span>
            ) : (
              <button type="button" onClick={() => (done ? undo(sym) : log(sym, true))}
                disabled={busyId === sym.id}
                aria-pressed={!!done}
                className={`text-[0.6875em] px-2 py-1 border transition-all active:scale-95 disabled:opacity-50 flex-shrink-0 ${
                  done ? "border-transparent font-semibold" : "border-border/60 hover:border-primary/60"
                }`}
                style={{
                  borderRadius: "var(--v2-radius, 8px)",
                  ...(done ? { background: "var(--v2-accent, hsl(var(--primary)))", color: "hsl(var(--primary-foreground))" } : null),
                }}>
                {done ? `\u2713 ${tr("widget.logSymptom.logged")}` : tr("widget.logSymptom.log")}
              </button>
            )}
          </div>
        );
      })}
    </Section>
  );
}

function DiaryCardWidget({ mode = "normal" }) {
  const tr = useT();
  const qc = useQueryClient();
  const cards = useList("diaryCards", "DiaryCard");
  const today = new Date().toISOString().slice(0, 10);
  const todays = cards.filter((c) => (c.date || "").slice(0, 10) === today).length;
  // The SAME fields as the check-in's Diary section, filled in right here —
  // DiarySection is the one component both places render (owner: exactly
  // like the Log-symptoms widget above it). Save creates a DiaryCard the
  // same shape the check-in writes.
  const [diaryData, setDiaryData] = React.useState({});
  const [saving, setSaving] = React.useState(false);
  const { data: activeFront = [] } = useQuery({
    queryKey: ["activeFront"],
    queryFn: () => base44.entities.FrontingSession.filter({ is_active: true }),
  });
  const dirty = hasDiaryData(diaryData);
  const save = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      const now = new Date();
      const pad = (n) => String(n).padStart(2, "0");
      await base44.entities.DiaryCard.create({
        card_type: "daily",
        date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
        name: `Daily — ${now.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}`,
        fronting_alter_ids: activeFront.map((x) => x.alter_id || x.primary_alter_id).filter(Boolean),
        emotions: [],
        urges: diaryData.urges || null,
        body_mind: diaryData.body_mind || null,
        skills_practiced: diaryData.skills?.skills_practiced ?? null,
        medication_safety: diaryData.skills ? {
          rx_meds_taken: diaryData.skills.rx_meds_taken,
          self_harm_occurred: diaryData.skills.self_harm_occurred,
          substances_count: diaryData.skills.substances_count,
        } : null,
        notes: null,
      });
      qc.invalidateQueries({ queryKey: ["diaryCards"] });
      setDiaryData({});
      toast.success("Diary saved");
    } catch (e) {
      toast.error(e?.message || "Couldn't save the diary card.");
    } finally {
      setSaving(false);
    }
  };

  if (mode === "minimal") {
    const openDiary = () => window.dispatchEvent(new CustomEvent("open-quick-checkin", { detail: { section: "diary" } }));
    return (
      <Section label={tr("widget.diary.label")}
        action={<TextAction onClick={openDiary}>{tr("widget.diary.fill")}</TextAction>}>
        <Row primary={todays ? tr("widget.diary.started") : tr("widget.diary.none")}
          right={todays ? String(todays) : undefined} onClick={openDiary} />
      </Section>
    );
  }

  return (
    <Section label={tr("widget.diary.label")}
      action={dirty
        ? <TextAction onClick={save}>{saving ? "…" : tr("widget.status.save")}</TextAction>
        : (todays > 0 ? <span className="text-[0.6875em] text-muted-foreground">{tr("widget.diary.started")}</span> : null)}>
      <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
        <DiarySection data={diaryData} onChange={(groupKey, value) => setDiaryData((prev) => ({ ...prev, [groupKey]: value }))} />
      </div>
    </Section>
  );
}

// Analytics embeds — the real analytics components, scoped to a window.
function EmotionAnalyticsWidget({ settings }) {
  const tr = useT();
  const days = parseInt(settings?.days, 10) || 30;
  const to = React.useMemo(() => new Date(), []);
  const from = React.useMemo(() => new Date(Date.now() - days * 86400000), [days]);
  return (
    <Section label={tr("widget.emotionAnalytics.label")}>
      <div className="min-h-0">
        <EmotionAnalytics from={from} to={to} />
      </div>
    </Section>
  );
}

function SymptomAnalyticsWidget({ settings }) {
  const tr = useT();
  const days = parseInt(settings?.days, 10) || 30;
  const endDate = React.useMemo(() => new Date(), []);
  const startDate = React.useMemo(() => new Date(Date.now() - days * 86400000), [days]);
  return (
    <Section label={tr("widget.symptomAnalytics.label")}>
      <div className="min-h-0">
        <SymptomAnalytics startDate={startDate} endDate={endDate} />
      </div>
    </Section>
  );
}


// Widgets written before display modes existed get the ladder here: the
// mode goes into context, where the shared Row uses it to drop icons and
// qualifiers at minimal, and the list widgets read it for how many rows to
// show. Nothing else about them changes.
function sized(render) {
  return (props) => (
    <WidgetModeContext.Provider value={props.mode || "normal"}>
      {render(props)}
    </WidgetModeContext.Provider>
  );
}

export const V2_WIDGETS = {
  activity_week: {
    label: "Week grid", description: "The activity tracker's week, on your home screen. Minimal is a per-day readout; normal draws the grid; expanded gives you the tracker's own gestures \u2014 drag a time range to log or plan it.",
    icon: CalendarRange, category: "activities",
    render: ({ mode, settings, updateSettings }) => <ActivityWeekWidget mode={mode} settings={settings} updateSettings={updateSettings} />,
    supportsModes: ["minimal", "normal", "expanded"], supportsMultiInstance: true,
    configFields: [
      { key: "showEmotions", type: "toggle", label: "Show feelings on the grid", default: false },
      { key: "showAlters", type: "toggle", label: "Show who was {{fronting}}", default: false },
      { key: "laneOpacity", type: "range", section: "ui", label: "{{Fronting}} lane strength", min: 10, max: 100, default: 90, unit: "%" },
      { key: "showQuickPlans", type: "toggle", label: "Show plans with no set time", default: true },
      { key: "rowH", type: "number", label: "Row height", min: 6, max: 80, default: 40 },
      { key: "interval", type: "select", label: "Time steps", default: "60",
        options: [{ value: "15", label: "15 min" }, { value: "30", label: "30 min" }, { value: "60", label: "1 hour" }] },
      { key: "timeFmt", type: "select", label: "Clock", default: "24",
        options: [{ value: "24", label: "24-hour" }, { value: "12", label: "12-hour" }] },
      { key: "weekStartsOn", type: "select", label: "Week starts on", default: "0",
        options: [{ value: "0", label: "Sunday" }, { value: "1", label: "Monday" }] },
    ],
    defaultSpan: { cols: 12, rows: 5 }, minSpan: { cols: 4, rows: 2 }, maxSpan: { cols: 12, rows: 12 },
  },
  activity_day: {
    label: "Day grid", description: "One day as a single column of the week grid \u2014 every hour drawn to scale. Step days with the arrows; expanded adds drag-to-log.",
    icon: CalendarCheck, category: "activities",
    render: ({ mode, settings }) => <ActivityDayWidget mode={mode} settings={settings} />,
    supportsModes: ["minimal", "normal", "expanded"], supportsMultiInstance: true,
    configFields: [
      { key: "showEmotions", type: "toggle", label: "Show feelings on the grid", default: false },
      { key: "showAlters", type: "toggle", label: "Show who was {{fronting}}", default: false },
      { key: "showQuickPlans", type: "toggle", label: "Show plans with no set time", default: true },
      { key: "rowH", type: "number", label: "Row height", min: 6, max: 80, default: 40 },
      { key: "interval", type: "select", label: "Time steps", default: "60",
        options: [{ value: "15", label: "15 min" }, { value: "30", label: "30 min" }, { value: "60", label: "1 hour" }] },
      { key: "timeFmt", type: "select", label: "Clock", default: "24",
        options: [{ value: "24", label: "24-hour" }, { value: "12", label: "12-hour" }] },
    ],
    defaultSpan: { cols: 6, rows: 5 }, minSpan: { cols: 3, rows: 2 }, maxSpan: { cols: 12, rows: 12 },
  },
  activity_dayview: {
    label: "Day view", description: "The activity tracker's day view itself \u2014 quick plans on top, quiet stretches folded away, each hour's entries as pills. Expanded lets you add to the day from here.",
    icon: CalendarClock, category: "activities",
    render: ({ mode, settings, updateSettings }) => <ActivityDayViewWidget mode={mode} settings={settings} updateSettings={updateSettings} />,
    supportsModes: ["minimal", "normal", "expanded"], supportsMultiInstance: true,
    configFields: [
      { key: "showAlters", type: "toggle", label: "Show who was {{fronting}}", default: false },
      { key: "showEmotions", type: "toggle", label: "Show check-ins", default: false },
      { key: "laneOpacity", type: "range", section: "ui", label: "{{Fronting}} lane strength", min: 10, max: 100, default: 90, unit: "%" },
      { key: "rowH", type: "number", label: "Row height", min: 6, max: 80, default: 40 },
      { key: "timeFmt", type: "select", label: "Clock", default: "24",
        options: [{ value: "24", label: "24-hour" }, { value: "12", label: "12-hour" }] },
    ],
    defaultSpan: { cols: 6, rows: 5 }, minSpan: { cols: 3, rows: 2 }, maxSpan: { cols: 12, rows: 12 },
  },
  activity_month: {
    label: "Month calendar", description: "The activity month view \u2014 what happened on each day, with your important dates marked.",
    icon: CalendarDays, category: "activities",
    render: ({ mode, settings }) => <ActivityMonthWidget mode={mode} settings={settings} />,
    supportsModes: ["minimal", "normal", "expanded"], supportsMultiInstance: true,
    defaultSpan: { cols: 8, rows: 5 }, minSpan: { cols: 3, rows: 2 }, maxSpan: { cols: 12, rows: 12 },
  },
  activity_year: {
    label: "Year overview", description: "A year of activity at a glance, one square per day.",
    icon: Grid2X2, category: "activities",
    render: ({ mode, settings }) => <ActivityYearWidget mode={mode} settings={settings} />,
    supportsModes: ["minimal", "normal", "expanded"], supportsMultiInstance: true,
    defaultSpan: { cols: 8, rows: 5 }, minSpan: { cols: 3, rows: 2 }, maxSpan: { cols: 12, rows: 12 },
  },
  timeline_days: {
    label: "Timeline", description: "Your timeline days, scrolling inside the widget. Expanded keeps loading older days as you reach the bottom.",
    icon: CalendarClock, category: "timeline",
    render: ({ mode, settings }) => <TimelineWidget mode={mode} settings={settings} />,
    supportsModes: ["minimal", "normal", "expanded"], supportsMultiInstance: true,
    configFields: [
      { key: "days", type: "number", label: "Days to start with", min: 1, max: 30, default: 3 },
    ],
    defaultSpan: { cols: 12, rows: 6 }, minSpan: { cols: 3, rows: 2 }, maxSpan: { cols: 12, rows: 12 },
  },
  day_summary: {
    label: "Day summary", description: "The timeline's tally for a day \u2014 who was here, how long, what was logged. Step back through days with the arrows.",
    icon: ListChecks, category: "timeline",
    render: ({ mode }) => <DailySummaryWidget mode={mode} />,
    supportsModes: ["minimal", "normal", "expanded"], supportsMultiInstance: true,
    defaultSpan: { cols: 6, rows: 4 }, minSpan: { cols: 3, rows: 1 }, maxSpan: { cols: 12, rows: 12 },
  },
  checkin_log: {
    label: "Check-in log", description: "Your check-ins as they came in \u2014 feelings, and symptoms too from normal upwards.",
    icon: History, category: "checkin",
    render: ({ mode, settings }) => <CheckInLogWidget mode={mode} settings={settings} />,
    supportsModes: ["minimal", "normal", "expanded"], supportsMultiInstance: true,
    configFields: [
      { key: "limit", type: "number", label: "How many to show", min: 1, max: 50, default: 8 },
    ],
    defaultSpan: { cols: 6, rows: 3 }, minSpan: { cols: 2, rows: 1 }, maxSpan: { cols: 12, rows: 12 },
  },
  daily_tasks: {
    label: "Recurring tasks", description: "Your daily / weekly / monthly tasks for this period, tickable here. Automatic ones tick themselves when you do the thing they track.",
    icon: CheckCircle2, category: "tasks",
    render: ({ mode, settings }) => <DailyTasksWidget mode={mode} settings={settings} />,
    supportsModes: ["minimal", "normal", "expanded"], supportsMultiInstance: true,
    configFields: [
      // Several sets in ONE widget (the user's ask) — each shows as its own
      // little group. Older widgets carry a single `frequency`; the widget
      // reads that when `frequencies` is unset.
      { key: "frequencies", type: "multi", label: "Which sets", default: ["daily"],
        options: [
          { value: "daily", label: "Daily" }, { value: "weekly", label: "Weekly" },
          { value: "monthly", label: "Monthly" }, { value: "yearly", label: "Yearly" },
        ] },
    ],
    defaultSpan: { cols: 6, rows: 3 }, minSpan: { cols: 2, rows: 1 }, maxSpan: { cols: 12, rows: 12 },
  },
  chat_channels: {
    label: "Chat channels", description: "Every {{system}}-chat channel, most recent first, one tap to open. Private channels stay hidden unless one of their {{alters}} is here.",
    icon: Hash, category: "chat",
    render: ({ mode, settings }) => <ChatChannelsWidget mode={mode} settings={settings} />,
    supportsModes: ["minimal", "normal", "expanded"], supportsMultiInstance: true,
    defaultSpan: { cols: 4, rows: 3 }, minSpan: { cols: 2, rows: 1 }, maxSpan: { cols: 12, rows: 12 },
  },
  grounding_techniques: {
    label: "Grounding", description: "Your grounding techniques \u2014 tap one and it runs right here, guided.",
    icon: Wind, category: "support",
    render: ({ mode, settings }) => <GroundingWidget mode={mode} settings={settings} />,
    supportsModes: ["minimal", "normal", "expanded"], supportsMultiInstance: true,
    defaultSpan: { cols: 4, rows: 3 }, minSpan: { cols: 2, rows: 1 }, maxSpan: { cols: 12, rows: 12 },
  },
  learn_modules: {
    label: "Learn", description: "The learning modules with your progress \u2014 tap one to pick up where you left off.",
    icon: GraduationCap, category: "support",
    render: ({ mode, settings }) => <LearnWidget mode={mode} settings={settings} />,
    supportsModes: ["minimal", "normal", "expanded"], supportsMultiInstance: true,
    defaultSpan: { cols: 6, rows: 4 }, minSpan: { cols: 2, rows: 1 }, maxSpan: { cols: 12, rows: 12 },
  },
  presence: {
    label: "Who's here", description: "Current {{fronters}}, with time since each arrived. Tap = their check-in panel inline; double-tap = the action menu; press-and-hold = the {{fronting}}-level spectrum.",
    icon: Users, category: "alters",
    render: ({ mode, api, settings }) => <PresenceWidget mode={mode} api={api} settings={settings} />,
    supportsModes: ["minimal", "normal", "expanded"], supportsMultiInstance: false,
    configFields: [
      { key: "showAvatar", type: "toggle", label: "Show avatars (normal & expanded)", default: true },
      { key: "showPronouns", type: "toggle", label: "Show pronouns (expanded)", default: true },
      { key: "showSessionDetail", type: "toggle", label: "Show this session's feelings, symptoms & note (expanded)", default: true },
    ],
    defaultSpan: { cols: 4, rows: 1 }, minSpan: { cols: 2, rows: 1 }, maxSpan: { cols: 12, rows: 8 },
  },
  running: {
    label: "Active", description: "What's running right now — activities, symptom episodes, sleep — and how long for.",
    icon: Timer, category: "home",
    render: sized(({ api }) => <ActiveWidget api={api} />),
    supportsModes: ["normal"], supportsMultiInstance: false,
    defaultSpan: { cols: 4, rows: 1 }, minSpan: { cols: 2, rows: 1 }, maxSpan: { cols: 12, rows: 8 },
  },
  today: {
    label: "Today", description: "Today's schedule: plans at their times, anything due today, and anything left unresolved.",
    icon: CalendarCheck, category: "home",
    render: sized(() => <TodayWidget />),
    supportsModes: ["normal"], supportsMultiInstance: false,
    defaultSpan: { cols: 4, rows: 2 }, minSpan: { cols: 2, rows: 1 }, maxSpan: { cols: 12, rows: 6 },
  },
  status: {
    label: "Status", description: "The latest status note.",
    icon: StickyNote, category: "home",
    render: sized(() => <StatusWidget />),
    supportsModes: ["normal"], supportsMultiInstance: false,
    defaultSpan: { cols: 4, rows: 1 }, minSpan: { cols: 2, rows: 1 }, maxSpan: { cols: 12, rows: 6 },
  },
  recent: {
    label: "Recent check-ins", description: "Your most recent check-ins.",
    icon: History, category: "home",
    render: sized(({ settings }) => <RecentWidget settings={settings} />),
    supportsModes: ["normal"], supportsMultiInstance: true,
    defaultSpan: { cols: 4, rows: 2 }, minSpan: { cols: 2, rows: 1 }, maxSpan: { cols: 12, rows: 6 },
  },
  log_emotion: {
    label: "Log a feeling", description: "The emotion picker, right on the page \u2014 pick and save without opening the check-in.",
    icon: Smile, category: "checkin",
    render: ({ mode, settings }) => <LogEmotionWidget mode={mode} settings={settings} />,
    supportsModes: ["normal", "expanded"], supportsMultiInstance: true,
    defaultSpan: { cols: 4, rows: 3 }, minSpan: { cols: 3, rows: 2 }, maxSpan: { cols: 12, rows: 10 },
  },
  log_symptom: {
    label: "Log symptoms", description: "The check-in's symptoms section on the board \u2014 tabs, search, severity, active episodes, per-{{alter}} assignment \u2014 with Save and undo. Minimal is one-tap rows for your usual few.",
    icon: Activity, category: "checkin",
    render: sized(({ settings, mode, api }) => (mode === "minimal"
      ? <LogSymptomWidget settings={settings} />
      : <LogSymptomFullWidget api={api} />)),
    supportsModes: ["minimal", "normal", "expanded"], supportsMultiInstance: true,
    configFields: [
      { key: "symptomIds", type: "symptoms", label: "Which symptoms" },
    ],
    defaultSpan: { cols: 4, rows: 2 }, minSpan: { cols: 3, rows: 1 }, maxSpan: { cols: 12, rows: 10 },
  },
  diary_card: {
    label: "Diary card", description: "The check-in's diary fields, right in the widget \u2014 urges, body + mind, skills \u2014 with Save. Minimal is just today's status.",
    icon: ClipboardList, category: "checkin",
    render: ({ mode }) => <DiaryCardWidget mode={mode} />,
    supportsModes: ["minimal", "normal", "expanded"], supportsMultiInstance: false,
    defaultSpan: { cols: 6, rows: 4 }, minSpan: { cols: 2, rows: 1 }, maxSpan: { cols: 12, rows: 12 },
  },
  emotion_analytics: {
    label: "Feelings analytics", description: "Your emotion patterns over a window you choose.",
    icon: Smile, category: "analytics",
    render: ({ settings }) => <EmotionAnalyticsWidget settings={settings} />,
    supportsModes: ["normal"], supportsMultiInstance: true,
    configFields: [
      { key: "days", type: "number", label: "Days to include", min: 7, max: 365, default: 30 },
    ],
    defaultSpan: { cols: 6, rows: 4 }, minSpan: { cols: 3, rows: 2 }, maxSpan: { cols: 12, rows: 12 },
  },
  symptom_analytics: {
    label: "Symptom analytics", description: "Symptom frequency and intensity over a window you choose.",
    icon: Activity, category: "analytics",
    render: ({ settings }) => <SymptomAnalyticsWidget settings={settings} />,
    supportsModes: ["normal"], supportsMultiInstance: true,
    configFields: [
      { key: "days", type: "number", label: "Days to include", min: 7, max: 365, default: 30 },
    ],
    defaultSpan: { cols: 6, rows: 4 }, minSpan: { cols: 3, rows: 2 }, maxSpan: { cols: 12, rows: 12 },
  },
  capture: {
    label: "Capture", description: "One-tap buttons for the things you log most.",
    icon: Heart, category: "home",
    render: sized(({ api }) => <CaptureWidget api={api} />),
    supportsModes: ["normal"], supportsMultiInstance: false,
    defaultSpan: { cols: 4, rows: 1 }, minSpan: { cols: 2, rows: 1 }, maxSpan: { cols: 12, rows: 6 },
  },
  system_identity: {
    label: "{{System}} header", description: "Your {{system}}'s picture, name and description.",
    icon: IdCard, category: "alters",
    render: ({ mode, api }) => <SystemIdentityWidget mode={mode} api={api} />,
    supportsModes: ["minimal", "normal", "expanded"], supportsMultiInstance: false,
    defaultSpan: { cols: 4, rows: 1 }, minSpan: { cols: 2, rows: 1 }, maxSpan: { cols: 12, rows: 8 },
  },
  alters_list: {
    label: "{{Alters}} list", description: "Your {{alters}}, ordered how you like \u2014 flat or split by group, alphabetical or by {{fronting}} time. Expanded rows add avatars, pronouns, preferences and what each one has going right now.",
    icon: Users, category: "alters",
    render: ({ settings, api, mode }) => <AltersListWidget settings={settings} api={api} mode={mode} />,
    supportsModes: ["normal", "expanded"], supportsMultiInstance: true,
    configFields: [
      { key: "arrangement", type: "select", label: "Arrangement", default: "flat",
        options: [
          { value: "flat", label: "One flat list" },
          { value: "grouped", label: "Group / subsystem tree" },
          { value: "custom", label: "My own order" },
        ] },
      { key: "customOrder", type: "arrangement", label: "This widget\u2019s own order (leave empty to follow your {{system}}-wide order)",
        showIf: (st) => st?.arrangement === "custom" },
      { key: "customRest", type: "toggle", label: "List everyone else after your order", default: true,
        showIf: (st) => st?.arrangement === "custom" },
      { key: "sort", type: "select", label: "Order by", default: "name",
        showIf: (st) => (st?.arrangement || "flat") !== "custom",
        options: [
          { value: "name", label: "Name (A\u2013Z)" },
          { value: "front_time", label: "{{Fronting}} time" },
          { value: "front_count", label: "{{Switch}} count" },
          { value: "recent", label: "Recently updated" },
          { value: "created", label: "When they joined" },
          { value: "role", label: "Role" },
        ] },
      { key: "reverse", type: "toggle", label: "Reverse the order", default: false,
        showIf: (st) => (st?.arrangement || "flat") !== "custom" },
      { key: "groupId", type: "group", label: "Only show one group / subsystem" },
      { key: "limit", type: "number", label: "How many to show (0 = everyone)", min: 0, max: 40, default: 0 },
    ],
    defaultSpan: { cols: 4, rows: 2 }, minSpan: { cols: 2, rows: 1 }, maxSpan: { cols: 12, rows: 12 },
  },
  journal: {
    label: "Journal", description: "Your most recent entries, and a button to start a new one.",
    icon: BookOpen, category: "journals",
    render: ({ settings }) => <JournalWidget settings={settings} />,
    supportsModes: ["normal"], supportsMultiInstance: true,
    configFields: [{ key: "limit", type: "number", label: "How many to show", min: 1, max: 20, default: 6 },],
    defaultSpan: { cols: 4, rows: 2 }, minSpan: { cols: 2, rows: 1 }, maxSpan: { cols: 12, rows: 8 },
  },
  journal_book: {
    label: "Journal pages", description: "Read one journal a page at a time, turn pages, switch journals, and start a new page.",
    icon: NotebookPen, category: "journals",
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
    icon: PenLine, category: "journals",
    render: ({ settings, updateSettings, instanceId }) =>
      <NotebookWidget settings={settings} updateSettings={updateSettings} instanceId={instanceId} />,
    supportsModes: ["normal"], supportsMultiInstance: true,
    configFields: [
      { key: "journal", type: "dynamicSelect", source: "journalFolders", label: "Journal", emptyLabel: "All journals" },
      { key: "rich", type: "toggle", label: "Formatting & images", default: false },
    ],
    defaultSpan: { cols: 4, rows: 3 }, minSpan: { cols: 2, rows: 2 }, maxSpan: { cols: 12, rows: 10 },
  },
  inner_map: {
    label: "Inner world map", description: "One of your inner-world maps, right on the home screen — pick the map, and optionally a single layer. Pan and pinch work; Open jumps to the full canvas.",
    icon: Map, category: "system",
    render: ({ settings }) => <InnerMapWidget settings={settings} />,
    supportsModes: ["normal"], supportsMultiInstance: true,
    configFields: [
      { key: "mapId", type: "dynamicSelect", source: "innerMaps", label: "Map", emptyLabel: "First map" },
      { key: "layerId", type: "dynamicSelect", source: "innerLayers", label: "Layer", emptyLabel: "All visible layers" },
      { key: "soloLayer", type: "toggle", label: "Show only that layer", default: false },
    ],
    defaultSpan: { cols: 8, rows: 5 }, minSpan: { cols: 3, rows: 3 }, maxSpan: { cols: 12, rows: 12 },
  },
  inner_locations: {
    label: "Inner world places", description: "Every location across your maps and layers as a list — tap one to jump to it. Can be pinned to a single map.",
    icon: MapPin, category: "system",
    render: ({ settings }) => <InnerLocationsWidget settings={settings} />,
    supportsModes: ["normal"], supportsMultiInstance: true,
    configFields: [
      { key: "mapId", type: "dynamicSelect", source: "innerMaps", label: "Map", emptyLabel: "All maps" },
    ],
    defaultSpan: { cols: 6, rows: 5 }, minSpan: { cols: 3, rows: 2 }, maxSpan: { cols: 12, rows: 12 },
  },
  bulletin_board: {
    label: "Bulletin board", description: "The board itself — post and read. Can show group boards too, with arrows to flip between them.",
    icon: Megaphone, category: "bulletins",
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
    icon: ListTodo, category: "tasks",
    render: sized(({ settings }) => <TasksWidget settings={settings} />),
    supportsModes: ["normal"], supportsMultiInstance: true,
    configFields: [{ key: "limit", type: "number", label: "How many to show", min: 1, max: 20, default: 6 },],
    defaultSpan: { cols: 4, rows: 2 }, minSpan: { cols: 2, rows: 1 }, maxSpan: { cols: 12, rows: 8 },
  },
  sleep: {
    label: "Sleep", description: "Last night's sleep, or the one in progress.",
    icon: Moon, category: "sleep",
    render: sized(() => <SleepWidget />),
    supportsModes: ["normal"], supportsMultiInstance: false,
    defaultSpan: { cols: 4, rows: 1 }, minSpan: { cols: 2, rows: 1 }, maxSpan: { cols: 12, rows: 6 },
  },
  board: {
    label: "Board", description: "The latest posts on the bulletin board.",
    icon: Megaphone, category: "bulletins",
    render: ({ settings }) => <BulletinsWidget settings={settings} />,
    supportsModes: ["normal"], supportsMultiInstance: true,
    configFields: [{ key: "limit", type: "number", label: "How many to show", min: 1, max: 20, default: 6 },],
    defaultSpan: { cols: 4, rows: 2 }, minSpan: { cols: 2, rows: 1 }, maxSpan: { cols: 12, rows: 8 },
  },
  reminders: {
    label: "Reminders", description: "What's coming up from your reminders.",
    icon: Bell, category: "reminders",
    render: sized(({ settings }) => <RemindersWidget settings={settings} />),
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
    icon: Users, category: "alters",
    // hideStatusNote ALWAYS: the classic panel bundles the status bar for
    // dashboard convenience, but widgets are building blocks — status entry
    // is its own widget, so the panel carries only the fronting feature.
    // Wrapped in Section so it has the ONE visible box every widget owes
    // the contract — without it the panel had no border and ignored the
    // user's look settings.
    render: sized(({ api }) => (
      <Section>
        <CurrentFronters alters={api?.alters || []} hideStatusNote />
      </Section>
    )),
    supportsModes: ["normal"], supportsMultiInstance: false,
    defaultSpan: { cols: 6, rows: 4 }, minSpan: { cols: 3, rows: 2 }, maxSpan: { cols: 12, rows: 12 },
  },
  pinned_alters: {
    label: "Pinned {{alters}}", description: "Your pinned {{alters}} as a row of avatars that scales with the widget. Tap = profile \u00b7 double-tap = menu \u00b7 hold = set {{front}} (the level spectrum when levels are on).",
    icon: Pin, category: "alters",
    render: sized(({ api, settings }) => <PinnedAltersWidget api={api} settings={settings} />),
    supportsModes: ["normal"], supportsMultiInstance: false,
    configFields: [
      { key: "showNames", type: "toggle", label: "Show names", default: true },
      { key: "iconSize", type: "number", label: "Avatar size (0 = fit the widget)", min: 0, max: 160, default: 0 },
    ],
    defaultSpan: { cols: 4, rows: 1 }, minSpan: { cols: 2, rows: 1 }, maxSpan: { cols: 12, rows: 6 },
  },
  sleep_controls: {
    label: "Sleep controls", description: "Start sleeping or wake up with one tap, with the running time.",
    icon: Moon, category: "sleep",
    render: sized(() => <SleepControlWidget />),
    supportsModes: ["normal"], supportsMultiInstance: false,
    defaultSpan: { cols: 4, rows: 1 }, minSpan: { cols: 2, rows: 1 }, maxSpan: { cols: 12, rows: 3 },
  },
  song: {
    label: "Song", description: "A song that plays while this page is open.",
    icon: Music, category: "support",
    render: sized(({ settings }) => (
      <Section label={settings?.label || "Song"}>
        {settings?.song?.ref
          ? <ProfileSongPlayer inline song={settings.song} />
          : <Muted>Pick a song in this widget's options.</Muted>}
      </Section>
    )),
    supportsModes: ["normal"], supportsMultiInstance: true,
    configFields: [{ key: "song", type: "song", label: "Song" }],
    defaultSpan: { cols: 4, rows: 1 }, minSpan: { cols: 2, rows: 1 }, maxSpan: { cols: 12, rows: 2 },
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
  upcoming_plans: {
    label: "Coming up", description: "The classic Upcoming plans panel, with its own reminder window.",
    icon: AlarmClock, category: "activities",
    // The classic component verbatim — it fetches, groups by day, offers
    // the inline window cog and the resolve actions. Section supplies the
    // one visible box; UpcomingPlans keeps its own header (it carries the
    // window label and cog), so Section is label-less to avoid two titles.
    render: sized(({ settings }) => (
      <Section>
        {/* No limit prop: that keeps the panel's own cog visible, so how
            many plans / how far ahead stays the one control users already
            know from the classic dashboard rather than a second copy of it. */}
        <UpcomingPlans placement="widget" title={settings?.label || "Coming up"} />
      </Section>
    )),
    supportsModes: ["normal"], supportsMultiInstance: true,
    defaultSpan: { cols: 4, rows: 3 }, minSpan: { cols: 2, rows: 2 }, maxSpan: { cols: 12, rows: 8 },
  },
  plans: {
    label: "Plans", description: "What's scheduled over the coming days.",
    icon: CalendarDays, category: "activities",
    render: sized(({ settings }) => <PlansWidget settings={settings} />),
    supportsModes: ["normal"], supportsMultiInstance: true,
    configFields: [
      { key: "days", type: "number", label: "Days ahead", min: 1, max: 60, default: 7 },
      { key: "limit", type: "number", label: "How many to show", min: 1, max: 20, default: 8 },
    ],
    defaultSpan: { cols: 4, rows: 2 }, minSpan: { cols: 2, rows: 1 }, maxSpan: { cols: 12, rows: 8 },
  },
  plan_tracker: {
    label: "Plan tracker", description: "The plan-completion tracker — how many plans got done, partly done, or skipped.",
    icon: ListChecks, category: "activities",
    render: sized(() => (
      <Section label="Plan tracker">
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          <PlanCompletionTracker />
        </div>
      </Section>
    )),
    supportsModes: ["normal"], supportsMultiInstance: true,
    defaultSpan: { cols: 6, rows: 3 }, minSpan: { cols: 3, rows: 2 }, maxSpan: { cols: 12, rows: 8 },
  },
  recent_activities: {
    label: "Recent activities", description: "The most recently logged activities, with durations.",
    icon: BarChart2, category: "activities",
    render: sized(({ settings }) => <RecentActivitiesWidget settings={settings} />),
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
    icon: Vote, category: "bulletins",
    render: sized(({ settings }) => <PollsWidget settings={settings} />),
    supportsModes: ["normal"], supportsMultiInstance: true,
    configFields: [{ key: "limit", type: "number", label: "How many to show", min: 1, max: 12, default: 4 }],
    defaultSpan: { cols: 4, rows: 2 }, minSpan: { cols: 2, rows: 1 }, maxSpan: { cols: 12, rows: 6 },
  },
  chat_channel: {
    label: "Chat channel", description: "A {{system}}-chat channel you can read and send in, right here.",
    icon: MessageSquare, category: "chat",
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
    icon: BarChart2, category: "bulletins",
    render: sized(({ settings, updateSettings }) =>
      <PollResultsWidget settings={settings} updateSettings={updateSettings} />),
    supportsModes: ["normal"], supportsMultiInstance: true,
    configFields: [
      { key: "pollId", type: "dynamicSelect", source: "polls", label: "Poll" },
    ],
    defaultSpan: { cols: 4, rows: 2 }, minSpan: { cols: 2, rows: 2 }, maxSpan: { cols: 12, rows: 8 },
  },
  poll_new: {
    label: "New poll", description: "A button that opens the real poll composer.",
    icon: Vote, category: "bulletins",
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
    // _seeded marks a starter board the user has never touched — the
    // backup-import singleton merge lets a REAL imported board replace it
    // (a fresh install's auto-seeded layout was "newer" by timestamp and
    // silently beat the user's imported home screen). The board's persist
    // strips the marker on the first real edit.
    _seeded: true,
    version: 2, enabled: true, defaultPageId: "p1", styleMode: "current",
    actionBar: { enabled: false, buttonIds: [] },
    altersBar: { enabled: false, position: "bottom" },
    // Fresh boards start on the FINEST grid (the user can coarsen it) —
    // big jumps between sizes were the complaint, not the fine steps.
    wallpaper: { url: "" }, grid: { phoneCols: 8, rowPx: 40 }, drawer: { folders: [] },
    pages: [{
      id: "p1", label: "Home",
      widgets: [mk("presence", 4, 1), mk("today", 4, 2), mk("running", 4, 1), mk("status", 4, 1)],
    }],
  };
}

// ── Quick-action keys as widgets ───────────────────────────────────
// The command bar / dock is optional chrome; a user who hides it can put
// any of its keys on the board instead. One entry each so they're all
// browsable in the picker, all backed by the same component.
// Boards saved before the two keys merged still name action_quick_task /
// action_quick_plan; keep those ids resolving to the one widget so nothing
// vanishes from anyone's home screen.
V2_WIDGETS.action_quick_task = null; // placeholder, filled below
V2_WIDGETS.action_quick_plan = null;
for (const c of COMMAND_WIDGETS) {
  V2_WIDGETS[`action_${c.id}`] = {
    label: c.label,
    description: c.desc,
    icon: c.icon,
    category: "actions",
    render: ({ mode, settings, api }) => (
      <CommandWidget keyId={c.id} mode={mode} settings={settings} api={api} />
    ),
    supportsModes: ["minimal", "normal"], supportsMultiInstance: true,
    configFields: [
      { key: "label", type: "text", label: "Button text", placeholder: "Leave empty for the default" },
    ],
    defaultSpan: { cols: 2, rows: 1 }, minSpan: { cols: 1, rows: 1 }, maxSpan: { cols: 12, rows: 4 },
  };
}
// The legacy ids render the merged widget, but stay OUT of the picker
// (hidden) so it lists one "Add something to do", not three.
for (const legacy of ["action_quick_task", "action_quick_plan"]) {
  V2_WIDGETS[legacy] = { ...V2_WIDGETS.action_quick_thing, hiddenFromDrawer: true };
}
