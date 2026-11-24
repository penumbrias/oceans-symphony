// A page's real name for the frame's header, its open-page tab and the
// browser title (new house step 2.1; plan check 14 "Found and named"; the
// explorer walk found every route titled the same).
//
// Names come from pageLabel() and NAV_AREAS (src/utils/navigationConfig.js),
// the one name per page. Only routes that have no page entry of their own
// are named here (SUBPAGE_NAMES): a sub-page and the privacy page. A profile
// is named by its record; until the record is loaded, by its kind in the
// person's words. Pure, so scripts/test-house-frame.mjs runs it.

import { ALL_PAGES, NAV_AREAS, pageLabel } from "@/utils/navigationConfig";

export const APP_NAME = "Oceans Symphony";

// Routes with no ALL_PAGES entry. Not page labels (those stay in
// navigationConfig): the parent page's area is used for each.
const SUBPAGE_NAMES = {
  "/manage-checkin": { title: () => "Manage check-ins", parent: "checkin-log" },
  "/unblend/questions": { title: () => "Unblend questions", parent: "unblend" },
  "/privacy": { title: () => "Privacy", parent: "settings" },
  // The old Notes route: the page entry "notes" (folded into the Notebook).
  "/notes": { title: (t) => pageLabel("notes", t), parent: "goals" },
  // An experimental page leaves ALL_PAGES while its switch is off.
  "/mods": { title: () => "Mods", parent: "mods" },
};

const PROFILE_KINDS = {
  alter: { list: "alters", parent: "alters", kind: (t) => t?.Alter || "Alter" },
  group: { list: "groups", parent: "groups", kind: () => "Group" },
  contacts: { list: "contacts", parent: "contacts", kind: () => "Contact" },
  location: { list: "innerWorldLocations", parent: "system-map", kind: () => "Place" },
  bulletin: { list: null, parent: "bulletins", kind: () => "Post" },
};

function pathOnly(p) {
  const s = String(p || "/").split("#")[0];
  const [path, search = ""] = s.split("?");
  return { path: path || "/", search };
}

/** The ALL_PAGES entry for a route: exact path first, then the longest prefix. */
export function pageForRoute(pathname, search = "", pages = ALL_PAGES) {
  const { path } = pathOnly(pathname);
  const q = new URLSearchParams(search || pathOnly(pathname).search);
  let best = null;
  for (const page of pages) {
    if (!page.path) continue;
    const [pp, pq] = page.path.split("?");
    let hit = false;
    if (pp === "/") hit = path === "/";
    else hit = path === pp || path.startsWith(`${pp}/`);
    if (!hit) continue;
    // A page entry that needs a query (Notes & lists) only wins when it's there.
    if (pq) {
      const need = new URLSearchParams(pq);
      if ([...need.entries()].some(([k, v]) => q.get(k) !== v)) continue;
    }
    const score = pp.length * 2 + (pq ? 1 : 0);
    if (!best || score > best.score) best = { page, score };
  }
  return best ? best.page : null;
}

/** The area (NAV_AREAS) a page id sits in, its label resolved. */
export function areaFor(pageId, terms) {
  const area = NAV_AREAS.find((a) => a.pages.includes(pageId));
  if (!area) return null;
  return { id: area.id, label: area.label === "{System}" ? (terms?.System || "System") : area.label };
}

/**
 * { title, pageId, area, kind } for a route.
 * records: { alters, groups, contacts, innerWorldLocations } (any may be missing).
 * formatAlter: the person's alter label (useAlterLabel), else the name.
 */
export function resolvePageTitle(pathname, { search = "", terms, records = {}, formatAlter } = {}) {
  const { path } = pathOnly(pathname);
  const prof = path.match(/^\/(alter|group|contacts|location|bulletin)\/([^/]+)/);
  if (prof) {
    const def = PROFILE_KINDS[prof[1]];
    const list = def.list && Array.isArray(records[def.list]) ? records[def.list] : [];
    const rec = list.find((r) => r && String(r.id) === decodeURIComponent(prof[2]));
    let title = def.kind(terms);
    if (rec) {
      const named = prof[1] === "alter" && formatAlter ? formatAlter(rec) : (rec.name || rec.title);
      if (named) title = String(named);
    }
    return { title, pageId: def.parent, area: areaFor(def.parent, terms), kind: "profile" };
  }
  const sub = SUBPAGE_NAMES[path];
  if (sub) return { title: sub.title(terms), pageId: sub.parent, area: areaFor(sub.parent, terms), kind: "page" };
  const page = pageForRoute(path, search);
  if (page) {
    // A folded page (Notes & lists) sits in the area of the page it lives in.
    const areaId = page.folded ? (pageForRoute(path, "", ALL_PAGES.filter((p) => !p.folded))?.id || page.id) : page.id;
    const area = page.isMod ? { id: "mods", label: "Mods" } : areaFor(areaId, terms);
    return { title: pageLabel(page, terms), pageId: page.id, area, kind: "page" };
  }
  // A mod's page whose mod isn't switched on (yet).
  if (/^\/mod\/[^/]+\/[^/]+/.test(path)) return { title: "Mod page", pageId: "mods", area: { id: "mods", label: "Mods" }, kind: "page" };
  return { title: "Page not found", pageId: null, area: null, kind: "unknown" };
}

/** The browser title: the page's name, then the app's. */
export function documentTitleFor(title) {
  const t = String(title || "").trim();
  return t && t !== APP_NAME ? `${t} · ${APP_NAME}` : APP_NAME;
}
