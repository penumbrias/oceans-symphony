# The inspector — design guide for option menus

The widget inspector (v0.287.0) and Display options (v0.288.0) set the
layout and design schema for every menu in the app that edits how
something looks or behaves: widget options, Display options, the home
screen drawer, the add-widget library's detail page, profile style editors,
and whatever comes next. Build new menus to this guide and migrate old ones
when you touch them. `docs/v2-edit-menu-spec.md` (the 2026-08 wireframe)
is superseded by this file.

The parts live in `src/components/shared/SettingRows.jsx`. Reuse them;
never hand-roll a row, a slider, a tab strip or a segmented control.

## Why it looks like this

The design came out of a research pass (2026-10-27, proposal
https://claude.ai/artifact/YJ18SG7FqewAvJXnH5iK57) and the owner's own
calls. The sources that shaped it:

- **Apple HIG — Sheets, Steppers, Sliders.** A sheet that edits something
  on screen is non-modal and opens at a medium detent so the thing stays
  visible. A control that sets a number shows the number.
- **Pages / Keynote Format inspector.** Tabs named for *what you are
  changing* (Text, Shape, Arrange), one tab on screen, fixed strip.
- **Figma UI3 (2024).** Full-word labels over icons-only; hidden controls
  cost a click every time; "speed is a feature".
- **NN/g — progressive disclosure; accordions on mobile.** Two tiers at
  most (tab → row). Accordions on a phone disorient: the section you
  opened pushes everything else off screen and the heading scrolls away.
- **Baymard — sliders.** A slider needs a text field beside it; people
  cannot land on an exact value with a thumb.
- **UX Movement.** Group settings under short headings; a heading is a
  place to stop scanning.

The owner's rules on top: font and size for one kind of text sit
together; body and heading edits never bleed into each other; sizes are
sliders, not steppers ("row size things should be sliders"); the layout
must scale from a phone to a desktop; nothing stored is lost in a redesign.

## Anatomy

```
┌──────────────────────────────────────────┐
│ ═══  (grab bar: drag to resize)          │
│ ⌄  Name of the thing      ↶ ↷  [Move] ⋯ │  header
│ Content │ Text │ Shape │ Colour │ Styles │  fixed tab strip
│──────────────────────────────────────────│
│ GROUP HEADING                            │
│ Row name                 ┌──────────┐   │  rows, one per setting
│ hint, one line           │ control  │ × │
│ Size                            [ 12 px] │
│ ──●───────────────────────────────────   │
│                                          │
│ Reset this tab                           │  last row of every tab
└──────────────────────────────────────────┘
```

1. **Sheet.** A vaul `Drawer` with `modal={false}`, the `PeekHandle` grab
   bar as the resize handle, docked bottom (flip to top from the ⋯ menu,
   `DOCK_KEY`). Opens at about half height (`usePeekHeight(key, 55)`);
   the height is remembered per device. `sheetPortalGuards` so pickers
   that portal out of the drawer still work.
2. **Header.** Close chevron (points the way the sheet leaves) · title ·
   undo/redo · a primary action if the menu has one (widgets: **Move**) ·
   a **⋯ menu** holding everything destructive or rare: dock flip, Reset…,
   Duplicate, Remove. Nothing destructive lives at the bottom of a tab.
3. **Tab strip (`TabBar`).** Fixed under the header; one tab on screen at
   a time; a tab change scrolls the panel to the top. Icon over a
   one-word label. A dot on a tab means the item has its own setting
   there. Four to six tabs. Standard names, in this order, dropping any
   that don't apply:
   - **Content** — the name, how much it shows, its own options
   - **Text** — font · size · style · colour, for Body | Headings
   - **Shape** — size and spacing, edges (corners, outline, lines inside,
     shadow)
   - **Bars** — Display options only; one bar at a time
   - **Colour** — highlight, background, gradient, picture, blur
   - **Styles** — saved looks, presets, apply-to, advanced (CSS)
4. **Panel.** Scrolls on its own; 16px side padding; bottom padding
   clears the safe area and the bottom bar. Rows are flat — no card
   inside a card. `Group` headings (small caps) split a long tab into
   two or three scannable blocks. The panel ends with **Reset** for that
   tab.

## Rows (`SettingRows.jsx`)

Every setting is one row: the name on the left, the control on the
right, the real current value always visible.

| Need | Row | Notes |
|---|---|---|
| on / off | `SwitchRow` | |
| one of a few | `ChoiceRow` | segmented beside the name when ≤3 short options and the name is short; a full-width segmented bar when ≤5 fit; chips beyond that. Never a native `<select>` for a handful of options. |
| several of many | `Chips multiple` inside `StackedRow` | |
| a number | `SliderRow` | always-visible slider, number box beside it (tap to type, commits on blur/Enter, Escape reverts). `labels` for named steps (Default / Comfortable / Large). `touch-action: pan-y` so a vertical swipe scrolls; the track is inset from the screen edges and tagged `data-edge-safe` (see Gestures). |
| a count | `SliderRow` too | − + steppers are gone except where no range exists (`StepRow`). |
| a colour | `ColourRow` | compact swatch → shared `ColorPicker` with opacity. |
| a picker, text, upload | `Row` / `StackedRow` with the control as children | `SearchableSelect` + `FontUploadButton` for fonts; `DebouncedText` for names. |

**Inherited values.** A value the item doesn't own (it comes from the page
style, the app, the theme) shows its *real* number or swatch greyed with a
dashed outline — never the words "app default". Setting it makes it the
item's own; a **×** on the row puts it back to inherited. `own` /
`onClear` on the row; `SliderRow` and `ColourRow` work it out from
`value` being unset.

**Reset.** Each tab ends in a Reset for its keys (`tabResetPatch` for
widgets). The ⋯ menu's "Reset…" asks how much (just the look / everything).

**Words.** Full words, sentence case, the user's terms via `useTerms()`
or `applyTerms`. No icon-only controls except the font-style toggles
(B / i / U / S / Aa). A `hint` is one short line, only when the name
alone could be misread.

## Gestures and platforms

- A slider only moves on a sideways drag (`touch-action: pan-y`).
- Android's back gesture: every `SliderRow` track is inset from the
  screen edge, and sheets call `useEdgeSafeSliders(open, [tab])`
  (`src/lib/gestureExclusion.js`), which hands the on-screen sliders'
  rectangles to the system (`SystemSettings.setGestureExclusion`) so a
  drag that starts on a track is never taken for Back.
- Desktop: everything reachable by click; no hold-only paths in a menu.
- The sheet never covers what it edits by default; the grab bar makes it
  taller when the person wants the list.

## Lists that lead to an inspector (the library pattern)

The add-widget library (`AppDrawer.jsx`) is the list form of the same
grammar: search and a one-line, sideways-scrolling group strip stay fixed
at the top; one flat row per item (icon tile, name, one-line description,
a labelled **Add** on the right — never a bare +); tapping a row opens a
detail page built from the same rows (Display, preview, Style) with one
primary button.

## Checklist for a new or migrated menu

- [ ] Sheet: `Drawer modal={false}`, `PeekHandle`, `usePeekHeight(…, 55)`,
      `sheetPortalGuards`, dock flip in ⋯.
- [ ] Header: chevron · title · undo/redo · [primary] · ⋯ with every
      destructive action.
- [ ] `TabBar` with the standard tab names, in the standard order; dots
      where the item has its own settings.
- [ ] Only `SettingRows` controls; sizes are `SliderRow`s; inherited
      values greyed + dashed with ×.
- [ ] Each tab ends in Reset.
- [ ] No box inside a box; `Group` headings instead.
- [ ] Terms through `useTerms()`; full-word labels.
- [ ] `useEdgeSafeSliders` on the sheet.
- [ ] Nothing stored is renamed or dropped; the same write path as before.
- [ ] Feature tour step updated; changelog entry; verified at 390 px.
- [ ] Reviewed with `docs/ui-review-guide.md` (`npm run check:ui` + the read-through) before merge.
