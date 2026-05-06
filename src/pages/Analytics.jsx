import React, { useState, useMemo } from "react";
import { base44, localEntities } from "@/api/base44Client";
import { buildAbsorptionMap } from "@/lib/absorptionUtils";
import { useQuery } from "@tanstack/react-query";
import { useTerms } from "@/lib/useTerms";
import { motion } from "framer-motion";
import { subDays, startOfDay, endOfDay } from "date-fns";
import { BarChart2, Hash, Clock, TrendingUp, TrendingDown, Timer, ChevronLeft, Star, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import DateRangePicker from "@/components/analytics/DateRangePicker";
import AlterStatRow from "@/components/analytics/AlterStatRow";
import ActivityHeatmap from "@/components/analytics/ActivityHeatmap";
import TimeOfDayFronters from "@/components/analytics/TimeOfDayFronters";
import DiaryAnalytics from "@/components/diary/DiaryAnalytics";
import EmotionAnalytics from "@/components/emotions/EmotionAnalytics";
import ActivityFrequencyChart from "@/components/analytics/ActivityFrequencyChart";
import AlterActivityMatrix from "@/components/analytics/AlterActivityMatrix";
import ActivityTrendsChart from "@/components/analytics/ActivityTrendsChart";
import ActivityTimeOfDayChart from "@/components/analytics/ActivityTimeOfDayChart";
import AlterFrontingTimeline from "@/components/analytics/AlterFrontingTimeline";
import ActivitySummaryCards from "@/components/analytics/ActivitySummaryCards";
import AlterActivityDeepDive from "@/components/analytics/AlterActivityDeepDive";
import SymptomAnalytics from "@/components/analytics/SymptomAnalytics";
import SleepAnalytics from "@/components/analytics/SleepAnalytics";
import JournalAnalytics from "@/components/analytics/JournalAnalytics";
import CoFrontingAnalytics from "@/components/analytics/CoFrontingAnalytics";
import SwitchLogAnalytics from "@/components/analytics/SwitchLogAnalytics";
import CheckInAnalytics from "@/components/analytics/CheckInAnalytics";
import PatternInsights from "@/components/analytics/PatternInsights";
import LocationAnalytics from "@/components/analytics/LocationAnalytics";

const MODES = [
  { id: "total",      label: "Total",    icon: Clock },
  { id: "primary",    label: "Primary",  icon: Star },
  { id: "cofronting", label: "Co-front", icon: Users },
  { id: "average",    label: "Average",  icon: Timer },
  { id: "max",        label: "Max",      icon: TrendingUp },
  { id: "min",        label: "Min",      icon: TrendingDown },
  { id: "count",      label: "Count",    icon: Hash },
];

function computeStats(sessions, alters, from, to) {
  const fromMs = startOfDay(from).getTime();
  const toMs = endOfDay(to).getTime();
  const filtered = sessions.filter((s) => {
    const st = new Date(s.start_time).getTime();
    return st >= fromMs && st <= toMs;
  });
  const alterMap = {};
  for (const alter of alters) {
    alterMap[alter.id] = { alter, total: 0, primary: 0, cofronting: 0, sessions: [], count: 0 };
  }
  for (const s of filtered) {
    const start = new Date(s.start_time).getTime();
    const end = s.end_time ? new Date(s.end_time).getTime() : Date.now();
    const dur = Math.max(end - start, 0);
    if (s.alter_id) {
      if (!alterMap[s.alter_id]) continue;
      alterMap[s.alter_id].total += dur;
      alterMap[s.alter_id].sessions.push(dur);
      alterMap[s.alter_id].count += 1;
      if (s.is_primary) alterMap[s.alter_id].primary += dur;
    } else {
      const ids = [s.primary_alter_id, ...(s.co_fronter_ids || [])].filter(Boolean);
      for (const id of ids) {
        if (!alterMap[id]) continue;
        alterMap[id].total += dur;
        alterMap[id].sessions.push(dur);
        alterMap[id].count += 1;
        if (s.primary_alter_id === id) alterMap[id].primary += dur;
        else alterMap[id].cofronting += dur;
      }
    }
  }
  // For new individual model: compute co-fronting time via overlaps
  const individualSessions = filtered.filter(s => s.alter_id);
  for (const s of individualSessions) {
    const id = s.alter_id;
    if (!alterMap[id]) continue;
    const sStart = new Date(s.start_time).getTime();
    const sEnd = s.end_time ? new Date(s.end_time).getTime() : Date.now();
    const hasOverlap = individualSessions.some(other => {
      if (other.id === s.id || other.alter_id === id) return false;
      const oStart = new Date(other.start_time).getTime();
      const oEnd = other.end_time ? new Date(other.end_time).getTime() : Date.now();
      return oStart < sEnd && oEnd > sStart;
    });
    if (hasOverlap) alterMap[id].cofronting += (sEnd - sStart);
  }
  return { alterMap, filtered };
}

// Landing page section cards
function SectionGrid({ terms, onSelect }) {
  const sections = [
    { id: "alters", emoji: "🧑‍🤝‍🧑", label: `${terms.System} Members`, desc: "Fronting time and patterns" },
    { id: "activities", emoji: "⚡", label: "Activities", desc: "What you've been doing" },
    { id: "emotions", emoji: "💜", label: "Emotions", desc: "Mood and check-in trends" },
    { id: "symptoms", emoji: "💊", label: "Symptoms", desc: "Symptom and habit tracking" },
    { id: "diary", emoji: "📔", label: "Daily Log", desc: "Diary card summaries" },
    { id: "sleep", emoji: "😴", label: "Sleep", desc: "Sleep patterns" },
    { id: "journals", emoji: "📖", label: "Journals", desc: "Writing activity" },
    { id: "cofronting", emoji: "🔀", label: terms.Cofronting, desc: "Who fronts together" },
    { id: "switchlogs", emoji: "🔄", label: `${terms.Switch} Logs`, desc: "Triggers, symptoms, and patterns" },
    { id: "checkins", emoji: "✅", label: `${terms.System} Meetings`, desc: "Frequency and member insights" },
    { id: "patterns", emoji: "🔍", label: "Patterns & Insights", desc: "Cross-system correlations and trends" },
    { id: "locations", emoji: "📍", label: "Locations", desc: "Where you go and patterns by place" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {sections.map((s) => (
        <button
          key={s.id}
          onClick={() => onSelect(s.id)}
          className="bg-card border border-border/50 rounded-xl p-4 text-left hover:bg-muted/30 hover:border-primary/40 hover:shadow-sm transition-all active:scale-[0.98] space-y-1.5 group"
        >
          <span className="text-2xl group-hover:scale-110 transition-transform inline-block">{s.emoji}</span>
          <p className="font-semibold text-sm text-foreground leading-tight">{s.label}</p>
          <p className="text-xs text-muted-foreground leading-snug">{s.desc}</p>
        </button>
      ))}
    </div>
  );
}

export default function Analytics() {
  const terms = useTerms();
  const [activeSection, setActiveSection] = useState(null);
  const [preset, setPreset] = useState("30d");
  const [from, setFrom] = useState(subDays(new Date(), 30));
  const [to, setTo] = useState(new Date());
  const [mode, setMode] = useState("total");
  const [showArchived, setShowArchived] = useState(false);
  const [topTab, setTopTab] = useState("stats");
  const [activitySubTab, setActivitySubTab] = useState("overview");

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

  const ACTIVITY_SUB_TABS = [
    { id: "overview", label: "Overview" },
    { id: "trends", label: "Trends" },
    { id: "alters", label: `${terms.Alter} × Activity` },
    { id: "deep", label: "Deep Dive" },
  ];

  const { data: sessions = [], isLoading: sessionsLoading } = useQuery({
    queryKey: ["frontHistory"],
    queryFn: () => base44.entities.FrontingSession.list("-start_time", 2000),
  });
  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });
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

  const { alterMap: rawAlterMap, filtered } = useMemo(
    () => computeStats(sessions, alters, from, to),
    [sessions, alters, from, to]
  );

  // Fold absorbed alters' stats into their persistent alter so analytics
  // reflects total front history including pre-fusion sessions
  const alterMap = useMemo(() => {
    if (!Object.keys(absorptionMap).length) return rawAlterMap;
    const result = {};
    Object.entries(rawAlterMap).forEach(([id, d]) => {
      result[id] = { ...d, sessions: [...d.sessions] };
    });
    Object.entries(absorptionMap).forEach(([absorbedId, persistentId]) => {
      const src = result[absorbedId];
      const dst = result[persistentId];
      if (!src || !dst) return;
      dst.total += src.total;
      dst.primary += src.primary;
      dst.cofronting += src.cofronting;
      dst.sessions = [...dst.sessions, ...src.sessions];
      dst.count += src.count;
      delete result[absorbedId];
    });
    return result;
  }, [rawAlterMap, absorptionMap]);

  const rows = useMemo(() => {
    return Object.values(alterMap)
      .filter((d) => d.count > 0 && (showArchived || !d.alter.is_archived))
      .map((d) => {
        let stat = 0;
        if (mode === "total")           stat = d.total;
        else if (mode === "primary")    stat = d.primary;
        else if (mode === "cofronting") stat = d.cofronting;
        else if (mode === "average")    stat = d.sessions.length ? d.total / d.sessions.length : 0;
        else if (mode === "max")        stat = d.sessions.length ? Math.max(...d.sessions) : 0;
        else if (mode === "min")        stat = d.sessions.length ? Math.min(...d.sessions) : 0;
        else if (mode === "count")      stat = d.count;
        return { alter: d.alter, stat };
      })
      .sort((a, b) => b.stat - a.stat);
  }, [alterMap, mode, showArchived]);

  const maxStat = rows.length > 0 ? rows[0].stat : 1;

  if (sessionsLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const SECTION_LABELS = {
    alters: `${terms.System} Members`,
    activities: "Activities",
    emotions: "Emotions",
    symptoms: "Symptoms",
    diary: "Daily Log",
    sleep: "Sleep",
    journals: "Journals",
    cofronting: terms.Cofronting,
    switchlogs: `${terms.Switch} Logs`,
    checkins: `${terms.System} Meetings`,
    patterns: "Patterns & Insights",
    locations: "Locations",
  };

  return (
    <div data-tour="analytics-charts" className="space-y-5">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        {activeSection ? (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" onClick={() => setActiveSection(null)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <div>
              <p className="text-xs text-muted-foreground">Analytics</p>
              <h1 className="font-display text-xl font-semibold leading-tight">{SECTION_LABELS[activeSection]}</h1>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <BarChart2 className="w-6 h-6 text-primary" />
            <div>
              <h1 className="font-display text-3xl font-semibold text-foreground">Analytics</h1>
              <p className="text-muted-foreground text-sm">Track {terms.system} and wellness data over time</p>
            </div>
          </div>
        )}
      </motion.div>

      {/* Global Date Range — preset chips + optional custom pickers */}
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

      {/* Landing grid */}
      {!activeSection && <SectionGrid terms={terms} onSelect={setActiveSection} />}

      {/* ── MEMBERS ── */}
      {activeSection === "alters" && (
        <div className="space-y-4">
          {/* Sub-tab pills */}
          <div className="flex gap-2">
            {[{ id: "stats", label: "Stats" }, { id: "timeofday", label: "Time of Day" }].map((t) => (
              <button key={t.id} onClick={() => setTopTab(t.id)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-all ${
                  topTab === t.id
                    ? "bg-primary text-primary-foreground border-transparent"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}>
                {t.label}
              </button>
            ))}
          </div>

          {topTab === "stats" && (
            <>
              <div className="mb-4">
                <ActivityHeatmap sessions={filtered} from={from} to={to} />
              </div>

              {/* Mode pills + archived toggle */}
              <div className="flex items-center gap-2 justify-between flex-wrap">
                <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                  {MODES.map((m) => {
                    const Icon = m.icon;
                    return (
                      <button key={m.id} onClick={() => setMode(m.id)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border flex-shrink-0 transition-all ${
                          mode === m.id
                            ? "bg-primary text-primary-foreground border-transparent"
                            : "border-border text-muted-foreground hover:text-foreground"
                        }`}>
                        <Icon className="w-3.5 h-3.5" />
                        {m.label}
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={() => setShowArchived(v => !v)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                    showArchived
                      ? "bg-muted text-foreground border-border"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {showArchived ? "Hide archived" : "Show archived"}
                </button>
              </div>

              {rows.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-center">
                  <BarChart2 className="w-10 h-10 text-muted-foreground/30 mb-3" />
                  <p className="text-muted-foreground text-sm">No {terms.fronting} data in this date range.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {rows.map(({ alter, stat }) => {
                    const d = alterMap[alter.id];
                    return (
                      <motion.div key={alter.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                        <AlterStatRow
                          alter={alter} stat={stat} mode={mode} maxStat={maxStat}
                          primaryMs={d?.primary || 0}
                          cofrontingMs={d?.cofronting || 0}
                          totalMs={d?.total || 0}
                        />
                      </motion.div>
                    );
                  })}
                </div>
              )}

              <div className="mt-4">
                <AlterFrontingTimeline sessions={filtered} alters={alters} from={from} to={to} />
              </div>
            </>
          )}

          {topTab === "timeofday" && (
            <TimeOfDayFronters sessions={filtered} alters={alters} />
          )}
        </div>
      )}

      {/* ── ACTIVITIES ── */}
      {activeSection === "activities" && (
        <div className="space-y-4">
          {/* Sub-tab pill row — horizontal scroll */}
          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            {ACTIVITY_SUB_TABS.map((t) => (
              <button key={t.id} onClick={() => setActivitySubTab(t.id)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium border flex-shrink-0 transition-all ${
                  activitySubTab === t.id
                    ? "bg-primary text-primary-foreground border-transparent"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}>
                {t.label}
              </button>
            ))}
          </div>

          {activitySubTab === "overview" && (
            <div className="space-y-6">
              <ActivitySummaryCards activities={activities} categories={activityCategories} from={from} to={to} />
              <ActivityFrequencyChart activities={activities} categories={activityCategories} from={from} to={to} />
              <ActivityTimeOfDayChart activities={activities} categories={activityCategories} from={from} to={to} />
            </div>
          )}
          {activitySubTab === "trends" && (
            <ActivityTrendsChart activities={activities} categories={activityCategories} from={from} to={to} />
          )}
          {activitySubTab === "alters" && (
            <AlterActivityMatrix activities={activities} categories={activityCategories} alters={alters} from={from} to={to} />
          )}
          {activitySubTab === "deep" && (
            <AlterActivityDeepDive
              activities={activities} categories={activityCategories} alters={alters}
              emotionCheckIns={emotionCheckIns} checkIns={systemCheckIns} from={from} to={to}
            />
          )}
        </div>
      )}

      {/* ── DIARY ── */}
      {activeSection === "diary" && (
        <DiaryAnalytics cards={cards} altersById={altersById} from={from} to={to} />
      )}

      {/* ── EMOTIONS ── */}
      {activeSection === "emotions" && (
        <EmotionAnalytics from={from} to={to} />
      )}

      {/* ── SYMPTOMS ── */}
      {activeSection === "symptoms" && (
        <SymptomAnalytics startDate={from} endDate={to} symptomSessions={symptomSessions} symptomCheckIns={symptomCheckIns} symptoms={symptoms} />
      )}

      {/* ── SLEEP ── */}
      {activeSection === "sleep" && (
        <SleepAnalytics sleepRecords={sleepRecords} from={from} to={to} />
      )}

      {/* ── JOURNALS ── */}
      {activeSection === "journals" && (
        <JournalAnalytics journals={journals} bulletins={bulletins} alters={alters} from={from} to={to} />
      )}

      {/* ── CO-FRONTING ── */}
      {activeSection === "cofronting" && (
        <CoFrontingAnalytics sessions={sessions} alters={alters} altersById={altersById} from={from} to={to} />
      )}

      {/* ── SWITCH LOGS ── */}
      {activeSection === "switchlogs" && (
        <SwitchLogAnalytics journals={journals} sessions={sessions} from={from} to={to} />
      )}

      {/* ── CHECK-INS ── */}
      {activeSection === "checkins" && (
        <CheckInAnalytics checkIns={systemCheckIns} alters={alters} from={from} to={to} />
      )}

      {/* ── LOCATIONS ── */}
      {activeSection === "locations" && (
        <LocationAnalytics from={from} to={to} />
      )}

      {/* ── PATTERNS & INSIGHTS ── */}
      {activeSection === "patterns" && (
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
      )}
    </div>
  );
}