// The phone's bottom bar and attention line, as pure rules (new house step
// 2.2, plan decision 1, building code §5 and §14). Tested in
// scripts/test-house-phone.mjs.
//
// The bar is five places: Home and Support locked at the two ends, and the
// person's three in the middle. The middle three default to the Alters place,
// Do (the capture sheet) and the Day. Choosing them is edit mode's job
// (Phase 4); until then `resolvePlaces` reads a list if one is ever passed,
// keeps only places it knows, and fills the rest from the defaults. Nothing
// is stored yet, so there is no setting to lose or migrate.
//
// Names come from pageLabel() in the person's words. A bar label never
// wraps: past 12 characters it is the name's first word, then cut with "…";
// the full name is always the place's accessible name.

import { pageLabel } from "@/utils/navigationConfig";

export const BAR_LABEL_CAP = 12;
export const DEFAULT_MIDDLE = ["alters", "do", "day"];

// Places that aren't a plain page. `day` is the timeline page until the Day
// room (step 3.3) takes its place; the place's id stays "day".
const SPECIAL = {
  home: { id: "home", page: "home", path: "/", locked: true },
  support: { id: "support", page: "support", path: "/grounding", locked: true },
  do: { id: "do", sheet: "do" },
  day: { id: "day", page: "timeline", path: "/timeline" },
};

/** The bar's label for a name: whole when short, else a short form. */
export function shortLabel(name, cap = BAR_LABEL_CAP) {
  const s = String(name || "").trim().replace(/\s+/g, " ");
  if (s.length <= cap) return s;
  const first = s.split(" ")[0].replace(/[&,.:;–-]+$/, "");
  if (first && first.length <= cap) return first;
  return `${s.slice(0, cap - 1)}…`;
}

function placeFor(id, pages, terms) {
  if (id === "do") return { ...SPECIAL.do, name: "Do", label: "Do", full: "Do: quick tools" };
  const spec = SPECIAL[id] || { id, page: id };
  const page = pages.find((p) => p.id === spec.page);
  if (!page) return null;
  const name = id === "support" ? "Support" : pageLabel(page, terms);
  return { ...spec, path: spec.path || page.path, icon: page.icon, name, label: shortLabel(name), full: pageLabel(page, terms) };
}

/**
 * The five places: [home, …middle three, support].
 * `middle`: the person's choice (ids), or nothing for the defaults.
 * `pages`: ALL_PAGES (passed in so tests can stand one in).
 */
export function resolvePlaces(middle, pages, terms) {
  const out = [];
  const seen = new Set(["home", "support"]);
  const want = [...(Array.isArray(middle) ? middle : []), ...DEFAULT_MIDDLE];
  for (const id of want) {
    if (out.length === 3) break;
    if (typeof id !== "string" || seen.has(id)) continue;
    const p = placeFor(id, pages, terms);
    if (!p) continue;
    seen.add(id);
    out.push(p);
  }
  return [placeFor("home", pages, terms), ...out, placeFor("support", pages, terms)].filter(Boolean);
}

/** Is this place the page on screen? */
export function placeIsCurrent(place, pathname) {
  if (!place?.path) return false;
  const p = String(pathname || "/");
  if (place.path === "/") return p === "/";
  if (place.path === "/Home") return p === "/Home" || p.startsWith("/alter/");
  if (place.id === "support") return isSupportRoute(p);
  return p === place.path || p.startsWith(`${place.path}/`);
}

/** Support and safety pages: the attention line keeps only safety notices there. */
export function isSupportRoute(pathname) {
  return /^\/(grounding|safety-plan|emergency|unblend)(\/|$|\?)/i.test(String(pathname || ""));
}

/**
 * What the attention line shows: one item, and how many wait behind it.
 * items: highest priority first (useZoneItems). `quiet`: a Support page, so
 * only items marked `safety` may show. `at`: which waiting item the person
 * stepped to with "+N" (wraps).
 */
export function pickAttention(items, { quiet = false, at = 0 } = {}) {
  const list = (items || []).filter((i) => i && (!quiet || i.safety));
  if (!list.length) return { item: null, rest: 0, waiting: (items || []).length };
  // A failed save always holds the line (RULE ZERO): stepping doesn't pass it.
  const pinned = list.find((i) => i.sticky);
  const n = list.length;
  const item = pinned || list[((at % n) + n) % n];
  return { item, rest: n - 1, waiting: (items || []).length - n };
}
