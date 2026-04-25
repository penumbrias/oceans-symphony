import React, { useMemo, useState } from "react";
import { Check, X, ChevronLeft, ChevronRight } from "lucide-react";
import { formatPeriodKey, getRecentPeriodKeys, getPeriodKey } from "@/lib/dailyTaskSystem";
import { applyTerms } from "@/lib/dailyTaskSystem";
import { useTerms } from "@/lib/useTerms";

const REVIEW_COUNTS = { daily: 14, weekly: 12, monthly: 12, yearly: 5 };

export default function PeriodReview({ frequency, templates, allProgress }) {
  const terms = useTerms();
  const [offset, setOffset] = useState(0);

  const count = REVIEW_COUNTS[frequency] || 12;
  const activeTasks = useMemo(
    () => templates.filter(t => t.is_active && (t.frequency || "daily") === frequency)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
    [templates, frequency]
  );

  // All period keys for this frequency (most recent first), paginated
  const allKeys = useMemo(() => getRecentPeriodKeys(frequency, count * 10), [frequency, count]);
  const pageKeys = useMemo(() => allKeys.slice(offset, offset + count), [allKeys, offset, count]);

  // Build a map: periodKey -> completed task id set
  const progressMap = useMemo(() => {
    const map = {};
    allProgress.forEach(p => {
      const key = p.frequency === frequency
        ? (p.period_key || p.date)
        : (frequency === "daily" ? p.date : null);
      if (!key) return;
      if (!map[key]) map[key] = new Set();
      (p.completed_task_ids || []).forEach(id => map[key].add(id));
    });
    return map;
  }, [allProgress, frequency]);

  const currentKey = getPeriodKey(frequency);

  if (activeTasks.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground text-sm">
        No active {frequency} tasks yet. Add some in the task manager.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Hobonichi grid */}
      <div className="overflow-x-auto rounded-xl border border-border/50 bg-card">
        <table className="text-xs w-full border-collapse">
          <thead>
            <tr className="border-b border-border/40">
              <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground min-w-[120px] sticky left-0 bg-card z-10">
                Task
              </th>
              {pageKeys.map(key => (
                <th
                  key={key}
                  className={`px-2 py-2 font-medium text-center min-w-[44px] whitespace-nowrap ${
                    key === currentKey ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  <span className="block text-[10px]">{formatPeriodKeyShort(frequency, key)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activeTasks.map((task, idx) => {
              const totalDone = pageKeys.filter(k => progressMap[k]?.has(task.id)).length;
              return (
                <tr
                  key={task.id}
                  className={`border-b border-border/20 last:border-0 ${idx % 2 === 0 ? "" : "bg-muted/10"}`}
                >
                  <td className="px-3 py-2 sticky left-0 bg-inherit z-10">
                    <div className="font-medium text-foreground truncate max-w-[160px]">
                      {applyTerms(task.title, terms)}
                    </div>
                    <div className="text-[10px] text-muted-foreground">{task.points} pts · {totalDone}/{pageKeys.length} done</div>
                  </td>
                  {pageKeys.map(key => {
                    const done = progressMap[key]?.has(task.id);
                    const isCurrent = key === currentKey;
                    return (
                      <td key={key} className={`px-1 py-2 text-center ${isCurrent ? "bg-primary/5" : ""}`}>
                        {done ? (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/15 text-primary">
                            <Check className="w-3 h-3" />
                          </span>
                        ) : (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-muted/30 text-muted-foreground/40">
                            <X className="w-3 h-3" />
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
          {/* Footer: completion % per period */}
          <tfoot>
            <tr className="border-t border-border/40 bg-muted/20">
              <td className="px-3 py-2 text-[10px] font-semibold text-muted-foreground sticky left-0 bg-muted/20 z-10">
                Completion
              </td>
              {pageKeys.map(key => {
                const done = activeTasks.filter(t => progressMap[key]?.has(t.id)).length;
                const pct = activeTasks.length > 0 ? Math.round((done / activeTasks.length) * 100) : 0;
                const isCurrent = key === currentKey;
                return (
                  <td key={key} className={`px-1 py-2 text-center ${isCurrent ? "bg-primary/5" : ""}`}>
                    <span className={`text-[10px] font-bold ${pct === 100 ? "text-primary" : pct >= 50 ? "text-foreground" : "text-muted-foreground"}`}>
                      {pct}%
                    </span>
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
        <button
          onClick={() => setOffset(o => o + count)}
          disabled={offset + count >= allKeys.length}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border hover:bg-muted/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="w-3.5 h-3.5" /> Older
        </button>
        <span>{pageKeys.length > 0 ? `${formatPeriodKey(pageKeys[pageKeys.length - 1])} → ${formatPeriodKey(pageKeys[0])}` : ""}</span>
        <button
          onClick={() => setOffset(o => Math.max(0, o - count))}
          disabled={offset === 0}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border hover:bg-muted/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Newer <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

function formatPeriodKeyShort(frequency, key) {
  if (!key) return "";
  if (frequency === "daily") {
    // Show Mon 4/21 style
    const d = new Date(key + "T00:00:00");
    return d.toLocaleDateString(undefined, { month: "numeric", day: "numeric" });
  }
  if (frequency === "weekly") {
    const [, week] = key.split("-W");
    return `W${week}`;
  }
  if (frequency === "monthly") {
    const [year, month] = key.split("-");
    const d = new Date(Number(year), Number(month) - 1, 1);
    return d.toLocaleDateString(undefined, { month: "short" }).replace(".", "");
  }
  if (frequency === "yearly") return key;
  return key;
}