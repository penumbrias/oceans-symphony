// First-class, nestable categories for the system chat sidebar.
//
// Channels carry `category_id` (FK → SystemChatCategory) and categories
// carry `parent_category_id` (FK → another category) so the sidebar can show
// a real tree: root → category → subcategory → subcategory (max 3 deep).
//
// A `category` STRING used to live on the channel (flat grouping). We migrate
// those to real category entities on load (non-destructively — the string is
// left in place as a fallback) so existing setups become editable trees.
//
// Every tree walk here is cycle-guarded and depth-clamped — one bad
// parent_category_id must never be able to brick the chat (same lesson as the
// activity category tree).

export const CHAT_CATEGORY_MAX_DEPTH = 3; // category, subcategory, subcategory

export function chatCategoriesById(categories = []) {
  const m = {};
  for (const c of categories) m[c.id] = c;
  return m;
}

// Depth of a category (1 = root category). Cycle-safe.
export function chatCategoryDepth(catId, byId) {
  let depth = 1;
  let cur = byId[catId];
  const seen = new Set();
  while (cur && cur.parent_category_id && !seen.has(cur.id)) {
    seen.add(cur.id);
    cur = byId[cur.parent_category_id];
    depth += 1;
    if (depth > 50) break; // hard backstop
  }
  return depth;
}

// Is `candidateId` an ancestor of `catId` (or the same)? Used to stop a
// category being re-parented under its own descendant (a cycle).
function isAncestorOrSelf(candidateId, catId, byId) {
  if (candidateId === catId) return true;
  let cur = byId[catId];
  const seen = new Set();
  while (cur && cur.parent_category_id && !seen.has(cur.id)) {
    seen.add(cur.id);
    if (cur.parent_category_id === candidateId) return true;
    cur = byId[cur.parent_category_id];
  }
  return false;
}

// Categories that can legally be the parent of `selfId` (or of a brand-new
// category when selfId is null): not self, not a descendant of self, and not
// already so deep that nesting would exceed the max depth.
export function eligibleChatParents(categories = [], selfId = null) {
  const byId = chatCategoriesById(categories);
  return categories.filter((c) => {
    if (selfId && isAncestorOrSelf(selfId, c.id, byId)) return false; // would cycle
    // A child sits one level below its parent; keep the whole result within
    // CHAT_CATEGORY_MAX_DEPTH.
    if (chatCategoryDepth(c.id, byId) >= CHAT_CATEGORY_MAX_DEPTH) return false;
    return true;
  });
}

function sortBySortOrder(arr) {
  return [...arr].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
      || (a.created_date || "").localeCompare(b.created_date || "")
  );
}

// Build the sidebar tree. Returns:
//   { rootNodes: [node], uncategorized: [channel] }
// where node = { category, subNodes: [node], channels: [channel] }.
// Channels whose category_id doesn't resolve (deleted category) fall back to
// uncategorized so they never vanish.
export function buildChatTree(categories = [], channels = []) {
  const byId = chatCategoriesById(categories);
  const liveChannels = channels.filter((c) => !c.is_archived && !c.is_private);

  const childCatsOf = {};   // parentId|"__root__" → [category]
  for (const cat of categories) {
    const key = cat.parent_category_id && byId[cat.parent_category_id] ? cat.parent_category_id : "__root__";
    (childCatsOf[key] ||= []).push(cat);
  }
  const channelsOf = {};    // categoryId → [channel]
  const uncategorized = [];
  for (const ch of liveChannels) {
    if (ch.category_id && byId[ch.category_id]) (channelsOf[ch.category_id] ||= []).push(ch);
    else uncategorized.push(ch);
  }

  const buildNode = (cat, depth, seen) => {
    if (seen.has(cat.id) || depth > CHAT_CATEGORY_MAX_DEPTH) return null;
    seen.add(cat.id);
    const subNodes = sortBySortOrder(childCatsOf[cat.id] || [])
      .map((sub) => buildNode(sub, depth + 1, seen))
      .filter(Boolean);
    return { category: cat, subNodes, channels: sortBySortOrder(channelsOf[cat.id] || []) };
  };

  const rootNodes = sortBySortOrder(childCatsOf["__root__"] || [])
    .map((cat) => buildNode(cat, 1, new Set()))
    .filter(Boolean);

  return { rootNodes, uncategorized: sortBySortOrder(uncategorized) };
}

// One-time, idempotent, non-destructive migration of legacy string categories
// into real SystemChatCategory entities. For each distinct `category` string
// on a channel that has no category_id, find-or-create a root category with
// that name and stamp the channel's category_id. Returns the number created.
export async function migrateLegacyChatCategories(localEntities, channels = [], categories = []) {
  const needing = channels.filter((c) => !c.category_id && (c.category || "").trim());
  if (needing.length === 0) return 0;

  const byName = {};
  for (const cat of categories) {
    const key = (cat.name || "").trim().toLowerCase();
    if (key && !(key in byName)) byName[key] = cat;
  }
  let created = 0;
  // -Date.now() keeps freshly-created categories near the top; legacy ones get
  // an ascending nudge so their relative order is stable.
  let order = 0;
  for (const ch of needing) {
    const name = ch.category.trim();
    const key = name.toLowerCase();
    let cat = byName[key];
    if (!cat) {
      try {
        cat = await localEntities.SystemChatCategory.create({
          name,
          color: null,
          parent_category_id: null,
          sort_order: order++,
          collapsed: false,
          created_date: new Date().toISOString(),
        });
        byName[key] = cat;
        created += 1;
      } catch { continue; }
    }
    try { await localEntities.SystemChatChannel.update(ch.id, { category_id: cat.id }); } catch { /* keep going */ }
  }
  return created;
}
