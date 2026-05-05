import React, { useMemo } from "react";
import { startOfDay, endOfDay, format } from "date-fns";
import { computeSymptomBaseline, generateWeeklyNarrative, computePreSwitchSignature, computeEarlyWarningStatus } from "@/lib/analyticsEngine";
import { AlertTriangle, Info, CheckCircle } from "lucide-react";

const STATUS_CONFIG = {
  warning: {
    icon: AlertTriangle,
    color: "text-red-500",
    bg: "bg-red-500/10 border-red-500/30",
    label: "Pattern alert",
  },
  elevated: {
    icon: AlertTriangle,
    color: "text-orange-500",
    bg: "bg-orange-400/10 border-orange-400/30",
    label: "Elevated pattern",
  },
  stable: {
    icon: CheckCircle,
    color: "text-green-500",
    bg: "bg-green-500/10 border-green-500/30",
    label: "Stable",
  },
};

export default function NarrativeSummary({
  sessions, altersById, symptomCheckIns, symptoms,
  emotionCheckIns, from, to,
}) {
  const fromMs = startOfDay(from).getTime();
  const toMs = endOfDay(to).getTime();

  const baseline = useMemo(
    () => computeSymptomBaseline(symptomCheckIns, symptoms),
    [symptomCheckIns, symptoms]
  );

  const paragraphs = useMemo(() =>
    generateWeeklyNarrative({
      sessions, altersById, symptomCheckIns, symptoms,
      baseline, emotionCheckIns, fromMs, toMs,
    }),
    [sessions, altersById, symptomCheckIns, symptoms, baseline, emotionCheckIns, fromMs, toMs]
  );

  const preSwitchSignature = useMemo(
    () => computePreSwitchSignature(sessions, symptomCheckIns, baseline),
    [sessions, symptomCheckIns, baseline]
  );

  const earlyWarning = useMemo(
    () => computeEarlyWarningStatus(symptomCheckIns, preSwitchSignature),
    [symptomCheckIns, preSwitchSignature]
  );

  const warningConfig = STATUS_CONFIG[earlyWarning.status];
  const WarningIcon = warningConfig?.icon;

  const symptomMap = useMemo(
    () => Object.fromEntries(symptoms.map(s => [s.id, s])),
    [symptoms]
  );

  const hasData = paragraphs.length > 0;

  return (
    <div className="space-y-4">
      {/* Early warning banner */}
      {(earlyWarning.status === "warning" || earlyWarning.status === "elevated") && warningConfig && (
        <div className={`flex items-start gap-3 border rounded-xl p-3 ${warningConfig.bg}`}>
          <WarningIcon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${warningConfig.color}`} />
          <div className="space-y-1">
            <p className={`text-sm font-semibold ${warningConfig.color}`}>{warningConfig.label}</p>
            <p className="text-sm text-foreground">{earlyWarning.message}</p>
            {earlyWarning.matchedSymptoms.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Elevated: {earlyWarning.matchedSymptoms.map(id => symptomMap[id]?.label || id).join(", ")}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Narrative text */}
      <div className="bg-card border border-border/50 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Period summary</h3>
          <span className="text-xs text-muted-foreground">
            {format(from, "MMM d")} – {format(to, "MMM d, yyyy")}
          </span>
        </div>

        {hasData ? (
          <div className="space-y-2">
            {paragraphs.map((p, i) => (
              <p key={i} className="text-sm text-foreground leading-relaxed">{p}</p>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Not enough data for a summary yet. Log symptoms, emotions, and fronting sessions regularly to see a narrative appear here.</p>
        )}
      </div>

      {/* Stable notice */}
      {earlyWarning.status === "stable" && Object.keys(preSwitchSignature).length > 0 && (
        <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-xl px-3 py-2.5">
          <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
          <p className="text-sm text-green-700 dark:text-green-400">
            Current symptom pattern is stable — not matching pre-switch signature.
          </p>
        </div>
      )}

      {/* Copyable text for therapy */}
      {hasData && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">For therapy / sharing</p>
          <div className="bg-muted/30 rounded-xl p-3">
            <p className="text-xs text-foreground/80 leading-relaxed whitespace-pre-line font-mono">
              {[
                `Period: ${format(from, "MMM d")} – ${format(to, "MMM d, yyyy")}`,
                "",
                ...paragraphs,
              ].join("\n")}
            </p>
          </div>
          <button
            onClick={() => {
              const text = [
                `Period: ${format(from, "MMM d")} – ${format(to, "MMM d, yyyy")}`,
                "",
                ...paragraphs,
              ].join("\n");
              navigator.clipboard?.writeText(text);
            }}
            className="text-xs text-primary hover:underline"
          >
            Copy to clipboard
          </button>
        </div>
      )}
    </div>
  );
}
