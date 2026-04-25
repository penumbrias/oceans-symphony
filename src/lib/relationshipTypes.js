// Default relationship types — seeded on first load
export const DEFAULT_RELATIONSHIP_TYPES = [
  { label: "Friends", color: "#3b82f6" },
  { label: "Close friends", color: "#8b5cf6" },
  { label: "Romantic", color: "#ec4899" },
  { label: "Family", color: "#f59e0b" },
  { label: "Rivals", color: "#ef4444" },
  { label: "Conflicted", color: "#f97316" },
  { label: "Protects", color: "#10b981" },
  { label: "Protected by", color: "#10b981" },
  { label: "Created by", color: "#6366f1" },
  { label: "Split from", color: "#a855f7" },
  { label: "Caretaker of", color: "#14b8a6" },
  { label: "Avoids", color: "#6b7280" },
  { label: "Doesn't know", color: "#9ca3af" },
];

// Hook-free helper: fetch active relationship types (non-archived), sorted by order
export async function fetchActiveRelationshipTypes(entities) {
  const all = await entities.RelationshipType.list();
  if (all.length === 0) {
    // Seed defaults
    await Promise.all(
      DEFAULT_RELATIONSHIP_TYPES.map((t, i) =>
        entities.RelationshipType.create({ ...t, order: i, is_default: true })
      )
    );
    return DEFAULT_RELATIONSHIP_TYPES.map((t, i) => ({ ...t, id: null, order: i }));
  }
  return all
    .filter(t => !t.is_archived)
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}