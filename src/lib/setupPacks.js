// Setup packs — shareable home-screen/theme bundles ("like downloading a
// texture pack"). Three independent types, combinable per export and
// re-choosable per import:
//
//   layout       — which widgets sit on a page, where, at what size/mode
//   widgetStyles — the user's named widget looks (colours, fonts, borders…)
//   uiTheme      — the Display-options state (tokens, bars, bar looks)
//
// HARD RULE: a pack NEVER carries personal data. Sanitizers below strip
// every settings key that references the user's own records (journals,
// groups, symptoms, contacts, maps…) and every local image reference
// (local-image:// ids are meaningless — and private — outside this device).
// The export/import UI shows the full pack JSON for review before anything
// leaves or lands.
//
// Saved packs live in SystemSettings.ui_v2_setup_packs (rides backups).

export const PACK_FORMAT = "symphony_setup_pack";
export const PACK_VERSION = 1;

// Widget-settings keys that point at the USER'S OWN records or content.
// Anything listed is dropped from layout exports. Kept conservative and
// explicit — new personal keys must be added here when widgets grow them.
const PERSONAL_SETTING_KEYS = new Set([
  "journal", "boards", "groupId", "symptomIds", "appIds", "links", "label",
  "mapId", "layerId", "targetId", "song", "pinnedAvatars", "avatarOverride",
  "notebookAlters", "alterId", "contactIds",
]);

const isLocalRef = (v) => typeof v === "string" && (v.startsWith("local-image://") || v.startsWith("folder://") || v.startsWith("data:"));

function sanitizeSettings(settings = {}) {
  const out = {};
  for (const [k, v] of Object.entries(settings)) {
    if (PERSONAL_SETTING_KEYS.has(k)) continue;
    if (isLocalRef(v)) continue;
    if (v && typeof v === "object") continue; // nested structures are where ids hide
    out[k] = v;
  }
  return out;
}

function sanitizeLook(look = {}) {
  const out = {};
  for (const [k, v] of Object.entries(look)) {
    if (isLocalRef(v)) continue;
    out[k] = v;
  }
  return out;
}

// ── Builders ───────────────────────────────────────────────────────
export function buildLayoutType(home) {
  const pages = (home?.pages || []).map((p) => ({
    layoutMode: p.layoutMode || "flow",
    widgets: (p.widgets || []).map((w) => ({
      widgetId: w.widgetId,
      span: w.span || null,
      pos: w.pos || null,
      mode: w.mode || "normal",
      settings: sanitizeSettings(w.settings || {}),
    })),
  }));
  return { pages, grid: home?.grid || null };
}

export function buildWidgetStylesType(userStyles = []) {
  return userStyles.map((s) => ({ id: s.id, label: s.label, look: sanitizeLook(s.look || {}) }));
}

export function buildUiThemeType(uiV2Raw = {}) {
  // The stored ui_v2 object minus anything device/personal: icon image
  // overrides (local images) are stripped; named lucide icons survive.
  const clone = JSON.parse(JSON.stringify(uiV2Raw || {}));
  if (clone.icons) {
    for (const group of Object.values(clone.icons)) {
      if (!group || typeof group !== "object") continue;
      for (const [id, icon] of Object.entries(group)) {
        if (icon && typeof icon === "object" && isLocalRef(icon.imageUrl)) delete group[id];
      }
    }
  }
  if (clone.barLooks) {
    for (const [barId, look] of Object.entries(clone.barLooks)) {
      clone.barLooks[barId] = sanitizeLook(look || {});
    }
  }
  delete clone.activeDockPos;
  return clone;
}

export function buildPack({ title, layout = null, widgetStyles = null, uiTheme = null }) {
  const types = {};
  if (layout) types.layout = layout;
  if (widgetStyles) types.widgetStyles = widgetStyles;
  if (uiTheme) types.uiTheme = uiTheme;
  return {
    __format: PACK_FORMAT,
    __version: PACK_VERSION,
    title: String(title || "My setup").slice(0, 60),
    created: new Date().toISOString(),
    types,
  };
}

// ── Parse / summarize ──────────────────────────────────────────────
export function parsePack(text) {
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error("Not valid JSON."); }
  if (parsed?.__format !== PACK_FORMAT || !parsed.types || typeof parsed.types !== "object") {
    throw new Error("Not a Symphony setup pack.");
  }
  return parsed;
}

export function summarizePack(pack) {
  const t = pack?.types || {};
  const parts = [];
  if (t.layout) {
    const n = (t.layout.pages || []).reduce((s, p) => s + (p.widgets?.length || 0), 0);
    parts.push(`Layout: ${t.layout.pages?.length || 0} page(s), ${n} widget(s)`);
  }
  if (t.widgetStyles) parts.push(`Widget styles: ${t.widgetStyles.length} (${t.widgetStyles.map((s) => s.label).join(", ").slice(0, 80)})`);
  if (t.uiTheme) parts.push("UI theme: Display-options state (bars, tokens, looks)");
  return parts;
}

// Safety re-check on IMPORT too — a hand-edited pack could smuggle refs.
export function packLooksSafe(pack) {
  const raw = JSON.stringify(pack.types || {});
  return !/local-image:\/\/|data:image|"secret"|"userId"/.test(raw);
}
