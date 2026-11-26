// What a rebuilt room adds to the phone frame's header (board 12: the
// profile's header is Back · name · Info · ⋯, so the room's Info door sits
// where Search does, and Search moves into ⋯). A tiny module store: the
// room publishes its tools while it is on screen and clears them when it
// leaves. Only the phone frame reads it; nothing is written anywhere.
//
//   useRoomTools({ info: { label: "Info", pressed, onSelect }, items: [{ id, label, icon, onSelect }] })
//   const tools = useRoomToolsValue();

import { useEffect, useSyncExternalStore } from "react";

let current = null;
const subs = new Set();
const emit = () => subs.forEach((cb) => { try { cb(); } catch { /* a reader failed: the others still hear */ } });

export function setRoomTools(v) { current = v || null; emit(); }
export function getRoomTools() { return current; }
function subscribe(cb) { subs.add(cb); return () => subs.delete(cb); }

/** The phone frame: the room's header tools, or null. */
export function useRoomToolsValue() {
  return useSyncExternalStore(subscribe, getRoomTools, () => null);
}

/** A room: publish its header tools while mounted (pass a new object when they change). */
export function useRoomTools(tools) {
  useEffect(() => {
    setRoomTools(tools);
  }, [tools]);
  useEffect(() => () => setRoomTools(null), []);
}
