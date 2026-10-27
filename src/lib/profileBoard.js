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

export const GROUP_PROFILE_PAGES = [
  { tab: "profile", label: "Profile", widgets: [
    "profile_header", "profile_bio", "profile_nested_groups", "profile_members",
  ] },
  { tab: "board", label: "Board", widgets: ["profile_board"] },
  { tab: "notes", label: "Notes", widgets: ["profile_notes"] },
  { tab: "journal", label: "Journal", widgets: ["profile_journal"] },
];

export const CONTACT_PROFILE_PAGES = [
  { tab: "about", label: "About", widgets: ["profile_header", "profile_about"] },
  { tab: "relationships", label: "Relationships", widgets: ["profile_relationships"] },
  { tab: "boundaries", label: "Boundaries & Rules", widgets: ["profile_boundaries"] },
  { tab: "notes", label: "Notes", widgets: ["profile_notes"] },
  { tab: "options", label: "Options", widgets: ["profile_options"] },
];

export const LOCATION_PROFILE_PAGES = [
  { tab: "profile", label: "Profile", widgets: [
    "profile_header", "profile_bio", "profile_on_map", "profile_members", "profile_sub_locations",
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
  const pages = PROFILE_PAGES[ownerType] || ALTER_PROFILE_PAGES;
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
        widgets: p.widgets.map((widgetId) => {
          counts[widgetId] = (counts[widgetId] || 0) + 1;
          const w = {
            instanceId: seedInstanceId(p.tab, widgetId, counts[widgetId] > 1 ? counts[widgetId] : 0),
            widgetId,
            span: { ...PROFILE_SEED_SPAN },
            pos: { x: 0, y },
            mode: "normal",
            settings: {},
          };
          y += PROFILE_SEED_SPAN.rows;
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
