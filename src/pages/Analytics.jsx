import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useTerms } from "@/lib/useTerms";
import { motion } from "framer-motion";
import { subDays, isWithinInterval, startOfDay, endOfDay, parseISO } from "date-fns";
import { BarChart2, Hash, Clock, TrendingUp, TrendingDown, Timer } from "lucide-react";
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

// MAIN_TABS defined dynamically in component

// ACTIVITY_SUB_TABS defined dynamically in component

const MODES = [
  { id: "total", label: "Total", icon: Clock, description: "Total fronting times" },
  { id: "average", label: "Average", icon: Timer, description: "Average fronting times" },
  { id: "max", label: "Max", icon: TrendingUp, description: "Maximum fronting times" },
  { id: "min", label: "Min", icon: TrendingDown, description: "Minimum fronting times" },
  { id: "count", label: "Count", icon: Hash, description: "Fronting count" },
];

const TOP_TABS = [
  { id: "stats", label: "Stats" },
  { id: "timeofday", label: "Time of Day" },
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
    alterMap[alter.id] = {
      alter,
      total: 0,
      sessions: [],
      count: 0,
    };
  }

  for (const s of filtered) {
    // Support both new (alter_id) and legacy (primary_alter_id) models
    const ids = s.alter_id
      ? [s.alter_id]
      : [s.primary_alter_id, ...(s.co_fronter_ids || [])].filter(Boolean);
    const start = new Date(s.start_time).getTime();
    const end = s.end_time ? new Date(s.end_time).getTime() : Date.now();
    const dur = Math.max(end - start, 0);

    for (const id of ids) {
      if (!alterMap[id]) continue;
      alterMap[id].total += dur;
      alterMap[id].sessions.push(dur);
      alterMap[id].count += 1;
    }
  }

  return { alterMap, filtered };
}

export default function Analytics() {
  const terms = useTerms();
  const MAIN_TABS = [
    { id: "alters", label: `${terms.System} Members` },
    { id: "activities", label: "Activities" },
    { id: "diary", label: "Diary Cards" },
    { id: "emotions", label: "Emotions" },
    { id: "symptoms", label: "Symptoms" },
  ];
  const ACTIVITY_SUB_TABS = [
    { id: "overview", label: "Overview" },
    { id: "trends", label: "Trends" },
    { id: "alters", label: `${terms.Alter} × Activity` },
    { id: "deep", label: "Deep Dive" },
  ];
  const [mainTab, setMainTab] = useState("alters");
  const [from, setFrom] = useState(subDays(new Date(), 30));
  const [to, setTo] = useState(new Date());
  const [mode, setMode] = useState("total");
  const [topTab, setTopTab] = useState("stats");
  const [activitySubTab, setActivitySubTab] = useState("overview");

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

  const altersById = useMemo(() => {
    const map = {};
    alters.forEach(a => { map[a.id] = a; });
    return map;
  }, [alters]);

  const { alterMap, filtered } = useMemo(
    () => computeStats(sessions, alters, from, to),
    [sessions, alters, from, to]
  );

  const rows = useMemo(() => {
    return Object.values(alterMap)
      .filter((d) => d.count > 0)
      .map((d) => {
        let stat = 0;
        if (mode === "total") stat = d.total;
        else if (mode === "average") stat = d.sessions.length ? d.total / d.sessions.length : 0;
        else if (mode === "max") stat = d.sessions.length ? Math.max(...d.sessions) : 0;
        else if (mode === "min") stat = d.sessions.length ? Math.min(...d.sessions) : 0;
        else if (mode === "count") stat = d.count;
        return { alter: d.alter, stat };
      })
      .sort((a, b) => b.stat - a.stat);
  }, [alterMap, mode]);

  const maxStat = rows.length > 0 ? rows[0].stat : 1;

  const totalSessions = filtered.length;
  const uniqueFronters = rows.length;

  if (sessionsLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <BarChart2 className="w-6 h-6 text-primary" />
          <h1 className="font-display text-3xl font-semibold text-foreground">Analytics</h1>
        </div>
        <p className="text-muted-foreground text-sm">
          Track {terms.system} and wellness data over time
        </p>
      </motion.div>

      {/* Main Tabs */}
      <div className="flex gap-1 bg-muted/50 rounded-xl p-1 mb-5">
        {MAIN_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setMainTab(t.id)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
              mainTab === t.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {mainTab === "alters" && (
        <>
          {/* Date Range */}
          <div className="mb-5">
            <DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
          </div>

      {/* Top tabs */}
      <div className="flex gap-1 bg-muted/50 rounded-xl p-1 mb-5">
        {TOP_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTopTab(t.id)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
              topTab === t.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {topTab === "stats" && (
        <>
          {/* Heatmap */}
          <div className="mb-5">
            <ActivityHeatmap sessions={filtered} from={from} to={to} />
          </div>

          {/* Mode tabs */}
          <div className="bg-card border border-border/50 rounded-xl p-1 flex gap-1 mb-4">
            {MODES.map((m) => {
              const Icon = m.icon;
              return (
                <button
                  key={m.id}
                  onClick={() => setMode(m.id)}
                  className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-lg transition-all text-xs font-medium ${
                    mode === m.id
                      ? "bg-primary text-primary-foreground shadow"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {m.label}
                </button>
              );
            })}
          </div>

          <p className="text-xs text-primary font-semibold uppercase tracking-wider mb-3">
            {MODES.find((m) => m.id === mode)?.description}
          </p>

          {rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <BarChart2 className="w-10 h-10 text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground text-sm">No {terms.fronting} data in this date range.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {rows.map(({ alter, stat }) => (
                <motion.div key={alter.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                  <AlterStatRow alter={alter} stat={stat} mode={mode} maxStat={maxStat} />
                </motion.div>
              ))}
            </div>
          )}

          <div className="mt-6">
            <AlterFrontingTimeline sessions={filtered} alters={alters} from={from} to={to} />
          </div>
        </>
      )}

      {topTab === "timeofday" && (
        <TimeOfDayFronters sessions={filtered} alters={alters} />
      )}
        </>
      )}

      {mainTab === "activities" && (
        <>
          <div className="mb-5">
            <DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
          </div>

          {/* Activity sub-tabs */}
          <div className="flex gap-1 bg-muted/50 rounded-xl p-1 mb-5">
            {ACTIVITY_SUB_TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setActivitySubTab(t.id)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                  activitySubTab === t.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
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
            <div className="space-y-6">
              <ActivityTrendsChart activities={activities} categories={activityCategories} from={from} to={to} />
            </div>
          )}

          {activitySubTab === "alters" && (
            <div className="space-y-6">
              <AlterActivityMatrix activities={activities} categories={activityCategories} alters={alters} from={from} to={to} />
            </div>
          )}

          {activitySubTab === "deep" && (
            <AlterActivityDeepDive
              activities={activities}
              categories={activityCategories}
              alters={alters}
              emotionCheckIns={emotionCheckIns}
              checkIns={systemCheckIns}
              from={from}
              to={to}
            />
          )}
        </>
      )}

      {mainTab === "diary" && (
         <DiaryAnalytics cards={cards} altersById={altersById} />
       )}

       {mainTab === "emotions" && (
         <>
           <div className="mb-5">
             <DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
           </div>
           <EmotionAnalytics from={from} to={to} />
         </>
       )}

       {mainTab === "symptoms" && (
         <>
           <div className="mb-5">
             <DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
           </div>
           <SymptomAnalytics startDate={from} endDate={to} />
         </>
       )}
      </div>
      );
      }