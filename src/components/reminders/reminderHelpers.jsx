export const CATEGORY_ICONS = {
  check_in: "🫧",
  habit: "⭐",
  meds: "💊",
  grounding: "🌿",
  appointment: "📅",
  custom: "🔔",
};

export function triggerSummary(reminder) {
  const { trigger_type, trigger_config: cfg } = reminder;
  if (!cfg) return trigger_type;

  if (trigger_type === "scheduled") {
    const times = (cfg.times || []).join(", ");
    const days = cfg.days ? ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].filter((_, i) => cfg.days.includes(i)).join(", ") : "Every day";
    return `Daily at ${times || "—"} · ${days}`;
  }
  if (trigger_type === "interval") {
    const mins = cfg.every_minutes || 60;
    if (mins < 60) return `Every ${mins} min`;
    if (mins % 60 === 0) return `Every ${mins / 60}h`;
    return `Every ${mins} min`;
  }
  if (trigger_type === "contextual") {
    const labels = { no_front_update: "When front not updated", emotion_logged: "When emotion logged", sleep_ended: "After sleep ends" };
    return labels[cfg.on] || cfg.on || "Contextual";
  }
  if (trigger_type === "event") {
    return cfg.when ? `Event: ${new Date(cfg.when).toLocaleDateString()}` : "Event-based";
  }
  return trigger_type;
}