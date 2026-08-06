// Picks one image from a per-alter image pool to display, either randomly
// or in sequence, ONCE per real page load — every component/render/in-app
// navigation on the same load shows the same pick for a given alter+role,
// and only a fresh browser reload (or app boot) produces a new pick. Purely
// additive: callers pass the result into their existing useResolvedAvatarUrl()
// call exactly as they'd pass alter.avatar_url — this hook only SELECTS,
// it doesn't resolve.

import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

// Lazily populated once per key per JS module lifetime (mirrors the
// resolve-once pattern in src/lib/imageUrlResolver.js's own module-level
// cache) — this is what keeps a pick stable for the rest of the session.
const _pickCache = new Map();

function sequentialKey(scope) {
  return `symphony_img_rotation_idx_${scope}`;
}

function pickForSession(cacheKey, pool, mode) {
  if (_pickCache.has(cacheKey)) return _pickCache.get(cacheKey);

  let picked;
  if (mode === "sequential") {
    const lsKey = sequentialKey(cacheKey);
    let index = 0;
    try {
      const raw = parseInt(localStorage.getItem(lsKey), 10);
      if (Number.isFinite(raw) && raw >= 0) index = raw;
    } catch { /* localStorage unavailable */ }
    picked = pool[index % pool.length];
    try { localStorage.setItem(lsKey, String((index + 1) % pool.length)); } catch { /* storage full/disabled */ }
  } else {
    picked = pool[Math.floor(Math.random() * pool.length)];
  }
  _pickCache.set(cacheKey, picked);
  return picked;
}

// Which Alter field holds the linked-folder name per role — mirrors
// AlterImagePoolManager's ROLE_FOLDER_FIELD.
const ROLE_FOLDER_FIELD = { avatar: "avatar_pool_folder", background: "background_pool_folder" };

// `folder` + `scope` generalize this past alters: pass a folder name and a
// stable scope string (e.g. "wallpaper") and the same rotation drives any
// surface. Alter callers are unchanged — they still pass alterId/role and
// get the per-role pool_folder lookup.
export function useRotatingImageUrl({ alterId, role, mode, fallbackUrl, alter = null, folder = "", scope = "" }) {
  const directFolder = (folder || "").trim();
  const rotationOn = (mode === "random" || mode === "sequential")
    && (!!directFolder || (!!alterId && !!role));

  // v0.87.5: honour folder-linked pools. When the alter has a folder name
  // in the per-role pool_folder field, the pool is that folder's contents
  // (any ImageAsset with `folder === X`). Falls back to owner-tagged rows
  // when the field is empty (pre-link behaviour). Callers that already pass
  // in `alter` get the folder check for free; the rest can also pass alter
  // to enable it — no behaviour change if alter is not provided.
  const linkedFolder = directFolder || (alter ? (alter[ROLE_FOLDER_FIELD[role]] || "").trim() : "");

  const { data: pool = [] } = useQuery({
    queryKey: ["imageAssets", "pool", scope || `${alterId}:${role}`, linkedFolder || "own"],
    queryFn: () => linkedFolder
      ? base44.entities.ImageAsset.filter({ folder: linkedFolder })
      : base44.entities.ImageAsset.filter({ owner_alter_id: alterId, owner_role: role }),
    enabled: rotationOn,
  });

  if (!rotationOn || pool.length < 2) return fallbackUrl;

  const urls = pool.map((a) => a.image_url).filter(Boolean);
  if (urls.length < 2) return fallbackUrl;

  const cacheKey = scope || `${alterId}:${role}`;
  return pickForSession(cacheKey, urls, mode);
}
