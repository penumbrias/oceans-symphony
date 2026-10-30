// The Coming up panel's options (v0.327.0), shared by every widget that
// shows it: the v2 Today widget's "Coming up" view and the home screen's
// Upcoming plans widgets. One list, so they can't drift.
//
// What it lists (plans, recurring tasks, which kinds), how many plans or
// how many days ahead, and whether overdue plans show. Anything a placed
// widget never set keeps what it showed before: `defaultFrom` reads the
// value saved through the panel's old cog for that widget's `scope`
// (upcomingPlansLimit.js), and the sheet shows it greyed.
import React from "react";
import UpcomingPlans from "@/components/dashboard/UpcomingPlans";
import {
  DEFAULT_COUNT, COUNT_MIN, COUNT_MAX, DAYS_MIN, DAYS_MAX, resolveWidgetLimit, widgetLimitConfig,
} from "@/lib/upcomingPlansLimit";

const KINDS = ["all", "once", "counted"];
export const recurringKindsOf = (settings) => (KINDS.includes(settings?.recurringKinds) ? settings.recurringKinds : "all");
export const recurringShowDoneOf = (settings) => settings?.recurringDone !== false;

// The panel, set up from a widget's settings.
export function ComingUpPanel({ settings, scope = "widget", title }) {
  return (
    <UpcomingPlans placement={scope} title={title}
      limitConfig={widgetLimitConfig(settings, scope)}
      showPlans={settings?.upcomingPlans !== false}
      showOverdue={settings?.upcomingOverdue !== false}
      showRecurring={settings?.recurring !== false}
      recurringKinds={recurringKindsOf(settings)}
      recurringShowDone={recurringShowDoneOf(settings)} />
  );
}

// The plan options. `when(settings)` hides them all (the Today widget
// only shows them in its Coming up view).
export function comingUpPlanFields({ scope = "widget", when = () => true } = {}) {
  const plansOn = (st) => when(st) && st?.upcomingPlans !== false;
  return [
    { key: "upcomingPlans", type: "toggle", label: "Show plans", default: true, group: "Plans", showIf: when },
    { key: "upcomingMode", type: "select", label: "Plans to list", group: "Plans",
      defaultFrom: (st) => resolveWidgetLimit(st, scope).mode,
      help: "The next few however far off, or everything up to a number of days ahead.",
      options: [{ value: "count", label: "The next few" }, { value: "window", label: "Days ahead" }],
      showIf: plansOn },
    { key: "upcomingCount", type: "number", label: "How many", min: COUNT_MIN, max: COUNT_MAX, default: DEFAULT_COUNT, group: "Plans",
      defaultFrom: (st) => resolveWidgetLimit(st, scope).count,
      showIf: (st) => plansOn(st) && resolveWidgetLimit(st, scope).mode === "count" },
    { key: "upcomingDays", type: "number", label: "How far ahead", unit: "d", min: DAYS_MIN, max: DAYS_MAX, default: 14, group: "Plans",
      help: "Plans up to this many days from now.",
      defaultFrom: (st) => resolveWidgetLimit(st, scope).days,
      showIf: (st) => plansOn(st) && resolveWidgetLimit(st, scope).mode === "window" },
    { key: "upcomingOverdue", type: "toggle", label: "Overdue plans", default: true, group: "Plans",
      help: "Plans whose time has passed that you haven't marked yet.",
      showIf: plansOn },
  ];
}

// The recurring-task options (the Today view shows them too).
export function recurringTaskFields({ when = () => true } = {}) {
  const on = (st) => when(st) && st?.recurring !== false;
  return [
    { key: "recurring", type: "toggle", label: "Recurring tasks due today", default: true, group: "Recurring tasks", showIf: when },
    { key: "recurringKinds", type: "select", label: "Which ones", default: "all", group: "Recurring tasks",
      options: [
        { value: "all", label: "All" },
        { value: "once", label: "Tick-off" },
        { value: "counted", label: "Counts & tallies" },
      ],
      showIf: on },
    { key: "recurringDone", type: "toggle", label: "Keep finished ones", default: true, group: "Recurring tasks",
      help: "Crossed out at the bottom. Off hides them once done.",
      showIf: on },
  ];
}
