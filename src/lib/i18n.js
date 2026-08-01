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

const STORAGE_KEY = "symphony_locale";
const FALLBACK = "en";

// Pick the best available locale for a browser language list, e.g.
// ["pt-BR","pt","en"] → "pt-BR" if registered, else "pt", else "en".
export function resolveLocale(preferred, available = Object.keys(LOCALES)) {
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
