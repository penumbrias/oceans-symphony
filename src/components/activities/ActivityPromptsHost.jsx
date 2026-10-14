// App-wide activity prompts, mounted once in AppLayout so they work from
// any page, in both layouts:
//
//   • "Open and begin <activity>?" — when a daily task that has an
//     activity is tapped (openDailyTask in dailyTaskActivity.js).
//   • The outcome sheet for one plan — opened from the end-of-plan
//     check-in notification (tap or "Other…"), or the web toast's Resolve.
//     It's the SAME PlanDetailsSheet the planner and Today widget use.

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Play, ExternalLink, X, Check, CalendarDays } from "lucide-react";
import { format } from "date-fns";
import { base44 } from "@/api/base44Client";
import { useT } from "@/lib/i18n";
import { isNative } from "@/lib/platform";
import { followTaskNavPath } from "@/lib/dailyTaskSystem";
import {
  OPEN_DAILY_TASK_START_EVENT, taskActivityConfig, beginDailyTaskActivity, logDailyTaskActivity,
} from "@/lib/dailyTaskActivity";
import { OPEN_PLAN_RESOLVE_EVENT, takePendingPlanResolve } from "@/lib/planner/resolvePlan";
import PlanDetailsSheet from "@/components/planner/PlanDetailsSheet";

function DailyTaskStartPrompt({ template, onClose }) {
  const tr = useT();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const { data: categories = [] } = useQuery({
    queryKey: ["activityCategories"],
    queryFn: () => base44.entities.ActivityCategory.list(),
  });
  const cfg = taskActivityConfig(template);
  const cats = (cfg?.categoryIds || []).map((id) => categories.find((c) => c.id === id)).filter(Boolean);
  const name = template.title || cats[0]?.name;
  const color = cats.find((c) => c.color)?.color || null;
  const hasLink = !!template.nav_path;
  const isLog = cfg?.mode === "log";
  const endsAt = cfg?.minutes ? new Date(Date.now() + cfg.minutes * 60000) : null;

  const openLink = () => followTaskNavPath(template.nav_path, navigate);

  // Whoever is fronting now is who's doing it (fresh read, never a stale
  // cache — CLAUDE.md alter selection rule).
  const frontingIds = async () => {
    const fronts = await base44.entities.FrontingSession.filter({ is_active: true }).catch(() => []);
    return [...new Set((fronts || []).map((s) => s.alter_id || s.primary_alter_id).filter(Boolean))];
  };

  const begin = async () => {
    setBusy(true);
    // Web: open the link while the tap still counts as a tap (pop-up
    // blockers), then start. Native: start first — the link sends the
    // app to the background.
    if (hasLink && !isNative()) openLink();
    try {
      await beginDailyTaskActivity(template, { categories, alterIds: await frontingIds() });
      qc.invalidateQueries({ queryKey: ["activities"] });
      toast.success(tr("dailyTask.started", { name }));
    } catch (e) {
      toast.error(e?.message || "Failed");
    }
    if (hasLink && isNative()) openLink();
    onClose();
  };

  const logIt = async (when) => {
    setBusy(true);
    try {
      await logDailyTaskActivity(template, { when, categories, alterIds: await frontingIds() });
      qc.invalidateQueries({ queryKey: ["activities"] });
      qc.invalidateQueries({ queryKey: ["dailyProgress"] });
      toast.success(tr("dailyTask.logged", { name }));
    } catch (e) {
      toast.error(e?.message || "Failed");
    }
    onClose();
  };

  const secondary = "text-sm px-3 py-1.5 rounded-full border border-border/60 text-muted-foreground hover:text-foreground flex items-center gap-1.5 disabled:opacity-40";
  const primary = "text-sm px-3 py-1.5 rounded-full bg-primary text-primary-foreground flex items-center gap-1.5 disabled:opacity-40";

  return createPortal((
    <div className="fixed inset-0 z-[70] bg-black/50 flex items-end sm:items-center justify-center"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "calc(var(--bottom-nav-height, 56px) + var(--os-sab))" }}
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="daily-task-begin-title"
        className="bg-card w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl border border-border p-4 space-y-3"
        style={{ borderRadius: "var(--v2-radius, 16px)" }}>
        <div className="flex items-start justify-between gap-2">
          <span className="flex items-center gap-2 min-w-0">
            {color && <span className="w-1 self-stretch rounded-full flex-shrink-0" style={{ background: color, minHeight: 20 }} />}
            <span id="daily-task-begin-title" className="text-base font-semibold">
              {isLog
                ? tr("dailyTask.logTitle", { name })
                : tr(hasLink ? "dailyTask.beginTitle" : "dailyTask.beginTitleNoLink", { name })}
            </span>
          </span>
          <button type="button" onClick={onClose} disabled={busy} aria-label={tr("dailyTask.cancel")}
            className="p-1 -mr-1 rounded-lg text-muted-foreground hover:text-foreground flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
        {cats.length > 1 && (
          <div className="flex flex-wrap gap-1">
            {cats.map((c) => (
              <span key={c.id} className="text-xs px-2 py-0.5 rounded-full border border-border/50 text-muted-foreground flex items-center gap-1">
                {c.color && <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.color }} />}{c.name}
              </span>
            ))}
          </div>
        )}
        <p className="text-sm text-muted-foreground">
          {isLog
            ? tr("dailyTask.logBody")
            : endsAt
              ? tr("dailyTask.beginBody", { time: format(endsAt, "HH:mm") })
              : tr("dailyTask.beginBodyNoLength")}
        </p>
        <div className="flex flex-wrap gap-2 justify-end">
          {hasLink && (
            <button type="button" disabled={busy} onClick={() => { openLink(); onClose(); }} className={secondary}>
              <ExternalLink className="w-3.5 h-3.5" />{tr("dailyTask.justOpen")}
            </button>
          )}
          {isLog ? (
            <>
              <button type="button" disabled={busy} onClick={() => logIt("day")} className={secondary}>
                <CalendarDays className="w-3.5 h-3.5" />{tr("dailyTask.logToday")}
              </button>
              <button type="button" disabled={busy} onClick={() => logIt("now")} className={primary}>
                <Check className="w-3.5 h-3.5" />{tr("dailyTask.logNow")}
              </button>
            </>
          ) : (
            <button type="button" disabled={busy} onClick={begin} className={primary}>
              <Play className="w-3.5 h-3.5" />{tr(hasLink ? "dailyTask.openAndBegin" : "dailyTask.begin")}
            </button>
          )}
        </div>
      </div>
    </div>
  ), document.body);
}

export default function ActivityPromptsHost() {
  const [startFor, setStartFor] = useState(null);
  const [resolveId, setResolveId] = useState(() => takePendingPlanResolve());

  useEffect(() => {
    const onStart = (e) => { if (e?.detail?.template) setStartFor(e.detail.template); };
    const onResolve = (e) => {
      takePendingPlanResolve(); // handled live — don't reopen on next launch
      if (e?.detail?.activityId) setResolveId(e.detail.activityId);
    };
    window.addEventListener(OPEN_DAILY_TASK_START_EVENT, onStart);
    window.addEventListener(OPEN_PLAN_RESOLVE_EVENT, onResolve);
    return () => {
      window.removeEventListener(OPEN_DAILY_TASK_START_EVENT, onStart);
      window.removeEventListener(OPEN_PLAN_RESOLVE_EVENT, onResolve);
    };
  }, []);

  const { data: plan = null } = useQuery({
    queryKey: ["activities", "resolve", resolveId],
    queryFn: async () => (await base44.entities.Activity.filter({ id: resolveId }))?.[0] || null,
    enabled: !!resolveId,
  });

  return (
    <>
      {startFor && <DailyTaskStartPrompt template={startFor} onClose={() => setStartFor(null)} />}
      {resolveId && plan && <PlanDetailsSheet item={plan} onClose={() => setResolveId(null)} />}
    </>
  );
}
