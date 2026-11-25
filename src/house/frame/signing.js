// What the desktop rail's signing swatch says (Phase 2 check, finding 2).
//
// The swatch shows who is in front and opens Set front. It must not claim
// more than the app does: the one rule it can speak for is the person's
// "Entries belong to" setting (SystemSettings.attribution_default, read
// through attributionPolicy in src/lib/emotionAttribution.js), which decides
// who a feeling, symptom, location or diary card is saved for when nobody is
// picked (Manage check-ins → Feelings). Journals, statuses and posts choose
// their own author, so the swatch says nothing about them.
//
// Pure, so scripts/test-house-frame.mjs can check every case.

import { ATTRIBUTION_ALL, ATTRIBUTION_NONE } from "../../lib/emotionAttribution.js";

export const CHECKIN_KINDS = "feelings, symptoms, locations and diary cards";

/**
 * names: who is in front, already through the label setting, primary first.
 * policy: attributionPolicy(row) — "all", "none" or "exclude:<ids>".
 * Returns { label, short }: the accessible name / tooltip, and a short
 * line for a narrow place.
 */
export function signingWords({ names = [], policy = ATTRIBUTION_ALL, terms = {} } = {}) {
  const front = terms.front || "front";
  const set = `Set ${front}`;
  const who = names.length
    ? `In ${front}: ${names.join(", ")}.`
    : `Nobody is in ${front}.`;
  let rule;
  if (policy === ATTRIBUTION_NONE) {
    rule = `New ${CHECKIN_KINDS} are saved without anyone unless you pick (Entries belong to: Nobody).`;
  } else if (!names.length) {
    rule = `New ${CHECKIN_KINDS} are saved without anyone unless you pick.`;
  } else if (typeof policy === "string" && policy.startsWith("exclude:")) {
    rule = `New ${CHECKIN_KINDS} are saved for those of them at the levels you keep (Entries belong to).`;
  } else {
    rule = `New ${CHECKIN_KINDS} are saved for ${names.length === 1 ? "them" : "all of them"} unless you pick.`;
  }
  return { label: `${who} ${rule} ${set}`, short: who };
}
