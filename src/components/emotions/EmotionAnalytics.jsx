import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, ComposedChart } from "recharts";
import { Heart } from "lucide-react";

export default function EmotionAnalytics({ from, to }) {
  const { data: checkIns = [] } = useQuery({
    queryKey: ["emotionCheckIns"],
    queryFn: () => base44.entities.EmotionCheckIn.list(),
  });

  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });

  // Filter by date range
  const filtered = useMemo(() => {
    return checkIns.filter((c) => {
      const date = new Date(c.timestamp);
      return date >= from && date <= to;
    });
  }, [checkIns, from, to]);

  // Emotion frequency
  const emotionCounts = useMemo(() => {
    const counts = {};
    filtered.forEach((c) => {
      c.emotions.forEach((e) => {
        counts[e] = (counts[e] || 0) + 1;
      });
    });
    return Object.entries(counts)
      .map(([emotion, count]) => ({ emotion, count }))
      .sort((a, b) => b.count - a.count);
  }, [filtered]);

  // Time of day distribution
  const timeDistribution = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, i) => ({
      hour: `${i}:00`,
      count: 0,
      emotions: []
    }));

    filtered.forEach((c) => {
      const hour = new Date(c.timestamp).getHours();
      hours[hour].count++;
    });

    return hours.filter((h) => h.count > 0);
  }, [filtered]);

  // Top emotions by time
  const emotionsByHour = useMemo(() => {
    const map = {};
    filtered.forEach((c) => {
      const hour = new Date(c.timestamp).getHours();
      c.emotions.forEach((e) => {
        const key = `${hour}:00`;
        map[key] = map[key] || {};
        map[key][e] = (map[key][e] || 0) + 1;
      });
    });
    return Object.entries(map).map(([hour, emotions]) => ({
      hour,
      ...emotions
    }));
  }, [filtered]);

  const altersById = useMemo(() => {
    return Object.fromEntries(alters.map((a) => [a.id, a]));
  }, [alters]);

  return (
    <div className="space-y-5">
      {/* Emotion Frequency */}
      {emotionCounts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Heart className="w-5 h-5 text-destructive" />
              Most Frequent Emotions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={emotionCounts}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="emotion" stroke="var(--muted-foreground)" />
                <YAxis stroke="var(--muted-foreground)" />
                <Tooltip contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)" }} />
                <Bar dataKey="count" fill="var(--primary)" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Time of Day */}
      {timeDistribution.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Check-Ins by Time of Day</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={timeDistribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="hour" stroke="var(--muted-foreground)" />
                <YAxis stroke="var(--muted-foreground)" />
                <Tooltip contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)" }} />
                <Line type="monotone" dataKey="count" stroke="var(--primary)" strokeWidth={2} dot={{ fill: "var(--primary)" }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Recent Check-Ins */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Check-Ins</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {filtered.slice().reverse().slice(0, 10).map((c, i) => (
              <div key={i} className="p-3 bg-muted/30 rounded-lg text-sm space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{new Date(c.timestamp).toLocaleString()}</span>
                  <div className="flex gap-1 flex-wrap justify-end">
                    {c.emotions.map((e) => (
                      <span key={e} className="bg-primary/20 text-primary px-2 py-0.5 rounded text-xs">
                        {e}
                      </span>
                    ))}
                  </div>
                </div>
                {c.fronting_alter_ids?.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    🧑 {c.fronting_alter_ids.map((id) => altersById[id]?.name || id).join(", ")}
                  </p>
                )}
                {c.note && <p className="text-xs text-muted-foreground">{c.note}</p>}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}