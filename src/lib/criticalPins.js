// Lead-step windows for "critical / urgent" planned activities.
//
// A user picks which windows should re-surface a critical plan as a
// pinned card on the dashboard. Each step is one band before the plan
// starts; multiple steps can be active simultaneously so the pin reappears
// as the plan gets closer even if the user dismissed an earlier window.

export const LEAD_STEPS = [
  { key: "always", label: "Always",         minutes: Infinity },
  { key: "1d",     label: "1 day before",   minutes: 1440 },
  { key: "4h",     label: "4 hours before", minutes: 240  },
  { key: "1h",     label: "1 hour before",  minutes: 60   },
  { key: "30m",    label: "30 min before",  minutes: 30   },
  { key: "15m",    label: "15 min before",  minutes: 15   },
  { key: "5m",     label: "5 min before",   minutes: 5    },
];

export const DEFAULT_LEAD_STEPS = ["1h", "15m"];

export const DISMISS_LS_KEY = "symphony_critical_pin_dismissals";

// Index lookup for ordering — earlier index = wider window.
const STEP_INDEX = Object.fromEntries(LEAD_STEPS.map((s, i) => [s.key, i]));

// Returns the narrowest currently-open step for a plan, given its
// timestamp + the user's selected lead-step keys. Returns null if no
// step is open.
export function activeStepFor(plan, nowMs = Date.now()) {
  const start = new Date(plan.timestamp).getTime();
  const steps = plan.critical_lead_steps || [];
  let best = null;
  for (const key of steps) {
    const step = LEAD_STEPS.find((s) => s.key === key);
    if (!step) continue;
    const fireAt = step.minutes === Infinity ? -Infinity : start - step.minutes * 60_000;
    if (nowMs >= fireAt) {
      // Narrower step (higher index) wins.
      if (!best || STEP_INDEX[step.key] > STEP_INDEX[best.key]) best = step;
    }
  }
  return best;
}

export function readDismissals() {
  try { return JSON.parse(localStorage.getItem(DISMISS_LS_KEY) || "{}") || {}; } catch { return {}; }
}

export function writeDismissal(planId, stepKey) {
  const map = readDismissals();
  map[planId] = stepKey;
  try { localStorage.setItem(DISMISS_LS_KEY, JSON.stringify(map)); } catch {}
}

// True if the plan should be visible right now: there's an open lead-step
// AND that step is narrower than (or equal to, for the very first surface)
// the last dismissed step the user logged.
export function shouldShowPin(plan, nowMs = Date.now()) {
  const open = activeStepFor(plan, nowMs);
  if (!open) return null;
  const dismissed = readDismissals()[plan.id];
  if (!dismissed) return open;
  const dismissedIdx = STEP_INDEX[dismissed] ?? -1;
  const openIdx = STEP_INDEX[open.key];
  return openIdx > dismissedIdx ? open : null;
}
