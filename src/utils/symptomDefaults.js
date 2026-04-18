import { base44 } from "@/api/base44Client";

const SYMPTOM_DEFAULTS = [
  // Rating symptoms
  { label: "Overall mood", category: "symptom", type: "rating", is_positive: true, color: "#8B5CF6", order: 0 },
  { label: "Energy level", category: "symptom", type: "rating", is_positive: true, color: "#F59E0B", order: 1 },
  { label: "Self esteem", category: "symptom", type: "rating", is_positive: true, color: "#A78BFA", order: 2 },
  { label: "Anxiety", category: "symptom", type: "rating", is_positive: false, color: "#EF4444", order: 3 },
  { label: "Depression", category: "symptom", type: "rating", is_positive: false, color: "#6366F1", order: 4 },
  { label: "Feeling irritable", category: "symptom", type: "rating", is_positive: false, color: "#F97316", order: 5 },
  { label: "Feeling manic / wired / elated", category: "symptom", type: "rating", is_positive: false, color: "#EC4899", order: 6 },
  { label: "Feeling overwhelmed", category: "symptom", type: "rating", is_positive: false, color: "#DC2626", order: 7 },
  { label: "Emotional numbness", category: "symptom", type: "rating", is_positive: false, color: "#64748B", order: 8 },
  { label: "Lack of motivation", category: "symptom", type: "rating", is_positive: false, color: "#94A3B8", order: 9 },
  { label: "Trouble sleeping", category: "symptom", type: "rating", is_positive: false, color: "#1D4ED8", order: 10 },

  // Boolean symptoms
  { label: "Emotional hangover", category: "symptom", type: "boolean", is_positive: false, color: "#7C3AED", order: 11 },
  { label: "Rapid cycling mood swings", category: "symptom", type: "boolean", is_positive: false, color: "#DB2777", order: 12 },
  { label: "Amnesia / memory problems", category: "symptom", type: "boolean", is_positive: false, color: "#3B82F6", order: 13 },
  { label: "Triggered switch", category: "symptom", type: "boolean", is_positive: false, color: "#B45309", order: 14 },
  { label: "Random switch", category: "symptom", type: "boolean", is_positive: false, color: "#92400E", order: 15 },
  { label: "Rapid switching", category: "symptom", type: "boolean", is_positive: false, color: "#C2410C", order: 16 },
  { label: "Lots of switching", category: "symptom", type: "boolean", is_positive: false, color: "#D97706", order: 17 },
  { label: "Work / school stress", category: "symptom", type: "boolean", is_positive: false, color: "#0EA5E9", order: 18 },
  { label: "General stress", category: "symptom", type: "boolean", is_positive: false, color: "#2563EB", order: 19 },
  { label: "Relationship stress", category: "symptom", type: "boolean", is_positive: false, color: "#7C3AED", order: 20 },

  // Boolean habits
  { label: "Feeling calm", category: "habit", type: "boolean", is_positive: true, color: "#10B981", order: 0 },
  { label: "Feeling happy", category: "habit", type: "boolean", is_positive: true, color: "#34D399", order: 1 },
  { label: "Feeling productive", category: "habit", type: "boolean", is_positive: true, color: "#059669", order: 2 },
  { label: "Spoke to someone about feelings", category: "habit", type: "boolean", is_positive: true, color: "#0D9488", order: 3 },
  { label: "Took care of chores", category: "habit", type: "boolean", is_positive: true, color: "#14B8A6", order: 4 },
  { label: "Attended therapy", category: "habit", type: "boolean", is_positive: true, color: "#0891B2", order: 5 },
  { label: "Used coping skills", category: "habit", type: "boolean", is_positive: true, color: "#06B6D4", order: 6 },
  { label: "Logged diary", category: "habit", type: "boolean", is_positive: true, color: "#22C55E", order: 7 },
  { label: "Exercise / movement", category: "habit", type: "boolean", is_positive: true, color: "#16A34A", order: 8 },
  { label: "Engaged in social activities", category: "habit", type: "boolean", is_positive: true, color: "#15803D", order: 9 },
  { label: "Self-care", category: "habit", type: "boolean", is_positive: true, color: "#4ADE80", order: 10 },
];

let seeded = false;

export async function seedSymptomDefaults() {
  if (seeded) return;
  seeded = true;
  try {
    const existing = await base44.entities.Symptom.list();
    if (existing.length > 0) return;
    for (const def of SYMPTOM_DEFAULTS) {
      await base44.entities.Symptom.create({ ...def, is_default: true, is_archived: false });
    }
  } catch (e) {
    console.warn("Failed to seed symptom defaults:", e);
    seeded = false;
  }
}