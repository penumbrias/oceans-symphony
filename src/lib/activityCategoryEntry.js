// The one way a NEW activity (an ActivityCategory row) is made from typed
// text — the ~activity:new command and the "create it?" prompt when
// ~activity:name finds nothing. Never makes a twin: an activity with the
// same name under the same parent is handed back instead.

import { base44 } from "@/api/base44Client";

export const DEFAULT_ACTIVITY_COLOR = "#8b5cf6";

const key = (s) => String(s || "").trim().toLowerCase();

/**
 * @returns {Promise<{ category, created: boolean }>}
 */
export async function createActivityCategory({ name, parentId = null, color = null } = {}) {
  const clean = String(name || "").replace(/\s+/g, " ").trim();
  if (!clean) throw new Error("An activity needs a name.");
  let all = [];
  try { all = (await base44.entities.ActivityCategory.list()) || []; } catch { all = []; }
  const twin = all.find((c) => c && key(c.name) === key(clean) && (c.parent_category_id || null) === (parentId || null));
  if (twin) return { category: twin, created: false };
  const parent = parentId ? all.find((c) => c?.id === parentId) : null;
  const category = await base44.entities.ActivityCategory.create({
    name: clean,
    color: color || parent?.color || DEFAULT_ACTIVITY_COLOR,
    parent_category_id: parentId || null,
  });
  try {
    const { queryClientInstance } = await import("@/lib/query-client");
    queryClientInstance.invalidateQueries({ queryKey: ["activityCategories"] });
    queryClientInstance.invalidateQueries({ queryKey: ["logcmd", "activityCategories"] });
  } catch { /* no query cache (tests) */ }
  return { category, created: true };
}
