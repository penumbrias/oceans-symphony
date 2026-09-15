// The planner's "Plans" tab — every scheduled plan, in the planner's own
// grammar (v2 rebuilds FUNCTIONS; nothing here is a transplant of the
// classic tracker components).
//
// The load-bearing choice: a recurring series is ONE row, not fifty — the
// row shows the cadence, the next occurrence and how many are ahead, and
// its actions choose the reach (next occurrence vs this + future). The
// classic list printed every instance, which buried single plans and made
// series unreadable.
//
// "Uncategorized" filter: the completion tracker buckets category-less
// plans into an anonymous count; this is where those plans get faces —
// filter to them, read their names, tap one and give it a category.

import React, { useMemo, useRef, useState } from "react";
import { Repeat, Zap, ChevronRight, CheckCircle2, Circle, Trash2, Ban, Check, X } from "lucide-react";
import { useT } from "@/lib/i18n";
import { statusFor, ACTIVITY_STATUSES } from "@/lib/activityStatus";
import { CheckSquare } from "lucide-react";
import { format, isSameDay } from "date-fns";
import { confirm } from "@/components/shared/ConfirmDialog";

const dayMs = 86400000;

// Cadence from the spacing of the next few instances — instances don't
// store the interval, but their gaps say it plainly.
function cadenceLabel(members, tr) {
  if (members.length < 2) return tr("planner.repeats");
  const gaps = [];
  for (let i = 1; i < Math.min(members.length, 4); i++) {
    gaps.push(Math.round((new Date(members[i].timestamp) - new Date(members[i - 1].timestamp)) / dayMs));
  }
  const g = gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
  if (g <= 1) return tr("planner.daily");
  if (g === 7) return tr("planner.weekly");
  if (g === 14) return tr("planner.biweekly");
  if (g >= 28 && g <= 31) return tr("planner.monthly");
  return tr("planner.everyNDays", { n: g });
}

// An entry with no time is an intention for its DAY — say the day, not a
// made-up clock time.
function dayOnlyLabel(planned, tr) {
  const d = new Date(planned);
  const now = new Date();
  if (isSameDay(d, now)) return tr("planner.anytimeToday");
  if (d.getFullYear() === now.getFullYear()) return `${format(d, "EEE d MMM")} · ${tr("planner.anytime")}`;
  return `${format(d, "d MMM yyyy")} · ${tr("planner.anytime")}`;
}

function whenLabel(ts) {
  const d = new Date(ts);
  const now = new Date();
  const time = format(d, "HH:mm");
  if (isSameDay(d, now)) return `${format(d, "HH:mm")}`;
  if (d.getFullYear() === now.getFullYear()) return `${format(d, "EEE d MMM")} · ${time}`;
  return `${format(d, "d MMM yyyy")} · ${time}`;
}

export default function PlansList({ activities = [], categories = [], onOpen, onDeleteSeries, onMassChange = null }) {
  const tr = useT();
  const [filter, setFilter] = useState("all"); // all | uncategorized
  const [openSeries, setOpenSeries] = useState(null); // groupId with actions expanded
  // Press-and-hold multiselect (owner ask): hold any row to start
  // selecting, tap rows to add, then act on all of them at once.
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const holdTimer = useRef(null);
  const holdStart = useRef(null);
  const holdFired = useRef(false);
  const exitSelect = () => { setSelectMode(false); setSelected(new Set()); };
  const toggleSelected = (key) => setSelected((cur) => {
    const next = new Set(cur);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const beginHold = (key) => (e) => {
    if (selectMode) return;
    holdFired.current = false;
    holdStart.current = { x: e.clientX, y: e.clientY };
    clearTimeout(holdTimer.current);
    holdTimer.current = setTimeout(() => {
      holdFired.current = true;
      setSelectMode(true);
      setSelected(new Set([key]));
    }, 450);
  };
  const moveHold = (e) => {
    if (!holdStart.current) return;
    if (Math.abs(e.clientX - holdStart.current.x) > 10 || Math.abs(e.clientY - holdStart.current.y) > 10) {
      clearTimeout(holdTimer.current);
      holdStart.current = null;
    }
  };
  const endHold = () => { clearTimeout(holdTimer.current); holdStart.current = null; };

  const catById = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c])), [categories]);

  const rows = useMemo(() => {
    const now = Date.now();
    // Untimed plans (the day "+" writes planned_date with no timestamp)
    // belong in this list too — they were invisible here, which is half
    // of why a resolved one seemed to disappear (owner report).
    const whenOf = (a) => (a.timestamp ? new Date(a.timestamp).getTime()
      : a.planned_date ? new Date(a.planned_date).getTime() : null);
    const scheduled = activities.filter((a) => {
      if (!a || statusFor(a) !== ACTIVITY_STATUSES.SCHEDULED) return false;
      const w = whenOf(a);
      return w != null && w > now - dayMs;
    });
    const byGroup = new Map();
    const singles = [];
    for (const a of scheduled) {
      if (a.recurrence_group_id) {
        const arr = byGroup.get(a.recurrence_group_id) || [];
        arr.push(a); byGroup.set(a.recurrence_group_id, arr);
      } else singles.push(a);
    }
    const out = singles.map((a) => ({ kind: "single", key: a.id, item: a, next: whenOf(a) }));
    for (const [gid, arr] of byGroup) {
      const members = arr.sort((x, y) => whenOf(x) - whenOf(y));
      const future = members.filter((m) => whenOf(m) > now);
      const next = future[0] || members[members.length - 1];
      out.push({ kind: "series", key: gid, item: next, members, remaining: future.length, next: whenOf(next) });
    }
    return out.sort((a, b) => a.next - b.next);
  }, [activities]);

  // Resolved plans stay findable: an outcome shouldn't make an entry
  // vanish from the only list that shows plans. Newest first, recent
  // window only so this never becomes a second activity log.
  const resolvedRows = useMemo(() => {
    const cutoff = Date.now() - 30 * dayMs;
    const whenOf = (a) => (a.timestamp ? new Date(a.timestamp).getTime()
      : a.planned_date ? new Date(a.planned_date).getTime() : 0);
    return activities
      .filter((a) => {
        const st = statusFor(a);
        return (st === ACTIVITY_STATUSES.DONE || st === ACTIVITY_STATUSES.PARTIAL
          || st === ACTIVITY_STATUSES.SKIPPED || st === ACTIVITY_STATUSES.CANCELLED)
          && whenOf(a) > cutoff;
      })
      .map((a) => ({ kind: "single", key: a.id, item: a, next: whenOf(a), resolved: statusFor(a) }))
      .sort((a, b) => b.next - a.next)
      .slice(0, 60);
  }, [activities]);

  const uncategorized = rows.filter((r) => !(r.item.activity_category_ids || []).length);
  const visible = filter === "uncategorized" ? uncategorized
    : filter === "resolved" ? resolvedRows
    : rows;

  const colorFor = (item) => item.color
    || catById[(item.activity_category_ids || [])[0]]?.color
    || "var(--v2-accent)";

  // Everything a selected row stands for: a single is itself; a series row
  // is its future occurrences.
  const itemsForRow = (r) => (r.kind === "series"
    ? r.members.filter((m) => {
        const w = m.timestamp ? new Date(m.timestamp).getTime() : (m.planned_date ? new Date(m.planned_date).getTime() : 0);
        return w > Date.now();
      })
    : [r.item]);
  const selectedRows = visible.filter((r) => selected.has(r.key));
  const selectedItems = selectedRows.flatMap(itemsForRow);
  const massAct = async (kind) => {
    if (!selectedItems.length || busy) return;
    const n = selectedItems.length;
    const ok = await confirm(kind === "delete"
      ? tr("planner.massDeleteConfirm", { count: n })
      : tr("planner.massCancelConfirm", { count: n }));
    if (!ok) return;
    setBusy(true);
    try {
      await onMassChange?.(kind, selectedItems);
      exitSelect();
    } finally {
      setBusy(false);
    }
  };

  return (
    // touch-action pan-y: vertical panning must always belong to the
    // browser on this list — an ancestor gesture claiming touches made
    // the rows swallow scrolling on some devices (owner report).
    <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-0.5" data-own-hold
      style={{ touchAction: "pan-y" }}
      onPointerMove={moveHold} onPointerUp={endHold} onPointerCancel={endHold} onPointerLeave={endHold}>
      {(uncategorized.length > 0 || resolvedRows.length > 0) && (
        <div className="flex items-center gap-1 pb-0.5 flex-wrap">
          {[["all", tr("planner.allPlans")],
            ...(uncategorized.length ? [["uncategorized", `${tr("planner.uncategorized")} · ${uncategorized.length}`]] : []),
            ...(resolvedRows.length ? [["resolved", `${tr("planner.resolvedTab")} · ${resolvedRows.length}`]] : []),
          ].map(([id, label]) => (
            <button key={id} type="button" onClick={() => setFilter(id)} aria-pressed={filter === id}
              className={`text-xs px-2.5 py-1 rounded-full border ${filter === id
                ? "border-[var(--v2-accent)] bg-[color-mix(in_srgb,var(--v2-accent)_12%,transparent)] text-[var(--v2-accent)]"
                : "border-border/50 text-muted-foreground"}`}>
              {label}
            </button>
          ))}
        </div>
      )}
      {visible.length === 0 && (
        <p className="text-xs text-muted-foreground px-1 py-3">{tr("planner.noPlans")}</p>
      )}
      {selectMode && (
        <div className="sticky top-0 z-10 flex items-center gap-1.5 py-1 bg-[var(--color-bg,#0b1120)]/95 backdrop-blur rounded-lg">
          <span className="text-xs text-muted-foreground px-1 flex-1">
            {tr("planner.selectedCount", { count: selectedItems.length })}
          </span>
          <button type="button" disabled={!selectedItems.length || busy} onClick={() => massAct("cancel")}
            className="text-xs px-2.5 py-1 rounded-full border border-border/60 text-muted-foreground hover:text-foreground disabled:opacity-50 flex items-center gap-1">
            <Ban className="w-3 h-3" /> {tr("planner.massCancel")}
          </button>
          <button type="button" disabled={!selectedItems.length || busy} onClick={() => massAct("delete")}
            className="text-xs px-2.5 py-1 rounded-full border border-destructive/50 text-destructive disabled:opacity-50 flex items-center gap-1">
            <Trash2 className="w-3 h-3" /> {tr("planner.delete")}
          </button>
          <button type="button" onClick={exitSelect} aria-label={tr("planner.exitSelect")}
            className="p-1.5 rounded-full text-muted-foreground hover:text-foreground">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {visible.map((r) => {
        const c = colorFor(r.item);
        const noCat = !(r.item.activity_category_ids || []).length;
        const expanded = r.kind === "series" && openSeries === r.key;
        const isSel = selected.has(r.key);
        return (
          <div key={r.key} className={`rounded-lg border overflow-hidden ${isSel ? "border-[var(--v2-accent)] bg-[color-mix(in_srgb,var(--v2-accent)_8%,transparent)]" : "border-border/50"}`}
            style={{ borderRadius: "var(--v2-radius, 8px)" }}>
            <button type="button"
              onPointerDown={beginHold(r.key)}
              onClick={() => {
                if (holdFired.current) { holdFired.current = false; return; }
                if (selectMode) { toggleSelected(r.key); return; }
                if (r.kind === "series") setOpenSeries(expanded ? null : r.key); else onOpen?.(r.item);
              }}
              className="w-full flex items-center gap-2 px-2 py-2 text-left hover:bg-muted/30">
              {selectMode && (
                isSel
                  ? <CheckCircle2 className="w-4 h-4 text-[var(--v2-accent)] flex-shrink-0" />
                  : <Circle className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              )}
              <span className="w-1 self-stretch rounded-full flex-shrink-0" style={{ background: c }} />
              <span className="flex-1 min-w-0">
                <span className="text-sm font-medium truncate flex items-center gap-1.5">
                  {r.item.is_critical && <Zap className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />}
                  <span className="truncate">{r.item.activity_name || tr("planner.untitled")}</span>
                  {r.kind === "series" && (
                    <span className="text-[0.6875em] text-muted-foreground border border-border/50 rounded-full px-1.5 flex items-center gap-0.5 flex-shrink-0">
                      <Repeat className="w-2.5 h-2.5" />{cadenceLabel(r.members, tr)}
                    </span>
                  )}
                  {r.item.task_id && (
                    <CheckSquare className="w-3 h-3 flex-shrink-0 text-muted-foreground" aria-label={tr("planner.linkedTodo")} />
                  )}
                  {noCat && (
                    <span className="text-[0.6875em] text-amber-500 border border-amber-500/40 rounded-full px-1.5 flex-shrink-0">
                      {tr("planner.noCategory")}
                    </span>
                  )}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums block">
                  {r.item.timestamp ? whenLabel(r.item.timestamp) : dayOnlyLabel(r.item.planned_date, tr)}
                  {r.resolved && ` · ${tr(`planner.${r.resolved}`)}`}
                  {r.kind === "series" && r.remaining > 1 && ` · ×${r.remaining}`}
                </span>
              </span>
              {r.kind === "series"
                ? <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" style={{ transform: expanded ? "rotate(90deg)" : "none", transition: "transform .15s" }} />
                : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
            </button>
            {expanded && (
              <div className="flex flex-wrap gap-1 px-2 pb-2 pt-0.5 border-t border-border/40">
                <button type="button" onClick={() => { setOpenSeries(null); onOpen?.(r.item); }}
                  className="text-xs px-2.5 py-1 rounded-full border border-border/60 text-muted-foreground hover:text-foreground">
                  {tr("planner.editNext")}
                </button>
                <button type="button" onClick={() => { setOpenSeries(null); onOpen?.(r.item, { series: true }); }}
                  className="text-xs px-2.5 py-1 rounded-full border border-[var(--v2-accent)] text-[var(--v2-accent)]">
                  {tr("planner.editFuture", { count: r.remaining })}
                </button>
                <button type="button" onClick={() => { setOpenSeries(null); onDeleteSeries?.(r.item); }}
                  className="text-xs px-2.5 py-1 rounded-full border border-destructive/50 text-destructive">
                  {tr("planner.delete")}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
