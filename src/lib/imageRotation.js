// Picks one image from a per-alter image pool to display, either randomly
// or in sequence, ONCE per real page load — every component/render/in-app
// navigation on the same load shows the same pick for a given alter+role,
// and only a fresh browser reload (or app boot) produces a new pick. Purely
// additive: callers pass the result into their existing useResolvedAvatarUrl()
// call exactly as they'd pass alter.avatar_url — this hook only SELECTS,
// it doesn't resolve.
//
// A pick that can't be shown no longer blanks the picture for the rest of
// the session. A pool entry whose picture isn't stored on this device (a
// library row left pointing at a deleted picture, a song filed in the
// linked folder, a picture still being put back) is skipped and another
// pool image is shown instead — or the main avatar when none of them can
// be. Pull-to-refresh doesn't reload the page, so before this a bad random
// pick stuck until the app was fully restarted ("the app keeps eating my
// profile pictures … they reappear later"). Nothing stored is touched: the
// skip list lives in memory only and clears itself when the picture lands.

import { useEffect, useReducer } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { isLocalImageUrl, getLocalImageId, readLocalImage } from "@/lib/localImageStorage";

// Lazily populated once per key per JS module lifetime (mirrors the
// resolve-once pattern in src/lib/imageUrlResolver.js's own module-level
// cache) — this is what keeps a pick stable for the rest of the session.
const _pickCache = new Map();

// Pool URLs whose picture was looked up and is NOT stored on this device.
// Only "not stored" lands here — a store that can't be read right now
// (busy/closed IndexedDB) is left to useResolvedAvatarUrl's retries, since
// every other picture would fail the same way.
const _unreadable = new Set();

function sequentialKey(scope) {
  return `symphony_img_rotation_idx_${scope}`;
}

function pickForSession(cacheKey, pickKey, pool, mode) {
  const usable = pool.filter((u) => !_unreadable.has(u));
  if (usable.length === 0) return null;

  // A cached pick stays only while it's still in the pool and still
  // showable — otherwise pick again from what is.
  if (_pickCache.has(pickKey) && usable.includes(_pickCache.get(pickKey))) {
    return _pickCache.get(pickKey);
  }
  const replacing = _pickCache.has(pickKey);

  let picked;
  if (mode === "sequential") {
    const lsKey = sequentialKey(cacheKey);
    let index = 0;
    try {
      const raw = parseInt(localStorage.getItem(lsKey), 10);
      if (Number.isFinite(raw) && raw >= 0) index = raw;
    } catch { /* localStorage unavailable */ }
    // Walk forward from the stored index to the next showable image.
    for (let i = 0; i < pool.length; i++) {
      const candidate = pool[(index + i) % pool.length];
      if (!_unreadable.has(candidate)) { picked = candidate; break; }
    }
    // Advance the stored index once per load — a replacement pick after a
    // skip must not move the sequence on a second time.
    if (!replacing) {
      try { localStorage.setItem(lsKey, String((index + 1) % pool.length)); } catch { /* storage full/disabled */ }
    }
  } else {
    picked = usable[Math.floor(Math.random() * usable.length)];
  }
  _pickCache.set(pickKey, picked);
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
  const [, rerender] = useReducer((x) => x + 1, 0);
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

  // Songs, videos and files can share a folder with pictures — never pick one.
  const urls = rotationOn
    ? (pool || []).filter((a) => a && a.image_url && (!a.kind || a.kind === "image")).map((a) => a.image_url)
    : [];
  const cacheKey = scope || `${alterId}:${role}`;
  // The pick is remembered per pool source too, so a surface reading the
  // alter's own pool and one reading its linked folder can't keep
  // replacing each other's pick.
  const pickKey = `${cacheKey}|${linkedFolder || "own"}`;
  const picked = urls.length >= 2 ? pickForSession(cacheKey, pickKey, urls, mode) : null;

  // Check the pick is actually stored here; if not, skip it and re-pick.
  useEffect(() => {
    if (!picked || !isLocalImageUrl(picked)) return undefined;
    let cancelled = false;
    readLocalImage(getLocalImageId(picked)).then((data) => {
      if (cancelled) return;
      const present = data instanceof Blob || (typeof data === "string" && !!data);
      if (!present) { _unreadable.add(picked); rerender(); }
    }).catch(() => { /* couldn't look — not the same as missing; leave it */ });
    return () => { cancelled = true; };
  }, [picked]);

  // A skipped picture that lands later (restored, synced, re-imported)
  // becomes pickable again.
  // Every mounted copy checks its OWN pool: the first listener to run
  // clears the shared skip list, so "was it in the list" can't be the test.
  const urlsKey = urls.join("\n");
  useEffect(() => {
    if (!rotationOn) return undefined;
    const onSaved = (e) => {
      const id = e?.detail?.id;
      if (!id) return;
      let mine = false;
      for (const u of urlsKey.split("\n")) {
        if (isLocalImageUrl(u) && getLocalImageId(u) === id) { _unreadable.delete(u); mine = true; }
      }
      if (mine && !picked) rerender();
    };
    window.addEventListener("symphony-local-image-saved", onSaved);
    return () => window.removeEventListener("symphony-local-image-saved", onSaved);
  }, [rotationOn, picked, urlsKey]);

  return picked || fallbackUrl;
}
