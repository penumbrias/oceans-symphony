// Profile look defaults (v0.313.0) — the look an alter, group or location
// profile has when it hasn't set its own.
//
// Stored on SystemSettings.profile_look_defaults as
//   { alter: { <PS.* keys> }, group: {...}, location: {...} }
// — the same PS.* keys a profile keeps on its custom_fields (profileStyle.js),
// edited with the same tabs (ProfileLookTabs) from Display options on a
// profile page ("New <alter> profiles"). A profile's own Profile style
// always wins: the merge is key by key, and only keys the profile hasn't
// set fall through to the default. Nothing is ever written onto a record
// from here — the merged map is for READING (drawing the page) only, so a
// form that saves whole custom_fields never picks the defaults up.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { PROFILE_LOOK_KEYS } from "@/lib/lookSubject";

export const PROFILE_LOOK_DEFAULTS_FIELD = "profile_look_defaults";
export const LOOK_DEFAULT_TYPES = ["alter", "group", "location"];

const EMPTY = Object.freeze({});

export function readLookDefaults(settingsRow, type) {
  const all = settingsRow?.[PROFILE_LOOK_DEFAULTS_FIELD];
  if (!type || !all || typeof all !== "object") return EMPTY;
  const entry = all[type];
  return entry && typeof entry === "object" ? entry : EMPTY;
}

const isSet = (v) => v !== undefined && v !== null && v !== "";

// `cf` with every look key the profile hasn't set taken from `defaults`.
// Returns `cf` itself when there is nothing to add.
export function withLookDefaults(cf, defaults) {
  const own = cf && typeof cf === "object" ? cf : EMPTY;
  if (!defaults || typeof defaults !== "object") return own;
  let out = null;
  for (const k of PROFILE_LOOK_KEYS) {
    if (isSet(defaults[k]) && !isSet(own[k])) {
      if (!out) out = { ...own };
      out[k] = defaults[k];
    }
  }
  return out || own;
}

// A record whose custom_fields carry the defaults — for drawing only.
export function recordWithLookDefaults(record, defaults) {
  if (!record) return record;
  const cf = withLookDefaults(record.custom_fields, defaults);
  if (cf === (record.custom_fields || EMPTY) || cf === record.custom_fields) return record;
  return { ...record, custom_fields: cf };
}

export function useLookDefaults(type) {
  const { data: rows = [] } = useQuery({ queryKey: ["systemSettings"], queryFn: () => base44.entities.SystemSettings.list() });
  const row = rows[0] || null;
  return useMemo(() => readLookDefaults(row, type), [row, type]);
}

export function useRecordWithLookDefaults(record, type) {
  const defaults = useLookDefaults(type);
  return useMemo(() => recordWithLookDefaults(record, defaults), [record, defaults]);
}

// Writes one type's defaults: fresh settings row, merged key by key, a
// value of undefined removes the key.
export async function patchLookDefaults(type, changes) {
  if (!LOOK_DEFAULT_TYPES.includes(type)) throw new Error(`No defaults for ${type}`);
  const rows = await base44.entities.SystemSettings.list();
  const row = rows[0];
  if (!row?.id) throw new Error("There's no settings record to save the defaults to yet");
  const all = row[PROFILE_LOOK_DEFAULTS_FIELD] && typeof row[PROFILE_LOOK_DEFAULTS_FIELD] === "object" ? { ...row[PROFILE_LOOK_DEFAULTS_FIELD] } : {};
  const entry = { ...(all[type] && typeof all[type] === "object" ? all[type] : {}) };
  for (const [k, v] of Object.entries(changes || {})) {
    if (v === undefined) delete entry[k];
    else entry[k] = v;
  }
  all[type] = entry;
  return base44.entities.SystemSettings.update(row.id, { [PROFILE_LOOK_DEFAULTS_FIELD]: all });
}
