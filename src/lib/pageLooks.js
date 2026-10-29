// Per-page looks (v0.310.0) — a background (and page song) for ONE page of
// the app: the planner can have a different background from the tasks or
// the journal page.
//
// Stored on SystemSettings.page_looks as { [pageId]: { background } },
// keyed by the ALL_PAGES id (navigationConfig.js) the route belongs to.
// The background is the same object the home board's Display options
// writes (PageBackground.jsx's model), so one editor serves both. The home
// page is NOT in here — its background is the board's own (ui_v2_home /
// classic_home .background) — and a profile page has its own look
// (profileStyle.js), so neither offers "this page".
//
// Writes go through writePageLook: fresh settings row, one page's entry
// replaced, the rest kept. A null entry removes the page's look.

import { base44 } from "@/api/base44Client";
import { ALL_PAGES } from "@/utils/navigationConfig";

export const PAGE_LOOKS_FIELD = "page_looks";

// Routes that are a profile or have no page of their own.
const NO_PAGE_PREFIXES = ["/alter/", "/group/", "/contacts/", "/location/"];

// The ALL_PAGES entry a pathname belongs to (longest path prefix wins), or
// null for the home page, a profile page and anything unlisted.
export function pageForPath(pathname) {
  const p = String(pathname || "/");
  if (p === "/" || p === "") return null;
  if (NO_PAGE_PREFIXES.some((pre) => p.startsWith(pre))) return null;
  let best = null;
  for (const page of ALL_PAGES) {
    if (!page.path || page.path === "/") continue;
    if (p === page.path || p.startsWith(`${page.path}/`)) {
      if (!best || page.path.length > best.path.length) best = page;
    }
  }
  return best;
}

export function readPageLook(settingsRow, pageId) {
  const all = settingsRow?.[PAGE_LOOKS_FIELD];
  if (!pageId || !all || typeof all !== "object") return null;
  const entry = all[pageId];
  return entry && typeof entry === "object" ? entry : null;
}

export function hasPageLook(settingsRow, pageId) {
  const look = readPageLook(settingsRow, pageId);
  return !!(look && look.background && look.background.type && look.background.type !== "none");
}

// `change` is the next entry for this page, or a function of the current
// one; null clears the page's look.
export async function writePageLook(rowOrId, pageId, change) {
  const id = rowOrId && typeof rowOrId === "object" ? rowOrId.id : rowOrId;
  if (!id) throw new Error("There's no settings record to save the page look to yet");
  if (!pageId) throw new Error("No page");
  const row = await base44.entities.SystemSettings.get(id);
  const all = row?.[PAGE_LOOKS_FIELD] && typeof row[PAGE_LOOKS_FIELD] === "object" ? { ...row[PAGE_LOOKS_FIELD] } : {};
  const current = all[pageId] && typeof all[pageId] === "object" ? all[pageId] : null;
  const next = typeof change === "function" ? change(current) : change;
  if (next && typeof next === "object") all[pageId] = next;
  else delete all[pageId];
  await base44.entities.SystemSettings.update(id, { [PAGE_LOOKS_FIELD]: all });
  return all;
}
