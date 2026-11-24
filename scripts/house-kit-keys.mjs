#!/usr/bin/env node
// The kit gate's behaviour checks (new house, kit gate items 3–7 and the
// typed-date block), driven in a real browser against the story sheets:
//
//   npx vite --port 4312 &
//   node scripts/house-kit-keys.mjs 4312
//
//   4  Tab (and Shift+Tab) out of the calendar and the time list closes the
//      pop-up and puts focus back on its trigger.
//   3  At 390 px and 200% text, the Undo toast never covers an open sheet
//      (it sits above it or is held), and it is never taller than 40% of
//      the screen.
//   5  The tree's fold target is the row's full height and ≥ 44 px wide.
//   6  The Layers eye keeps one name ("Show …") and says its state with
//      aria-pressed only.
//   7  When the confirm sheet's buttons stack, "Keep it" is the bottom one.
//   +  A date typed that can't be read blocks the story's Save.
//   +  (2.2, Lantern) A toast held behind a sheet is still announced: the
//      live region stays visible and says the message and that Undo waits.
//      A sheet's first focus is never the grab bar; the confirm sheet has
//      no grab bar; a press outside a half sheet does not close it.
//
// Example data only: a fresh browser profile gets past the welcome screen
// with "Not now" and turns Preview Mode on (as scripts/house-grid.mjs does).
// Nothing is imported or saved. Exits 1 on any failure.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const port = process.argv.slice(2).find((a) => /^\d+$/.test(a));
if (!port) { console.error('usage: node scripts/house-kit-keys.mjs <port>'); process.exit(2); }
const BASE = `http://localhost:${port}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failed = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
};

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
  await page.waitForFunction(() => /Preview Mode/.test(document.body.innerText), null, { timeout: 30000 });
  await sleep(1000);
}
async function goStory(page, to) {
  await page.evaluate((p) => { history.pushState({}, '', p); dispatchEvent(new PopStateEvent('popstate')); }, to);
  await page.waitForSelector('[data-house] [data-story]', { timeout: 30000 });
  await sleep(1000);
}
async function setText(page, cls) {
  await page.evaluate((c) => {
    const html = document.documentElement;
    for (const k of [...html.classList]) if (/^a11y-text-/.test(k)) html.classList.remove(k);
    if (c) html.classList.add(c);
  }, cls);
  await sleep(500);
}
const focusInfo = (page) => page.evaluate(() => {
  const a = document.activeElement;
  return { label: a?.getAttribute('aria-label') || a?.tagName, popOpen: !!document.querySelector('.hk-pop:not(.hk-pop--inline)') };
});

const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await enterExampleData(page);

  // ── 4: Tab out of the calendar and the time list ─────────────────────
  await goStory(page, '/house/kit/controls');
  const cal = page.locator('button[aria-label="Choose Due on a calendar"]').nth(1);
  for (const shift of [false, true]) {
    await cal.scrollIntoViewIfNeeded();
    await cal.click();
    await sleep(400);
    let f;
    for (let i = 0; i < 8; i += 1) {
      await page.keyboard.press(shift ? 'Shift+Tab' : 'Tab');
      await sleep(200);
      f = await focusInfo(page);
      if (!f.popOpen) break;
    }
    await sleep(200);
    f = await focusInfo(page);
    check(`calendar: ${shift ? 'Shift+Tab' : 'Tab'} off the end closes it and focus goes back to its button`, !f.popOpen && f.label === 'Choose Due on a calendar', JSON.stringify(f));
  }
  const tl = page.locator('button[aria-label="Choose Starts from a list"]').nth(1);
  await tl.scrollIntoViewIfNeeded();
  await tl.click();
  await sleep(400);
  await page.keyboard.press('Tab');
  await sleep(300);
  let f = await focusInfo(page);
  check('time list: Tab closes it and focus goes back to its button', !f.popOpen && f.label === 'Choose Starts from a list', JSON.stringify(f));

  // ── typed date that can't be read blocks Save ────────────────────────
  const story = page.locator('.ks-cell', { hasText: 'Save waits for a date' });
  const box = story.locator('input').first();
  await box.scrollIntoViewIfNeeded();
  await box.fill('nxt tues');
  await page.keyboard.press('Tab');
  await sleep(300);
  const blocked = await story.evaluate((el) => {
    const b = [...el.querySelectorAll('button')].find((x) => /Save/.test(x.textContent));
    return { disabled: b?.getAttribute('aria-disabled'), reason: el.textContent.includes('Fix the date first') };
  });
  check('typed date that can\'t be read: Save says "Fix the date first"', blocked.disabled === 'true' && blocked.reason, JSON.stringify(blocked));
  await box.fill('tomorrow');
  await page.keyboard.press('Tab');
  await sleep(300);
  const freed = await story.evaluate((el) => [...el.querySelectorAll('button')].find((x) => /Save/.test(x.textContent))?.getAttribute('aria-disabled'));
  check('…and once it reads, Save is back', freed !== 'true', String(freed));

  // ── panels at a phone, 200% text ────────────────────────────────────
  await page.setViewportSize({ width: 390, height: 844 });
  await goStory(page, '/house/kit/panels');
  await setText(page, 'a11y-text-xl5');

  // 5: the tree's fold target
  const folds = await page.evaluate(() => [...document.querySelectorAll('.hk-tree-toggle[data-fold]')].slice(0, 40).map((t) => {
    const r = t.getBoundingClientRect(); const row = t.closest('[role="treeitem"]').getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), rowH: Math.round(row.height) };
  }).filter((x) => x.w));
  const badFold = folds.filter((x) => x.w < 44 || x.h < x.rowH - 1);
  check('tree fold targets: ≥ 44 px wide and the row\'s full height', folds.length > 0 && badFold.length === 0, `${folds.length} measured${badFold.length ? `, bad ${JSON.stringify(badFold.slice(0, 3))}` : ''}`);

  // 6: the Layers eye
  const eyes = await page.evaluate(() => [...document.querySelectorAll('.hk-layer > button:first-child')].map((b) => ({ label: b.getAttribute('aria-label'), pressed: b.getAttribute('aria-pressed') })));
  const badEye = eyes.filter((e) => !/^Show /.test(e.label || '') || !['true', 'false'].includes(e.pressed));
  check('layers eye: one fixed name ("Show …") with aria-pressed', eyes.length > 0 && badEye.length === 0, `${eyes.length} eyes${badEye.length ? `, bad ${JSON.stringify(badEye.slice(0, 2))}` : ''}`);

  // 7: confirm sheet, stacked
  const opener = page.locator('button', { hasText: 'Delete Walk…' });
  await opener.scrollIntoViewIfNeeded();
  await opener.click();
  await sleep(700);
  const order = await page.evaluate(() => {
    const sheet = [...document.querySelectorAll('.hk-sheet')].find((s) => !s.dataset.inline && s.querySelector('.hk-confirm'));
    const keep = sheet?.querySelector('[data-safe]')?.getBoundingClientRect();
    const del = sheet?.querySelector('.hk-btn--danger')?.getBoundingClientRect();
    return keep && del ? { stacked: Math.abs(keep.top - del.top) > 4, keepBelow: keep.top > del.top } : null;
  });
  check('confirm at 390 px / 200%: buttons stack with "Keep it" at the bottom', !!order && order.stacked && order.keepBelow, JSON.stringify(order));

  // 3: delete → toast, then a sheet opened within 10 s
  await page.locator('.hk-sheet:not([data-inline]) .hk-btn--danger').first().click();
  await sleep(600);
  const toastBox = () => page.evaluate(() => {
    const t = document.querySelector('.hk-toast-region:not(.hk-toast-region--inline) .hk-toast');
    if (!t) return null;
    const r = t.getBoundingClientRect();
    const region = t.closest('.hk-toast-region');
    const said = region.querySelector('[data-toast-held]');
    return {
      top: r.top, bottom: r.bottom, h: r.height,
      held: getComputedStyle(t).visibility === 'hidden', place: region.dataset.place, vh: innerHeight,
      // Lantern: a held toast is still SAID (the live region stays visible and carries the words).
      regionHidden: getComputedStyle(region).visibility === 'hidden',
      said: said ? said.textContent : null,
    };
  });
  const free = await toastBox();
  check('toast at 200%: no taller than 40% of the screen', !!free && free.h <= free.vh * 0.4 + 1, JSON.stringify(free));
  for (const which of ['Delete Walk…', 'Open a half sheet']) {
    const b = page.locator('button', { hasText: which });
    await b.scrollIntoViewIfNeeded();
    await b.click();
    await sleep(800);
    const t = await toastBox();
    const sheetTop = await page.evaluate(() => Math.min(...[...document.querySelectorAll('.hk-sheet')].filter((s) => !s.dataset.inline).map((s) => s.getBoundingClientRect().top)));
    const clear = !!t && (t.held || t.bottom <= sheetTop + 0.5);
    check(`toast + "${which}": the toast never covers the sheet`, clear, JSON.stringify({ ...t, sheetTop: Math.round(sheetTop) }));
    if (t?.held) {
      check(`toast + "${which}": held, and still announced (region live, words said)`, !t.regionHidden && !!t.said && /moved to trash/i.test(t.said) && /Undo/.test(t.said), JSON.stringify({ said: t.said, regionHidden: t.regionHidden }));
    }
    const sheetState = await page.evaluate(() => {
      const sheet = [...document.querySelectorAll('.hk-sheet')].find((s) => !s.dataset.inline);
      return { grab: !!sheet?.querySelector('.hk-sheet-grab'), confirm: !!sheet?.querySelector('.hk-confirm'), focusOnGrab: !!document.activeElement?.classList?.contains('hk-sheet-grab') };
    });
    check(`"${which}": first focus is not the grab bar`, !sheetState.focusOnGrab, JSON.stringify(sheetState));
    if (sheetState.confirm) check('confirm sheet: no grab bar', !sheetState.grab, JSON.stringify(sheetState));
    if (which === 'Open a half sheet') {
      await page.mouse.click(5, 5);
      await sleep(500);
      const still = await page.evaluate(() => [...document.querySelectorAll('.hk-sheet')].some((s) => !s.dataset.inline));
      check('half sheet: a press outside does not close it (decided no)', still);
      // Focus is on the page now (a non-modal sheet doesn't hold it): close with its own button.
      await page.locator('.hk-sheet:not([data-inline]) .hk-sheet-head button[aria-label^="Close"]').first().click().catch(() => {});
      await sleep(400);
    }
    await page.keyboard.press('Escape');
    await sleep(600);
  }
  const back = await toastBox();
  check('…and when the sheet closes the toast is back (its Undo kept)', !!back && !back.held, JSON.stringify(back));
} finally {
  await browser.close();
}
console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exitCode = failed ? 1 : 0;
