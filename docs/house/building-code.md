# The building code (new house, step 0.1)

Every room, kit block and board is built to this page. Where a mockup disagrees, this page wins. Change a rule here first, with the Critic's and Lantern's review.

Sizes are given in `rem`, with the pixel value at 100% text size in brackets. Text size scales the root font size (`html.a11y-text-*`, 50% to 200%), so rem follows it.

---

## 1. Where Save, Done, Cancel and Delete live

| Verb | What it means | Desktop | Phone | Rank |
|---|---|---|---|---|
| **Save** | Keep a record the person typed or changed (check-in, plan, task, journal, reminder) | Editor header, far right | Header, far right | Primary. The only primary button on the surface |
| **Cancel** | Leave without keeping. If anything changed, ask once: "Discard changes? Keep editing / Discard" | Just left of Save | Header, far left, in Back's place | Secondary |
| **Done** | End a mode (edit mode, map Move, selection), or close a sheet whose changes already applied | Mode bar or sheet header, far right | Same | Primary inside a mode, otherwise secondary |
| **Delete** | Send this record to the trash | Last item in the header's ⋯ menu, in danger colour, with a trash icon | Same | Never a visible button |
| **✕ Close** | Close a sheet or panel that holds nothing unsaved | Sheet header, far right | Same | Icon button with a label |

**Header order.** Desktop: `Title ………… [⋯] [Cancel] [Save]`. Phone full-page form: `[Cancel]  Title  [⋯] [Save]`. Save sits at the top on purpose: on a phone the keyboard covers the bottom of every form. A form taller than one screen **also** ends with a full-width Save at its foot. It's the same action with the same label, so a person using one hand who has scrolled to the end doesn't have to stretch to the top corner.

**Rules**

1. **"Update" is retired**, along with "Apply", "OK", "Submit", "Confirm" and "Save changes". They all become **Save**.
2. When a commit is not a save, it keeps its own verb but stays in Save's place: "Set front", "Unlock", "Start", "Add friend".
3. **Delete flow:** ⋯ → "Delete {thing}" → a confirm sheet that names the thing and says "It stays in the trash for {N} days" → trash → a toast with Undo. The toast stays at least 10 seconds and doesn't time out while it has focus or a finger on it. Its text says where to find the thing later ("Moved to trash. Undo · Find it in Recent changes"), because a person may not remember deleting it. A thing that skips the trash (`TRASH_INSTANT`) says so in the confirm. The hybrid "… Delete" and "… Empty trash" buttons on boards 24, 33, 42, 45 and 48 are retired.
4. **Records save, settings apply.** Records use Save. Settings, looks and widget options apply live, show "Saved" in the status bar, and end each inspector tab with Reset (`docs/inspector-design-guide.md`). Text inside a live setting writes on blur or after a short pause, never on every keystroke.
5. **Every "ask once" confirm** puts focus on the safe choice ("Keep editing", "Keep it"). The destructive choice is never the filled primary button and never sits where Save just was, so a repeated tap can't discard.
6. **A failed save** keeps the form open with the typing intact. It puts plain words in the status bar (desktop) or the attention line (phone), and they stay until the save succeeds or a copy is kept (RULE ZERO).
7. **No verb means two things.** A plan's outcome is never labelled "Cancel": the outcome buttons say "Done / Partly / Skipped / Called off", grouped under "How did it go?" in the row or the Info panel, never in a header. The stored `cancelled` status does not change.

---

## 2. The three tab looks

They look different because they do different jobs. A person must be able to tell "go somewhere" from "this page's sections" from "narrow this list" without reading.

| | **Open-page tabs** | **Page tabs** | **Filter chips** |
|---|---|---|---|
| Job | Pages I have open (bookmarks) | Sections of *this* page | Narrow the list beneath |
| Where | Desktop and compact only, one row under the menu bar | One row directly under the page header | The toolbar above the list they filter |
| Look | File tabs joined to the page below them. The current tab is raised and the same colour as the page. Each tab has its own ✕ | Plain labels on a flat strip. The current one has a 3 px accent underline and bold text. No box per tab | Rounded chips. When on: filled, with a ✓. When off: outlined |
| How many | Any number. Extras go into a "more" list. Only the current and previous page stay alive | 5 at most, then "More" | 6 at most on a phone, then a "Filter" button that opens a sheet. **Never wraps to a second row** |
| Choice | One | One (`role="tablist"`, `?tab=` deep links) | Several, or "All" (`aria-pressed`) |
| Phone | None. Use the "Open" list in ⋯ and "Last time…" on Home | One row, scrolls sideways. The current tab is scrolled into view, and a cut edge shows there is more | One row, scrolls sideways, with the same edge cue. A filter that is on but scrolled out of sight still shows in a count ("2 filters on") |

**Not tabs:** a **segmented control** (2–4 exclusive options that change the view or scale: Day / Week / Month, Grid / List) is joined buttons with the chosen one filled. **Kind labels** in rows (board 42's Check-in, Status) are plain text with no border: nothing unpressable may look pressable.

---

## 3. Tick and radio

| Control | When | Look | Semantics |
|---|---|---|---|
| **Checkbox** | Several may be on; part of a form kept by Save; marking a task done | 1.25 rem (20) square with a 2 px border. On: filled with the accent and a ✓ in the on-accent colour. Mixed: a dash. **Never an "x"** | `role="checkbox"`, `aria-checked` (including `mixed`). The label is part of the hit area |
| **Radio** | One of five or more, or options with descriptions | 1.25 rem circle. On: a dot of 0.625 rem (10) | `role="radiogroup"` with a visible group label |
| **Segmented** | One of two to four short options | See section 2 | Radio semantics |
| **Switch** | A setting that takes effect immediately | Track with a thumb, and an "On"/"Off" word beside it | `role="switch"` |

- Single choices drawn as checkboxes (board 51, Quick jump "Jump to") become radios.
- A done task gets a ✓, struck-through text *and* the word "done" for screen readers. Strike-through alone is not enough.
- The whole row is the hit area, never just the 20 px box.

---

## 4. Three sizes and panel widths

**Effective width = viewport width ÷ text scale.** A 1280 px window at 200% text is laid out as 640, so large text reflows instead of squeezing. One hook (`useHouseSize()`, built in step 2.1) decides the size class. No page reads the window width itself.

| Size | Effective width | What shows |
|---|---|---|
| **Phone** | under 640, or any window under 480 tall with a touch pointer (a phone turned sideways) | One room at a time, four zones (section 5) |
| **Compact studio** | 640 to 1023 | Tool rail, left panel, canvas. Info opens as a sheet from the right. One side panel at a time |
| **Full studio** | 1024 and up | Everything |

**Panel widths** (rem, so they grow with text; px at 100% in brackets):

| Panel | Compact | Full | Default |
|---|---|---|---|
| Tool rail | 3.5 (56), fixed (was 3; §15) | 3.5 (56), fixed | — |
| Left panel (trees, lists) | 13 to 18 (208–288) | 13 to 22 (208–352) | 16 (256) |
| Canvas | at least 20 (320) | at least 30 (480) | the rest |
| Right dock (Info, Layers, History, Help) | sheet, 20 to 26 (320–416) | 18 to 28 (288–448) | 20 (320) |
| Bottom dock (timeline) | 8 rem (128) to half the page height | same | 12.5 (200) |
| Reading column (journal, report, bio) | max 42 (672) | max 42 (672) | — |

**Collapse order** when the canvas would drop below its minimum: the right dock becomes a sheet first, then the left panel folds to a "Browse" button. The canvas is never squeezed. The person can resize panels only within these limits. Resizing is kept per device (in edit mode's field, step 4.1).

---

## 5. The four phone zones

| Zone | Height (100% text) | Holds | Never |
|---|---|---|---|
| **1. Header** | 3.5 rem (56) minimum; grows when the title wraps | Back (or Cancel in a form), the page's full name in the person's words with its area beneath, Search, ⋯ | A cut-off title, more than two icons, a subtitle that truncates |
| **2. Page tabs** | 2.75 rem (44) | This page's sections, one row | A second strip; open-page tabs |
| **3. Canvas** | The rest | The page. It scrolls | Anything floating over it, except a sheet the person opened |
| *Attention line* | 2.75 rem (44) minimum, only when needed. It grows to two lines rather than cut off a message | One item, with "+N" for the rest | Covering content: the canvas gets shorter instead. On Support, Safety plan, Emergency info, grounding and Unblend, it shows only data-safety and safety notices; a reminder waits |
| **4. Bottom bar** | 3.5 rem (56) or the person's `--bottom-nav-height`, whichever is larger, plus the safe-area inset | Five places: Home, the person's three, Support. Icon and label | Wrapping labels. Labels are capped at 12 characters; the place editor asks for a short label when a name is longer |

- **Support is one tap from every unlocked screen**: forms, sheets, edit mode and setup included. The bar is never replaced by page buttons. Board 12's "Edit page / Profile style / Write note" bar goes into ⋯ and the canvas foot.
- **The bottom bar stays on full-page forms** (check-in, plan editor, reminder editor, Set front), so Support is one tap away mid-form. Two rules make that safe:
  - **While the on-screen keyboard is open, the bar hides.** The keyboard would cover it anyway, and if it were pushed up above the keyboard it would eat 56 px of a space that is already tiny. Closing the keyboard (Back, or tapping outside a field) brings it back.
  - **Leaving a form from the bottom bar never asks and never loses typing.** The form is kept as a draft, and the page left behind shows "You were writing… Continue" on return. There is no "Discard changes?" dialog between a person and Support. The ask-once confirm is only for Cancel.
- **Sheets stop at the top of the bottom bar**, so Support stays live. Sheets come in three heights: peek 7.5 rem (120), half, and full. Only one sheet is open at a time.
- **Two screens have no app chrome:** the lock screen, and the safety sheet (the emergency card). The lock screen offers "Show my emergency info" and "Need support right now?". The card has a labelled way back that a helper won't press by accident.
- **Frame chrome stops growing at 1.3×.** Header, tab and bar labels follow the text size up to 1.3× and then stay put. Page titles, every button inside a page, and all content grow to 200%.
- **Landmarks:** the header is `header`, the bottom bar `nav`, the canvas `main`, sheets are `dialog`, and the attention line is a polite live region.

---

## 6. The edit-mode bar

One bar for every mode: layout editing, map Move/Place, and selection.

**Desktop:** the status bar becomes the mode bar. From left to right:

`Editing: {page}` · **Panels | Widgets** (page-tab look) · Undo · Redo · Add · Reset · Cancel · **Done**

**Phone:** the header becomes `[Cancel]  Editing: {page}  [Done]`. A 2.75 rem tool strip sits above the bottom bar with Panels | Widgets, Undo, Redo, Add, and ⋯ (Reset). The bottom bar stays.

**Rules**

- Nothing saves per drag. Done writes once, through the one writer. Cancel asks once if anything changed. Reset asks once, then offers Undo.
- The mode is impossible to miss. The canvas gets a 2 px accent frame, the mode's name shows, and entering is announced. Esc means Cancel, and Ctrl/Cmd+Z and Shift+Z are Undo and Redo.
- Only one mode at a time. The old Edit page bar and "Save / Exit" are retired.
- An edit left unfinished when the app closed comes back as a question, never as the mode itself: "A layout edit was left open. Keep editing / Save what I had / Discard". Focus starts on Keep editing.

---

## 7. Type, spacing and height scales

### Type: six steps, two roles

| Token | rem | px | Line height | Use | Role |
|---|---|---|---|---|---|
| `text-xs` | 0.75 | 12 | 1.4 | Captions, status bar, time stamps. **This is the floor** | body |
| `text-sm` | 0.875 | 14 | 1.4 | Labels, buttons, tabs, panel header strips, row subtitles | label |
| `text-md` | 1 | 16 | 1.5 | Body text, row titles, **every field** (16 px stops iOS zooming) | body |
| `text-lg` | 1.125 | 18 | 1.35 | Section titles, the phone header title | label |
| `text-xl` | 1.375 | 22 | 1.3 | Page titles on the desktop canvas | label |
| `text-2xl` | 1.75 | 28 | 1.2 | The Now headline, stat numbers | body |

- **Two font roles only:** *label* (the heading font) and *body*. There is no third "sub-font" (Penumbra's note on board 33).
- **The pixel font** (Pixelify Sans) is used only in the label role and never below `text-sm`. Its "fi" ligature draws a wrong letter on boards 12, 16, 22, 24, 38 and 45 ("profle", "Aelds", "Ane"). That's a word a dyslexic or dissociated reader can't decode, so ligatures are turned off **once, where the font is declared, never per page**:
  - the `@font-face` sets `font-feature-settings: "liga" 0, "clig" 0, "dlig" 0`;
  - the label token sets `font-variant-ligatures: none`.
  Anywhere those can't be honoured (canvas or SVG text, exported images and PDFs, a mod's own CSS), the body font is used instead. It is never used for values (times, dates, numbers, codes), because its 3, 5 and 8 blur together (boards 04, 38, 42).
- **One switch** sets every label to the body font. Setup's words step and Accessibility both offer it, beside the font list, which includes OpenDyslexic.
- **Anything about saving or safety is `text-sm` or larger.** That includes a failed save, "Not saved yet", and the example-system label, even in the status bar. `text-xs` is for times and captions only.
- **Text spacing survives.** Every surface still works with WCAG 1.4.12 spacing (line height 1.5, letter spacing 0.12 em, word spacing 0.16 em) and with OpenDyslexic, which is wider. Labels wrap; they never clip. Fixed heights hold controls, never text.
- **Sentence case** everywhere. No tiny uppercase labels (board 41's "CALL ME").
- Inside widgets, use `em` (`docs/widget-contract.md`).

### Spacing: a 4 px base

| Token | rem | px | Typical use |
|---|---|---|---|
| `space-1` | 0.25 | 4 | Icon to label |
| `space-2` | 0.5 | 8 | Between chips and buttons in a group |
| `space-3` | 0.75 | 12 | Panel padding; the gap between chips whose look is smaller than their hit area |
| `space-4` | 1 | 16 | Phone side gutter, between sections |
| `space-5` | 1.5 | 24 | Between panels' content blocks |
| `space-6` | 2 | 32 | Empty-state padding |
| `space-7` | 3 | 48 | Page-level breathing room on desktop |

Borders and bevels are their own tokens (step 1.1), never spacing.

### Heights

| Token | Value | px | Use |
|---|---|---|---|
| `h-control` | `max(44px, 2.75rem)` | 44 | Buttons, fields, chips, tabs, icon buttons, frame bars, compact rows |
| `h-row` | `max(48px, 3rem)` | 48 | Single-line list rows |
| `h-row-2` | `max(56px, 3.5rem)` | 56 | Two-line rows, phone header, bottom bar |
| `h-row-3` | `max(72px, 4.5rem)` | 72 | Avatar rows, tile minimum |

- `max(px, rem)` means a smaller text setting never shrinks a target below 44 px, while a larger one grows it.
- **The desktop status bar** is the one bar that may be shorter: `max(32px, 2rem)` at rest, only in the full studio with a fine pointer (mouse). With 44 px it would take 5% of a 900 px window to show one line of text. Its pieces are still 44 px wide hit areas, and its text is never below `text-xs`. It grows to `h-control` (44) whenever it holds controls: as the mode bar, when a save failed (it shows Try again), and on any touch screen or compact studio. It follows text size up to the 1.3× frame cap. A message too long for one line opens in full on click and is never cut off without a way to read it.
- A control may *look* smaller than its hit area only in three cases: tick boxes (1.25 rem), chips (2 rem / 32) and swatches. Their hit area stays 44 px, and neighbouring hit areas never overlap.
- The old heights (22, 26, 28, 30, 32, 36, 40) all map onto these four.

---

## 8. One icon set: Lucide

**Confirmed.** `lucide-react` is already imported by 521 files. It tree-shakes per icon, is drawn as SVG that scales with `em`, sits on one 24-unit grid, and has every glyph the rooms need.

**The "Icons: Pixel / Classic" choice on board 07 is retired.** No pixel icon set exists in the code. Adding one would mean drawing every icon twice, across about 500 files. Bitmap pixel icons also blur at the in-between text sizes (112.5%, 137.5%), so they could not follow the person's text size. That is the same failure as the fixed-pixel text. The pixel look keeps the same Lucide glyphs and changes only tokens: `--icon-stroke: 2`, square line caps and mitred joins. "My icon pack" (`ui_v2.icons`) stays.

| Rule | |
|---|---|
| One resolver | Every icon is drawn through one `<HouseIcon name>` (step 1.1), so the person's own icons override by page or key |
| Sizes | 1 em inline in text; 1.25 rem (20) in controls; 1.5 rem (24) in bars and the rail |
| Icon-only buttons | Only in the four zones, the tool rail and Layers rows. Always with an `aria-label` that names the page or thing ("More for Planner", not "More"), and a tooltip. Touch screens have no hover, so on a phone a long press shows the name too |
| Never | Emoji as UI icons, or ASCII stand-ins (`v`, `-`, `o`, `>`, `->`, `x`, `=`) as icons. Boards 01, 03, 04, 16, 32 and 47 use these |

---

## 9. The guard

From step 1.1, `npm run check:ui` fails on: px `font-size`; a button, chip, tick or tab class outside the kit; a native date, time, colour or `<select>` control outside the kit (31 date/time inputs today); an `"x"` used as a tick; "Update", "Apply" or "Submit" on a button; a new `!important`; and the pixel font named anywhere except its one token (so ligatures can't come back page by page).

---

## 10. Tokens (step 1.1): choices this page didn't make before

The tokens live in `src/house/tokens/` (`tokens.css`, `look-smooth.css`, `look-pixel.css`, with `scales.js` holding the same numbers for code). Every rule is scoped to `[data-house]`, set by `HouseRoot`, so the old house never sees them. Values come from the person's paint through the paint translator; nothing writes a setting. `scripts/test-house-tokens.mjs` checks all of this.

- **Colour roles.** page, panel, raised, sunken, text, muted, accent, accent text, on accent, danger, danger text, on danger, focus, border, divider, bevel light/dark, outline. Page, panel and raised are the person's own colours, never changed. **Sunken** (fields) is 60% of the way from panel to page; when page and panel are the same colour, a step toward black.
- **Readable shades, not the person's settings.** When a role built from the person's colours would miss its minimum (4.5:1 text; 3:1 accent, border, focus), the house draws the nearest readable shade (same hue first, then toward black or white) and the paint translator's readability offer is still what changes their setting. The sample page says which roles moved.
- **Two accent roles.** *Accent* is for parts (3:1 on page and panel). *Accent text* is the accent as words or links (4.5:1). Same split for danger.
- **Text on a filled colour** is white whenever white reaches 4.5:1, otherwise whichever of white or black reads better; if neither does, the fill is deepened.
- **Field borders** are 45% from panel toward the text colour, raised to 3:1 against page, panel and sunken. A *divider* (decorative) is 18% and has no minimum.
- **The focus ring** is the accent when it reaches 3:1 on page and panel, otherwise the text colour. 2 px, offset 2 px.
- **High contrast** replaces the paint with fixed black/white roles, as the old house does.
- **Shape per look.** Smooth: corners 12 px (8 small), 1 px borders, no bevel, a soft shadow, round icon caps. Pixel: square corners, 2 px outline, 2 px bevel (light top-left, dark bottom-right), square caps and mitred joins. The person's own corners and pixel bevel win. Corners and borders are px (they are not text).
- **Fonts.** Label = the person's heading font if they chose one; otherwise, when their body font is an easy-read one (OpenDyslexic, Lexend) or easy-read mode is on, the body font (R2: no pixel letters; changed 2026-11-25, §15: Atkinson Hyperlegible now pairs with the pixel labels, as on every mockup board); otherwise the pixel font in the pixel look (unless "plain type"), the body font in the smooth look. **The smooth look's labels use the body font**, not DM Serif Display: labels are buttons and tabs, and a display serif doesn't read there. Values (times, dates, numbers) are always the body font with tabular figures. The unchosen body font is Inter.
- **Ligatures** are off for the whole house tree, on the `[data-house]` root (`font-variant-ligatures: none` plus `font-feature-settings`), which covers the label token. The pixel font's `@font-face` comes from `@fontsource` and can't carry the descriptor without forking it, so the root rule is the "once" place. The pixel font is named only in `PIXEL_LABEL_FONT` (`src/house/tokens/roles.js`), and an `.house-label.house-text-xs` falls back to the body font.
- **Old-house heading rules.** The old pixel look styles every `h1`–`h3` at high specificity. Inside the house, headings take the house's fonts through a longer attribute chain, never `!important`.
- **The 1.3× frame cap** is `min(rem, 1.3 × the 100% px size)`: `--house-frame-text-xs/sm/lg` and `--house-frame-icon`. Below 100% the frame shrinks with the text like everything else.
- **Motion.** fast 120 ms, base 200 ms, slow 320 ms; ease-out `cubic-bezier(0.2, 0, 0, 1)`, ease-in-out `cubic-bezier(0.4, 0, 0.2, 1)`. All three become 0 under `prefers-reduced-motion` and the app's own Reduce motion (`html.a11y-reduce-motion`). Code reads `motionMs()` / `prefersReducedMotion()` from `scales.js`.
- **Icons.** `<HouseIcon icon={…} page|iconKey size>` (`src/house/tokens/HouseIcon.jsx`) takes the Lucide component rather than a string name, so each icon tree-shakes; the person's own icon (by page or key) replaces it.
- **The guard** (§9) is `scripts/check-house-guard.mjs`, run by `npm run check:ui` (and `npm run check:house` alone). It reads whole files under `src/house/` only. "The kit" is `src/house/kit/`: raw buttons, ticks, tabs, native date/time and `<select>` are allowed only there; `type="color"` and `!important` nowhere. A line marked `house-ok: <why>` is skipped.

---

## 11. Controls and pickers (step 1.2): choices this page didn't make before

The kit lives in `src/house/kit/` (import from `@/house/kit`); its story sheet is `/house/kit/controls` (unlinked, lazy) and its proof grid is `scripts/house-grid.mjs`. `scripts/test-house-kit.mjs` checks the logic below.

- **Values keep their stored shape.** A date is `"YYYY-MM-DD"` (read at local noon), a time `"HH:mm"` 24-hour, a duration whole minutes, a number a number. The kit never changes what a record stores.
- **Dates, times and durations are typed first, picked second.** The field reads "tomorrow", "fri", "23 Nov", "23/11" (in the locale's order), "9", "930", "9:30 pm", "noon", "90", "1:30", "1h 30m". It shows plain words ("Today, Tue 24 Nov", "9:30 pm" on a 12-hour clock, "1 h 30 min") and the full spoken form under it ("Tuesday 24 November 2026", "1 hour 30 minutes"). The calendar and the time list are kit-drawn pop-ups, never the browser's.
- **Unreadable typing is kept.** When typed text can't be read, the text stays in the box with an error under it ("Couldn't read that as a date. Try “23 Nov”…"), and the value doesn't change until it reads cleanly.
- **Hover, pressed and selected change shape.** Hover draws a 3 px inner ring in the control's own text colour (an underline on a quiet button). Pressed moves 1 px down and sinks. Selected adds a ✓ or bold text with the fill. Disabled is dashed, keeps its words readable, stays focusable (`aria-disabled`) and shows its reason beside it.
- **Focus inside a filled or sunken part** (a segment, a menu item, a calendar day, the − / + inside a field) is an inset ring in that part's own text colour, because the focus role is only promised against page and panel (§10). Everywhere else it is the house's ring.
- **Pop-ups sit on the panel colour**, not raised, so every text role is readable in them. They are portaled into a `[data-house]` layer so no scrolling panel clips them, and they never get wider than the screen less 1 rem.
- **Calendar columns** are `minmax(44px, 1fr)`: they never go below a target, and don't grow with text size (seven 88 px columns won't fit a phone at 200%).
- **Shadow tokens are never `none`.** They are combined in lists, and one `none` voids the whole shadow; "no shadow" is `0 0 0 0 transparent`.
- **Pickers reuse today's shared components** (AlterSearchSelect, SearchableSelect, ColorPicker, IconPicker, AssetPickerModal, and MentionTextarea for authored text). The field around them is the house's; their own pop-ups keep the old look until the kit's sheets arrive (step 1.3). The two selects take an optional `triggerId` / `triggerLabelledBy` so the field's label names them.
- **The proof grid** forces hover and focus with the browser's own element-state forcing on cells marked `data-force`, so the picture shows the real rule. It switches the look through Display options on the example system, as a person would.

## 12. Panels, content and sheets (step 1.3): choices this page didn't make before

The story sheet is `/house/kit/panels` (unlinked, lazy; the three kit sheets link to each other). `src/house/kit/lists.js` holds the pure logic and `scripts/test-house-kit.mjs` checks it. `Chart` is imported from `@/house/kit/Charts` on its own, so recharts never rides along with the kit's index.

- **Long lists page; they don't window.** Up to 200 rows are drawn whole. Past that, 100 a page with Previous / Next and "301–400 of 1,000" words, the pager sticky at the foot. Rows keep their natural height, so a label wraps at 200% instead of being clipped to a fixed row height, and Find-in-page and screen readers see every row on the page. Arrow keys past either end turn the page.
- **Trees are guarded.** A record that is its own parent, sits in a loop or has a missing parent is drawn as a root, never buried and never walked twice; a duplicate id is drawn once. The indent stops at 8 levels and at 15% of the list's width, so deep rows keep room for whole words; `aria-level` keeps the real level. The fold target is the row's full height and a whole target (2.75 rem) wide, giving way to no less than 44 px in a narrow list at large text. Rows hold no buttons: a tree or list row is one target, and its actions live in the Info panel or the ⋯ menu.
- **Layers reorder without dragging.** Each row has Move up / Move down buttons and Alt+Arrow, Alt+Home, Alt+End; focus stays on the moved row and a polite live region says "Notes moved to 2 of 5". Visibility is an eye with ONE signal: a name that never changes ("Show Forest") and `aria-pressed` for the state, so it reads "Show Forest, toggle button, pressed" while the layer shows. Never a changing verb ("Hide Forest") together with `aria-pressed`, which says two things at once (kit gate). A hidden layer also says "Hidden" in words. On a phone at 200% the move buttons drop under the name.
- **The inspector** is the inspector guide in the house's look: Undo · Redo · [primary] · ⋯ · Close in the header, the standard tab order, and each tab ending in "Reset {tab}". Changing tab scrolls the body to the top. "Option menus as one list" shows every tab at once under its own heading.
- **Page tabs** are a real tablist: arrows, Home and End move and choose; `aria-controls` is set only when the tab has a panel to point at. Their labels are frame chrome and stop at the 1.3× cap (§10).
- **The Undo toast** lasts at least 10 seconds and its clock stops while a pointer, finger or focus is on it. One at a time: a new toast replaces the old one, which is why every toast says where the thing can still be found. It claims the attention slot with `always`, so gentler banners step aside. `trashWithUndo` runs the delete inside one trash batch and Undo restores that batch, the same path as `src/lib/undoDelete.js`. A failure says the data is safe and where it is. It never covers a sheet (§5): while one is open the toast sits just above the sheet's top edge if it fits there whole, and otherwise it is held (the card hidden, its clock stopped, and its message still said in the live region with "Undo is waiting until you close this sheet", §14) until the sheet closes, so its Undo is never lost and never over the sheet's buttons. It is never taller than 40% of the screen; when narrow (a phone at large text) its icon goes and the detail folds behind "More", leaving the message, Close and Undo.
- **Sheets.** Half is non-modal: the page above stays usable, and a press outside does NOT close it (§14: a tap on the usable page is a tap on the page; `closeOnOutside` opts a sheet in, never one that `holdsTyping`). Full is modal and keeps Tab inside. Every sheet closes on Escape and on Back (one history entry, popped only if it's still on top), moves focus in on open and back to the opener on close, and turns on the edge-safe slider zones for Android's back gesture.
- **Confirm** is asked once, names the thing ("Delete Walk?"), says how long the trash keeps it (or that it skips the trash), starts with focus on "Keep it", and puts the destructive button on the left, away from where the thumb rests. When the two buttons stack (a phone at large text), "Keep it" is the bottom line, where the thumb rests, and Delete is above it (§1 rule 5). It runs once even on a double tap.
- **The safety sheet** has no app chrome. "Need support right now?" is always on screen and goes straight to Support. Leaving takes two taps ("Tap again to leave", resetting after 4 seconds), so a shaking hand can't close it by accident. Escape doesn't close it; the system Back still does, since trapping Back would be worse.
- **Charts always have words.** A legend in words with a swatch plus a marker shape (and a dash pattern for lines), so no series is told apart by colour alone; the picture is named by a one-line summary; "Chart / Table" switches to a real table of the same numbers. Series colours start at the accent and are kept at 3:1 on panel and page. No data shows an empty block, never empty axes.
- **Alter chips** use the person's label setting, the resolved avatar (legacy `local-image://` included) and a ring in the alter's colour moved to a readable shade. A 40-character name wraps. A co-front shows 3 and "+N" names the rest; "+1" is never used, since it is as wide as the chip it would hide.
- **Shared picker pop-ups wear the house look, additively.** AlterSearchSelect, SearchableSelect, ColorPicker, IconPicker and AssetPickerModal read an optional `PopupTheme` (`src/components/shared/popupTheme.js`). With none above them, which is every old-house screen, they add nothing, so the old house is unchanged. Inside the house the kit's pickers provide one, and `sharedPops.css` dresses them under `[data-house][data-shared-pop]` only. This replaces §11's "their own pop-ups keep the old look".
- **Narrow containers stack; words never squeeze (kit gate, 2026-11-24).** At 200% text a phone's canvas is about 326 px, and the kit must read at that width. Rules: words break between words (`overflow-wrap: break-word`, never `anywhere`); a row's words keep a minimum share (a `flex-basis` in rem, which grows with text size) and its fixed parts (icon buttons, meta, the switch track, ⋯) wrap under them instead of squeezing them; value boxes (number, date, time, duration) are at least as wide as their words (`--hk-chars`) and are size containers that stack below a rem threshold (− and + under the value, the calendar or clock button under the date or time); Info puts the picture and ⋯ on one line and the title under them; the one button in an empty or error block goes full width; and paddings give way a little in a narrow container (`min(token, n cqi)`), never under 12 px on a button. A size container has no width of its own, so only blocks that always fill their parent are containers (value fields, panels, lists, Info, empty and error blocks, the toast region), never something that may sit in a row.
- **Pop-ups close when focus leaves them.** Tab off the last stop (or Shift+Tab off the first) of the calendar or time list closes it and puts focus back on its trigger, as Escape does; focus that leaves for nowhere does the same; a menu handles its own Tab.
- **A typed value that can't be read blocks Save.** Number, date, time and duration fields call `onInvalidChange(true)` while their box holds words they couldn't read (the value is still the old one) and `false` once it reads. A host with a Save disables it with a reason ("Fix the date first") while it is true; the story sheet shows this.
- **The proof grid fails the run** (exit 1) on sideways scroll, text under 12 px (frame labels, `[role=tab]` and `[data-house-frame]`, are measured against the 1.3× cap), targets under 44 px (the tree's fold target included), squeezed text (a word of 4+ letters broken across lines, or words in a box under ~2 characters wide), clipped values (a number, date, time or duration box narrower than its words; free-text boxes scroll by design) and serious axe findings. Each width is also saved at 1:1 in `1x/`. `--paints pxlabel` shoots the pixel look with labels really in Pixelify Sans. It also stops when a web font fails to load: a worktree whose `node_modules` is a symlink needs the dev server's `server.fs.allow` to reach it, or every picture shows fallback fonts. `scripts/house-kit-keys.mjs <port>` drives the behaviour checks (Tab out of pop-ups, the toast and sheets, the fold target, the Layers eye, the stacked confirm, the typed-date block).
- **The calendar's week** starts on the person's own setting: the planner's week start (`symphony_act_week_start`, read through `usePlannerPrefs`). There is no second setting; a `weekStart` prop overrides it where a screen needs to.

## 13. The desktop and tablet frame (step 2.1): choices this page didn't make before

`src/house/frame/HouseFrame.jsx`, loaded lazily by `AppLayout` only when "Try the new house" is on for this device (`src/lib/houseSwitch.js`, Settings → Look) and the window is studio-sized (§4's effective width). At phone size the phone frame takes over (§14). `scripts/test-house-frame.mjs` checks the pure parts; `npm run walk -- <port> --house` walks every route inside the frame.

- **The old room is not a house root.** The chrome is several `[data-house]` roots that share one reading of the paint (`HouseScope` with the tokens from one `useHouseTokens()`); the page between them is not inside any, so an old room keeps its own fonts, colours and wallpaper. A rebuilt room brings its own `HouseRoot`.
- **One field for the docks.** `symphony_house_layout_v1` (device-local, in `BACKUP_LS_KEYS`) holds `{ v, pages: { [pageKey]: { left, right, bottom, _ut } } }`, written only through `saveDock` in `src/house/frame/dockPrefs.js`: a fresh read, add-only (a key it doesn't know is kept), sizes clamped to §4 and kept per size class, and a copy of unreadable text kept under `symphony_house_layout_v1_kept` before anything is written. Every write also updates `"*"`, which a page with no entry of its own follows. Profiles fold into one key per kind (`/alter/:id`).
- **Collapse order.** The right dock becomes a sheet from the right first, then the left panel folds; the page never drops under its minimum (30 rem full, 20 rem compact). In the compact studio only one side panel shows at a time. A full studio too narrow to dock the right panel opens it as a sheet with "Dock it".
- **Open-page tabs are bookmarks.** The current tab follows navigation; "+" opens Home; closing the current tab goes to its neighbour; the last tab never closes; at most 20. Tabs are runtime state (`symphony_house_tabs_v1`), NOT backed up: losing them loses nothing. Extra tabs fold into an "N more" menu; the current one always shows.
- **Titles.** The header, the tab, the Info panel and `document.title` ("Journals · Oceans Symphony") all come from `resolvePageTitle` (`src/house/frame/pageTitle.js`): `pageLabel` in the person's words, the record's own name on a profile (through the label setting for an alter), else the kind ("Part", "Group"). Every route in `App.jsx` must resolve to a name; the test fails otherwise.
- **The dock's tabs are words only** (Info · Layers · History · Help) so all four fit the narrowest dock. Help is the page's tutorial (`tourStepsFor`) with "Show me around this page", the Tour and the page-tips switch; a dot on Help replaces the old page-tip banner (R1).
- **The status bar** starts with the pencil (the page's existing Edit page, or a disabled pencil that says why), then Saved / "Not saved yet · Try again", Synced, the next reminder, and on the right "Example {system}" (the person's word) in Preview Mode and the studio size. The reminder toast sits above it. The History tab names records in the person's words ("Fronting record", "{Alter} note", `src/house/frame/recordLabels.js`), never the raw entity name.
- **Support is on the rail** (changed 2026-11-25, §15: after the QUICK tools; it was the second button, after the signing swatch, which the mockup's rail replaced with a Switch tool), primary rank, on every page. The floating Support bubble is not drawn in the house. It stays live over the OLD dialogs too: it is lifted above their scrim (`.hf-rail-support`), see "Support over old dialogs" in §14.
- **The signing swatch says only what is true** (`src/house/frame/signing.js`). It shows who is in front (or the {system}'s mark when nobody is) and opens Set {front}. Its words speak for the one rule it can: the person's "Entries belong to" setting (`attribution_default` through `attributionPolicy`), which decides who new feelings, symptoms, locations and diary cards are saved for when nobody is picked. It never says entries are "signed by the {system}" and never speaks for journals, statuses or posts, which choose their own author. "Entries belong to" is findable in Search and Settings search ("front tracking", "track front", "attribution", "entries belong"), landing on Manage check-ins → Feelings (`?tab=feelings`). The author picker it will open is Phase 3.
- **Keyboard.** "Skip to the page" is the first stop; then Home, the area menus, Search (also Ctrl/Cmd+K), More, the tabs, the rail, the panels, the page. Dock edges are separators: arrows resize, Home/End go to the limits, Enter puts the default back.
- **Leaving.** "Use the old house" is in the More menu and in Settings. The frame's stylesheets stay loaded until the next reload, so every frame rule is scoped to `[data-house]`, `[data-house-frame]` or `:has([data-house-frame])`.

## 14. The phone frame (step 2.2): choices this page didn't make before

`src/house/phone/HousePhoneFrame.jsx`, loaded lazily by `AppLayout` when "Try the new house" is on and the size class is `phone` (§4: under 640 effective px, or a touch screen under 480 px tall). The bar, the attention line and their rules are kit blocks (`src/house/kit/frame/PhoneBar.jsx`, `AttentionLine.jsx`) over pure rules (`src/house/phone/phonePlaces.js`, `lastTime.js`); `scripts/test-house-phone.mjs` checks them. `npm run walk -- <port> --house --touch --sizes 390x844,360x740,844x390` walks every route in it.

- **The bar's places.** Home and Support are locked at the two ends; the middle three default to the Alters place, the Day (the timeline page until room 3.3; its id stays `day`) and Write (changed 2026-11-25, §15: board 08-Phone's bar; Do was the middle place and now opens from the ⋯ menu, and can still be chosen as a place). Only the default exists: no setting is stored until edit mode (Phase 4) can choose them, so there is nothing to lose or migrate. Names come from `pageLabel` in the person's words ("Support" for Support). A label past 12 characters is the name's first word, then cut with "…"; the full name is the place's accessible name and tooltip. If even short labels don't fit one line (a narrow phone at large text, a wide font), the whole bar shows icons only and goes back to labels when they fit. The current place has a 3 px bar on top, bold words and the accent; the Support place always has an accent ring. While Do's sheet is open, Do alone wears the mark (the page keeps `aria-current`).
- **Do is a sheet, not a page.** Write, Check in, Set {front}, Status or note, Plan or to-do, the chat and "Not OK?" first, then the person's own quick actions (`QuickActionsMenu docked`, run through `useRunQuickAction`, the same runner as the old house's menu). No new capture logic.
- **Header.** Everything (on a bar place or Settings) or Back elsewhere; the page's full name with its area under it; "Example {system}" in words (the person's word) while Preview Mode is on (a bordered label at `text-sm`, never only a dot); Search; ⋯. The ⋯ menu holds Everything, Info, Layers, History, Help ("new for this page" when the page has unseen help), Edit {page} (or why not), Display options, Show me around, Take the tour, Settings, Switch {system}, the grocery list, Leave the example {system} and Use the old house. When the header is narrow for its text (a container query at 20 em), the name moves to its own row under the buttons instead of breaking mid-word.
- **Everything** is a full sheet: "Open recently" (up to 5) and then every page by area (`navAreaGroups`). The phone has no open-page tabs; the recent list is runtime state (`symphony_house_recent_v1`, not backed up, holds only paths). It holds PLACES: a visit is stored as its pathname plus only the parameters that name a place (`tab`, `folder`…); one-shot parameters (`action`, `compose`, `import`, `highlight`, `section`, `onboarding`, `act`; `ONE_SHOT_PARAMS` in `lastTime.js`) are dropped and each place appears once, so a row never reopens a blank form. Older lists are read the same way.
- **Last time…** shows on Home after 4 hours away: the page the person was last on, how long ago, and the latest status. "Open {page}" or "Not now"; it goes once they move on.
- **Nothing floats over the page.** The old floating pieces keep all their logic and save paths and hand what they would draw to the attention line as plain data (`useHouseZoneItem`, `src/lib/houseZones.js`, tiny and in the main bundle): the fired reminder (Done, then snooze and its inline actions under "More for…", Dismiss), the running activity (End), the Soundscape and nature sounds (Pause/Play, Stop) and the failed save. With the frame off, zones are inactive and the old house is untouched (pixel-identical at 390 px on five routes). An item carries a `sig`; while it is unchanged its handlers are refreshed in place and the line doesn't re-render, so the line's buttons read their handler when pressed. The floating grounding bubble is not drawn: Support is on the bar.
- **The attention line.** One item, highest priority first (failed save, safety, reminder, timer, sound), "+N" steps to the next. A failed save is sticky: it holds the line, stepping can't pass it, and it stays while the keyboard is open (the rest of the line hides with the bar). On Support, the safety plan, emergency info, grounding and Unblend only data-safety items show. The countdown of a timer or sound is shown, never announced each tick.
- **Sheets stop above the bar, and so does the scrim** (`--house-sheet-bottom`, measured from the bottom zone). A full sheet's scrim used to cover the bar; Support is now one tap away with any sheet open. Sheets close when the route changes.
- **Support over old dialogs (Phase 2 check, decision C).** The old rooms' Radix dialogs, sheets, confirms and drawers (`src/components/ui/{dialog,sheet,alert-dialog,drawer}.jsx`) carry `data-os-overlay` / `data-os-dialog` / `data-os-sheet`. Inside the phone frame (`phone.css`, scoped by `:root:has([data-house-phone])`) their scrim ends at `--house-sheet-bottom`, their content keeps clear of the bar (`--os-sab` is replaced on the dialog by `--house-dialog-sab`, the larger of the safe area and the bottom zone), bottom and side sheets stop above it, and the bottom zone takes taps back from Radix's `pointer-events:none` on `<body>`. In the studio the rail's Support button sits over the scrim. Tapping Support goes to Support; when the frame arrives at any Support route it calls `announceSupportJump()` (`src/lib/houseSwitch.js`) and every old dialog still open closes through its own `onOpenChange(false)`, exactly as its close button would (`useCloseOnSupportJump` in the four primitives), so a dialog that keeps a draft (the journal editor, Quick Check-In) keeps it; nothing new is drafted. Only the frame sends that event, so the old house never closes a dialog because of it, and with the switch off the old house is pixel-identical (the attributes draw nothing). The frame's own Set {front} closes on any route change. `npm run walk -- <port> --house --dialogs` checks it: the journal editor, Quick Check-In and Set {front} each opened, Support tapped at its real hit point, landing on Support with no dialog left and the journal draft back. NOT covered yet (Phase 3 room checklist): old overlays that are not these primitives (hand-made `fixed inset-0` sheets such as the activity editor and plan details) still cover the bar; and while a modal is open, Radix hides the rest of the page from screen readers and keeps Tab inside the dialog, so Support is one TAP away but not yet one keystroke or one swipe away for a screen reader.
- **Sheet details (Lantern's "can wait" list).** First focus skips the grab bar and lands on the first real control. The confirm sheet has no grab bar (`grab={false}`). A press outside a half sheet does not close it (decided no). The safety sheet's "Tap again to leave" is said in a polite live region. A held toast is still announced (the card hides; the region stays live and says the message and that Undo waits). FilterChips on a phone with more than 6 options shows the first 6 (and any that are on) and "Filter (N)", which opens every option as checkboxes in a sheet with "Show all" and Done. Touch screen readers folding tree rows is NOT done yet.
- **Crossing sizes swaps the frame.** Turning a phone to a wide landscape, or changing text size on a narrow window, can move between the phone and studio frames; the page remounts. Forms that hold typing keep it only where they already keep drafts. To revisit in Phase 4.
- **Landmarks:** `header`, `main` (the page, named by its title), `nav` "Places" (the bar), the attention line a polite `status` region, sheets `dialog`. "Skip to the page" is the first stop.

---

## Lantern review (2026-11-24)

Reviewed for 200% text, 390 px phones, trauma-informed design, one-handed use and plain language. The code was already strong here: rem sizes, `max(44px, rem)` targets, effective width = width ÷ text scale, Support on every screen, and one attention line. What I changed:

**The three open points**

1. **Status bar height (§7 Heights).** The desktop status bar may rest at `max(32px, 2rem)`, in the full studio with a mouse only. At 44 px a one-line bar costs 5% of a 900 px window for nothing a mouse needs. It goes to 44 the moment it holds controls (mode bar, Try again after a failed save) and on any touch screen. Saving and safety text in it is at least `text-sm` (§7 Type). The phone's attention line stays 44 and grows to two lines rather than cutting off a message (§5).
2. **Bottom bar on full-page forms (§5).** It stays, because Support one tap away mid-form is the point. Two guards make that safe. The bar hides while the keyboard is open, since it would be covered or would eat the space above the keyboard. And leaving a form by the bar keeps the typing as a draft with "Continue" on return, with no "Discard?" dialog between a person and Support.
3. **The "fi" ligature (§7 Type).** Ligatures are turned off once, in the `@font-face` and the label token, not page by page (the branch patched one file). Where that can't be honoured (canvas, SVG, exports, mods), the body font is used. The guard (§9) fails on the pixel font named outside its token.

**Other changes**

- §1: long phone forms also end with a full-width Save, for one-handed reach.
- §1: confirms focus the safe choice, and Discard never sits where Save was.
- §1: the Undo toast lasts at least 10 seconds, pauses while touched, and says where the thing went.
- §2: sideways-scrolling tab and chip rows show a cut edge, keep the current tab in view, and count filters that are on but scrolled away.
- §5: on crisis pages the attention line shows only safety notices.
- §6: "Keep it" next to "Keep editing" was too alike; it is now "Save what I had", with focus on Keep editing.
- §7: a WCAG 1.4.12 text-spacing rule (and OpenDyslexic's width). Labels wrap, never clip.
- §8: `aria-label`s name the thing, and a long press shows an icon's name on touch screens.

Not changed, for the Critic and Penumbra: the 1.3× frame cap is right for the bars, but someone at 200% will see 1.3× bar labels next to 2× content. If testers find that jarring, the cap can rise to 1.5×.


---

## 15. Where the approved mockups win (2026-11-25, branch house/mockup-home)

The owner asked for the redesign the mockups draw (boards 01-Main, 08-Phone, 09-TimelineOptions, 10-Inspector), not the old pages in a new frame. Where the mockups and this code disagreed, the mockups now win. Each change, and what still holds:

1. **The house's default paint is the mockups'.** With no theme of their own (and on a new device), the house uses the pixel look, the pixel palette (`CUSTOM_PRESETS.pixel`: page #1A1C2B, panel #26293E, title #343853, accent #E8A65D, wave #6D73B0) and Atkinson Hyperlegible under Pixelify labels (`translatePaint(..., { houseDefault: "pixel" })`, `houseLookFromRow`). The person's own theme, look and fonts always win. To keep "never picked" readable, `ThemeContext` no longer writes the untouched default theme name (`cool`) to localStorage; the old house reads the same `cool` either way.
2. **Compact controls on a mouse (§7 Heights).** In the pixel look with a fine pointer, controls are `max(28px, 1.75rem)` and targets `max(32px, 2rem)`, as the boards draw them (`src/house/kit/pixel.css`). Touch keeps the 44 px floor, and 32 px is still above WCAG 2.2's 24 px minimum. Text size still grows them.
3. **The pixel recipe** (`pixel.css`): panels with a 2 px outline and bevel, 22 px title bars on the title colour in the label font, bevelled buttons (the main one in the accent), sunken fields, square menus, file tabs and a status bar on the title colour.
4. **The studio header (board 01).** The header wave behind the bar, the app's name, the area menus (all seven, More included) and "Search everything Ctrl K" as a sunken box. An area's NAME opens its first page (Ctrl/⌘ or middle click: in a new tab); its list opens from the ▾ beside it, on hover, or with ArrowDown; each row shows its key (its first letter when no other row shares it), has a + for a new tab, and "Open in new tab…" turns every row into a new-tab pick (`src/house/kit/frame/AreaMenus.jsx`, mirroring the old pixel header). More also holds the frame's tools (Display options, the panels, Show me around, the Tour, Switch {system}, the privacy cover, Leave the example, Use the old house).
5. **The rail (§4: 3.5 rem, was 3).** QUICK: Check in (primary), {Switch}, Plan or to-do, Start an activity, Write, Status or note, + (the Do sheet), then Support. PAGE: Edit page (disabled with its reason where there's no layout), Display options. The signing swatch's words live on the Switch tool's name.
6. **The status bar** drops the pencil (now the rail's PAGE grid) and ends with "Look: Pixel" (opens Display options) and the version.
7. **The Home room is the house's own** (`src/house/home/HouseHome.jsx`), on "/" in both frames; the old Dashboard stays mounted under it hosting only its dialogs and `?action=` links (`hostsOnly`), and "Boards" (`?page=board`) opens the person's widget board as before. It writes nothing itself: front through SetFrontSheet, status through `saveStatusNote`, plans through `resolvePlan.js`, routines through `toggleTemplateDone` / `addTaskCount`. The guide claims the attention slot (`ATTENTION.SETUP`) and asks about one open plan at a time. The timeline dock's layers, and their order, are a device preference (`symphony_house_home_layers_v1`, in `BACKUP_LS_KEYS`, one writer in `layerPrefs.js`). The studio's side docks stay away from the Home room, which draws its own Info and Layers.
8. **The phone (board 08).** The header is the wave, the logo (on a place) or Back, the page name, and Search and ⋯ as bevelled buttons; Everything and Do moved into ⋯. The bar is Home · {Alters} · Timeline · Write · Support with the pixel icons; the current place sits on the title colour.
