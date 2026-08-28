// What a plan or logged activity IS, in reading form — with its outcome
// one tap away.
//
// Lifted out of PlannerSurface (v0.215.0) so the Today widget shows the
// SAME popup instead of navigating away to the tracker: one plan, one
// detail view, wherever you meet it (rule: reuse, don't fork).
//
// Self-sufficient on purpose: it fetches the categories / {alters} /
// to-dos it needs, and resolves outcomes through the shared
// resolvePlan write path, so a caller only has to hand it an activity.
// `onEdit` is optional — surfaces that have an editor (the planner) pass
// one; those that don't (widgets) simply omit it.

import React from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { X, Pencil, Play, Repeat, Zap, CheckSquare } from "lucide-react";
import { format } from "date-fns";
import { base44 } from "@/api/base44Client";
import { useT } from "@/lib/i18n";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { statusFor } from "@/lib/activityStatus";
import { categoryIdOf } from "@/lib/planner/rollup";
import { resolveOutcome } from "@/lib/planner/resolvePlan";
import { getActiveActivities } from "@/lib/activitySession";

const fmtDur = (min) => {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
};

export default function PlanDetailsSheet({ item, onClose, onEdit = null, onStartNow = null, onReschedule = null }) {
  const tr = useT();
  const qc = useQueryClient();
  const formatAlter = useAlterLabel();
  const { data: categories = [] } = useQuery({ queryKey: ["activityCategories"], queryFn: () => base44.entities.ActivityCategory.list(), enabled: !!item });
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list(), enabled: !!item });
  const { data: tasks = [] } = useQuery({ queryKey: ["tasks"], queryFn: () => base44.entities.Task.list(), enabled: !!item });

  if (!item) return null;

  const st = statusFor(item);
  const cat = categories.find((c) => c.id === categoryIdOf(item));
  const color = item.color || cat?.color || "var(--v2-accent)";
  const start = item.timestamp ? new Date(item.timestamp) : null;
  const mins = Number(item.actual_duration_minutes) || Number(item.duration_minutes) || 0;
  const end = start && mins ? new Date(start.getTime() + mins * 60000) : null;
  const who = (item.fronting_alter_ids || []).map((id) => alters.find((a) => a.id === id)).filter(Boolean);
  const task = item.task_id ? tasks.find((x) => x.id === item.task_id) : null;
  const isRunning = getActiveActivities().some((a) => a.planActivityId === item.id);

  const resolve = async (status) => {
    try {
      await resolveOutcome(item, status);
      qc.invalidateQueries({ queryKey: ["activities"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      onClose?.();
    } catch (e) { toast.error(e?.message || "Failed"); }
  };

  const Line = ({ label, children }) => (
    <div className="flex items-baseline gap-2">
      <span className="text-[0.6875em] uppercase tracking-wide text-muted-foreground w-16 flex-shrink-0">{label}</span>
      <span className="text-sm flex-1 min-w-0">{children}</span>
    </div>
  );

  return createPortal((
    <div className="fixed inset-0 z-[70] bg-black/50 flex items-end sm:items-center justify-center"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "calc(var(--bottom-nav-height, 56px) + var(--os-sab))" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="bg-card w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl border border-border p-3 space-y-2.5 max-h-full overflow-y-auto overscroll-contain"
        style={{ borderRadius: "var(--v2-radius, 16px)" }}>
        <div className="flex items-start justify-between gap-2">
          <span className="flex items-center gap-2 min-w-0">
            <span className="w-1 self-stretch rounded-full flex-shrink-0" style={{ background: color, minHeight: 20 }} />
            <span className="text-base font-semibold truncate">{item.activity_name || tr("planner.untitled")}</span>
          </span>
          <button type="button" onClick={() => onClose?.()} aria-label={tr("planner.close")}
            className="p-1 -mr-1 rounded-lg text-muted-foreground hover:text-foreground flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[0.6875em] px-2 py-0.5 rounded-full border"
            style={st === "scheduled"
              ? { borderColor: "var(--v2-accent)", color: "var(--v2-accent)" }
              : { borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}>
            {tr(`planner.${st}`)}
          </span>
          {item.is_critical && (
            <span className="text-[0.6875em] px-2 py-0.5 rounded-full border border-amber-500/50 text-amber-500 flex items-center gap-1">
              <Zap className="w-3 h-3" />{tr("planner.critical")}
            </span>
          )}
          {item.recurrence_group_id && (
            <span className="text-[0.6875em] px-2 py-0.5 rounded-full border border-border/50 text-muted-foreground flex items-center gap-1">
              <Repeat className="w-3 h-3" />{tr("planner.series")}
            </span>
          )}
        </div>

        <div className="space-y-1 pt-0.5">
          <Line label={tr("planner.whenLabel")}>
            {start
              ? `${format(start, "EEE d MMM")} · ${format(start, "HH:mm")}${end ? `–${format(end, "HH:mm")}` : ""}`
              : item.planned_date
                ? `${format(new Date(item.planned_date), "EEE d MMM")} · ${tr("planner.anytime")}`
                : tr("planner.noTimeSet")}
          </Line>
          {mins > 0 && <Line label={tr("planner.durLabel")}>{fmtDur(mins)}</Line>}
          {cat && (
            <Line label={tr("planner.whatLabel")}>
              <span className="inline-flex items-center gap-1.5">
                {cat.color && <span className="w-2 h-2 rounded-full" style={{ background: cat.color }} />}
                {cat.name}
              </span>
            </Line>
          )}
          {who.length > 0 && <Line label={tr("planner.who")}>{who.map((a) => formatAlter(a)).join(", ")}</Line>}
          {item.location && <Line label={tr("planner.location")}>{item.location}</Line>}
          {task && (
            <Line label={tr("planner.todoLabel")}>
              <span className="inline-flex items-center gap-1.5">
                <CheckSquare className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                <span className={task.completed || task.is_complete ? "line-through text-muted-foreground" : ""}>{task.title}</span>
              </span>
            </Line>
          )}
          {item.notes && (
            <div className="pt-1">
              <p className="text-[0.6875em] uppercase tracking-wide text-muted-foreground">{tr("planner.notes")}</p>
              <p className="text-sm whitespace-pre-wrap break-words">{item.notes}</p>
            </div>
          )}
        </div>

        <div className="pt-1 border-t border-border/40">
          <p className="text-[0.6875em] uppercase tracking-wide text-muted-foreground mb-1">{tr("planner.outcome")}</p>
          <div className="flex flex-wrap gap-1">
            {[["done", tr("planner.done")], ["partial", tr("planner.partial")],
              ["skipped", tr("planner.skipped")], ["cancelled", tr("planner.cancelled")]].map(([id, label]) => (
              <button key={id} type="button" aria-pressed={st === id} onClick={() => resolve(id)}
                className={`text-xs px-2.5 py-1 rounded-full border ${
                  st === id
                    ? "text-[var(--v2-accent)] border-[var(--v2-accent)]"
                    : "border-border/50 text-muted-foreground hover:text-foreground"
                }`}>{label}</button>
            ))}
            {onReschedule && (
              <button type="button" onClick={() => onReschedule(item)}
                className="text-xs px-2.5 py-1 rounded-full border border-border/50 text-muted-foreground hover:text-foreground flex items-center gap-1">
                <Repeat className="w-3 h-3" />{tr("planner.reschedule")}
              </button>
            )}
          </div>
        </div>

        {(onEdit || (onStartNow && st === "scheduled" && !isRunning)) && (
          <div className="flex flex-wrap gap-1.5 pt-1 border-t border-border/40">
            {onEdit && (
              <button type="button" onClick={() => onEdit(item)}
                className="text-xs px-3 py-1.5 rounded-full border border-[var(--v2-accent)] text-[var(--v2-accent)] flex items-center gap-1">
                <Pencil className="w-3 h-3" />{tr("planner.edit")}
              </button>
            )}
            {onStartNow && st === "scheduled" && !isRunning && (
              <button type="button" onClick={() => onStartNow(item)}
                className="text-xs px-3 py-1.5 rounded-full border border-border/60 text-muted-foreground hover:text-foreground flex items-center gap-1">
                <Play className="w-3 h-3" />{tr("planner.startNow")}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  ), document.body);
}
