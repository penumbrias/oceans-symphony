import React, { useMemo } from "react";
import { computeSymptomCorrelations } from "@/lib/analyticsEngine";

function correlationColor(r) {
  if (r === null) return { bg: "bg-muted/20", text: "text-muted-foreground/40" };
  if (r === 1)   return { bg: "bg-muted/20", text: "text-muted-foreground" };
  // Strong positive
  if (r >= 0.7)  return { bg: "bg-red-500/80",    text: "text-white" };
  if (r >= 0.4)  return { bg: "bg-orange-400/60", text: "text-foreground" };
  if (r >= 0.2)  return { bg: "bg-yellow-300/50", text: "text-foreground" };
  // Neutral
  if (r > -0.2)  return { bg: "bg-muted/30",      text: "text-muted-foreground" };
  // Negative
  if (r >= -0.4) return { bg: "bg-sky-300/50",    text: "text-foreground" };
  if (r >= -0.7) return { bg: "bg-blue-400/60",   text: "text-white" };
  return           { bg: "bg-blue-600/70",         text: "text-white" };
}

export default function SymptomCorrelationMatrix({ symptomCheckIns, symptoms }) {
  const { matrix, symptoms: ratingSymptoms } = useMemo(
    () => computeSymptomCorrelations(symptomCheckIns, symptoms),
    [symptomCheckIns, symptoms]
  );

  if (!ratingSymptoms.length) {
    return (
      <div className="py-10 text-center">
        <p className="text-sm text-muted-foreground">No rating-type symptoms set up yet.</p>
      </div>
    );
  }

  const hasData = ratingSymptoms.some(s =>
    ratingSymptoms.some(s2 => s.id !== s2.id && matrix[s.id]?.[s2.id] !== null)
  );

  if (!hasData) {
    return (
      <div className="py-10 text-center">
        <p className="text-sm text-muted-foreground">Not enough data yet to compute correlations.</p>
        <p className="text-xs text-muted-foreground mt-1">
          Correlations require multiple symptoms tracked on the same days. Keep logging via Quick Check-In.
        </p>
      </div>
    );
  }

  // Strong pairs for the summary
  const strongPairs = [];
  ratingSymptoms.forEach((a, ai) => {
    ratingSymptoms.forEach((b, bi) => {
      if (bi <= ai) return;
      const r = matrix[a.id]?.[b.id];
      if (r !== null && Math.abs(r) >= 0.5) {
        strongPairs.push({ a, b, r });
      }
    });
  });
  strongPairs.sort((x, y) => Math.abs(y.r) - Math.abs(x.r));

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground leading-relaxed">
        How strongly do your symptoms move together? <span className="text-orange-500 font-medium">Red/orange</span> = tend to rise and fall together.{" "}
        <span className="text-blue-500 font-medium">Blue</span> = tend to move in opposite directions.
        Neutral = no consistent relationship.
      </p>

      {/* Matrix */}
      <div className="bg-card border border-border/50 rounded-xl p-3 overflow-x-auto">
        <table className="text-xs border-collapse">
          <thead>
            <tr>
              <th className="w-24" />
              {ratingSymptoms.map(s => (
                <th key={s.id} className="px-1 py-2 font-medium text-muted-foreground text-center">
                  <div className="flex flex-col items-center gap-0.5">
                    {s.color && <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />}
                    <span className="writing-mode-vertical" style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", whiteSpace: "nowrap", maxHeight: 80, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {s.label}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ratingSymptoms.map((rowSymptom, ri) => (
              <tr key={rowSymptom.id}>
                <td className="pr-2 py-1 text-right font-medium text-foreground whitespace-nowrap text-xs">
                  <div className="flex items-center justify-end gap-1.5">
                    {rowSymptom.color && <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: rowSymptom.color }} />}
                    <span className="truncate max-w-[90px]">{rowSymptom.label}</span>
                  </div>
                </td>
                {ratingSymptoms.map((colSymptom, ci) => {
                  const r = matrix[rowSymptom.id]?.[colSymptom.id];
                  const isDiag = rowSymptom.id === colSymptom.id;
                  const { bg, text } = correlationColor(isDiag ? null : r);
                  return (
                    <td
                      key={colSymptom.id}
                      className={`w-10 h-8 text-center border border-border/20 rounded transition-all ${bg} ${text} ${isDiag ? "opacity-30" : ""}`}
                      title={isDiag ? rowSymptom.label : `${rowSymptom.label} × ${colSymptom.label}: r = ${r?.toFixed(2) ?? "n/a"}`}
                    >
                      {!isDiag && r !== null ? r.toFixed(2) : isDiag ? "—" : "·"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Notable pairs */}
      {strongPairs.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Notable relationships</h3>
          {strongPairs.slice(0, 6).map(({ a, b, r }) => (
            <div key={`${a.id}_${b.id}`} className="flex items-center gap-3 bg-muted/20 rounded-lg px-3 py-2">
              <div className="flex items-center gap-1.5 flex-1">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: a.color || "#8b5cf6" }} />
                <span className="text-sm font-medium">{a.label}</span>
                <span className="text-muted-foreground">×</span>
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: b.color || "#8b5cf6" }} />
                <span className="text-sm font-medium">{b.label}</span>
              </div>
              <div className={`text-xs font-semibold px-2 py-0.5 rounded-full ${r >= 0 ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"}`}>
                r = {r.toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground w-36 text-right">
                {r >= 0.7 ? "Strongly move together" :
                 r >= 0.4 ? "Tend to rise together" :
                 r <= -0.7 ? "Strongly opposite" :
                 "Moderately opposite"}
              </p>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Computed using Pearson correlation on daily symptom averages. Values close to 0 mean no consistent relationship.
      </p>
    </div>
  );
}
