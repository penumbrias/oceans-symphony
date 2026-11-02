// Reading and checking a mod file (.osmod). Pure functions, no DB access.
//
// A mod file is JSON (docs/mods.md has the full format):
//   {
//     "format": "oceans-symphony-mod", "formatVersion": 1,
//     "id": "twin-notes", "name": "Twin notes", "version": "1.0.0",
//     "author": "…", "description": "…",
//     "permissions": ["alters:read"],
//     "pages": [{ "id": "notes", "title": "Twin notes" }],
//     "code": "symphony.registerPage('notes', (root) => { … })"
//   }
// The code never runs in the app's page — only inside the sandboxed mod
// frame (public/mod-host.html).

import { isReadableEntity } from "./modDataAccess.js";

export const MOD_FORMAT = "oceans-symphony-mod";
export const MOD_FORMAT_VERSION = 1;
export const MAX_MOD_CODE_BYTES = 2 * 1024 * 1024;

// Everything a mod can ask for. A mod can always keep its own data and see
// the person's terms and colours; anything about the person's data needs one
// of these, ticked by the person at install. Text uses {{alters}}-style
// placeholders resolved with applyModTerms.
export const MOD_PERMISSIONS = {
  "alters:read": {
    label: "See your {{alters}}",
    detail: "Names, pronouns, roles and colours of your {{alters}} (not bios, notes or pictures).",
  },
  "fronting:read": {
    label: "See who is {{fronting}}",
    detail: "Which {{alters}} are {{fronting}} right now and since when (not your history).",
  },
  // The heavy one. Never a tick at install: the person allows it later on the
  // mod's card, after reading every risk, per kind of record
  // (modDataAccess.js READABLE_DATA, which `dataScopes` in the file names).
  "data:read": {
    label: "Read your records",
    detail: "A read-only copy of the kinds of records it lists (journals, check-ins, history…). You choose which, after reading what that means.",
    heavy: true,
  },
  "files:save": {
    label: "Save files to your device",
    detail: "It can offer to save a file (an export, say). The app asks you every time, showing the file's name and size.",
  },
};

const ID_RE = /^[a-z0-9][a-z0-9-]{1,47}$/;
const PAGE_ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;

export function applyModTerms(text, terms) {
  return String(text || "").replace(/\{\{(\w+)\}\}/g, (m, k) => (terms && typeof terms[k] === "string" ? terms[k] : m));
}

export class ModFormatError extends Error {
  constructor(message) { super(message); this.name = "ModFormatError"; }
}

const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// Parse the text of a picked file into a clean manifest + code, or throw a
// ModFormatError whose message can be shown to the person as-is.
export function parseModFile(text) {
  let raw;
  try { raw = JSON.parse(text); } catch { throw new ModFormatError("This file isn't a mod — it isn't readable mod data."); }
  if (!raw || typeof raw !== "object" || raw.format !== MOD_FORMAT) {
    throw new ModFormatError("This file isn't an Oceans Symphony mod.");
  }
  if (Number(raw.formatVersion || 1) > MOD_FORMAT_VERSION) {
    throw new ModFormatError("This mod needs a newer version of the app. Update the app, then try again.");
  }
  const id = str(raw.id, 48).toLowerCase();
  if (!ID_RE.test(id)) throw new ModFormatError("This mod has no valid id (lowercase letters, numbers and dashes).");
  const name = str(raw.name, 60);
  if (!name) throw new ModFormatError("This mod has no name.");
  const code = typeof raw.code === "string" ? raw.code : "";
  if (!code.trim()) throw new ModFormatError("This mod has no code.");
  if (new Blob([code]).size > MAX_MOD_CODE_BYTES) throw new ModFormatError("This mod is too large (over 2 MB of code).");

  const permissions = Array.isArray(raw.permissions)
    ? [...new Set(raw.permissions.filter((p) => typeof p === "string"))]
    : [];
  const unknown = permissions.filter((p) => !MOD_PERMISSIONS[p]);
  if (unknown.length) {
    throw new ModFormatError(`This mod asks for something this version of the app doesn't know (${unknown.join(", ")}). It may need a newer version of the app.`);
  }

  const seen = new Set();
  const pages = (Array.isArray(raw.pages) ? raw.pages : [])
    .map((p) => ({ id: str(p?.id, 40).toLowerCase(), title: str(p?.title, 40) }))
    .filter((p) => PAGE_ID_RE.test(p.id) && p.title && !seen.has(p.id) && seen.add(p.id))
    .slice(0, 12);
  if (!pages.length) throw new ModFormatError("This mod has no pages to show.");

  return {
    mod_id: id,
    name,
    version: str(raw.version, 20) || "1.0.0",
    author: str(raw.author, 60),
    description: str(raw.description, 500),
    homepage: /^https:\/\//i.test(str(raw.homepage, 300)) ? str(raw.homepage, 300) : "",
    permissions,
    // Which kinds of records a data:read mod wants (READABLE_DATA keys).
    // Anything the app doesn't offer is dropped; the person still decides.
    dataScopes: permissions.includes("data:read")
      ? [...new Set((Array.isArray(raw.dataScopes) ? raw.dataScopes : []).filter(isReadableEntity))]
      : [],
    pages,
    code,
  };
}
