import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useTerms } from "@/lib/useTerms";
import { useSystemIdentity } from "@/lib/useSystemIdentity";
import SystemAvatar from "@/components/shared/SystemAvatar";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { Search, X, ChevronRight } from "lucide-react";
import {
  normalizeSessions,
  sessionsInRange,
  sliceByOverlap,
  effectiveDurationMs,
} from "@/lib/sessionNormalizer";

const SYSTEM_VIEW_ID = "__system__";

export default function CoFrontingAnalytics() {
  const terms = useTerms();
  const systemIdentity = useSystemIdentity();
  const [searchQuery, setSearchQuery] = useState("");
  // Default to the system-wide view so users who don't track fronting
  // per-alter still land on something useful — every co-fronting pair
  // ranked by frequency across the whole system.
  const [selectedAlterId, setSelectedAlterId] = useState(SYSTEM_VIEW_ID);

  const { data: sessions = [] } = useQuery({
    queryKey: ["frontingSessions"],
    queryFn: () => base44.entities.FrontingSession.list(),
  });

  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });

  const analytics = useMemo(() => {
    // Range is "all time" on this standalone page — use a wide
    // window so the in-range clamp still kills unclosed-session
    // leak past today but doesn't filter historical data.
    const fromMs = startOfDay(subDays(new Date(), 365 * 10)).getTime();
    const toMs = endOfDay(new Date()).getTime();
    const now = Date.now();
    const normalised = normalizeSessions(sessions, now);
    const inRange = sessionsInRange(normalised, fromMs, toMs, now);

    const alterPairMap = new Map(); // "alterId1|alterId2" -> { count, duration }
    const alterTotals = new Map(); // alterId -> { sessions, duration }

    alters.forEach((a) => {
      alterTotals.set(a.id, { sessions: 0, duration: 0 });
    });

    // Per-alter session counts + duration: walk the in-range
    // sessions once. For per-alter rows, this naturally gives "I
    // was in N sessions"; for legacy group rows the primary +
    // every co-fronter all get a session credit.
    inRange.forEach((session) => {
      const durationMin = effectiveDurationMs(session, fromMs, toMs, now) / 60000;
      for (const id of session.alterIds) {
        if (!alterTotals.has(id)) continue;
        const stats = alterTotals.get(id);
        stats.sessions += 1;
        stats.duration += durationMin;
      }
    });

    // Pair counts via overlap-slice sweep. This unifies both
    // models: a legacy group row contributes one slice with all
    // alterIds → pairs emit naturally; two per-alter rows that
    // overlap in wall-clock time contribute a slice with both
    // alterIds → pairs emit for the overlap window. Solo slices
    // (|alterIds| == 1) contribute nothing here.
    const slices = sliceByOverlap(inRange, fromMs, toMs, now);
    for (const slice of slices) {
      const ids = [...slice.aliveAlterIds];
      if (ids.length < 2) continue;
      const durMin = (slice.endMs - slice.startMs) / 60000;
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const key = [ids[i], ids[j]].sort().join("|");
          if (!alterPairMap.has(key)) {
            alterPairMap.set(key, { count: 0, duration: 0 });
          }
          const pair = alterPairMap.get(key);
          pair.count += 1;
          pair.duration += durMin;
        }
      }
    }

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
    let systemPairs = [];
    if (selectedAlterId === SYSTEM_VIEW_ID) {
      // System-wide view: every co-fronting pair ranked by frequency,
      // not scoped to any one alter. Useful for users who don't track
      // fronting per-alter — they still get insight into who tends to
      // be present together.
      systemPairs = Array.from(alterPairMap.entries())
        .map(([key, data]) => {
          const [id1, id2] = key.split("|");
          const a1 = alters.find((a) => a.id === id1);
          const a2 = alters.find((a) => a.id === id2);
          return {
            key,
            id1,
            id2,
            name1: a1?.name || "Unknown",
            name2: a2?.name || "Unknown",
            frequency: data.count,
            totalDuration: data.duration,
            avgDuration: Math.round(data.duration / data.count),
          };
        })
        .sort((a, b) => b.totalDuration - a.totalDuration);
    } else if (selectedAlterId) {
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

    // Trend data: walk the last-30-day slices so we count
    // co-fronting under both models. A slice on a day with
    // |aliveAlterIds| >= 2 is a co-fronting moment on that day.
    const trendFromMs = startOfDay(subDays(new Date(), 30)).getTime();
    const trendToMs = endOfDay(new Date()).getTime();
    const trendMap = new Map();
    // total sessions per day (started in window)
    inRange.forEach((session) => {
      if (session.startMs < trendFromMs || session.startMs > trendToMs) return;
      const dateKey = format(new Date(session.startMs), "MMM d");
      if (!trendMap.has(dateKey)) trendMap.set(dateKey, { total: 0, coFront: 0, coFrontKeys: new Set() });
      trendMap.get(dateKey).total += 1;
    });
    // co-front days: each multi-alter slice contributes a unique
    // co-fronting-period-per-day marker (so a 2h slice == one
    // co-fronting period, not two)
    sliceByOverlap(inRange, trendFromMs, trendToMs, now).forEach((slice) => {
      if (slice.aliveAlterIds.size < 2) return;
      const dateKey = format(new Date(slice.startMs), "MMM d");
      if (!trendMap.has(dateKey)) trendMap.set(dateKey, { total: 0, coFront: 0, coFrontKeys: new Set() });
      const k = [...slice.aliveAlterIds].sort().join("|");
      const m = trendMap.get(dateKey);
      if (!m.coFrontKeys.has(k)) {
        m.coFrontKeys.add(k);
        m.coFront += 1;
      }
    });

    const trendData = Array.from(trendMap.entries())
      .map(([date, data]) => ({
        date,
        coFrontingSessions: data.coFront,
        totalSessions: data.total,
      }));

    return { allAltersList, selectedAlterPairs, systemPairs, trendData };
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
            {/* System-wide view — shows every co-fronting pair across
                the whole system, ranked by frequency. Always sits at
                the top of the list so a user who doesn't pick an
                {terms.alter} still gets a useful default. */}
            <button
              onClick={() => setSelectedAlterId(SYSTEM_VIEW_ID)}
              className={`w-full text-left p-3 rounded-lg border transition-all ${
                selectedAlterId === SYSTEM_VIEW_ID
                  ? "bg-primary/10 border-primary"
                  : "bg-muted/30 border-border/50 hover:bg-muted/50"
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 flex items-center gap-2">
                  <SystemAvatar size="sm" />
                  <div>
                    <p className="font-medium text-sm">{systemIdentity.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">All pairs combined</p>
                  </div>
                </div>
                {selectedAlterId === SYSTEM_VIEW_ID && <ChevronRight className="w-4 h-4 text-primary mt-1" />}
              </div>
            </button>
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

        {/* Co-Fronters for Selected Alter — or, in System view, every
            co-fronting pair across the whole system. */}
        <Card className="p-4 lg:col-span-2">
          {selectedAlterId === SYSTEM_VIEW_ID ? (
            <>
              <h2 className="text-lg font-semibold mb-4">
                All {terms.cofronting} pairs ({analytics.systemPairs.length})
              </h2>
              {analytics.systemPairs.length > 0 ? (
                <div className="space-y-3">
                  {analytics.systemPairs.map((pair) => (
                    <div
                      key={pair.key}
                      className="p-3 bg-muted/30 rounded-lg border border-border/50 hover:bg-muted/50 transition-colors cursor-pointer"
                      onClick={() => setSelectedAlterId(pair.id1)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className="font-medium text-sm">{pair.name1} + {pair.name2}</p>
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
                  No {terms.cofronting} pairs logged yet.
                </p>
              )}
            </>
          ) : selectedAlterId ? (
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