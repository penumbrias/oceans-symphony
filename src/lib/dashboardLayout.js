// Dashboard layout — element ordering + per-element toggles.
//
// Stored on the singleton SystemSettings record as
// `dashboard_layout`: an array of `{ id, enabled }` objects. The order
// of the array determines on-screen order. Any element not in the
// stored array falls back to its position / enabled state from
// DEFAULT_LAYOUT, so new elements introduced in future versions don't
// silently disappear for existing users.
//
// Anchors (id === "quick_nav_menu" right now) can be reordered but
// not toggled off — they're permanent dashboard scaffolding. The
// settings UI hides their toggle.

export const DASHBOARD_ELEMENTS = {
  upcoming_top: {
    label: "Upcoming plans (top)",
    description: "Plans scheduled in the near future. Sits above Currently Fronting.",
  },
  current_fronters: {
    label: "Currently fronting",
    description: "Active fronter list with switch / co-front / set-front controls.",
  },
  status_note: {
    label: "Custom status",
    description: "The 'What's happening right now…' field. Useful even when you're not tracking fronting.",
  },
  dashboard_pins: {
    label: "Pinned bulletins & tasks",
    description: "Anything you've manually pinned to the dashboard.",
  },
  pinned_daily_tasks: {
    label: "Pinned tasks (daily/weekly/monthly)",
    description: "Configurable list of recurring tasks. Pick auto-by-frequency or hand-pick specific tasks; tune the height to fit your dashboard.",
  },
  current_symptoms: {
    label: "Current symptoms",
    description: "Active symptom sessions you've started.",
  },
  quick_checkin: {
    label: "Quick Check-In button",
    description: "Heart-icon button that opens the Quick Check-In modal.",
  },
  new_features_bar: {
    label: "What's new bar",
    description: "Brief 'New in this version' strip.",
  },
  quick_nav_menu: {
    label: "Dashboard grid + search",
    description: "Quick-nav tile grid and the global search.",
    locked: true,
  },
  bulletin_board: {
    label: "Bulletin board (recent activity)",
    description: "Most recent bulletins, with a Load More button to fetch older ones.",
  },
  upcoming_bottom: {
    label: "Upcoming plans (bottom)",
    description: "Plans scheduled in the near future. Sits below the bulletin board.",
  },
};

export const DEFAULT_LAYOUT = [
  { id: "upcoming_top",     enabled: true },
  { id: "current_fronters", enabled: true },
  { id: "status_note",      enabled: true },
  { id: "dashboard_pins",   enabled: true },
  { id: "current_symptoms", enabled: true },
  { id: "quick_checkin",    enabled: true },
  // Pinned tasks default below the Quick Check-In button so the tour's
  // scroll-into-view leaves room for the bottom-nav + tour card on phones —
  // when this widget was higher up, the highlighted check-in button could
  // be hidden behind the bottom chrome. Users who've already saved a
  // custom layout keep their existing order via resolveLayout.
  { id: "pinned_daily_tasks", enabled: true },
  { id: "new_features_bar", enabled: true },
  { id: "quick_nav_menu",   enabled: true },
  { id: "bulletin_board",   enabled: true },
  { id: "upcoming_bottom",  enabled: true },
];

// Returns a layout array that's guaranteed to include every known
// element exactly once, in the user's saved order where present and
// at the default position otherwise. Locked elements always render
// enabled regardless of the stored value.
export function resolveLayout(storedLayout) {
  const stored = Array.isArray(storedLayout) ? storedLayout : [];
  const seen = new Set();
  const out = [];
  // First pass: keep stored entries whose id we still recognise, in
  // their saved order.
  for (const entry of stored) {
    if (!entry || typeof entry !== "object") continue;
    if (!DASHBOARD_ELEMENTS[entry.id]) continue;
    if (seen.has(entry.id)) continue;
    const meta = DASHBOARD_ELEMENTS[entry.id];
    out.push({
      id: entry.id,
      enabled: meta.locked ? true : entry.enabled !== false,
    });
    seen.add(entry.id);
  }
  // Second pass: backfill any elements that weren't in the stored
  // layout (defaults or newly-introduced ids) at their default position
  // relative to the rest of DEFAULT_LAYOUT.
  for (const def of DEFAULT_LAYOUT) {
    if (seen.has(def.id)) continue;
    const meta = DASHBOARD_ELEMENTS[def.id];
    out.push({
      id: def.id,
      enabled: meta.locked ? true : def.enabled,
    });
    seen.add(def.id);
  }
  return out;
}

export function isElementEnabled(layout, id) {
  const entry = layout.find((e) => e.id === id);
  if (!entry) return false;
  const meta = DASHBOARD_ELEMENTS[id];
  if (meta?.locked) return true;
  return entry.enabled !== false;
}
