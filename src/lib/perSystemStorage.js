// Per-system localStorage helpers for onboarding / setup state.
//
// Before v0.85.6, setup keys like `symphony_setup_checklist_v1` were global
// across every system in a multi-system browser — creating a fresh system
// would inherit the previous system's half-finished setup progress. Bug
// report: "I created a new system to run the onboarding from scratch but
// it loaded the stale progress from the other system."
//
// New scheme: append `:${activeSystemId}` to the base key. Reads fall back
// to the legacy (unscoped) key when (a) the scoped value is absent, AND (b)
// the registry has ≤1 system — so returning single-system users' existing
// state is preserved transparently, but a NEW second system starts clean.
//
// Writes always go to the scoped key; the legacy key is left in place for
// backward compat / rollback safety and never modified.

import { getActiveSystemId, listSystems } from "@/lib/systems";

function currentSystemSuffix() {
  const id = getActiveSystemId();
  return id ? `:${id}` : ":default";
}

function scopedKey(base) {
  return `${base}${currentSystemSuffix()}`;
}

function isLegacyFallbackEligible() {
  try {
    const count = listSystems()?.length ?? 0;
    // Single-system (or unknown/uninitialised registry): safe to inherit
    // whatever legacy value was written pre-scoping. Multi-system: no
    // inheritance — the caller creating the second system explicitly wants
    // that new system to start fresh.
    return count <= 1;
  } catch {
    return true;
  }
}

export function psGetItem(base) {
  try {
    const scoped = localStorage.getItem(scopedKey(base));
    if (scoped !== null) return scoped;
    if (isLegacyFallbackEligible()) {
      const legacy = localStorage.getItem(base);
      return legacy;
    }
    return null;
  } catch {
    return null;
  }
}

export function psSetItem(base, value) {
  try {
    localStorage.setItem(scopedKey(base), value);
  } catch { /* storage off */ }
}

export function psRemoveItem(base) {
  try {
    localStorage.removeItem(scopedKey(base));
  } catch { /* storage off */ }
}
