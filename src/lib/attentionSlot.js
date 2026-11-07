// One thing asks for attention at a time (UI critique C1, v0.364.3).
//
// Banners, tips and floating cards each used to decide on their own to
// appear, so a first visit to the home screen stacked five or six of them
// above the content. Every surface that asks for attention now CLAIMS the
// slot with a priority while it wants to show; only the highest active
// claim gets to render, the rest wait their turn (they reappear as soon as
// the one above them is dealt with — nothing is dismissed or lost).
//
// Surfaces that must never wait (fired reminders, the home notice stack,
// safety notices) still claim the slot so the gentler things step aside,
// but they render regardless — pass `always: true`.
//
//   const mine = useAttentionSlot("page-tip", { priority: ATTENTION.TIP, active: couldShow });
//   if (!mine) return null;

import { useEffect, useId, useSyncExternalStore } from "react";

export const ATTENTION = {
  NOTICES: 90,   // the home notice stack (safety, critical plans, reminders, mentions)
  REMINDER: 80,  // a fired reminder (the floating card on other pages)
  SURVEY: 50,    // the creator's feedback survey invitation (time-limited)
  SETUP: 40,     // "Continue setup"
  PROMO: 20,     // "Check out the widget board" and similar one-off promos
  TIP: 10,       // "New to this page? Show me around"
};

const claims = new Map(); // id -> { priority, seq }
const listeners = new Set();
let seq = 0;
let version = 0;

function emit() {
  version++;
  for (const fn of listeners) fn();
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function getVersion() { return version; }

export function claimAttention(id, priority) {
  const prev = claims.get(id);
  if (prev && prev.priority === priority) return;
  claims.set(id, { priority, seq: prev ? prev.seq : ++seq });
  emit();
}

export function releaseAttention(id) {
  if (claims.delete(id)) emit();
}

// The id holding the slot: highest priority, then the earliest claim.
// `besides` lists claim names to look past (see useAttentionSlot).
export function attentionHolder(besides = null) {
  let best = null;
  for (const [id, c] of claims) {
    if (besides && besides.some((n) => id.startsWith(`${n}:`))) continue;
    if (!best || c.priority > best.priority || (c.priority === best.priority && c.seq < best.seq)) {
      best = { id, ...c };
    }
  }
  return best ? best.id : null;
}

// `besides`: claim names this surface can share the screen with because
// they never sit in the same place (the in-flow home notice stack vs a
// card floating above the tab bar). It still waits for everything else.
export function useAttentionSlot(name, { priority, active = true, always = false, besides = null } = {}) {
  const uid = useId();
  const id = `${name}:${uid}`;
  useEffect(() => {
    if (!active) { releaseAttention(id); return undefined; }
    claimAttention(id, priority);
    return () => releaseAttention(id);
  }, [id, priority, active]);
  useSyncExternalStore(subscribe, getVersion, getVersion);
  if (!active) return false;
  if (always) return true;
  // Before the claim effect has run (first render) the holder may be
  // someone else or nobody; render only once we actually hold the slot.
  return attentionHolder(besides) === id;
}

// Test hook.
export function _resetAttention() { claims.clear(); seq = 0; emit(); }
