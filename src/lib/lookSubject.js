// The look subject (v0.310.0) — which profile is on screen for Profile
// display options.
//
// A profile page (alter, group, inner-world location) registers itself
// here while it is on screen; Profile display options (ProfileLookSheet,
// mounted once by AppLayout outside every page) reads it and edits that
// profile's look. The profile's look is still
// the PS.* style keys on the record's custom_fields (profileStyle.js) —
// nothing stored moved — and every write goes through patchProfileLook,
// which reads the record fresh and merges key by key.

import { useEffect, useSyncExternalStore } from "react";
import { base44 } from "@/api/base44Client";
import { patchAlterCustomFields } from "@/lib/alterEntry";
import { PS } from "@/lib/profileStyle";

let _subject = null;
const _listeners = new Set();
const emit = () => { for (const l of _listeners) l(); };

export function setLookSubject(subject) {
  _subject = subject && subject.id ? subject : null;
  emit();
}
const subscribe = (l) => { _listeners.add(l); return () => _listeners.delete(l); };
const get = () => _subject;
export function useLookSubject() {
  return useSyncExternalStore(subscribe, get, () => null);
}

// Profile pages call this with the record they show. `type` is the owner
// type ("alter" | "group" | "location"); `label` is what the scope row
// says (the record's name).
export function useRegisterLookSubject(type, record, label) {
  const id = record?.id || null;
  const customFields = record?.custom_fields || null;
  useEffect(() => {
    if (!id) return undefined;
    setLookSubject({ type, id, label: label || "", customFields: customFields || {}, record });
    return () => { if (_subject?.id === id && _subject?.type === type) setLookSubject(null); };
    // The record object changes identity on every refetch; the fields that
    // matter are the id and the custom_fields the sheet reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, id, label, customFields]);
}

// Opens Profile display options (ProfileLookSheet) for the profile on
// screen — the cog menu's entry and the forms' PageLookRow.
export function openProfileLook() {
  window.dispatchEvent(new CustomEvent("os-open-profile-look"));
}
// Opens Display options on "this page" (the page's own background/song).
export const LOOK_FOCUS_KEY = "os_look_focus";
export function openPageLook() {
  try { sessionStorage.setItem(LOOK_FOCUS_KEY, "page"); } catch { /* storage off */ }
  window.dispatchEvent(new CustomEvent("os-open-display-options"));
}
export function takeLookFocus() {
  try {
    const v = sessionStorage.getItem(LOOK_FOCUS_KEY);
    sessionStorage.removeItem(LOOK_FOCUS_KEY);
    return v || null;
  } catch { return null; }
}

// Every custom_fields key that is a look (so a form that saves the whole
// custom_fields map can keep the look the sheet wrote meanwhile).
export const PROFILE_LOOK_KEYS = Object.values(PS).filter((k) => k !== PS.FIELD_ORDER);
export const isLookKey = (k) => PROFILE_LOOK_KEYS.includes(k);

// `formCf` as the form holds it, with every look key taken from `freshCf`
// (the record as it is now). A form open while Display options edits the
// look must not write the look back the way it was when the form opened.
export function withFreshLook(formCf, freshCf) {
  const out = { ...(formCf || {}) };
  for (const k of PROFILE_LOOK_KEYS) delete out[k];
  for (const k of PROFILE_LOOK_KEYS) {
    if (freshCf && freshCf[k] !== undefined) out[k] = freshCf[k];
  }
  return out;
}

const ENTITY = { alter: "Alter", group: "Group", location: "InnerWorldLocation" };
export const LOOK_QUERY_KEYS = {
  alter: (id) => [["alters"], ["alter", id]],
  group: () => [["groups"]],
  location: () => [["innerWorldLocations"]],
};

// Writes look keys onto the record: fresh read, merged key by key, a value
// of undefined removes the key. Alters go through alterEntry's own path.
export async function patchProfileLook({ type, id }, changes) {
  if (!id || !changes) return null;
  if (type === "alter") return patchAlterCustomFields(id, changes);
  const entity = ENTITY[type];
  if (!entity) throw new Error(`No look for ${type}`);
  const fresh = (await base44.entities[entity].get(id)) || {};
  const cf = { ...(fresh.custom_fields || {}) };
  for (const [k, v] of Object.entries(changes)) {
    if (v === undefined) delete cf[k];
    else cf[k] = v;
  }
  return base44.entities[entity].update(id, { custom_fields: cf });
}
