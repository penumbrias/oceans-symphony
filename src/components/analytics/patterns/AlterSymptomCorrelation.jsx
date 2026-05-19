import React, { useMemo, useState } from "react";
import { computeAlterSymptomCorrelation } from "@/lib/analyticsEngine";
import { useSystemIdentity } from "@/lib/useSystemIdentity";
import SystemAvatar from "@/components/shared/SystemAvatar";

const SYSTEM_VIEW_ID = "__system__";

function deltaChip(delta) {
  if (delta === null) return null;
  const abs = Math.abs(delta);
  if (abs < 0.15) return null;
  const positive = delta > 0;
  const label = `${positive ? "+" : ""}${delta.toFixed(1)}`;
  const cls = positive
    ? "bg-orange-400/80 text-white"
    : "bg-green-500/70 text-white";
  return <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${cls}`}>{label}</span>;
}

export default function AlterSymptomCorrelation({ frontingSessions, alters, symptomCheckIns, symptoms, baseline }) {
  const correlation = useMemo(
    () => computeAlterSymptomCorrelation(frontingSessions, alters, symptomCheckIns, baseline),
    [frontingSessions, alters, symptomCheckIns, baseline]
  );
  const systemIdentity = useSystemIdentity();

  const [selectedAlterId, setSelectedAlterId] = useState(null);

  const ratingSymptoms = useMemo(
    () => symptoms.filter(s => s.type === "rating" && !s.is_archived).sort((a, b) => (a.order ?? 999) - (b.order ?? 999)),
    [symptoms]
  );

  const altersWithData = useMemo(
    () => alters.filter(a => correlation[a.id] && Object.keys(correlation[a.id]).length > 0),
    [alters, correlation]
  );

  if (!altersWithData.length) {
    return (
      <div className="py-10 text-center">
        <p className="text-sm text-muted-foreground">Not enough data yet.</p>
        <p className="text-xs text-muted-foreground mt-1">
          This analysis needs fronting sessions that overlap with symptom check-ins. Log symptoms during or near fronting periods.
        </p>
      </div>
    );
  }

  const isSystemView = selectedAlterId === SYSTEM_VIEW_ID;
  const selectedAlter = selectedAlterId && !isSystemView
    ? alters.find(a => a.id === selectedAlterId)
    : null;

  const activeAlter = isSystemView ? null : (selectedAlter || altersWithData[0]);
  const activeData = isSystemView ? {} : (correlation[activeAlter?.id] || {});

  // Build system-wide rows: for each rating symptom, surface the
  // baseline mean (averaged across all check-ins regardless of who
  // was fronting), so the same chart structure still reads as "data
  // as a whole" rather than per-{terms.alter}.
  const systemRows = useMemo(() => {
    if (!isSystemView) return [];
    return ratingSymptoms
      .map(s => {
        // Pull the baseline value off any alter's row — they all share
        // the same `baselineMean` per symptom (it's computed system-wide).
        const sample = Object.values(correlation).find(d => d?.[s.id]?.baselineMean !== undefined);
        const baselineMean = sample?.[s.id]?.baselineMean;
        if (baselineMean === undefined || baselineMean === null) return null;
        return { symptom: s, mean: baselineMean };
      })
      .filter(Boolean);
  }, [isSystemView, ratingSymptoms, correlation]);

  // Compute a stress/calm score for each alter: average delta across all tracked symptoms
  const alterScores = altersWithData.map(a => {
    const data = correlation[a.id];
    const deltas = Object.values(data).map(d => d.delta).filter(d => d !== null);
    const avgDelta = deltas.length ? deltas.reduce((s, v) => s + v, 0) / deltas.length : 0;
    return { alter: a, avgDelta, data };
  }).sort((a, b) => b.avgDelta - a.avgDelta);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground leading-relaxed">
        Average symptom levels during each member's fronting sessions, compared to the system baseline.
        This shows which members tend to front during higher or lower stress periods.
      </p>

      {/* Alter overview cards */}
      <div className="grid grid-cols-2 gap-2">
        {/* System-wide card — selecting it hides the per-{terms.alter}
            delta view and surfaces just the baseline means across all
            check-ins. Lets users who don't track fronting still get
            value out of this chart. */}
        <button
          onClick={() => setSelectedAlterId(isSystemView ? null : SYSTEM_VIEW_ID)}
          className={`flex items-center gap-2 p-2.5 rounded-xl border text-left transition-all ${
            isSystemView
              ? "border-primary/50 bg-primary/5"
              : "border-border/50 bg-card hover:bg-muted/30"
          }`}
        >
          <SystemAvatar size="md" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold truncate">{systemIdentity.name}</p>
            <p className="text-xs text-muted-foreground">All data combined</p>
          </div>
        </button>
        {alterScores.map(({ alter, avgDelta }) => (
          <button
            key={alter.id}
            onClick={() => setSelectedAlterId(alter.id === activeAlter?.id ? null : alter.id)}
            className={`flex items-center gap-2 p-2.5 rounded-xl border text-left transition-all ${
              !isSystemView && alter.id === activeAlter?.id
                ? "border-primary/50 bg-primary/5"
                : "border-border/50 bg-card hover:bg-muted/30"
            }`}
          >
            {alter.avatar_url ? (
              <img src={alter.avatar_url} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
            ) : (
              <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm"
                style={{ backgroundColor: alter.color || "hsl(var(--muted))" }}>
                {alter.name?.[0] || "?"}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold truncate">{alter.name}</p>
              <p className={`text-xs ${avgDelta > 0.2 ? "text-orange-500" : avgDelta < -0.2 ? "text-green-600" : "text-muted-foreground"}`}>
                {avgDelta > 0.2 ? `↑ +${avgDelta.toFixed(1)} vs baseline` :
                 avgDelta < -0.2 ? `↓ ${avgDelta.toFixed(1)} vs baseline` :
                 "Near baseline"}
              </p>
            </div>
          </button>
        ))}
      </div>

      {/* System-wide detail view: baseline means across all check-ins. */}
      {isSystemView && systemRows.length > 0 && (
        <div className="bg-card border border-border/50 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <SystemAvatar size="md" />
            <h3 className="text-sm font-semibold">{systemIdentity.name} — symptom averages across all check-ins</h3>
          </div>
          <div className="space-y-2">
            {systemRows.map(({ symptom: s, mean }) => {
              const pct = Math.round((mean / 5) * 100);
              return (
                <div key={s.id} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      {s.color && <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />}
                      <span className="text-xs font-medium">{s.label}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{mean.toFixed(1)}/5</span>
                  </div>
                  <div className="relative h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(100, pct)}%`,
                        backgroundColor: s.color || "hsl(var(--primary))",
                        opacity: 0.7,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            Average values across every check-in, regardless of who was fronting at the time.
          </p>
        </div>
      )}

      {/* Detail for selected alter */}
      {!isSystemView && activeAlter && Object.keys(activeData).length > 0 && (
        <div className="bg-card border border-border/50 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            {activeAlter.avatar_url ? (
              <img src={activeAlter.avatar_url} className="w-7 h-7 rounded-full object-cover" />
            ) : (
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs"
                style={{ backgroundColor: activeAlter.color || "hsl(var(--muted))" }}>
                {activeAlter.name?.[0] || "?"}
              </div>
            )}
            <h3 className="text-sm font-semibold">{activeAlter.name} — symptom profile while fronting</h3>
          </div>

          <div className="space-y-2">
            {ratingSymptoms
              .filter(s => activeData[s.id] !== undefined)
              .map(s => {
                const d = activeData[s.id];
                const pct = Math.round((d.whileFrontingMean / 5) * 100);
                const basePct = Math.round(((d.baselineMean ?? 0) / 5) * 100);
                return (
                  <div key={s.id} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        {s.color && <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />}
                        <span className="text-xs font-medium">{s.label}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">{d.whileFrontingMean.toFixed(1)}/5</span>
                        {deltaChip(d.delta)}
                      </div>
                    </div>
                    <div className="relative h-1.5 bg-muted rounded-full overflow-visible">
                      {/* Baseline marker */}
                      {d.baselineMean !== null && (
                        <div
                          className="absolute top-1/2 -translate-y-1/2 w-0.5 h-3 bg-foreground/30 rounded z-10"
                          style={{ left: `${Math.min(100, basePct)}%` }}
                          title={`Baseline: ${d.baselineMean?.toFixed(1)}`}
                        />
                      )}
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(100, pct)}%`,
                          backgroundColor: s.color || "hsl(var(--primary))",
                          opacity: 0.7,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
          <p className="text-xs text-muted-foreground">
            Vertical tick = system baseline. Orange chip = above baseline, green = below baseline.
          </p>
        </div>
      )}
    </div>
  );
}
