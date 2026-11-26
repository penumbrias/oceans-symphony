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

// Sensed again: one more sighting, appended onto a FRESH read so a second
// device's (or a second tap's) sighting is never written over. The set-front
// sheet's unsure path and the presence picker log through here.
export async function notePresenceSighting(id, at = new Date().toISOString()) {
  if (!id) throw new Error("No presence to note.");
  const fresh = await base44.entities.Presence.get(id);
  if (!fresh) throw new Error("That presence isn't here any more.");
  const prev = Array.isArray(fresh.sightings) && fresh.sightings.length
    ? fresh.sightings
    : (fresh.timestamp ? [fresh.timestamp] : []);
  return base44.entities.Presence.update(id, { sightings: [...prev, at], timestamp: at });
}

// An edit of a presence's own words: only the fields given are written.
export async function updatePresence(id, fields = {}) {
  if (!id) throw new Error("No presence to update.");
  return base44.entities.Presence.update(id, fields);
}
