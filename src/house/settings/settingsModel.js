// The house's Settings room (board 07-Settings, board 10-Inspector's shell,
// board 08-Phone's language): the pure rules, kept apart from the room so
// scripts/test-house-settings.mjs can test them without a browser.
//
// The catalogue of pages is the old one (src/components/settings/
// settingsPages.jsx, buildSettingsGroups): one list, so both houses offer
// the same pages, the same search and the same deep links. This file only
// decides what the address means and how the room words it.

// The pages whose changes the Preview panel shows (board 07's right column).
export const LOOK_PAGES = Object.freeze(["display", "accessibility"]);
export const isLookPage = (id) => LOOK_PAGES.includes(id);

// What the address asks for. The page is the hash (`/settings#display`), as
// in the old house, so every link in the app lands. Older links still
// land: a legacy hash is mapped through `legacy` (LEGACY_HASHES), and the
// one older query form, `?section=appearance`, is read as that hash.
//
//   { kind: "home" } | { kind: "group", groupId } | { kind: "page", id }
export function settingsTarget({ hash = "", search = "", legacy = {} } = {}) {
  let raw = String(hash || "").replace(/^#/, "");
  if (!raw) {
    try { raw = new URLSearchParams(search || "").get("section") || ""; } catch { raw = ""; }
  }
  try { raw = decodeURIComponent(raw); } catch { /* keep it as typed */ }
  raw = raw.trim();
  if (!raw) return { kind: "home" };
  const mapped = Object.prototype.hasOwnProperty.call(legacy, raw) ? legacy[raw] : raw;
  if (mapped.startsWith("group:")) return { kind: "group", groupId: mapped.slice(6) };
  return { kind: "page", id: mapped };
}

/** The page and its group, or null (an unknown hash shows the home list). */
export function findPage(groups = [], id) {
  if (!id) return null;
  for (const g of groups) for (const p of g.pages || []) if (p.id === id) return { page: p, group: g };
  return null;
}

/** Where a row goes: its own address, so a middle click opens it in a new tab. */
export function hrefFor(page) {
  return `/settings#${encodeURIComponent(page.id)}`;
}

/** Does pressing the row open a page here, or run its action (a sheet, a panel)? */
export function rowOpensPage(page) {
  return !!page?.render;
}

// The page's title bar, as board 07 words it ("Appearance: the look"):
// the group, then the page.
export function pageHeading(group, page) {
  if (!page) return "Settings";
  return group?.label ? `${group.label}: ${page.label}` : page.label;
}

// The words on the right of the title bar: board 07's "every change shows
// live" on the look pages (they are), else the page's own one-line hint.
export function pageAside(page) {
  if (!page) return "";
  if (isLookPage(page.id)) return "every change shows live";
  return page.hint || "";
}

/** "v0.390.0 alpha": the version testers cite, with the release stage. */
export function versionWords(version, stage) {
  return `v${version}${stage ? ` ${stage}` : ""}`;
}

// How many pages the list holds (the Find line says "12 of 52").
export function countPages(groups = []) {
  return groups.reduce((n, g) => n + (g.pages || []).length, 0);
}

// "No settings match …" / "3 settings match" for the screen reader line.
export function findWords(query, shown, total) {
  const q = String(query || "").trim();
  if (!q) return `${total} settings`;
  if (!shown) return `No settings match "${q}"`;
  return `${shown} of ${total} settings match "${q}"`;
}

// The phone's list remembers where it was, so Back from a page lands on the
// same row (module memory, like the old page's; nothing is stored).
let lastList = null;
export function rememberList(state) { lastList = state ? { ...state } : null; }
export function takeList() { const s = lastList; lastList = null; return s; }
