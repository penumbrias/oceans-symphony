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

function sequentialKey(alterId, role) {
  return `symphony_img_rotation_idx_${alterId}_${role}`;
}

function pickForSession(cacheKey, pool, mode, alterId, role) {
  if (_pickCache.has(cacheKey)) return _pickCache.get(cacheKey);

  let picked;
  if (mode === "sequential") {
    const lsKey = sequentialKey(alterId, role);
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

export function useRotatingImageUrl({ alterId, role, mode, fallbackUrl }) {
  const rotationOn = (mode === "random" || mode === "sequential") && !!alterId && !!role;

  const { data: pool = [] } = useQuery({
    queryKey: ["imageAssets", "pool", alterId, role],
    queryFn: () => base44.entities.ImageAsset.filter({ owner_alter_id: alterId, owner_role: role }),
    enabled: rotationOn,
  });

  if (!rotationOn || pool.length < 2) return fallbackUrl;

  const urls = pool.map((a) => a.image_url).filter(Boolean);
  if (urls.length < 2) return fallbackUrl;

  const cacheKey = `${alterId}:${role}`;
  return pickForSession(cacheKey, urls, mode, alterId, role);
}
