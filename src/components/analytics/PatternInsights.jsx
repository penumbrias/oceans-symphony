import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { computeSymptomBaseline } from "@/lib/analyticsEngine";
import TriggerSymptomChains from "./patterns/TriggerSymptomChains";
import PreSwitchSignature from "./patterns/PreSwitchSignature";
import SymptomCorrelationMatrix from "./patterns/SymptomCorrelationMatrix";
import AlterSymptomCorrelation from "./patterns/AlterSymptomCorrelation";
import SystemBaseline from "./patterns/SystemBaseline";
import LongTermSymptomTrend from "./patterns/LongTermSymptomTrend";
import SwitchTimeHeatmap from "./patterns/SwitchTimeHeatmap";
import RecoveryTime from "./patterns/RecoveryTime";
import HabitSymptomCorrelation from "./patterns/HabitSymptomCorrelation";
import AlterEmotionProfiles from "./patterns/AlterEmotionProfiles";
import NarrativeSummary from "./NarrativeSummary";
import WhatHelps from "./patterns/WhatHelps";
import AlterCoFrontingMap from "./patterns/AlterCoFrontingMap";

const TABS = [
  { id: "narrative",    label: "Summary",             desc: "Period narrative and early warning status" },
  { id: "baseline",     label: "Baseline",             desc: "Current vs your personal average" },
  { id: "triggers",     label: "Triggers → Symptoms",  desc: "What each trigger type activates" },
  { id: "preswitsch",   label: "Warning signs",        desc: "Symptoms before a switch" },
  { id: "correlations", label: "Symptom clusters",     desc: "Which symptoms move together" },
  { id: "alters",       label: "Alters & stress",      desc: "Who fronts during high/low periods" },
  { id: "emotions",     label: "Alter emotions",       desc: "Emotional patterns by system member" },
  { id: "longterm",     label: "Long-term trends",     desc: "Monthly symptom trajectory" },
  { id: "timing",       label: "Switch timing",        desc: "Day/time patterns for switches" },
  { id: "recovery",     label: "Recovery time",        desc: "How long symptoms take to stabilize after triggers" },
  { id: "habits",       label: "Habits & symptoms",    desc: "How habits correlate with symptom levels" },
  { id: "whathelps",    label: "What helps",           desc: "Grounding and coping preferences by member" },
  { id: "cofronting",   label: "Co-fronting map",      desc: "How often each pair of members fronts together" },
];

export default function PatternInsights({
  sessions, alters, altersById, symptomCheckIns, symptoms,
  emotionCheckIns, from, to,
}) {
  const [activeTab, setActiveTab] = useState("narrative");

  const { data: groundingTechniques = [] } = useQuery({
    queryKey: ["groundingTechniques"],
    queryFn: () => base44.entities.GroundingTechnique.list(),
  });

  const { data: groundingPreferences = [] } = useQuery({
    queryKey: ["groundingPreferences"],
    queryFn: () => base44.entities.GroundingPreference.list(),
  });

  const baseline = useMemo(
    () => computeSymptomBaseline(symptomCheckIns, symptoms),
    [symptomCheckIns, symptoms]
  );

  const hasAnyData = symptomCheckIns.length > 0 || sessions.length > 0;

  if (!hasAnyData) {
    return (
      <div className="py-16 text-center space-y-2">
        <p className="text-sm font-medium text-foreground">No data yet for pattern analysis</p>
        <p className="text-xs text-muted-foreground">
          Log symptoms via Quick Check-In and track fronting sessions to start seeing patterns here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-primary/5 border border-primary/20 rounded-xl px-4 py-3">
        <p className="text-xs text-primary/80 leading-relaxed">
          Pattern analysis uses all historical data for accuracy — more data reveals clearer patterns.
          The date range selector above applies to the Summary and Baseline views.
        </p>
      </div>

      {/* Tab pills — scrollable */}
      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
              activeTab === tab.id
                ? "bg-primary text-primary-foreground border-transparent"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab description */}
      <p className="text-xs text-muted-foreground -mt-1">
        {TABS.find(t => t.id === activeTab)?.desc}
      </p>

      {/* Content */}
      {activeTab === "narrative" && (
        <NarrativeSummary
          sessions={sessions}
          altersById={altersById || {}}
          symptomCheckIns={symptomCheckIns}
          symptoms={symptoms}
          emotionCheckIns={emotionCheckIns}
          from={from}
          to={to}
        />
      )}

      {activeTab === "baseline" && (
        <SystemBaseline
          symptomCheckIns={symptomCheckIns}
          symptoms={symptoms}
          baseline={baseline}
          from={from}
          to={to}
        />
      )}

      {activeTab === "triggers" && (
        <TriggerSymptomChains
          frontingSessions={sessions}
          symptomCheckIns={symptomCheckIns}
          symptoms={symptoms}
          baseline={baseline}
        />
      )}

      {activeTab === "preswitsch" && (
        <PreSwitchSignature
          frontingSessions={sessions}
          symptomCheckIns={symptomCheckIns}
          symptoms={symptoms}
          baseline={baseline}
        />
      )}

      {activeTab === "correlations" && (
        <SymptomCorrelationMatrix
          symptomCheckIns={symptomCheckIns}
          symptoms={symptoms}
        />
      )}

      {activeTab === "alters" && (
        <AlterSymptomCorrelation
          frontingSessions={sessions}
          alters={alters}
          symptomCheckIns={symptomCheckIns}
          symptoms={symptoms}
          baseline={baseline}
        />
      )}

      {activeTab === "emotions" && (
        <AlterEmotionProfiles
          alters={alters}
          emotionCheckIns={emotionCheckIns}
        />
      )}

      {activeTab === "longterm" && (
        <LongTermSymptomTrend
          symptomCheckIns={symptomCheckIns}
          symptoms={symptoms}
          baseline={baseline}
        />
      )}

      {activeTab === "timing" && (
        <SwitchTimeHeatmap frontingSessions={sessions} />
      )}

      {activeTab === "recovery" && (
        <RecoveryTime
          frontingSessions={sessions}
          symptomCheckIns={symptomCheckIns}
          baseline={baseline}
        />
      )}

      {activeTab === "habits" && (
        <HabitSymptomCorrelation
          symptomCheckIns={symptomCheckIns}
          symptoms={symptoms}
        />
      )}

      {activeTab === "whathelps" && (
        <WhatHelps
          techniques={groundingTechniques}
          preferences={groundingPreferences}
          alters={alters}
        />
      )}

      {activeTab === "cofronting" && (
        <AlterCoFrontingMap
          frontingSessions={sessions}
          alters={alters}
        />
      )}
    </div>
  );
}
