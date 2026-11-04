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
// `onEdit` / `onStartNow` are optional: a surface that runs its own (the
// planner) passes them; everywhere else the sheet opens THE shared
// ActivityEditor itself and starts through the shared startPlanActive, so
// every door can read, resolve, start and edit the same way (v0.276.2 —
// this replaced the board's ActivityDetailsModal + lifecycle popover).
//
// v0.344.2 (owner, 2026-11-03): laid out like the activity editor — back
// arrow and name on top, the shared PlanOutcome row first (the same chips,
// asks and reschedule as the editor's), then the details, then full-width
// buttons. `onReschedule` is gone: Reschedule offers the same quick times
// wherever the sheet opens.

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft, Pencil, Repeat, Zap, CheckSquare, RotateCcw } from "lucide-react";
import { format } from "date-fns";
import { base44 } from "@/api/base44Client";
import { useT } from "@/lib/i18n";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { statusFor, ACTIVITY_STATUSES } from "@/lib/activityStatus";
import { contactDisplayName } from "@/lib/contacts";
import { categoryIdOf } from "@/lib/planner/rollup";
import ActivityEditor, { SectionLabel } from "@/components/activities/ActivityEditor";
import PlanOutcome from "@/components/planner/PlanOutcome";
import { Button } from "@/components/ui/button";
import { getActiveActivities } from "@/lib/activitySession";
import RichText from "@/components/shared/RichText";

const fmtDur = (min) => {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
};

export default function PlanDetailsSheet({ item, onClose, onEdit: onEditProp = null, onStartNow: onStartNowProp = null }) {
  const tr = useT();
  const qc = useQueryClient();
  const formatAlter = useAlterLabel();
  const { data: categories = [] } = useQuery({ queryKey: ["activityCategories"], queryFn: () => base44.entities.ActivityCategory.list(), enabled: !!item });
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list(), enabled: !!item });
  const { data: tasks = [] } = useQuery({ queryKey: ["tasks"], queryFn: () => base44.entities.Task.list(), enabled: !!item });
  const { data: contacts = [] } = useQuery({ queryKey: ["contacts"], queryFn: () => base44.entities.Contact.list(), enabled: !!item });
  // Feelings logged around the entry (a check-in within 30 minutes of its
  // start) — what the classic details modal showed under each activity.
  const { data: emotionCheckIns = [] } = useQuery({
    queryKey: ["emotionCheckIns"], queryFn: () => base44.entities.EmotionCheckIn.list(), enabled: !!item,
  });

  // The built-in editor (when the caller has none). While it's open the
  // details step aside; closing it closes the whole thing, so a caller
  // that unmounts the sheet on close never cuts the editor off mid-edit.
  const [editReq, setEditReq] = useState(null);
  useEffect(() => { setEditReq(null); }, [item?.id]);

  if (!item) return null;
  if (editReq) return <ActivityEditor request={editReq} onClose={() => { setEditReq(null); onClose?.(); }} />;

  const onEdit = onEditProp || ((it) => setEditReq({ item: it }));
  const st = statusFor(item);
  const cat = categories.find((c) => c.id === categoryIdOf(item));
  const color = item.color || cat?.color || "var(--v2-accent)";
  const start = item.timestamp ? new Date(item.timestamp) : null;
  const mins = Number(item.actual_duration_minutes) || Number(item.duration_minutes) || 0;
  const end = start && mins ? new Date(start.getTime() + mins * 60000) : null;
  const who = (item.fronting_alter_ids || []).map((id) => alters.find((a) => a.id === id)).filter(Boolean);
  const task = item.task_id ? tasks.find((x) => x.id === item.task_id) : null;
  const isRunning = getActiveActivities().some((a) => a.planActivityId === item.id);
  const company = (item.contact_ids || []).map((id) => contacts.find((c) => c.id === id)).filter(Boolean);
  const feelings = (() => {
    if (!start) return [];
    const near = emotionCheckIns.find((e) => e?.timestamp && Math.abs(new Date(e.timestamp) - start) < 30 * 60 * 1000);
    return Array.isArray(near?.emotions) ? near.emotions.filter(Boolean) : [];
  })();
  // "Log again": the same activity, logged now as a fresh instant entry —
  // no length, nobody carried over (the classic details modal's shortcut).
  const canLogAgain = st !== "scheduled" && !isRunning;
  const logAgain = async () => {
    try {
      await base44.entities.Activity.create({
        timestamp: new Date().toISOString(),
        activity_name: item.activity_name,
        activity_category_ids: item.activity_category_ids || [],
        ...(item.color ? { color: item.color } : {}),
        duration_minutes: null,
        fronting_alter_ids: [],
        contact_ids: [],
        notes: null,
        is_planned: false,
        status: ACTIVITY_STATUSES.LOGGED,
      });
      refresh();
      toast.success(tr("planner.loggedAgain", { name: item.activity_name || tr("planner.untitled") }));
      onClose?.();
    } catch (e) { toast.error(e?.message || "Failed"); }
  };

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["activities"] });
    qc.invalidateQueries({ queryKey: ["tasks"] });
    qc.invalidateQueries({ queryKey: ["dailyProgress"] });
  };

  const Line = ({ label, children }) => (
    <div className="flex items-baseline gap-2">
      <span className="text-[0.6875rem] text-muted-foreground w-16 flex-shrink-0">{label}</span>
      <span className="text-sm flex-1 min-w-0">{children}</span>
    </div>
  );

  return createPortal((
    <div className="fixed inset-0 z-[70] bg-black/50 flex items-end sm:items-center justify-center"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "calc(var(--bottom-nav-height, 56px) + var(--os-sab))" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      {/* The editor's shell, so reading/resolving and editing feel like one sheet. */}
      <div className="bg-card w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl border border-border p-3 space-y-3 max-h-full overflow-y-auto overscroll-contain"
        style={{ borderRadius: "var(--v2-radius, 16px)" }}>
        {/* NAME */}
        <div className="flex items-center justify-between gap-2">
          <button type="button" onClick={() => onClose?.()} aria-label={tr("planner.close")} title={tr("planner.close")}
            className="p-1 -ml-1 rounded-lg text-muted-foreground hover:text-foreground flex-shrink-0">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="w-1 self-stretch rounded-full flex-shrink-0" style={{ background: color, minHeight: 16 }} />
          <h2 className="flex-1 min-w-0 text-sm font-semibold truncate">{item.activity_name || tr("planner.untitled")}</h2>
          <span className="text-[0.625em] uppercase tracking-wide border rounded-full px-2 py-0.5 flex-shrink-0"
            style={st === "scheduled"
              ? { borderColor: "var(--v2-accent)", color: "var(--v2-accent)" }
              : { borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}>
            {isRunning ? tr("planner.inProgress") : tr(`planner.${st}`)}
          </span>
        </div>
        {(item.is_critical || item.recurrence_group_id) && (
          <div className="flex flex-wrap items-center gap-3 -mt-1 text-[0.6875em] text-muted-foreground">
            {item.is_critical && (
              <span className="flex items-center gap-1 text-amber-500"><Zap className="w-3 h-3" />{tr("planner.critical")}</span>
            )}
            {item.recurrence_group_id && (
              <span className="flex items-center gap-1"><Repeat className="w-3 h-3" />{tr("planner.series")}</span>
            )}
          </div>
        )}

        {/* OUTCOME — the same row the editor shows. */}
        <div>
          <SectionLabel>{tr("planner.outcome")}</SectionLabel>
          <div className="mt-1">
            <PlanOutcome item={item} categories={categories} onDone={() => onClose?.()}
              onStartNow={onStartNowProp ? async (it, startedAt) => { await onStartNowProp(it, startedAt); } : null} />
          </div>
        </div>

        {/* DETAILS */}
        <div className="space-y-1">
          <SectionLabel>{tr("planner.details")}</SectionLabel>
          <div className="space-y-1 pt-1">
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
            {company.length > 0 && <Line label={tr("planner.with")}>{company.map((c) => contactDisplayName(c)).join(", ")}</Line>}
            {item.location && <Line label={tr("planner.location")}>{item.location}</Line>}
            {feelings.length > 0 && (
              <Line label={tr("planner.feelings")}>
                <span className="flex flex-wrap gap-1">
                  {feelings.map((f, i) => (
                    <span key={`${f}-${i}`} className="text-xs px-2 py-0.5 rounded-full border border-border/50">{f}</span>
                  ))}
                </span>
              </Line>
            )}
            {task && (
              <Line label={tr("planner.todoLabel")}>
                <span className="inline-flex items-center gap-1.5">
                  <CheckSquare className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  <span className={task.completed || task.is_complete ? "line-through text-muted-foreground" : ""}>{task.title}</span>
                </span>
              </Line>
            )}
            {item.notes && (
              <Line label={tr("planner.notes")}>
                <span className="whitespace-pre-wrap break-words"><RichText content={item.notes} /></span>
              </Line>
            )}
          </div>
        </div>

        {(onEdit || canLogAgain) && (
          <div className="flex gap-1.5 pt-1">
            {onEdit && (
              <Button variant="outline" className="flex-1 gap-1.5" onClick={() => onEdit(item)}>
                <Pencil className="w-3.5 h-3.5" />{tr("planner.edit")}
              </Button>
            )}
            {canLogAgain && (
              <Button variant="outline" className="flex-1 gap-1.5" onClick={logAgain}>
                <RotateCcw className="w-3.5 h-3.5" />{tr("planner.logAgain")}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  ), document.body);
}
