// The Quick Check-In button row — extracted verbatim from Dashboard.jsx's
// inline `case "quick_checkin"` JSX (v0.90.0) so the classic dashboard,
// the experimental homescreen widget, and the experimental action bar all
// render the SAME buttons from one source. Purely presentational: every
// behaviour (the 500ms hold gesture for quick actions, the modal openers,
// executeQuickAction) stays in Dashboard.jsx and arrives via props, since
// the modals those handlers open are hosted there.
//
// Props:
//   hold        — { onPointerDown, onPointerMove, onPointerUp } for the
//                 Quick Check-In button's tap/hold gesture
//   holdProgress, holdActive — visual fill + ring while holding
//   show        — { start_activity, start_symptom, quick_task, quick_plan }
//                 booleans for the sibling buttons
//   on          — { startActivity, startSymptom, quickTask, quickPlan }
//   quickActionsSlot — rendered after the buttons (the AnimatePresence-
//                 wrapped QuickActionsMenu on classic; null elsewhere)
//   dense       — action-bar styling: tighter buttons, no margins

import React from "react";
import { Heart, Zap, Activity as ActivityIcon, CheckSquare, CalendarDays } from "lucide-react";

export default function QuickCheckinButtons({
  hold = {},
  holdProgress = 0,
  holdActive = false,
  show = {},
  on = {},
  quickActionsSlot = null,
  dense = false,
  showCheckin = true,
}) {
  const btnBase = dense
    ? "px-3 text-xs font-medium text-center rounded-lg inline-flex items-center gap-1.5 min-h-[38px] transition-colors"
    : "px-4 text-sm font-medium text-center rounded-lg inline-flex items-center gap-2 min-h-[44px] transition-colors";
  return (
    <div className={dense ? "relative flex flex-wrap items-center gap-1.5" : "relative flex flex-wrap items-center gap-2 mt-3 mb-3"}>
      {showCheckin && (
      <button
        data-tour="quick-checkin"
        onPointerDown={hold.onPointerDown}
        onPointerMove={hold.onPointerMove}
        onPointerUp={hold.onPointerUp}
        onPointerLeave={hold.onPointerUp}
        onPointerCancel={hold.onPointerUp}
        onContextMenu={(e) => e.preventDefault()}
        style={{ userSelect: "none", WebkitUserSelect: "none", touchAction: "manipulation" }}
        aria-label="Quick emotional check-in"
        className={`bg-destructive/10 text-destructive ${dense ? "px-3.5" : "px-5"} ${dense ? "text-xs min-h-[38px]" : "text-sm min-h-[44px]"} font-medium text-center rounded-lg inline-flex items-center gap-2 hover:bg-destructive/20 transition-colors relative overflow-hidden${holdActive ? " ring-2 ring-destructive/30" : ""}`}
      >
        <Heart className="w-4 h-4 relative z-10" />
        <span className="relative z-10">Quick Check-In</span>
        {holdProgress > 0 && (
          <span
            aria-hidden="true"
            className="absolute inset-y-0 left-0 bg-destructive/20 pointer-events-none"
            style={{ width: `${holdProgress}%` }}
          />
        )}
      </button>
      )}
      {show.start_activity && (
        <button
          data-tour="start-activity-button"
          onClick={on.startActivity}
          className={`bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 ${btnBase}`}
        >
          <Zap className="w-4 h-4" />
          <span>Start Activity</span>
        </button>
      )}
      {show.start_symptom && (
        <button
          data-tour="start-symptom-button"
          onClick={on.startSymptom}
          className={`bg-violet-500/10 text-violet-600 dark:text-violet-400 hover:bg-violet-500/20 ${btnBase}`}
        >
          <ActivityIcon className="w-4 h-4" />
          <span>Start Symptom</span>
        </button>
      )}
      {show.quick_task && (
        <button
          data-tour="quick-task-button"
          onClick={on.quickTask}
          className={`bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 ${btnBase}`}
        >
          <CheckSquare className="w-4 h-4" />
          <span>Quick Task</span>
        </button>
      )}
      {show.quick_plan && (
        <button
          data-tour="quick-plan-button"
          onClick={on.quickPlan}
          className={`bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 ${btnBase}`}
        >
          <CalendarDays className="w-4 h-4" />
          <span>Quick Plan</span>
        </button>
      )}
      {quickActionsSlot}
    </div>
  );
}
