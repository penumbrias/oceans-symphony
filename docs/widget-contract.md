# The Widget Contract (UI v2)

*Every widget follows this. It exists because look overrides (border, text
size, colors) silently did nothing on widgets that hand-rolled their own box —
the breathing widget was the first one a tester caught. If a widget follows
this contract, every control in the widget-options sheet works on it with no
per-widget wiring. If you're adding a widget and find yourself writing a
`style={{ border… }}` on your own container, stop and re-read this.*

## The three layers

```
wrapper (ExperimentalDashboard SortableWidget)
  └── data-widget-content div   ← the LOOK lands here as CSS variables
        └── the widget component
              └── exactly ONE visible box (Section, or boxStyle for tiles)
                    └── content
```

1. **The wrapper owns placement** (grid cell, drag, resize). Widgets never
   size or position themselves.
2. **The look arrives as CSS variables** on the `data-widget-content` div —
   `lookToStyle()` in `src/lib/widgetLook.js` is the only emitter. A widget
   never reads its own `settings.borderW` / `settings.bg` / etc. directly.
3. **Exactly one element consumes the box variables** — the widget's single
   visible box. That element is either:
   - `<Section>` from `src/v2/primitives.jsx` (lists, panels — the default), or
   - `boxStyle` (exported from `primitives.jsx`) spread onto a tile-shaped
     root (app tiles, folders, quick links — things that read as icons, not
     panels).

   Nothing else in the widget sets border / background / shadow / padding
   from the look. Inner elements may use `var(--v2-radius)` and
   `var(--v2-accent)` for consistency, but the *box* is singular — two
   elements both painting `--v2-widget-bg` is how you get double borders.

## The variables (single source: `widgetLook.js`)

| Look field | Emitted as | Consumed by |
|---|---|---|
| `radius` | `--v2-radius` + `--radius` | box, inner rounded-* via index.css remap |
| `borderW` | `--v2-border-w` | box, `.border*` utilities via index.css remap |
| `borderColor` / `borderStyle` | `--v2-border-color` / `--v2-border-style` | box |
| `bg` | `--v2-widget-bg` | box |
| `shadow` | `--v2-shadow` | box |
| `padding` | `--v2-pad` | box |
| `accent` | `--v2-accent` + `--color-primary` | anything `bg-primary`/`text-primary`, accent-tinted frames |
| `font` | `font-family` (inherits) | all text |
| `fontScale` | `font-size: %` on the wrapper | all text — **which is why widget text is em, see below** |
| `textColor` | `color` (inherits) + `--v2-text` + `--v2-text-muted` | unclassed text; `.text-foreground` / `.text-muted-foreground` via index.css remap |
| `bgImage` | painted on the wrapper itself | shows through a transparent box |
| `css` | user CSS scoped by attribute selector | anything |

The dual emits are the load-bearing trick: `--radius` and `--color-primary`
are the *app-wide* tokens, re-declared at widget scope, so everything inside
the widget that already follows the app theme follows the widget's override
automatically. Never consume `settings.accent` etc. directly — you'd bypass
saved styles (`mergeLook`) and break inheritance.

## Text inside widgets is em, not rem

`fontScale` works by setting a percentage font-size on the wrapper. Tailwind's
`text-sm`/`text-xs` are rem — relative to the page root, immune to the
wrapper. So inside `[data-widget-content]`:

- The standard utilities (`text-xs`…`text-xl`) are remapped to em equivalents
  in `index.css` — you can keep using them and they scale.
- **Never use bracketed rem sizes in widget code** (`text-[0.625rem]`) — the
  remap can't catch arbitrary values. Use the em form: `text-[0.625em]`.
- Keep text-size classes on leaf elements (the span/p that holds the text),
  not on containers — em compounds through nesting.

## Colors

- **Never hardcode a hue** for chrome (borders, frames, highlights) — use
  `var(--v2-accent)` (usually through `color-mix(... 40%, transparent)`).
  Semantic hues (a sleep-blue dot, a member's color) are content, not chrome —
  those stay.
- Body text: default (inherits) or `text-foreground`; secondary text:
  `text-muted-foreground`. Both follow the widget's `textColor` via the
  index.css remap. Don't invent other grey classes (`text-gray-400`,
  `text-white`) — they escape the override.

## Sizing

- Root element: `h-full min-h-0` so the widget fills its cell (a widget
  resized taller must LOOK taller). Scrolling happens inside the box
  (`Section` does this for you), never on the widget root.
- Anything that must scale with the cell (the breathing circle) measures its
  container with a ResizeObserver — never a fixed px canvas.

## Everything else (unchanged rules, listed for one-stop reading)

- Labels through `useT()` / `useTerms()`; alter names through `useAlterLabel()`.
- Unbounded pickers are searchable (`SearchableSelect`) — pills only for ≤5
  static options.
- Avatars through `useResolvedAvatarUrl` (raw `<img src>` breaks
  `local-image://`).
- Widgets are building blocks: no backpacked conveniences from the classic
  component they came from.
- Register in the v2 registry with label/description/settings schema; new
  entities ship with backup + search + tour wiring per CLAUDE.md.

## Compliance checklist for a new widget

1. One visible box: `Section` or `boxStyle` — and only one.
2. No direct reads of look fields from `settings`.
3. All text via standard utilities or em brackets; classes on leaves.
4. No hardcoded chrome hues; accent through `--v2-accent`.
5. Root is `h-full min-h-0`; overflow scrolls inside the box.
6. Test: open widget options → set border width 4, background, text size 130%,
   text color, accent — all five must visibly change. If any does nothing,
   the contract is broken.


## Inner surfaces (v0.204.0)

Components hosted inside a widget that paint their own `bg-card` /
`bg-background` (the rich editor, bulletin cards, embedded classic
components) follow the widget's background whenever the look sets one:
index.css maps those classes to `var(--v2-widget-bg, <normal token>)`
inside `[data-widget-content]`. A component that hand-rolls an inline
background must consume `var(--v2-widget-bg, …)` itself (see
WysiwygEditor's root). The compliance test extends: set a background in
the widget's options — NO inner panel may stay on the old colour.

## Advanced options (v0.204.0)

Every widget's options sheet carries an **Advanced** collapsed group in
"Colors & background":

- Per-side spacing — `padTop` / `padRight` / `padBottom` / `padLeft`
  look keys → `--v2-pad-t/r/b/l`, each overriding the uniform
  `--v2-pad` on its side only (boxStyle consumes the fallback chain).
- **Your own CSS** — the existing scoped escape hatch (`css` look key,
  applied per-widget via `[data-widget-id]`).

These come free from the shared sheet + `lookToStyle` + `boxStyle`; a
widget only breaks them by hand-rolling its box (same rule as the
one-visible-box contract).
