import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from "recharts";
import { Card } from "@/components/ui/card";
import { format, subDays } from "date-fns";

export default function CoFrontingAnalytics() {
  const { data: sessions = [] } = useQuery({
    queryKey: ["frontingSessions"],
    queryFn: () => base44.entities.FrontingSession.list(),
  });

  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });

  const analytics = useMemo(() => {
    // Calculate co-fronting pairs
    const pairMap = new Map();
    const durationMap = new Map();
    const alterStats = new Map();

    alters.forEach((a) => {
      alterStats.set(a.id, { name: a.name, sessions: 0, totalDuration: 0, avgDuration: 0 });
    });

    sessions.forEach((session) => {
      const fronterId = session.primary_alter_id;
      const coFronters = session.co_fronter_ids || [];
      const duration = session.end_time
        ? (new Date(session.end_time) - new Date(session.start_time)) / (1000 * 60)
        : 0;

      // Track individual stats
      if (fronterId && alterStats.has(fronterId)) {
        const stats = alterStats.get(fronterId);
        stats.sessions += 1;
        stats.totalDuration += duration;
      }

      // Track co-fronting pairs
      if (coFronters.length > 0) {
        coFronters.forEach((coId) => {
          const key = [fronterId, coId].sort().join("|");
          pairMap.set(key, (pairMap.get(key) || 0) + 1);
          durationMap.set(key, (durationMap.get(key) || 0) + duration);
        });
      }
    });

    // Calculate averages
    alterStats.forEach((stats) => {
      stats.avgDuration = stats.sessions > 0 ? Math.round(stats.totalDuration / stats.sessions) : 0;
    });

    // Convert to chart data
    const pairData = Array.from(pairMap.entries())
      .map(([key, count]) => {
        const [id1, id2] = key.split("|");
        const alter1 = alters.find((a) => a.id === id1);
        const alter2 = alters.find((a) => a.id === id2);
        const totalDuration = durationMap.get(key);
        return {
          pair: `${alter1?.name || id1} + ${alter2?.name || id2}`,
          frequency: count,
          avgDuration: Math.round(totalDuration / count),
        };
      })
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 10);

    const alterDurationData = Array.from(alterStats.values())
      .filter((a) => a.sessions > 0)
      .sort((a, b) => b.totalDuration - a.totalDuration)
      .map((a) => ({
        name: a.name,
        avgDuration: a.avgDuration,
        totalSessions: a.sessions,
      }));

    // Weekly trend
    const last90Days = subDays(new Date(), 90);
    const weeklyData = new Map();

    sessions.forEach((session) => {
      const sessionDate = new Date(session.start_time);
      if (sessionDate >= last90Days) {
        const weekKey = format(sessionDate, "MMM d");
        const hasCofronters = (session.co_fronter_ids || []).length > 0;
        weeklyData.set(weekKey, (weeklyData.get(weekKey) || { total: 0, coFront: 0 }).coFront + (hasCofronters ? 1 : 0));
        weeklyData.set(weekKey, { ...weeklyData.get(weekKey), total: (weeklyData.get(weekKey)?.total || 0) + 1 });
      }
    });

    const trendData = Array.from(weeklyData.entries())
      .map(([date, data]) => ({
        date,
        coFrontingSessions: data.coFront,
        totalSessions: data.total,
      }))
      .slice(-30);

    return { pairData, alterDurationData, trendData };
  }, [sessions, alters]);

  const colors = ["#a855f7", "#3b82f6", "#10b981", "#f59e0b", "#ef4444"];

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Co-Fronting Analytics</h1>
        <p className="text-muted-foreground mt-1">Track co-fronting patterns and session insights</p>
      </div>

      {/* Most Common Pairs */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Most Common Co-Fronting Pairs</h2>
        {analytics.pairData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={analytics.pairData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="pair" angle={-45} textAnchor="end" height={80} tick={{ fontSize: 12 }} />
              <YAxis />
              <Tooltip formatter={(value) => value} contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)" }} />
              <Legend />
              <Bar dataKey="frequency" name="Times Fronted Together" fill="#a855f7" />
              <Bar dataKey="avgDuration" name="Avg Duration (min)" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-muted-foreground text-sm">No co-fronting data yet</p>
        )}
      </Card>

      {/* Average Session Duration by Alter */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Average Session Duration</h2>
        {analytics.alterDurationData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={analytics.alterDurationData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" />
              <YAxis label={{ value: "Minutes", angle: -90, position: "insideLeft" }} />
              <Tooltip formatter={(value) => `${value} min`} contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)" }} />
              <Bar dataKey="avgDuration" name="Avg Duration (minutes)" fill="#10b981" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-muted-foreground text-sm">No session data yet</p>
        )}
      </Card>

      {/* Co-Fronting Trend */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Co-Fronting Trend (Last 30 Days)</h2>
        {analytics.trendData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={analytics.trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)" }} />
              <Legend />
              <Line type="monotone" dataKey="coFrontingSessions" stroke="#a855f7" name="Co-Fronting Sessions" strokeWidth={2} />
              <Line type="monotone" dataKey="totalSessions" stroke="#94a3b8" name="Total Sessions" strokeWidth={2} strokeDasharray="5 5" />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-muted-foreground text-sm">No trend data yet</p>
        )}
      </Card>
    </div>
  );
}