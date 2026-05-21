// Migration helper: alter.alter_custom_fields was historically used
// for two different features with incompatible shapes — the InfoTab
// "per-alter ad-hoc one-off fields" UI writes an ARRAY of
// `{ name, value }` records, while Get to know me / Help me unblend
// wrote a per-field-id OBJECT map `{ <CustomField.id>: value }`.
//
// The object-shape data actually belongs on alter.custom_fields
// (where InfoTab already renders system CustomField values). This
// helper folds any stranded object-shape data from
// alter.alter_custom_fields into alter.custom_fields and clears
// the legacy field. Idempotent and one-write-per-alter.
//
// Returns the migrated alter object (with the updated fields)
// without re-fetching — callers that need the freshest record
// should invalidate the relevant query.

import { base44 } from "@/api/base44Client";

export function needsAlterCustomFieldsMigration(alter) {
  const acf = alter?.alter_custom_fields;
  return !!acf
    && !Array.isArray(acf)
    && typeof acf === "object"
    && Object.keys(acf).length > 0;
}

export async function migrateAlterCustomFieldsObject(alter) {
  if (!alter || !needsAlterCustomFieldsMigration(alter)) return alter;
  const existing = (alter.custom_fields && typeof alter.custom_fields === "object" && !Array.isArray(alter.custom_fields))
    ? alter.custom_fields
    : {};
  const merged = { ...existing };
  let changed = false;
  for (const [k, v] of Object.entries(alter.alter_custom_fields)) {
    // Don't clobber an explicit InfoTab edit that already lives in
    // custom_fields — only fill in the slots that are currently
    // empty / unset.
    const current = merged[k];
    if (current == null || current === "") {
      merged[k] = v;
      changed = true;
    }
  }
  const patch = changed
    ? { custom_fields: merged, alter_custom_fields: null }
    : { alter_custom_fields: null };
  await base44.entities.Alter.update(alter.id, patch);
  return { ...alter, ...patch };
}
