import { base44 } from "@/api/base44Client";
import { TRACKING_BUNDLES, DEFAULT_ON_BUNDLE_IDS, bundleById, itemToSymptomFields } from "@/lib/trackingPresets";
import { DEFAULT_TERMS, gerund } from "@/lib/useTerms";
import { applyTerms } from "@/lib/dailyTaskSystem";

// Non-hook terms resolver for seeding contexts (no React tree available).
// Mirrors useTerms' base + gerund-override logic for the forms preset
// labels use ({{Fronting}} etc.).
const cap = (w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w);
export async function getSeedTerms() {
  let s = {};
  try { s = (await base44.entities.SystemSettings.list())[0] || {}; } catch { /* defaults */ }
  const safe = (v, f) => (v && String(v).trim() ? String(v).trim() : f);
  const system = safe(s.term_system, DEFAULT_TERMS.system);
  const alter = safe(s.term_alter, DEFAULT_TERMS.alter);
  const front = safe(s.term_front, DEFAULT_TERMS.front);
  const sw = safe(s.term_switch, DEFAULT_TERMS.switch);
  const fronting = safe(s.term_fronting, gerund(front));
  const switching = safe(s.term_switching, gerund(sw));
  return {
    system, System: cap(system),
    alter, Alter: cap(alter),
    front, Front: cap(front),
    switch: sw, Switch: cap(sw),
    fronting, Fronting: cap(fronting),
    switching, Switching: cap(switching),
  };
}

// LEGACY seed list (pre-bundle). Kept because existing users' rows match it
// and healDuplicateDefaults reasons about it — but FRESH installs now seed
// the default-on preset bundles (trackingPresets.js) instead.
const SYMPTOM_DEFAULTS = [
  // Rating symptoms
  { label: "Overall mood", category: "symptom", type: "rating", is_positive: true, color: "#8B5CF6", order: 0 },
  { label: "Energy level", category: "symptom", type: "rating", is_positive: true, color: "#F59E0B", order: 1 },
  { label: "Self esteem", category: "symptom", type: "rating", is_positive: true, color: "#A78BFA", order: 2 },
  { label: "Anxiety", category: "symptom", type: "rating", is_positive: false, color: "#EF4444", order: 3 },
  { label: "Depression", category: "symptom", type: "rating", is_positive: false, color: "#6366F1", order: 4 },
  { label: "Feeling irritable", category: "symptom", type: "rating", is_positive: false, color: "#F97316", order: 5 },
  { label: "Feeling manic / wired / elated", category: "symptom", type: "rating", is_positive: false, color: "#EC4899", order: 6 },
  { label: "Feeling overwhelmed", category: "symptom", type: "rating", is_positive: false, color: "#DC2626", order: 7 },
  { label: "Emotional numbness", category: "symptom", type: "rating", is_positive: false, color: "#64748B", order: 8 },
  { label: "Lack of motivation", category: "symptom", type: "rating", is_positive: false, color: "#94A3B8", order: 9 },
  { label: "Trouble sleeping", category: "symptom", type: "rating", is_positive: false, color: "#1D4ED8", order: 10 },

  // Boolean symptoms
  { label: "Emotional hangover", category: "symptom", type: "boolean", is_positive: false, color: "#7C3AED", order: 11 },
  { label: "Rapid cycling mood swings", category: "symptom", type: "boolean", is_positive: false, color: "#DB2777", order: 12 },
  { label: "Amnesia / memory problems", category: "symptom", type: "boolean", is_positive: false, color: "#3B82F6", order: 13 },
  { label: "Triggered switch", category: "symptom", type: "boolean", is_positive: false, color: "#B45309", order: 14 },
  { label: "Random switch", category: "symptom", type: "boolean", is_positive: false, color: "#92400E", order: 15 },
  { label: "Rapid switching", category: "symptom", type: "boolean", is_positive: false, color: "#C2410C", order: 16 },
  { label: "Lots of switching", category: "symptom", type: "boolean", is_positive: false, color: "#D97706", order: 17 },
  { label: "Work / school stress", category: "symptom", type: "boolean", is_positive: false, color: "#0EA5E9", order: 18 },
  { label: "General stress", category: "symptom", type: "boolean", is_positive: false, color: "#2563EB", order: 19 },
  { label: "Relationship stress", category: "symptom", type: "boolean", is_positive: false, color: "#7C3AED", order: 20 },

  // Boolean habits
  { label: "Feeling calm", category: "habit", type: "boolean", is_positive: true, color: "#10B981", order: 0 },
  { label: "Feeling happy", category: "habit", type: "boolean", is_positive: true, color: "#34D399", order: 1 },
  { label: "Feeling productive", category: "habit", type: "boolean", is_positive: true, color: "#059669", order: 2 },
  { label: "Spoke to someone about feelings", category: "habit", type: "boolean", is_positive: true, color: "#0D9488", order: 3 },
  { label: "Took care of chores", category: "habit", type: "boolean", is_positive: true, color: "#14B8A6", order: 4 },
  { label: "Attended therapy", category: "habit", type: "boolean", is_positive: true, color: "#0891B2", order: 5 },
  { label: "Used coping skills", category: "habit", type: "boolean", is_positive: true, color: "#06B6D4", order: 6 },
  { label: "Logged diary", category: "habit", type: "boolean", is_positive: true, color: "#22C55E", order: 7 },
  { label: "Exercise / movement", category: "habit", type: "boolean", is_positive: true, color: "#16A34A", order: 8 },
  { label: "Engaged in social activities", category: "habit", type: "boolean", is_positive: true, color: "#15803D", order: 9 },
  { label: "Self-care", category: "habit", type: "boolean", is_positive: true, color: "#4ADE80", order: 10 },
];

let seeded = false;

// Set once the onboarding flow has put the bundle choice in the user's
// hands (Express or Customize — even "none of these"). When present, the
// lazy auto-seed stands down: an explicitly-empty catalogue stays empty.
export const BUNDLES_CHOSEN_KEY = "symphony_onboarding_bundles_chosen_v1";
export function markBundlesChosen() {
  try { localStorage.setItem(BUNDLES_CHOSEN_KEY, "1"); } catch { /* storage off */ }
}

export async function seedSymptomDefaults() {
  if (seeded) return;
  seeded = true;
  try {
    const existing = await base44.entities.Symptom.list();
    if (existing.length > 0) {
      // Existing users keep whatever they have (legacy list, bundles, or
      // custom) — seeding never touches a populated catalogue.
      await healDuplicateDefaults(existing);
      return;
    }
    // The user already made an explicit choice in onboarding (possibly
    // "nothing") — respect it, never re-seed over it.
    try { if (localStorage.getItem(BUNDLES_CHOSEN_KEY)) return; } catch { /* storage off */ }
    // Fresh install, no onboarding choice yet → seed the default-on preset
    // bundles (the research-grounded catalogue), not the legacy list.
    await seedBundles(DEFAULT_ON_BUNDLE_IDS);
  } catch (e) {
    console.warn("Failed to seed symptom defaults:", e);
    seeded = false;
  }
}

// Create Symptom rows for an explicit picker selection (Set/array of
// `${bundleId}:${itemIndex}` keys — the shape BundleList tracks). Terms
// resolve at creation; duplicates (by resolved label + category) skipped.
export async function createPresetItems(selectedKeys) {
  const terms = await getSeedTerms();
  const existing = await base44.entities.Symptom.list();
  const have = new Set(
    existing.map((s) => `${String(s.label || "").trim().toLowerCase()}::${s.category || "symptom"}`)
  );
  let created = 0;
  for (const key of selectedKeys) {
    const [bundleId, idxStr] = String(key).split(":");
    const bundle = bundleById(bundleId);
    const item = bundle?.items[Number(idxStr)];
    if (!item) continue;
    const fields = itemToSymptomFields(item, bundleId, Number(idxStr));
    fields.label = applyTerms(fields.label, terms);
    const dedupKey = `${fields.label.trim().toLowerCase()}::${fields.category}`;
    if (have.has(dedupKey)) continue;
    have.add(dedupKey);
    await base44.entities.Symptom.create(fields);
    created++;
  }
  return created;
}

// Create the Symptom rows for the given preset bundles. Term placeholders
// ({{Fronting}} …) resolve to the user's terms at creation time — the label
// becomes plain user data from then on. Skips any item whose (resolved)
// label already exists in the same category (case-insensitive), so
// re-adding a bundle never duplicates rows. Returns how many were created.
export async function seedBundles(bundleIds) {
  const terms = await getSeedTerms();
  const existing = await base44.entities.Symptom.list();
  const have = new Set(
    existing.map((s) => `${String(s.label || "").trim().toLowerCase()}::${s.category || "symptom"}`)
  );
  let created = 0;
  for (const bundleId of bundleIds) {
    const bundle = bundleById(bundleId);
    if (!bundle) continue;
    for (let i = 0; i < bundle.items.length; i++) {
      const item = bundle.items[i];
      const fields = itemToSymptomFields(item, bundle.id, i);
      fields.label = applyTerms(fields.label, terms);
      const key = `${fields.label.trim().toLowerCase()}::${fields.category}`;
      if (have.has(key)) continue;
      have.add(key);
      await base44.entities.Symptom.create(fields);
      created++;
    }
  }
  return created;
}

export { TRACKING_BUNDLES, DEFAULT_ON_BUNDLE_IDS };

// Merge duplicate DEFAULT symptom/habit rows (same label + category, both
// is_default). These crept in when a backup made after seeding was
// re-imported in merge mode: the defaults seed with fresh RANDOM ids, so the
// backup's "Anxiety" never id-matched the local "Anxiety" and both survived
// (mergeDbDump now dedupes Symptom by content key, but data duplicated by
// older imports is already on devices). Keeps the most-referenced copy,
// re-points check-ins / symptom sessions at it, then deletes the extras.
// Custom rows (is_default falsy) are never touched — two same-named custom
// symptoms remain the user's choice. Idempotent; runs at most once per
// app session via the `seeded` flag.
async function healDuplicateDefaults(allSymptoms) {
  const groups = new Map();
  for (const s of allSymptoms) {
    if (!s?.is_default) continue;
    const label = String(s.label || "").trim().toLowerCase();
    if (!label) continue;
    const key = `${label}::${s.category || "symptom"}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }
  const dupGroups = [...groups.values()].filter((g) => g.length > 1);
  if (dupGroups.length === 0) return;

  const [checkIns, sessions] = await Promise.all([
    base44.entities.SymptomCheckIn.list().catch(() => []),
    base44.entities.SymptomSession.list().catch(() => []),
  ]);
  const refCount = {};
  for (const c of checkIns) if (c?.symptom_id) refCount[c.symptom_id] = (refCount[c.symptom_id] || 0) + 1;
  for (const s of sessions) if (s?.symptom_id) refCount[s.symptom_id] = (refCount[s.symptom_id] || 0) + 1;

  for (const group of dupGroups) {
    // Keeper: most referenced; tie → oldest created_date (the original seed).
    const sorted = [...group].sort(
      (a, b) =>
        (refCount[b.id] || 0) - (refCount[a.id] || 0) ||
        String(a.created_date || "").localeCompare(String(b.created_date || ""))
    );
    const keeper = sorted[0];
    const dropped = sorted.slice(1);
    const droppedIds = new Set(dropped.map((d) => d.id));

    // Never lose history: re-point every reference at the keeper first.
    for (const c of checkIns) {
      if (c?.symptom_id && droppedIds.has(c.symptom_id)) {
        await base44.entities.SymptomCheckIn.update(c.id, { symptom_id: keeper.id }).catch(() => {});
      }
    }
    for (const s of sessions) {
      if (s?.symptom_id && droppedIds.has(s.symptom_id)) {
        await base44.entities.SymptomSession.update(s.id, { symptom_id: keeper.id }).catch(() => {});
      }
    }
    // If the keeper was archived but a duplicate wasn't, the user clearly
    // still wants it visible — unarchive the merged row.
    if (keeper.is_archived && dropped.some((d) => !d.is_archived)) {
      await base44.entities.Symptom.update(keeper.id, { is_archived: false }).catch(() => {});
    }
    for (const d of dropped) {
      await base44.entities.Symptom.delete(d.id).catch(() => {});
    }
  }
  console.info(`[symptomDefaults] merged ${dupGroups.length} duplicated default symptom(s)`);
}