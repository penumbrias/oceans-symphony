// THE trigger list (v0.279.5, roadmap step 3).
//
// Five editors used to carry their own copy of the built-in categories
// (and the quick check-in never showed custom trigger types), and a
// triggered switch with no category was saved three ways: null, "" or
// "unknown". Now:
//
//   • TRIGGER_CATEGORIES      — the built-in list.
//   • useTriggerCategories()  — built-ins + the person's TriggerType rows
//                               (src/lib/useTriggerCategories.js).
//   • triggerPatch()          — the ONLY shape a session's trigger fields
//                               are written in: on with no category is
//                               "unknown", off clears all three.
//   • triggerCategoryOf()     — read side; older rows saved null / ""
//                               while triggered read as "unknown".

export const NO_TRIGGER_CATEGORY = "unknown";

export const TRIGGER_CATEGORIES = [
  { id: "sensory",         label: "Sensory",         emoji: "👂", hint: "loud noise, smell, touch" },
  { id: "emotional",       label: "Emotional",       emoji: "💙", hint: "grief, fear, loneliness" },
  { id: "interpersonal",   label: "Interpersonal",   emoji: "👥", hint: "conflict, rejection" },
  { id: "trauma_reminder", label: "Trauma reminder", emoji: "⚡", hint: "anniversary, place, memory" },
  { id: "physical",        label: "Physical",        emoji: "🫀", hint: "pain, fatigue, illness" },
  { id: "internal",        label: "Internal",        emoji: "🧠", hint: "intrusive thought, body memory" },
  { id: NO_TRIGGER_CATEGORY, label: "Unknown",       emoji: "❓" },
];

export function mergeTriggerCategories(customTypes = []) {
  return [
    ...TRIGGER_CATEGORIES,
    ...(customTypes || []).map((t) => ({ id: t.id, label: t.label, emoji: t.emoji || "🏷️", hint: t.hint || "" })),
  ];
}

export function triggerPatch({ on, category, label } = {}) {
  if (!on) return { is_triggered_switch: false, trigger_category: null, trigger_label: null };
  return {
    is_triggered_switch: true,
    trigger_category: category || NO_TRIGGER_CATEGORY,
    trigger_label: (label || "").trim(),
  };
}

export function triggerCategoryOf(session) {
  if (!session?.is_triggered_switch) return null;
  return session.trigger_category || NO_TRIGGER_CATEGORY;
}

// "👂 Sensory" for a category id; a custom type needs the merged list.
export function triggerCategoryLabel(id, categories = TRIGGER_CATEGORIES) {
  const cat = (categories || []).find((c) => c.id === id) || TRIGGER_CATEGORIES.find((c) => c.id === id);
  return cat ? `${cat.emoji} ${cat.label}` : id;
}
