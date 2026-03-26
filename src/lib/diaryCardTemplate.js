/**
 * Diary Card Template System
 * 
 * Provides a schema-driven architecture for diary cards.
 * - Stable internal IDs are used for all built-in sections/fields (analytics safety)
 * - User overrides (labels, order, enabled state) are merged on top of defaults
 * - Analytics in lib/diaryAnalytics.js reads from card.body_mind, card.urges, etc.
 *   These data_key references NEVER change regardless of user customization.
 */

export const DEFAULT_DIARY_TEMPLATE = {
  sections: [
    {
      id: "emotions",
      type: "multi_select",
      label: "Emotions",
      emoji: "😊",
      subtitle: "Tap to log feelings",
      enabled: true,
      order: 0,
      data_key: "emotions", // stable → card.emotions
    },
    {
      id: "urges",
      type: "scale_group",
      label: "Urges to",
      emoji: "🆘",
      subtitle: "Rate the intensity",
      enabled: true,
      order: 1,
      data_key: "urges", // stable → card.urges
      scale_max: 5,
      fields: [
        { id: "suicidal", label: "Suicidal urges", emoji: "🆘", data_key: "suicidal", enabled: true },
        { id: "self_harm", label: "Self-harm", emoji: "✏️", data_key: "self_harm", enabled: true },
        { id: "alcohol_drugs", label: "Alcohol/drugs", emoji: "🍺", data_key: "alcohol_drugs", enabled: true },
      ],
    },
    {
      id: "body_mind",
      type: "scale_group",
      label: "Body + mind",
      emoji: "🌿",
      subtitle: "Rate wellbeing",
      enabled: true,
      order: 2,
      data_key: "body_mind", // stable → card.body_mind
      scale_max: 5,
      fields: [
        { id: "emotional_misery", label: "Emotional misery", emoji: "😩", data_key: "emotional_misery", enabled: true },
        { id: "physical_misery", label: "Physical misery", emoji: "🖐️", data_key: "physical_misery", enabled: true },
        { id: "joy", label: "Joy", emoji: "✨", data_key: "joy", enabled: true },
      ],
    },
    {
      id: "skills",
      type: "single_scale",
      label: "Skills used",
      emoji: "🧠",
      subtitle: "How many skills",
      enabled: true,
      order: 3,
      data_key: "skills_practiced", // stable → card.skills_practiced
      scale_max: 7,
      field_label: "Skills practiced",
      field_emoji: "🧠",
    },
    {
      id: "medication",
      type: "toggle_group",
      label: "Medication + safety",
      emoji: "💊",
      subtitle: "Rx meds + safety",
      enabled: true,
      order: 4,
      data_key: "medication_safety", // stable → card.medication_safety
      fields: [
        { id: "rx_meds_taken", label: "Rx meds taken", emoji: "💊", field_type: "boolean", data_key: "rx_meds_taken", enabled: true },
        { id: "self_harm_occurred", label: "Self-harm occurred", emoji: "✏️", field_type: "boolean", data_key: "self_harm_occurred", enabled: true },
        { id: "substances_count", label: "Alcohol/drugs (not Rx) #", emoji: "🍺", field_type: "number", data_key: "substances_count", enabled: true },
      ],
    },
    {
      id: "notes",
      type: "text_group",
      label: "Notes",
      emoji: "📝",
      subtitle: "Details + context",
      enabled: true,
      order: 5,
      data_key: "notes", // stable → card.notes
      fields: [
        { id: "what", label: "What happened?", data_key: "what", field_type: "short", enabled: true },
        { id: "judgments", label: "Judgments #", data_key: "judgments", field_type: "short", enabled: true },
        { id: "optional", label: "Optional context", data_key: "optional", field_type: "long", enabled: true },
      ],
    },
    {
      id: "checklist",
      type: "checklist",
      label: "Symptoms Checklist",
      emoji: "🔲",
      subtitle: "Symptoms, habits & more",
      enabled: true,
      order: 6,
      data_key: "checklist", // stable → card.checklist
    },
  ],
};

/**
 * Returns the active template by merging user overrides on top of defaults.
 * User can rename labels, reorder, enable/disable sections and fields.
 * Internal data_key values are NEVER overridden → analytics always works.
 */
export function getActiveTemplate(settingsData) {
  if (!settingsData?.diary_sections_schema?.sections) return DEFAULT_DIARY_TEMPLATE;
  return mergeWithDefaults(settingsData.diary_sections_schema);
}

function mergeWithDefaults(userTemplate) {
  const defById = {};
  DEFAULT_DIARY_TEMPLATE.sections.forEach((s) => { defById[s.id] = s; });

  const merged = userTemplate.sections.map((us) => {
    const def = defById[us.id];
    if (!def) return us; // custom section (future)
    // User can override label, emoji, subtitle, enabled, order
    // data_key is ALWAYS taken from default (analytics safety)
    return {
      ...def,
      label: us.label ?? def.label,
      emoji: us.emoji ?? def.emoji,
      subtitle: us.subtitle ?? def.subtitle,
      enabled: us.enabled ?? def.enabled,
      order: us.order ?? def.order,
      scale_max: us.scale_max ?? def.scale_max,
      fields: def.fields ? mergeFields(def.fields, us.fields || []) : def.fields,
    };
  });

  // Add any default sections missing from user template
  const userIds = new Set(userTemplate.sections.map((s) => s.id));
  DEFAULT_DIARY_TEMPLATE.sections.forEach((s) => {
    if (!userIds.has(s.id)) merged.push({ ...s });
  });

  return { sections: merged.sort((a, b) => (a.order ?? 99) - (b.order ?? 99)) };
}

function mergeFields(defaultFields, userFields) {
  const userById = {};
  (userFields || []).forEach((f) => { userById[f.id] = f; });
  return defaultFields.map((df) => ({
    ...df,
    label: userById[df.id]?.label ?? df.label,
    emoji: userById[df.id]?.emoji ?? df.emoji,
    enabled: userById[df.id]?.enabled ?? df.enabled,
    // data_key is ALWAYS from default (analytics safety)
  }));
}

/**
 * Get a summary string for a section given the current card data.
 * Analytics-safe: reads from section.data_key (stable internal ID).
 */
export function getSectionSummary(section, data) {
  const { id, data_key } = section;
  if (id === "emotions") {
    const e = data[data_key] || [];
    return e.length ? e.slice(0, 2).join(", ") + (e.length > 2 ? ` +${e.length - 2}` : "") : "None selected";
  }
  if (id === "urges" || id === "body_mind") {
    const rated = Object.values(data[data_key] || {}).filter((v) => v !== undefined).length;
    return rated ? `${rated} rated` : "None rated";
  }
  if (id === "skills") {
    const v = data[data_key];
    return v !== undefined ? `${v} skills` : "Not rated";
  }
  if (id === "medication") {
    const hasAny = Object.values(data[data_key] || {}).some((v) => v !== undefined);
    return hasAny ? "Set" : "Not set";
  }
  if (id === "notes") {
    return data[data_key]?.what ? "Added" : "No notes yet";
  }
  if (id === "checklist") {
    const cl = data[data_key] || {};
    const count = [
      ...Object.values(cl.symptoms || {}),
      ...Object.values(cl.habits || {}),
    ].filter((v) => v !== undefined).length;
    return count > 0 ? `${count} logged` : "Not logged";
  }
  return "—";
}

/**
 * Calculate completion % based on active sections in the template.
 * Dynamically adapts when sections are enabled/disabled.
 */
export function getCompletion(sections, data) {
  const active = sections.filter((s) => s.enabled);
  if (!active.length) return 0;
  let filled = 0;
  active.forEach((s) => { if (isSectionFilled(s, data)) filled++; });
  return Math.round((filled / active.length) * 100);
}

function isSectionFilled(section, data) {
  const { id, data_key } = section;
  if (id === "emotions") return (data[data_key] || []).length > 0;
  if (id === "urges" || id === "body_mind") return Object.values(data[data_key] || {}).some((v) => v !== undefined);
  if (id === "skills") return data[data_key] !== undefined;
  if (id === "medication") return Object.values(data[data_key] || {}).some((v) => v !== undefined);
  if (id === "notes") return !!(data[data_key]?.what || data[data_key]?.optional);
  if (id === "checklist") {
    const cl = data[data_key] || {};
    return (
      Object.values(cl.symptoms || {}).some((v) => v !== undefined) ||
      Object.values(cl.habits || {}).some((v) => v !== undefined)
    );
  }
  return false;
}