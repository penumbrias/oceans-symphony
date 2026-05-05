import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Users, User } from "lucide-react";
import {
  computeSymptomBaseline,
  buildGroupView,
  remapSessionsToGroups,
  remapEmotionCheckInsToGroups,
} from "@/lib/analyticsEngine";
import { useAnalyticsGrouping } from "@/lib/useAnalyticsGrouping";
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
  { id: "alters",       label: "Members & stress",     desc: "Who fronts during high/low periods" },
  { id: "emotions",     label: "Member emotions",      desc: "Emotional patterns by system member" },
  { id: "longterm",     label: "Long-term trends",     desc: "Monthly symptom trajectory" },
  { id: "timing",       label: "Switch timing",        desc: "Day/time patterns for switches" },
  { id: "recovery",     label: "Recovery time",        desc: "How long symptoms take to stabilize after triggers" },
  { id: "habits",       label: "Habits & symptoms",    desc: "How habits correlate with symptom levels" },
  { id: "whathelps",    label: "What helps",           desc: "Grounding and coping preferences by member" },
  { id: "cofronting",   label: "Co-fronting map",      desc: "How often each pair of members fronts together" },
];

// Tabs that aggregate per-alter data — switch to group variants when grouping is on
const GROUP_AWARE_TABS = new Set(["alters", "emotions", "cofronting"]);

export default function PatternInsights({
  sessions, alters, altersById, symptomCheckIns, symptoms,
  emotionCheckIns, from, to,
}) {
  const [activeTab, setActiveTab] = useState("narrative");
  const { mode: groupingMode, setMode: setGroupingMode } = useAnalyticsGrouping();
  const isGroupMode = groupingMode === "group";

  const { data: groups = [] } = useQuery({
    queryKey: ["groups"],
    queryFn: () => base44.entities.Group.list(),
  });

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

  // Group-mode derived data — only computed when groups exist
  const groupView = useMemo(() => {
    if (!groups.length) return null;
    return buildGroupView(alters, groups);
  }, [alters, groups]);

  const groupSessions = useMemo(() => {
    if (!isGroupMode || !groupView) return sessions;
    return remapSessionsToGroups(sessions, groupView.alterGroupMap);
  }, [isGroupMode, groupView, sessions]);

  const groupEmotionCheckIns = useMemo(() => {
    if (!isGroupMode || !groupView) return emotionCheckIns;
    return remapEmotionCheckInsToGroups(emotionCheckIns, groupView.alterGroupMap);
  }, [isGroupMode, groupView, emotionCheckIns]);

  // When in group mode, sub-components receive group-alters (groups shaped as alters)
  const effectiveAlters = isGroupMode && groupView ? groupView.groupAlters : alters;
  const effectiveSessions = isGroupMode && groupView ? groupSessions : sessions;
  const effectiveEmotionCheckIns = isGroupMode && groupView ? groupEmotionCheckIns : emotionCheckIns;

  const hasGroups = groups.length > 0;
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
      {/* Info + grouping toggle */}
      <div className="bg-primary/5 border border-primary/20 rounded-xl px-4 py-3 flex items-start gap-3">
        <p className="text-xs text-primary/80 leading-relaxed flex-1">
          Pattern analysis uses all historical data. The date range applies to Summary and Baseline.
          {isGroupMode && " Showing data aggregated by group."}
        </p>
        {hasGroups && (
          <div className="flex gap-1 flex-shrink-0">
            <button
              onClick={() => setGroupingMode("individual")}
              title="Show by individual member"
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border transition-all ${
                !isGroupMode
                  ? "bg-primary text-primary-foreground border-transparent"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              <User className="w-3 h-3" /> Member
            </button>
            <button
              onClick={() => setGroupingMode("group")}
              title="Aggregate by group"
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border transition-all ${
                isGroupMode
                  ? "bg-primary text-primary-foreground border-transparent"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              <Users className="w-3 h-3" /> Group
            </button>
          </div>
        )}
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
            {isGroupMode && GROUP_AWARE_TABS.has(tab.id) && hasGroups && (
              <span className="ml-1 opacity-60 text-[10px]">G</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab description */}
      <p className="text-xs text-muted-foreground -mt-1">
        {TABS.find(t => t.id === activeTab)?.desc}
        {isGroupMode && GROUP_AWARE_TABS.has(activeTab) && hasGroups && (
          <span className="ml-1 text-primary">· grouped view</span>
        )}
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
          frontingSessions={effectiveSessions}
          alters={effectiveAlters}
          symptomCheckIns={symptomCheckIns}
          symptoms={symptoms}
          baseline={baseline}
        />
      )}

      {activeTab === "emotions" && (
        <AlterEmotionProfiles
          alters={effectiveAlters}
          emotionCheckIns={effectiveEmotionCheckIns}
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
          frontingSessions={effectiveSessions}
          alters={effectiveAlters}
        />
      )}
    </div>
  );
}
