// Backup policy — single source of truth for what NEVER rides in a
// general backup, and the explicit opt-in path for moving a Friends
// identity to the user's own new device.
//
// Why: FriendIdentity carries a permanent bearer credential (userId +
// secret) AND the E2E private key (privateKeyJwk). Anyone importing a file
// containing it BECOMES that user on the friends relay and can decrypt
// everything shared with them. PushSubscription is meaningless off-device.
// Before v0.95.2 the manual export stripped these but auto-backups and
// recovery saves shipped the raw dump — and the import path applied
// whatever arrived. Both directions are now enforced here.

export const DEVICE_BOUND_ENTITIES = ["FriendIdentity", "PushSubscription"];

// Remove device-bound entities from a dump (non-mutating).
export function stripDeviceBound(dump) {
  if (!dump || typeof dump !== "object") return dump;
  const out = { ...dump };
  for (const name of DEVICE_BOUND_ENTITIES) delete out[name];
  return out;
}

// Secrets that leave the device only if the person said so. The PluralKit
// token can READ AND WRITE their PluralKit system, and backups and sync
// files are plain JSON unless locked — so it goes in only when they chose
// "include it" in the PluralKit panel (`pk_token_in_backups: true`). Owner,
// 2026-10-01: "ask the user's decision". Never mutates the input: the
// tables of a getFullDbDump() are the LIVE database.
// Export paths only — never run on an IMPORT (that would drop a token the
// person deliberately included).
export function stripUnsharedSecrets(dump) {
  const table = dump && typeof dump === "object" ? dump.SystemSettings : null;
  if (!table || typeof table !== "object") return dump;
  let changed = false;
  const nextTable = {};
  for (const [id, row] of Object.entries(table)) {
    if (row && typeof row === "object" && row.pk_token && row.pk_token_in_backups !== true) {
      const { pk_token: _drop, ...rest } = row;
      nextTable[id] = rest;
      changed = true;
    } else {
      nextTable[id] = row;
    }
  }
  return changed ? { ...dump, SystemSettings: nextTable } : dump;
}

// The fields that make a complete, portable Friends identity (per the
// July 30 audit). E2E keys are MANDATORY — restoring credentials without
// privateKeyJwk silently mints a new keypair, changes every friend's
// safety number, and makes stored envelopes permanently undecryptable.
export const FRIEND_IDENTITY_BUNDLE_FIELDS = [
  "userId", "secret", "friendCode", "push_only",
  "displayName", "systemName", "terms", "privacyLevel",
  "publicKeyJwk", "privateKeyJwk",
  "fronterShareMode", "perFriendVisibility", "verifiedFriends",
];

// Build the opt-in bundle from a FriendIdentity record (drops row
// metadata like id/created_date so restore always creates fresh).
export function buildFriendIdentityBundle(identity) {
  if (!identity?.userId || !identity?.secret) return null;
  const bundle = {};
  for (const f of FRIEND_IDENTITY_BUNDLE_FIELDS) {
    if (identity[f] !== undefined) bundle[f] = identity[f];
  }
  return bundle;
}

// A bundle is adoptable only if it has the credential; warn separately
// when E2E keys are missing (old exports) — adoption then forces a key
// rotation the user must explicitly accept.
export function describeFriendBundle(bundle) {
  if (!bundle?.userId || !bundle?.secret) return null;
  return {
    friendCode: bundle.friendCode || "(unknown code)",
    displayName: bundle.displayName || "(no display name)",
    systemName: bundle.systemName || "",
    hasKeys: !!(bundle.publicKeyJwk && bundle.privateKeyJwk),
  };
}
