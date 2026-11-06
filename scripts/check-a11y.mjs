#!/usr/bin/env node
// Accessibility look at the routes a UI change touched (UI critique,
// infrastructure 3). Part of docs/ui-review-guide.md step 3.
//
//   npm run dev                                  # in another terminal
//   npm run check:a11y -- /timeline /checkin-log
//   npm run check:a11y -- /planner --base http://127.0.0.1:5173 --text xl5
//
// For each route, at 390 px, it reports:
//   - axe-core WCAG 2.2 AA violations (a FAIL for "serious" and "critical")
//   - tap targets under 44 px
//   - visible text under 12 px
//   - sideways overflow (the page scrolls left-right)
// `--text xl5` runs at the largest text size (200 %).
// Exits 1 when a route has a serious/critical violation or overflows.
//
// Playwright isn't a project dependency: the cloud container and most dev
// machines have it globally. Install it with `npx playwright install
// chromium` if this says it can't be found.

import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); } catch {
  try { ({ chromium } = require("/opt/node-tools/node_modules/playwright")); } catch {
    console.error("Playwright not found. Install it (npx playwright install chromium) or run where it is.");
    process.exit(2);
  }
}
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const base = opt("--base", "http://127.0.0.1:5173").replace(/\/$/, "");
const textSize = opt("--text", null);
const routes = args.filter((a, i) => a.startsWith("/") && !["--base", "--text"].includes(args[i - 1]));
if (!routes.length) routes.push("/");

// A kept browser profile, so first-run setup happens once; the pages are
// then checked on the built-in example (Preview mode), never your data.
const profile = opt("--profile", join(tmpdir(), "oceans-a11y-profile"));
const ctx = await chromium.launchPersistentContext(profile, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const browser = ctx;
const page = ctx.pages()[0] || await ctx.newPage();
let bad = 0;

try {
  await page.goto(base + "/", { waitUntil: "networkidle" });
} catch (e) {
  console.error(`Couldn't open ${base}. Is the dev server running (npm run dev)?`);
  await browser.close();
  process.exit(2);
}
// First run in this profile: walk through setup without backups.
const tap = async (name) => { try { await page.getByRole("button", { name }).first().click({ timeout: 2500 }); await page.waitForTimeout(1200); return true; } catch { return false; } };
if (await page.getByRole("button", { name: "Enter" }).count()) {
  await tap("Enter"); await tap("Not now"); await tap("Continue without backups");
  await page.waitForTimeout(1500);
  await tap(/Skip guide/);
}
await page.evaluate(() => { try { localStorage.setItem("symphony_preview_active_system", "guide"); } catch { /* storage off */ } });
await page.evaluate((textSize) => {
  try { if (textSize) localStorage.setItem("symphony_a11y_fontSize", textSize); } catch { /* storage off */ }
}, textSize);

for (const route of routes) {
  await page.goto(base + route, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  await page.addScriptTag({ content: axeSource });
  const report = await page.evaluate(async () => {
    // eslint-disable-next-line no-undef
    const r = await axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] });
    const visible = (e) => e.offsetParent || e.getClientRects().length;
    const controls = [...document.querySelectorAll("button, a[href], [role=button], [role=tab], input, select")].filter(visible);
    const small = controls.filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && (b.width < 44 || b.height < 44); });
    let tiny = 0;
    for (const e of document.querySelectorAll("body *")) {
      if (!visible(e) || e.closest("[data-widget-content]")) continue;
      if ([...e.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 12) tiny++;
    }
    return {
      violations: r.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, help: v.help, at: v.nodes[0]?.target?.join(" ") })),
      small: small.length, controls: controls.length, tiny,
      overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    };
  });
  const serious = report.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  if (serious.length || report.overflow) bad++;
  console.log(`\n${route}${textSize ? ` (text ${textSize})` : ""}`);
  for (const v of report.violations) {
    const tag = v.impact === "serious" || v.impact === "critical" ? "FAIL" : "warn";
    console.log(`  ${tag} ${v.id} ×${v.n} (${v.impact}): ${v.help}\n       first: ${v.at}`);
  }
  console.log(`  tap targets under 44 px: ${report.small} of ${report.controls}`);
  console.log(`  text under 12 px (outside widgets): ${report.tiny}`);
  if (report.overflow) console.log("  FAIL the page scrolls sideways");
}

await browser.close();
console.log(bad ? `\n${bad} route(s) need a fix.` : "\nNo serious accessibility failures.");
process.exit(bad ? 1 : 0);
