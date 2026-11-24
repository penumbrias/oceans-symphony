// The open-page tabs' state (building code §2): bookmarks, not live pages.
// The current tab follows wherever the person goes; "+" opens Home in a new
// one; closing the current tab goes to its neighbour. Kept per device in
// localStorage (HOUSE_TABS_KEY) as plain runtime state, like the old pixel
// tabs: not a preference, so not backed up, and losing it loses no data.
// Pure functions, tested in scripts/test-house-frame.mjs.

export const HOUSE_TABS_KEY = "symphony_house_tabs_v1";
export const MAX_TABS = 20;

const newId = () => `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export function readTabs(raw, here = "/") {
  try {
    const v = JSON.parse(raw || "null");
    if (v && Array.isArray(v.tabs)) {
      const tabs = v.tabs.filter((t) => t && typeof t.id === "string" && typeof t.path === "string" && t.path.startsWith("/")).slice(0, MAX_TABS);
      if (tabs.length) return { tabs, active: tabs.some((t) => t.id === v.active) ? v.active : tabs[0].id };
    }
  } catch { /* fall through */ }
  const id = newId();
  return { tabs: [{ id, path: here }], active: id };
}

/** The current tab now shows `path`. */
export function followTo(state, path) {
  const cur = state.tabs.find((t) => t.id === state.active);
  if (!cur || cur.path === path) return state;
  return { ...state, tabs: state.tabs.map((t) => (t.id === state.active ? { ...t, path } : t)) };
}

export function openTab(state, path = "/", id = newId()) {
  const tabs = [...state.tabs, { id, path }].slice(-MAX_TABS);
  return { tabs, active: id };
}

export function selectTab(state, id) {
  return state.tabs.some((t) => t.id === id) ? { ...state, active: id } : state;
}

/** Close a tab (never the last one). Returns { state, goTo } — the path to show if the current tab closed. */
export function closeTab(state, id) {
  if (state.tabs.length <= 1) return { state, goTo: null };
  const i = state.tabs.findIndex((t) => t.id === id);
  if (i < 0) return { state, goTo: null };
  const tabs = state.tabs.filter((t) => t.id !== id);
  if (state.active !== id) return { state: { ...state, tabs }, goTo: null };
  const next = tabs[Math.min(i, tabs.length - 1)];
  return { state: { tabs, active: next.id }, goTo: next.path };
}
