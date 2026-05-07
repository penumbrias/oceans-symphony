import React, { useMemo } from "react";
import { computeAlterCoFrontingMatrix } from "@/lib/analyticsEngine";

function cellColor(count, maxCount) {
  if (count === 0) return { bg: "bg-muted/10", text: "text-muted-foreground/30" };
  const intensity = maxCount > 0 ? count / maxCount : 0;
  if (intensity >= 0.75) return { bg: "bg-primary/80", text: "text-white" };
  if (intensity >= 0.5)  return { bg: "bg-primary/50", text: "text-foreground" };
  if (intensity >= 0.25) return { bg: "bg-primary/25", text: "text-foreground" };
  return { bg: "bg-primary/10", text: "text-foreground" };
}

export default function AlterCoFrontingMap({ frontingSessions, alters }) {
  const altersWithSessions = useMemo(() => {
    const activeIds = new Set();
    frontingSessions.forEach(s => {
      if (s.alter_id) activeIds.add(s.alter_id);
      if (s.primary_alter_id) activeIds.add(s.primary_alter_id);
      (s.co_fronter_ids || []).forEach(id => activeIds.add(id));
    });
    return alters.filter(a => activeIds.has(a.id));
  }, [frontingSessions, alters]);

  const { matrix, maxCount, pairs } = useMemo(
    () => computeAlterCoFrontingMatrix(frontingSessions, altersWithSessions),
    [frontingSessions, altersWithSessions]
  );

  const altersById = useMemo(() => {
    const map = {};
    alters.forEach(a => { map[a.id] = a; });
    return map;
  }, [alters]);

  if (altersWithSessions.length < 2) {
    return (
      <div className="py-10 text-center space-y-1">
        <p className="text-sm text-muted-foreground">Not enough data for a co-fronting map.</p>
        <p className="text-xs text-muted-foreground">
          Co-fronting data appears after multiple members have been logged together or in overlapping sessions.
        </p>
      </div>
    );
  }

  if (pairs.length === 0) {
    return (
      <div className="py-10 text-center space-y-1">
        <p className="text-sm text-muted-foreground">No co-fronting sessions recorded yet.</p>
        <p className="text-xs text-muted-foreground">Log sessions with multiple members fronting together to see pairings here.</p>
      </div>
    );
  }

  const showMatrix = altersWithSessions.length <= 10;

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground leading-relaxed">
        How often each pair of system members co-front. Darker cells indicate more frequent co-fronting.
      </p>

      {/* Matrix — only shown when ≤10 alters to stay readable */}
      {showMatrix && (
        <div className="bg-card border border-border/50 rounded-xl p-3 overflow-x-auto">
          <table className="text-xs border-collapse">
            <thead>
              <tr>
                <th className="w-20" />
                {altersWithSessions.map(a => (
                  <th key={a.id} className="px-1 py-2 font-medium text-muted-foreground text-center">
                    <div className="flex flex-col items-center gap-0.5">
                      {a.avatar_url
                        ? <img src={a.avatar_url} className="w-4 h-4 rounded-full object-cover" />
                        : <div className="w-3 h-3 rounded-full" style={{ backgroundColor: a.color || "#8b5cf6" }} />
                      }
                      <span style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", whiteSpace: "nowrap", maxHeight: 72, overflow: "hidden" }}>
                        {a.name}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {altersWithSessions.map((rowAlter) => (
                <tr key={rowAlter.id}>
                  <td className="pr-2 py-1 text-right font-medium text-foreground whitespace-nowrap text-xs">
                    <div className="flex items-center justify-end gap-1.5">
                      {rowAlter.avatar_url
                        ? <img src={rowAlter.avatar_url} className="w-3.5 h-3.5 rounded-full object-cover" />
                        : <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: rowAlter.color || "#8b5cf6" }} />
                      }
                      <span className="truncate max-w-[70px]">{rowAlter.name}</span>
                    </div>
                  </td>
                  {altersWithSessions.map((colAlter) => {
                    const isDiag = rowAlter.id === colAlter.id;
                    const count = isDiag ? null : (matrix[rowAlter.id]?.[colAlter.id] || 0);
                    const { bg, text } = isDiag ? { bg: "bg-muted/20", text: "" } : cellColor(count, maxCount);
                    return (
                      <td
                        key={colAlter.id}
                        className={`w-9 h-7 text-center border border-border/20 rounded transition-all ${bg} ${text} ${isDiag ? "opacity-30" : ""}`}
                        title={isDiag ? rowAlter.name : `${rowAlter.name} × ${colAlter.name}: ${count ?? 0} co-fronting session${count !== 1 ? "s" : ""}`}
                      >
                        {!isDiag ? (count > 0 ? count : "·") : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Top pairs list */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">
          {showMatrix ? "Most frequent pairings" : "Co-fronting pairs"}
        </h3>
        {pairs.slice(0, 10).map(({ a, b, count }) => {
          const alterA = altersById[a];
          const alterB = altersById[b];
          if (!alterA || !alterB) return null;
          const pct = maxCount > 0 ? Math.round((count / maxCount) * 100) : 0;
          return (
            <div key={`${a}_${b}`} className="flex items-center gap-3 bg-muted/20 rounded-lg px-3 py-2">
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  {alterA.avatar_url
                    ? <img src={alterA.avatar_url} className="w-4 h-4 rounded-full object-cover" />
                    : <div className="w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ backgroundColor: alterA.color || "#8b5cf6" }} />
                  }
                  <span className="text-sm font-medium truncate">{alterA.name}</span>
                </div>
                <span className="text-muted-foreground text-xs flex-shrink-0">+</span>
                <div className="flex items-center gap-1">
                  {alterB.avatar_url
                    ? <img src={alterB.avatar_url} className="w-4 h-4 rounded-full object-cover" />
                    : <div className="w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ backgroundColor: alterB.color || "#8b5cf6" }} />
                  }
                  <span className="text-sm font-medium truncate">{alterB.name}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary/60 rounded-full" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-xs text-muted-foreground w-16 text-right">
                  {count} session{count !== 1 ? "s" : ""}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {!showMatrix && (
        <p className="text-xs text-muted-foreground">
          Matrix view is hidden for systems with more than 10 members to keep it readable.
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        Based on all recorded sessions. Individual sessions are considered co-fronting when their time windows overlap.
      </p>
    </div>
  );
}
