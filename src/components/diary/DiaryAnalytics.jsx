import React, { useState, useMemo } from "react";
import { format, parseISO, subDays } from "date-fns";
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
import { aggregateDailyMetrics, getAlterTendencies } from "@/lib/diaryAnalytics";

const RANGE_OPTIONS = [
  { label: "7d", days: 7 },
  { label: "14d", days: 14 },
  { label: "30d", days: 30 },
  { label: "All", days: 3650 },
];

const TABS = [
  { id: "symptoms", label: "🩺 Symptoms" },
  { id: "patterns", label: "🔥 Patterns" },
  { id: "dayofweek", label: "📅 Day of Week" },
  { id: "heatmap", label: "🗓️ Calendar" },
  { id: "alters", label: "🧑‍🤝‍🧑 Alters" },
];

const RATING_SYMPTOMS = SYMPTOMS.filter((s) => s.type === "rating");

export default function DiaryAnalytics({ cards, altersById = {} }) {
  const [rangeDays, setRangeDays] = useState(14);
  const [activeTab, setActiveTab] = useState("symptoms");

  const cutoff = subDays(new Date(), rangeDays);

  const filteredCards = useMemo(() =>
    cards
      .filter((c) => c.date && parseISO(c.date) >= cutoff)
      .sort((a, b) => a.date.localeCompare(b.date)),
    [cards, rangeDays]
  );

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

      {activeTab === "symptoms" && (
        <div className="space-y-5">
          <SymptomSelector dateRange={dateRange} onDateRangeChange={setDateRange} />
          <div className="space-y-1">
            <h3 className="text-sm font-semibold">Grid View</h3>
            <p className="text-xs text-muted-foreground">Like your paper checklist—see all symptoms at a glance</p>
          </div>
          <SymptomGridTable dailyAggregates={dailyAggregates} dateRange={dateRange} />
          <div className="space-y-1 pt-4">
            <h3 className="text-sm font-semibold">Trend View</h3>
            <p className="text-xs text-muted-foreground">Track how symptoms change over time</p>
          </div>
          <SymptomTrendCharts dailyAggregates={dailyAggregates} />
        </div>
      )}
      {activeTab === "patterns" && (
        <div className="space-y-5">
          <MetricFluctuationsChart
            dailyAggregates={dailyAggregates}
            metrics={["avg_emotional_misery", "avg_joy"]}
          />
          <DiaryHeatmap dailyAggregates={dailyAggregates} metric="avg_emotional_misery" />
        </div>
      )}
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
    </div>
  );
}