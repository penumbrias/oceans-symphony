// SystemSettings is meant to be one record per system, but boot-time
// auto-create (and some import / merge paths) can leave an empty default stub
// sitting alongside the real record. Because `SystemSettings.list()[0]` is
// order-dependent (the list is sorted newest-first), a stub created *after* an
// import can shadow the imported record — making the profile name / bio /
// avatar read (and, worse, SAVE) against the empty stub while the switcher and
// the author-name resolver (useSystemIdentity) correctly show the real one.
//
// This picks whichever record actually carries user-meaningful profile content,
// falling back to `[0]` when none do. Pure read-side resolution — no records are
// mutated, deleted, or merged. useSystemIdentity uses the same approach.
export function pickPrimarySystemSettings(list) {
  if (!Array.isArray(list) || list.length === 0) return null;
  const meaningful = list.find(
    (r) => r && (
      (r.system_name && String(r.system_name).trim()) ||
      (r.system_description && String(r.system_description).trim()) ||
      (r.system_bio && String(r.system_bio).trim()) ||
      (r.system_avatar_url && String(r.system_avatar_url).trim()) ||
      (r.system_banner_url && String(r.system_banner_url).trim())
    )
  );
  return meaningful || list[0] || null;
}
