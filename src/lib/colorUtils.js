// Tiny shared helpers for validating user-saved color values.
//
// History note: alters historically had a `color` field validated by
// nothing more than `.length > 3` in three different list/grid
// renderers. A user could end up with an invalid value like
// "#8b5c1" (5 hex digits — CSS only accepts 3 / 4 / 6 / 8) and
// browsers would silently render those elements with NO colour at
// all, leaving one alter looking unstyled next to the others. Fix:
// validate as a proper CSS hex shape and treat anything else as
// "no colour set".

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export function isValidHexColor(value) {
  if (typeof value !== "string") return false;
  return HEX_RE.test(value);
}
