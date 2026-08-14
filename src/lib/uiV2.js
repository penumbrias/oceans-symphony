// UI v2 — the instrument shell's data model (docs/ui-v2-instrument-ia.md).
//
// Stored as SystemSettings.ui_v2 (sanitize-on-read, same philosophy as
// experimental_home). The GRANULAR-CUSTOMIZATION CONTRACT lives here:
// every visual property of every chassis primitive reads a named token
// with a user override — nothing visual is hardcoded in the frame. Tokens
// are emitted as CSS variables by buildTokenVars(); the tuning sheet edits
// them live. Colors default to the user's existing theme variables, so the
// chassis inherits whatever theme/preset the user already runs.

import {
  Home, ClipboardList, CalendarDays, Users, MessageSquare, BookOpen,
  BarChart2, Settings,
} from "lucide-react";

export const DEFAULT_UI_V2 = {
  version: 1,
  enabled: false,
  // Custom icon for the top-left apps button ("" = the default grid glyph).
  appsIcon: "",
  // What the apps button opens: the app grid drawer, or the classic sidebar.
  appsView: "grid",
  // Where the floating/bubble quick-action dock sits — set by dragging it.
  // null = the dockSide token's edge at mid-height.
  dockPos: null,
  registerOrder: null, // null = catalogue order
  // Every key the bar can hold; the user picks which in Display options →
  // Quick actions. Plan and Set-front ship on by default because they were
  // the two people went looking for first.
  commandKeys: ["quick_checkin", "quick_note", "start_activity", "start_symptom", "quick_thing", "set_front"],
  tokens: {}, // { [tokenId]: value } — only overrides are stored
  // Per-bar visibility. When the top bar is off, a small floating button
  // keeps Display options reachable so no combination can strand the user.
  bars: { top: true, actions: true, tabs: true, wave: true, rail: true },
};

// ── Sections (bottom bar tabs) ─────────────────────────────────────
// Eight sections, all visible. `match` prefixes map every existing route
// into a section so v1 pages render inside the v2 frame today and migrate
// to native section views incrementally. NAMING POLICY (owner mandate):
// plain, accurate, non-thematic words only. Ids stay stable for stored
// order; labels are display-only. `labelTermKey` defers to the user's own
// terminology (resolveLabel pattern — this file can't call hooks).
export const V2_REGISTERS = [
  { id: "status",  label: "Home",      icon: Home,          path: "/",            match: [] },
  { id: "log",     label: "Records",   icon: ClipboardList, path: "/checkin-log", match: ["/checkin-log", "/location-history", "/sleep", "/system-checkin", "/diary"] },
  { id: "plan",    label: "Planner",   icon: CalendarDays,  path: "/activities",  match: ["/activities", "/todo", "/tasks"] },
  { id: "roster",  labelTermKey: "Alters", icon: Users,     path: "/Home",        match: ["/Home", "/alter", "/groups", "/group", "/system-map", "/system-history", "/presences", "/unblend", "/get-to-know-me", "/contacts", "/location"] },
  { id: "comms",   label: "Social",    icon: MessageSquare, path: "/chat",        match: ["/chat", "/bulletins", "/bulletin", "/polls", "/friends"] },
  { id: "archive", label: "Journal",   icon: BookOpen,      path: "/journals",    match: ["/journals", "/assets"] },
  { id: "data",    label: "Analytics", icon: BarChart2,     path: "/timeline",    match: ["/timeline", "/analytics", "/therapy-report"] },
  { id: "config",  label: "Settings",  icon: Settings,      path: "/settings",    match: ["/settings", "/manage-checkin"] },
];

// Support overlay routes — not a section; the Support key lights on them.
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

// ── Quick-action keys (the row above the section labels) ───────────
// Capture keys navigate with a param the Dashboard's action effect
// handles (capture modals are hosted there). ≤2 gestures from anywhere.
// "quick_note" opens a chooser instead (status note / journal entry /
// board post) — handled in the frame component.
export const V2_COMMAND_KEYS = [
  { id: "quick_checkin",  target: "/?action=quick-checkin",  label: "Check-in" },
  { id: "quick_note",     target: null,                      label: "Note" },
  { id: "start_activity", target: "/?action=start-activity", label: "Activity" },
  { id: "start_symptom",  target: "/?action=start-symptom",  label: "Symptom" },
  // One key for "something to do" — with or without a time. quick_task and
  // quick_plan were the same room behind two doors; saved bars carrying
  // either id are migrated to this one (see resolveUiV2).
  { id: "quick_thing",    target: "/?action=quick-thing",    label: "Add" },
  { id: "set_front",      target: "/?action=set-front",      label: "Front" },
];

// ── Token catalogue (the granular-customization substrate) ─────────
// type: "range" (numeric + unit) | "color" (empty = inherit theme) |
// "select". Every chassis primitive styles itself ONLY through the
// emitted CSS vars, so every one of these is user-tunable, and new
// primitives must add their knobs here rather than hardcoding.
// Grouped so the options sheet can label honestly what each knob affects.
// (Text size is NOT a token here — the sheet drives the existing app-wide
// accessibility font-size engine so it actually applies everywhere.)
export const V2_TOKEN_DEFS = [
  { id: "contentW",  group: "app",  label: "Content width",          type: "range",  cssVar: "--v2-content-w", default: 0,  min: 0, max: 1400, step: 40, unit: "px" }, // 0 = full width
  // Content alignment (the wireframed SIZE section). Applied as data
  // attributes in AppLayout (like railSide) because CSS can't branch
  // margins on a var value; index.css carries the rules.
  { id: "alignX",    group: "app",  label: "Content alignment",      type: "select", cssVar: "--v2-align-x",
    options: [{ v: "left", label: "Left", css: "left" }, { v: "center", label: "Center", css: "center" }, { v: "right", label: "Right", css: "right" }],
    default: "center" },
  { id: "alignY",    group: "app",  label: "Vertical alignment",     type: "select", cssVar: "--v2-align-y",
    options: [{ v: "top", label: "Top", css: "top" }, { v: "center", label: "Center", css: "center" }, { v: "bottom", label: "Bottom", css: "bottom" }],
    default: "top" },
  { id: "accent",    group: "bars", label: "Highlight color",        type: "color",  cssVar: "--v2-accent",    default: "" }, // "" → theme primary
  { id: "density",   group: "bars", label: "Spacing",                type: "select", cssVar: "--v2-space",
    options: [{ v: "compact", label: "Compact", css: "4px" }, { v: "cozy", label: "Medium", css: "6px" }, { v: "roomy", label: "Wide", css: "9px" }],
    default: "cozy" },
  // Default matches the app's own --radius (0.75rem), so switching the new
  // UI on doesn't silently re-corner the whole app before you touch it.
  { id: "radius",    group: "bars", label: "Corner radius",          type: "range",  cssVar: "--v2-radius",    default: 12, min: 0, max: 24, step: 1, unit: "px" },
  { id: "borderW",   group: "bars", label: "Border width",           type: "range",  cssVar: "--v2-border-w",  default: 1,  min: 0, max: 3,  step: 1, unit: "px" },
  { id: "stripH",    group: "bars", label: "Bottom tab height",      type: "range",  cssVar: "--v2-strip-h",   default: 52, min: 40, max: 68, step: 2, unit: "px" },
  { id: "cmdSize",   group: "bars", label: "Quick-action size",      type: "range",  cssVar: "--v2-cmd-size",  default: 42, min: 34, max: 60, step: 2, unit: "px" },
  { id: "actionsMode", group: "bars", label: "Quick actions display",  type: "select", cssVar: "--v2-actions-mode", default: "bar",
    options: [
      { v: "bar",    label: "Behind the bottom handle", css: "bar" },
      { v: "float",  label: "Floating edge bar",        css: "float" },
      { v: "bubble", label: "Bubble",                   css: "bubble" },
    ] },
  { id: "dockSide", group: "bars", label: "Floating bar edge",       type: "select", cssVar: "--v2-dock-side", default: "right",
    options: [{ v: "left", label: "Left", css: "left" }, { v: "right", label: "Right", css: "right" }] },
  { id: "railSide",  group: "bars", label: "Desktop rail side",      type: "select", cssVar: "--v2-rail-side", default: "left",
    options: [{ v: "left", label: "Left" }, { v: "right", label: "Right" }] },
  { id: "railActions", group: "bars", label: "Rail quick actions",    type: "select", cssVar: "--v2-rail-actions", default: "labels",
    options: [{ v: "labels", label: "With labels" }, { v: "icons", label: "Icons only" }] },
  { id: "railW",     group: "bars", label: "Desktop rail width",     type: "range",  cssVar: "--v2-rail-w",    default: 200, min: 150, max: 320, step: 10, unit: "px" },
  { id: "statusH",   group: "bars", label: "Top bar height",         type: "range",  cssVar: "--v2-status-h",  default: 48, min: 30, max: 72, step: 2, unit: "px" },
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
      ? [...new Set(src.commandKeys
          // Bars saved before the merge listed the task and plan keys
          // separately; both become the one "Add" key, in place.
          .map((id) => (id === "quick_task" || id === "quick_plan" ? "quick_thing" : id))
          .filter((id) => V2_COMMAND_KEYS.some((k) => k.id === id)))]
      : [...DEFAULT_UI_V2.commandKeys],
    tokens,
    bars: {
      top: src.bars?.top !== false,
      actions: src.bars?.actions !== false,
      tabs: src.bars?.tabs !== false,
      wave: src.bars?.wave !== false,
      // Desktop-only: the side rail that replaces the bottom bar at ≥1024px.
      rail: src.bars?.rail !== false,
    },
    appsIcon: typeof src.appsIcon === "string" ? src.appsIcon : "",
    appsView: src.appsView === "sidebar" ? "sidebar" : "grid",
    dockPos: (src.dockPos
      && ["left", "right", "top", "bottom"].includes(src.dockPos.side)
      && Number.isFinite(src.dockPos.topPct))
      // topPct is the position ALONG the chosen edge (vertical % on the
      // sides, horizontal % on top/bottom).
      ? { side: src.dockPos.side, topPct: Math.min(88, Math.max(6, src.dockPos.topPct)) }
      : null,
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
      if (def.id === "contentW") {
        // 0 = full width. Any other value gets a floor: below ~480px the
        // whole app — including the Settings page holding this slider —
        // collapses into an unusable strip, and the control to undo it is
        // inside that strip. A layout setting must never be able to make
        // its own undo unreachable. The floor applies at APPLY time, so
        // anyone already stuck is rescued on update without their stored
        // value being rewritten.
        vars[def.cssVar] = (!v || v === 0) ? "100%" : `${Math.max(480, v)}px`;
      }
      else vars[def.cssVar] = `${v}${def.unit || "px"}`;
    } else if (def.type === "select") {
      const opt = def.options.find((o) => o.v === v) || def.options[0];
      vars[def.cssVar] = opt.css;
    } else if (def.type === "color") {
      vars[def.cssVar] = v || "var(--color-primary)";
    }
  }

  // These are not "v2 chrome" settings — they're the app's settings, and
  // they reach every card, button, input and dialog, not just the bars:
  //   • the highlight colour IS the app's primary colour
  //   • the corner radius IS --radius, which every component reads
  //   • border width and spacing drive the utility overrides in index.css
  // A widget or component that sets its own value still wins, because it
  // overrides these further down the tree.
  const accent = uiV2.tokens.accent;
  if (accent) vars["--color-primary"] = accent;
  vars["--radius"] = vars["--v2-radius"];
  // Density as a multiplier around the middle setting, so "Medium" leaves
  // the app's own spacing exactly as designed.
  const space = parseFloat(vars["--v2-space"]) || 6;
  vars["--v2-density"] = String(Math.round((space / 6) * 100) / 100);
  return vars;
}
