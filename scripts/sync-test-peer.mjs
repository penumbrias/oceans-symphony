#!/usr/bin/env node
// Pretend to be a second device, so device sync can be tested with one.
//
//   node scripts/sync-test-peer.mjs <sync-folder>                  # what's in there
//   node scripts/sync-test-peer.mjs <sync-folder> --add "A name"   # peer sends a record
//   node scripts/sync-test-peer.mjs <sync-folder> --delete-last    # peer says it deleted it
//
// Point the desktop app at a folder and hit Sync once first — this needs
// the app's own snapshot in the folder to copy the system id from, since
// a snapshot for a different system is ignored (by design).
//
// Only works on UNENCRYPTED snapshots: a real peer would hold the
// passphrase, and forging into an encrypted body would mean having it.
// Test encrypted sync with two real devices.

import fs from "node:fs";
import path from "node:path";

const [, , folder, ...rest] = process.argv;
const PEER_ID = "testpeer000001";
const PEER_NAME = "Test phone";

if (!folder) {
  console.error("usage: node scripts/sync-test-peer.mjs <sync-folder> [--add \"Name\"] [--delete-last]");
  process.exit(1);
}
if (!fs.existsSync(folder)) {
  console.error(`No such folder: ${folder}`);
  process.exit(1);
}

const flag = (name) => {
  const i = rest.indexOf(name);
  return i === -1 ? null : (rest[i + 1] ?? true);
};

const files = fs.readdirSync(folder).filter((f) => /^symphony-sync-.*\.(data|media)\.json$/.test(f));
const peerFile = files.find((f) => f.includes(PEER_ID) && f.endsWith(".data.json"));
const appFile = files.find((f) => !f.includes(PEER_ID) && f.endsWith(".data.json"));

// ── list ──
if (!rest.length) {
  if (!files.length) {
    console.log("Folder is empty of sync files. Point the desktop app at it and press Sync now.");
    process.exit(0);
  }
  console.log(`${files.length} sync file(s) in ${folder}:\n`);
  for (const f of files) {
    const j = JSON.parse(fs.readFileSync(path.join(folder, f), "utf8"));
    const records = j.body?.data
      ? Object.entries(j.body.data).reduce((n, [k, v]) => n + (k.startsWith("__") ? 0 : Object.keys(v || {}).length), 0)
      : null;
    console.log(`  ${f}`);
    console.log(`    device: ${j.device?.name || "?"} (${j.device?.id || "?"})`);
    console.log(`    written: ${j.written_at}   encrypted: ${!!j.encrypted}   records: ${records ?? "n/a (encrypted)"}\n`);
  }
  process.exit(0);
}

if (!appFile) {
  console.error("No snapshot from the app in that folder yet.\nOpen the desktop app → Settings → Data & privacy → Sync between devices, choose this folder, and press Sync now.");
  process.exit(1);
}

const appSnap = JSON.parse(fs.readFileSync(path.join(folder, appFile), "utf8"));
if (appSnap.encrypted) {
  console.error("The app's snapshot is encrypted, so a fake peer can't be forged into it.\nTest encrypted sync with two real devices, or turn the passphrase off for this test.");
  process.exit(1);
}

// System id is whatever the app used — a snapshot for another system is ignored.
const systemPart = appFile.replace(/^symphony-sync-/, "").replace(/-[^-]+\.data\.json$/, "");
const outName = `symphony-sync-${systemPart}-${PEER_ID}.data.json`;
const outPath = path.join(folder, outName);

const now = new Date().toISOString();
const existing = peerFile ? JSON.parse(fs.readFileSync(path.join(folder, peerFile), "utf8")) : null;
const snap = existing || {
  __format: "symphony_sync",
  __version: 1,
  device: { id: PEER_ID, name: PEER_NAME, platform: "native" },
  system_id: appSnap.system_id,
  app_version: appSnap.app_version,
  encrypted: false,
  body: { data: {} },
};
snap.written_at = now;
snap.body.data ||= {};

if (flag("--delete-last")) {
  const alters = snap.body.data.Alter || {};
  const ids = Object.keys(alters);
  if (!ids.length) {
    console.error("The peer hasn't sent anything yet — run with --add first.");
    process.exit(1);
  }
  const id = ids[ids.length - 1];
  const label = alters[id]?.name || id;
  delete snap.body.data.Alter[id];
  snap.body.data.DeletionLog ||= {};
  snap.body.data.DeletionLog[`Alter:${id}`] = { entity: "Alter", record_id: id, deleted_at: now };
  fs.writeFileSync(outPath, JSON.stringify(snap));
  console.log(`"${PEER_NAME}" now claims it deleted "${label}".`);
  console.log(`Sync in the app: it should STAY, and appear under "Deleted on another device, still here".`);
  process.exit(0);
}

const name = flag("--add");
if (typeof name === "string") {
  const id = `peer-alter-${Date.now().toString(36)}`;
  snap.body.data.Alter ||= {};
  snap.body.data.Alter[id] = { id, name, pronouns: "they/them", created_date: now, updated_date: now };
  fs.writeFileSync(outPath, JSON.stringify(snap));
  console.log(`"${PEER_NAME}" sent an alter called "${name}".`);
  console.log(`Sync in the app — it should appear in your alters list.`);
  process.exit(0);
}

console.error("Nothing to do. Use --add \"Name\" or --delete-last, or no flags to list.");
process.exit(1);
