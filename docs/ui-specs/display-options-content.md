# Display options / Home settings — content spec

Body = `UiEditSheet.jsx` (`SizeSection` → `BarsSection` → `ColorsSection` →
`PresetsSection`). The home-settings drawer prepends its board pills row
("Back to classic", "Layout: Flow/Free", "Grid: N across").

## THIS HOME SCREEN pills (home sheet only)

- `Grid: N across` — width only (4/5/6/8). The row unit follows the width
  internally (80/80/60/40px); never expose the px pair to the user.
  Changing it rescales every widget proportionally.

## TEXT & LAYOUT (SizeSection)

Two groups, in this order:

- **Text** — a live preview (a real `<h3>` + body line, so it renders with
  the app's own heading/body styles), then two `TextCard`s, **Body** and
  **Headings**, with the SAME three rows in the same order: font
  (SearchableSelect + FontUploadButton) · size (− value + `Stepper`; body
  shows the root %, headings show % vs body) · style (flag buttons).
  Never split a font from its own size/style again — that was the
  "poorly laid out" complaint.
- **Layout** — Content width, Alignment (PillRow), Touch target spacing,
  Border width, Corner radius, as set-then-slide rows (SetRow/TokenSlider).

No explainer paragraphs.

## Bars (BarsSection) — one SubSection per bar

Top bar / Bottom bar / Side bar / Quick action bar / Alter bar. Shared row
grammar:

- **Alter bar section embeds the FULL PinnedAltersConfigPanel** (pins /
  order / Display ticks / Name shown / Icon shape / fronting emphasis +
  shape / per-alter avatars / front levels) — the same panel the bar's
  gear opens; no duplicated Labels row.
- **ArrangeRow** (the standard reorderable-list row): bordered `rounded-lg`
  row, checkbox + label, `w-7 h-7` chevron-icon move buttons (lucide
  ChevronUp/Down — never text arrows). Used for top-bar items; bottom-bar
  pages and quick-action keys should migrate to it when touched.
- Per-row **icon override button** (nav pages, quick-action keys) opening
  the shared `IconPicker` (searchable Lucide grid + "Use an image instead"
  + "Back to the default"; one close control).
- **Wave colour**: colour SWATCH circles (`var(--color-*)`), not word
  pills; "Off" stays a word chip; custom via the shared ColorPicker.
- Handle halves / Edge / Placement etc. as PillRows. Quick action bar also
  carries **"Swap with bottom bar"** (stacked PillRow, only while the
  actions are a bottom-edge bar): "swapped" fixes the key row where the
  tabs were and folds the page tabs behind the handle. Default stays
  "normal" — it's a toggle, never the default arrangement. Alter bar Placement
  is top/bottom/left/right; the bar's fold control lives ONLY on its own
  edge — the QA split handle carries the alters half solely when both
  share an edge; otherwise that edge gets an AltersEdgeTab (click chevron;
  no swipe on tabs). Float/bubble QA has NO edge setting (drag places it).

## COLORS & BACKGROUND (ColorsSection)

Eight role swatches in a grid (no explainer line under them); BACKGROUND
block (flat/gradient/image + page song — the song picker shows no filler
line when empty).

## PRESETS (PresetsSection)

Two tabs (Style / Layout & size) + search; ONE merged list — each
built-in theme appears as TWO rows ("name · light" / "name · dark",
applying sets the mode; there is no separate mode toggle in v2) plus user
presets and widget styles with source·parts subtitles; the list
is capped (`max-h-72`) and scrolls. Save form below: name + part
checkboxes + link-to-alter.

- **Undo history** (`lib/lookHistory.js`): every apply (preset or widget
  style) snapshots the current look FIRST (colors, mode, fonts, size
  tokens, both boards' look+layout — a plain preset payload, ≤10 kept).
  Applying shows a toast with Undo; the "Undo — recent looks" row lists
  the stack; restoring is itself snapshotted.
- **Per-preset alter links**:each user-preset row has a Link2 button →
  inline panel with linked-alter chips (x = unlink) + a SearchableSelect
  to add. Same ThemeContext store the classic UI uses (auto-applies when
  that alter fronts).
- **Fonts anywhere**: every font SearchableSelect (body, header, per-bar,
  per-widget) pairs with `FontUploadButton` — the shared upload pipeline
  (CustomFont + refreshCustomFontFaces); a new font appears in ALL pickers
  and is selected where it was uploaded.

## Widget options extras (WidgetConfigSheet)

- UI & text order: **Content size FIRST**, then Display mode (only when
  the widget actually renders modes — registry supportsModes must match
  reality), Alignment, section:"ui" ranges, type & shape.
- Pinned bar Widget config also carries **Per-level styling**
  (config.levelStyles { levelId: { shape, scale, ringW } }) — a front
  level's own chip look, over the general fronting emphasis.
- Text inputs in v2 surfaces use **MentionTextarea** (@ + ~commands) —
  status widget, quick note, plan notes (commands off), notebook
  (commands off). Status saves run applyLogCommands({chips:false}).
- "Widget config" (WHAT the widget shows; `configFields`, incl. the
  pinned-alters panel) / "UI & text" (mode, Alignment, content size, fonts,
  shape; `section:"ui"` ranges) / "Colors & background" (live-probed
  swatches + gradient reading the EFFECTIVE look) / "Presets" / Icon.
