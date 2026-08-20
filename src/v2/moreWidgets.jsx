// Second widget tranche for the v2 home board: timeline, daily summary,
// check-in log, daily/recurring tasks, chat channels, grounding and the
// learning modules.
//
// Same rule as the rest of the board — reuse the app's own components and
// data, redesign only the frame. Every widget reads at three depths:
//
//   minimal   text. The answer, no furniture.
//   normal    the real thing, sized for a tile.
//   expanded  more of it, plus the actions that belong to it.

import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, isSameDay, addDays, startOfDay } from "date-fns";
import {
  ChevronLeft, ChevronRight, CheckCircle2, Circle, Hash, Lock, Wind, GraduationCap,
  ListChecks, CalendarClock, Clock, Heart,
} from "lucide-react";
import { toast } from "sonner";

import { base44, localEntities } from "@/api/base44Client";
import { useTerms } from "@/lib/useTerms";
import { useTimelineSources, sliceTimelineDay } from "@/lib/timelineData";
import {
  applyTerms, getPeriodKey, getTodayString, toggleDailyProgressTasks, FREQUENCY_LABELS,
  hasCustomReset, isCustomResetDone, lastCompletionOf, isTaskDueOn,
} from "@/lib/dailyTaskSystem";
import { Section, Row, Muted, TextAction, Dot } from "@/v2/primitives";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { sheetPortalGuards } from "@/lib/sheetPortalGuards";
import InfiniteTimeline from "@/components/timeline/InfiniteTimeline";
import DailyTallyPanel from "@/components/timeline/DailyTallyPanel";
import GuidedTechniqueView from "@/components/grounding/GuidedTechniqueView";
import { CURRICULUM } from "@/components/support/TopicView";
import { DEFAULT_TECHNIQUES } from "@/utils/groundingDefaults";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import { useFrontersFirst } from "@/lib/alterSort";

// localEntities IS the entity proxy (localEntities.X), while base44 wraps
// one (base44.entities.X) — both land in the same store.
const useList = (key, entity, local = false) =>
  useQuery({ queryKey: [key], queryFn: () => (local ? localEntities[entity] : base44.entities[entity]).list() }).data || [];

// Day stepper shared by the day-scoped widgets.
function DayNav({ date, setDate }) {
  const atToday = isSameDay(date, new Date());
  return (
    <span className="flex items-center gap-1">
      <button type="button" onClick={() => setDate((d) => addDays(d, -1))} aria-label="Previous day"
        className="p-0.5 text-muted-foreground hover:text-foreground"><ChevronLeft className="w-3.5 h-3.5" /></button>
      <button type="button" onClick={() => setDate(new Date())} disabled={atToday}
        className={`text-[0.6875em] tabular-nums ${atToday ? "text-muted-foreground" : "text-primary hover:underline"}`}>
        {atToday ? "Today" : format(date, "EEE d MMM")}
      </button>
      <button type="button" onClick={() => setDate((d) => addDays(d, 1))} aria-label="Next day"
        className="p-0.5 text-muted-foreground hover:text-foreground"><ChevronRight className="w-3.5 h-3.5" /></button>
    </span>
  );
}

// ── Timeline ───────────────────────────────────────────────────────
// The page's own day renderer, a few days at a time, scrolling inside the
// widget. Expanded keeps loading older days as you reach the bottom.
export function TimelineWidget({ mode = "normal", settings }) {
  const navigate = useNavigate();
  const src = useTimelineSources();
  const startDays = Math.max(1, Math.min(30, parseInt(settings?.days, 10) || (mode === "expanded" ? 7 : 3)));
  const [shown, setShown] = useState(startDays);
  const days = useMemo(
    () => Array.from({ length: shown }, (_, i) => addDays(startOfDay(new Date()), -i)),
    [shown],
  );

  if (mode === "minimal") {
    const d = sliceTimelineDay(src, new Date());
    const bits = [
      d.sessions.length ? `${d.sessions.length} sessions` : null,
      d.activities.length ? `${d.activities.length} activities` : null,
      d.emotions.length ? `${d.emotions.length} check-ins` : null,
      d.journals.length ? `${d.journals.length} journals` : null,
    ].filter(Boolean);
    return (
      <Section label="Timeline" action={<TextAction onClick={() => navigate("/timeline")}>Open</TextAction>}>
        {bits.length === 0 && <Muted>Nothing logged today yet.</Muted>}
        {bits.map((b) => <Row key={b} primary={b} />)}
      </Section>
    );
  }

  const onScroll = (e) => {
    if (mode !== "expanded") return;
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) setShown((n) => Math.min(n + 7, 120));
  };

  return (
    <Section label="Timeline" action={<TextAction onClick={() => navigate("/timeline")}>Open</TextAction>}>
      <ErrorBoundary fallback={<Muted>The timeline couldn't be drawn here. Open the Timeline page.</Muted>} resetKeys={[shown]}>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" onScroll={onScroll}>
          {days.map((day) => {
            const d = sliceTimelineDay(src, day);
            return (
              <InfiniteTimeline
                key={d.dateStr}
                day={day}
                sessions={d.sessions}
                activities={d.activities}
                emotions={d.emotions}
                alters={src.alters}
                hasData={d.hasData}
                isToday={isSameDay(day, new Date())}
                journals={d.journals}
                checkIns={d.checkIns}
                bulletins={d.bulletins}
                tasks={d.tasks}
                symptomSessions={d.symptomSessions}
                symptomCheckIns={d.symptomCheckIns}
                symptoms={src.symptoms}
                categories={src.categories}
                locations={d.locations}
                statusNotes={d.statusNotes}
                importantDates={d.importantDates}
                sleeps={d.sleeps}
                lineageEvents={d.lineageEvents}
                diaryCards={d.diaryCards}
                polls={d.polls}
                reminderInstances={d.reminderInstances}
                reflections={d.reflections}
                alterNotes={d.alterNotes}
                dailyProgress={d.dailyProgress}
                dailyTaskTemplates={src.dailyTaskTemplates}
              />
            );
          })}
        </div>
      </ErrorBoundary>
    </Section>
  );
}

// ── Daily summary (the timeline's tally panel) ─────────────────────
export function DailySummaryWidget({ mode = "normal" }) {
  const navigate = useNavigate();
  const src = useTimelineSources();
  const [date, setDate] = useState(() => new Date());
  const d = sliceTimelineDay(src, date);

  if (mode === "minimal") {
    const mins = d.activities.reduce((s, a) => s + Math.max(0, a.actual_duration_minutes ?? a.duration_minutes ?? 0), 0);
    return (
      <Section label={isSameDay(date, new Date()) ? "Today" : format(date, "EEE d MMM")} action={<DayNav date={date} setDate={setDate} />}>
        <Row primary="Switches" right={String(d.sessions.length)} />
        <Row primary="Activities" right={`${d.activities.length}${mins ? ` · ${Math.round(mins / 6) / 10}h` : ""}`} />
        <Row primary="Check-ins" right={String(d.emotions.length)} />
        <Row primary="Journals" right={String(d.journals.length)} />
      </Section>
    );
  }

  return (
    <Section label="Day summary" action={<DayNav date={date} setDate={setDate} />}>
      <ErrorBoundary fallback={<Muted>This day's summary couldn't be drawn.</Muted>} resetKeys={[d.dateStr]}>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <DailyTallyPanel
            day={date}
            sessions={d.sessions}
            activities={d.activities}
            emotions={d.emotions}
            journals={d.journals}
            alters={src.alters}
            checkIns={d.checkIns}
            tasks={d.tasks}
            symptoms={src.symptoms}
            symptomSessions={d.symptomSessions}
            bulletins={d.bulletins}
            categories={src.categories}
            statusNotes={d.statusNotes}
          />
        </div>
      </ErrorBoundary>
      {mode === "expanded" && <TextAction onClick={() => navigate("/timeline")}>Open the timeline</TextAction>}
    </Section>
  );
}

// ── Check-in log ───────────────────────────────────────────────────
export function CheckInLogWidget({ mode = "normal", settings }) {
  const navigate = useNavigate();
  const checkIns = useList("emotionCheckIns", "EmotionCheckIn");
  const symptomCheckIns = useList("symptomCheckIns", "SymptomCheckIn");
  const alters = useList("alters", "Alter");
  const limit = Math.max(1, Math.min(50, parseInt(settings?.limit, 10) || (mode === "expanded" ? 20 : 8)));

  const rows = useMemo(() => {
    const emo = checkIns.map((c) => ({
      id: c.id, kind: "emotion", ts: c.timestamp,
      title: (c.emotions || []).join(", ") || "Check-in",
      intensity: c.intensity, alterId: c.alter_id, distress: c.is_distress,
    }));
    const sym = mode === "minimal" ? [] : symptomCheckIns.map((s) => ({
      id: s.id, kind: "symptom", ts: s.timestamp,
      title: s.symptom_name || s.name || "Symptom", intensity: s.intensity, alterId: s.alter_id,
    }));
    return [...emo, ...sym].sort((a, b) => new Date(b.ts) - new Date(a.ts)).slice(0, limit);
  }, [checkIns, symptomCheckIns, limit, mode]);

  const alterOf = (id) => alters.find((a) => a.id === id);
  const stamp = (ts) => (isSameDay(new Date(ts), new Date())
    ? format(new Date(ts), "HH:mm")
    : format(new Date(ts), "d MMM HH:mm"));

  return (
    <Section label="Check-in log" action={<TextAction onClick={() => navigate("/checkin-log")}>All</TextAction>}>
      {rows.length === 0 && <Muted>No check-ins yet.</Muted>}
      {rows.map((r) => {
        const a = r.alterId ? alterOf(r.alterId) : null;
        return (
          <Row
            key={`${r.kind}-${r.id}`}
            left={mode === "minimal" ? undefined : <Dot color={r.distress ? "#e06666" : a?.color} />}
            primary={r.title}
            secondary={mode === "expanded" && a ? (a.alias || a.name) : undefined}
            right={mode === "minimal" ? stamp(r.ts) : `${r.intensity ? `${r.intensity} · ` : ""}${stamp(r.ts)}`}
            onClick={() => navigate(r.kind === "emotion" ? `/checkin-log?id=${r.id}` : "/checkin-log")}
          />
        );
      })}
    </Section>
  );
}

// ── Daily / recurring tasks ────────────────────────────────────────
// One widget, any mix of sets (daily / weekly / monthly / yearly) — each
// set is its own little group with its own done count. Older widgets
// carry a single `frequency`; read that when `frequencies` is unset.
const ALL_FREQS = ["daily", "weekly", "monthly", "yearly"];
export function DailyTasksWidget({ mode = "normal", settings }) {
  const navigate = useNavigate();
  const terms = useTerms();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(null);
  const frequencies = useMemo(() => {
    const raw = Array.isArray(settings?.frequencies) ? settings.frequencies
      : (settings?.frequency ? [settings.frequency] : ["daily"]);
    const list = ALL_FREQS.filter((f) => raw.includes(f));
    return list.length ? list : ["daily"];
  }, [settings?.frequencies, settings?.frequency]);
  const templates = useList("dailyTaskTemplates", "DailyTaskTemplate");
  const progress = useList("dailyProgress", "DailyProgress");

  const groups = useMemo(() => frequencies.map((frequency) => {
    const periodKey = getPeriodKey(frequency);
    const record = progress.find((p) => ((p.frequency || "daily") === frequency)
      && (p.period_key === periodKey || (frequency === "daily" && p.date === getTodayString()))) || null;
    const recordIds = new Set(record?.completed_task_ids || []);
    const mine = templates
      .filter((t) => t.is_active !== false && (t.frequency || "daily") === frequency && isTaskDueOn(t))
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    // A task with its own reset anchor (weekday / rolling) is judged from
    // its last completion, not the shared calendar record.
    const isDone = (t) => (hasCustomReset(t) ? isCustomResetDone(t, progress) : recordIds.has(t.id));
    const doneCount = mine.filter(isDone).length;
    return { frequency, periodKey, mine, isDone, doneCount };
  }), [frequencies, progress, templates]);

  const toggle = async (g, t) => {
    // Auto tasks tick themselves off when the thing they track happens —
    // ticking one by hand would lie about what was done.
    if (t.mode === "AUTO") {
      toast.info("This one ticks itself off when you do the thing it tracks.");
      return;
    }
    setBusy(t.id);
    try {
      const on = g.isDone(t);
      const templatesFor = templates.filter((x) => (x.frequency || "daily") === g.frequency);
      if (on && hasCustomReset(t)) {
        // Un-doing a custom-reset task clears it from the record that
        // holds its latest completion (which may not be this period's).
        const last = lastCompletionOf(t.id, progress);
        const rec = last?.record;
        await toggleDailyProgressTasks({
          periodKey: rec?.period_key || g.periodKey, dateKey: rec?.date || getTodayString(), frequency: g.frequency,
          setIds: [], clearIds: [t.id], templates: templatesFor,
        });
      } else {
        await toggleDailyProgressTasks({
          periodKey: g.periodKey, dateKey: getTodayString(), frequency: g.frequency,
          setIds: on ? [] : [t.id], clearIds: on ? [t.id] : [], templates: templatesFor,
        });
      }
      qc.invalidateQueries({ queryKey: ["dailyProgress"] });
    } catch (e) {
      toast.error(e?.message || "Couldn't save that.");
    } finally {
      setBusy(null);
    }
  };

  const multi = groups.length > 1;
  const label = multi ? "Recurring tasks" : `${FREQUENCY_LABELS?.[groups[0].frequency] || "Daily"} tasks`;
  const totalDone = groups.reduce((n, g) => n + g.doneCount, 0);
  const totalAll = groups.reduce((n, g) => n + g.mine.length, 0);
  const openPage = () => navigate("/tasks");

  const GroupHead = ({ g }) => (multi ? (
    <div className="flex items-center justify-between pt-1 first:pt-0">
      <span className="text-[0.625em] font-semibold uppercase tracking-wider text-muted-foreground">
        {FREQUENCY_LABELS?.[g.frequency] || g.frequency}
      </span>
      <span className="text-[0.625em] text-muted-foreground">{g.doneCount}/{g.mine.length}</span>
    </div>
  ) : null);

  if (mode === "minimal") {
    return (
      <Section label={label} action={<TextAction onClick={openPage}>{totalDone}/{totalAll}</TextAction>}>
        {groups.map((g) => (
          <React.Fragment key={g.frequency}>
            <GroupHead g={g} />
            {g.mine.length === 0 && <Muted>No {g.frequency} tasks set up.</Muted>}
            {g.mine.slice(0, 8).map((t) => (
              <Row key={t.id} primary={applyTerms(t.title || "", terms)}
                right={g.isDone(t) ? "done" : undefined} />
            ))}
          </React.Fragment>
        ))}
      </Section>
    );
  }

  return (
    <Section label={label}
      action={<TextAction onClick={openPage}>{totalDone}/{totalAll} done</TextAction>}>
      {groups.map((g) => (
        <React.Fragment key={g.frequency}>
          <GroupHead g={g} />
          {g.mine.length === 0 && <Muted>No {g.frequency} tasks set up yet.</Muted>}
          {g.mine.map((t) => {
            const on = g.isDone(t);
            return (
              <Row
                key={t.id}
                left={
                  <button type="button" onClick={() => toggle(g, t)} disabled={busy === t.id}
                    aria-label={on ? "Mark not done" : "Mark done"} className="flex-shrink-0 disabled:opacity-50">
                    {on
                      ? <CheckCircle2 className="w-4 h-4" style={{ color: "var(--v2-accent, hsl(var(--primary)))" }} />
                      : <Circle className="w-4 h-4 text-muted-foreground" />}
                  </button>
                }
                primary={<span className={on ? "line-through opacity-60" : undefined}>{applyTerms(t.title || "", terms)}</span>}
                secondary={mode === "expanded" && t.mode === "AUTO" ? "automatic" : undefined}
                right={mode === "expanded" && t.points ? `${t.points} xp` : undefined}
                onClick={t.nav_path ? () => navigate(t.nav_path) : undefined}
              />
            );
          })}
        </React.Fragment>
      ))}
    </Section>
  );
}

// ── Chat channels ──────────────────────────────────────────────────
export function ChatChannelsWidget({ mode = "normal", settings }) {
  const navigate = useNavigate();
  const terms = useTerms();
  const channels = useList("systemChatChannels", "SystemChatChannel", true);
  // Only loaded when the widget actually shows last-activity stamps.
  const { data: messages = [] } = useQuery({
    queryKey: ["systemChatMessages"],
    queryFn: () => localEntities.SystemChatMessage.list(),
    enabled: mode !== "minimal",
  });
  const { data: activeFront = [] } = useQuery({
    queryKey: ["activeFront"],
    queryFn: () => base44.entities.FrontingSession.filter({ is_active: true }),
  });
  const frontSet = useMemo(
    () => new Set(activeFront.map((s) => s.alter_id || s.primary_alter_id).filter(Boolean)),
    [activeFront],
  );
  // Same privacy gate as the Chat page: a private channel only shows its
  // name while one of its members is here. Otherwise the widget won't
  // name it and won't open it directly.
  const visible = (c) => !c?.is_private || (c.member_alter_ids || []).some((id) => frontSet.has(id));

  const lastByChannel = useMemo(() => {
    const out = {};
    for (const m of messages) {
      const t = new Date(m.timestamp || m.created_date || 0).getTime();
      if (!out[m.channel_id] || t > out[m.channel_id]) out[m.channel_id] = t;
    }
    return out;
  }, [messages]);

  const list = useMemo(
    () => [...channels].sort((a, b) => (lastByChannel[b.id] || 0) - (lastByChannel[a.id] || 0)),
    [channels, lastByChannel],
  );

  const open = (c) => navigate(visible(c) ? `/chat?channel=${c.id}` : "/chat");

  return (
    <Section label={applyTerms("{{System}} chat", terms)} action={<TextAction onClick={() => navigate("/chat")}>Open</TextAction>}>
      {list.length === 0 && <Muted>No channels yet — make one on the Chat page.</Muted>}
      {list.map((c) => {
        const hidden = !visible(c);
        const last = lastByChannel[c.id];
        return (
          <Row
            key={c.id}
            left={mode === "minimal" ? undefined : (hidden
              ? <Lock className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              : <Hash className="w-3.5 h-3.5 flex-shrink-0" style={{ color: c.color || "var(--v2-accent)" }} />)}
            primary={hidden ? "Private" : (c.name || "Channel")}
            secondary={mode === "expanded" && !hidden ? c.description : undefined}
            right={mode !== "minimal" && last
              ? (isSameDay(new Date(last), new Date()) ? format(new Date(last), "HH:mm") : format(new Date(last), "d MMM"))
              : undefined}
            onClick={() => open(c)}
          />
        );
      })}
    </Section>
  );
}

// ── Grounding techniques ───────────────────────────────────────────
// Tap runs the technique right here, in the app's own guided view.
export function GroundingWidget({ mode = "normal", settings }) {
  const navigate = useNavigate();
  const techniques = useList("groundingTechniques", "GroundingTechnique");
  const prefs = useList("groundingPreferences", "GroundingPreference");
  const alters = useList("alters", "Alter");
  const sortAlters = useFrontersFirst();
  const { data: activeFront = [] } = useQuery({
    queryKey: ["activeFront"],
    queryFn: () => base44.entities.FrontingSession.filter({ is_active: true }),
  });
  const currentAlter = useMemo(() => {
    const lead = activeFront.find((s) => s.is_primary && s.alter_id) || activeFront.find((s) => s.alter_id);
    return lead ? alters.find((a) => a.id === lead.alter_id) || null : null;
  }, [activeFront, alters]);
  const [running, setRunning] = useState(null);

  const prefMap = useMemo(() => Object.fromEntries(prefs.map((p) => [p.technique_id, p])), [prefs]);
  const picked = Array.isArray(settings?.techniqueIds) ? settings.techniqueIds : [];
  const list = useMemo(() => {
    // The Support page seeds the built-in techniques on its first visit.
    // Until then the widget shows them read-only rather than looking
    // broken — it never writes to the catalogue itself.
    const stored = techniques.filter((t) => !t.is_archived);
    const active = stored.length ? stored : DEFAULT_TECHNIQUES.map((t, i) => ({ ...t, id: `default-${i}` }));
    if (picked.length) {
      const order = new Map(picked.map((id, i) => [id, i]));
      return active.filter((t) => order.has(t.id)).sort((a, b) => order.get(a.id) - order.get(b.id));
    }
    // No explicit pick: favourites first, then whatever else is there.
    return [...active].sort((a, b) => (prefMap[b.id]?.is_favorited ? 1 : 0) - (prefMap[a.id]?.is_favorited ? 1 : 0));
  }, [techniques, picked, prefMap]);

  const shown = list.slice(0, mode === "expanded" ? 20 : 6);

  return (
    <Section label="Grounding" action={<TextAction onClick={() => navigate("/grounding")}>All</TextAction>}>
      {shown.length === 0 && <Muted>No techniques yet — add some on the Support page.</Muted>}
      {shown.map((t) => (
        <Row
          key={t.id}
          left={mode === "minimal" ? undefined : <Wind className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
          primary={t.name}
          secondary={mode === "expanded" ? (t.category || t.description) : undefined}
          right={prefMap[t.id]?.is_favorited ? "★" : undefined}
          onClick={() => (mode === "minimal" ? navigate("/grounding") : setRunning(t))}
        />
      ))}
      <Drawer open={!!running} onOpenChange={(o) => !o && setRunning(null)}>
        <DrawerContent className="max-h-[92vh]" {...sheetPortalGuards}>
          <div className="overflow-y-auto overscroll-contain px-4 pb-6">
            {running && (
              <GuidedTechniqueView
                technique={running}
                preference={prefMap[running.id]}
                currentAlter={currentAlter}
                alters={sortAlters(alters.filter((a) => !a.is_archived))}
                onBack={() => setRunning(null)}
                backLabel="Close"
              />
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </Section>
  );
}

// ── Learning modules ───────────────────────────────────────────────
export function LearnWidget({ mode = "normal", settings }) {
  const navigate = useNavigate();
  const progress = useList("learningProgress", "LearningProgress");
  const doneIds = useMemo(() => new Set(progress.filter((p) => p.completed).map((p) => p.topic_id)), [progress]);

  const modules = useMemo(() => CURRICULUM.map((m) => {
    const total = (m.topics || []).length;
    const done = (m.topics || []).filter((t) => doneIds.has(t.id)).length;
    return { ...m, total, done, next: (m.topics || []).find((t) => !doneIds.has(t.id)) || null };
  }), [doneIds]);

  const goTopic = (topicId) => navigate(`/grounding?tab=learn${topicId ? `&topic=${topicId}` : ""}`);

  if (mode === "minimal") {
    const total = modules.reduce((s, m) => s + m.total, 0);
    const done = modules.reduce((s, m) => s + m.done, 0);
    return (
      <Section label="Learn" action={<TextAction onClick={() => goTopic(null)}>{done}/{total}</TextAction>}>
        {modules.map((m) => (
          <Row key={m.id} primary={m.title} right={`${m.done}/${m.total}`} onClick={() => goTopic(m.next?.id)} />
        ))}
      </Section>
    );
  }

  return (
    <Section label="Learn" action={<TextAction onClick={() => goTopic(null)}>Open</TextAction>}>
      {modules.map((m) => (
        <div key={m.id}>
          <Row
            left={<span className="text-base leading-none flex-shrink-0">{m.emoji || "📘"}</span>}
            primary={m.title}
            right={`${m.done}/${m.total}`}
            onClick={() => goTopic(m.next?.id || (m.topics || [])[0]?.id)}
          />
          {mode === "expanded" && (
            <div className="h-1 rounded-full bg-muted/50 overflow-hidden mt-0.5 mb-1">
              <div className="h-full" style={{
                width: `${m.total ? Math.round((m.done / m.total) * 100) : 0}%`,
                background: "var(--v2-accent, hsl(var(--primary)))",
              }} />
            </div>
          )}
          {mode === "expanded" && m.next && (
            <p className="text-[0.6875em] text-muted-foreground truncate mb-1">Next: {m.next.title}</p>
          )}
        </div>
      ))}
    </Section>
  );
}

// ── Inner world ────────────────────────────────────────────────────
// The REAL canvas (InnerWorldMapV2, embedded mode) and the REAL list view
// — windows onto the System Map page, never re-drawings of it.
const InnerWorldMapLazy = React.lazy(() => import("@/components/systemmap/InnerWorldMapV2"));
const InnerWorldListLazy = React.lazy(() => import("@/components/systemmap/InnerWorldListView"));

export function InnerMapWidget({ settings }) {
  const navigate = useNavigate();
  const { data: maps = [] } = useQuery({ queryKey: ["innerWorldMaps"], queryFn: () => localEntities.InnerWorldMap.list() });
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  const { data: relationships = [], refetch } = useQuery({ queryKey: ["alterRelationships"], queryFn: () => base44.entities.AlterRelationship.list() });
  const live = maps.filter((m) => !m.is_archived).sort((a, b) => (a.order || 0) - (b.order || 0));
  const map = live.find((m) => m.id === settings?.mapId) || live[0] || null;
  const layerId = settings?.layerId || null;
  const openPath = map
    ? `/system-map?view=inner&map=${encodeURIComponent(map.id)}${layerId ? `&layer=${encodeURIComponent(layerId)}${settings?.soloLayer ? "&solo=1" : ""}` : ""}`
    : "/system-map?view=inner";
  return (
    <Section label={map?.name || "Inner world"} action={<TextAction onClick={() => navigate(openPath)}>Open</TextAction>}>
      {!map && <Muted>No maps yet — open the {"System Map"} to start one.</Muted>}
      {map && (
        <div className="flex-1 min-h-[140px] min-h-0 relative" data-own-hold>
          <React.Suspense fallback={<Muted>…</Muted>}>
            <InnerWorldMapLazy key={`${map.id}:${layerId || ""}:${settings?.soloLayer ? 1 : 0}`} embedded
              alters={alters} relationships={relationships} onRefreshRelationships={refetch}
              initialMapId={map.id} initialLayerId={layerId} initialSolo={!!(layerId && settings?.soloLayer)} />
          </React.Suspense>
        </div>
      )}
    </Section>
  );
}

export function InnerLocationsWidget({ settings }) {
  const navigate = useNavigate();
  const { data: maps = [] } = useQuery({ queryKey: ["innerWorldMaps"], queryFn: () => localEntities.InnerWorldMap.list() });
  const { data: layers = [] } = useQuery({ queryKey: ["innerWorldLayers"], queryFn: () => localEntities.InnerWorldLayer.list() });
  const { data: locations = [] } = useQuery({ queryKey: ["innerWorldLocations"], queryFn: () => localEntities.InnerWorldLocation.list() });
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  const mapId = settings?.mapId || "";
  const fMaps = mapId ? maps.filter((m) => m.id === mapId) : maps.filter((m) => !m.is_archived);
  const fLayers = mapId ? layers.filter((l) => l.map_id === mapId) : layers;
  const fLocations = mapId ? locations.filter((l) => l.map_id === mapId) : locations;
  return (
    <Section label={mapId ? (maps.find((m) => m.id === mapId)?.name || "Locations") : "Inner world"}
      action={<TextAction onClick={() => navigate("/system-map?view=inner")}>Open</TextAction>}>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <React.Suspense fallback={<Muted>…</Muted>}>
          <InnerWorldListLazy maps={fMaps} layers={fLayers} locations={fLocations} alters={alters} />
        </React.Suspense>
      </div>
    </Section>
  );
}

export const MORE_WIDGET_ICONS = {
  timeline: CalendarClock, summary: ListChecks, checkins: Heart,
  dailyTasks: CheckCircle2, channels: Hash, grounding: Wind, learn: GraduationCap, clock: Clock,
};
