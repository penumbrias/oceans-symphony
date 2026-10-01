// "When did it start / finish?" for a plan being started or marked done
// (owner, 2026-10-01). Starting a plan mid-day used to stamp the start as
// NOW, and marking one done late counted it as ending NOW — both then had
// to be fixed by hand. One small inline chooser, used by every place that
// starts or completes a plan:
//   • On time — the plan's own start (or start + planned length), shown
//     only when that moment has already passed
//   • Now
//   • Other time — a day + time, then Save
// The caller gets a Date via onPick.

import React, { useState } from "react";
import { format } from "date-fns";
import { useT } from "@/lib/i18n";
import { plannedStartFor, plannedEndFor } from "@/lib/planner/resolvePlan";

const chip = "text-[0.6875em] px-2 py-0.5 rounded-full border disabled:opacity-40";
const quiet = "border-border/50 text-muted-foreground hover:text-foreground";
const lit = "border-[var(--v2-accent)] text-[var(--v2-accent)]";

export default function PlanTimeChoice({ kind = "start", item, onPick, busy = false }) {
  const tr = useT();
  const onTime = kind === "start" ? plannedStartFor(item) : plannedEndFor(item);
  const showOnTime = onTime && onTime.getTime() <= Date.now();
  const [picking, setPicking] = useState(false);
  const seed = showOnTime ? onTime : new Date();
  const [day, setDay] = useState(format(seed, "yyyy-MM-dd"));
  const [time, setTime] = useState(format(seed, "HH:mm"));

  const savePicked = () => {
    const [y, mo, da] = day.split("-").map(Number);
    const [h, mi] = time.split(":").map(Number);
    if (!y || !mo || !da) return;
    onPick(new Date(y, mo - 1, da, h || 0, mi || 0, 0, 0));
  };

  return (
    <div className="mt-1.5 space-y-1.5" onClick={(e) => e.stopPropagation()}>
      <p className="text-[0.6875em] text-muted-foreground">
        {tr(kind === "start" ? "planTime.whenStarted" : "planTime.whenFinished")}
      </p>
      <div className="flex flex-wrap gap-1">
        {showOnTime && (
          <button type="button" disabled={busy} onClick={() => onPick(onTime)}
            className={`${chip} ${lit}`}>
            {tr(kind === "start" ? "planTime.startedOnTime" : "planTime.finishedOnTime", { time: format(onTime, "HH:mm") })}
          </button>
        )}
        <button type="button" disabled={busy} onClick={() => onPick(new Date())} className={`${chip} ${quiet}`}>
          {tr(kind === "start" ? "planTime.startNow" : "planTime.endNow")}
        </button>
        <button type="button" disabled={busy} onClick={() => setPicking((v) => !v)}
          aria-pressed={picking}
          className={`${chip} ${picking ? lit : quiet}`}>
          {tr("planTime.other")}
        </button>
      </div>
      {picking && (
        <div className="flex items-center gap-1.5">
          <input type="date" value={day} onChange={(e) => setDay(e.target.value)}
            aria-label={tr("planner.date")}
            className="h-7 px-1.5 rounded-lg border border-input bg-background text-[0.6875em] min-w-0" />
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)}
            aria-label={tr(kind === "start" ? "planTime.whenStarted" : "planTime.whenFinished")}
            className="h-7 px-1.5 rounded-lg border border-input bg-background text-[0.6875em] min-w-0" />
          <button type="button" disabled={busy} onClick={savePicked}
            className="text-[0.6875em] px-2 py-1 rounded-lg border border-[var(--v2-accent)] text-[var(--v2-accent)] disabled:opacity-40 flex-shrink-0">
            {tr("planTime.save")}
          </button>
        </div>
      )}
    </div>
  );
}
