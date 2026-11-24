#!/usr/bin/env node
// House size budget (new house, Phase 0 step 0.2 "Rulers").
//
// Builds the app (or reads an existing build) and reports the gzip size of:
//   - entry:        the entry JS chunk named by index.html's <script type=module>
//   - startupCss:   every stylesheet index.html links at boot
//   - firstPaintJs: the entry plus everything it loads before first paint —
//                   index.html's modulepreload links AND the entry's static
//                   `import … from "./x.js"` graph (dynamic import() excluded)
// Also listed (information only): the biggest lazy chunks against the house
// room budget, and the total JS + CSS the service worker warms for offline.
//
// Budgets live in scripts/house-budget.json:
//   - baseline.*  today's numbers. They are SOFT limits: the script fails
//                 (exit 1) only when a metric grows beyond baseline × (1 +
//                 tolerance), tolerance 3%. Sizes may only go down.
//   - house.*     the new-house targets from Tide's budget (team/tide.md §6).
//                 Reported as "house gap", never fail the run yet.
//
// Usage:
//   npm run check:budget                      build to /tmp/rulers-dist, compare
//   node scripts/house-budget.mjs --no-build  reuse the last build in --dir
//   node scripts/house-budget.mjs --dir /tmp/x --no-build
//   node scripts/house-budget.mjs --json out.json --md out.md
//   node scripts/house-budget.mjs --update-baseline   write today's numbers
//                                                     as the new baseline
//
// The build goes to a /tmp outDir so it never touches the repo's dist/
// (vite.config.js's plugins honour the configured outDir).
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUDGET_FILE = path.join(ROOT, 'scripts', 'house-budget.json');

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const outDir = path.resolve(opt('--dir', '/tmp/rulers-dist'));

if (!flag('--no-build')) {
  console.log(`[budget] building into ${outDir} …`);
  execSync(`npx vite build --outDir ${JSON.stringify(outDir)} --emptyOutDir`, {
    cwd: ROOT,
    stdio: ['ignore', 'ignore', 'inherit'],
  });
}

const indexHtmlPath = path.join(outDir, 'index.html');
if (!fs.existsSync(indexHtmlPath)) {
  console.error(`[budget] no build at ${outDir} (index.html missing). Run without --no-build.`);
  process.exit(2);
}
const html = fs.readFileSync(indexHtmlPath, 'utf8');

const gzCache = new Map();
function sizes(rel) {
  const clean = rel.replace(/^\//, '');
  if (gzCache.has(clean)) return gzCache.get(clean);
  const buf = fs.readFileSync(path.join(outDir, clean));
  const s = { file: clean, raw: buf.length, gz: zlib.gzipSync(buf, { level: 9 }).length };
  gzCache.set(clean, s);
  return s;
}
const sum = (list, k) => list.reduce((n, s) => n + s[k], 0);

// --- What index.html asks for at boot ---
const entryMatch = html.match(/<script[^>]*type="module"[^>]*src="([^"]+)"/);
if (!entryMatch) { console.error('[budget] no module entry script in index.html'); process.exit(2); }
const entryRel = entryMatch[1];
const cssRels = [...html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)].map((m) => m[1])
  .filter((h) => h.startsWith('/') && !h.startsWith('//'));
const preloadRels = [...html.matchAll(/<link[^>]*rel="modulepreload"[^>]*href="([^"]+)"/g)].map((m) => m[1]);

// Static import graph of a chunk (minified ES output: `from"./x.js"` / `import"./x.js"`).
function staticImports(rel) {
  const dir = path.posix.dirname(rel.replace(/^\//, ''));
  const src = fs.readFileSync(path.join(outDir, rel.replace(/^\//, '')), 'utf8');
  const out = new Set();
  for (const m of src.matchAll(/(?:\bfrom|\bimport)\s*["'](\.\.?\/[^"']+\.js)["']/g)) {
    out.add(path.posix.normalize(path.posix.join(dir, m[1])));
  }
  return [...out];
}
const firstPaint = new Set();
const queue = [entryRel.replace(/^\//, ''), ...preloadRels.map((r) => r.replace(/^\//, ''))];
while (queue.length) {
  const f = queue.shift();
  if (firstPaint.has(f) || !fs.existsSync(path.join(outDir, f))) continue;
  firstPaint.add(f);
  queue.push(...staticImports(f));
}

const entry = sizes(entryRel);
const cssList = cssRels.map(sizes);
const fpList = [...firstPaint].map(sizes);

// --- Information only ---
const assetsDir = path.join(outDir, 'assets');
const all = fs.readdirSync(assetsDir).filter((f) => /\.(js|css)$/.test(f)).map((f) => sizes(`assets/${f}`));
const lazyJs = all.filter((s) => s.file.endsWith('.js') && !firstPaint.has(s.file)).sort((a, b) => b.gz - a.gz);

const measured = {
  entryGz: entry.gz,
  startupCssGz: sum(cssList, 'gz'),
  firstPaintJsGz: sum(fpList, 'gz'),
  offlineWarmGz: sum(all, 'gz'),
};
const raw = {
  entry: entry.raw,
  startupCss: sum(cssList, 'raw'),
  firstPaintJs: sum(fpList, 'raw'),
  offlineWarm: sum(all, 'raw'),
};

let appVersion = '?';
try { appVersion = fs.readFileSync(path.join(ROOT, 'src/lib/appVersion.js'), 'utf8').match(/APP_VERSION\s*=\s*"([^"]+)"/)[1]; } catch { /* informational */ }

const budget = JSON.parse(fs.readFileSync(BUDGET_FILE, 'utf8'));

if (flag('--update-baseline')) {
  budget.baseline = {
    ...budget.baseline,
    measuredAt: new Date().toISOString().slice(0, 10),
    appVersion,
    entryGz: measured.entryGz,
    startupCssGz: measured.startupCssGz,
    firstPaintJsGz: measured.firstPaintJsGz,
  };
  fs.writeFileSync(BUDGET_FILE, JSON.stringify(budget, null, 2) + '\n');
  console.log(`[budget] baseline updated in ${path.relative(ROOT, BUDGET_FILE)}`);
}

const kb = (b) => `${(b / 1024).toFixed(1)} KB`;
const tol = budget.tolerance ?? 0.03;
const METRICS = [
  ['entryGz', 'Entry JS (gzip)', 'entryGz'],
  ['startupCssGz', 'Startup CSS (gzip)', 'bootCssGz'],
  ['firstPaintJsGz', 'JS at first paint (gzip)', 'firstPaintJsGz'],
];
const rows = [];
let failed = false;
for (const [key, label, houseKey] of METRICS) {
  const now = measured[key];
  const base = budget.baseline?.[key];
  const limit = base ? Math.round(base * (1 + tol)) : null;
  const regress = limit != null && now > limit;
  if (regress) failed = true;
  const house = budget.house?.[houseKey];
  rows.push({
    key, label, now, base, limit, regress, house,
    delta: base ? (now - base) / base : null,
    houseGap: house ? now - house : null,
  });
}
const roomLimit = budget.house?.roomChunkGz;
const overRoom = roomLimit ? lazyJs.filter((s) => s.gz > roomLimit) : [];

const report = {
  measuredAt: new Date().toISOString(),
  appVersion,
  outDir,
  files: { entry: entry.file, startupCss: cssList.map((s) => s.file), firstPaintJs: [...firstPaint] },
  measured, raw,
  tolerance: tol,
  rows,
  biggestLazyChunks: lazyJs.slice(0, 12),
  lazyChunksOverHouseRoomBudget: overRoom.length,
  failed,
};

// --- Print ---
const lines = [];
lines.push(`# House size budget — v${appVersion}, ${report.measuredAt.slice(0, 10)}`);
lines.push('');
lines.push(`Build: \`${outDir}\`. Sizes are gzip -9, KB = 1024 bytes. Fails only on growth beyond baseline + ${Math.round(tol * 100)}%.`);
lines.push('');
lines.push('| Metric | Now | Baseline | Limit (baseline +3%) | Change | House target | Gap to house |');
lines.push('|---|---|---|---|---|---|---|');
for (const r of rows) {
  lines.push(`| ${r.label} | ${kb(r.now)} | ${r.base ? kb(r.base) : '—'} | ${r.limit ? kb(r.limit) : '—'} | ${r.delta == null ? '—' : `${r.delta >= 0 ? '+' : ''}${(r.delta * 100).toFixed(1)}%`}${r.regress ? ' **REGRESSION**' : ''} | ${r.house ? `≤ ${kb(r.house)}` : '—'} | ${r.houseGap == null ? '—' : r.houseGap > 0 ? `${kb(r.houseGap)} over` : 'met'} |`);
}
lines.push('');
lines.push(`Raw (minified): entry ${kb(raw.entry)}, startup CSS ${kb(raw.startupCss)}, first-paint JS ${kb(raw.firstPaintJs)} across ${firstPaint.size} file(s).`);
lines.push(`Offline warm payload (all JS + CSS): ${kb(measured.offlineWarmGz)} gzip / ${kb(raw.offlineWarm)} raw${budget.house?.offlineWarmGz ? ` (house target ≤ ${kb(budget.house.offlineWarmGz)})` : ''}.`);
lines.push('');
lines.push(`Biggest lazy chunks (house room target ≤ ${roomLimit ? kb(roomLimit) : '—'} gzip; ${overRoom.length} over):`);
lines.push('');
for (const s of lazyJs.slice(0, 12)) lines.push(`- \`${s.file}\` ${kb(s.gz)} gzip (${kb(s.raw)} raw)${roomLimit && s.gz > roomLimit ? ' — over room target' : ''}`);
lines.push('');
lines.push(failed
  ? '**FAIL:** a size grew beyond its baseline + tolerance. Shrink it, or, if the growth is deliberate and agreed, run with `--update-baseline`.'
  : 'PASS: no size grew beyond its baseline + tolerance.');
const md = lines.join('\n') + '\n';
console.log(md);

const jsonOut = opt('--json');
const mdOut = opt('--md');
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(report, null, 2) + '\n');
if (mdOut) fs.writeFileSync(mdOut, md);

process.exit(failed ? 1 : 0);
