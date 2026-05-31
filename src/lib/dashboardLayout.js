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
  pinned_alters: {
    label: "Pinned alters",
    description: "Quick-access gallery of alters you've pinned. Tap to toggle front, hold to set primary.",
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
  // Pinned alters defaults ON and sits right below Currently Fronting.
  // The gallery component renders nothing when no alter is pinned, so
  // "enabled by default" effectively means "appears automatically once
  // you pin someone." An explicit toggle-off in Settings → Appearance →
  // Dashboard layout is still respected (saved as enabled: false).
  { id: "pinned_alters",    enabled: true },
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
  // layout (defaults or newly-introduced ids) at their INTENDED
  // position — right after the nearest earlier DEFAULT_LAYOUT sibling
  // that's already present. Previously these were appended at the end,
  // which made a newly-added element (e.g. pinned_alters) land at the
  // bottom of every existing user's dashboard instead of next to its
  // neighbour (just below Currently Fronting).
  DEFAULT_LAYOUT.forEach((def, defIdx) => {
    if (seen.has(def.id)) return;
    const meta = DASHBOARD_ELEMENTS[def.id];
    const entry = { id: def.id, enabled: meta.locked ? true : def.enabled };
    // Find the nearest earlier default that's already in `out` and
    // insert right after it. If none is present, fall back to the
    // front (these are early-in-order elements).
    let insertAt = 0;
    for (let i = defIdx - 1; i >= 0; i--) {
      const pos = out.findIndex((e) => e.id === DEFAULT_LAYOUT[i].id);
      if (pos !== -1) { insertAt = pos + 1; break; }
    }
    out.splice(insertAt, 0, entry);
    seen.add(def.id);
  });
  return out;
}

export function isElementEnabled(layout, id) {
  const entry = layout.find((e) => e.id === id);
  if (!entry) return false;
  const meta = DASHBOARD_ELEMENTS[id];
  if (meta?.locked) return true;
  return entry.enabled !== false;
}
