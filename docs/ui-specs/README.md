# UI spec sheets

One file per designed surface. **Before building or changing any UI
surface, read the specs that touch it** — they are the record of what was
decided, why, and which shared components implement it. When a new surface
ships (or an existing one changes shape), update or add its spec **in the
same commit**.

The point (owner's rule, Aug 2026): keep the UI standardized, and never
rebuild a surface that should be the same surface re-rendered — e.g.
"Display options" reached from any route must open the SAME sheet, not a
lookalike.

## Index

| Spec | Surface |
|---|---|
| [options-sheets.md](options-sheets.md) | The three options sheets (Display options, Home screen settings, Widget options) — shell, resize, docking, close |
| [display-options-content.md](display-options-content.md) | What's INSIDE Display options / Home settings (sections, rows, controls) |

## House rules that apply to every surface

- **No descriptive filler text.** No explainer lines under titles, no
  labels under grab bars, no "this does X" paragraphs. The affordance
  carries the meaning; `aria-label` carries it for screen readers.
- **One implementation per pattern.** Pickers, sheets, docks, hold
  gestures: reuse the shared component (`SearchableSelect`,
  `AssetPickerModal`, `IconPicker`, `EdgeDock`, `PeekResize`,
  `useHoldDragLevel`, `ArrangeRow`…). Never fork.
- **Terms via `useTerms()`** everywhere a system/alter/front/switch word
  appears; alter names via `useAlterLabel()`.
- **Lists that can grow are capped + scrollable** (`max-h-* overflow-y-auto
  overscroll-contain`), searchable when unbounded.
- **Set-then-slide** for size controls (SliderRow / SetRow): the slider
  appears after an explicit tap so scrolling can't change a value.
- **Real theme tokens only** in inline styles: `var(--color-*)`,
  `--v2-*` vars. shadcn-style `hsl(var(--border))` etc. work only because
  ThemeContext aliases them — prefer the real names.
