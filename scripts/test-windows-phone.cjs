// Exercises electron/windowsPhone.cjs on a real Windows machine (CI's
// windows-latest runner). There is no phone there, so the Shell script runs
// in its test mode (SYM_LOCAL): the same CopyHere/MoveHere calls the phone
// path uses, against a normal folder. Also checks that device discovery
// runs cleanly when nothing is plugged in.
//
//   node scripts/test-windows-phone.cjs      (Windows only; skips elsewhere)

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createWindowsPhone, phonePath, parsePhonePath, isPhonePath } = require('../electron/windowsPhone.cjs');

(async () => {
  // Pure helpers run everywhere.
  const p = phonePath('Galaxy S24 / "mine"', 'Internal storage');
  assert.ok(isPhonePath(p));
  assert.deepEqual(parsePhonePath(p), { device: 'Galaxy S24 / "mine"', storage: 'Internal storage' });
  assert.equal(parsePhonePath('C:\\Sync'), null);
  console.log('ok  phone path round-trip');

  if (process.platform !== 'win32') {
    console.log('skip  Shell tests (not Windows)');
    return;
  }

  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'symphony-phone-target-'));
  const helperDir = fs.mkdtempSync(path.join(os.tmpdir(), 'symphony-phone-helper-'));
  const local = createWindowsPhone({ helperDir, localTarget: target });
  const real = createWindowsPhone({ helperDir });
  const dir = phonePath('Test phone', 'Internal storage');
  const name = 'symphony-sync-default-abc123.data.json';
  const other = 'symphony-sync-default-zzz999.data.json';

  const dev = await real.devices();
  assert.ok(dev.ok, `devices failed: ${dev.error}`);
  console.log('ok  devices()', JSON.stringify(dev.devices));

  const missing = await real.list(dir);
  assert.equal(missing.ok, false);
  console.log('ok  list() on an absent phone fails cleanly:', missing.error);

  // Unrelated file in the folder must be ignored and never touched.
  fs.writeFileSync(path.join(target, 'notes.txt'), 'keep me');
  fs.writeFileSync(path.join(target, other), '{"other":true}');

  let r = await local.write(dir, name, '{"v":1}');
  assert.ok(r.ok, `first write failed: ${r.error}`);
  assert.equal(fs.readFileSync(path.join(target, name), 'utf8'), '{"v":1}');
  console.log('ok  write() new file');

  r = await local.list(dir);
  assert.ok(r.ok, r.error);
  const names = r.files.map((f) => f.name).sort();
  assert.deepEqual(names, [name, other].sort());
  const entry = r.files.find((f) => f.name === name);
  assert.equal(entry.size, 7);
  assert.ok(entry.mtimeMs > 0);
  console.log('ok  list()', JSON.stringify(r.files));

  r = await local.read(dir, name);
  assert.ok(r.ok, r.error);
  assert.equal(r.text, '{"v":1}');
  console.log('ok  read()');

  const bigger = JSON.stringify({ v: 2, pad: 'x'.repeat(200000) });
  r = await local.write(dir, name, bigger);
  assert.ok(r.ok, `replace failed: ${r.error}`);
  assert.equal(fs.readFileSync(path.join(target, name), 'utf8'), bigger);
  r = await local.read(dir, name);
  assert.equal(r.text, bigger);
  console.log('ok  write() replaces an existing file');

  r = await local.remove(dir, name);
  assert.ok(r.ok, r.error);
  assert.equal(fs.existsSync(path.join(target, name)), false);
  console.log('ok  remove()');

  assert.equal(fs.readFileSync(path.join(target, 'notes.txt'), 'utf8'), 'keep me');
  assert.equal(fs.readFileSync(path.join(target, other), 'utf8'), '{"other":true}');
  console.log('ok  other files untouched');

  r = await local.read(dir, 'not-ours.json');
  assert.equal(r.ok, false);
  console.log('ok  refuses a non-sync filename');

  console.log('all windows phone tests passed');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
