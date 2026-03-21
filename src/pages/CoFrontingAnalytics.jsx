import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { format, subDays } from "date-fns";
import { Search, X } from "lucide-react";

export default function CoFrontingAnalytics() {
  const [searchQuery, setSearchQuery] = useState("");

  const { data: sessions = [] } = useQuery({
    queryKey: ["frontingSessions"],
    queryFn: () => base44.entities.FrontingSession.list(),
  });

  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });

  const analytics = useMemo(() => {
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

      if (fronterId && alterStats.has(fronterId)) {
        const stats = alterStats.get(fronterId);
        stats.sessions += 1;
        stats.totalDuration += duration;
      }

      if (coFronters.length > 0) {
        coFronters.forEach((coId) => {
          const key = [fronterId, coId].sort().join("|");
          pairMap.set(key, (pairMap.get(key) || 0) + 1);
          durationMap.set(key, (durationMap.get(key) || 0) + duration);
        });
      }
    });

    alterStats.forEach((stats) => {
      stats.avgDuration = stats.sessions > 0 ? Math.round(stats.totalDuration / stats.sessions) : 0;
    });

    const pairData = Array.from(pairMap.entries())
      .map(([key, count]) => {
        const [id1, id2] = key.split("|");
        const alter1 = alters.find((a) => a.id === id1);
        const alter2 = alters.find((a) => a.id === id2);
        const totalDuration = durationMap.get(key);
        return {
          pair: `${alter1?.name || id1} + ${alter2?.name || id2}`,
          id1,
          id2,
          frequency: count,
          avgDuration: Math.round(totalDuration / count),
        };
      })
      .sort((a, b) => b.frequency - a.frequency);

    const alterDurationData = Array.from(alterStats.values())
      .filter((a) => a.sessions > 0)
      .sort((a, b) => b.totalDuration - a.totalDuration)
      .map((a) => ({
        name: a.name,
        avgDuration: a.avgDuration,
        totalSessions: a.sessions,
      }));

    const last90Days = subDays(new Date(), 90);
    const weeklyData = new Map();

    sessions.forEach((session) => {
      const sessionDate = new Date(session.start_time);
      if (sessionDate >= last90Days) {
        const weekKey = format(sessionDate, "MMM d");
        const hasCofronters = (session.co_fronter_ids || []).length > 0;
        const existing = weeklyData.get(weekKey) || { total: 0, coFront: 0 };
        weeklyData.set(weekKey, {
          total: existing.total + 1,
          coFront: existing.coFront + (hasCofronters ? 1 : 0),
        });
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

  const filteredPairs = useMemo(() => {
    if (!searchQuery.trim()) return analytics.pairData;
    const query = searchQuery.toLowerCase();
    return analytics.pairData.filter((pair) => pair.pair.toLowerCase().includes(query));
  }, [analytics.pairData, searchQuery]);

  const filteredAlters = useMemo(() => {
    if (!searchQuery.trim()) return analytics.alterDurationData;
    const query = searchQuery.toLowerCase();
    return analytics.alterDurationData.filter((alter) => alter.name.toLowerCase().includes(query));
  }, [analytics.alterDurationData, searchQuery]);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Co-Fronting Analytics</h1>
        <p className="text-muted-foreground mt-1">Track co-fronting patterns and session insights</p>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search alters or pairs..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 pr-9"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Most Common Pairs */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Most Common Co-Fronting Pairs ({filteredPairs.length})</h2>
        {filteredPairs.length > 0 ? (
          <div className="space-y-3">
            {filteredPairs.map((pair, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border/50">
                <div>
                  <p className="font-medium text-sm">{pair.pair}</p>
                </div>
                <div className="flex gap-6 text-sm">
                  <div className="text-right">
                    <p className="text-muted-foreground text-xs">Times Together</p>
                    <p className="font-semibold">{pair.frequency}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-muted-foreground text-xs">Avg Duration</p>
                    <p className="font-semibold">{pair.avgDuration} min</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            {searchQuery ? `No pairs found for "${searchQuery}"` : "No co-fronting data yet"}
          </p>
        )}
      </Card>

      {/* Average Session Duration by Alter */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Average Session Duration by Alter ({filteredAlters.length})</h2>
        {filteredAlters.length > 0 ? (
          <div className="space-y-3">
            {filteredAlters.map((alter, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border/50">
                <div>
                  <p className="font-medium text-sm">{alter.name}</p>
                </div>
                <div className="flex gap-6 text-sm">
                  <div className="text-right">
                    <p className="text-muted-foreground text-xs">Total Sessions</p>
                    <p className="font-semibold">{alter.totalSessions}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-muted-foreground text-xs">Avg Duration</p>
                    <p className="font-semibold">{alter.avgDuration} min</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            {searchQuery ? `No alters found for "${searchQuery}"` : "No session data yet"}
          </p>
        )}
      </Card>

      {/* Co-Fronting Trend */}
      {analytics.trendData.length > 0 && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Co-Fronting Trend (Last 30 Days)</h2>
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
        </Card>
      )}
    </div>
  );
}