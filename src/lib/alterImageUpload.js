// Pictures an alter owns (v0.294.0).
//
// uploadAlterImage — one copy of "a file the person picked becomes a stored
// picture": GIF-aware processing (animated GIFs stay raw, stills are
// compressed), saved into local image storage (so it is backed up and
// copied to the app's private files like every picture), and filed into the
// alter's own asset folder. The pencil form's avatar / banner / background
// uploads and the Alter info list all use it.
//
// The alter's Pictures (the Alter info list) are the ImageAsset rows they
// own (`owner_alter_id`). addAlterPicture adds one; releaseAlterPicture
// takes it out of their Pictures without deleting the image — it stays in
// the asset library.

import { base44 } from "@/api/base44Client";
import { isLocalMode } from "@/lib/storageMode";
import { saveLocalImage, createLocalImageUrl, processUploadedImage } from "@/lib/localImageStorage";
import { registerAlterUpload } from "@/lib/assetFolders";

export const PICTURE_ROLE = "picture";

export function largeGifWarning({ isGif, sizeKB }) {
  if (!isGif || !(sizeKB > 3000)) return null;
  return `That's a large GIF (${(sizeKB / 1024).toFixed(1)}MB) — it'll grow your storage and backups.`;
}

export async function uploadAlterImage(file, { alterId = null, role = "avatar", prefix = role, maxDim = 512, quality = 0.82, register = true } = {}) {
  const { dataUrl, isGif, sizeKB } = await processUploadedImage(file, maxDim, quality);
  let url = dataUrl;
  if (isLocalMode()) {
    const imageId = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await saveLocalImage(imageId, dataUrl);
    url = createLocalImageUrl(imageId);
    if (register && alterId) registerAlterUpload({ url, alterId, role });
  }
  return { url, isGif, sizeKB };
}

const notifyAssets = () => {
  try { window.dispatchEvent(new Event("symphony-assets-changed")); } catch { /* SSR */ }
};

// Make `url` one of this alter's Pictures. A picture already in the library
// that nobody owns is adopted; one owned by another alter is left with them
// (returns { taken: true }) — pictures are never moved between alters
// silently.
export async function addAlterPicture({ alterId, url, name = "" }) {
  if (!alterId || !url) return { added: false };
  const existing = (await base44.entities.ImageAsset.filter({ image_url: url })) || [];
  const mine = existing.find((a) => String(a.owner_alter_id) === String(alterId));
  if (mine) return { added: false, asset: mine };
  const unowned = existing.find((a) => !a.owner_alter_id);
  if (unowned) {
    const asset = await base44.entities.ImageAsset.update(unowned.id, { owner_alter_id: alterId, owner_role: unowned.owner_role || PICTURE_ROLE });
    notifyAssets();
    return { added: true, asset };
  }
  if (existing.length) return { added: false, taken: true };
  const asset = await base44.entities.ImageAsset.create({
    name: name || `Picture ${new Date().toLocaleDateString()}`,
    image_url: url,
    owner_alter_id: alterId,
    owner_role: PICTURE_ROLE,
    folder: "",
    created_date: new Date().toISOString(),
  });
  notifyAssets();
  return { added: true, asset };
}

// Out of the alter's Pictures, still in the library.
export async function releaseAlterPicture(assetId) {
  if (!assetId) return;
  await base44.entities.ImageAsset.update(assetId, { owner_alter_id: null });
  notifyAssets();
}
