// Profile boards (v0.289.0) — the layout of a profile page (an alter, a
// group or subsystem, a contact, an inner-world location) as a widget
// board, the same shape the home screen uses (experimentalHome.js).
//
// Pure — no imports beyond boardStamp / syncMerge, which are pure too — so
// scripts/test-profile-board.mjs can run it under plain node.
//
// The record stays what it is. The layout is a separate `ProfileBoard` row:
//   { owner_type: "alter"|"group"|"contact"|"location", owner_id, board }
// A profile with NO row renders seedProfileBoard(record) every time it
// opens: today's page, one page per tab, every section a widget. The row is
// created on the person's first layout edit and never before, so a fresh
// install, a restored backup and an older device all show the same profile
// from the same record.
//
// Two devices can each make that first edit before they sync, which leaves
// two rows for one owner. pickProfileBoardRows folds them: the newest row
// is the keeper, the others' boards merge in page by page (mergeBoards),
// and the next write by a person moves the extras to the trash.

import { mergeBoards } from "./syncMerge.js";

export const PROFILE_OWNER_TYPES = ["alter", "group", "contact", "location"];

export const isProfileOwnerType = (t) => PROFILE_OWNER_TYPES.includes(t);

// A default layout for a profile type (v0.292.0) is a ProfileBoard row
// whose owner is this id. A profile with no row of its own renders the
// default when one exists, else the seed; its own row is created on the
// person's first edit, from whatever it was showing.
export const DEFAULT_OWNER_ID = "__default__";
export const isDefaultOwnerId = (id) => id === DEFAULT_OWNER_ID;

// A board as it travels to another profile ("use this layout for all",
// "use as default"): the pages and the look, none of the bookkeeping that
// belongs to the board it came from (change times, removed pages, heals,
// the seeded marker). Pure; the store stamps the copy on write.
export function layoutForCopy(board) {
  if (!board || typeof board !== "object") return null;
  const out = {};
  for (const [k, v] of Object.entries(board)) {
    if (k.startsWith("_")) continue;
    out[k] = v;
  }
  out.pages = (Array.isArray(board.pages) ? board.pages : []).map((p) => {
    const page = {};
    for (const [k, v] of Object.entries(p || {})) { if (!k.startsWith("_")) page[k] = v; }
    return page;
  });
  return out;
}

// A page per tab. The id keeps the tab name so every `?tab=` deep link
// (notifications, the tour, search, the Needs page…) lands on its page.
export const profilePageId = (tab) => `tab:${tab}`;
export const tabOfPageId = (pageId) =>
  typeof pageId === "string" && pageId.startsWith("tab:") ? pageId.slice(4) : null;

// The alter profile's tabs, in today's order, with the widgets each page
// starts with (top to bottom). The alter widgets are registered in
// src/v2/profileWidgets.jsx (v0.290.0); the other types' ids follow in
// their own PRs — until then a seeded board resolves with those in
// `unknownWidgets`, which the canvas keeps and never drops.
export const ALTER_PROFILE_PAGES = [
  { tab: "profile", label: "Profile", widgets: [
    "profile_header", "profile_preferences", "profile_bio", "profile_groups",
    "profile_subsystems", "profile_answers", "profile_tags", "profile_fields",
  ] },
  { tab: "info", label: "Info", widgets: ["profile_info"] },
  { tab: "messages", label: "Board", widgets: ["profile_board"] },
  { tab: "private-messages", label: "Messages", widgets: ["profile_inbox"] },
  { tab: "history", label: "History", widgets: ["profile_front_history"] },
  { tab: "notes", label: "Notes", widgets: ["profile_notes"] },
  { tab: "wishlist", label: "Wishlist", widgets: ["profile_wishlist"] },
  { tab: "journal", label: "Journal", widgets: ["profile_journal"] },
  { tab: "lineage", label: "Lineage", widgets: ["profile_lineage"] },
  { tab: "relationships", label: "Relationships", widgets: ["profile_relationships"] },
  { tab: "locations", label: "Locations", widgets: ["profile_places"] },
  { tab: "activities", label: "Activities", widgets: ["profile_activity_links"] },
  { tab: "options", label: "Options", widgets: ["profile_options"] },
];

// The garden layout (v0.297.0): the alter profile's Profile page built from
// the info widgets — the header, their Pictures (a Media widget that shows
// whatever is in the alter's Pictures), the bio as an Info widget, then the
// rest of the info. New alters start on it (createAlter stamps
// profile_layout: "garden"), and so does a profile the person converts.
// The other pages are the classic ones. An entry is a widget id, or
// { widgetId, settings, span } for a widget that starts set up.
export const GARDEN_PICTURES_WIDGET = { widgetId: "media", settings: { source: "pictures", autoFit: false }, span: { cols: 12, rows: 3 } };
export const GARDEN_BIO_WIDGET = { widgetId: "info", settings: { entries: ["bio"], layout: "plain" } };
export const GARDEN_ALTER_PROFILE_PAGES = [
  { tab: "profile", label: "Profile", widgets: [
    "profile_header", GARDEN_PICTURES_WIDGET, GARDEN_BIO_WIDGET, "profile_preferences", "profile_fields",
    "profile_groups", "profile_subsystems", "profile_answers", "profile_tags",
  ] },
  ...ALTER_PROFILE_PAGES.slice(1),
];
export const isGardenProfile = (record) => record?.profile_layout === "garden";

// The new profile (v0.305.0): seven pages built from the purpose-built
// profile widgets (src/v2/gardenProfileWidgets.jsx and friends). An alter
// on it has profile_layout: "v2"; switching back puts the value it had
// before (profile_layout_before_v2) back.
//
// Its layout is a separate ProfileBoard row, owned by `${id}::v2` (and its
// default by `__default__::v2`), so the classic layout row is never touched:
// switching between the two is lossless both ways, and an older app version
// (which reads only the row owned by the plain id) never sees, folds or
// trashes the new one.
export const NEW_PROFILE_LAYOUT = "v2";
export const NEW_LAYOUT_SUFFIX = "::v2";
export const usesNewProfile = (record) => record?.profile_layout === NEW_PROFILE_LAYOUT;
// Which profile types have a new profile (alters v0.305.0, groups
// v0.307.0) — filled in below, once the page lists exist.
export const NEW_PROFILE_PAGES = {};
export const hasNewProfile = (ownerType) => !!NEW_PROFILE_PAGES[ownerType];
export const layoutSuffixFor = (record, ownerType = "alter") =>
  hasNewProfile(ownerType) && usesNewProfile(record) ? NEW_LAYOUT_SUFFIX : "";
// Every owner id a record's layouts can be stored under (for deletes).
export const layoutOwnerIds = (id) => (id ? [String(id), `${id}${NEW_LAYOUT_SUFFIX}`] : []);

export const NEW_PROFILE_AVATAR_WIDGET = { widgetId: "media", settings: { source: "avatar", shape: "box", fit: "cover" }, span: { cols: 12, rows: 4 } };
export const NEW_PROFILE_BIO_WIDGET = { widgetId: "info", settings: { entries: ["bio"], layout: "plain" } };
export const NEW_PROFILE_FIELDS_WIDGET = { widgetId: "info", settings: { entries: ["*fields"], layout: "labelled" } };
export const NEW_ALTER_PROFILE_PAGES = [
  { tab: "profile", label: "Profile", widgets: [
    { widgetId: "alter_identity", settings: { showAvatar: false } },
    NEW_PROFILE_AVATAR_WIDGET, NEW_PROFILE_BIO_WIDGET, NEW_PROFILE_FIELDS_WIDGET,
    "alter_belongs", "alter_preferences", "alter_tags", "alter_answers",
  ] },
  { tab: "fronting", label: "{{Fronting}}", widgets: ["alter_fronting_stats", "alter_fronting_sessions"] },
  { tab: "messages", label: "Messages", widgets: [
    { widgetId: "alter_inbox", mode: "expanded" }, { widgetId: "alter_board_feed", mode: "expanded" },
  ] },
  { tab: "notes", label: "Notes", widgets: [{ widgetId: "alter_notes", mode: "expanded", settings: { count: 20 } }] },
  { tab: "journal", label: "Journal", widgets: ["journal"] },
  { tab: "wishes", label: "Wishes", widgets: [{ widgetId: "wishes", mode: "expanded" }] },
  { tab: "connections", label: "Connections", widgets: [
    "alter_relationships", "alter_lineage", "inner_locations", "alter_activity_links",
  ] },
];
// Old ?tab= names (notifications, search, the tour, saved links) land on
// the page that holds the same thing now.
export const NEW_PROFILE_TAB_ALIASES = {
  info: "profile", options: "profile",
  history: "fronting",
  "private-messages": "messages",
  wishlist: "wishes",
  lineage: "connections", relationships: "connections", locations: "connections", activities: "connections",
};

// The new group profile (v0.307.0): the group's own widgets
// (src/v2/gardenGroupWidgets.jsx), the shared bulletin board (which opens
// on the group's board) and the shared journal (its members' entries).
// Every old ?tab= name (profile, board, notes, journal) is still a page.
export const NEW_GROUP_PROFILE_PAGES = [
  { tab: "profile", label: "Profile", widgets: ["group_identity", "group_about", "group_members", "group_nested"] },
  { tab: "fronting", label: "{{Fronting}}", widgets: [{ widgetId: "group_fronting", mode: "expanded" }] },
  { tab: "board", label: "Board", widgets: ["bulletin_board"] },
  { tab: "notes", label: "Notes", widgets: [{ widgetId: "group_notes", mode: "expanded", settings: { count: 20 } }] },
  { tab: "journal", label: "Journal", widgets: ["journal"] },
];
// The new contact profile (v0.308.0). Every old ?tab= name (about,
// relationships, boundaries, notes, options) is still a page; time together
// moved off every page onto About.
export const NEW_CONTACT_PROFILE_PAGES = [
  { tab: "about", label: "About", widgets: [
    "contact_identity", "contact_together", "contact_reach", "contact_details",
  ] },
  { tab: "relationships", label: "Relationships", widgets: ["profile_relationships"] },
  { tab: "boundaries", label: "Boundaries & Rules", widgets: [
    { widgetId: "contact_details", settings: { entries: ["boundaries", "system_rules"] } },
  ] },
  { tab: "notes", label: "Notes", widgets: [{ widgetId: "contact_notes", mode: "expanded", settings: { count: 20 } }] },
  { tab: "options", label: "Options", widgets: ["profile_options"] },
];
// The new location profile (v0.309.0): one page, as before; its place on
// the map stays a tap away on the identity widget.
export const NEW_LOCATION_PROFILE_PAGES = [
  { tab: "profile", label: "Profile", widgets: [
    "location_identity", "location_about", "location_alters", "location_places",
  ] },
];
NEW_PROFILE_PAGES.alter = NEW_ALTER_PROFILE_PAGES;
NEW_PROFILE_PAGES.group = NEW_GROUP_PROFILE_PAGES;
NEW_PROFILE_PAGES.contact = NEW_CONTACT_PROFILE_PAGES;
NEW_PROFILE_PAGES.location = NEW_LOCATION_PROFILE_PAGES;

export const GROUP_PROFILE_PAGES = [
  { tab: "profile", label: "Profile", widgets: [
    "profile_header", "profile_bio", "profile_nested_groups", "profile_members",
  ] },
  { tab: "board", label: "Board", widgets: ["profile_board"] },
  { tab: "notes", label: "Notes", widgets: ["profile_notes"] },
  { tab: "journal", label: "Journal", widgets: ["profile_journal"] },
];

// The "I'm with them" button sat above the tabs, on every tab — so every
// page starts with it.
export const CONTACT_PROFILE_PAGES = [
  { tab: "about", label: "About", widgets: ["profile_header", "profile_encounter", "profile_about"] },
  { tab: "relationships", label: "Relationships", widgets: ["profile_encounter", "profile_relationships"] },
  { tab: "boundaries", label: "Boundaries & Rules", widgets: ["profile_encounter", "profile_boundaries"] },
  { tab: "notes", label: "Notes", widgets: ["profile_encounter", "profile_notes"] },
  { tab: "options", label: "Options", widgets: ["profile_encounter", "profile_options"] },
];

export const LOCATION_PROFILE_PAGES = [
  { tab: "profile", label: "Profile", widgets: [
    "profile_header", "profile_bio", "profile_sub_locations", "profile_members", "profile_on_map",
  ] },
];

export const PROFILE_PAGES = {
  alter: ALTER_PROFILE_PAGES,
  group: GROUP_PROFILE_PAGES,
  contact: CONTACT_PROFILE_PAGES,
  location: LOCATION_PROFILE_PAGES,
};

// The seeded board is full width, one widget under the other, and is shown
// in the canvas's view-flow mode (every card at its natural height), which
// is exactly how the page stacks today. Spans are nominal: view-flow
// ignores rows, and the first real edit re-fits.
export const PROFILE_SEED_SPAN = { cols: 12, rows: 2 };

// Deterministic instance ids: the same record seeds the same board on every
// open, on every device, so nothing is ever "different" until it is edited.
export const seedInstanceId = (pageTab, widgetId, n) => `seed_${pageTab}_${widgetId}${n ? `_${n}` : ""}`;

export function seedProfileBoard(record, ownerType = "alter") {
  const pages = hasNewProfile(ownerType) && usesNewProfile(record)
    ? NEW_PROFILE_PAGES[ownerType]
    : ownerType === "alter" && isGardenProfile(record)
      ? GARDEN_ALTER_PROFILE_PAGES
      : PROFILE_PAGES[ownerType] || ALTER_PROFILE_PAGES;
  let y;
  return {
    version: 2,
    enabled: true,
    styleMode: "current",
    actionBar: { enabled: false, buttonIds: [] },
    altersBar: { enabled: false },
    wallpaper: { url: "" },
    grid: { phoneCols: 4, rowPx: 80 },
    drawer: { order: [], folders: [] },
    defaultPageId: profilePageId(pages[0].tab),
    // The row only exists after a person's first edit; a seeded board that
    // is written (by "use this layout for all", say) drops the marker.
    _seeded: true,
    pages: pages.map((p) => {
      y = 0;
      const counts = {};
      return {
        id: profilePageId(p.tab),
        label: p.label,
        layoutMode: "free",
        showAs: "auto",
        widgets: p.widgets.map((entry) => {
          const widgetId = typeof entry === "string" ? entry : entry.widgetId;
          const span = { ...PROFILE_SEED_SPAN, ...(typeof entry === "object" ? entry.span : null) };
          counts[widgetId] = (counts[widgetId] || 0) + 1;
          const w = {
            instanceId: seedInstanceId(p.tab, widgetId, counts[widgetId] > 1 ? counts[widgetId] : 0),
            widgetId,
            span,
            pos: { x: 0, y },
            mode: (typeof entry === "object" && entry.mode) || "normal",
            settings: typeof entry === "object" && entry.settings ? { ...entry.settings } : {},
          };
          y += span.rows;
          return w;
        }),
      };
    }),
  };
}

// The one row a profile's layout is read from, out of however many exist
// (none, one, or duplicates from two devices' first edits). Returns
// { keeper, extras, board }: the newest row, the rest, and the board with
// every row's pages folded in. Never writes.
const ms = (iso) => { const n = Date.parse(iso || ""); return Number.isFinite(n) ? n : 0; };
const rowTime = (r) => Math.max(ms(r?.updated_date), ms(r?.created_date), ms(r?.board?._lt));

export function pickProfileBoardRows(rows) {
  const live = (Array.isArray(rows) ? rows : []).filter((r) => r && typeof r === "object" && !r.trashed_at);
  if (!live.length) return { keeper: null, extras: [], board: null };
  const sorted = [...live].sort((a, b) => rowTime(b) - rowTime(a) || String(a.id).localeCompare(String(b.id)));
  const keeper = sorted[0];
  const extras = sorted.slice(1);
  let board = keeper.board && typeof keeper.board === "object" ? keeper.board : null;
  for (const r of extras) {
    if (!r.board || typeof r.board !== "object") continue;
    board = board ? mergeBoards(board, r.board, keeper.updated_date || "", r.updated_date || "") : r.board;
  }
  return { keeper, extras, board };
}
