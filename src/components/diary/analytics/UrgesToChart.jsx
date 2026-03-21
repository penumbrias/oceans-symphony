import React, { useMemo } from "react";
import { format, parseISO } from "date-fns";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

export default function UrgesToChart({ filteredCards }) {
  const data = useMemo(() => {
    if (!filteredCards.length) return [];

    return filteredCards.map((card) => {
      const urges = card.urges || {};
      return {
        date: format(parseISO(card.date), "MMM d"),
        suicidal: urges.suicidal ?? null,
        self_harm: urges.self_harm ?? null,
        alcohol_drugs: urges.alcohol_drugs ?? null,
      };
    });
  }, [filteredCards]);

  if (!data.length) {
    return <p className="text-sm text-muted-foreground text-center py-6">No urge data.</p>;
  }

  return (
    <div className="bg-card border border-border/50 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-foreground mb-1">Urges Tracked</h3>
      <p className="text-xs text-muted-foreground mb-4">Intensity ratings (0-5 scale)</p>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
          <YAxis domain={[0, 5]} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "0.5rem",
            }}
            labelStyle={{ color: "hsl(var(--foreground))" }}
          />
          <Legend wrapperStyle={{ fontSize: "12px", color: "hsl(var(--muted-foreground))" }} />
          <Line
            type="monotone"
            dataKey="suicidal"
            stroke="#ef4444"
            name="Suicidal"
            connectNulls
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="self_harm"
            stroke="#f97316"
            name="Self-Harm"
            connectNulls
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="alcohol_drugs"
            stroke="#eab308"
            name="Alcohol/Drugs"
            connectNulls
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}