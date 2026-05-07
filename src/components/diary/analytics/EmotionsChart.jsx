import React, { useMemo } from "react";
import { format, parseISO } from "date-fns";
import { useNavigate } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

export default function EmotionsChart({ filteredCards }) {
  const navigate = useNavigate();

  const data = useMemo(() => {
    if (!filteredCards.length) return [];

    const emotionFreq = {};
    const dateData = {};
    const rawDates = {};

    filteredCards.forEach((card) => {
      const rawDate = card.date; // "yyyy-MM-dd"
      const date = format(parseISO(card.date), "MMM d");
      if (!dateData[date]) { dateData[date] = {}; rawDates[date] = rawDate; }

      (card.emotions || []).forEach((emotion) => {
        if (!emotionFreq[emotion]) emotionFreq[emotion] = 0;
        emotionFreq[emotion]++;
        dateData[date][emotion] = (dateData[date][emotion] || 0) + 1;
      });
    });

    return Object.entries(dateData).map(([date, emotions]) => ({ date, rawDate: rawDates[date], ...emotions }));
  }, [filteredCards]);

  const handleChartClick = (chartData) => {
    const rawDate = chartData?.activePayload?.[0]?.payload?.rawDate;
    if (rawDate) navigate(`/checkin-log?date=${rawDate}`);
  };

  if (!data.length) {
    return <p className="text-sm text-muted-foreground text-center py-6">No emotion data.</p>;
  }

  const allEmotions = [...new Set(filteredCards.flatMap((c) => c.emotions || []))].sort();
  
  const emotionColors = {
    angry: "#ef4444",
    anxious: "#f97316",
    calm: "#eab308",
    confused: "#22c55e",
    happy: "#10b981",
    hopeful: "#3b82f6",
    loved: "#ec4899",
    numb: "#cbd5e1",
    overwhelmed: "#d97706",
    sad: "#6366f1",
    stressed: "#fbbf24",
    tired: "#94a3b8",
  };
  
  const colors = allEmotions.map((emotion) => emotionColors[emotion.toLowerCase()] || "#8b5cf6");

  return (
    <div className="bg-card border border-border/50 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-foreground mb-1">Emotions Logged</h3>
      <p className="text-xs text-muted-foreground mb-4">Frequency of emotions over time — tap a bar to open that day in the log.</p>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} onClick={handleChartClick} style={{ cursor: "pointer" }}>
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