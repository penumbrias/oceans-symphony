// Preset activity packs for the Setup checklist's "Activity tracker"
// step (v0.85.3 per owner: "we should have some preset packs for the
// activities too — Productive → Work/Cleaning/Studying, Recreation →
// Watching TV/Playing games…"). Each pack is a parent category plus
// its sub-activities. Users tick items in a picker and the tree is
// created in one go (parent first, then subs pointed at it).
//
// Wording is generic and category-agnostic — no assumptions about
// which activities are "productive" or "worthwhile"; users can rename
// or delete anything after import.

export const ACTIVITY_PACKS = [
  {
    id: "productive",
    label: "Productive",
    emoji: "💼",
    color: "#3B82F6",
    description: "Work, chores, and other things that use focus.",
    subs: ["Work", "Studying", "Cleaning", "Chores", "Errands", "Admin / paperwork"],
  },
  {
    id: "recreation",
    label: "Recreation",
    emoji: "🎮",
    color: "#8B5CF6",
    description: "Downtime — how you enjoy yourself.",
    subs: ["Watching TV", "Watching a movie", "Playing games", "Reading", "Listening to music", "Podcasts"],
  },
  {
    id: "self_care",
    label: "Self-care",
    emoji: "🌿",
    color: "#10B981",
    description: "Body basics and daily upkeep.",
    subs: ["Hygiene", "Grooming", "Skincare", "Eating a meal", "Snacking", "Hydrating"],
  },
  {
    id: "movement",
    label: "Movement",
    emoji: "🏃",
    color: "#F59E0B",
    description: "Any way of moving the body.",
    subs: ["Walking", "Exercise", "Yoga", "Stretching", "Sports", "Dance"],
  },
  {
    id: "social",
    label: "Social",
    emoji: "💬",
    color: "#EC4899",
    description: "Time with people (in person or online).",
    subs: ["With friends", "With family", "With partner", "Community / meetup", "Online chat", "Phone call"],
  },
  {
    id: "coping",
    label: "Coping & wellness",
    emoji: "🤍",
    color: "#06B6D4",
    description: "Things that support the nervous system.",
    subs: ["Grounding technique", "Therapy session", "Journaling", "Meditation", "Breathing exercise", "Support call"],
  },
  {
    id: "creative",
    label: "Creative",
    emoji: "🎨",
    color: "#F97316",
    description: "Making something.",
    subs: ["Writing", "Drawing / painting", "Music-making", "Crafts", "Photography", "Cooking / baking"],
  },
  {
    id: "rest",
    label: "Rest",
    emoji: "🌙",
    color: "#6366F1",
    description: "Sleep and deliberate rest.",
    subs: ["Sleep", "Nap", "Rest without doing", "Screen-free time"],
  },
];

// Import a set of preset picker selections into ActivityCategory rows.
// `selectedKeys` is a Set of `${packId}` (whole pack) OR `${packId}:${subIndex}`
// (individual sub). A pack selected as a whole is treated as "parent + every
// sub". Existing categories with matching names (case-insensitive) are NOT
// duplicated — parents match by name, subs match by (parent name, sub name).
export async function importActivityPacks(base44, selectedKeys) {
  const existing = await base44.entities.ActivityCategory.list();
  // Build lookup by lowercased name (rooted vs child scoped to parent id).
  const rootByName = new Map();
  const childByParentAndName = new Map();
  for (const c of existing) {
    const key = String(c.name || "").trim().toLowerCase();
    if (!key) continue;
    if (c.parent_category_id) {
      childByParentAndName.set(`${c.parent_category_id}::${key}`, c);
    } else {
      rootByName.set(key, c);
    }
  }

  // Bucket selected keys by pack. A bare pack key means "everything in the pack".
  const perPack = new Map(); // packId → Set<subIndex | "*">
  for (const key of selectedKeys) {
    const [packId, subIdx] = String(key).split(":");
    if (!perPack.has(packId)) perPack.set(packId, new Set());
    perPack.get(packId).add(subIdx === undefined ? "*" : Number(subIdx));
  }

  let createdParents = 0;
  let createdSubs = 0;
  for (const [packId, subSet] of perPack.entries()) {
    const pack = ACTIVITY_PACKS.find((p) => p.id === packId);
    if (!pack) continue;
    const parentKey = pack.label.trim().toLowerCase();
    let parent = rootByName.get(parentKey);
    if (!parent) {
      parent = await base44.entities.ActivityCategory.create({
        name: pack.label,
        color: pack.color,
      });
      rootByName.set(parentKey, parent);
      createdParents++;
    }
    // Which sub indexes to create: the whole pack, or a specific set.
    const wantAll = subSet.has("*");
    const indexes = wantAll
      ? pack.subs.map((_, i) => i)
      : [...subSet].filter((v) => typeof v === "number");
    for (const i of indexes) {
      const subName = pack.subs[i];
      if (!subName) continue;
      const subKey = `${parent.id}::${subName.trim().toLowerCase()}`;
      if (childByParentAndName.has(subKey)) continue;
      await base44.entities.ActivityCategory.create({
        name: subName,
        color: pack.color,
        parent_category_id: parent.id,
      });
      childByParentAndName.set(subKey, true);
      createdSubs++;
    }
  }
  return { createdParents, createdSubs };
}
