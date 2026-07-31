# UI v2 — Chassis & token contract

*The chassis is the neutral default UI: basic architecture in service of
function, usability, accessibility. It has no personality of its own —
personality is the user's, delivered through tokens, themes, and the
existing customization systems.*

## The granular-customization contract (owner mandate)

**Every visual property of every chassis primitive is a named token with a
user override.** Colors, sizes, themes, widths, spacing, radii, borders,
densities — all of it. Concretely:

1. Tokens are declared in `src/lib/uiV2.js` (`V2_TOKEN_DEFS`): id, label,
   type (range / color / select), CSS variable, default, bounds.
2. `buildTokenVars()` emits them as `--v2-*` CSS variables on the AppLayout
   root when the shell is on; overrides persist in
   `SystemSettings.ui_v2.tokens` (sanitized on read, only deltas stored).
3. Chassis components style themselves ONLY through `--v2-*` vars (plus the
   user's existing theme variables for color grounds). A hardcoded px or hex
   in a chassis component is a defect.
4. The tuning sheet (sliders icon in the status line) edits every token
   live. New primitives MUST register their knobs in `V2_TOKEN_DEFS` in the
   same commit — the tuning sheet renders from the catalogue, so new knobs
   appear automatically.
5. Color tokens default to "" = inherit the user's theme — the chassis
   follows every existing theme/preset/per-alter-link without any v2 work.

### Scoping ladder (build order)
Global tokens (shipped) → per-register overrides → per-widget overrides
(the experimental homescreen's settings.style/label/iconUrl pattern
generalizes) → per-member linked overrides (rides the existing alter-theme
link). Appearance presets will capture `ui_v2.tokens` alongside theme/terms
so whole looks round-trip.

### Current token set (v1 — grows with every primitive)
accent color · text scale (80–130%) · density (compact/cozy/roomy spacing
base) · corner radius (0–20px) · border width (0–3px) · register-bar height
· command-key size · content max-width (incl. full) · status-line height.

## Shipped primitives (vertical slice, v0.95.0)

- **V2StatusLine** — system name, live presence readout (primary + count),
  clock, notification LED (deep-links the inbox), search, tuning.
- **V2BottomChrome** — command strip (configurable capture keys navigating
  Dashboard's action params; AID key always last, accent-marked, lights on
  aid routes) above the register strip (all eight registers, active shown
  by accent inset, user-orderable via `ui_v2.registerOrder`).
- **Register mapping** — every existing route renders inside the frame
  under its register (`registerForPath`); classic chrome hides via one CSS
  gate (`.os-classic-chrome`), ambient layer (grocery cover, tours,
  swipe-back, background sync, banners) untouched.

## Not yet (next rungs)

Register readout strip + uniform register anatomy; STATUS interior
(composable via the widget registry); native LOG/PLAN/ROSTER views;
register rename + reorder UI; per-register tokens; preset capture of
tokens; a11y-mode list collapse of the register strip; page-scoped tour
steps for the frame.
