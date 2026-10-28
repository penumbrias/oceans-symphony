// The picture the pinned alters bar shows for one alter (v0.300.0).
//
// The bar can show a different picture from the profile picture: the
// pinned bar's settings keep one per alter (`pinned_alters_config.
// pinnedAvatars`, set from the bar's own settings panel or an Image
// widget). Without one, the bar shows the profile picture.

import { base44 } from "@/api/base44Client";

export function barPictureOverride(settingsRow, alterId) {
  const map = settingsRow?.pinned_alters_config?.pinnedAvatars;
  if (!alterId || !map || typeof map !== "object") return "";
  return typeof map[alterId] === "string" ? map[alterId] : "";
}

// What the bar shows: its own picture for this alter, else the avatar.
export function barPictureFor(settingsRow, alter) {
  return barPictureOverride(settingsRow, alter?.id) || alter?.avatar_url || "";
}

// Set (or with "" clear) the bar's picture for one alter, on a fresh read
// of the settings, changing only that one entry.
export async function setBarPicture(alterId, url) {
  if (!alterId) return null;
  const rows = (await base44.entities.SystemSettings.list()) || [];
  const row = rows[0];
  if (!row?.id) throw new Error("Settings aren't ready yet");
  const config = (row.pinned_alters_config && typeof row.pinned_alters_config === "object") ? row.pinned_alters_config : {};
  const map = { ...((config.pinnedAvatars && typeof config.pinnedAvatars === "object") ? config.pinnedAvatars : {}) };
  if (url) map[alterId] = url;
  else delete map[alterId];
  return base44.entities.SystemSettings.update(row.id, { pinned_alters_config: { ...config, pinnedAvatars: map } });
}
