/**
 * Customisable rendering surfaces for the Upcoming Plans feature.
 *
 * The user picks where they want planned activities to show up — the
 * Activity Tracker page always has a Planned tab (it's the page of
 * record), but the surfaces below are opt-in to keep the dashboard
 * uncluttered by default.
 *
 * Stored on SystemSettings.upcoming_plans_surfaces as a string[].
 * Missing field falls back to the default below — designed for low
 * clutter (alter-panel + soft notifications, no Home widget).
 */

export const SURFACE_HOME_TOP        = "home_top";
export const SURFACE_HOME_BOTTOM     = "home_bottom";
export const SURFACE_ALTER_PANEL     = "alter_panel";
export const SURFACE_BULLETIN_TOP    = "bulletin_top";
export const SURFACE_IN_APP_BANNER   = "in_app_banner";
export const SURFACE_PUSH            = "push";

export const ALL_SURFACES = [
  // NOTE: The home_top / home_bottom surface IDs are historical — they're
  // persisted in every user's SystemSettings.upcoming_plans_surfaces, so
  // renaming the IDs would silently turn the toggle off for everyone.
  // In the user's mental model these surfaces belong to the Dashboard
  // ("/", the actual home page in the bottom-nav user model) — the labels
  // and hints reflect that even though the underlying ID still says "home".
  { id: SURFACE_HOME_TOP,      label: "Top of Dashboard",                  hint: "Above Currently Fronting on the Dashboard." },
  { id: SURFACE_HOME_BOTTOM,   label: "Bottom of Dashboard",               hint: "Below the bulletin board on the Dashboard." },
  { id: SURFACE_ALTER_PANEL,   label: "Currently-fronting alter panel",    hint: "Inline \"Plans for me\" inside the per-alter panel that opens when you tap a fronting chip." },
  { id: SURFACE_BULLETIN_TOP,  label: "Top of Bulletin Board",             hint: "Above the bulletin feed." },
  { id: SURFACE_IN_APP_BANNER, label: "Soft in-app banner near reminder",  hint: "Surfaces a banner when a planned activity is within its reminder window." },
  { id: SURFACE_PUSH,          label: "Push notification near reminder",   hint: "Only fires if push notifications are configured." },
];

export const DEFAULT_SURFACES = [
  SURFACE_ALTER_PANEL,
  SURFACE_IN_APP_BANNER,
  SURFACE_PUSH,
];

export function getEnabledSurfaces(systemSettings) {
  const raw = systemSettings?.upcoming_plans_surfaces;
  if (!Array.isArray(raw)) return new Set(DEFAULT_SURFACES);
  return new Set(raw);
}

export function isSurfaceEnabled(systemSettings, surface) {
  return getEnabledSurfaces(systemSettings).has(surface);
}
