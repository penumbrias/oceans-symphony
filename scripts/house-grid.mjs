#!/usr/bin/env node
// The proof grid (new house, plan §4 "The proof"; step 1.2).
//
// Screenshots a kit story sheet in every combination reviewers read:
// three widths × 100% and 200% text × dark, light and high contrast, over
// one wallpaper, in the smooth look (and the pixel look with --looks). Each
// picture is the whole sheet; contact sheets put them side by side, one per
// paint, so a reviewer reads one picture per (paint, text) instead of 18.
// It also measures what a picture can't prove: sideways scroll, text under
// 12 px, targets under 44 px, and (when axe-core is installed) the serious
// and critical automated accessibility findings.
//
//   npx vite --port 4312 &            (or a preview build)
//   node scripts/house-grid.mjs 4312 [--story /house/kit/controls]
//        [--out /mnt/project-files/audits/new-house-2026-11/phase1/1.2]
//        [--sizes 390,820,1280] [--texts 100,200] [--paints dark,light,hc]
//        [--looks smooth,pixel] [--no-axe]
//
// Example data only. A fresh, empty browser profile gets past the welcome
// screen with "Not now" (no backup, no import) and turns Preview Mode on by
// its own switch (the same way scripts/house-walk.mjs does). Nothing is ever
// imported, and the sheet itself writes nothing.
//
// Hover, focus and pressed are held still with the browser's own "force
// element state" on the cells the sheet marks data-force / data-force-input
// / data-force-parent, so the picture shows the real CSS rule.
//
// Playwright comes from the machine (require('playwright'), no install).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const port = args.find((a) => /^\d+$/.test(a));
if (!port) {
  console.error('usage: node scripts/house-grid.mjs <port> [--story /house/kit/controls] [--out dir] [--sizes 390,820,1280] [--texts 100,200] [--paints dark,light,hc] [--looks smooth] [--no-axe]');
  process.exit(2);
}
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const BASE = `http://localhost:${port}`;
const STORY = opt('--story', '/house/kit/controls');
const OUT = path.resolve(opt('--out', '/mnt/project-files/audits/new-house-2026-11/phase1/1.2'));
const SIZES = opt('--sizes', '390,820,1280').split(',').map(Number);
const TEXTS = opt('--texts', '100,200').split(',').map(Number);
const PAINTS = opt('--paints', 'dark,light,hc').split(',');
const LOOKS = opt('--looks', 'smooth').split(',');
const AXE = !args.includes('--no-axe');
const SHOT_DIR = path.join('/tmp', 'house-grid-shots');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(SHOT_DIR, { recursive: true });

const TEXT_CLASS = { 100: null, 112: 'a11y-text-lg', 125: 'a11y-text-xl', 150: 'a11y-text-xl3', 175: 'a11y-text-xl4', 200: 'a11y-text-xl5' };

// One wallpaper: soft shapes, busy enough that a panel without its own
// background would show it. Behind the page only; panels stay opaque.
const WALLPAPER = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='600' height='600' viewBox='0 0 600 600'>
    <defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#3b2a6b'/><stop offset='1' stop-color='#0f4c5c'/></linearGradient></defs>
    <rect width='600' height='600' fill='url(#g)'/>
    <circle cx='120' cy='140' r='110' fill='#f4a261' opacity='.35'/>
    <circle cx='470' cy='420' r='160' fill='#2a9d8f' opacity='.35'/>
    <path d='M0 470 Q150 380 300 470 T600 470 V600 H0Z' fill='#e9c46a' opacity='.25'/>
  </svg>`)}")`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function clickIf(page, selector, timeout = 2500) {
  try {
    const loc = page.locator(selector).first();
    await loc.waitFor({ state: 'visible', timeout });
    await loc.click({ timeout });
    await sleep(800);
    return true;
  } catch { return false; }
}

async function enterExampleData(page) {
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__OS_ALIVE === true || !!document.querySelector('button'), null, { timeout: 60000 });
  await sleep(1500);
  if (await clickIf(page, 'button:has-text("Start")', 4000)) {
    (await clickIf(page, 'button:has-text("Not now")', 4000)) || (await clickIf(page, 'button:has-text("Continue without backups")', 2000));
    await clickIf(page, 'button:has-text("Continue")', 1500);
    await sleep(1500);
  }
  await page.evaluate(() => localStorage.setItem('symphony_preview_active_system', 'guide'));
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => /Preview Mode/.test(document.body.innerText), null, { timeout: 30000 })
    .catch(() => { throw new Error('Preview Mode did not come on (no "Preview Mode" banner after boot).'); });
  await sleep(1000);
}

// In-app navigation (a reload would rebuild the example system's settings).
async function goStory(page) {
  await page.evaluate((to) => { history.pushState({}, '', to); dispatchEvent(new PopStateEvent('popstate')); }, STORY);
  await page.waitForSelector('[data-house] [data-story]', { timeout: 30000 });
  await sleep(1200);
}

// The look, switched the way a person does it (Display options → Shape →
// App look), on the EXAMPLE system's settings: same steps as house-walk.mjs.
async function setLook(page, look) {
  const current = async () => page.evaluate(() => document.documentElement.getAttribute('data-ui-look') || 'smooth');
  if ((await current()) === look) return true;
  await page.evaluate(() => { history.pushState({}, '', '/settings'); dispatchEvent(new PopStateEvent('popstate')); });
  await sleep(1500);
  if (!(await clickIf(page, 'text=Display options', 5000))) return false;
  await clickIf(page, '[role="tab"]:has-text("Shape")', 3000);
  const label = look === 'pixel' ? 'Pixel' : 'Smooth';
  await clickIf(page, `button:text-is("${label}"), [role="radio"]:has-text("${label}")`, 3000);
  await page.waitForFunction((l) => (document.documentElement.getAttribute('data-ui-look') || 'smooth') === l, look, { timeout: 5000 }).catch(() => {});
  await page.keyboard.press('Escape').catch(() => {});
  await sleep(600);
  await page.keyboard.press('Escape').catch(() => {});
  return (await current()) === look;
}

// The paint and text size, set the way the old house's appliers set them
// (classes on <html> and the device's theme mode); the house's token hook
// watches <html> and re-reads.
async function setPaint(page, { paint, text, look }) {
  await page.evaluate(({ paint, textClass, wallpaper }) => {
    const html = document.documentElement;
    try { localStorage.setItem('symphony_themeMode', paint === 'light' ? 'light' : 'dark'); } catch { /* */ }
    html.classList.toggle('dark', paint !== 'light');
    html.classList.toggle('a11y-high-contrast', paint === 'hc');
    for (const c of [...html.classList]) if (/^a11y-text-/.test(c)) html.classList.remove(c);
    if (textClass) html.classList.add(textClass);
    let st = document.getElementById('house-grid-wallpaper');
    if (!st) { st = document.createElement('style'); st.id = 'house-grid-wallpaper'; document.head.appendChild(st); }
    // The sheet scrolls inside its root; for a whole-page picture the root
    // grows to its content and the page scrolls instead.
    st.textContent = `[data-house].kit-root { height: auto; min-height: 100vh; overflow: visible; background-image: ${wallpaper}; background-size: 600px 600px; background-attachment: local; }
      html, body { height: auto; overflow: visible; }`;
    window.dispatchEvent(new StorageEvent('storage'));
  }, { paint, textClass: TEXT_CLASS[text] ?? null, wallpaper: WALLPAPER });
  await sleep(700);
}

// Hold hover / focus / pressed on the cells that ask for it.
async function forceStates(page, cdp) {
  const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
  const pick = async (sel) => (await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: sel })).nodeIds;
  const groups = [
    ['[data-force="hover"]', 'hover'],
    ['[data-force="focus-visible"]', 'focus-visible'],
    ['[data-force="active"]', 'active'],
    ['[data-force-parent="hover"] > *', 'hover'],
    ['[data-force-input="focus-visible"] label:first-of-type input', 'focus-visible'],
  ];
  for (const [sel, state] of groups) {
    for (const nodeId of await pick(sel)) {
      const forced = state === 'focus-visible' ? ['focus', 'focus-visible'] : [state];
      await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: forced }).catch(() => {});
    }
  }
}

async function measure(page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const sideways = Math.max(0, document.documentElement.scrollWidth - vw);
    // What pokes out (outermost only, skipping sideways scrollers' contents).
    const wide = [];
    if (sideways) {
      for (const el of document.querySelectorAll('[data-house] *')) {
        if (el.getBoundingClientRect().right <= vw + 1) continue;
        let p = el.parentElement, inScroller = false;
        while (p) { const ox = getComputedStyle(p).overflowX; if (ox === 'auto' || ox === 'scroll' || ox === 'hidden') { inScroller = true; break; } p = p.parentElement; }
        if (inScroller || wide.some((w) => w.el.contains(el))) continue;
        wide.push({ el, right: Math.round(el.getBoundingClientRect().right) });
        if (wide.length >= 4) break;
      }
    }
    const wideSamples = wide.map((w) => `${w.el.tagName.toLowerCase()}.${String(w.el.className).split(' ').slice(0, 2).join('.')} right ${w.right}px`);
    const root = document.querySelector('[data-house]');
    const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const scale = rootPx / 16;
    let belowFloor = 0; const floorSamples = [];
    for (const el of root.querySelectorAll('*')) {
      if (!el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < 12 * scale - 0.5) { belowFloor += 1; if (floorSamples.length < 5) floorSamples.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)} ${fs}px "${el.textContent.trim().slice(0, 20)}"`); }
    }
    let smallTargets = 0; const targetSamples = [];
    // A typed field inside a kit field box is measured by its box.
    for (const el of root.querySelectorAll('button, a[href], [role="switch"], [role="radio"], [role="menuitem"], [role="option"], label.hk-check, label.hk-radio, .hk-inputwrap, input:not([type="checkbox"]):not([type="radio"]):not(.hk-bare)')) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      if (el.closest('.hk-check, .hk-radio') && el.matches('input')) continue;
      if (r.height < 43.5 || r.width < 43.5) {
        // A chip or tick may LOOK smaller; its target (the button/label) may not.
        smallTargets += 1;
        if (targetSamples.length < 6) targetSamples.push(`${el.tagName.toLowerCase()}${el.getAttribute('role') ? `[${el.getAttribute('role')}]` : ''}.${String(el.className).split(' ').slice(0, 2).join('.')} ${Math.round(r.width)}×${Math.round(r.height)} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24)}"`);
      }
    }
    return { sideways, wideSamples, rootPx, belowFloor, floorSamples, smallTargets, targetSamples, title: document.title };
  });
}

async function runAxe(page) {
  const axePath = path.join(ROOT, 'node_modules', 'axe-core', 'axe.min.js');
  if (!fs.existsSync(axePath)) return { skipped: 'axe-core not installed' };
  await page.addScriptTag({ path: axePath });
  return page.evaluate(async () => {
    // eslint-disable-next-line no-undef
    const res = await axe.run(document.querySelector('[data-house]'), { resultTypes: ['violations'] });
    const v = res.violations.filter((x) => x.impact === 'serious' || x.impact === 'critical');
    return {
      serious: v.length,
      findings: v.map((x) => ({ id: x.id, impact: x.impact, help: x.help, nodes: x.nodes.length, first: x.nodes.slice(0, 3).map((n) => n.target.join(' ')) })),
      minor: res.violations.filter((x) => !(x.impact === 'serious' || x.impact === 'critical')).map((x) => `${x.id} (${x.impact}, ${x.nodes.length})`),
    };
  });
}

// One contact sheet: the three widths side by side, scaled to one height.
async function contactSheet(browser, title, shots, file) {
  const page = await browser.newPage({ viewport: { width: 2400, height: 1200 } });
  const imgs = shots.map((s) => {
    const b64 = fs.readFileSync(s.file).toString('base64');
    return `<figure><figcaption>${s.width} px</figcaption><img src="data:image/png;base64,${b64}" style="width:${Math.round(s.width * 0.6)}px"></figure>`;
  }).join('');
  await page.setContent(`<!doctype html><html><body style="margin:0;background:#222;color:#eee;font:16px system-ui">
    <h1 style="margin:12px 16px;font-size:20px">${title}</h1>
    <div style="display:flex;gap:16px;align-items:flex-start;padding:0 16px 16px">${imgs}</div></body></html>`);
  await page.waitForTimeout(300);
  await page.screenshot({ path: file, fullPage: true });
  await page.close();
}

const browser = await chromium.launch();
const report = [];
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e)));
  await enterExampleData(page);
  await goStory(page);
  const cdp = await context.newCDPSession(page);
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');

  for (const look of LOOKS) {
    // Reset paint first so the settings page is reachable at 100% text.
    await setPaint(page, { paint: 'dark', text: 100, look });
    if (!(await setLook(page, look))) throw new Error(`Couldn't switch to the ${look} look through Display options.`);
    await goStory(page);
    const shownLook = await page.evaluate(() => document.querySelector('[data-house]')?.getAttribute('data-house-look'));
    if (shownLook !== look) throw new Error(`The sheet shows the ${shownLook} look, not ${look}.`);
    for (const paint of PAINTS) {
      for (const text of TEXTS) {
        const shots = [];
        for (const width of SIZES) {
          await page.setViewportSize({ width, height: 900 });
          await setPaint(page, { paint, text, look });
          await forceStates(page, cdp);
          await sleep(300);
          const name = `controls-${look}-${paint}-${text}-${width}`;
          const file = path.join(SHOT_DIR, `${name}.png`);
          await page.screenshot({ path: file, fullPage: true });
          const m = await measure(page);
          const a = AXE && width === 390 ? await runAxe(page) : null;
          report.push({ name, look, paint, text, width, ...m, axe: a });
          shots.push({ file, width });
          console.log(`${name}: sideways ${m.sideways}, below 12px ${m.belowFloor}, small targets ${m.smallTargets}${a ? `, axe serious ${a.serious ?? a.skipped}` : ''}`);
        }
        const sheet = path.join(OUT, `controls-${look}-${paint}-${text}.png`);
        await contactSheet(browser, `Controls and pickers · ${look} · ${paint === 'hc' ? 'high contrast' : paint} · ${text}% text · one wallpaper · example data`, shots, sheet);
      }
    }
  }
  fs.writeFileSync(path.join(OUT, 'grid.json'), JSON.stringify({ story: STORY, pageErrors: errors, report }, null, 1));
  console.log(`\nWrote ${LOOKS.length * PAINTS.length * TEXTS.length} contact sheets and grid.json to ${OUT}`);
  if (errors.length) console.log('Page errors:', errors.slice(0, 5));
} finally {
  await browser.close();
}
