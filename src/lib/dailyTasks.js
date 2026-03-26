/**
 * @deprecated — use lib/dailyTaskSystem.js instead.
 * This file re-exports from the new system for backward compatibility.
 */
export { getLevelFromTotalXP, getTodayString } from "@/lib/dailyTaskSystem";
export { DEFAULT_TASK_TEMPLATES as DAILY_TASKS } from "@/lib/dailyTaskSystem";

// TOTAL_POSSIBLE_XP is no longer a fixed constant — kept for import compat.
import { DEFAULT_TASK_TEMPLATES } from "@/lib/dailyTaskSystem";
export const TOTAL_POSSIBLE_XP = DEFAULT_TASK_TEMPLATES.reduce((s, t) => s + t.points, 0);