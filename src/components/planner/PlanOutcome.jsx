// What became of a plan — THE outcome row, shared by the plan's details
// (the "resolve" sheet every door opens: planner, Today widget, the end
// reminder's Resolve) and the activity editor (owner, 2026-11-03: the
// resolve sheet should work like the other activity sheets). Before this
// the two had drifted apart: different chips, Reschedule did different
// things, "Partly" offered another go in one and not the other, and Start
// lived in a different row.
//
// One flow everywhere:
//   • Start now (asks when it started) / In progress · Pause / Keep going
//   • Done (asks when it finished) · Partly · Skipped · Cancelled
//   • Reschedule (in an hour / this evening / tomorrow / another time)
//   • after Partly or Skipped: "Plan another go?"
// Every write goes through lib/planner/resolvePlan; `onDone` is called
// once the plan is settled so the caller can close.

import React, { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pause, Play, Repeat } from "lucide-react";
import { useT } from "@/lib/i18n";
import { statusFor } from "@/lib/activityStatus";
import { resolveOutcome, reschedulePlan, planAnotherGo, startPlanActive } from "@/lib/planner/resolvePlan";
import { getActiveActivities, snoozeActiveEndReminder, ACTIVE_END_SNOOZE_MINUTES } from "@/lib/activitySession";
import PlanTimeChoice from "@/components/planner/PlanTimeChoice";

export const outcomeChipCls = (on) => `text-xs px-2.5 py-1 rounded-full border flex items-center gap-1 ${
  on ? "text-[var(--v2-accent)] border-[var(--v2-accent)]" : "border-border/50 text-muted-foreground hover:text-foreground"
}`;

export default function PlanOutcome({ item, categories = [], onDone, onStartNow = null }) {
  const tr = useT();
  const qc = useQueryClient();
  // "start" | "end" | "later" | "another" | null
  const [ask, setAsk] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setAsk(null); }, [item?.id]);
  if (!item) return null;

  const st = statusFor(item);
  const running = getActiveActivities().find((a) => a.planActivityId === item.id) || null;
  const toggle = (k) => setAsk(ask === k ? null : k);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["activities"] });
    qc.invalidateQueries({ queryKey: ["tasks"] });
    qc.invalidateQueries({ queryKey: ["dailyProgress"] });
  };
  const run = async (fn) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); } catch (e) { toast.error(e?.message || "Failed"); }
    finally { setBusy(false); }
  };

  const resolve = (status, endedAt = null) => run(async () => {
    await resolveOutcome(item, status, { endedAt });
    refresh();
    // Didn't happen (fully) → offer another go before closing.
    if (status === "partial" || status === "skipped") setAsk("another");
    else onDone?.();
  });
  const start = (startedAt) => run(async () => {
    if (onStartNow) { await onStartNow(item, startedAt); return; }
    await startPlanActive(item, { startedAt: startedAt || new Date(), categories });
    refresh();
    toast.success(tr("planner.startedToast"));
    onDone?.();
  });
  const pause = () => run(async () => {
    const { pauseActiveActivity } = await import("@/lib/activitySession");
    const res = await pauseActiveActivity(running.id);
    refresh();
    if (res) toast.success(`⏸ ${res.name} — ${res.total ?? res.minutes}m saved`);
    onDone?.();
  });
  const keepGoing = () => run(async () => {
    await snoozeActiveEndReminder(running.id);
    onDone?.();
  });
  const moveLater = (when) => run(async () => { await reschedulePlan(item, when); refresh(); onDone?.(); });
  const anotherGo = (when) => run(async () => { await planAnotherGo(item, when); refresh(); onDone?.(); });

  return (
    <div>
      <div className="flex flex-wrap gap-1">
        {st === "scheduled" && (running ? (
          <>
            <span className={outcomeChipCls(true)}><Play className="w-3 h-3" />{tr("planner.inProgress")}</span>
            <button type="button" disabled={busy} onClick={pause} className={outcomeChipCls(false)}>
              <Pause className="w-3 h-3" />{tr("planner.pause")}
            </button>
          </>
        ) : (
          <button type="button" aria-pressed={ask === "start"} onClick={() => toggle("start")}
            className={outcomeChipCls(true)}>
            <Play className="w-3 h-3" />{tr("planner.startNow")}
          </button>
        ))}
        {[["done", tr("planner.done")], ["partial", tr("planner.partial")],
          ["skipped", tr("planner.skipped")], ["cancelled", tr("planner.cancelled")]].map(([id, label]) => {
          const on = st === id || (id === "done" && ask === "end");
          return (
            <button key={id} type="button" disabled={busy} aria-pressed={on}
              onClick={() => (id === "done" ? toggle("end") : resolve(id))}
              className={outcomeChipCls(on)}>{label}</button>
          );
        })}
        {(st === "scheduled" || running) && (
          <button type="button" aria-pressed={ask === "later"} onClick={() => toggle("later")}
            className={outcomeChipCls(ask === "later")}>
            <Repeat className="w-3 h-3" />{tr("planner.reschedule")}
          </button>
        )}
        {running && (
          <button type="button" disabled={busy} onClick={keepGoing} className={outcomeChipCls(false)}>
            <Play className="w-3 h-3" />{tr("planner.keepGoing", { minutes: ACTIVE_END_SNOOZE_MINUTES })}
          </button>
        )}
      </div>
      {ask === "start" && (
        <PlanTimeChoice kind="start" item={item} busy={busy} onPick={(d) => { setAsk(null); start(d); }} />
      )}
      {ask === "end" && (
        <PlanTimeChoice kind="end" item={item} busy={busy} onPick={(d) => { setAsk(null); resolve("done", d); }} />
      )}
      {ask === "later" && (
        <PlanTimeChoice kind="later" item={item} busy={busy} onPick={(d) => { setAsk(null); moveLater(d); }} />
      )}
      {ask === "another" && (
        <div>
          <PlanTimeChoice kind="later" item={item} busy={busy} prompt={tr("planner.anotherGo")}
            onPick={(d) => { setAsk(null); anotherGo(d); }} />
          <button type="button" onClick={() => onDone?.()}
            className="mt-1.5 text-[0.6875em] px-2 py-0.5 rounded-full border border-border/50 text-muted-foreground hover:text-foreground">
            {tr("planner.notNow")}
          </button>
        </div>
      )}
    </div>
  );
}
