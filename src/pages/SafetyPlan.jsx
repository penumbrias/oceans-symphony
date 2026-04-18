import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { motion } from "framer-motion";
import { ChevronDown, Shield, Lightbulb, BarChart3, Wind } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

export default function SafetyPlan() {
  const [expandedSections, setExpandedSections] = React.useState({
    warningSigns: true,
    copingCards: false,
    windowOfTolerance: false,
  });

  const { data: entries = [] } = useQuery({
    queryKey: ["supportJournalEntries"],
    queryFn: () => base44.entities.SupportJournalEntry.list(),
  });

  const safetyPlanEntry = useMemo(
    () => entries.find(e => e.exercise_id === "m4_t3_safety_plan"),
    [entries]
  );

  const copingCardsEntry = useMemo(
    () => entries.find(e => e.exercise_id === "m6_t1_coping_cards"),
    [entries]
  );

  const windowEntry = useMemo(
    () => entries.find(e => e.exercise_id === "m6_t2_window_plan"),
    [entries]
  );

  const hasSafetyPlan = safetyPlanEntry || copingCardsEntry || windowEntry;

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  if (!hasSafetyPlan) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-2xl mx-auto p-6 space-y-8"
      >
        <div className="text-center space-y-4 py-12">
          <Shield className="w-12 h-12 text-muted-foreground/40 mx-auto" />
          <h1 className="text-2xl font-semibold text-foreground">Your Safety Plan</h1>
          <p className="text-muted-foreground">
            You haven't built your safety plan yet. You can create one in the Learn section.
          </p>
        </div>

        <div className="flex justify-center">
          <Link to="/grounding">
            <Button size="lg" className="gap-2">
              <Lightbulb className="w-4 h-4" /> Go to Learn
            </Button>
          </Link>
        </div>
      </motion.div>
    );
  }

  const warningSignsData = safetyPlanEntry?.responses || {};
  const copingData = copingCardsEntry?.responses || {};
  const windowData = windowEntry?.responses || {};

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-2xl mx-auto p-6 space-y-6"
    >
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Shield className="w-6 h-6 text-primary" />
          <h1 className="text-3xl font-semibold text-foreground">My Safety Plan</h1>
        </div>
        <p className="text-muted-foreground">
          Your personalized plan for managing distress and staying safe
        </p>
      </div>

      {/* Warning Signs Section */}
      {safetyPlanEntry && (
        <div className="bg-card border border-border/50 rounded-xl overflow-hidden">
          <button
            onClick={() => toggleSection("warningSigns")}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-muted/20 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Lightbulb className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">Warning Signs</h2>
            </div>
            <ChevronDown
              className={`w-5 h-5 text-muted-foreground transition-transform ${
                expandedSections.warningSignals ? "rotate-180" : ""
              }`}
            />
          </button>

          {expandedSections.warningSignals && (
            <div className="px-6 pb-6 space-y-4 border-t border-border/30">
              {/* Earliest signs */}
              <div>
                <p className="text-sm font-semibold text-foreground mb-2">Earliest warning signs</p>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {warningSignsData.earliest_signs || "Not filled in yet"}
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  <strong>What I will do:</strong> {warningSignsData.earliest_response || "—"}
                </p>
              </div>

              {/* Increased risk */}
              <div className="pt-3 border-t border-border/30">
                <p className="text-sm font-semibold text-foreground mb-2">Increased risk signs</p>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {warningSignsData.increased_risk_signs || "Not filled in yet"}
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  <strong>What I will do:</strong> {warningSignsData.increased_risk_response || "—"}
                </p>
              </div>

              {/* Emergency */}
              <div className="pt-3 border-t border-border/30">
                <p className="text-sm font-semibold text-foreground mb-2">Emergency signs</p>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {warningSignsData.emergency_signs || "Not filled in yet"}
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  <strong>What I will do to stay safe:</strong> {warningSignsData.emergency_response || "—"}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* My Coping Cards Section */}
      {copingCardsEntry && Object.keys(copingData).length > 0 && (
        <div className="bg-card border border-border/50 rounded-xl overflow-hidden">
          <button
            onClick={() => toggleSection("copingCards")}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-muted/20 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Lightbulb className="w-5 h-5 text-accent" />
              <h2 className="text-lg font-semibold text-foreground">My Coping Cards</h2>
            </div>
            <ChevronDown
              className={`w-5 h-5 text-muted-foreground transition-transform ${
                expandedSections.copingCards ? "rotate-180" : ""
              }`}
            />
          </button>

          {expandedSections.copingCards && (
            <div className="px-6 pb-6 space-y-3 border-t border-border/30">
              {Object.entries(copingData).map(([key, value], idx) => (
                <div key={idx} className="bg-muted/30 border border-border/20 rounded-lg p-3">
                  <p className="text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wide">
                    {key.replace(/_/g, " ")}
                  </p>
                  <p className="text-sm text-foreground">{value}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Window of Tolerance Section */}
      {windowEntry && Object.keys(windowData).length > 0 && (
        <div className="bg-card border border-border/50 rounded-xl overflow-hidden">
          <button
            onClick={() => toggleSection("windowOfTolerance")}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-muted/20 transition-colors"
          >
            <div className="flex items-center gap-3">
              <BarChart3 className="w-5 h-5 text-secondary" />
              <h2 className="text-lg font-semibold text-foreground">Window of Tolerance</h2>
            </div>
            <ChevronDown
              className={`w-5 h-5 text-muted-foreground transition-transform ${
                expandedSections.windowOfTolerance ? "rotate-180" : ""
              }`}
            />
          </button>

          {expandedSections.windowOfTolerance && (
            <div className="px-6 pb-6 space-y-3 border-t border-border/30">
              {["level_1_calm", "level_2_alert", "level_3_coping", "level_4_activated", "level_5_crisis"].map(
                (level, idx) => {
                  const data = windowData[level];
                  if (!data) return null;
                  const levelNum = idx + 1;
                  const labels = [
                    "Calm & regulated",
                    "Alert & focused",
                    "Coping needed",
                    "Highly activated",
                    "Crisis",
                  ];
                  return (
                    <div key={level} className="bg-muted/30 border border-border/20 rounded-lg p-3">
                      <p className="text-xs font-semibold text-muted-foreground mb-2">
                        Level {levelNum}: {labels[idx]}
                      </p>
                      <p className="text-sm text-foreground">{data}</p>
                    </div>
                  );
                }
              )}
            </div>
          )}
        </div>
      )}

      {/* Quick Access Grounding */}
      <div className="space-y-2 pt-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Quick access</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Link to="/grounding">
            <Button variant="outline" className="w-full gap-2" size="sm">
              <Wind className="w-4 h-4" /> Breathing
            </Button>
          </Link>
          <Link to="/grounding">
            <Button variant="outline" className="w-full gap-2" size="sm">
              <Lightbulb className="w-4 h-4" /> Techniques
            </Button>
          </Link>
          <Link to="/grounding">
            <Button variant="outline" className="w-full gap-2" size="sm">
              <Shield className="w-4 h-4" /> Crisis help
            </Button>
          </Link>
        </div>
      </div>
    </motion.div>
  );
}