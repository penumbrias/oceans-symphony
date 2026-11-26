// The Timeline widget's layers (mockup "Phone: timeline widget options"):
// which kinds of record a placed Timeline widget draws. A display option
// only — saved as the widget's `hiddenLayers` (the ids switched OFF), so a
// widget placed before this existed, or a layer added later, shows
// everything by default. Never changes what's stored.
//
// Labels may hold {{Fronting}}-style placeholders; the options sheet runs
// them through applyTerms.

export const TIMELINE_LAYERS = Object.freeze([
  { value: "fronting", label: "{{Fronting}}", color: "#7fb3a6", source: "sessions", keys: ["sessions"] },
  { value: "activities", label: "Activities and plans", color: "#e8a65d", source: "Planner", keys: ["activities"] },
  { value: "events", label: "Events and dates", color: "#f2c08a", source: "Planner", keys: ["plannerEvents", "importantDates"] },
  { value: "feelings", label: "Feelings and check-ins", color: "#9cc46b", source: "check-ins", keys: ["emotions", "checkIns"] },
  { value: "symptoms", label: "Symptoms", color: "#c98bb9", source: "check-ins", keys: ["symptomSessions", "symptomCheckIns"] },
  { value: "sleep", label: "Sleep", color: "#6d73b0", source: "Sleep", keys: ["sleeps"] },
  { value: "journals", label: "Journals and notes", color: "#5aa0c8", source: "Write", keys: ["journals", "diaryCards", "reflections", "alterNotes"] },
  { value: "places", label: "Places", color: "#86b88f", source: "Locations", keys: ["locations"] },
  { value: "status", label: "Status notes", color: "#f4e3b5", source: "Home", keys: ["statusNotes"] },
  { value: "other", label: "Posts, to-dos and reminders", color: "#b39ddb", source: "more", keys: ["bulletins", "polls", "tasks", "reminderInstances", "lineageEvents"] },
]);

const ARRAY_KEYS = [
  "sessions", "activities", "emotions", "journals", "checkIns", "bulletins", "tasks",
  "symptomSessions", "symptomCheckIns", "locations", "statusNotes", "sleeps", "lineageEvents",
  "diaryCards", "polls", "reminderInstances", "reflections", "alterNotes", "importantDates", "plannerEvents",
];

export function hiddenLayersOf(settings) {
  const v = settings?.hiddenLayers;
  return Array.isArray(v) ? v.filter((x) => TIMELINE_LAYERS.some((l) => l.value === x)) : [];
}

// A sliced day with the hidden layers emptied, and hasData recomputed.
export function applyTimelineLayers(day, hidden = []) {
  if (!day || !hidden.length) return day;
  const out = { ...day };
  for (const id of hidden) {
    const layer = TIMELINE_LAYERS.find((l) => l.value === id);
    if (!layer) continue;
    for (const k of layer.keys) out[k] = [];
    if (id === "other") out.dailyProgress = null;
  }
  out.hasData = ARRAY_KEYS.some((k) => Array.isArray(out[k]) && out[k].length > 0) || !!out.dailyProgress?.created_date;
  return out;
}
