// A contact's own fields, edited from their profile widgets (v0.365.0).
//
// The same fields ContactEditModal saves, one at a time: every write reads
// the contact fresh and changes only the field it was given, so a widget,
// the edit form and another device never overwrite each other. A contact
// always keeps a name; a blank one is refused, never saved.

import { base44 } from "@/api/base44Client";

// The plain text fields a widget may write.
export const CONTACT_TEXT_FIELDS = ["name", "nickname", "relationship_label", "about", "safe_to_share", "boundaries", "system_rules"];

export async function writeContactField(contactId, key, value) {
  if (!contactId || !CONTACT_TEXT_FIELDS.includes(key)) return null;
  const text = String(value ?? "");
  if (key === "name") {
    if (!text.trim()) throw new Error("A contact needs a name");
    return base44.entities.Contact.update(contactId, { name: text.trim() });
  }
  return base44.entities.Contact.update(contactId, { [key]: text.trim() ? text : null });
}

// One of your contact fields (ContactCustomField), stored on the contact
// under `custom_fields[defId]`. Emptied fields are removed, the way the
// edit form saves them.
export async function writeContactCustomField(contactId, defId, value) {
  if (!contactId || !defId) return null;
  const fresh = await base44.entities.Contact.get(contactId);
  if (!fresh) throw new Error("That contact isn't here any more");
  const next = { ...(fresh.custom_fields && typeof fresh.custom_fields === "object" ? fresh.custom_fields : {}) };
  const text = String(value ?? "");
  if (text.trim()) next[defId] = text;
  else delete next[defId];
  return base44.entities.Contact.update(contactId, { custom_fields: next });
}
