// The writes a front-conflict answer makes (see src/lib/frontConflicts.js).
// Pure, no app imports — tested by scripts/test-sync-merge.mjs.

// Pure: the writes one answer makes. Returned as [{ id, patch }].
export function planFrontResolution(choice, { theirs = [], mine = [], now }) {
  const out = [];
  const end = { is_active: false, end_time: now, sync_demoted: null };
  if (choice === "mine") {
    for (const s of theirs) out.push({ id: s.id, patch: { ...end, is_primary: !!s._wasPrimary } });
    for (const s of mine) out.push({ id: s.id, patch: { revived_at: now } });
  } else if (choice === "theirs") {
    for (const s of mine) out.push({ id: s.id, patch: { is_active: false, end_time: now } });
    const anyPrimary = theirs.some((s) => s._wasPrimary);
    theirs.forEach((s, i) => out.push({ id: s.id, patch: {
      is_active: true, end_time: null, sync_demoted: null, revived_at: now,
      // Keep their primary; if none of theirs had one, the first leads.
      is_primary: anyPrimary ? !!s._wasPrimary : i === 0,
    } }));
  } else if (choice === "both") {
    // Their primary leads. (Dropping OUR flag is a real change that
    // travels; dropping theirs wouldn't — their placeholder copy already
    // reads false here, so the other device would never hear about it.)
    const anyPrimary = theirs.some((s) => s._wasPrimary);
    for (const s of theirs) out.push({ id: s.id, patch: {
      is_active: true, end_time: null, sync_demoted: null, revived_at: now, is_primary: !!s._wasPrimary,
    } });
    for (const s of mine) out.push({ id: s.id, patch: anyPrimary && s.is_primary ? { revived_at: now, is_primary: false } : { revived_at: now } });
  } else {
    throw new Error(`Unknown choice: ${choice}`);
  }
  return out;
}
