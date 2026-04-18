import { base44 } from "@/api/base44Client";

const SYMPTOM_DEFAULTS = [
  // Symptoms
  { name: "Overall mood", category: "symptom", color: "#8B5CF6", order: 0 },
  { name: "Energy level", category: "symptom", color: "#F59E0B", order: 1 },
  { name: "Self esteem", category: "symptom", color: "#A78BFA", order: 2 },
  { name: "Anxiety", category: "symptom", color: "#EF4444", order: 3 },
  { name: "Depression", category: "symptom", color: "#6366F1", order: 4 },
  { name: "Feeling irritable", category: "symptom", color: "#F97316", order: 5 },
  { name: "Feeling manic / wired / elated", category: "symptom", color: "#EC4899", order: 6 },
  { name: "Feeling overwhelmed", category: "symptom", color: "#DC2626", order: 7 },
  { name: "Emotional hangover", category: "symptom", color: "#7C3AED", order: 8 },
  { name: "Rapid cycling mood swings", category: "symptom", color: "#DB2777", order: 9 },
  { name: "Emotional numbness", category: "symptom", color: "#64748B", order: 10 },
  { name: "Lack of motivation", category: "symptom", color: "#94A3B8", order: 11 },
  { name: "Amnesia / memory problems", category: "symptom", color: "#3B82F6", order: 12 },
  { name: "Triggered switch", category: "symptom", color: "#B45309", order: 13 },
  { name: "Random switch", category: "symptom", color: "#92400E", order: 14 },
  { name: "Rapid switching", category: "symptom", color: "#C2410C", order: 15 },
  { name: "Lots of switching", category: "symptom", color: "#D97706", order: 16 },
  { name: "Work / school stress", category: "symptom", color: "#0EA5E9", order: 17 },
  { name: "General stress", category: "symptom", color: "#2563EB", order: 18 },
  { name: "Relationship stress", category: "symptom", color: "#7C3AED", order: 19 },
  { name: "Trouble sleeping", category: "symptom", color: "#1D4ED8", order: 20 },

  // Habits
  { name: "Feeling calm", category: "habit", color: "#10B981", order: 0 },
  { name: "Feeling happy", category: "habit", color: "#34D399", order: 1 },
  { name: "Feeling productive", category: "habit", color: "#059669", order: 2 },
  { name: "Spoke to someone about feelings", category: "habit", color: "#0D9488", order: 3 },
  { name: "Took care of chores", category: "habit", color: "#14B8A6", order: 4 },
  { name: "Attended therapy", category: "habit", color: "#0891B2", order: 5 },
  { name: "Used coping skills", category: "habit", color: "#06B6D4", order: 6 },
  { name: "Logged diary", category: "habit", color: "#22C55E", order: 7 },
  { name: "Exercise / movement", category: "habit", color: "#16A34A", order: 8 },
  { name: "Engaged in social activities", category: "habit", color: "#15803D", order: 9 },
  { name: "Self-care", category: "habit", color: "#4ADE80", order: 10 },
];

let seeded = false;

export async function seedSymptomDefaults() {
  if (seeded) return;
  seeded = true;
  try {
    const existing = await base44.entities.SymptomDefinition.list();
    if (existing.length > 0) return;
    for (const def of SYMPTOM_DEFAULTS) {
      await base44.entities.SymptomDefinition.create({ ...def, is_default: true, is_archived: false });
    }
  } catch (e) {
    console.warn("Failed to seed symptom defaults:", e);
    seeded = false;
  }
}