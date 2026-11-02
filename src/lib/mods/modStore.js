// Installed mods and their data, in the app database.
//
//   ModPackage — one row per installed mod: the checked manifest, its code,
//                which permissions the person granted, and whether it's on.
//   ModData    — every record any mod saves: { mod_id, collection, …fields }.
//
// Both are ordinary entities, so they ride encryption, the native file
// mirror, device sync, Recent changes and backups (the "mods" export
// category in DataBackupRestore.jsx) like everything else. Removing a mod
// never removes its data; only deleteModData does, and it saves a copy first.

import { localEntities } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { builtinUpdateFor, loadBuiltinMod } from "@/lib/mods/builtinMods";
import { MOD_FORMAT, MOD_FORMAT_VERSION } from "@/lib/mods/modPackage";

export const MODS_QUERY_KEY = ["mods"];

export async function listMods() {
  const rows = await localEntities.ModPackage.list();
  return rows.filter((r) => r && r.mod_id);
}

export async function findMod(modId) {
  const rows = await localEntities.ModPackage.filter({ mod_id: modId });
  return rows[0] || null;
}

// Install a parsed mod (modPackage.parseModFile) with the permissions the
// person ticked. Installing a mod that's already here updates it in place:
// its data is untouched, and it stays on or off as it was.
export async function installMod(parsed, grantedPermissions) {
  const existing = await findMod(parsed.mod_id);
  // "data:read" is never granted by a tick at install: the person allows it
  // on the mod's card after reading the risks (grantDataAccess). An update
  // keeps it only if it was already allowed AND the update doesn't ask for
  // more kinds of records than before — anything new needs a fresh yes.
  const requested = parsed.dataScopes || [];
  const scopesGrew = requested.some((x) => !(existing?.requested_data_scopes || existing?.data_scopes || []).includes(x));
  const keepData = !!existing && (existing.granted_permissions || []).includes("data:read")
    && parsed.permissions.includes("data:read") && !scopesGrew;
  const granted = (grantedPermissions || [])
    .filter((p) => parsed.permissions.includes(p) && p !== "data:read")
    .concat(keepData ? ["data:read"] : []);
  const fields = {
    mod_id: parsed.mod_id,
    name: parsed.name,
    version: parsed.version,
    author: parsed.author,
    description: parsed.description,
    homepage: parsed.homepage,
    permissions: parsed.permissions,
    granted_permissions: granted,
    requested_data_scopes: requested,
    data_scopes: keepData ? (existing.data_scopes || []).filter((x) => requested.includes(x)) : [],
    pages: parsed.pages,
    code: parsed.code,
    // "builtin" = from the app's mod library (updates arrive with the app);
    // "file" = installed from a shared .osmod file.
    source: parsed.source === "builtin" ? "builtin" : "file",
  };
  if (existing) return localEntities.ModPackage.update(existing.id, fields);
  return localEntities.ModPackage.create({ ...fields, enabled: true, installed_at: new Date().toISOString() });
}

// Built-in mods update with the app: when this version ships a different
// copy than the one installed, swap the code in place. Its data, on/off state
// and granted permissions stay; a permission the new version newly asks for
// is NOT granted — the person ticks it on the Mods page.
let builtinSyncRunning = false;
export async function syncBuiltinMods(mods) {
  if (builtinSyncRunning) return 0;
  builtinSyncRunning = true;
  let updated = 0;
  try {
    for (const mod of mods || []) {
      if (!builtinUpdateFor(mod)) continue;
      try {
        const parsed = await loadBuiltinMod(mod.mod_id);
        await installMod(parsed, mod.granted_permissions || []);
        updated++;
      } catch { /* keep the installed copy; try again next launch */ }
    }
  } finally {
    builtinSyncRunning = false;
  }
  return updated;
}

export function setModEnabled(mod, enabled) {
  return localEntities.ModPackage.update(mod.id, { enabled: !!enabled });
}

export function setModPermissions(mod, granted) {
  // data:read can be taken away here but only given through grantDataAccess.
  const hadData = (mod.granted_permissions || []).includes("data:read");
  const next = (granted || []).filter((p) => (mod.permissions || []).includes(p) && p !== "data:read");
  if (hadData && (granted || []).includes("data:read")) next.push("data:read");
  return localEntities.ModPackage.update(mod.id, {
    granted_permissions: next,
    ...(hadData && !next.includes("data:read") ? { data_scopes: [] } : {}),
  });
}

// The person's informed yes to "read your records", for the kinds they
// ticked on the consent sheet (Mods page). Only kinds the mod asked for.
export function grantDataAccess(mod, scopes) {
  const wanted = (scopes || []).filter((x) => (mod.requested_data_scopes || []).includes(x));
  if (!(mod.permissions || []).includes("data:read")) throw new Error("This mod doesn't ask to read your records.");
  if (!wanted.length) throw new Error("Tick at least one kind of record, or cancel.");
  const granted = new Set(mod.granted_permissions || []);
  granted.add("data:read");
  return localEntities.ModPackage.update(mod.id, {
    granted_permissions: [...granted],
    data_scopes: wanted,
    data_consent_at: new Date().toISOString(),
  });
}

export function revokeDataAccess(mod) {
  return localEntities.ModPackage.update(mod.id, {
    granted_permissions: (mod.granted_permissions || []).filter((p) => p !== "data:read"),
    data_scopes: [],
  });
}

// Removes the mod itself. Its saved data stays (and comes back to life if
// the mod is installed again); Recent changes keeps the removed package too.
export function uninstallMod(mod) {
  return localEntities.ModPackage.delete(mod.id);
}

export async function listModData(modId) {
  return localEntities.ModData.filter({ mod_id: modId });
}

async function saveJsonCopy(obj, filename, { mimeType = "application/json", title = "Mod data copy", dialogTitle = "Save mod data" } = {}) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: mimeType });
  const { isNative } = await import("@/lib/platform");
  if (isNative()) {
    try {
      const { saveBlobToPublicDownloads } = await import("@/lib/nativeMediaStoreSave");
      const res = await saveBlobToPublicDownloads({ blob, filename, mimeType, subdir: "Oceans Symphony" });
      if (res?.result === "filesystem") return { result: "downloaded" };
    } catch { /* fall through to the share chain */ }
  }
  const { shareFile } = await import("@/lib/shareFile");
  return shareFile({ blob, filename, title, dialogTitle, prefer: "download" });
}

// Saves the mod ITSELF as a .osmod file (the same file you install from), so a
// mod that was imported and later lost can be installed again or shared.
// Rebuilt from the installed copy: manifest + code. (From ShineSpark330's
// Apeiron Zetta fork.)
export async function exportModPackage(mod) {
  const pkg = {
    format: MOD_FORMAT,
    formatVersion: MOD_FORMAT_VERSION,
    id: mod.mod_id,
    name: mod.name,
    version: mod.version || "1.0.0",
    author: mod.author || "",
    description: mod.description || "",
    ...(mod.homepage ? { homepage: mod.homepage } : {}),
    permissions: mod.permissions || [],
    pages: mod.pages || [],
    code: mod.code || "",
  };
  return saveJsonCopy(pkg, `${mod.mod_id}-${pkg.version}.osmod`, {
    mimeType: "application/octet-stream", title: "Mod", dialogTitle: "Save mod",
  });
}

const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

export async function exportModData(modId, modName) {
  const records = await listModData(modId);
  return saveJsonCopy(
    { kind: "oceans-symphony-mod-data", mod_id: modId, mod_name: modName || modId, exported_at: new Date().toISOString(), records },
    `mod-data-${modId}-${stamp()}.json`
  );
}

// Deletes everything a mod saved — only ever from an explicit button, and
// only after a copy is saved. A cancelled or failed save stops the delete.
export async function deleteModData(modId, modName) {
  const saved = await exportModData(modId, modName);
  if (!saved || !["downloaded", "shared", "filesystem"].includes(saved.result)) {
    return { deleted: 0, saved: false };
  }
  const records = await listModData(modId);
  for (const r of records) await localEntities.ModData.delete(r.id);
  return { deleted: records.length, saved: true };
}

export function useMods() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: MODS_QUERY_KEY, queryFn: listMods, staleTime: 30_000 });
  const refresh = useCallback(() => qc.invalidateQueries({ queryKey: MODS_QUERY_KEY }), [qc]);
  return { mods: query.data || [], isLoading: query.isLoading, refresh };
}
