#!/usr/bin/env node
// Put a device's OLD layout back, using the undo history another device
// kept of it.
//
// Why this exists: before v0.243.7, sync carried layout between devices
// (newer edit wins). Resizing widgets on the desktop overwrote the phone's
// home layout, and the phone recorded no history of the overwrite — but the
// DESKTOP's Recent changes kept the value from before its edit, which is
// exactly the layout the phone had. This lifts that value out of the
// desktop's snapshot and offers it back to the phone as a one-off
// "Layout restore" device in the sync folder. On the phone: Settings →
// Sync between devices → Devices in this folder → "Use look" on it. That
// goes through the app's normal, confirmed, undoable path (the layout it
// replaces lands in Recent changes). Remove the file afterwards (--remove).
//
//   node scripts/sync-restore-layout.mjs <folder> --list
//       layout history in every snapshot in the folder
//   node scripts/sync-restore-layout.mjs <folder> --from <systemIdPrefix> --field classic_home --at 2026-09-26T02:55 --to <systemIdPrefix>
//       write the restore snapshot for the target system
//   node scripts/sync-restore-layout.mjs <folder> --remove
//       delete the restore snapshot
//
// Unencrypted snapshots only (same limit as sync-test-peer.mjs).

import fs from "node:fs";
import path from "node:path";

const [, , folder, ...rest] = process.argv;
const RESTORE_DEVICE = "layoutrestore";
const flag = (name) => {
  const i = rest.indexOf(name);
  return i === -1 ? null : (rest[i + 1] ?? true);
};

if (!folder || !fs.existsSync(folder)) {
  console.error("usage: node scripts/sync-restore-layout.mjs <sync-folder> (--list | --from … --field … --at … --to … | --remove)");
  process.exit(1);
}

const parseName = (name) => {
  const m = /^symphony-sync-(.+)-([^-]+)\.(data|media)\.json$/.exec(name);
  return m ? { systemId: m[1], deviceId: m[2], kind: m[3] } : null;
};
const dataFiles = fs.readdirSync(folder)
  .map((name) => ({ name, ...(parseName(name) || {}) }))
  .filter((f) => f.kind === "data");

if (flag("--remove")) {
  const gone = dataFiles.filter((f) => f.deviceId === RESTORE_DEVICE);
  for (const f of gone) fs.unlinkSync(path.join(folder, f.name));
  console.log(gone.length ? `removed ${gone.map((f) => f.name).join(", ")}` : "no restore snapshot in the folder");
  process.exit(0);
}

const readBody = (f) => {
  const file = JSON.parse(fs.readFileSync(path.join(folder, f.name), "utf8"));
  if (file.encrypted) throw new Error(`${f.name} is encrypted — this tool only reads unencrypted snapshots.`);
  return { file, body: file.body };
};
const layoutEvents = (body) => Object.values(body?.data?.HistoryEvent || {})
  .filter((r) => r && r.category === "layout" && r.entity === "SystemSettings")
  .map((r) => ({ at: String(r.created_date || r.timestamp || ""), field: r.field, snapshot: r.snapshot }))
  .sort((a, b) => b.at.localeCompare(a.at));

if (flag("--list")) {
  for (const f of dataFiles) {
    if (f.deviceId === RESTORE_DEVICE) continue;
    try {
      const { file, body } = readBody(f);
      console.log(`\n${f.name}\n  device ${file.device?.name || f.deviceId} · app ${file.app_version || "?"} · written ${file.written_at || "?"}`);
      for (const e of layoutEvents(body).slice(0, 15)) console.log(`  ${e.at.slice(0, 19)}  ${e.field}  (${JSON.stringify(e.snapshot).length} bytes)`);
    } catch (e) { console.log(`\n${f.name}\n  ${e.message}`); }
  }
  process.exit(0);
}

const from = flag("--from"), field = flag("--field"), at = flag("--at"), to = flag("--to");
if (![from, field, at, to].every((v) => typeof v === "string")) {
  console.error("need --from <systemIdPrefix> --field <field> --at <timestamp prefix> --to <systemIdPrefix>");
  process.exit(1);
}
const source = dataFiles.find((f) => f.systemId.startsWith(from) && f.deviceId !== RESTORE_DEVICE);
const target = dataFiles.find((f) => f.systemId.startsWith(to) && f.deviceId !== RESTORE_DEVICE);
if (!source) { console.error(`no snapshot for system ${from}`); process.exit(1); }
if (!target) { console.error(`no snapshot for system ${to} (needed for its exact system id)`); process.exit(1); }

const events = layoutEvents(readBody(source).body).filter((e) => e.field === field && e.at.startsWith(at));
if (events.length !== 1) {
  console.error(`expected exactly one ${field} history entry at ${at}, found ${events.length}`);
  process.exit(1);
}

const now = new Date().toISOString();
const out = {
  __format: "symphony_sync",
  __version: 1,
  device: { id: RESTORE_DEVICE, name: `Layout restore (${field} from ${events[0].at.slice(0, 16)})` },
  system: target.systemId,
  written_at: now,
  app_version: "restore",
  encrypted: false,
  // No data at all: merging this snapshot changes nothing. Only the
  // appearance section carries the value, and only "Use look" applies it.
  body: { data: {}, appearance: { settings: {}, systemSettings: { [field]: events[0].snapshot } } },
};
const outName = `symphony-sync-${target.systemId}-${RESTORE_DEVICE}.data.json`;
fs.writeFileSync(path.join(folder, outName), JSON.stringify(out));
console.log(`wrote ${outName} (${field}, ${JSON.stringify(events[0].snapshot).length} bytes, from ${source.name.slice(14, 22)} history at ${events[0].at})`);
