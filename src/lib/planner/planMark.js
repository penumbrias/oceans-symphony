// How a plan's outcome reads at a glance on the planner (owner,
// 2026-10-01: "some kind of visual distinction between plans that were
// skipped, cancelled, completed"). One definition for the week grid and
// the plans list. Marks sit in front of the name so they survive tiny
// blocks; skipped / cancelled also fade, and cancelled is struck through.
//   done ✓ · partly ◐ · skipped ⤼ · cancelled (struck) · rescheduled ↻
// ↻ only while still scheduled, and only for moves the person counted as
// real reschedules (the sheet's "Count as rescheduled" switch).

import { statusFor } from "@/lib/activityStatus";

export function planMark(item) {
  const st = item?.status || (item ? statusFor(item) : null);
  if (st === "done") return { mark: "✓", labelKey: "planner.markDone", faded: false, struck: false };
  if (st === "partial") return { mark: "◐", labelKey: "planner.markPartial", faded: false, struck: false };
  if (st === "skipped") return { mark: "⤼", labelKey: "planner.markSkipped", faded: true, struck: false };
  if (st === "cancelled") return { mark: "", labelKey: "planner.markCancelled", faded: true, struck: true };
  if (st === "scheduled" && Array.isArray(item?.reschedule_history) && item.reschedule_history.length) {
    return { mark: "↻", labelKey: "planner.markRescheduled", faded: false, struck: false };
  }
  return { mark: "", labelKey: null, faded: false, struck: false };
}
