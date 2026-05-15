// Bump this with each user-visible changelog entry. Surfaced in Settings
// upper-right and used in any "What's new" / report metadata. Format is
// MAJOR.MINOR.PATCH — most updates increment PATCH; bump MINOR for a
// meaningful feature block, MAJOR for big direction changes.
//
// CLAUDE.md NOTE: every time a changelog entry is added, bump APP_VERSION
// in this file in the same commit. Default to a PATCH bump.
export const APP_VERSION = "0.15.5";

// Pre-release label rendered as a chip beside the version. Empty string
// hides the chip. Once the app is stable enough to drop the alpha tag,
// set this to "" and update CLAUDE.md accordingly.
export const APP_RELEASE_STAGE = "alpha";
