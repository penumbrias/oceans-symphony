// UI v2 — the instrument shell's data model (docs/ui-v2-instrument-ia.md).
//
// Stored as SystemSettings.ui_v2 (sanitize-on-read, same philosophy as
// experimental_home). The GRANULAR-CUSTOMIZATION CONTRACT lives here:
// every visual property of every chassis primitive reads a named token
// with a user override — nothing visual is hardcoded in the frame. Tokens
// are emitted as CSS variables by buildTokenVars(); the tuning sheet edits
// them live. Colors default to the user's existing theme variables, so the
// chassis inherits whatever theme/preset the user already runs.

export const DEFAULT_UI_V2 = {
  version: 1,
  enabled: false,
  registerOrder: null, // null = catalogue order
  commandKeys: ["quick_checkin", "start_activity", "start_symptom", "quick_task"],
  tokens: {}, // { [tokenId]: value } — only overrides are stored
};

// ── Registers ──────────────────────────────────────────────────────
// The eight registers (atlas §IA). `match` prefixes map every existing
// route into a register so v1 pages render inside the v2 frame today and
// migrate to native register views incrementally. Labels are chassis-
// neutral words (no term-vocabulary inside them); user renaming is a
// planned CONFIG option.
export const V2_REGISTERS = [
  { id: "status",  label: "Status",  path: "/",            match: [] },
  { id: "log",     label: "Log",     path: "/checkin-log", match: ["/checkin-log", "/location-history", "/sleep", "/system-checkin", "/diary"] },
  { id: "plan",    label: "Plan",    path: "/activities",  match: ["/activities", "/todo", "/tasks"] },
  { id: "roster",  label: "Roster",  path: "/Home",        match: ["/Home", "/alter", "/groups", "/group", "/system-map", "/system-history", "/presences", "/unblend", "/get-to-know-me", "/contacts", "/location"] },
  { id: "comms",   label: "Comms",   path: "/chat",        match: ["/chat", "/bulletins", "/bulletin", "/polls", "/friends"] },
  { id: "archive", label: "Archive", path: "/journals",    match: ["/journals", "/assets"] },
  { id: "data",    label: "Data",    path: "/timeline",    match: ["/timeline", "/analytics", "/therapy-report"] },
  { id: "config",  label: "Config",  path: "/settings",    match: ["/settings", "/manage-checkin"] },
];

// AID overlay routes — not a register; the AID key lights up on them.
export const AID_ROUTES = ["/grounding", "/safety-plan"];

export function registerForPath(pathname) {
  if (AID_ROUTES.some((p) => pathname.startsWith(p))) return "aid";
  for (const reg of V2_REGISTERS) {
    if (reg.match.some((p) => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p + "?"))) {
      return reg.id;
    }
  }
  return "status"; // "/" and anything unmapped
}

// ── Command strip keys ─────────────────────────────────────────────
// Capture keys navigate with a param the Dashboard's action effect
// handles (capture modals are hosted there). ≤2 gestures from anywhere.
export const V2_COMMAND_KEYS = [
  { id: "quick_checkin",  target: "/?action=quick-checkin",  label: "Check-in" },
  { id: "start_activity", target: "/?action=start-activity", label: "Activity" },
  { id: "start_symptom",  target: "/?action=start-symptom",  label: "Symptom" },
  { id: "quick_task",     target: "/?action=quick-task",     label: "Task" },
  { id: "quick_plan",     target: "/?action=quick-plan",     label: "Plan" },
  { id: "set_front",      target: "/?action=set-front",      label: "Front" },
];

// ── Token catalogue (the granular-customization substrate) ─────────
// type: "range" (numeric + unit) | "color" (empty = inherit theme) |
// "select". Every chassis primitive styles itself ONLY through the
// emitted CSS vars, so every one of these is user-tunable, and new
// primitives must add their knobs here rather than hardcoding.
export const V2_TOKEN_DEFS = [
  { id: "accent",    label: "Accent color",        type: "color",  cssVar: "--v2-accent",    default: "" }, // "" → theme primary
  { id: "fontScale", label: "Text size",           type: "range",  cssVar: "--v2-font-scale", default: 100, min: 80, max: 130, step: 5, unit: "%" },
  { id: "density",   label: "Density",             type: "select", cssVar: "--v2-space",
    options: [{ v: "compact", label: "Compact", css: "4px" }, { v: "cozy", label: "Cozy", css: "6px" }, { v: "roomy", label: "Roomy", css: "9px" }],
    default: "cozy" },
  { id: "radius",    label: "Corner radius",       type: "range",  cssVar: "--v2-radius",    default: 8,  min: 0, max: 20, step: 1, unit: "px" },
  { id: "borderW",   label: "Border width",        type: "range",  cssVar: "--v2-border-w",  default: 1,  min: 0, max: 3,  step: 1, unit: "px" },
  { id: "stripH",    label: "Register bar height", type: "range",  cssVar: "--v2-strip-h",   default: 46, min: 36, max: 64, step: 2, unit: "px" },
  { id: "cmdSize",   label: "Command key size",    type: "range",  cssVar: "--v2-cmd-size",  default: 42, min: 34, max: 60, step: 2, unit: "px" },
  { id: "contentW",  label: "Content width",       type: "range",  cssVar: "--v2-content-w", default: 0,  min: 0, max: 1400, step: 40, unit: "px" }, // 0 = full width
  { id: "statusH",   label: "Status line height",  type: "range",  cssVar: "--v2-status-h",  default: 38, min: 30, max: 56, step: 2, unit: "px" },
];

export function resolveUiV2(stored) {
  const src = stored && typeof stored === "object" ? stored : {};
  const tokens = {};
  for (const def of V2_TOKEN_DEFS) {
    const v = src.tokens?.[def.id];
    if (v === undefined || v === null) continue;
    if (def.type === "range") {
      const n = parseInt(v, 10);
      if (Number.isFinite(n)) tokens[def.id] = Math.max(def.min, Math.min(def.max, n));
    } else if (def.type === "select") {
      if (def.options.some((o) => o.v === v)) tokens[def.id] = v;
    } else if (def.type === "color") {
      if (typeof v === "string" && (v === "" || /^#[0-9a-fA-F]{3,8}$/.test(v))) tokens[def.id] = v;
    }
  }
  const knownRegister = (id) => V2_REGISTERS.some((r) => r.id === id);
  return {
    version: 1,
    enabled: src.enabled === true,
    registerOrder: Array.isArray(src.registerOrder) && src.registerOrder.every(knownRegister)
      ? src.registerOrder.filter(knownRegister)
      : null,
    commandKeys: Array.isArray(src.commandKeys)
      ? src.commandKeys.filter((id) => V2_COMMAND_KEYS.some((k) => k.id === id))
      : [...DEFAULT_UI_V2.commandKeys],
    tokens,
  };
}

export function orderedRegisters(uiV2) {
  if (!uiV2.registerOrder) return V2_REGISTERS;
  const byId = Object.fromEntries(V2_REGISTERS.map((r) => [r.id, r]));
  const ordered = uiV2.registerOrder.map((id) => byId[id]).filter(Boolean);
  for (const r of V2_REGISTERS) if (!ordered.includes(r)) ordered.push(r);
  return ordered;
}

// Token values → inline CSS variables for the [data-ui-v2] wrapper.
export function buildTokenVars(uiV2) {
  const vars = {};
  for (const def of V2_TOKEN_DEFS) {
    const v = uiV2.tokens[def.id] ?? def.default;
    if (def.type === "range") {
      if (def.id === "fontScale") vars[def.cssVar] = `${v / 100}`;
      else if (def.id === "contentW" && (!v || v === 0)) vars[def.cssVar] = "100%";
      else vars[def.cssVar] = `${v}${def.unit || "px"}`;
    } else if (def.type === "select") {
      const opt = def.options.find((o) => o.v === v) || def.options[0];
      vars[def.cssVar] = opt.css;
    } else if (def.type === "color") {
      vars[def.cssVar] = v || "hsl(var(--primary))";
    }
  }
  return vars;
}
