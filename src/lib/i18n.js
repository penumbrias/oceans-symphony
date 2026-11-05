// Lightweight translation layer — the foundation, not the translations.
//
// Goal: every string written from here on is addressable by key, so a
// translator can supply a locale file later without touching components.
// No dependency, no build step: locales are plain objects, English is the
// source of truth and the fallback for any missing key.
//
// HOW IT COEXISTS WITH USER TERMINOLOGY
// `useTerms()` is the user's OWN vocabulary (what THEY call alters /
// fronting / system) and is not translation — a Spanish user may still
// call them "headmates". So translated strings keep {{Alter}}-style
// placeholders, and callers pass them through applyTerms() exactly as
// before. Translation handles the sentence; terminology handles the noun.
//
// TO ADD A LANGUAGE
//   1. Copy src/locales/en.js to src/locales/<code>.js and translate the
//      values (keep the keys and the {{placeholders}}).
//   2. Register it in LOCALES below.
// Nothing else changes; the picker and fallback are automatic.

import { useSyncExternalStore } from "react";
import en from "@/locales/en";

// Registered locales. `name` is shown in the language picker in the
// language itself (endonym), which is the convention users expect.
export const LOCALES = {
  en: { name: "English", messages: en },
};

// The translation check (v0.353.0): a made-up "language" that shows every
// translatable string in accented letters inside ⟦ ⟧. Text that still looks
// like plain English on a screen is text no translator could reach yet.
// Never picked from the device language and never listed as a language.
export const CHECK_LOCALE = "qps";
const ACCENTS = {
  a: "á", b: "ƀ", c: "ç", d: "ð", e: "é", f: "ƒ", g: "ĝ", h: "ĥ", i: "í", j: "ĵ", k: "ķ", l: "ļ", m: "ɱ",
  n: "ñ", o: "ó", p: "þ", r: "ŕ", s: "š", t: "ţ", u: "ú", w: "ŵ", y: "ý", z: "ž",
  A: "Á", B: "Ɓ", C: "Ç", D: "Ð", E: "É", G: "Ĝ", H: "Ĥ", I: "Í", J: "Ĵ", K: "Ķ", L: "Ļ",
  N: "Ñ", O: "Ó", R: "Ŕ", S: "Š", T: "Ţ", U: "Ú", W: "Ŵ", Y: "Ý", Z: "Ž",
};
// Accent the words but leave {value} and {{Term}} placeholders untouched.
export function pseudoLocalize(str) {
  if (typeof str !== "string") return str;
  const body = str.split(/(\{\{\w+\}\}|\{\w+\})/).map((part, i) =>
    i % 2 ? part : part.replace(/[A-Za-z]/g, (ch) => ACCENTS[ch] || ch)
  ).join("");
  return `⟦${body}⟧`;
}
let _checkMessages = null;
function checkMessages() {
  if (!_checkMessages) {
    _checkMessages = {};
    for (const [k, v] of Object.entries(en)) _checkMessages[k] = pseudoLocalize(v);
  }
  return _checkMessages;
}
Object.defineProperty(LOCALES, CHECK_LOCALE, {
  enumerable: false,
  value: { name: "Translation check", get messages() { return checkMessages(); } },
});

// The languages a person can pick (the check is a switch of its own).
export const pickableLocales = () => Object.keys(LOCALES);

const STORAGE_KEY = "symphony_locale";
const FALLBACK = "en";

// Pick the best available locale for a browser language list, e.g.
// ["pt-BR","pt","en"] → "pt-BR" if registered, else "pt", else "en".
export function resolveLocale(preferred, available = pickableLocales()) {
  for (const tag of preferred || []) {
    if (!tag) continue;
    if (available.includes(tag)) return tag;
    const base = String(tag).split("-")[0];
    if (available.includes(base)) return base;
  }
  return FALLBACK;
}

let _locale = (() => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && LOCALES[saved]) return saved;
  } catch { /* storage off */ }
  try {
    return resolveLocale(navigator.languages || [navigator.language]);
  } catch {
    return FALLBACK;
  }
})();

const listeners = new Set();
const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach((fn) => fn());

export function getLocale() { return _locale; }
export function setLocale(code) {
  if (!LOCALES[code]) return;
  _locale = code;
  try { localStorage.setItem(STORAGE_KEY, code); } catch { /* storage off */ }
  try { document.documentElement.lang = code; } catch { /* SSR */ }
  emit();
}

// Interpolate {name} placeholders. (Terminology uses {{Name}} and is
// resolved separately by applyTerms, so the two never collide.)
function interpolate(str, vars) {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (m, k) => (vars[k] === undefined ? m : String(vars[k])));
}

// Translate a key. Missing keys fall back to English, then to the key
// itself — a missing translation degrades to readable text, never blank.
export function translate(key, vars, locale = _locale) {
  const msg = LOCALES[locale]?.messages?.[key] ?? LOCALES[FALLBACK].messages[key] ?? key;
  return interpolate(msg, vars);
}

// Hook form: re-renders the component when the language changes.
export function useT() {
  const locale = useSyncExternalStore(subscribe, getLocale, () => FALLBACK);
  const t = (key, vars) => translate(key, vars, locale);
  t.locale = locale;
  return t;
}

// The language the translation check returns to when it is switched off.
const PREV_KEY = "symphony_locale_before_check";
export function setTranslationCheck(on) {
  if (on) {
    if (_locale !== CHECK_LOCALE) {
      try { localStorage.setItem(PREV_KEY, _locale); } catch { /* storage off */ }
    }
    setLocale(CHECK_LOCALE);
  } else {
    let back = FALLBACK;
    try { back = localStorage.getItem(PREV_KEY) || FALLBACK; } catch { /* storage off */ }
    setLocale(LOCALES[back] && back !== CHECK_LOCALE ? back : FALLBACK);
  }
}

// Hook form of getLocale, for pickers.
export function useLocale() {
  return useSyncExternalStore(subscribe, getLocale, () => FALLBACK);
}

// Keys present in English but missing from a locale — used by the
// language picker to show honest coverage instead of silent gaps.
export function localeCoverage(code) {
  const total = Object.keys(LOCALES[FALLBACK].messages).length;
  const have = Object.keys(LOCALES[code]?.messages || {}).filter(
    (k) => LOCALES[FALLBACK].messages[k] !== undefined
  ).length;
  return { have, total, pct: total ? Math.round((have / total) * 100) : 0 };
}

try { document.documentElement.lang = _locale; } catch { /* SSR */ }
