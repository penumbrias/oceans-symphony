#!/usr/bin/env node
// Checks every mod in the app's mod library (mods/library/<id>/):
// the manifest passes the same checks as a shared .osmod file, the folder
// name is the mod's id, and main.js at least parses.
//   node scripts/test-mod-library.mjs
import fs from "node:fs";
import path from "node:path";
import { parseModFile, MOD_FORMAT, MOD_FORMAT_VERSION } from "../src/lib/mods/modPackage.js";

const dir = path.resolve("mods/library");
let failed = 0;
for (const id of fs.readdirSync(dir)) {
  const folder = path.join(dir, id);
  if (!fs.statSync(folder).isDirectory()) continue;
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(folder, "manifest.json"), "utf8"));
    const code = fs.readFileSync(path.join(folder, "main.js"), "utf8");
    const parsed = parseModFile(JSON.stringify({ format: MOD_FORMAT, formatVersion: MOD_FORMAT_VERSION, ...manifest, code }));
    if (parsed.mod_id !== id) throw new Error(`folder is "${id}" but the manifest id is "${parsed.mod_id}"`);
    new Function("symphony", code); // syntax only; nothing runs
    if (!/registerPage\(/.test(code)) throw new Error("main.js never calls symphony.registerPage");
    for (const p of parsed.pages) {
      if (!code.includes(`"${p.id}"`) && !code.includes(`'${p.id}'`)) throw new Error(`page "${p.id}" is never registered`);
    }
    console.log(`ok   ${id} ${parsed.version}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${id}: ${e.message}`);
  }
}
if (failed) { console.log(`${failed} mod(s) failed`); process.exit(1); }
