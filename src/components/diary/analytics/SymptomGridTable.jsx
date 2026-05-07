import React, { useMemo } from "react";
import { format, parseISO, startOfWeek, endOfWeek } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

export default function SymptomGridTable({ dailyAggregates, dateRange = 7, altersById = {} }) {
  const { data: symptoms = [] } = useQuery({
    queryKey: ["symptoms"],
    queryFn: () => base44.entities.Symptom.list(),
  });

  const { data: allSymptomCheckIns = [] } = useQuery({
    queryKey: ["symptomCheckIns"],
    queryFn: () => base44.entities.SymptomCheckIn.list(),
  });

  const symptomMap = useMemo(() =>
    Object.fromEntries(symptoms.map((s) => [s.id, s])),
    [symptoms]
  );

  // Group SymptomCheckIn records by date → bucket (symptom/habit) → symptomId → averaged value
  const ciByDate = useMemo(() => {
    const map = {};
    const counts = {};
    allSymptomCheckIns.forEach(sc => {
      if (!sc.timestamp || !sc.symptom_id) return;
      const dateStr = sc.timestamp.substring(0, 10);
      if (!map[dateStr]) { map[dateStr] = { symptoms: {}, habits: {} }; counts[dateStr] = {}; }
      const sym = symptomMap[sc.symptom_id];
      const bucket = sym?.category === "habit" ? "habits" : "symptoms";
      const id = sc.symptom_id;
      const val = sc.severity !== null && sc.severity !== undefined ? Number(sc.severity) : true;
      if (map[dateStr][bucket][id] === undefined) {
        map[dateStr][bucket][id] = val;
        counts[dateStr][id] = 1;
      } else if (typeof val === "number" && typeof map[dateStr][bucket][id] === "number") {
        counts[dateStr][id] = (counts[dateStr][id] || 1) + 1;
        map[dateStr][bucket][id] = Math.round(
          (map[dateStr][bucket][id] * (counts[dateStr][id] - 1) + val) / counts[dateStr][id] * 10
        ) / 10;
      }
    });
    return map;
  }, [allSymptomCheckIns, symptomMap]);

  const data = useMemo(() => {
    if (!dailyAggregates.length) return { dates: [], symptoms: {}, displayDates: [], alters: {} };

    const recentDays = dailyAggregates.slice(-dateRange);

    // Helper: merge DiaryCard.checklist + SymptomCheckIn data for a day
    const getMergedChecklist = (day) => {
      if (!day) return { symptoms: {}, habits: {} };
      const dcC = day.checklist || { symptoms: {}, habits: {} };
      const ciC = ciByDate[day.date] || { symptoms: {}, habits: {} };
      return {
        symptoms: { ...ciC.symptoms, ...(dcC.symptoms || {}) },
        habits: { ...ciC.habits, ...(dcC.habits || {}) },
      };
    };

    const showWeeks = dateRange > 14;
    let dates, displayDates;

    if (!showWeeks) {
      dates = recentDays.map((d) => d.date);
      displayDates = dates.map((d) => ({ date: d, label: format(parseISO(d), "MMM d"), range: null }));
    } else {
      const weekMap = {};
      recentDays.forEach((day) => {
        const dayDate = parseISO(day.date);
        const weekStart = startOfWeek(dayDate, { weekStartsOn: 0 });
        const weekKey = format(weekStart, "yyyy-MM-dd");
        if (!weekMap[weekKey]) weekMap[weekKey] = [];
        weekMap[weekKey].push(day);
      });
      dates = Object.keys(weekMap).sort();
      displayDates = dates.map((weekKey) => ({
        date: weekKey,
        label: `${format(parseISO(weekKey), "MMM d")}–${format(endOfWeek(parseISO(weekKey), { weekStartsOn: 0 }), "d")}`,
        range: weekMap[weekKey],
      }));
    }

    // Collect alters for each date/week
    const dateAlters = {};
    displayDates.forEach((display) => {
      const daysToCheck = display.range || [recentDays.find((d) => d.date === display.date)];
      const alterSet = new Set();
      daysToCheck.forEach((day) => {
        (day?.entries || []).forEach((entry) => {
          (entry.fronting_alter_ids || []).forEach((id) => {
            if (altersById[id]) alterSet.add(altersById[id].name);
          });
        });
      });
      dateAlters[display.date] = Array.from(alterSet).sort();
    });

    // Collect all symptom keys from BOTH diary card checklist AND SymptomCheckIn
    const allSymptoms = {};
    recentDays.forEach((day) => {
      const merged = getMergedChecklist(day);
      Object.keys(merged.symptoms || {}).forEach((k) => { allSymptoms[k] = true; });
      Object.keys(merged.habits || {}).forEach((k) => { allSymptoms[k] = true; });
    });

    // Build symptom rows
    const symptomsData = {};
    Object.keys(allSymptoms).forEach((symptomKey) => {
      symptomsData[symptomKey] = displayDates.map((display) => {
        const daysToCheck = display.range || [recentDays.find((d) => d.date === display.date)];
        const values = daysToCheck
          .map((day) => {
            const merged = getMergedChecklist(day);
            return merged.symptoms?.[symptomKey] ?? merged.habits?.[symptomKey] ?? null;
          })
          .filter((v) => v !== null);

        if (!values.length) return null;
        if (typeof values[0] === "boolean") return values.some((v) => v === true);
        return Math.round(values.reduce((a, b) => a + b, 0) / values.length * 10) / 10;
      });
    });

    return { dates, symptoms: symptomsData, displayDates, alters: dateAlters };
  }, [dailyAggregates, dateRange, altersById, ciByDate]);

  if (!data.dates.length) {
    return <p className="text-sm text-muted-foreground text-center py-6">No symptom data for this period.</p>;
  }

  // Use symptomMap label for entity IDs; fall back to word-splitting for legacy string keys
  const formatLabel = (key) => {
    const sym = symptomMap[key];
    if (sym) return sym.label;
    return key.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  };

  const getColor = (value, symptomKey) => {
    if (value === null || value === undefined) return "bg-muted/30";
    const symptom = symptomMap[symptomKey];
    const isPositive = symptom?.is_positive ?? false;
    if (typeof value === "boolean") return value ? "bg-green-500/60" : "bg-muted/40";
    const num = Number(value);
    if (isNaN(num)) return "bg-muted/30";
    const intensity = num / 5;
    if (isPositive) {
      if (intensity < 0.2) return "bg-red-400/50";
      if (intensity < 0.4) return "bg-orange-400/50";
      if (intensity < 0.6) return "bg-yellow-400/50";
      if (intensity < 0.8) return "bg-lime-400/60";
      return "bg-green-500/80";
    } else {
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

  // Sort: entity-based symptoms first (by order), then legacy string keys
  const symptomKeys = Object.keys(data.symptoms).sort((a, b) => {
    const sa = symptomMap[a];
    const sb = symptomMap[b];
    if (sa && sb) return (sa.order ?? 999) - (sb.order ?? 999);
    if (sa) return -1;
    if (sb) return 1;
    return a.localeCompare(b);
  });

  return (
    <div className="bg-card border border-border/50 rounded-xl p-4 overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr>
            <th className="sticky left-0 bg-card text-left px-2 py-2 font-semibold text-foreground border-b border-border/50 z-10">
              Symptom / Habit
            </th>
            {data.displayDates.map((display) => (
              <th
                key={display.date}
                className="px-2 py-2 font-medium text-muted-foreground border-b border-border/50 text-center"
                title={display.date}
              >
                <div>{display.label}</div>
                {data.alters[display.date]?.length > 0 && (
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
                <div className="flex items-center gap-1.5">
                  {symptomMap[symptomKey]?.color && (
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: symptomMap[symptomKey].color }} />
                  )}
                  {formatLabel(symptomKey)}
                </div>
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
        <p><strong>Negative (symptoms):</strong> Green (low) → Red (high severity)</p>
        <p><strong>Positive (habits):</strong> Red (low/missed) → Green (high/done)</p>
        <p><strong>Y/N:</strong> Y = present, — = not logged</p>
      </div>
    </div>
  );
}
