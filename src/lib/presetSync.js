// Saved appearance presets travel with sync (owner, Oct 2026: "users'
// appearance presets should always get transferred over across devices").
//
// The presets LIBRARY (symphony_userCustomPresets) is shared like saved
// widget styles are. Which preset each device is USING stays per device —
// the desktop and the phone are still allowed to look different.
//
// Merge rules (never loses a preset):
//   - a preset this device doesn't have is added;
//   - the same preset on both sides is left alone;
//   - both sides stamped (`_ut`, set on every save since this change):
//     the newer edit wins — it's the same preset, edited on the other
//     device;
//   - otherwise (older presets carry no stamp, so "newer" is unknowable)
//     ours stays and theirs is kept beside it as "Name (from Device)";
//   - a preset deleted HERE after the incoming copy was last saved stays
//     deleted (REMOVED_KEY), so the other device can't keep sending it
//     back. Deletions never travel: sync never deletes.
//   - the auto-kept "Unsaved colours" stash is this device's safety net,
//     never sent across.
//
// Pure functions + a thin localStorage wrapper; tested by
// scripts/test-preset-sync.mjs.

export const PRESETS_KEY = "symphony_userCustomPresets";
export const REMOVED_KEY = "symphony_userCustomPresets_removed";
export const UNSAVED_STASH = "Unsaved colours (auto-kept)";

const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);

// Stable stringify (key order independent) for "is it the same preset?".
function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (isObj(v)) {
    return `{${Object.keys(v).filter((k) => k !== "_ut").sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(",")}}`;
  }
  return JSON.stringify(v === undefined ? null : v);
}
export const samePreset = (a, b) => stable(a) === stable(b);

// Returns { presets, added, updated, copied } — `presets` is a NEW object;
// the inputs are never mutated.
export function mergePresetLibraries(local, incoming, { deviceName = "another device", removed = {} } = {}) {
  const out = isObj(local) ? { ...local } : {};
  const result = { presets: out, added: 0, updated: 0, copied: 0 };
  if (!isObj(incoming)) return result;
  const from = String(deviceName || "another device").trim() || "another device";

  for (const [name, theirs] of Object.entries(incoming)) {
    if (!isObj(theirs) || name === UNSAVED_STASH) continue;
    const theirTime = Number(theirs._ut) || 0;
    const ours = out[name];

    if (ours === undefined) {
      // Deleted here after their copy was saved → stays deleted.
      const removedAt = Number(removed?.[name]) || 0;
      if (removedAt && removedAt >= theirTime) continue;
      out[name] = theirs;
      result.added += 1;
      continue;
    }
    if (samePreset(ours, theirs)) continue;

    const ourTime = Number(ours?._ut) || 0;
    if (ourTime && theirTime) {
      if (theirTime > ourTime) { out[name] = theirs; result.updated += 1; }
      continue;
    }

    // Unknowable which is newer: keep both. Reuse an identical copy so a
    // repeat sync adds nothing.
    const base = `${name} (from ${from})`;
    let copyName = base;
    let n = 2;
    let exists = false;
    while (out[copyName] !== undefined) {
      if (samePreset(out[copyName], theirs)) { exists = true; break; }
      copyName = `${base} ${n++}`;
    }
    if (exists) continue;
    out[copyName] = theirs;
    result.copied += 1;
  }
  return result;
}

const readJson = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    const v = raw ? JSON.parse(raw) : fallback;
    return isObj(v) ? v : fallback;
  } catch { return fallback; }
};

// Merge another device's presets into this one. Best-effort: a preset
// problem never fails a data sync. Returns how many presets changed here.
export function applyIncomingPresets(incoming, deviceName) {
  if (!isObj(incoming)) return 0;
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    let local = {};
    try { local = raw ? JSON.parse(raw) : {}; } catch {
      // Unreadable local presets: don't write over them.
      return 0;
    }
    if (!isObj(local)) return 0;
    const { presets, added, updated, copied } = mergePresetLibraries(local, incoming, {
      deviceName, removed: readJson(REMOVED_KEY, {}),
    });
    const changed = added + updated + copied;
    if (!changed) return 0;
    localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
    // ThemeContext holds presets in state and writes them back on every
    // theme change — tell it to re-read, or it would undo this merge.
    try { window.dispatchEvent(new Event("symphony-theme-storage-change")); } catch { /* no window */ }
    return changed;
  } catch {
    return 0;
  }
}

// Remember a deletion on THIS device so sync doesn't bring it straight back.
export function recordPresetRemoved(name) {
  try {
    const removed = readJson(REMOVED_KEY, {});
    removed[name] = Date.now();
    localStorage.setItem(REMOVED_KEY, JSON.stringify(removed));
  } catch { /* storage off */ }
}

// Saving a preset under a name clears an earlier deletion of that name.
export function clearPresetRemoved(name) {
  try {
    const removed = readJson(REMOVED_KEY, {});
    if (!(name in removed)) return;
    delete removed[name];
    localStorage.setItem(REMOVED_KEY, JSON.stringify(removed));
  } catch { /* storage off */ }
}
