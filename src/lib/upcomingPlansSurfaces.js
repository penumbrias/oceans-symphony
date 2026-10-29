/**
 * The soft in-app banner that appears while a plan's reminder window is
 * open — the one survivor of the old "Upcoming plans surfaces" list
 * (retired in v0.319.0: placing the Coming up widget on a board IS the
 * opt-in, the per-alter panel always shows its plans, and the bulletin
 * copy is gone).
 *
 * Stored on SystemSettings.upcoming_plans_surfaces as a string[]; older
 * records may still list the retired ids, which are simply ignored. A
 * missing field falls back to the default (banner on). Edited under
 * Settings → Notifications → Reminders.
 */

export const SURFACE_IN_APP_BANNER = "in_app_banner";

export const DEFAULT_SURFACES = [SURFACE_IN_APP_BANNER];

export function getEnabledSurfaces(systemSettings) {
  const raw = systemSettings?.upcoming_plans_surfaces;
  if (!Array.isArray(raw)) return new Set(DEFAULT_SURFACES);
  return new Set(raw);
}

export function isSurfaceEnabled(systemSettings, surface) {
  return getEnabledSurfaces(systemSettings).has(surface);
}
