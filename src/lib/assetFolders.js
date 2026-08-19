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
  song: "Music",
  migrated: "Imported",
};
export const PREFIX_LABELS = {
  avatar: "Alter avatars", fixed: "Repaired images", header: "Headers & banners", bg: "Backgrounds",
  bioimg: "Images in bios", bulletinimg: "Bulletin images", chatimg: "Chat images", commentimg: "Comment images",
  group: "Group images", system: "System avatar & banner", contact: "Contact pictures", location: "Inner-world backgrounds",
  block: "Bio block images", asset: "Library uploads", song: "Music", migrated: "Imported (moved into the store)",
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
  return new Set([...Object.values(map).filter(Boolean), "Other"]);
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
    const rules = resolveAssetRules(rows[0] || null);
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
