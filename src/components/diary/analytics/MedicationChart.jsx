import React, { useMemo } from "react";
import { format, parseISO } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from "recharts";

export default function MedicationChart({ filteredCards }) {
  const data = useMemo(() => {
    if (!filteredCards.length) return [];

    return filteredCards.map((card) => {
      const med = card.medication_safety || {};
      return {
        date: format(parseISO(card.date), "MMM d"),
        rx_meds_taken: med.rx_meds_taken ? 1 : 0,
        self_harm_occurred: med.self_harm_occurred ? 1 : 0,
        substances_count: med.substances_count ?? 0,
      };
    });
  }, [filteredCards]);

  if (!data.length) {
    return <p className="text-sm text-muted-foreground text-center py-6">No medication data.</p>;
  }

  const rxTakenCount = data.filter((d) => d.rx_meds_taken).length;
  const selfHarmCount = data.filter((d) => d.self_harm_occurred).length;

  return (
    <div className="bg-card border border-border/50 rounded-xl p-4 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-1">Medication & Safety</h3>
        <p className="text-xs text-muted-foreground mb-4">Rx meds taken and safety incidents</p>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
          <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "0.5rem",
            }}
            labelStyle={{ color: "hsl(var(--foreground))" }}
            formatter={(value, name) => {
              if (name === "rx_meds_taken") return [value ? "✓ Taken" : "✗ Not taken", "Rx Meds"];
              if (name === "self_harm_occurred") return [value ? "✓ Yes" : "✗ No", "Self-Harm"];
              return [value, "Substances"];
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: "12px", color: "hsl(var(--muted-foreground))" }}
            formatter={(value) => {
              if (value === "rx_meds_taken") return "Rx Meds Taken";
              if (value === "self_harm_occurred") return "Self-Harm Occurred";
              return "Substances Used";
            }}
          />
          <Bar dataKey="rx_meds_taken" fill="#22c55e" name="rx_meds_taken" />
          <Bar dataKey="self_harm_occurred" fill="#ef4444" name="self_harm_occurred" />
          <Bar dataKey="substances_count" fill="#a855f7" name="substances_count" />
        </BarChart>
      </ResponsiveContainer>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="bg-muted/50 rounded-lg p-2 text-center">
          <p className="text-muted-foreground text-[10px]">Rx Meds Taken</p>
          <p className="font-semibold text-foreground">{rxTakenCount}/{data.length}</p>
        </div>
        <div className="bg-muted/50 rounded-lg p-2 text-center">
          <p className="text-muted-foreground text-[10px]">Self-Harm Incidents</p>
          <p className="font-semibold text-destructive">{selfHarmCount}</p>
        </div>
        <div className="bg-muted/50 rounded-lg p-2 text-center">
          <p className="text-muted-foreground text-[10px]">Avg Substances/Day</p>
          <p className="font-semibold text-foreground">
            {(data.reduce((sum, d) => sum + d.substances_count, 0) / data.length).toFixed(1)}
          </p>
        </div>
      </div>
    </div>
  );
}