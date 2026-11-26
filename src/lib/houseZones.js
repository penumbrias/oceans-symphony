// The phone frame's zones (new house step 2.2, building code §5 and §14).
//
// On a phone the new house has four fixed zones and one attention line, and
// nothing floats over the page. The old house's floating pieces (the fired
// reminder card, the Soundscape pill, the running-activity bubble) keep ALL
// their own logic and save paths; while the phone frame is on screen they
// hand what they would have drawn to the attention line as plain data
// instead of floating it over the page:
//
//   const inZone = useHouseZoneItem("reminder", visible ? {
//     priority: ZONE_PRIORITY.REMINDER, title, detail, sig: instance.id,
//     actions: [{ label: "Done", primary: true, onClick: done }],
//     menu: [{ id: "snooze-10", label: "Snooze 10 min", onSelect: … }],
//   } : null);
//   if (inZone) return null;        // the frame draws it; don't float it
//
// This file is in the main bundle and stays tiny on purpose: with the new
// house off (or on a studio-sized window) zones are inactive, every hook
// returns false and publishes nothing, so the old house is unchanged.
//
// A publisher re-renders often (timers, query refetches) and its handlers
// are new closures each time. Items carry a `sig`: while it is unchanged the
// stored item is refreshed in place (newest handlers) without telling the
// frame, so nothing re-renders in a loop.

import { useEffect, useSyncExternalStore } from "react";

export const ZONE_PRIORITY = {
  SAVE: 100,     // a failed save: takes the line and stays (RULE ZERO)
  SAFETY: 90,    // a data-safety notice
  REMINDER: 80,  // a fired reminder
  TIMER: 30,     // a running activity
  SOUND: 20,     // the Soundscape / a nature sound playing
};

let active = 0;               // mounted phone frames (0 or 1)
const items = new Map();      // id -> item
let snapshot = [];
const itemListeners = new Set();
const activeListeners = new Set();

function emitItems() {
  snapshot = [...items.values()].sort((a, b) => (b.priority || 0) - (a.priority || 0) || a.seq - b.seq);
  for (const fn of itemListeners) fn();
}
let seq = 0;

/** The phone frame calls this while it is mounted. Returns the undo. */
export function activateHouseZones() {
  active += 1;
  for (const fn of activeListeners) fn();
  return () => {
    active = Math.max(0, active - 1);
    if (!active && items.size) { items.clear(); emitItems(); }
    for (const fn of activeListeners) fn();
  };
}

export function houseZonesActive() { return active > 0; }

function subscribeActive(fn) { activeListeners.add(fn); return () => activeListeners.delete(fn); }
function subscribeItems(fn) { itemListeners.add(fn); return () => itemListeners.delete(fn); }

/** Is the phone frame on screen? (A boolean snapshot: no re-render churn.) */
export function useHouseZonesActive() {
  return useSyncExternalStore(subscribeActive, houseZonesActive, () => false);
}

/** Put an item on the attention line (or update it). */
export function publishZoneItem(id, item) {
  if (!id || !item) return;
  const prev = items.get(id);
  // Same signature: refresh the handlers IN PLACE (the frame holds this very
  // object, and its buttons read the handlers when pressed), silently.
  if (prev && prev.sig !== undefined && prev.sig === item.sig) {
    for (const k of Object.keys(prev)) if (!(k in item) && k !== "id" && k !== "seq") delete prev[k];
    Object.assign(prev, item, { id, seq: prev.seq });
    return;
  }
  items.set(id, { ...item, id, seq: prev ? prev.seq : ++seq });
  emitItems();
}

export function removeZoneItem(id) {
  if (items.delete(id)) emitItems();
}

/** Every item waiting for the line, highest priority first. */
export function zoneItemsSnapshot() { return snapshot; }
export function useZoneItems() {
  return useSyncExternalStore(subscribeItems, zoneItemsSnapshot, zoneItemsSnapshot);
}

/**
 * Hand `item` (or null) to the attention line while the phone frame is on
 * screen. Returns true when the frame is drawing it, so the caller skips
 * its own floating version. Always call it (it's a hook), item or not.
 */
export function useHouseZoneItem(id, item) {
  const on = useHouseZonesActive();
  const want = on && !!item;
  // Every render: the newest handlers ride along (silently unless sig moved).
  useEffect(() => {
    if (want) publishZoneItem(id, item);
  });
  useEffect(() => {
    if (!want) removeZoneItem(id);
    return undefined;
  }, [want, id]);
  useEffect(() => () => removeZoneItem(id), [id]);
  return on;
}

// Test hook.
export function _resetZones() { items.clear(); active = 0; seq = 0; emitItems(); }
