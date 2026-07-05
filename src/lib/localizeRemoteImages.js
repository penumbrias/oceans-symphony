// Rescue remote-hosted images into permanent LOCAL storage.
//
// Imported avatars (Simply Plural especially, but also PluralKit/OpenPlural
// and hand-pasted URLs) were often stored as plain remote URLs pointing at the
// source app's CDN. When that CDN goes down — e.g. Simply Plural shutting down
// its servers — every such image 404s and the avatar simply disappears, since
// nothing was ever saved on this device.
//
// This downloads each still-reachable remote image and rewrites the record to
// a `/local-image/<id>` URL served from IndexedDB, so it survives forever.
// Idempotent: already-local images are skipped; a shared URL downloads once.
//
// Reachability caveat (surfaced to the user): an image can only be saved while
// its host is still online. Once the CDN is fully gone, an image that only
// ever lived there is unrecoverable from the app — the honest fix then is to
// re-upload, or re-import from a format that EMBEDS image data (OpenPlural /
// Ampersand), not one that only stores URLs (Simply Plural).

import { base44 } from "@/api/base44Client";
import { saveLocalImage, createLocalImageUrl } from "@/lib/localImageStorage";
import { pickPrimarySystemSettings } from "@/lib/systemSettingsSingleton";
import { isNative } from "@/lib/platform";

const isRemoteHttp = (url) => typeof url === "string" && /^https?:\/\//i.test(url);

function newImageId() {
  const rand = (typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `rescued-${rand}`;
}

// Native path: a real HTTP request through Capacitor, which is NOT subject to
// WebView CORS — so on the Play/native build we can pull images down even when
// the CDN doesn't send permissive CORS headers (as long as it's online).
async function fetchViaCapacitor(url) {
  try {
    const { CapacitorHttp } = await import("@capacitor/core");
    const res = await CapacitorHttp.get({ url, responseType: "blob" });
    if (!res || typeof res.status !== "number" || res.status < 200 || res.status >= 300) return null;
    const data = res.data; // base64 string for responseType:"blob"
    if (!data || typeof data !== "string") return null;
    let contentType = "image/png";
    const headers = res.headers || {};
    for (const k of Object.keys(headers)) {
      if (k.toLowerCase() === "content-type" && headers[k]) { contentType = String(headers[k]).split(";")[0].trim(); break; }
    }
    if (!/^image\//i.test(contentType)) contentType = "image/png";
    return `data:${contentType};base64,${data}`;
  } catch {
    return null;
  }
}

// Browser path: standard fetch → data URL. Works when the CDN allows CORS.
async function fetchViaBrowser(url) {
  try {
    const res = await fetch(url, { mode: "cors", credentials: "omit" });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob || !/^image\//i.test(blob.type || "image/")) {
      // Some object stores omit a type — accept anyway, the <img> will sniff it.
      if (blob && blob.size === 0) return null;
    }
    return await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function fetchRemoteImageAsDataUrl(url) {
  if (!isRemoteHttp(url)) return null;
  if (isNative()) {
    const viaNative = await fetchViaCapacitor(url);
    if (viaNative) return viaNative;
  }
  return await fetchViaBrowser(url);
}

// The fields on each entity that can hold an image URL. custom_fields._header_image
// is where alter banners/headers live.
const ALTER_URL_FIELDS = ["avatar_url", "banner_url"];

// Scan → download reachable remotes → rewrite records. Returns a summary the
// UI turns into a message. `onProgress(done, total)` is optional.
export async function localizeRemoteImages({ onProgress } = {}) {
  const cache = new Map(); // remote URL → local URL (dedupe shared images)
  let scanned = 0;   // distinct remote URLs seen
  let localized = 0; // distinct remote URLs successfully saved locally
  let failed = 0;    // distinct remote URLs that couldn't be reached
  let recordsUpdated = 0;

  // Resolve one remote URL to a local URL (download + save once), memoised.
  const resolveOne = async (url) => {
    if (cache.has(url)) return cache.get(url);
    scanned += 1;
    const dataUrl = await fetchRemoteImageAsDataUrl(url);
    if (!dataUrl) { failed += 1; cache.set(url, null); return null; }
    const id = newImageId();
    try {
      await saveLocalImage(id, dataUrl);
      const local = createLocalImageUrl(id);
      localized += 1;
      cache.set(url, local);
      return local;
    } catch {
      failed += 1;
      cache.set(url, null);
      return null;
    }
  };

  // 1) Alters — avatar_url, banner_url, custom_fields._header_image.
  let alters = [];
  try { alters = await base44.entities.Alter.list(); } catch { alters = []; }
  const totalGuess = alters.length + 1;
  let done = 0;

  for (const a of alters) {
    const patch = {};
    for (const f of ALTER_URL_FIELDS) {
      if (isRemoteHttp(a[f])) {
        const local = await resolveOne(a[f]);
        if (local) patch[f] = local;
      }
    }
    const header = a.custom_fields?._header_image;
    if (isRemoteHttp(header)) {
      const local = await resolveOne(header);
      if (local) patch.custom_fields = { ...(a.custom_fields || {}), _header_image: local };
    }
    if (Object.keys(patch).length > 0) {
      try { await base44.entities.Alter.update(a.id, patch); recordsUpdated += 1; } catch { /* keep going */ }
    }
    done += 1;
    onProgress?.(done, totalGuess);
  }

  // 2) System profile — avatar + banner on the primary SystemSettings row.
  try {
    const settingsList = await base44.entities.SystemSettings.list();
    const settings = pickPrimarySystemSettings(settingsList);
    if (settings?.id) {
      const patch = {};
      if (isRemoteHttp(settings.system_avatar_url)) {
        const local = await resolveOne(settings.system_avatar_url);
        if (local) patch.system_avatar_url = local;
      }
      if (isRemoteHttp(settings.system_banner_url)) {
        const local = await resolveOne(settings.system_banner_url);
        if (local) patch.system_banner_url = local;
      }
      if (Object.keys(patch).length > 0) {
        await base44.entities.SystemSettings.update(settings.id, patch);
        recordsUpdated += 1;
      }
    }
  } catch { /* system profile is best-effort */ }
  done += 1;
  onProgress?.(done, totalGuess);

  return { scanned, localized, failed, recordsUpdated };
}
