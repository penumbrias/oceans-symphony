// "Use the pixel layout" (pixel look only) — the home screen arranged like
// the Pixel app preview mockups (01-Main on a computer, 08-Phone on a
// phone), as a NEW page on the home board.
//
// The home screen is the person's own saved board, so this never rewrites
// it: it only adds one page, built from widgets the app already has, and
// leaves every other page, widget (unknownWidgets included), the default
// page and the board's settings exactly as they were. The caller writes it
// through the board writer (writeBoard), which reads the row fresh and
// stamps the change as the person's edit, and it confirms first.
//
// Pure: no React, no storage. Tests: node scripts/test-pixel-home-layout.mjs

import { newInstanceId, newPageId, flowRepack } from "@/lib/experimentalHome";

// The home board is a flow page on a 4-column grid. Widths are in those
// columns and step by quarters, so the mockup's three equal columns are
// 1.25 + 1.5 + 1.25. Rows are filled in order and wrap when full.
//
// Computer (01-Main): who's fronting · coming up · what's going on;
// status · routines · quick check-in. The mockup's Timeline and Info
// panels are the pixel frame's own timeline dock and side panel, so they
// are not widgets here.
export const PIXEL_DESK_WIDGETS = [
  { widgetId: "current_fronters", cols: 1.25 },
  { widgetId: "upcoming_top", cols: 1.5 },
  { widgetId: "current_focus", cols: 1.25 },
  { widgetId: "status_note", cols: 1.25 },
  { widgetId: "pinned_daily_tasks", cols: 1.5 },
  { widgetId: "quick_checkin", cols: 1.25 },
];

// Phone (08-Phone): one column — who's fronting, status, today on the
// timeline, coming up.
export const PIXEL_PHONE_WIDGETS = [
  { widgetId: "current_fronters", cols: 4 },
  { widgetId: "status_note", cols: 4 },
  { widgetId: "timeline_days", cols: 4, mode: "minimal" },
  { widgetId: "upcoming_top", cols: 4 },
];

export const PIXEL_PAGE_LABELS = { desk: "Pixel desk", phone: "Pixel phone" };
const GRID_COLS = 4;

// A label no page on the board has yet: "Pixel desk", "Pixel desk 2", …
export function freePageLabel(base, pages = []) {
  const taken = new Set((pages || []).map((p) => String(p?.label || "").trim().toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; n < 1000; n += 1) {
    const label = `${base} ${n}`;
    if (!taken.has(label.toLowerCase())) return label;
  }
  return `${base} ${Date.now()}`;
}

// The new page. `registry` decides which widgets exist (one this build
// doesn't have is skipped, never stored as a broken widget). `pages` is
// the board's current pages, only read for a free name.
export function buildPixelHomePage(registry = {}, shape = "desk", pages = []) {
  const spec = shape === "phone" ? PIXEL_PHONE_WIDGETS : PIXEL_DESK_WIDGETS;
  const widgets = [];
  for (const s of spec) {
    const def = registry[s.widgetId];
    if (!def) continue;
    const maxC = def.maxSpan?.cols ?? 12;
    const minC = def.minSpan?.cols ?? 1;
    const cols = Math.max(minC, Math.min(maxC, GRID_COLS, s.cols));
    const supported = def.supportsModes || ["normal"];
    widgets.push({
      instanceId: newInstanceId(),
      widgetId: s.widgetId,
      // One row each: the flow page sizes every card to its content.
      span: { cols, rows: 1 },
      mode: s.mode && supported.includes(s.mode) ? s.mode : "normal",
      settings: {},
    });
  }
  // Positions from the order, the same rule the flow page itself uses.
  const placed = flowRepack(widgets, GRID_COLS);
  return {
    id: newPageId(),
    label: freePageLabel(PIXEL_PAGE_LABELS[shape === "phone" ? "phone" : "desk"], pages),
    layoutMode: "free",
    widgets: placed,
    // A phone-shaped page stays a phone-width column on a wider screen.
    showAs: shape === "phone" ? "phone" : "auto",
  };
}

// The board with the page added at the end. Everything else on the board
// is passed through untouched — other pages (and their unknownWidgets),
// the default page, removed-page marks, look and tidy-up stamps. Returns
// null for a board that isn't there (never a fresh board in its place).
export function withPixelHomePage(board, page) {
  if (!board || typeof board !== "object" || !page) return null;
  const pages = Array.isArray(board.pages) ? board.pages : [];
  if (pages.some((p) => p?.id === page.id)) return null;
  return { ...board, pages: [...pages, page] };
}

