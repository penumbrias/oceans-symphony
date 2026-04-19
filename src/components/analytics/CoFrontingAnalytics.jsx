import React, { useMemo } from "react";
import { startOfDay, endOfDay } from "date-fns";
import { useTerms } from "@/lib/useTerms";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Card } from "@/components/ui/card";

const getAlterIdFromSession = (s) => s.alter_id || s.primary_alter_id;
const getAllIdsFromSession = (s) => s.alter_id ? [s.alter_id] : [s.primary_alter_id, ...(s.co_fronter_ids || [])].filter(Boolean);

export default function CoFrontingAnalytics({ sessions = [], alters = [], altersById = {}, from, to }) {
  const terms = useTerms();
  const cofrontingLabel = terms.Cofronting;

  // Compute co-fronting pairs with overlap analysis
  const coFrontingPairs = useMemo(() => {
    const pairs = {};
    const filtered = sessions.filter((s) => {
      const st = new Date(s.start_time).getTime();
      return st >= startOfDay(from).getTime() && st <= endOfDay(to).getTime();
    });

    const addOverlap = (idA, idB, overlap) => {
      if (!idA || !idB || idA === idB) return;
      const pairKey = [idA, idB].sort().join("--");
      if (!pairs[pairKey]) {
        pairs[pairKey] = {
          alterIdA: [idA, idB].sort()[0],
          alterIdB: [idA, idB].sort()[1],
          totalOverlap: 0,
          occurrences: 0,
        };
      }
      pairs[pairKey].totalOverlap += overlap;
      pairs[pairKey].occurrences += 1;
    };

    // New individual model: find overlapping sessions between different alters
    const individualSessions = filtered.filter(s => s.alter_id);
    for (let i = 0; i < individualSessions.length; i++) {
      for (let j = i + 1; j < individualSessions.length; j++) {
        const a = individualSessions[i];
        const b = individualSessions[j];
        if (a.alter_id === b.alter_id) continue;
        const aStart = new Date(a.start_time).getTime();
        const aEnd = a.end_time ? new Date(a.end_time).getTime() : Date.now();
        const bStart = new Date(b.start_time).getTime();
        const bEnd = b.end_time ? new Date(b.end_time).getTime() : Date.now();
        const overlapStart = Math.max(aStart, bStart);
        const overlapEnd = Math.min(aEnd, bEnd);
        if (overlapEnd > overlapStart) {
          addOverlap(a.alter_id, b.alter_id, overlapEnd - overlapStart);
        }
      }
    }

    // Legacy grouped model: primary + co_fronter_ids were all fronting together
    const legacySessions = filtered.filter(s => !s.alter_id && s.primary_alter_id);
    legacySessions.forEach(s => {
      const start = new Date(s.start_time).getTime();
      const end = s.end_time ? new Date(s.end_time).getTime() : Date.now();
      const duration = end - start;
      const ids = [s.primary_alter_id, ...(s.co_fronter_ids || [])].filter(Boolean);
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          addOverlap(ids[i], ids[j], duration);
        }
      }
    });

    return Object.values(pairs).sort((a, b) => b.totalOverlap - a.totalOverlap);
  }, [sessions, from, to]);

  // Solo vs co-fronting breakdown per alter
  const alterSoloVsCo = useMemo(() => {
    return alters
      .filter((a) => !a.is_archived)
      .map((alter) => {
        const alterSessions = sessions.filter((s) => getAllIdsFromSession(s).includes(alter.id));
        let soloTime = 0;
        let coTime = 0;

        alterSessions.forEach((session) => {
          const start = new Date(session.start_time).getTime();
          const end = session.end_time ? new Date(session.end_time).getTime() : Date.now();
          const duration = end - start;

          // Check if any other session overlaps
          const hasOverlap = sessions.some((other) => {
            if (other.id === session.id || !getAllIdsFromSession(other).includes(alter.id)) return false;
            const oStart = new Date(other.start_time).getTime();
            const oEnd = other.end_time ? new Date(other.end_time).getTime() : Date.now();
            return oStart < end && oEnd > start;
          });

          if (hasOverlap) coTime += duration;
          else soloTime += duration;
        });

        return { alter, soloTime, coTime, total: soloTime + coTime };
      })
      .filter((d) => d.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [sessions, alters]);

  // Time of day co-fronting
  const coFrontingByHour = useMemo(() => {
    const hours = Array(24).fill(0);
    const filtered = sessions.filter((s) => {
      const st = new Date(s.start_time).getTime();
      return st >= startOfDay(from).getTime() && st <= endOfDay(to).getTime();
    });

    const addHourOverlap = (startMs, endMs) => {
      const startHour = new Date(startMs).getHours();
      const endHour = new Date(endMs).getHours();
      for (let h = startHour; h <= endHour && h < 24; h++) {
        hours[h] += 1;
      }
    };

    // New individual model
    const individualSessions = filtered.filter(s => s.alter_id);
    for (let i = 0; i < individualSessions.length; i++) {
      for (let j = i + 1; j < individualSessions.length; j++) {
        const a = individualSessions[i];
        const b = individualSessions[j];
        if (a.alter_id === b.alter_id) continue;
        const aStart = new Date(a.start_time).getTime();
        const aEnd = a.end_time ? new Date(a.end_time).getTime() : Date.now();
        const bStart = new Date(b.start_time).getTime();
        const bEnd = b.end_time ? new Date(b.end_time).getTime() : Date.now();
        const overlapStart = Math.max(aStart, bStart);
        const overlapEnd = Math.min(aEnd, bEnd);
        if (overlapEnd > overlapStart) {
          addHourOverlap(overlapStart, overlapEnd);
        }
      }
    }

    // Legacy grouped model
    const legacySessions = filtered.filter(s => !s.alter_id && s.primary_alter_id);
    legacySessions.forEach(s => {
      const ids = [s.primary_alter_id, ...(s.co_fronter_ids || [])].filter(Boolean);
      if (ids.length > 1) {
        addHourOverlap(new Date(s.start_time).getTime(), s.end_time ? new Date(s.end_time).getTime() : Date.now());
      }
    });

    // De-duplicate
    return hours.map((h) => Math.round(h / 2));
  }, [sessions, from, to]);

  // Co-fronting matrix
  const matrixAlters = useMemo(
    () =>
      alters.filter(
        (a) =>
          !a.is_archived &&
          sessions.some((s) => getAllIdsFromSession(s).includes(a.id))
      ),
    [alters, sessions]
  );

  const getCellValue = (idA, idB) => {
    const key = [idA, idB].sort().join("--");
    const pair = coFrontingPairs.find(
      (p) =>
        (p.alterIdA === idA && p.alterIdB === idB) ||
        (p.alterIdA === idB && p.alterIdB === idA)
    );
    return pair?.totalOverlap || 0;
  };

  const maxValue = coFrontingPairs.length > 0 ? coFrontingPairs[0].totalOverlap : 1;

  const chartData = Array.from({ length: 24 }, (_, i) => ({
    hour: `${i}:00`,
    pairs: coFrontingByHour[i],
  }));

  return (
    <div className="space-y-6">
      {/* Most frequent co-fronting pairs */}
      {coFrontingPairs.length > 0 ? (
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Most Frequent {terms.Cofronting} Pairs</h2>
          <div className="space-y-3">
            {coFrontingPairs.slice(0, 10).map((pair) => {
              const alterA = altersById[pair.alterIdA];
              const alterB = altersById[pair.alterIdB];
              const hours = Math.floor(pair.totalOverlap / 3600000);
              const mins = Math.floor((pair.totalOverlap % 3600000) / 60000);

              return (
                <div
                  key={`${pair.alterIdA}--${pair.alterIdB}`}
                  className="flex items-center gap-3 p-3 rounded-xl border border-border/50 bg-card/50 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs flex-shrink-0"
                      style={{ backgroundColor: alterA?.color || "#8b5cf6" }}
                    >
                      {alterA?.name?.charAt(0)?.toUpperCase()}
                    </div>
                    <span className="text-xs text-muted-foreground">+</span>
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs flex-shrink-0"
                      style={{ backgroundColor: alterB?.color || "#8b5cf6" }}
                    >
                      {alterB?.name?.charAt(0)?.toUpperCase()}
                    </div>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">
                      {alterA?.name} + {alterB?.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {pair.occurrences} times · {hours}h {mins}m total
                    </p>
                  </div>
                  <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{
                        width: `${Math.min(
                          100,
                          (pair.totalOverlap / coFrontingPairs[0]?.totalOverlap) * 100
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ) : (
        <Card className="p-6">
          <p className="text-muted-foreground text-sm">No {terms.cofronting} data in this date range.</p>
        </Card>
      )}

      {/* Co-fronting matrix heatmap */}
      {matrixAlters.length > 0 && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">{terms.Cofronting} Matrix</h2>
          <div className="overflow-x-auto">
            <div className="inline-block min-w-full">
              {/* Column headers */}
              <div className="flex">
                <div className="w-24 flex-shrink-0" />
                {matrixAlters.map((a) => (
                  <div
                    key={`header-${a.id}`}
                    className="w-12 h-12 flex items-center justify-center flex-shrink-0 text-xs font-semibold"
                  >
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-xs"
                      style={{ backgroundColor: a.color || "#8b5cf6" }}
                      title={a.name}
                    >
                      {a.name?.charAt(0)?.toUpperCase()}
                    </div>
                  </div>
                ))}
              </div>

              {/* Rows */}
              {matrixAlters.map((alterA) => (
                <div key={`row-${alterA.id}`} className="flex">
                  <div className="w-24 flex-shrink-0 flex items-center pr-2 text-xs font-medium text-foreground truncate">
                    {alterA.name}
                  </div>
                  {matrixAlters.map((alterB) => {
                    const value = getCellValue(alterA.id, alterB.id);
                    const intensity = maxValue > 0 ? value / maxValue : 0;
                    const hours = Math.floor(value / 3600000);
                    const mins = Math.floor((value % 3600000) / 60000);

                    return (
                      <div
                        key={`cell-${alterA.id}-${alterB.id}`}
                        className="w-12 h-12 flex items-center justify-center flex-shrink-0 border border-border/20 text-xs font-semibold hover:border-border transition-colors cursor-help"
                        style={{
                          backgroundColor:
                            intensity > 0
                              ? `rgba(59, 130, 246, ${Math.max(0.1, intensity)})`
                              : "transparent",
                        }}
                        title={
                          value > 0
                            ? `${hours}h ${mins}m together`
                            : "No overlap"
                        }
                      >
                        {value > 0 && (
                          <span className="text-foreground text-xs">
                            {hours > 0 ? `${hours}h` : `${mins}m`}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Time of day co-fronting */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Time of Day {terms.Cofronting}</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="hour" />
            <YAxis />
            <Tooltip contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)" }} />
            <Legend />
            <Bar
              dataKey="pairs"
              fill="var(--color-primary)"
              name={`Active ${cofrontingLabel} Pairs`}
              radius={[8, 8, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Solo vs co-fronting breakdown */}
      {alterSoloVsCo.length > 0 && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Solo vs {terms.Cofronting} Breakdown</h2>
          <div className="space-y-4">
            {alterSoloVsCo.map(({ alter, soloTime, coTime, total }) => {
              const soloPct = total > 0 ? (soloTime / total) * 100 : 0;
              const coPct = total > 0 ? (coTime / total) * 100 : 0;
              const soloHours = Math.floor(soloTime / 3600000);
              const coHours = Math.floor(coTime / 3600000);

              return (
                <div key={alter.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-foreground">{alter.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {soloHours}h solo · {coHours}h {terms.cofronting}
                    </p>
                  </div>
                  <div className="flex h-3 rounded-full overflow-hidden bg-muted/50">
                    <div
                      className="bg-primary transition-all"
                      style={{ width: `${soloPct}%` }}
                      title={`Solo: ${soloHours}h`}
                    />
                    <div
                      className="bg-accent transition-all"
                      style={{ width: `${coPct}%` }}
                      title={`Co-fronting: ${coHours}h`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}