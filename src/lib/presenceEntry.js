// The one writer for NEW Presence rows (v0.371.0). A presence is someone
// sensed but not pinned down yet: a word, a colour, an emoji, a vibe. The
// New Presences form and the quick list both create through here, so every
// new row starts the same way (first sighting = now, not yet an alter).
import { base44 } from "@/api/base44Client";

export const PRESENCE_TEXT_FIELDS = ["label", "vibe", "color", "emoji", "notes"];

export function presenceHasAnything(fields = {}) {
  return PRESENCE_TEXT_FIELDS.some((k) => String(fields[k] || "").trim());
}

export async function createPresence(fields = {}) {
  if (!presenceHasAnything(fields)) throw new Error("Add at least one detail: a name, colour, emoji, vibe or note.");
  const now = new Date().toISOString();
  // `sightings` grows each time the presence is sensed again; that's how
  // reoccurrence is worked out.
  return base44.entities.Presence.create({
    label: "", vibe: "", color: "", emoji: "", notes: "",
    associated_alter_ids: [], relationship_type: "",
    ...fields,
    timestamp: now,
    sightings: [now],
    resolved_alter_id: "",
  });
}
