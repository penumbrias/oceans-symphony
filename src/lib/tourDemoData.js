// Demo data used only during the feature tour when the user has no real data yet.
// These are injected into components via window.__tourActive check and disappear when
// the tour is closed.

export const TOUR_DEMO_ALTERS = [
  { id: "_tour_1", name: "Aria",  pronouns: "she/her",  role: "Protector",     color: "#8b5cf6", is_archived: false, avatar_url: null },
  { id: "_tour_2", name: "Cedar", pronouns: "they/them", role: "Little",        color: "#06b6d4", is_archived: false, avatar_url: null },
  { id: "_tour_3", name: "Max",   pronouns: "he/him",   role: "Host",          color: "#f59e0b", is_archived: false, avatar_url: null },
  { id: "_tour_4", name: "Sage",  pronouns: "any/all",  role: "Caretaker",     color: "#10b981", is_archived: false, avatar_url: null },
  { id: "_tour_5", name: "Ember", pronouns: "she/they", role: "Trauma Holder", color: "#ef4444", is_archived: false, avatar_url: null },
  { id: "_tour_6", name: "River", pronouns: "they/them", role: "Gatekeeper",   color: "#3b82f6", is_archived: false, avatar_url: null },
];

// Two co-fronters, no primary — demonstrates that primary is optional
export const TOUR_DEMO_SESSIONS = [
  { id: "_tour_s0", alter_id: "_tour_3", is_primary: false, is_active: true, start_time: new Date(Date.now() - 45 * 60 * 1000).toISOString() },
  { id: "_tour_s1", alter_id: "_tour_4", is_primary: false, is_active: true, start_time: new Date(Date.now() - 30 * 60 * 1000).toISOString() },
];
