// Appearance presets travel on every sync (owner, Oct 2026: "users'
// appearance presets should always get transferred over across devices").
//
// The rest of the look stays per-device (see deviceSync.js header) — a
// preset is something the person MADE, so it belongs on every device,
// while which one is active stays each device's own choice.
//
// Merge rule — a union that never loses a preset:
//   - a preset only the other device has is added here;
//   - same name, same colours → nothing to do;
//   - same name, different colours → ours keeps the name, theirs is added
//     as "Name (Device)" so both survive and the person picks.
// Sync never deletes, so a preset deleted on one device comes back from
// the other until it is deleted there too — same as every synced record.

export const PRESETS_KEY = "symphony_userCustomPresets";
// ThemeContext's auto-kept "unsaved colours" slot is this device's undo
// buffer, not a preset someone made — it never travels.
const DEVICE_ONLY_PRESETS = new Set(["Unsaved colours (auto-kept)"]);

const parse = (raw) => {
  if (raw && typeof raw === "object") return raw;
  try {
    const v = JSON.parse(raw || "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch { return null; }
};

// Key order must not make two identical presets look different.
const canon = (v) => {
  if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(",")}}`;
  return JSON.stringify(v);
};

const isPreset = (p) => p && typeof p === "object" && (p.light || p.dark);

// Pure: returns { merged, added } or null when nothing changes. A local
// value that isn't readable JSON is left alone (null) — never replaced.
export function mergePresetMaps(localRaw, incomingRaw, fromName = "other device") {
  const local = localRaw == null ? {} : parse(localRaw);
  const incoming = parse(incomingRaw);
  if (!local || !incoming) return null;
  const merged = { ...local };
  const added = [];
  const seen = new Set(Object.values(merged).map(canon));
  for (const [name, preset] of Object.entries(incoming)) {
    if (DEVICE_ONLY_PRESETS.has(name) || !isPreset(preset)) continue;
    const c = canon(preset);
    if (seen.has(c)) continue; // already here (under this or another name)
    let target = name;
    if (merged[target] !== undefined) {
      const base = `${name} (${fromName})`;
      target = base;
      let n = 2;
      while (merged[target] !== undefined) target = `${base} ${n++}`;
    }
    merged[target] = preset;
    seen.add(c);
    added.push(target);
  }
  return added.length ? { merged, added } : null;
}

// Fold a peer's presets into this device's localStorage. Returns the
// names added. Tells ThemeContext to re-read — without that, its next
// save writes its stale copy back over the merged list.
export function mergePeerPresets(settings, fromName) {
  const incoming = settings && typeof settings === "object" ? settings[PRESETS_KEY] : null;
  if (incoming == null) return [];
  let res = null;
  try {
    res = mergePresetMaps(localStorage.getItem(PRESETS_KEY), incoming, fromName);
    if (!res) return [];
    localStorage.setItem(PRESETS_KEY, JSON.stringify(res.merged));
  } catch { return []; }
  try { window.dispatchEvent(new Event("symphony-theme-storage-change")); } catch { /* no window */ }
  return res.added;
}
