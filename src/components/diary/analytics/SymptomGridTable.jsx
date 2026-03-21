import React, { useMemo } from "react";
import { format, parseISO } from "date-fns";

export default function SymptomGridTable({ dailyAggregates, dateRange = 30 }) {
  const data = useMemo(() => {
    if (!dailyAggregates.length) return { dates: [], symptoms: {} };

    // Get recent entries based on range
    const recentDays = dailyAggregates.slice(-dateRange);
    const dates = recentDays.map((d) => d.date);

    // Collect all symptom keys from checklist
    const allSymptoms = {};
    recentDays.forEach((day) => {
      const checklist = day.checklist || {};
      Object.keys(checklist.symptoms || {}).forEach((key) => {
        allSymptoms[key] = true;
      });
      Object.keys(checklist.habits || {}).forEach((key) => {
        allSymptoms[key] = true;
      });
    });

    // Build symptom rows
    const symptoms = {};
    Object.keys(allSymptoms).forEach((symptomKey) => {
      symptoms[symptomKey] = recentDays.map((day) => {
        const checklist = day.checklist || {};
        return checklist.symptoms?.[symptomKey] ?? checklist.habits?.[symptomKey] ?? null;
      });
    });

    return { dates, symptoms };
  }, [dailyAggregates, dateRange]);

  if (!data.dates.length) {
    return <p className="text-sm text-muted-foreground text-center py-6">No symptom data for this period.</p>;
  }

  // Format symptom name to readable label
  const formatLabel = (key) => {
    return key
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  };

  // Color scale for severity
  const getColor = (value) => {
    if (value === null || value === undefined) return "bg-muted/30";
    if (typeof value === "boolean") {
      return value ? "bg-red-500/60" : "bg-green-500/60";
    }
    // For numeric 0-5 scale
    const num = Number(value);
    if (isNaN(num)) return "bg-muted/30";
    const intensity = num / 5;
    if (intensity < 0.2) return "bg-green-400/50";
    if (intensity < 0.4) return "bg-yellow-400/50";
    if (intensity < 0.6) return "bg-orange-400/60";
    if (intensity < 0.8) return "bg-orange-500/70";
    return "bg-red-500/80";
  };

  const getValue = (value) => {
    if (value === null || value === undefined) return "—";
    if (typeof value === "boolean") return value ? "Y" : "N";
    return value.toString();
  };

  const symptoms = Object.keys(data.symptoms).sort();

  return (
    <div className="bg-card border border-border/50 rounded-xl p-4 overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr>
            <th className="sticky left-0 bg-card text-left px-2 py-2 font-semibold text-foreground border-b border-border/50 z-10">
              Symptom
            </th>
            {data.dates.map((date) => (
              <th
                key={date}
                className="px-1 py-2 font-medium text-muted-foreground border-b border-border/50 text-center w-8"
                title={date}
              >
                {format(parseISO(date), "MMM d")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {symptoms.map((symptomKey) => (
            <tr key={symptomKey} className="hover:bg-muted/40 transition-colors">
              <td className="sticky left-0 bg-card px-2 py-2 font-medium text-foreground border-b border-border/50 z-10 text-left">
                {formatLabel(symptomKey)}
              </td>
              {data.symptoms[symptomKey].map((value, i) => (
                <td
                  key={i}
                  className={`px-1 py-2 text-center border-b border-border/50 rounded transition-all ${getColor(value)}`}
                  title={getValue(value)}
                >
                  <span className="font-medium">{getValue(value)}</span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 text-xs text-muted-foreground">
        <p><strong>Color scale:</strong> Green (low) → Yellow (mild) → Orange (moderate) → Red (severe)</p>
        <p><strong>Y/N symptoms:</strong> Y = present, N = absent, — = no entry</p>
      </div>
    </div>
  );
}