// Preview Mode controller.
//
// When active, every entity read/write goes through an in-memory snapshot of
// curated example data instead of the real IndexedDB. Real user data is
// never read from or written to while Preview Mode is on, so there is no
// way for a Preview Mode session to alter what's on disk.
//
// Each preview system also brings its own theme + font, plus optional
// per-alter theme presets and alter→preset links. When entering preview we
// back up the user's current theme/font/mode/customColors AND their saved
// presets and alter links to localStorage; on exit we restore the backup.
//
// State is kept in localStorage so the banner survives reloads, but the
// actual data dump is regenerated from previewSystems.js each time so it
// always reflects "now" relative to the timeline.

import { queryClientInstance } from "./query-client";
import { setPreviewDb, clearPreviewDb, isPreviewDbActive } from "./localDb";
import { getPreviewSystem, PREVIEW_SYSTEMS } from "./previewSystems";
import { resolveFontCss } from "./useAccessibility";

const STORAGE_KEY = "symphony_preview_active_system";
const THEME_BACKUP_KEY = "symphony_preview_saved_theme";

const listeners = new Set();

function notify() {
  listeners.forEach((fn) => {
    try { fn(); } catch {}
  });
}

export function isPreviewActive() {
  return isPreviewDbActive();
}

export function getActiveSystemKey() {
  return localStorage.getItem(STORAGE_KEY) || null;
}

export function getActiveSystem() {
  const key = getActiveSystemKey();
  if (!key) return null;
  return getPreviewSystem(key);
}

function applyFont(font) {
  if (!font) return;
  localStorage.setItem("symphony_a11y_fontFamily", font);
  document.documentElement.style.setProperty("--font-sans", resolveFontCss(font));
}

function applyTheme({ theme, themeMode }) {
  if (theme) localStorage.setItem("symphony_selectedTheme", theme);
  if (themeMode) localStorage.setItem("symphony_themeMode", themeMode);
  // A custom-colors override would defeat a preset, so clear it for preview.
  localStorage.removeItem("symphony_customColors");
}

function applyAlterCustomization(presets, links) {
  // Merge preview-only presets and links INTO the user's existing ones so we
  // can showcase per-alter themes. (We restore the originals on exit.)
  if (presets && Object.keys(presets).length) {
    localStorage.setItem("symphony_userCustomPresets", JSON.stringify(presets));
  }
  if (links && Object.keys(links).length) {
    localStorage.setItem("symphony_alterThemeLinks", JSON.stringify(links));
  }
}

function backupCurrentThemeState() {
  if (localStorage.getItem(THEME_BACKUP_KEY)) return;
  const saved = {
    theme:        localStorage.getItem("symphony_selectedTheme"),
    font:         localStorage.getItem("symphony_a11y_fontFamily"),
    themeMode:    localStorage.getItem("symphony_themeMode"),
    customColors: localStorage.getItem("symphony_customColors"),
    userCustomPresets: localStorage.getItem("symphony_userCustomPresets"),
    alterThemeLinks:   localStorage.getItem("symphony_alterThemeLinks"),
  };
  localStorage.setItem(THEME_BACKUP_KEY, JSON.stringify(saved));
}

function restoreThemeState() {
  const raw = localStorage.getItem(THEME_BACKUP_KEY);
  if (!raw) return;
  try {
    const saved = JSON.parse(raw);
    const setOrRemove = (k, v) => v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v);
    setOrRemove("symphony_selectedTheme",    saved.theme);
    setOrRemove("symphony_a11y_fontFamily",  saved.font);
    setOrRemove("symphony_themeMode",        saved.themeMode);
    setOrRemove("symphony_customColors",     saved.customColors);
    setOrRemove("symphony_userCustomPresets", saved.userCustomPresets);
    setOrRemove("symphony_alterThemeLinks",   saved.alterThemeLinks);
    document.documentElement.style.setProperty("--font-sans", resolveFontCss(saved.font || "inter"));
  } catch {}
  localStorage.removeItem(THEME_BACKUP_KEY);
}

function splitBuildOutput(data) {
  // The build() result mixes entity tables (Alter, FrontingSession, …) with
  // a couple of preview-only `$`-prefixed fields. Separate them so the
  // entity dict goes to localDb and the rest is consumed locally.
  const entities = {};
  const meta = {};
  for (const [k, v] of Object.entries(data || {})) {
    if (k.startsWith("$")) meta[k.slice(1)] = v;
    else entities[k] = v;
  }
  return { entities, meta };
}

export async function enterPreview(systemKey) {
  const system = getPreviewSystem(systemKey);
  if (!system) throw new Error(`Unknown preview system: ${systemKey}`);
  backupCurrentThemeState();
  const { entities, meta } = splitBuildOutput(system.build());
  setPreviewDb(entities);
  localStorage.setItem(STORAGE_KEY, systemKey);
  applyFont(system.font);
  applyTheme({ theme: system.theme, themeMode: system.themeMode });
  applyAlterCustomization(meta.themePresets, meta.alterThemeLinks);
  window.dispatchEvent(new CustomEvent("symphony-theme-storage-change"));
  await queryClientInstance.invalidateQueries();
  notify();
}

export async function exitPreview() {
  restoreThemeState();
  clearPreviewDb();
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent("symphony-theme-storage-change"));
  await queryClientInstance.invalidateQueries();
  notify();
}

// Called once on app start to restore preview mode if it was active before
// the page reloaded. Theme + font are already in localStorage from the prior
// enterPreview call, so initAccessibility / ThemeContext pick them up
// naturally — we just need to re-build the data snapshot here.
export async function restorePreviewIfActive() {
  const key = getActiveSystemKey();
  if (!key) return;
  const system = getPreviewSystem(key);
  if (!system) {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(THEME_BACKUP_KEY);
    return;
  }
  const { entities } = splitBuildOutput(system.build());
  setPreviewDb(entities);
  notify();
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export { PREVIEW_SYSTEMS };
