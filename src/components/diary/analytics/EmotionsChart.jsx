import React, { useMemo } from "react";
import { format, parseISO } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

export default function EmotionsChart({ filteredCards }) {
  const data = useMemo(() => {
    if (!filteredCards.length) return [];

    // Count emotion frequency over time
    const emotionFreq = {};
    const dateData = {};

    filteredCards.forEach((card) => {
      const date = format(parseISO(card.date), "MMM d");
      if (!dateData[date]) dateData[date] = {};

      (card.emotions || []).forEach((emotion) => {
        if (!emotionFreq[emotion]) emotionFreq[emotion] = 0;
        emotionFreq[emotion]++;
        dateData[date][emotion] = (dateData[date][emotion] || 0) + 1;
      });
    });

    return Object.entries(dateData).map(([date, emotions]) => ({ date, ...emotions }));
  }, [filteredCards]);

  if (!data.length) {
    return <p className="text-sm text-muted-foreground text-center py-6">No emotion data.</p>;
  }

  const allEmotions = [...new Set(filteredCards.flatMap((c) => c.emotions || []))].sort();
  const colors = ["#ec4899", "#f43f5e", "#f97316", "#eab308", "#84cc16", "#22c55e", "#06b6d4"];

  return (
    <div className="bg-card border border-border/50 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-foreground mb-1">Emotions Logged</h3>
      <p className="text-xs text-muted-foreground mb-4">Frequency of emotions over time</p>
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
          />
          <Legend wrapperStyle={{ fontSize: "12px", color: "hsl(var(--muted-foreground))" }} />
          {allEmotions.map((emotion, i) => (
            <Bar key={emotion} dataKey={emotion} fill={colors[i % colors.length]} stackId="emotions" />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}