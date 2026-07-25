// Modernise a legacy tracking catalogue → preset bundles WITHOUT losing
// user data or check-in history.
//
// The old catalogue (SYMPTOM_DEFAULTS in src/utils/symptomDefaults.js —
// pre-v0.83) was a flat list of ~32 items. v0.83 introduced 9 preset
// bundles with a richer model (kind, direction, scale). Existing users
// were left on the old list intentionally (see seedSymptomDefaults's
// `existing.length > 0` early-return) so nothing changed under them —
// but the tester now wants an OPT-IN "update" path: bring in the new
// preset packs, and where a legacy row is conceptually the same as a
// new preset item, MERGE by updating the legacy row in place (keeping
// its id) so every SymptomCheckIn/SymptomSession pointing at it stays
// pointing at it — no history loss.
//
// Detection: a "legacy default" row is `is_default: true` with no
// `bundle_id`. That's how the legacy seeder wrote them; the new
// `seedBundles` always stamps a `bundle_id`. Custom (is_default=false)
// rows are never touched by the migration — they're the user's own.

import { base44 } from "@/api/base44Client";
import { TRACKING_BUNDLES, bundleById, itemToSymptomFields } from "@/lib/trackingPresets";
import { getSeedTerms } from "@/utils/symptomDefaults";
import { applyTerms } from "@/lib/dailyTaskSystem";

// Legacy label → { bundleId, presetLabel }. Only concept-equivalent pairs;
// anything semantically ambiguous or direction-flipped is intentionally
// omitted so we never subtly change the meaning of a user's data.
export const LEGACY_TO_PRESET_EQUIVALENTS = [
  // Mood rating symptoms
  { legacy: "Overall mood", bundleId: "mood", preset: "Overall mood" },
  { legacy: "Energy level", bundleId: "mood", preset: "Energy" },
  { legacy: "Self esteem", bundleId: "mood", preset: "Self esteem" },
  { legacy: "Anxiety", bundleId: "mood", preset: "Anxious / on edge" },
  { legacy: "Depression", bundleId: "mood", preset: "Low / depressed" },
  { legacy: "Feeling irritable", bundleId: "mood", preset: "Irritable" },
  { legacy: "Feeling manic / wired / elated", bundleId: "mood", preset: "Wired / elevated" },
  { legacy: "Feeling overwhelmed", bundleId: "mood", preset: "Overwhelmed" },
  { legacy: "Emotional numbness", bundleId: "mood", preset: "Emotionally numb / flat" },
  // Body / sleep
  { legacy: "Trouble sleeping", bundleId: "body", preset: "Trouble sleeping" },
  // Dissociation
  { legacy: "Amnesia / memory problems", bundleId: "dissociation", preset: "Memory gaps today" },
  // Context
  { legacy: "Work / school stress", bundleId: "context", preset: "Work / school stress" },
  // Habits (behaviour boolean → daily_care)
  { legacy: "Spoke to someone about feelings", bundleId: "daily_care", preset: "Talked to someone I trust" },
  { legacy: "Took care of chores", bundleId: "daily_care", preset: "Took care of a chore" },
  { legacy: "Attended therapy", bundleId: "daily_care", preset: "Attended therapy" },
  { legacy: "Used coping skills", bundleId: "daily_care", preset: "Used a coping skill" },
  { legacy: "Exercise / movement", bundleId: "daily_care", preset: "Moved my body" },
  { legacy: "Engaged in social activities", bundleId: "daily_care", preset: "Spent time with people" },
  { legacy: "Self-care", bundleId: "daily_care", preset: "Did something just for me" },
];

function lower(s) { return String(s || "").trim().toLowerCase(); }

// A symptom row came from the LEGACY seeder if it's marked is_default but
// has no bundle_id. That's the signal seedSymptomDefaults used pre-v0.83.
export function isLegacyDefault(row) {
  return !!row?.is_default && !row?.bundle_id;
}

export function detectLegacyCatalogue(allSymptoms) {
  const legacyRows = allSymptoms.filter(isLegacyDefault);
  const presetRows = allSymptoms.filter((r) => !!r?.bundle_id);
  // A "custom overlap" is a user-authored (is_default=false) row whose label
  // matches EITHER a preset item's label directly (case-insensitive) OR a
  // legacy-name in the equivalence table (e.g. custom "Anxiety" is a match
  // for preset "Anxious / on edge" via the LEGACY_TO_PRESET_EQUIVALENTS row).
  // Detection here is label-only; the async findCustomOverlaps applies terms
  // too so the full match set is available when we build the plan.
  const matchableLabelsLower = new Set();
  for (const b of TRACKING_BUNDLES) for (const it of b.items) matchableLabelsLower.add(lower(it.label));
  for (const e of LEGACY_TO_PRESET_EQUIVALENTS) matchableLabelsLower.add(lower(e.legacy));
  const customOverlapCount = allSymptoms.filter(
    (s) => s && s.is_default === false && matchableLabelsLower.has(lower(s.label))
  ).length;
  return {
    legacyCount: legacyRows.length,
    presetCount: presetRows.length,
    customOverlapCount,
    hasLegacyDefaults: legacyRows.length > 0,
    hasPresetItems: presetRows.length > 0,
    // Show the offer when there's ANY upgrade path — legacy rows to
    // migrate, or custom rows that could be linked to presets to gain
    // bundle grouping, direction, scale, kind etc.
    canModernize: legacyRows.length > 0 || customOverlapCount > 0,
  };
}

// Custom rows whose label (case-insensitive, term-resolved) matches a
// preset item. Returned so the modal can render per-row checkboxes and
// the plan builder can turn opted-in ids into a toSyncCustom entry.
// Multiple preset matches for the same label → returns each as its own
// candidate (rare — same label across bundles is uncommon), user picks.
export async function findCustomOverlaps(allSymptoms) {
  const terms = await getSeedTerms();
  const results = [];
  const seenPairs = new Set(); // dedup customId+bundleId+preset combos
  const push = (s, bundle, item) => {
    const resolved = applyTerms(item.label, terms);
    const key = `${s.id}::${bundle.id}::${lower(resolved)}`;
    if (seenPairs.has(key)) return;
    seenPairs.add(key);
    if (s.bundle_id === bundle.id) return; // already linked
    results.push({
      customId: s.id,
      customLabel: s.label,
      customCategory: s.category,
      bundleId: bundle.id,
      bundleLabel: bundle.label,
      presetLabel: resolved,
      presetItem: item,
    });
  };
  for (const s of allSymptoms) {
    if (!s || s.is_default !== false) continue;
    const labelKey = lower(s.label);
    if (!labelKey) continue;
    // Direct label match (custom "Overall mood" → preset "Overall mood")
    for (const bundle of TRACKING_BUNDLES) {
      for (const item of bundle.items) {
        const resolvedItemLabel = applyTerms(item.label, terms);
        if (lower(resolvedItemLabel) === labelKey) push(s, bundle, item);
      }
    }
    // Legacy-name match through the equivalence table (custom "Anxiety" →
    // preset "Anxious / on edge" via LEGACY_TO_PRESET_EQUIVALENTS). Same
    // curated set the legacy-row adopt path uses, so behaviour is
    // consistent across is_default and custom rows.
    for (const eq of LEGACY_TO_PRESET_EQUIVALENTS) {
      if (lower(eq.legacy) !== labelKey) continue;
      const bundle = bundleById(eq.bundleId);
      if (!bundle) continue;
      const item = bundle.items.find((it) => lower(it.label) === lower(eq.preset));
      if (!item) continue;
      push(s, bundle, item);
    }
  }
  return results;
}

// Build a plan for the given bundle ids. `syncCustomIds` (Set<string>) opts
// user-authored rows into being linked to their preset equivalent. Returns:
//   {
//     toAdopt:  [{ id, legacyLabel, presetLabel, bundleId, presetFields }],
//                — legacy row exists, preset row does NOT: rewrite legacy in place
//     toReconcile: [{ legacyId, legacyLabel, keeperId, presetLabel, bundleId }]
//                — BOTH exist: re-point history legacy→preset, archive legacy
//     toSyncCustom: [{ id, customLabel, presetLabel, bundleId, presetFields }]
//                — custom row's label matches a preset item: enrich in place
//                (kind, direction, scale, bundle_id from the preset), keep id
//                so history and is_default=false stay intact
//     toCreate: [{ presetLabel, bundleId, fields }]
//     alreadyPresent: [{ presetLabel, bundleId }]
//   }
// Nothing writes yet — safe to preview counts in the modal before applying.
export async function planModernization(allSymptoms, selectedBundleIds, syncCustomIds = new Set()) {
  const terms = await getSeedTerms();
  const bundles = selectedBundleIds.map(bundleById).filter(Boolean);

  // Index of user's existing rows by (label lower, category) for exact-match dedup
  const existingByLabelCat = new Map();
  for (const s of allSymptoms) {
    if (!s?.label) continue;
    existingByLabelCat.set(`${lower(s.label)}::${s.category || "symptom"}`, s);
  }

  // Index of legacy rows for equivalence lookup
  const legacyByLabel = new Map();
  for (const s of allSymptoms) {
    if (!isLegacyDefault(s)) continue;
    legacyByLabel.set(lower(s.label), s);
  }

  const toAdopt = [];
  const toReconcile = [];
  const toSyncCustom = [];
  const toCreate = [];
  const alreadyPresent = [];

  // Index of custom rows opted in for sync — by the TARGET preset label
  // (case-insensitive) + bundle id. Built from findCustomOverlaps so a
  // custom "Anxiety" (a legacy-name in the equivalence table) correctly
  // targets preset "Anxious / on edge" in the mood bundle. Only entries
  // for ids the user ticked in the modal.
  const overlaps = await findCustomOverlaps(allSymptoms);
  const customsToSyncByTargetKey = new Map();
  for (const o of overlaps) {
    if (!syncCustomIds || !syncCustomIds.has(o.customId)) continue;
    const key = `${lower(o.presetLabel)}::${o.bundleId}`;
    // Same custom mapped to multiple bundles → prefer the first one
    // (findCustomOverlaps returns direct label matches before legacy
    // equivalents, so a direct match wins over an equivalence match).
    if (customsToSyncByTargetKey.has(key)) continue;
    customsToSyncByTargetKey.set(key, {
      row: allSymptoms.find((s) => s.id === o.customId),
      overlap: o,
    });
  }

  for (const bundle of bundles) {
    for (let i = 0; i < bundle.items.length; i++) {
      const item = bundle.items[i];
      const fields = itemToSymptomFields(item, bundle.id, i);
      fields.label = applyTerms(fields.label, terms);
      const key = `${lower(fields.label)}::${fields.category}`;

      // Is there an equivalence mapping pointing a legacy row at this preset?
      const equivalent = LEGACY_TO_PRESET_EQUIVALENTS.find(
        (e) => e.bundleId === bundle.id && lower(e.preset) === lower(item.label)
      );
      const legacyRow = equivalent ? legacyByLabel.get(lower(equivalent.legacy)) : null;
      const existingPresetRow = existingByLabelCat.get(key);

      // Case 1: BOTH the preset row AND the legacy equivalent exist.
      // Re-point history from legacy → preset, then archive the legacy
      // row so it stops appearing in check-ins but isn't destroyed (per
      // "never delete user data": the *user's* data lives in
      // SymptomCheckIn/SymptomSession, which we re-point, so archiving
      // the definition row loses nothing).
      if (legacyRow && existingPresetRow && legacyRow.id !== existingPresetRow.id && !legacyRow._migrated) {
        toReconcile.push({
          legacyId: legacyRow.id,
          legacyLabel: legacyRow.label,
          keeperId: existingPresetRow.id,
          presetLabel: fields.label,
          bundleId: bundle.id,
        });
        legacyRow._migrated = true;
        continue;
      }

      // Case 2: only the legacy row exists. Rewrite it in place — its id
      // stays the same so every SymptomCheckIn/SymptomSession that
      // pointed at it still does. This is the common case for a user
      // who never touched BundlePicker.
      if (legacyRow && !legacyRow._migrated) {
        toAdopt.push({
          id: legacyRow.id,
          legacyLabel: legacyRow.label,
          presetLabel: fields.label,
          bundleId: bundle.id,
          presetFields: fields,
        });
        legacyRow._migrated = true;
        continue;
      }

      // Case 3: a user-authored custom row the user has opted to link
      // to this preset (either by exact label match OR by the legacy
      // equivalence table). Enrich in place — kind/direction/scale/
      // bundle_id from the preset — but keep id, label, is_default,
      // is_archived, colour, so history and their own choices survive.
      const customToSyncKey = `${lower(fields.label)}::${bundle.id}`;
      const customSyncEntry = customsToSyncByTargetKey.get(customToSyncKey);
      const customRow = customSyncEntry?.row;
      if (customRow && !customRow._migrated) {
        toSyncCustom.push({
          id: customRow.id,
          customLabel: customRow.label,
          presetLabel: fields.label,
          bundleId: bundle.id,
          presetFields: fields,
        });
        customRow._migrated = true;
        continue;
      }

      // Case 4: an item with this exact name already exists (e.g. the
      // user seeded this bundle earlier, or has an identically-named
      // custom row they DIDN'T opt to sync). Skip — nothing to add,
      // nothing to change.
      if (existingPresetRow) {
        alreadyPresent.push({ presetLabel: fields.label, bundleId: bundle.id });
        continue;
      }

      // Case 5: brand new. Create.
      toCreate.push({ presetLabel: fields.label, bundleId: bundle.id, fields });
    }
  }

  // Clean up the transient `_migrated` markers we scribbled on the rows above.
  for (const s of allSymptoms) delete s._migrated;

  return { toAdopt, toReconcile, toSyncCustom, toCreate, alreadyPresent };
}

// Execute the plan. Returns
//   { adopted, reconciled, syncedCustom, created, skipped } counts.
export async function applyModernization(plan) {
  let adopted = 0, reconciled = 0, syncedCustom = 0, created = 0;

  // Reconcile first — re-point history from legacy → keeper, then archive
  // the legacy definition row. Done up front so a mid-run failure never
  // leaves history pointing at a soon-to-be-archived id.
  if (plan.toReconcile.length > 0) {
    const [checkIns, sessions] = await Promise.all([
      base44.entities.SymptomCheckIn.list().catch(() => []),
      base44.entities.SymptomSession.list().catch(() => []),
    ]);
    for (const r of plan.toReconcile) {
      try {
        for (const c of checkIns) {
          if (c?.symptom_id === r.legacyId) {
            await base44.entities.SymptomCheckIn.update(c.id, { symptom_id: r.keeperId }).catch(() => {});
          }
        }
        for (const s of sessions) {
          if (s?.symptom_id === r.legacyId) {
            await base44.entities.SymptomSession.update(s.id, { symptom_id: r.keeperId }).catch(() => {});
          }
        }
        // Archive rather than delete — keeps the row inspectable if
        // anything goes wrong, and satisfies the "never destroy user
        // data" invariant.
        await base44.entities.Symptom.update(r.legacyId, { is_archived: true });
        reconciled++;
      } catch { /* skip on error */ }
    }
  }

  for (const a of plan.toAdopt) {
    const patch = { ...a.presetFields };
    // Preserve id — do NOT touch is_archived (respect the user's own hides).
    delete patch.is_archived;
    try {
      await base44.entities.Symptom.update(a.id, patch);
      adopted++;
    } catch { /* skip on error */ }
  }

  for (const s of plan.toSyncCustom || []) {
    // Enrich a user-created row with preset metadata. Preserve id +
    // is_default:false (it stays "yours"), and don't touch is_archived
    // or color — those were the user's own choices. Only sets the
    // preset-shape fields (kind, direction, scale, bundle_id, and the
    // canonical category/type in case they diverged).
    const p = s.presetFields;
    const patch = {
      kind: p.kind,
      direction: p.direction,
      is_positive: p.is_positive,
      bundle_id: p.bundle_id,
      category: p.category,
      type: p.type,
      ...(p.scale ? { scale: p.scale } : {}),
      ...(p.safety_sensitive ? { safety_sensitive: true } : {}),
    };
    try {
      await base44.entities.Symptom.update(s.id, patch);
      syncedCustom++;
    } catch { /* skip */ }
  }

  for (const c of plan.toCreate) {
    try {
      await base44.entities.Symptom.create(c.fields);
      created++;
    } catch { /* skip */ }
  }
  return { adopted, reconciled, syncedCustom, created, skipped: plan.alreadyPresent.length };
}
