// Which parts of the database a backup file actually covers — so "Replace
// All" only replaces what the file carries.
//
// Before v0.243.1 a Replace-All import swapped the WHOLE database for the
// file's contents. Any backup that held only some categories — the
// data-only safety net, the images-only backup, a selective export with
// boxes unticked, a Data Inspector single-category export — silently wiped
// everything it didn't contain ("my image library vanished after a
// backup"). The documented recovery path was data-only + images-only, and
// importing either one with Replace All erased what the other held.
//
// Pure functions only (no DB access) so they can be unit-tested.

// Files written since v0.243.1 declare their categories in `__categories`.
// Older files don't, so infer: a category is covered when the file carries
// ANY of its entities. A category that is absent from an old file is either
// one the user unticked or one they had no records in — both read the same,
// and keeping this device's copy is the only answer that never loses data.
export function coveredCategoryIds(data, declared, categories) {
  if (Array.isArray(declared)) return new Set(declared);
  const out = new Set();
  const src = data && typeof data === "object" ? data : {};
  for (const cat of categories) {
    if (cat.entities.some((e) => src[e] !== undefined)) out.add(cat.id);
  }
  return out;
}

// Every entity name the file is authoritative for: the entities of every
// covered category, plus anything present in the file itself (an entity a
// newer build added that this build's category list doesn't know yet).
export function coveredEntityNames(data, catIds, categories) {
  const out = new Set();
  const src = data && typeof data === "object" ? data : {};
  for (const k of Object.keys(src)) if (!k.startsWith("__")) out.add(k);
  for (const cat of categories) {
    if (catIds.has(cat.id)) for (const e of cat.entities) out.add(e);
  }
  return out;
}

// Build the database a scoped Replace-All should write: this device's
// entities the file doesn't cover, overlaid with everything in the file.
// `skip(key)` excludes keys the caller handles itself (reserved DB keys,
// device-bound entities). Returns { next, keptEntities }.
export function buildScopedReplace(current, incoming, covered, skip = () => false) {
  const next = {};
  const keptEntities = [];
  for (const [k, v] of Object.entries(current || {})) {
    if (k.startsWith("__") || skip(k) || covered.has(k)) continue;
    if (!v || typeof v !== "object") continue;
    next[k] = v;
    if (Object.keys(v).length > 0) keptEntities.push(k);
  }
  Object.assign(next, incoming || {});
  return { next, keptEntities };
}

// The categories whose records were kept, for the status message.
export function keptCategories(keptEntities, categories) {
  const kept = new Set(keptEntities);
  return categories.filter((c) => c.entities.some((e) => kept.has(e)));
}
