#!/usr/bin/env node
// The explorer walk (new house, Phase 0 step 0.2 "Rulers").
//
// Walks every route of a RUNNING build with Preview Mode example data, at
// three sizes and in both looks, and writes what it saw to /tmp/house-walk/:
// walk.json (every visit) and walk.md (the summary). Exit 1 when any visit
// threw a page error (uncaught exception) or hit the "something went wrong"
// screen; everything else is reported, not failed.
//
//   npx vite build --outDir /tmp/rulers-dist
//   npx vite preview --outDir /tmp/rulers-dist --port 4199 &
//   npm run walk -- 4199
//
// Options (after the port):
//   --looks smooth,pixel        which looks to walk (default both)
//   --sizes 390x844,820x1180,1280x800
//   --routes /journals,/todo     only these routes (default: every route in src/App.jsx)
//   --out /tmp/house-walk        report folder
//   --shots                      a screenshot of every visit (default: only visits with findings)
//   --house                      walk inside the new house's frame (step 2.1): turns on
//                                "Try the new house" (symphony_new_house_v1) with the
//                                example data, walks 1280x800 and 820x1180 by default, and
//                                also FAILS on a missing page title, a missing frame and
//                                sideways scroll (not only on page errors). Since step
//                                2.2 it also FAILS when Support isn't one tap away in
//                                the frame (visible, outside the page). For the phone
//                                frame: --sizes 390x844,360x740,844x390 --touch
//   --touch                      a touch screen (coarse pointer), so a short landscape
//                                phone gets the phone frame as it would on a device
//
// Example data only. The walk starts a fresh, empty browser profile, gets past
// the welcome screen with "Not now" (no backup, no import) and turns Preview
// Mode on by its own switch: the `symphony_preview_active_system` key that
// restorePreviewIfActive() reads on boot (src/lib/previewMode.js). Nothing is
// ever imported. The look is switched through Display options → Shape → App
// look, the same control a person uses, and pages are then reached by in-app
// navigation (history.pushState), because a reload rebuilds the example
// system's settings and drops the look.
//
// What each visit records: page errors (uncaught), console errors, failed
// requests (HTTP 4xx/5xx), the "Page not found" wall, horizontal overflow (the
// page scrolls sideways) and clipped overflow (wider than the main column,
// hidden by its overflow-x), document.title, whether Support is one tap away in
// the frame (a visible control outside the page body that opens Support,
// grounding, the safety plan or emergency info), and the time from navigation
// to the first meaningful content (main column has ≥ 60 characters of text, no
// route spinner, and has changed from the previous page; capped at 10 s).
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
  console.error('usage: npm run walk -- <port> [--looks smooth,pixel] [--sizes 390x844,…] [--routes /a,/b] [--out dir] [--shots]');
  process.exit(2);
}
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const BASE = `http://localhost:${port}`;
const OUT = path.resolve(opt('--out', '/tmp/house-walk'));
const LOOKS = opt('--looks', 'smooth,pixel').split(',');
const HOUSE = args.includes('--house');
// Routes drawn outside the app frame (the kit galleries, the 404 wall and
// the full-page privacy notice): the house checks don't apply to them.
const OUTSIDE_FRAME = (r) => /^\/house\/kit(\/|$)/.test(r) || r === '/__walk_missing_room__' || r === '/privacy';
const SIZES = opt('--sizes', HOUSE ? '1280x800,820x1180' : '390x844,820x1180,1280x800').split(',').map((s) => {
  const [w, h] = s.split('x').map(Number);
  return { w, h, name: s };
});
const ALL_SHOTS = args.includes('--shots');
const TOUCH = args.includes('--touch');
fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true });

// ── The route list: every <Route path> in src/App.jsx ───────────────────
function readRoutes() {
  const src = fs.readFileSync(path.join(ROOT, 'src/App.jsx'), 'utf8');
  const routes = [];
  const redirects = [];
  for (const m of src.matchAll(/<Route\s+path="([^"]+)"\s+element=\{([^\n]*)/g)) {
    const [, p, el] = m;
    if (p === '*') continue;
    if (/^<Navigate\b/.test(el.trim())) redirects.push(p);
    else routes.push(p);
  }
  return { routes: [...new Set(routes)], redirects };
}
const { routes: APP_ROUTES, redirects: REDIRECTS } = readRoutes();
// Extras: /privacy is served only on a full page load (App.jsx); reaching it
// in-app, or any unknown path, shows the old "Page not found" wall.
const EXTRA = ['/privacy', '/__walk_missing_room__'].filter((r) => !APP_ROUTES.includes(r));
if (APP_ROUTES.includes('/privacy')) EXTRA.unshift('/privacy');
const APP_ROUTES_IN_FRAME = APP_ROUTES.filter((r) => r !== '/privacy');
const onlyRoutes = opt('--routes') ? opt('--routes').split(',') : null;

// ── Browser helpers ─────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function clickIf(page, selector, timeout = 2500) {
  try {
    const loc = page.locator(selector).first();
    await loc.waitFor({ state: 'visible', timeout });
    await loc.click({ timeout });
    await sleep(900);
    return true;
  } catch { return false; }
}

async function waitForApp(page) {
  await page.waitForFunction(() => window.__OS_ALIVE === true || !!document.querySelector('button'), null, { timeout: 30000 });
  await sleep(1500);
}

// Close the welcome steps / tour / any sheet that sits over the page.
async function clearOverlays(page) {
  for (let i = 0; i < 3; i++) {
    const hit = (await clickIf(page, 'button:has-text("Skip setup")', 600))
      || (await clickIf(page, '[role="dialog"] button:has-text("Close")', 400))
      || (await clickIf(page, '[role="dialog"] button[aria-label="Close"]', 400));
    if (!hit) break;
  }
  await page.keyboard.press('Escape').catch(() => {});
}

// In-app navigation, timed from inside the page.
async function navigate(page, route) {
  return page.evaluate(async (to) => {
    const main = () => document.querySelector('#main-content') || document.querySelector('[role="main"]') || document.body;
    const before = (main().innerText || '').trim();
    const t0 = performance.now();
    history.pushState({}, '', to);
    dispatchEvent(new PopStateEvent('popstate'));
    return await new Promise((resolve) => {
      const tick = () => {
        const el = main();
        const elapsed = performance.now() - t0;
        const text = (el.innerText || '').trim();
        const busy = document.querySelector('[aria-label="Loading page"], #main-content [data-launch-pending]');
        if (!busy && text.length >= 60 && (text !== before || elapsed > 600)) return resolve(Math.round(elapsed));
        if (elapsed > 10000) return resolve(null);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }, route);
}

async function measure(page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const main = document.querySelector('#main-content') || document.querySelector('[role="main"]');
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) return false;
      if (r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) return false;
      const cs = getComputedStyle(el);
      return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05;
    };
    const describe = (el) => {
      const id = el.id ? `#${el.id}` : '';
      const cls = typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
      const label = el.getAttribute('aria-label') || el.getAttribute('title') || (el.innerText || '').trim().slice(0, 30);
      return `${el.tagName.toLowerCase()}${id}${cls === '.' ? '' : cls}${label ? ` "${label.replace(/\s+/g, ' ')}"` : ''}`;
    };
    // Horizontal overflow: the document scrolls sideways.
    const docScroll = document.documentElement.scrollWidth;
    const hOverflow = docScroll > vw + 1 ? docScroll - vw : 0;
    // Clipped overflow: something inside the main column is wider than it
    // (main hides overflow-x, so the person just can't see the cut-off part).
    let clipped = 0; const offenders = [];
    if (main) {
      const mr = main.getBoundingClientRect();
      clipped = Math.max(0, main.scrollWidth - main.clientWidth);
      if (clipped > 1 || hOverflow) {
        const limit = Math.min(vw, mr.right) + 2;
        for (const el of main.querySelectorAll('*')) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.right > limit) {
            // Skip children of something already reported, and contents of sideways scrollers.
            let p = el.parentElement, inScroller = false;
            while (p && p !== main) { const ox = getComputedStyle(p).overflowX; if (ox === 'auto' || ox === 'scroll') { inScroller = true; break; } p = p.parentElement; }
            if (inScroller) continue;
            if (offenders.some((o) => o.el.contains(el))) continue;
            offenders.push({ el, over: Math.round(r.right - limit) });
            if (offenders.length >= 3) break;
          }
        }
      }
    }
    // Support one tap away in the frame: a visible control outside the page
    // body that opens Support / grounding / safety plan / emergency.
    const SUPPORT_HREF = /^\/(grounding|safety-plan|emergency|unblend)(\b|\/|\?|$)/;
    const SUPPORT_WORDS = /\b(support|grounding|crisis|safety plan|emergency|need help|help now)\b/i;
    const frameSupport = []; const pageSupport = []; const frameSupportScroll = [];
    const rendered = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width >= 4 && r.height >= 4 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
    for (const el of document.querySelectorAll('a[href], button, [role="button"], [role="link"]')) {
      if (!rendered(el)) continue;
      const href = el.getAttribute('href') || '';
      const label = `${el.getAttribute('aria-label') || ''} ${el.getAttribute('title') || ''} ${(el.innerText || '').slice(0, 40)}`;
      if (!(SUPPORT_HREF.test(href) || SUPPORT_WORDS.test(label))) continue;
      if (/how this page works|show me around/i.test(label)) continue;
      const inPage = main && main.contains(el);
      if (inPage) { if (visible(el)) pageSupport.push(describe(el)); }
      else (visible(el) ? frameSupport : frameSupportScroll).push(describe(el));
    }
    const bodyText = document.body.innerText || '';
    return {
      title: document.title,
      path: location.pathname + location.search,
      look: document.documentElement.getAttribute('data-ui-look') || 'smooth',
      hOverflow,
      clipped: clipped > 1 ? clipped : 0,
      overflowOffenders: offenders.map((o) => `${describe(o.el)} +${o.over}px`),
      frameSupport: frameSupport.slice(0, 3),
      pageSupport: pageSupport.slice(0, 3),
      frameSupportScroll: frameSupportScroll.slice(0, 3),
      notFoundWall: /Page Not Found/.test(bodyText) && /could not be found in this application/.test(bodyText),
      notImplemented: /hasn't implemented this page|not implemented/i.test(bodyText),
      crashed: /Something went wrong on this screen/.test(bodyText),
      sectionCrashes: (bodyText.match(/Something went wrong rendering this section/g) || []).length,
      mainTextLen: main ? (main.innerText || '').trim().length : 0,
      previewOn: /Preview Mode/.test(bodyText) || !!document.querySelector('[data-preview-banner]') || !!document.querySelector('[data-house-example]'),
      houseFrame: !!document.querySelector('[data-house-frame]'),
    };
  });
}

// ── Getting in: example data, then the look ─────────────────────────────
async function enterExampleData(page) {
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await waitForApp(page);
  // Brand-new profile: the welcome screen. Start → no backup → into the app.
  if (await clickIf(page, 'button:has-text("Start")', 4000)) {
    (await clickIf(page, 'button:has-text("Not now")', 4000)) || (await clickIf(page, 'button:has-text("Continue without backups")', 2000));
    await clickIf(page, 'button:has-text("Continue")', 1500);
    await sleep(1500);
  }
  // Preview Mode by its own switch, read by restorePreviewIfActive() on boot.
  await page.evaluate((house) => {
    localStorage.setItem('symphony_preview_active_system', 'guide');
    if (house) localStorage.setItem('symphony_new_house_v1', '1');
  }, HOUSE);
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await waitForApp(page);
  await clearOverlays(page);
  // The old house says "Preview Mode" in a banner; the new house says
  // "Example system" in its status bar.
  const ok = await page.waitForFunction(() => /Preview Mode/.test(document.body.innerText) || !!document.querySelector('[data-house-example]'), null, { timeout: 15000 }).then(() => true).catch(() => false);
  if (!ok) throw new Error('Preview Mode did not come on (no "Preview Mode" banner or "Example system" label after boot).');
}

async function setLook(page, look) {
  const current = await page.evaluate(() => document.documentElement.getAttribute('data-ui-look') || 'smooth');
  if (current === look) return true;
  await navigate(page, '/settings');
  await sleep(800);
  if (!(await clickIf(page, 'text=Display options', 4000))) return false;
  await clickIf(page, '[role="tab"]:has-text("Shape")', 3000);
  const label = look === 'pixel' ? 'Pixel' : 'Smooth';
  await clickIf(page, `button:text-is("${label}"), [role="radio"]:has-text("${label}")`, 3000);
  await page.waitForFunction((l) => (document.documentElement.getAttribute('data-ui-look') || 'smooth') === l, look, { timeout: 5000 }).catch(() => {});
  await page.keyboard.press('Escape').catch(() => {});
  await sleep(600);
  await page.keyboard.press('Escape').catch(() => {});
  return (await page.evaluate(() => document.documentElement.getAttribute('data-ui-look') || 'smooth')) === look;
}

// Real ids for /alter/:id and friends, read from the example data's links
// (or, failing that, by tapping the first card and reading where it went).
async function resolveParams(page) {
  const ids = {};
  const harvest = async () => {
    const hrefs = await page.$$eval('a[href]', (as) => as.map((a) => a.getAttribute('href')));
    for (const h of hrefs) {
      for (const [key, re] of [['alter', /^\/alter\/([^/?#]+)/], ['contact', /^\/contacts\/([^/?#]+)/], ['group', /^\/group\/([^/?#]+)/], ['location', /^\/location\/([^/?#]+)/], ['bulletin', /^\/bulletin\/([^/?#]+)/]]) {
        const m = h && h.match(re);
        if (m && !ids[key]) ids[key] = m[1];
      }
    }
  };
  // Through the app's own search box: type a name from the example data,
  // tap the matching result, read where it went.
  const viaSearch = async (key, query, match, re) => {
    if (ids[key]) return;
    try {
      await navigate(page, '/'); await sleep(900);
      let input = page.locator('input[placeholder="Search everything..."]').first();
      if (!(await input.isVisible().catch(() => false))) {
        await page.locator('button[aria-label*="earch"], [title*="earch"]').first().click({ timeout: 2000 });
        await sleep(700);
        input = page.locator('input[placeholder*="earch"]:visible').first();
      }
      await input.fill(query); await sleep(1400);
      await page.locator('button:visible', { hasText: match }).first().click({ timeout: 2500 });
      await sleep(1200);
      const m = new URL(page.url()).pathname.match(re);
      if (m) ids[key] = m[1];
    } catch { /* not found: the route is reported as skipped */ }
    await page.keyboard.press('Escape').catch(() => {});
  };
  for (const r of ['/', '/Home', '/bulletins', '/system-history']) {
    await navigate(page, r); await sleep(700); await harvest();
  }
  if (!ids.contact) {
    await navigate(page, '/contacts'); await sleep(900);
    const hid = await page.$eval('#main-content [data-highlight-id]', (el) => el.getAttribute('data-highlight-id')).catch(() => null);
    if (hid) ids.contact = hid;
  }
  await viaSearch('group', 'Start here', /1 · Start here/, /^\/group\/([^/]+)/);
  await viaSearch('location', 'The Hearth', /The Hearth/, /^\/location\/([^/]+)/);
  await viaSearch('bulletin', 'System-wide feed', /System-wide feed/, /^\/bulletin\/([^/]+)/);
  await viaSearch('alter', 'Welcome', /Welcome/, /^\/alter\/([^/]+)/);
  return ids;
}
function fillRoute(route, ids) {
  const map = { '/alter/:id': 'alter', '/contacts/:id': 'contact', '/group/:id': 'group', '/location/:id': 'location', '/bulletin/:id': 'bulletin' };
  if (!route.includes(':')) return route;
  const key = map[route];
  return key && ids[key] ? route.replace(':id', ids[key]) : null;
}

// ── The walk ────────────────────────────────────────────────────────────
const visits = [];
const skipped = [];
const setupNotes = [];
const browser = await chromium.launch();
const started = Date.now();
try {
  for (const look of LOOKS) {
    const ctx = await browser.newContext({ viewport: { width: SIZES[SIZES.length - 1].w, height: SIZES[SIZES.length - 1].h }, hasTouch: TOUCH });
    const page = await ctx.newPage();
    let pageErrors = []; let consoleErrors = []; let badResponses = [];
    page.on('pageerror', (e) => pageErrors.push(String(e.message || e).slice(0, 300)));
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)); });
    page.on('response', (r) => { if (r.status() >= 400 && r.url().startsWith(BASE)) badResponses.push(`${r.status()} ${r.url().replace(BASE, '')}`); });

    const setup = async () => {
      // Set up at desktop size (Display options is a side sheet there).
      await page.setViewportSize({ width: 1280, height: 800 });
      await enterExampleData(page);
      const ok = await setLook(page, look);
      if (!ok) setupNotes.push(`Could not switch to the ${look} look through Display options; walked in ${await page.evaluate(() => document.documentElement.getAttribute('data-ui-look') || 'smooth')}.`);
    };
    await setup();
    pageErrors = []; consoleErrors = []; badResponses = [];

    let ids = await resolveParams(page);
    if (look === LOOKS[0]) setupNotes.push(`Example-data ids found: ${Object.entries(ids).map(([k, v]) => `${k}=${v}`).join(', ') || 'none'}.`);
    let routeList = [...APP_ROUTES_IN_FRAME, ...EXTRA];
    if (onlyRoutes) routeList = routeList.filter((r) => onlyRoutes.includes(r));

    for (const size of SIZES) {
      await page.setViewportSize({ width: size.w, height: size.h });
      await sleep(500);
      for (const route of routeList) {
        const target = fillRoute(route, ids);
        if (!target) {
          if (look === LOOKS[0] && size === SIZES[0]) skipped.push({ route, why: route.startsWith('/mod/') ? 'needs an installed mod (none in the example data)' : 'no example record found to open' });
          continue;
        }
        pageErrors = []; consoleErrors = []; badResponses = [];
        await page.keyboard.press('Escape').catch(() => {});
        const ttc = await navigate(page, target);
        await sleep(700);
        const m = await measure(page);
        const v = {
          look, size: size.name, route, url: target, ttcMs: ttc, ...m,
          pageErrors: [...new Set(pageErrors)], consoleErrors: [...new Set(consoleErrors)].slice(0, 5), badResponses: [...new Set(badResponses)].slice(0, 5),
        };
        v.findings = [
          v.pageErrors.length && 'page error',
          v.crashed && 'crash screen',
          v.sectionCrashes && 'section crash',
          v.notFoundWall && '404 wall',
          v.notImplemented && '"not implemented"',
          v.hOverflow && `h-scroll ${v.hOverflow}px`,
          v.clipped && `clipped ${v.clipped}px`,
          !v.frameSupport.length && (v.frameSupportScroll.length ? 'Support in frame only after a scroll' : 'no Support in frame'),
          v.ttcMs == null && 'no content in 10 s',
          !v.notFoundWall && v.look !== look && `look is ${v.look}`,
          HOUSE && !OUTSIDE_FRAME(route) && !v.houseFrame && 'no house frame',
          HOUSE && !OUTSIDE_FRAME(route) && (!v.title || /^Oceans Symphony$|^Page not found\b/.test(v.title)) && `no page title ("${v.title}")`,
        ].filter(Boolean);
        if (ALL_SHOTS || v.findings.some((f) => !/Support in frame/.test(f))) {
          const file = `${look}-${size.name}-${route.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'root'}.png`;
          await page.screenshot({ path: path.join(OUT, 'shots', file) }).catch(() => {});
          v.shot = `shots/${file}`;
        }
        visits.push(v);
        process.stdout.write(`${look.padEnd(6)} ${size.name.padEnd(9)} ${route.padEnd(24)} ${String(ttc ?? '—').padStart(5)} ms  ${v.findings.join(', ') || 'ok'}\n`);
        // A crash screen or a lost look sticks across in-app navigation:
        // start this look again from a fresh boot so later routes are fair.
        // (The 404 wall is drawn outside the frame, so it has no banner and no
        // look: that is not a reason to start again.)
        if (v.crashed || (!v.notFoundWall && (v.look !== look || !v.previewOn)) || (HOUSE && !OUTSIDE_FRAME(route) && !v.houseFrame)) {
          v.restarted = true;
          await setup();
          ids = await resolveParams(page); // the example system mints new ids every boot
          await page.setViewportSize({ width: size.w, height: size.h });
          await sleep(500);
        }
      }
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}

// ── Report ──────────────────────────────────────────────────────────────
const by = (pred) => visits.filter(pred);
const uniq = (list) => [...new Set(list)];
const routesWith = (pred) => uniq(by(pred).map((v) => v.route));
const median = (xs) => { const s = xs.filter((x) => x != null).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
const errorVisits = by((v) => v.pageErrors.length || v.crashed);
const summary = {
  walkedAt: new Date().toISOString(),
  base: BASE,
  durationS: Math.round((Date.now() - started) / 1000),
  looks: LOOKS, sizes: SIZES.map((s) => s.name),
  routes: APP_ROUTES_IN_FRAME.length, redirectsNotWalked: REDIRECTS, extras: EXTRA,
  visits: visits.length,
  skipped, setupNotes,
  pageErrorVisits: errorVisits.length,
  pageErrorRoutes: routesWith((v) => v.pageErrors.length || v.crashed),
  sectionCrashRoutes: routesWith((v) => v.sectionCrashes),
  notFoundWallRoutes: routesWith((v) => v.notFoundWall || v.notImplemented),
  hScrollRoutes: uniq(by((v) => v.hOverflow).map((v) => `${v.route} (${v.look} ${v.size})`)),
  clippedRoutes: uniq(by((v) => v.clipped).map((v) => `${v.route} (${v.look} ${v.size})`)),
  noFrameSupport: uniq(by((v) => !v.frameSupport.length).map((v) => `${v.look} ${v.size}`)).map((k) => {
    const these = by((v) => !v.frameSupport.length && `${v.look} ${v.size}` === k);
    return { where: k, routes: these.map((v) => v.route), afterScroll: these.filter((v) => v.frameSupportScroll.length).length };
  }),
  distinctTitles: uniq(visits.map((v) => v.title)),
  ttcMedianMs: Object.fromEntries(LOOKS.flatMap((l) => SIZES.map((s) => [`${l} ${s.name}`, median(by((v) => v.look === l && v.size === s.name).map((v) => v.ttcMs))]))),
  slowest: [...visits].filter((v) => v.ttcMs != null).sort((a, b) => b.ttcMs - a.ttcMs).slice(0, 8).map((v) => `${v.route} ${v.look} ${v.size}: ${v.ttcMs} ms`),
  noContent: uniq(by((v) => v.ttcMs == null).map((v) => `${v.route} (${v.look} ${v.size})`)),
};
fs.writeFileSync(path.join(OUT, 'walk.json'), JSON.stringify({ summary, visits }, null, 2) + '\n');

const L = [];
L.push(`# House walk — ${summary.walkedAt.slice(0, 16).replace('T', ' ')} UTC`);
L.push('');
L.push(`${summary.visits} visits: ${summary.routes} routes from src/App.jsx + ${EXTRA.join(', ')}, at ${summary.sizes.join(', ')}, in ${LOOKS.join(' and ')}. Preview Mode example data ("guide"). ${summary.durationS} s.`);
L.push('');
L.push('## Headline');
L.push('');
L.push(`- **Page errors / crash screen:** ${summary.pageErrorVisits} visits on ${summary.pageErrorRoutes.length} routes${summary.pageErrorRoutes.length ? `: ${summary.pageErrorRoutes.join(', ')}` : ''}.`);
L.push(`- **Section crashes** ("went wrong rendering this section"): ${summary.sectionCrashRoutes.join(', ') || 'none'}.`);
L.push(`- **404 / "not implemented" wall:** ${summary.notFoundWallRoutes.join(', ') || 'none'}.`);
L.push(`- **Sideways scroll:** ${summary.hScrollRoutes.length} visits${summary.hScrollRoutes.length ? `: ${summary.hScrollRoutes.slice(0, 20).join('; ')}` : ''}.`);
L.push(`- **Clipped wider than the column:** ${summary.clippedRoutes.length} visits${summary.clippedRoutes.length ? `: ${summary.clippedRoutes.slice(0, 20).join('; ')}${summary.clippedRoutes.length > 20 ? ' …' : ''}` : ''}.`);
L.push(`- **Document title:** ${summary.distinctTitles.length} distinct across all visits (${summary.distinctTitles.map((t) => `"${t}"`).join(', ')}).`);
L.push(`- **Support not one tap away in the frame:** ${summary.noFrameSupport.length ? summary.noFrameSupport.map((x) => `${x.where}: ${x.routes.length} routes${x.afterScroll ? ` (on ${x.afterScroll} of them a Support link sits in the frame below the fold)` : ''}`).join('; ') : 'reachable everywhere'}.`);
L.push(`- **No meaningful content within 10 s:** ${summary.noContent.join('; ') || 'none'}.`);
L.push(`- **Time to content, median:** ${Object.entries(summary.ttcMedianMs).map(([k, v]) => `${k} ${v ?? '—'} ms`).join(' · ')}. Slowest: ${summary.slowest.join('; ')}.`);
if (skipped.length) L.push(`- **Not walked:** ${skipped.map((s) => `${s.route} (${s.why})`).join('; ')}. Redirect routes not walked: ${REDIRECTS.join(', ')}.`);
for (const n of setupNotes) L.push(`- Note: ${n}`);
L.push('');
L.push('## Every visit');
L.push('');
L.push('| Look | Size | Route | Title | Content ms | Support in frame | Findings |');
L.push('|---|---|---|---|---|---|---|');
for (const v of visits) {
  L.push(`| ${v.look} | ${v.size} | \`${v.route}\` | ${v.title} | ${v.ttcMs ?? '—'} | ${v.frameSupport.length ? 'yes' : v.frameSupportScroll.length ? 'after scroll' : '**no**'} | ${[...v.findings.filter((f) => !/Support in frame/.test(f)), ...v.pageErrors.map((e) => `\`${e.slice(0, 80)}\``), ...v.overflowOffenders.map((o) => `\`${o.slice(0, 80)}\``)].join('; ') || ''}${v.shot ? ` ([shot](${v.shot}))` : ''} |`);
}
fs.writeFileSync(path.join(OUT, 'walk.md'), L.join('\n') + '\n');
console.log(`\n[walk] ${visits.length} visits → ${path.join(OUT, 'walk.md')}`);
console.log(`[walk] page errors on ${summary.pageErrorRoutes.length} routes; 404 wall: ${summary.notFoundWallRoutes.join(', ') || 'none'}; sideways scroll: ${summary.hScrollRoutes.length} visits.`);
// The house walk also fails on what the frame promises: a real title on
// every page, the frame itself, no sideways scroll, and Support one tap away.
const houseFails = HOUSE
  ? visits.filter((v) => !OUTSIDE_FRAME(v.route) && (v.hOverflow || !v.houseFrame || !v.frameSupport.length || v.findings.some((f) => /^no page title/.test(f))))
  : [];
if (HOUSE) console.log(`[walk] house: ${houseFails.length} visits with a missing title, a missing frame, sideways scroll or Support not one tap away${houseFails.length ? `: ${houseFails.slice(0, 10).map((v) => `${v.route} ${v.look} ${v.size} (${v.findings.join(', ')})`).join('; ')}` : ''}.`);
process.exit(errorVisits.length || houseFails.length ? 1 : 0);
