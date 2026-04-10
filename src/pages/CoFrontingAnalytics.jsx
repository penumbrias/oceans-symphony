import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useTerms } from "@/lib/useTerms";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { format, subDays } from "date-fns";
import { Search, X, ChevronRight } from "lucide-react";

export default function CoFrontingAnalytics() {
  const terms = useTerms();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAlterId, setSelectedAlterId] = useState(null);

  const { data: sessions = [] } = useQuery({
    queryKey: ["frontingSessions"],
    queryFn: () => base44.entities.FrontingSession.list(),
  });

  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });

  const analytics = useMemo(() => {
    const alterPairMap = new Map(); // "alterId1|alterId2" -> { count, duration }
    const alterTotals = new Map(); // alterId -> { sessions, duration }

    alters.forEach((a) => {
      alterTotals.set(a.id, { sessions: 0, duration: 0 });
    });

    sessions.forEach((session) => {
      const primary = session.primary_alter_id;
      const coFronters = session.co_fronter_ids || [];
      const duration = session.end_time
        ? (new Date(session.end_time) - new Date(session.start_time)) / (1000 * 60)
        : 0;

      // Track primary fronter
      if (primary && alterTotals.has(primary)) {
        const stats = alterTotals.get(primary);
        stats.sessions += 1;
        stats.duration += duration;
      }

      // Track all fronting alters together
      const allFronters = [primary, ...coFronters].filter(Boolean);
      for (let i = 0; i < allFronters.length; i++) {
        for (let j = i + 1; j < allFronters.length; j++) {
          const key = [allFronters[i], allFronters[j]].sort().join("|");
          if (!alterPairMap.has(key)) {
            alterPairMap.set(key, { count: 0, duration: 0 });
          }
          const pair = alterPairMap.get(key);
          pair.count += 1;
          pair.duration += duration;
        }
      }
    });

    // Get all alters sorted by sessions
    const allAltersList = alters
      .map((a) => {
        const stats = alterTotals.get(a.id) || { sessions: 0, duration: 0 };
        return {
          id: a.id,
          name: a.name,
          sessions: stats.sessions,
          totalDuration: stats.duration,
          avgDuration: stats.sessions > 0 ? Math.round(stats.duration / stats.sessions) : 0,
        };
      })
      .filter((a) => a.sessions > 0)
      .sort((a, b) => b.sessions - a.sessions);

    // Get co-fronters for selected alter
    let selectedAlterPairs = [];
    if (selectedAlterId) {
      selectedAlterPairs = Array.from(alterPairMap.entries())
        .filter(([key]) => key.includes(selectedAlterId))
        .map(([key, data]) => {
          const [id1, id2] = key.split("|");
          const otherId = id1 === selectedAlterId ? id2 : id1;
          const otherAlter = alters.find((a) => a.id === otherId);
          return {
            alterId: otherId,
            name: otherAlter?.name || "Unknown",
            frequency: data.count,
            totalDuration: data.duration,
            avgDuration: Math.round(data.duration / data.count),
          };
        })
        .sort((a, b) => b.totalDuration - a.totalDuration);
    }

    // Trend data
    const last30Days = subDays(new Date(), 30);
    const trendMap = new Map();

    sessions.forEach((session) => {
      const sessionDate = new Date(session.start_time);
      if (sessionDate >= last30Days) {
        const dateKey = format(sessionDate, "MMM d");
        const coFronters = (session.co_fronter_ids || []).length > 0;
        if (!trendMap.has(dateKey)) {
          trendMap.set(dateKey, { total: 0, coFront: 0 });
        }
        const existing = trendMap.get(dateKey);
        existing.total += 1;
        if (coFronters) existing.coFront += 1;
      }
    });

    const trendData = Array.from(trendMap.entries())
      .map(([date, data]) => ({
        date,
        coFrontingSessions: data.coFront,
        totalSessions: data.total,
      }));

    return { allAltersList, selectedAlterPairs, trendData };
  }, [sessions, alters, selectedAlterId]);

  const filteredAlters = useMemo(() => {
    if (!searchQuery.trim()) return analytics.allAltersList;
    const query = searchQuery.toLowerCase();
    return analytics.allAltersList.filter((a) => a.name.toLowerCase().includes(query));
  }, [analytics.allAltersList, searchQuery]);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">{terms.Cofronting} Analytics</h1>
        <p className="text-muted-foreground mt-1">Track {terms.cofronting} patterns and connections</p>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={`Search ${terms.alters}...`}
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Alter List */}
        <Card className="p-4">
          <h2 className="text-lg font-semibold mb-4">{terms.Alters} ({filteredAlters.length})</h2>
          <div className="space-y-2">
            {filteredAlters.map((alter) => (
              <button
                key={alter.id}
                onClick={() => setSelectedAlterId(alter.id)}
                className={`w-full text-left p-3 rounded-lg border transition-all ${
                  selectedAlterId === alter.id
                    ? "bg-primary/10 border-primary"
                    : "bg-muted/30 border-border/50 hover:bg-muted/50"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="font-medium text-sm">{alter.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">{alter.sessions} sessions</p>
                  </div>
                  {selectedAlterId === alter.id && <ChevronRight className="w-4 h-4 text-primary mt-1" />}
                </div>
              </button>
            ))}
          </div>
        </Card>

        {/* Co-Fronters for Selected Alter */}
        <Card className="p-4 lg:col-span-2">
          {selectedAlterId ? (
            <>
              <h2 className="text-lg font-semibold mb-4">
                {terms.Cofronters} ({analytics.selectedAlterPairs.length})
              </h2>
              {analytics.selectedAlterPairs.length > 0 ? (
                <div className="space-y-3">
                  {analytics.selectedAlterPairs.map((pair, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-muted/30 rounded-lg border border-border/50 hover:bg-muted/50 transition-colors cursor-pointer"
                      onClick={() => setSelectedAlterId(pair.alterId)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className="font-medium text-sm">{pair.name}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                                     {terms.Fronting} together {pair.frequency} times
                                   </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Avg Duration</p>
                          <p className="font-semibold text-sm">{pair.avgDuration} min</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">
                  No {terms.cofronting} data for this {terms.alter} yet
                </p>
              )}
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <p className="text-sm">Select {terms.alter} to view {terms.cofronters}</p>
            </div>
          )}
        </Card>
      </div>

      {/* Trend */}
      {analytics.trendData.length > 0 && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">{terms.Cofronting} Trend (Last 30 Days)</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={analytics.trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)" }} />
              <Legend />
              <Line
                type="monotone"
                dataKey="coFrontingSessions"
                stroke="#a855f7"
                name="Co-Fronting Sessions"
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey="totalSessions"
                stroke="#94a3b8"
                name="Total Sessions"
                strokeWidth={2}
                strokeDasharray="5 5"
              />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}
    </div>
  );
}