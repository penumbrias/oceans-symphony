import React, { useState, useMemo } from "react";
import { base44, localEntities } from "@/api/base44Client";
import { buildAbsorptionMap } from "@/lib/absorptionUtils";
import { getAlterIdsByGroupFlag } from "@/lib/subsystemUtils";
import { useQuery } from "@tanstack/react-query";
import { useTerms } from "@/lib/useTerms";
import { motion } from "framer-motion";
import { subDays } from "date-fns";
import { BarChart2 } from "lucide-react";
import DateRangePicker from "@/components/analytics/DateRangePicker";
import TimeOfDayFronters from "@/components/analytics/TimeOfDayFronters";
import DiaryAnalytics from "@/components/diary/DiaryAnalytics";
import EmotionAnalytics from "@/components/emotions/EmotionAnalytics";
import ActivityFrequencyChart from "@/components/analytics/ActivityFrequencyChart";
import AlterActivityMatrix from "@/components/analytics/AlterActivityMatrix";
import ActivityTrendsChart from "@/components/analytics/ActivityTrendsChart";
import ActivityTimeOfDayChart from "@/components/analytics/ActivityTimeOfDayChart";
import ActivitySummaryCards from "@/components/analytics/ActivitySummaryCards";
import AlterActivityDeepDive from "@/components/analytics/AlterActivityDeepDive";
import SymptomAnalytics from "@/components/analytics/SymptomAnalytics";
import SleepAnalytics from "@/components/analytics/SleepAnalytics";
import JournalAnalytics from "@/components/analytics/JournalAnalytics";
import AuthorshipAnalytics from "@/components/analytics/AuthorshipAnalytics";
import SwitchLogAnalytics from "@/components/analytics/SwitchLogAnalytics";
import CheckInAnalytics from "@/components/analytics/CheckInAnalytics";
import PatternInsights from "@/components/analytics/PatternInsights";
import LocationAnalytics from "@/components/analytics/LocationAnalytics";
import InsightsHub from "@/components/analytics/InsightsHub";
import StaleSessionsModal from "@/components/analytics/StaleSessionsModal";
import OverviewTab from "@/components/analytics/OverviewTab";
import FrontingTab from "@/components/analytics/FrontingTab";
import WellbeingTab from "@/components/analytics/WellbeingTab";
import LifeTab from "@/components/analytics/LifeTab";
import AltersTab from "@/components/analytics/AltersTab";
import { useSearchParams } from "react-router-dom";
import {
  normalizeSessions,
  sessionsInRange,
  sliceByOverlap,
  staleOpenSessions,
} from "@/lib/sessionNormalizer";
import { startOfDay, endOfDay } from "date-fns";

// Per-alter totals computed via a sweep-line over normalised
// sessions (see /src/lib/sessionNormalizer.js). Single pass, no
// double counting, no `?? Date.now()` leakage past the range end.
// Unclosed sessions older than STALE_OPEN_SESSION_HOURS are still
// counted in full (their duration is the user's data to interpret,
// not ours to silently truncate) but get flagged via `stale` so the
// Analytics banner can prompt the user to review them.
function computeStats(sessions, alters, from, to) {
  const fromMs = startOfDay(from).getTime();
  const toMs = endOfDay(to).getTime();
  const now = Date.now();
  const normalised = normalizeSessions(sessions, now);
  const filtered = sessionsInRange(normalised, fromMs, toMs, now);

  const alterMap = {};
  for (const alter of alters) {
    alterMap[alter.id] = { alter, total: 0, primary: 0, cofronting: 0, solo: 0, sessions: [], count: 0 };
  }

  const slices = sliceByOverlap(filtered, fromMs, toMs, now);
  for (const slice of slices) {
    const dur = slice.endMs - slice.startMs;
    if (dur <= 0) continue;
    const ids = [...slice.aliveAlterIds];
    const isSolo = ids.length === 1;
    for (const id of ids) {
      const row = alterMap[id];
      if (!row) continue;
      row.total += dur;
      if (isSolo) row.solo += dur;
      else row.cofronting += dur;
    }
  }

  for (const s of filtered) {
    const start = Math.max(s.startMs, fromMs);
    const end = s.endMs != null
      ? Math.min(s.endMs, toMs)
      : Math.min(now, toMs);
    const dur = Math.max(0, end - start);
    if (dur <= 0) continue;
    for (const id of s.alterIds) {
      const row = alterMap[id];
      if (!row) continue;
      row.sessions.push(dur);
      row.count += 1;
      if (id === s.primaryAlterId) row.primary += dur;
    }
  }

  const stale = staleOpenSessions(filtered);
  const filteredRaw = filtered.map((s) => s.raw);

  return { alterMap, filtered: filteredRaw, normalised: filtered, slices, stale };
}

export default function Analytics() {
  const terms = useTerms();

  // ── New IA: four tabs replace the old 14-tile landing grid.
  //    Overview is the rebuilt engine-driven view; the other tabs
  //    temporarily house the existing section components (grouped by
  //    domain) until their phase of the rebuild replaces them — see the
  //    analytics-rebuild plan. Old section ids are preserved so nothing
  //    is lost in the cutover.
  // Deep-linkable: /analytics?tab=alters&alter=<id> (used by alter profiles).
  const [searchParams] = useSearchParams();
  const VALID_TABS = ["overview", "fronting", "wellbeing", "life", "alters"];
  const [activeTab, setActiveTab] = useState(() => {
    const t = searchParams.get("tab");
    return VALID_TABS.includes(t) ? t : "overview";
  });
  const [selectedAlterId, setSelectedAlterId] = useState(() => searchParams.get("alter") || null);

  const [preset, setPreset] = useState("30d");
  const [from, setFrom] = useState(subDays(new Date(), 30));
  const [to, setTo] = useState(new Date());
  const [staleModalOpen, setStaleModalOpen] = useState(false);

  const PRESETS = [
    { id: "7d",   label: "7d",       from: () => subDays(new Date(), 7) },
    { id: "30d",  label: "30d",      from: () => subDays(new Date(), 30) },
    { id: "90d",  label: "90d",      from: () => subDays(new Date(), 90) },
    { id: "1y",   label: "1y",       from: () => subDays(new Date(), 365) },
    { id: "all",  label: "All Time", from: () => new Date(0) },
    { id: "custom", label: "Custom", from: null },
  ];

  const applyPreset = (id) => {
    setPreset(id);
    const p = PRESETS.find(x => x.id === id);
    if (p?.from) { setFrom(p.from()); setTo(new Date()); }
  };

  const { data: allSessions = [], isLoading: sessionsLoading } = useQuery({
    queryKey: ["frontHistory"],
    queryFn: () => base44.entities.FrontingSession.list("-start_time", 2000),
  });
  const { data: allAlters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });
  const { data: analyticsGroups = [] } = useQuery({
    queryKey: ["groups"],
    queryFn: () => base44.entities.Group.list(),
  });
  // Group config: members of a group flagged "hide_from_analytics" are kept
  // out of every analytics section (and their sessions out of co-fronting).
  const hiddenFromAnalytics = useMemo(
    () => getAlterIdsByGroupFlag(analyticsGroups, allAlters, "hide_from_analytics"),
    [analyticsGroups, allAlters],
  );
  const alters = useMemo(
    () => (hiddenFromAnalytics.size ? allAlters.filter((a) => !hiddenFromAnalytics.has(a.id)) : allAlters),
    [allAlters, hiddenFromAnalytics],
  );
  const sessions = useMemo(
    () => (hiddenFromAnalytics.size ? allSessions.filter((s) => !hiddenFromAnalytics.has(s.alter_id || s.primary_alter_id)) : allSessions),
    [allSessions, hiddenFromAnalytics],
  );
  const { data: cards = [] } = useQuery({
    queryKey: ["diaryCards"],
    queryFn: () => base44.entities.DiaryCard.list("-created_date", 500),
  });
  const { data: activities = [] } = useQuery({
    queryKey: ["activities"],
    queryFn: () => base44.entities.Activity.list(),
  });
  const { data: activityCategories = [] } = useQuery({
    queryKey: ["activityCategories"],
    queryFn: () => base44.entities.ActivityCategory.list(),
  });
  const { data: emotionCheckIns = [] } = useQuery({
    queryKey: ["emotionCheckIns"],
    queryFn: () => base44.entities.EmotionCheckIn.list("-timestamp", 1000),
  });
  const { data: systemCheckIns = [] } = useQuery({
    queryKey: ["systemCheckIns"],
    queryFn: () => base44.entities.SystemCheckIn.list("-created_date", 500),
  });
  const { data: symptomSessions = [] } = useQuery({
    queryKey: ["symptomSessions"],
    queryFn: () => base44.entities.SymptomSession.list("-start_time", 1000),
  });
  const { data: symptomCheckIns = [] } = useQuery({
    queryKey: ["symptomCheckIns"],
    queryFn: () => base44.entities.SymptomCheckIn.list("-timestamp", 1000),
  });
  const { data: symptoms = [] } = useQuery({
    queryKey: ["symptoms"],
    queryFn: () => base44.entities.Symptom.list(),
  });
  const { data: sleepRecords = [] } = useQuery({
    queryKey: ["sleep"],
    queryFn: () => base44.entities.Sleep.list("-date", 500),
  });
  const { data: journals = [] } = useQuery({
    queryKey: ["journals"],
    queryFn: () => base44.entities.JournalEntry.list("-created_date", 500),
  });
  const { data: bulletins = [] } = useQuery({
    queryKey: ["bulletins"],
    queryFn: () => base44.entities.Bulletin.list("-created_date", 500),
  });
  const { data: mentionLogs = [] } = useQuery({
    queryKey: ["mentionLogs"],
    queryFn: () => base44.entities.MentionLog.list("-source_date", 3000),
  });
  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => base44.entities.Task.list(),
  });
  const { data: statusNotes = [] } = useQuery({
    queryKey: ["statusNotes"],
    queryFn: () => localEntities.StatusNote.list("-timestamp", 500),
  });
  const { data: contactEncounters = [] } = useQuery({
    queryKey: ["contactEncounters"],
    queryFn: () => base44.entities.ContactEncounter.list("-start_time", 1000),
  });
  const { data: goals = [] } = useQuery({
    queryKey: ["activityGoals"],
    queryFn: () => base44.entities.ActivityGoal.list(),
  });
  const { data: locations = [] } = useQuery({
    queryKey: ["locations"],
    queryFn: () => localEntities.Location.list("-timestamp", 2000),
  });
  const { data: contacts = [] } = useQuery({
    queryKey: ["contacts"],
    queryFn: () => base44.entities.Contact.list(),
  });
  const { data: chatMessages = [] } = useQuery({
    queryKey: ["systemChatMessages"],
    queryFn: () => localEntities.SystemChatMessage.list("-timestamp", 3000),
  });

  const { data: systemChangeEvents = [] } = useQuery({
    queryKey: ["systemChangeEvents"],
    queryFn: () => localEntities.SystemChangeEvent.list(),
  });

  const absorptionMap = useMemo(() => buildAbsorptionMap(systemChangeEvents), [systemChangeEvents]);

  const altersById = useMemo(() => {
    const map = {};
    alters.forEach((a) => { map[a.id] = a; });
    return map;
  }, [alters]);

  // NOTE: per-alter fronting TIME, the heatmap and the fronting timeline stay
  // on REAL fronting sessions only — "fronting time" should mean tracked
  // fronting, and authorship windows would otherwise look like phantom
  // fronting here. Inferred-from-authorship presence is applied where it
  // belongs: attributing activities / emotions / symptoms to alters (see
  // AlterActivityMatrix, EmotionAnalytics, SymptomAnalytics).
  const { filtered, stale } = useMemo(
    () => computeStats(sessions, alters, from, to),
    [sessions, alters, from, to]
  );

  // Remap absorbed alter IDs in sessions so TimeOfDayFronters attributes
  // pre-fusion sessions to the persistent alter, not the absorbed one
  const foldedSessions = useMemo(() => {
    if (!Object.keys(absorptionMap).length) return filtered;
    return filtered.map(s => {
      const newAlterId = absorptionMap[s.alter_id] || s.alter_id;
      const newPrimaryId = absorptionMap[s.primary_alter_id] || s.primary_alter_id;
      const newCoFronters = (s.co_fronter_ids || []).map(id => absorptionMap[id] || id);
      if (newAlterId === s.alter_id && newPrimaryId === s.primary_alter_id) return s;
      return { ...s, alter_id: newAlterId, primary_alter_id: newPrimaryId, co_fronter_ids: newCoFronters };
    });
  }, [filtered, absorptionMap]);

  if (sessionsLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const TABS = [
    { id: "overview", label: "Overview" },
    { id: "fronting", label: terms.Fronting },
    { id: "wellbeing", label: "Wellbeing" },
    { id: "life", label: "Life" },
    { id: "alters", label: terms.Alters },
  ];

  return (
    <div data-tour="analytics-charts" className="space-y-5">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3">
          <BarChart2 className="w-6 h-6 text-primary" />
          <div>
            <h1 className="font-display text-3xl font-semibold text-foreground">Analytics</h1>
            <p className="text-muted-foreground text-sm">Track {terms.system} and wellness data over time</p>
          </div>
        </div>
      </motion.div>

      {/* Top-level tabs */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold border flex-shrink-0 transition-all ${
              activeTab === t.id
                ? "bg-primary text-primary-foreground border-transparent shadow-sm"
                : "bg-card border-border/60 text-muted-foreground hover:text-foreground hover:border-primary/40"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Global Date Range — drives the domain tabs. Overview intentionally
          runs on its own fixed "this week vs your usual" window instead. */}
      {activeTab !== "overview" && (
        <div className="space-y-2">
          <div className="flex gap-1.5 flex-wrap">
            {PRESETS.map(p => (
              <button
                key={p.id}
                onClick={() => applyPreset(p.id)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                  preset === p.id
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-muted-foreground border-border hover:border-primary/40"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {preset === "custom" && (
            <DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
          )}
        </div>
      )}

      {/* ── OVERVIEW ── */}
      {activeTab === "overview" && (
        <OverviewTab
          sessions={sessions}
          alters={alters}
          altersById={altersById}
          emotionCheckIns={emotionCheckIns}
          symptomCheckIns={symptomCheckIns}
          activities={activities}
          sleepRecords={sleepRecords}
          journals={journals}
          diaryCards={cards}
          bulletins={bulletins}
          systemCheckIns={systemCheckIns}
          tasks={tasks}
          statusNotes={statusNotes}
          onNavigateTab={setActiveTab}
        />
      )}

      {/* ── FRONTING (rebuilt, Phase 2) ── */}
      {activeTab === "fronting" && (
        <FrontingTab
          sessions={sessions}
          alters={alters}
          altersById={altersById}
          from={from}
          to={to}
          stale={stale}
          onReviewStale={() => setStaleModalOpen(true)}
          timeOfDayNode={
            <TimeOfDayFronters sessions={foldedSessions} alters={alters.filter(a => !a.is_archived)} />
          }
          switchLogNode={
            <SwitchLogAnalytics journals={journals} sessions={sessions} from={from} to={to} />
          }
        />
      )}

      {/* ── WELLBEING (rebuilt, Phase 3) ── */}
      {activeTab === "wellbeing" && (
        <WellbeingTab
          sessions={sessions}
          emotionCheckIns={emotionCheckIns}
          symptomCheckIns={symptomCheckIns}
          symptoms={symptoms}
          sleepRecords={sleepRecords}
          activities={activities}
          activityCategories={activityCategories}
          contactEncounters={contactEncounters}
          systemChangeEvents={systemChangeEvents}
          from={from}
          to={to}
          legacySections={[
            { title: "Emotions", node: <EmotionAnalytics from={from} to={to} /> },
            { title: "Symptoms", node: <SymptomAnalytics startDate={from} endDate={to} symptomSessions={symptomSessions} symptomCheckIns={symptomCheckIns} symptoms={symptoms} /> },
            { title: "Check-In Log", node: <DiaryAnalytics cards={cards} altersById={altersById} from={from} to={to} /> },
            { title: "Sleep", node: <SleepAnalytics sleepRecords={sleepRecords} from={from} to={to} /> },
            { title: `${terms.System} Meetings`, node: <CheckInAnalytics checkIns={systemCheckIns} alters={alters} from={from} to={to} /> },
            { title: "Patterns (advanced)", node: (
              <PatternInsights
                sessions={sessions}
                alters={alters}
                altersById={altersById}
                symptomCheckIns={symptomCheckIns}
                symptoms={symptoms}
                emotionCheckIns={emotionCheckIns}
                from={from}
                to={to}
              />
            ) },
          ]}
        />
      )}

      {/* ── LIFE (rebuilt, Phase 4) ── */}
      {activeTab === "life" && (
        <LifeTab
          activities={activities}
          activityCategories={activityCategories}
          goals={goals}
          tasks={tasks}
          locations={locations}
          contacts={contacts}
          contactEncounters={contactEncounters}
          from={from}
          to={to}
          legacySections={[
            { title: "Activity charts (classic)", node: (
              <div className="space-y-6">
                <ActivitySummaryCards activities={activities} categories={activityCategories} from={from} to={to} />
                <ActivityFrequencyChart activities={activities} categories={activityCategories} from={from} to={to} />
                <ActivityTimeOfDayChart activities={activities} categories={activityCategories} from={from} to={to} />
                <ActivityTrendsChart activities={activities} categories={activityCategories} from={from} to={to} />
                <AlterActivityMatrix activities={activities} categories={activityCategories} alters={alters} from={from} to={to} />
                <AlterActivityDeepDive
                  activities={activities} categories={activityCategories} alters={alters}
                  emotionCheckIns={emotionCheckIns} checkIns={systemCheckIns} from={from} to={to}
                />
              </div>
            ) },
            { title: "Journals", node: <JournalAnalytics journals={journals} bulletins={bulletins} alters={alters} from={from} to={to} /> },
            { title: "Authorship", node: <AuthorshipAnalytics mentionLogs={mentionLogs} journals={journals} alters={alters} from={from} to={to} /> },
            { title: "Locations (map & details)", node: <LocationAnalytics from={from} to={to} /> },
            { title: "Rollups (classic)", node: <InsightsHub from={from} to={to} /> },
          ]}
        />
      )}

      {/* ── ALTERS (fingerprints, Phase 4) ── */}
      {activeTab === "alters" && (
        <AltersTab
          alters={alters}
          altersById={altersById}
          sessions={sessions}
          emotionCheckIns={emotionCheckIns}
          symptomCheckIns={symptomCheckIns}
          symptoms={symptoms}
          journals={journals}
          bulletins={bulletins}
          chatMessages={chatMessages}
          activities={activities}
          from={from}
          to={to}
          selectedAlterId={selectedAlterId}
          onSelectAlter={setSelectedAlterId}
        />
      )}

      <StaleSessionsModal
        isOpen={staleModalOpen}
        onClose={() => setStaleModalOpen(false)}
        staleSessions={stale || []}
        altersById={altersById}
      />
    </div>
  );
}
