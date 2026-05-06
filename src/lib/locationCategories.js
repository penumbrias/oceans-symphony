export const LOCATION_CATEGORIES = [
  { id: "home",    label: "Home",    emoji: "🏠", color: "#3b82f6" },
  { id: "work",    label: "Work",    emoji: "💼", color: "#f59e0b" },
  { id: "school",  label: "School",  emoji: "🏫", color: "#22c55e" },
  { id: "outdoor", label: "Outdoor", emoji: "🌿", color: "#10b981" },
  { id: "social",  label: "Social",  emoji: "👥", color: "#a855f7" },
  { id: "medical", label: "Medical", emoji: "🏥", color: "#ef4444" },
  { id: "transit", label: "Transit", emoji: "🚌", color: "#06b6d4" },
  { id: "other",   label: "Other",   emoji: "📍", color: "#6b7280" },
];

export function getCategoryMeta(id) {
  return LOCATION_CATEGORIES.find(c => c.id === id) ?? LOCATION_CATEGORIES[LOCATION_CATEGORIES.length - 1];
}
