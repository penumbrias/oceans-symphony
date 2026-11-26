// The house's check-in sheets (boards 16-CheckInPhone, 17-CheckInWhoPhone
// and 47-SetFrontPhone): the pure rules, tested by
// scripts/test-house-checkin.mjs. No React, no records.
//
// The sheets themselves are the old QuickCheckInModal, AlterAssignPopup and
// SetFrontSheet, drawn in the boards' layout while the new house is on
// (useHouseSheet() in src/lib/houseSwitch.js). Every save stays where it
// was: checkinEntry.js, symptomSessions.js, setFront.js, presenceEntry.js.

export const SHEET_KINDS = Object.freeze(["checkin", "who", "front"]);

// Where a sheet sits. On a phone it fills the screen from the top down to
// the frame's bottom zone (Support stays one tap away, building code §5),
// or down to the on-screen keyboard while one is up (the frame hides its
// bar then), so the keyboard never covers the Save button or the note.
// On a computer or tablet it is a centred panel.
export function sheetPlacement(kind, { phone = false, keyboard = 0 } = {}) {
  const kb = Math.max(0, Math.round(Number(keyboard) || 0));
  if (phone) {
    const bottom = kb > 0 ? `${kb}px` : "var(--house-sheet-bottom, 0px)";
    if (kind === "who") {
      // Board 17: the lower part of the screen, the check-in still showing
      // above it, so it's clear whose feeling is being split.
      return { top: kb > 0 ? "env(safe-area-inset-top, 0px)" : "max(34dvh, calc(env(safe-area-inset-top, 0px) + 4.5rem))", bottom, left: 0, right: 0 };
    }
    return {
      top: kind === "front" ? 0 : "env(safe-area-inset-top, 0px)",
      bottom, left: 0, right: 0,
      width: "100%", maxWidth: "none", height: "auto", maxHeight: "none",
      transform: "none", animation: "none",
    };
  }
  const width = { checkin: "30rem", who: "26rem", front: "32rem" }[kind] || "30rem";
  const tall = kind === "front" ? "46rem" : kind === "who" ? "36rem" : "52rem";
  return {
    width: `min(${width}, calc(100vw - 2rem))`,
    maxWidth: "none",
    maxHeight: `min(${tall}, calc(100dvh - ${kb}px - 3rem))`,
    ...(kind === "front" ? { height: `min(${tall}, calc(100dvh - ${kb}px - 3rem))` } : null),
  };
}

// Board 17's row note: how each alter stands in this check-in
// ("fronting, co-con"). `fronting` is the check-in's own {fronting} list,
// `levelOf(id)` the level's name, `topLevel` the first level's name (left
// out, as board 17 draws "fronting" alone for the lead).
export function whoRowNote(alterId, { fronting, levelOf, topLevel, terms }) {
  const set = fronting instanceof Set ? fronting : new Set(fronting || []);
  if (!set.has(alterId)) return null;
  const word = terms?.fronting || "fronting";
  const lvl = typeof levelOf === "function" ? levelOf(alterId) : null;
  return lvl && lvl !== topLevel ? `${word}, ${lvl}` : word;
}

// Board 17's closing line: whose a feeling is when nobody is held, said
// in the person's own words and naming who that is right now.
export function whoFooter({ defaultIds, frontingIds, names, terms }) {
  const t = terms || {};
  const def = Array.isArray(defaultIds) ? defaultIds : [];
  const all = Array.isArray(frontingIds) ? frontingIds : [];
  let now;
  if (!def.length) now = "nobody";
  else if (def.length === all.length && all.length > 1) now = `everyone ${t.fronting || "fronting"}`;
  else now = def.map((id) => names?.[id]).filter(Boolean).join(", ") || `${def.length}`;
  return `Feelings you don't hold belong to whoever "Entries belong to" says in Settings (now: ${now}). You can change this later from the check-in log.`;
}

// The tick drawn in a ticked box (building code §16.4: ✓, never ×).
export const HOUSE_TICK = "✓";
