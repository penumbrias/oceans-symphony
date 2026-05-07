import React, { useMemo, useState, useRef, useCallback } from "react";
import { Check, X, ChevronLeft, ChevronRight } from "lucide-react";
import { formatPeriodKey, getRecentPeriodKeys, getPeriodKey } from "@/lib/dailyTaskSystem";
import { applyTerms } from "@/lib/dailyTaskSystem";
import { useTerms } from "@/lib/useTerms";

const REVIEW_COUNTS = { daily: 14, weekly: 12, monthly: 12, yearly: 5 };
const HOLD_MS = 2000;

export default function PeriodReview({ frequency, templates, allProgress, onToggleTask }) {
  const terms = useTerms();
  const [offset, setOffset] = useState(0);
  const [holdCell, setHoldCell] = useState(null); // { taskId, key, progress 0-1 }
  const [tapInfo, setTapInfo] = useState(null);   // string shown in banner
  const holdTimerRef = useRef(null);
  const holdAnimRef = useRef(null);
  const holdStartRef = useRef(null);
  const tapInfoTimerRef = useRef(null);

  const count = REVIEW_COUNTS[frequency] || 12;
  const activeTasks = useMemo(
    () => templates.filter(t => t.is_active && (t.frequency || "daily") === frequency)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
    [templates, frequency]
  );

  const allKeys = useMemo(() => getRecentPeriodKeys(frequency, count * 10), [frequency, count]);
  const pageKeys = useMemo(() => allKeys.slice(offset, offset + count), [allKeys, offset, count]);

  // Map: periodKey -> { ids: Set<id>, record: DailyProgress }
  const progressMap = useMemo(() => {
    const map = {};
    allProgress.forEach(p => {
      const key = p.frequency === frequency
        ? (p.period_key || p.date)
        : (frequency === "daily" ? p.date : null);
      if (!key) return;
      if (!map[key]) map[key] = { ids: new Set(), record: p };
      (p.completed_task_ids || []).forEach(id => map[key].ids.add(id));
    });
    return map;
  }, [allProgress, frequency]);

  const currentKey = getPeriodKey(frequency);

  const clearHold = useCallback(() => {
    clearTimeout(holdTimerRef.current);
    cancelAnimationFrame(holdAnimRef.current);
    holdStartRef.current = null;
    setHoldCell(null);
  }, []);

  const startCellHold = useCallback((taskId, key, done) => {
    clearHold();
    holdStartRef.current = Date.now();
    setHoldCell({ taskId, key, progress: 0 });

    const tick = () => {
      if (!holdStartRef.current) return;
      const p = Math.min((Date.now() - holdStartRef.current) / HOLD_MS, 1);
      setHoldCell(s => s ? { ...s, progress: p } : null);
      if (p < 1) holdAnimRef.current = requestAnimationFrame(tick);
    };
    holdAnimRef.current = requestAnimationFrame(tick);

    holdTimerRef.current = setTimeout(() => {
      holdStartRef.current = null;
      setHoldCell(null);
      onToggleTask?.(taskId, key, done);
    }, HOLD_MS);
  }, [clearHold, onToggleTask]);

  const endCellHold = useCallback((taskId, key, done, record) => {
    const elapsed = holdStartRef.current ? Date.now() - holdStartRef.current : 0;
    clearHold();
    // Short tap on a completed cell → show completion date
    if (elapsed < 500 && done) {
      clearTimeout(tapInfoTimerRef.current);
      setTapInfo(formatCompletionDate(frequency, key, record));
      tapInfoTimerRef.current = setTimeout(() => setTapInfo(null), 4000);
    }
  }, [clearHold, frequency]);

  if (activeTasks.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground text-sm">
        No active {frequency} tasks yet. Add some in the task manager.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Completion date banner */}
      {tapInfo && (
        <button
          onClick={() => setTapInfo(null)}
          className="w-full text-left px-4 py-2.5 rounded-xl bg-primary/10 border border-primary/20 text-primary text-xs font-medium animate-in fade-in slide-in-from-top-2 duration-200"
        >
          {tapInfo}
        </button>
      )}

      {/* Hint shown when no tapInfo */}
      {!tapInfo && (
        <p className="text-[11px] text-muted-foreground px-1">
          Tap ✓ to see completion date · Hold 2s to change
        </p>
      )}

      {/* Grid */}
      <div className="overflow-x-auto rounded-xl border border-border/50 bg-card">
        <table className="text-xs w-full border-collapse">
          <thead>
            <tr className="border-b border-border/40" style={{ background: "var(--color-surface)" }}>
              <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground min-w-[120px] sticky left-0 z-10 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.15)]" style={{ background: "var(--color-surface)" }}>
                Task
              </th>
              {pageKeys.map(key => (
                <th
                  key={key}
                  className={`px-2 py-2 font-medium text-center min-w-[44px] whitespace-nowrap ${
                    key === currentKey ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  {frequency === "daily" ? (
                    <>
                      <span className="block text-[10px] font-semibold">{getDayOfWeek(key)}</span>
                      <span className="block text-[10px] opacity-70">{formatPeriodKeyShort(frequency, key)}</span>
                    </>
                  ) : (
                    <span className="block text-[10px]">{formatPeriodKeyShort(frequency, key)}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activeTasks.map((task, idx) => {
              const totalDone = pageKeys.filter(k => progressMap[k]?.ids?.has(task.id)).length;
              const rowBg = idx % 2 === 0 ? "var(--color-surface)" : "var(--color-bg)";
              return (
                <tr
                  key={task.id}
                  className="border-b border-border/20 last:border-0"
                  style={{ background: rowBg }}
                >
                  <td className="px-3 py-2 sticky left-0 z-10 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.15)]" style={{ background: rowBg }}>
                    <div className="font-medium text-foreground truncate max-w-[160px]">
                      {applyTerms(task.title, terms)}
                    </div>
                    <div className="text-[10px] text-muted-foreground">{task.points} pts · {totalDone}/{pageKeys.length} done</div>
                  </td>
                  {pageKeys.map(key => {
                    const entry = progressMap[key];
                    const done = entry?.ids?.has(task.id);
                    const isCurrent = key === currentKey;
                    const isHeld = holdCell?.taskId === task.id && holdCell?.key === key;
                    const progress = isHeld ? holdCell.progress : 0;

                    return (
                      <td key={key} className={`px-1 py-2 text-center ${isCurrent ? "bg-primary/5" : ""}`}>
                        <button
                          onPointerDown={(e) => { e.preventDefault(); startCellHold(task.id, key, done); }}
                          onPointerUp={() => endCellHold(task.id, key, done, entry?.record)}
                          onPointerLeave={clearHold}
                          onPointerCancel={clearHold}
                          className={`inline-flex items-center justify-center w-6 h-6 rounded-full transition-colors select-none touch-none cursor-pointer overflow-hidden ${
                            done ? "text-primary" : "text-muted-foreground/40"
                          } ${isHeld ? "scale-110" : ""}`}
                          style={{
                            background: isHeld
                              ? `linear-gradient(to top, hsl(var(--primary)) ${Math.round(progress * 100)}%, ${done ? "hsl(var(--primary) / 0.15)" : "hsl(var(--muted))"} ${Math.round(progress * 100)}%)`
                              : done ? "hsl(var(--primary) / 0.15)" : "hsl(var(--muted) / 0.3)",
                          }}
                        >
                          {done ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
          {/* Footer: completion % per period */}
          <tfoot>
            <tr className="border-t border-border/40" style={{ background: "var(--color-muted)" }}>
              <td className="px-3 py-2 text-[10px] font-semibold text-muted-foreground sticky left-0 z-10 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.15)]" style={{ background: "var(--color-muted)" }}>
                Completion
              </td>
              {pageKeys.map(key => {
                const done = activeTasks.filter(t => progressMap[key]?.ids?.has(t.id)).length;
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

function getDayOfWeek(dateKey) {
  const d = new Date(dateKey + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short" });
}

function formatPeriodKeyShort(frequency, key) {
  if (!key) return "";
  if (frequency === "daily") {
    const d = new Date(key + "T00:00:00");
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
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

function formatCompletionDate(frequency, key, record) {
  if (!key) return "";

  // For daily tasks the key IS the date — most precise
  if (frequency === "daily") {
    const d = new Date(key + "T00:00:00");
    return `✓ Completed ${d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}`;
  }

  // For other frequencies, prefer the record's created/updated timestamp
  const ts = record?.created_date || record?.updated_date;
  if (ts) {
    const d = new Date(ts);
    const dateStr = d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    return `✓ Marked complete on ${dateStr}`;
  }

  // Fallback: just the period
  if (frequency === "weekly") return `✓ Completed in ${key}`;
  if (frequency === "monthly") {
    const [year, month] = key.split("-");
    const d = new Date(Number(year), Number(month) - 1, 1);
    return `✓ Completed in ${d.toLocaleDateString(undefined, { month: "long", year: "numeric" })}`;
  }
  return `✓ Completed in ${key}`;
}
