// Switching a profile between its old layout and the new profile (alters
// v0.305.0, groups v0.307.0, contacts v0.308.0, locations v0.309.0). Only a flag on the record moves: the new
// profile's layout is its own ProfileBoard row (`<id>::v2`), so the old
// layout row is never touched and switching back and forth is lossless.
// Every write reads the record fresh and sends only these fields.

import { base44 } from "@/api/base44Client";
import { NEW_PROFILE_LAYOUT } from "@/lib/profileBoard";

const ENTITY = { alter: "Alter", group: "Group", contact: "Contact", location: "InnerWorldLocation" };
// SystemSettings field that turns the "Try the new profile" card off for
// every profile of a type.
export const OFFER_OFF_FIELD = {
  alter: "new_profile_offer_off", group: "new_group_profile_offer_off", contact: "new_contact_profile_offer_off",
  location: "new_location_profile_offer_off",
};

const entityOf = (type) => {
  const name = ENTITY[type];
  if (!name) throw new Error(`No new profile for ${type}`);
  return base44.entities[name];
};

export async function switchRecordToNewProfile(type, id) {
  const E = entityOf(type);
  const fresh = await E.get(id);
  if (!fresh || fresh.profile_layout === NEW_PROFILE_LAYOUT) return fresh;
  return E.update(id, {
    profile_layout: NEW_PROFILE_LAYOUT,
    profile_layout_before_v2: fresh.profile_layout ?? null,
  });
}

export async function revertRecordToOldProfile(type, id) {
  const E = entityOf(type);
  const fresh = await E.get(id);
  if (!fresh || fresh.profile_layout !== NEW_PROFILE_LAYOUT) return fresh;
  return E.update(id, {
    profile_layout: fresh.profile_layout_before_v2 || "classic",
    // Reverting is an answer: don't offer the new profile again.
    new_profile_offer_dismissed: true,
  });
}

export function dismissRecordNewProfileOffer(type, id) {
  return entityOf(type).update(id, { new_profile_offer_dismissed: true });
}

// "Don't ask on any profile" — a field on SystemSettings, so it syncs and
// is in backups.
export async function turnOffNewProfileOffer(type) {
  const field = OFFER_OFF_FIELD[type];
  if (!field) return;
  const fresh = (await base44.entities.SystemSettings.list())[0];
  if (fresh?.id) await base44.entities.SystemSettings.update(fresh.id, { [field]: true });
  else await base44.entities.SystemSettings.create({ [field]: true });
}
