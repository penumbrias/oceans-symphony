// What every newly made alter starts with (v0.310.0), whichever door made
// it: the new-alter sheet, an import, a fusion, a presence becoming an
// alter. Hidden from friends until someone turns sharing on for them
// (privacy first: a new alter is never shared without a choice).
// Spread FIRST, so a value an import brings with it wins.
export const NEW_ALTER_DEFAULTS = Object.freeze({ friends_visible: false });
export const withNewAlterDefaults = (record) => ({ ...NEW_ALTER_DEFAULTS, ...record });
