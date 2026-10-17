#!/usr/bin/env node
// Packs a mod folder into a single .osmod file people can share.
//
//   node scripts/pack-mod.mjs <mod-folder> [out-file]
//
// The folder holds manifest.json (everything but the code) and main.js (the
// mod's code, one file — bundle it first if you use a bundler). See
// docs/mods.md for the manifest fields and the `symphony` API.
import fs from "node:fs";
import path from "node:path";

const dir = process.argv[2];
if (!dir) {
  console.error("Usage: node scripts/pack-mod.mjs <mod-folder> [out-file]");
  process.exit(1);
}
const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
const code = fs.readFileSync(path.join(dir, "main.js"), "utf8");
const mod = { format: "oceans-symphony-mod", formatVersion: 1, ...manifest, code };
if (!mod.id || !mod.name || !Array.isArray(mod.pages) || !mod.pages.length) {
  console.error("manifest.json needs at least an id, a name and one page.");
  process.exit(1);
}
const out = process.argv[3] || path.join(dir, `${mod.id}-${mod.version || "1.0.0"}.osmod`);
fs.writeFileSync(out, JSON.stringify(mod, null, 2) + "\n");
console.log(`Packed ${mod.name} → ${out}`);
