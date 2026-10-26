// The mod library: mods that ship inside the app (mods/library/<id>/).
//
// A built-in mod is an ordinary mod — same manifest, same main.js, same
// sandbox and broker as a file someone shares — it just arrives with the app
// instead of from a file. Adding one from the Mods page installs it through
// installMod like any other, marked `source: "builtin"`, so the person still
// ticks its permissions, can switch it off, and keeps its data if it's
// removed. Nothing is installed until the person asks.
//
// Manifests are bundled (small, needed to list the library); each mod's code
// is loaded only when it's added or updated.
//
// To add a mod to the library: make a folder in mods/library with
// manifest.json + main.js (docs/mods.md, "Getting into the mod library").

import { parseModFile, MOD_FORMAT, MOD_FORMAT_VERSION } from "@/lib/mods/modPackage";

const MANIFESTS = import.meta.glob("/mods/library/*/manifest.json", { eager: true, import: "default" });
const CODE = import.meta.glob("/mods/library/*/main.js", { query: "?raw", import: "default" });

const folderOf = (path) => path.split("/").slice(-2, -1)[0];

// [{ mod_id, name, version, description, permissions, pages, … }] — no code.
export const BUILTIN_MODS = Object.entries(MANIFESTS)
  .map(([path, manifest]) => {
    try {
      // parseModFile insists on code; a placeholder lets it check the rest.
      const parsed = parseModFile(JSON.stringify({ format: MOD_FORMAT, formatVersion: MOD_FORMAT_VERSION, ...manifest, code: "//" }));
      if (parsed.mod_id !== folderOf(path)) return null;
      const { code, ...rest } = parsed;
      return rest;
    } catch {
      return null;
    }
  })
  .filter(Boolean)
  .sort((a, b) => a.name.localeCompare(b.name));

export function builtinMod(modId) {
  return BUILTIN_MODS.find((m) => m.mod_id === modId) || null;
}

// The full checked mod (manifest + code), ready for installMod.
export async function loadBuiltinMod(modId) {
  const manifest = Object.entries(MANIFESTS).find(([p]) => folderOf(p) === modId)?.[1];
  const loader = Object.entries(CODE).find(([p]) => folderOf(p) === modId)?.[1];
  if (!manifest || !loader) throw new Error("That mod isn't in this version of the app.");
  const code = await loader();
  return { ...parseModFile(JSON.stringify({ format: MOD_FORMAT, formatVersion: MOD_FORMAT_VERSION, ...manifest, code })), source: "builtin" };
}

// Is the installed copy of a built-in mod older (or different) than the one
// this app version ships? File-installed mods with the same id are left alone.
export function builtinUpdateFor(installed) {
  if (!installed || installed.source !== "builtin") return null;
  const shipped = builtinMod(installed.mod_id);
  if (!shipped || shipped.version === installed.version) return null;
  return shipped;
}
