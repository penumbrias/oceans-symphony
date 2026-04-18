import React, { useState, useMemo } from "react";
import { format, parseISO, subDays, startOfDay, endOfDay } from "date-fns";
import { SYMPTOMS } from "./SymptomsChecklistPanel";
import RatingsChart from "./analytics/RatingsChart";
import HabitImpactChart from "./analytics/HabitImpactChart";
import AlterLoggingChart from "./analytics/AlterLoggingChart";
import WellnessOverview from "./analytics/WellnessOverview";
import DayOfWeekHeatmap from "./analytics/DayOfWeekHeatmap";
import MetricFluctuationsChart from "./analytics/MetricFluctuationsChart";
import DiaryHeatmap from "./analytics/DiaryHeatmap";
import SymptomGridTable from "./analytics/SymptomGridTable";
import SymptomTrendCharts from "./analytics/SymptomTrendCharts";
import SymptomSelector from "./analytics/SymptomSelector";
import EmotionsChart from "./analytics/EmotionsChart";
import UrgesToChart from "./analytics/UrgesToChart";
import MedicationChart from "./analytics/MedicationChart";
import { aggregateDailyMetrics, getAlterTendencies } from "@/lib/diaryAnalytics";

const RANGE_OPTIONS = [
  { label: "7d", days: 7 },
  { label: "14d", days: 14 },
  { label: "30d", days: 30 },
  { label: "All", days: 3650 },
];

const TABS = [
  { id: "dayofweek", label: "📅 Day of Week" },
  { id: "heatmap", label: "🗓️ Calendar" },
  { id: "alters", label: "🧑‍🤝‍🧑 Alters" },
];

const SYMPTOM_TABS = [
  { id: "grid", label: "📊 Grid" },
  { id: "trends", label: "📈 Trends" },
];

const RATING_SYMPTOMS = SYMPTOMS.filter((s) => s.type === "rating");

export default function DiaryAnalytics({ cards, altersById = {}, from, to }) {
  const [rangeDays, setRangeDays] = useState(7);
  const [activeTab, setActiveTab] = useState("dayofweek");
  const [symptomTab, setSymptomTab] = useState("grid");
  const [visibleSections, setVisibleSections] = useState({
    emotions: true,
    urges: true,
    medication: true,
    symptoms: true,
    patterns: true,
  });

  // Use passed date range if provided, otherwise use rangeDays
  const cutoff = from ? from : subDays(new Date(), rangeDays);
  const endDate = to ? to : new Date();

  const filteredCards = useMemo(() => {
    const startFilter = from ? startOfDay(from).getTime() : cutoff.getTime();
    const endFilter = to ? endOfDay(to).getTime() : new Date().getTime();
    return cards
      .filter((c) => {
        if (!c.date) return false;
        const ts = new Date(c.date).getTime();
        return ts >= startFilter && ts <= endFilter;
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [cards, rangeDays, from, to]);

  const dailyAggregates = useMemo(() =>
    aggregateDailyMetrics(filteredCards),
    [filteredCards]
  );

  const alterTendencies = useMemo(() =>
    getAlterTendencies(filteredCards),
    [filteredCards]
  );

  const ratingData = useMemo(() => {
    return filteredCards.map((c) => {
      const s = c.checklist?.symptoms || {};
      const row = { date: format(parseISO(c.date), "MMM d") };
      RATING_SYMPTOMS.forEach((sym) => {
        if (s[sym.id] !== undefined) row[sym.id] = s[sym.id];
      });
      if (c.body_mind?.emotional_misery !== undefined) row.emotional_misery = c.body_mind.emotional_misery;
      if (c.body_mind?.joy !== undefined) row.joy = c.body_mind.joy;
      if (c.urges?.self_harm !== undefined) row.self_harm_urge = c.urges.self_harm;
      return row;
    });
  }, [filteredCards]);

  if (cards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-muted-foreground text-sm">No diary cards yet — fill out a few daily cards to see analytics here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Range + entry count */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-muted-foreground">Range:</span>
        <div className="flex gap-1 bg-muted/40 p-1 rounded-xl">
          {RANGE_OPTIONS.map((r) => (
            <button
              key={r.label}
              onClick={() => setRangeDays(r.days)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                rangeDays === r.days ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground ml-auto">{filteredCards.length} entries</span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted/40 p-1 rounded-xl w-fit flex-wrap">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Day of Week, Calendar, Alters sections */}
      {activeTab === "dayofweek" && (
        <div className="space-y-5">
          <DayOfWeekHeatmap dailyAggregates={dailyAggregates} metric="avg_emotional_misery" />
          <DayOfWeekHeatmap dailyAggregates={dailyAggregates} metric="avg_joy" />
        </div>
      )}
      {activeTab === "heatmap" && (
        <div className="space-y-5">
          <DiaryHeatmap dailyAggregates={dailyAggregates} metric="avg_emotional_misery" />
          <DiaryHeatmap dailyAggregates={dailyAggregates} metric="avg_joy" />
        </div>
      )}
      {activeTab === "alters" && (
        <AlterLoggingChart filteredCards={filteredCards} altersById={altersById} alterTendencies={alterTendencies} />
      )}

      {/* Main toggleable sections */}
      <div className="space-y-5">
        {/* Toggle controls */}
        <div className="flex gap-1 bg-muted/40 p-1 rounded-xl w-fit flex-wrap">
          {[
            { id: "emotions", label: "📊 Emotions" },
            { id: "urges", label: "🆘 Urges" },
            { id: "medication", label: "💊 Medication" },
            { id: "symptoms", label: "🩺 Symptoms" },
            { id: "patterns", label: "🔥 Patterns" },
          ].map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setVisibleSections(prev => ({ ...prev, [id]: !prev[id] }))}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                visibleSections[id] ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Overview charts */}
        <div className="space-y-5">
          {visibleSections.emotions && <EmotionsChart filteredCards={filteredCards} />}
          {visibleSections.urges && <UrgesToChart filteredCards={filteredCards} />}
          {visibleSections.medication && <MedicationChart filteredCards={filteredCards} />}
        </div>

        {/* Symptoms section */}
        {visibleSections.symptoms && (
          <div className="space-y-3">
            <div className="flex gap-1 bg-muted/40 p-1 rounded-xl w-fit">
              {SYMPTOM_TABS.map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => setSymptomTab(id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    symptomTab === id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {symptomTab === "grid" && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold">Grid View</h3>
                  <p className="text-xs text-muted-foreground">Like your paper checklist—see all symptoms at a glance</p>
                </div>
                <SymptomGridTable dailyAggregates={dailyAggregates} dateRange={rangeDays} altersById={altersById} />
              </div>
            )}

            {symptomTab === "trends" && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold">Trend View</h3>
                  <p className="text-xs text-muted-foreground">Track how symptoms change over time</p>
                </div>
                <SymptomTrendCharts dailyAggregates={dailyAggregates} />
              </div>
            )}
          </div>
        )}

        {/* Patterns section */}
        {visibleSections.patterns && (
          <div className="space-y-5">
            <MetricFluctuationsChart
              dailyAggregates={dailyAggregates}
              metrics={["avg_emotional_misery", "avg_joy", "avg_physical_misery", "avg_urge_self_harm", "total_skills"]}
            />
            <DiaryHeatmap dailyAggregates={dailyAggregates} metric="avg_emotional_misery" />
            <DiaryHeatmap dailyAggregates={dailyAggregates} metric="avg_joy" />
            <DiaryHeatmap dailyAggregates={dailyAggregates} metric="avg_physical_misery" />
          </div>
        )}
      </div>
    </div>
  );
}