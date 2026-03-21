import React, { useMemo } from "react";
import { format, parseISO, startOfWeek, endOfWeek, isSameWeek } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

export default function SymptomGridTable({ dailyAggregates, dateRange = 7, altersById = {} }) {
  const { data: symptoms = [] } = useQuery({
    queryKey: ["symptoms"],
    queryFn: () => base44.entities.Symptom.list(),
  });

  const symptomMap = useMemo(() =>
    Object.fromEntries(symptoms.map((s) => [s.id, s])),
    [symptoms]
  );

  const data = useMemo(() => {
    if (!dailyAggregates.length) return { dates: [], symptoms: {}, displayDates: [], alters: {} };

    // Get recent entries based on range
    const recentDays = dailyAggregates.slice(-dateRange);
    
    // For ranges <= 14 days, show individual days; otherwise collapse to weeks
    const showWeeks = dateRange > 14;
    
    let dates, displayDates;
    
    if (!showWeeks) {
      // Individual days
      dates = recentDays.map((d) => d.date);
      displayDates = dates.map((d) => ({ date: d, label: format(parseISO(d), "MMM d"), range: null }));
    } else {
      // Group by weeks
      const weekMap = {};
      recentDays.forEach((day) => {
        const dayDate = parseISO(day.date);
        const weekStart = startOfWeek(dayDate, { weekStartsOn: 0 });
        const weekKey = format(weekStart, "yyyy-MM-dd");
        if (!weekMap[weekKey]) {
          weekMap[weekKey] = [];
        }
        weekMap[weekKey].push(day);
      });
      
      dates = Object.keys(weekMap).sort();
      displayDates = dates.map((weekKey) => ({
        date: weekKey,
        label: `${format(parseISO(weekKey), "MMM d")}–${format(endOfWeek(parseISO(weekKey), { weekStartsOn: 0 }), "d")}`,
        range: weekMap[weekKey]
      }));
    }

    // Collect alters for each date/week
    const dateAlters = {};
    displayDates.forEach((display) => {
      const daysToCheck = display.range || [recentDays.find((d) => d.date === display.date)];
      const alterSet = new Set();
      daysToCheck.forEach((day) => {
        (day.entries || []).forEach((entry) => {
          (entry.fronting_alter_ids || []).forEach((id) => {
            if (altersById[id]) {
              alterSet.add(altersById[id].name);
            }
          });
        });
      });
      dateAlters[display.date] = Array.from(alterSet).sort();
    });

    // Collect all symptom keys
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
      symptoms[symptomKey] = displayDates.map((display) => {
        const daysToCheck = display.range || [recentDays.find((d) => d.date === display.date)];
        const values = daysToCheck
          .map((day) => {
            const checklist = day.checklist || {};
            return checklist.symptoms?.[symptomKey] ?? checklist.habits?.[symptomKey] ?? null;
          })
          .filter((v) => v !== null);
        
        // For weeks, average numeric values or show Y if any day has it
        if (!values.length) return null;
        if (typeof values[0] === "boolean") {
          return values.some((v) => v === true) ? true : false;
        }
        return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
      });
    });

    return { dates, symptoms, displayDates, alters: dateAlters };
  }, [dailyAggregates, dateRange, altersById]);

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

  // Color scale for severity - respects positive/negative symptoms
  const getColor = (value, symptomKey) => {
    if (value === null || value === undefined) return "bg-muted/30";
    
    const symptom = symptomMap[symptomKey];
    const isPositive = symptom?.is_positive ?? false;
    
    if (typeof value === "boolean") {
      return value ? "bg-green-500/60" : "bg-muted/40";
    }
    
    // For numeric 0-5 scale
    const num = Number(value);
    if (isNaN(num)) return "bg-muted/30";
    const intensity = num / 5;
    
    if (isPositive) {
      // For positive symptoms: higher is better (green)
      if (intensity < 0.2) return "bg-red-400/50";
      if (intensity < 0.4) return "bg-orange-400/50";
      if (intensity < 0.6) return "bg-yellow-400/50";
      if (intensity < 0.8) return "bg-lime-400/60";
      return "bg-green-500/80";
    } else {
      // For negative symptoms: higher is worse (red)
      if (intensity < 0.2) return "bg-green-400/50";
      if (intensity < 0.4) return "bg-yellow-400/50";
      if (intensity < 0.6) return "bg-orange-400/60";
      if (intensity < 0.8) return "bg-orange-500/70";
      return "bg-red-500/80";
    }
  };

  const getValue = (value) => {
    if (value === null || value === undefined) return "—";
    if (typeof value === "boolean") return value ? "Y" : "N";
    return value.toString();
  };

  const symptomKeys = Object.keys(data.symptoms).sort();

  return (
    <div className="bg-card border border-border/50 rounded-xl p-4 overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr>
            <th className="sticky left-0 bg-card text-left px-2 py-2 font-semibold text-foreground border-b border-border/50 z-10">
              Symptom
            </th>
            {data.displayDates.map((display) => (
              <th
                key={display.date}
                className="px-2 py-2 font-medium text-muted-foreground border-b border-border/50 text-center"
                title={display.date}
              >
                <div>{display.label}</div>
                {data.alters[display.date] && data.alters[display.date].length > 0 && (
                  <div className="text-xs font-normal text-muted-foreground/70">{data.alters[display.date].join(", ")}</div>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {symptomKeys.map((symptomKey, idx) => (
            <tr key={symptomKey} className={`hover:bg-muted/40 transition-colors ${idx % 2 === 0 ? "bg-card/50" : "bg-muted/20"}`}>
              <td className="sticky left-0 bg-card px-2 py-2 font-medium text-foreground border-b border-border/50 z-10 text-left">
                {formatLabel(symptomKey)}
              </td>
              {data.symptoms[symptomKey].map((value, i) => (
                <td
                  key={i}
                  className={`px-2 py-2 text-center border-b border-border/50 rounded transition-all ${getColor(value, symptomKey)}`}
                  title={getValue(value)}
                >
                  <span className="font-medium">{getValue(value)}</span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 text-xs text-muted-foreground space-y-1">
        <p><strong>Color scale (negative):</strong> Green (low) → Red (high severity)</p>
        <p><strong>Color scale (positive):</strong> Red (low) → Green (high/better)</p>
        <p><strong>Y/N symptoms:</strong> Y = present, — = absent/no entry</p>
      </div>
    </div>
  );
}