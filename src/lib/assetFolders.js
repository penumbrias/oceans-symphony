import { pickPrimarySystemSettings } from "@/lib/systemSettingsSingleton";
// Asset-library auto-organisation (v0.192.1) — ONE map for the library
// page and the picker, and the user's overrides on top.
//
// Every stored image id starts with a prefix from its upload path
// (avatar-, header-, bg-, group-, system-, contact-, …). Images without
// an explicit folder are filed by that prefix. Images uploaded FOR an alter
// carry owner_alter_id and show in that alter's "👤 Name" folder instead
// (unless the user turns per-alter filing off).
//
// User rules live in SystemSettings.asset_folder_rules:
//   { folders: { [prefix]: "Folder name" | "" (→ Other) },
//     perAlter: true|false,            // file alter uploads under 👤 Name
//     alterRoleSplit: true|false }     // 👤 Name · Avatars / · Banners / …
// Absent = the defaults below. The library's Organisation panel edits it.

export const DEFAULT_PREFIX_FOLDERS = {
  avatar: "Avatars", fixed: "Avatars",
  header: "Headers & banners",
  bg: "Backgrounds",
  bioimg: "Bio images",
  bulletinimg: "Bulletin images",
  chatimg: "Chat images",
  commentimg: "Comment images",
  group: "Group images",
  system: "System profile",
  contact: "Contacts",
  location: "Inner world",
  block: "Bio blocks",
  asset: "Library uploads",
  song: "Songs Audio",
  // Videos, audio and other files — uploaded into Assets or attached in chat
  // (chatfile-) — are filed by their TYPE into Videos / Audio / Others (see
  // kindFolderFor), so these two have no folder of their own any more.
  file: "",
  chatfile: "",
  migrated: "Imported",
};
export const PREFIX_LABELS = {
  avatar: "Alter avatars", fixed: "Repaired images", header: "Headers & banners", bg: "Backgrounds",
  bioimg: "Images in bios", bulletinimg: "Bulletin images", chatimg: "Chat images", commentimg: "Comment images",
  group: "Group images", system: "System avatar & banner", contact: "Contact pictures", location: "Inner-world backgrounds",
  block: "Bio block images", asset: "Library uploads", song: "Songs (song widgets & profile songs)",
  file: "Files (uploads)", chatfile: "Files (from chat)", migrated: "Imported (moved into the store)",
};
export const ROLE_LABELS = { avatar: "Avatars", header: "Banners", background: "Backgrounds" };

export function resolveAssetRules(settingsRow) {
  const r = settingsRow?.asset_folder_rules && typeof settingsRow.asset_folder_rules === "object" ? settingsRow.asset_folder_rules : {};
  const folders = { ...DEFAULT_PREFIX_FOLDERS };
  if (r.folders && typeof r.folders === "object") {
    for (const [k, v] of Object.entries(r.folders)) if (typeof v === "string") folders[k] = v.trim();
  }
  return {
    folders,
    perAlter: r.perAlter !== false,
    alterRoleSplit: r.alterRoleSplit === true,
  };
}

export function prefixOf(id) {
  return String(id || "").split("-")[0];
}

// Folder for a stored image id under the given rules.
export function autoFolderFor(id, rules) {
  const map = (rules && rules.folders) || DEFAULT_PREFIX_FOLDERS;
  const name = map[prefixOf(id)];
  return name === undefined ? "Other" : (name || "Other");
}

// All auto folder names (for "reserved name" checks).
export function autoFolderNames(rules) {
  const map = (rules && rules.folders) || DEFAULT_PREFIX_FOLDERS;
  return new Set([...Object.values(map).filter(Boolean), "Other", ...BUILT_IN_KIND_FOLDERS, UNORGANIZED_FOLDER]);
}

// Built-in folders by file TYPE (from ShineSpark330's fork): every video in
// Videos, audio in Audio, any other file in Others — never mixed in with
// the pictures. Songs from a song widget / profile song have their own.
export const VIDEOS_FOLDER = "Videos";
export const AUDIO_FOLDER = "Audio";
export const OTHERS_FOLDER = "Others";
export const SONGS_AUDIO_FOLDER = "Songs Audio";
// Where a deleted folder's files go when the person keeps them.
export const UNORGANIZED_FOLDER = "Unorganized";
export const BUILT_IN_KIND_FOLDERS = [VIDEOS_FOLDER, AUDIO_FOLDER, OTHERS_FOLDER];
// The old shared folder name, still honoured if someone typed it as a rule.
const LEGACY_FILES_FOLDER = "Files & videos";

export function kindFolderFor(kind, id) {
  if (kind === "video") return VIDEOS_FOLDER;
  if (kind === "audio") return String(id || "").startsWith("song-") ? SONGS_AUDIO_FOLDER : AUDIO_FOLDER;
  return OTHERS_FOLDER;
}

// Where a stored item with no folder of its own is filed: pictures by their
// upload path; videos, audio and files by their type.
export function autoFolderForItem(id, kind, rules) {
  const name = autoFolderFor(id, rules);
  if (kind && kind !== "image" && (name === "Other" || name === LEGACY_FILES_FOLDER)) return kindFolderFor(kind, id);
  return name;
}

// The folder a record itself names. Songs used to be saved into a folder
// called "Audio", which is now the built-in folder for other audio — those
// go to the songs folder instead.
export function explicitFolderOf(asset, id, rules) {
  const f = (asset?.folder || "").trim();
  if (f === AUDIO_FOLDER && String(id || "").startsWith("song-")) return autoFolderFor(id, rules) || SONGS_AUDIO_FOLDER;
  return f;
}

export const ALTER_FOLDER_PREFIX = "👤 ";
// The 👤 folder an owned asset files into (optionally split by role).
export function alterFolderName(alterName, role, rules) {
  const base = `${ALTER_FOLDER_PREFIX}${alterName || "Unknown alter"}`;
  if (rules?.alterRoleSplit && role && ROLE_LABELS[role]) return `${base} · ${ROLE_LABELS[role]}`;
  return base;
}

// File an image an alter just uploaded (avatar / header / background)
// into that alter's own folder by registering an owned ImageAsset for it.
// No-op when per-alter filing is off, when there's no alter id yet (a
// brand-new alter being created), or if a record already exists.
export async function registerAlterUpload({ url, alterId, role, name = "" }) {
  if (!url || !alterId) return;
  try {
    const { base44 } = await import("@/api/base44Client");
    const rows = await base44.entities.SystemSettings.list();
    const rules = resolveAssetRules(pickPrimarySystemSettings(rows) || null);
    if (!rules.perAlter) return;
    const existing = await base44.entities.ImageAsset.filter({ image_url: url });
    if (existing && existing.length) return;
    await base44.entities.ImageAsset.create({
      name: name || `${ROLE_LABELS[role] || "Image"} ${new Date().toLocaleDateString()}`,
      image_url: url,
      owner_alter_id: alterId,
      owner_role: role || "avatar",
      folder: "",
      created_date: new Date().toISOString(),
    });
    try { window.dispatchEvent(new Event("symphony-assets-changed")); } catch { /* SSR */ }
  } catch { /* filing is best-effort; the image itself is already saved */ }
}
