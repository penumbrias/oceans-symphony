// The setup guide's checklist state (split out of SetupChecklist.jsx in
// v0.357.0 so the home screen can read progress without loading the guide).
//
// Per-system-scoped since v0.85.6 (tester report: a new system was
// inheriting the previous system's half-finished checklist).
// psGetItem falls back to the legacy unscoped key when the registry has
// ≤1 system, so pre-existing single-system users' progress carries over.
import { psGetItem, psSetItem } from "@/lib/perSystemStorage";

export const CHECKLIST_KEY = "symphony_setup_checklist_v1";
export const CHECKLIST_ITEMS = ["alters", "levels", "tracking", "activity", "tasks", "reminders", "newui", "backup"];

export function loadChecklist() {
  try {
    const raw = psGetItem(CHECKLIST_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch { return {}; }
}
export function saveChecklist(state) {
  psSetItem(CHECKLIST_KEY, JSON.stringify(state || {}));
}
export function checklistComplete(state = loadChecklist()) {
  return CHECKLIST_ITEMS.every((k) => !!state[k]);
}
export function checklistProgress(state = loadChecklist()) {
  const done = CHECKLIST_ITEMS.filter((k) => !!state[k]).length;
  return { done, total: CHECKLIST_ITEMS.length };
}
