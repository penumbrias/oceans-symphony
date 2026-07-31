// Build-time feature flags for in-progress UI work.
//
// Why: releases that are purely data/bug fixes must not surface unfinished
// UI. Flipping a flag here hides every entry point AND forces the feature
// off at render — so a user who already enabled it falls back to the
// normal UI instead of being stranded in a hidden feature with no toggle.
//
// IMPORTANT: turning a flag off never deletes the user's saved
// configuration (e.g. SystemSettings.experimental_home keeps its pages and
// widgets). Flip the flag back to true and everything returns exactly as
// they left it.

// The phone-style widget homescreen (v0.90–v0.94). Hidden for the
// v0.95.x data-integrity releases. Re-enable by setting this to true —
// no other change needed.
export const EXPERIMENTAL_HOME_ENABLED = false;
