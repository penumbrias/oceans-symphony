// What device sync must NOT carry between devices automatically: how each
// device LOOKS and is LAID OUT.
//
// Owner's rule (Sept 2026): the desktop and the phone are meant to look
// different. Before this, the SystemSettings singleton merged newer-wins —
// resizing a widget on the desktop overwrote the phone's home layout on
// the next sync, and every local preference (theme, fonts, accessibility)
// was filled in from the other device.
//
// Now each snapshot carries these in a separate `appearance` section:
//   { settings: {localStorage prefs}, systemSettings: {look fields} }
// and nothing applies them except the explicit "Use another device's
// appearance" action. They are also stripped from incoming SystemSettings
// rows on read, so a peer on an older build (which still sends them inside
// the record) can't restyle this device either.
//
// Pure functions, no app imports — tested directly with node.

// SystemSettings fields that describe this device's look and layout.
// Libraries the user builds (saved styles, setup packs) stay shared; so do
// identity, terms, privacy, reminders and everything else that is content.
export const DEVICE_LOOK_FIELDS = [
  "classic_home",           // classic home: widgets, pages, bars, wallpaper
  "experimental_home",      // legacy widget board
  "ui_v2",                  // v2 display tokens, bars, dock
  "ui_v2_home",             // v2 home board
  "ui_v2_home_desktop",     // v2 home board, wide-screen variant
  "dashboard_layout",       // classic dashboard section order
  "navigation_config",      // top bar / bottom bar / dashboard grid
  "pinned_alters_config",   // pinned alters strip (+ per-level looks)
  "front_button_icon",      // custom icon on the front button
  "corner_mode",
  "wave_color_key",
  "wave_color_custom",
  "system_banner_height",   // banner crop differs by screen width
  "system_banner_position",
  "system_banner_scope",
  "upcoming_plans_surfaces",
  "notification_prefs",     // toast display preferences
];

const LOOK = new Set(DEVICE_LOOK_FIELDS);

export function pickLookFields(row) {
  const out = {};
  if (!row || typeof row !== "object") return out;
  for (const f of DEVICE_LOOK_FIELDS) if (f in row && row[f] !== undefined) out[f] = row[f];
  return out;
}

// Remove look fields from every SystemSettings row in a dump, IN PLACE.
// Returns the removed look of `primaryRow` (or the first row) — what the
// snapshot's appearance section carries.
export function stripLookFromDump(dump, pickPrimary = (rows) => rows[0] || null) {
  const table = dump && typeof dump === "object" ? dump.SystemSettings : null;
  if (!table || typeof table !== "object") return {};
  const rows = Object.values(table).filter((r) => r && typeof r === "object");
  const primary = pickPrimary(rows);
  const look = pickLookFields(primary);
  for (const row of rows) for (const f of Object.keys(row)) if (LOOK.has(f)) delete row[f];
  return look;
}
