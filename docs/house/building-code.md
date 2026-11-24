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
| Tool rail | 3 (48), fixed | 3 (48), fixed | — |
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
- **Fonts.** Label = the person's heading font if they chose one; otherwise, when their body font is an easy-read one (OpenDyslexic, Atkinson, Lexend) or easy-read mode is on, the body font (R2: no pixel letters); otherwise the pixel font in the pixel look (unless "plain type"), the body font in the smooth look. **The smooth look's labels use the body font**, not DM Serif Display: labels are buttons and tabs, and a display serif doesn't read there. Values (times, dates, numbers) are always the body font with tabular figures. The unchosen body font is Inter.
- **Ligatures** are off for the whole house tree, on the `[data-house]` root (`font-variant-ligatures: none` plus `font-feature-settings`), which covers the label token. The pixel font's `@font-face` comes from `@fontsource` and can't carry the descriptor without forking it, so the root rule is the "once" place. The pixel font is named only in `PIXEL_LABEL_FONT` (`src/house/tokens/roles.js`), and an `.house-label.house-text-xs` falls back to the body font.
- **Old-house heading rules.** The old pixel look styles every `h1`–`h3` at high specificity. Inside the house, headings take the house's fonts through a longer attribute chain, never `!important`.
- **The 1.3× frame cap** is `min(rem, 1.3 × the 100% px size)`: `--house-frame-text-xs/sm/lg` and `--house-frame-icon`. Below 100% the frame shrinks with the text like everything else.
- **Motion.** fast 120 ms, base 200 ms, slow 320 ms; ease-out `cubic-bezier(0.2, 0, 0, 1)`, ease-in-out `cubic-bezier(0.4, 0, 0.2, 1)`. All three become 0 under `prefers-reduced-motion` and the app's own Reduce motion (`html.a11y-reduce-motion`). Code reads `motionMs()` / `prefersReducedMotion()` from `scales.js`.
- **Icons.** `<HouseIcon icon={…} page|iconKey size>` (`src/house/tokens/HouseIcon.jsx`) takes the Lucide component rather than a string name, so each icon tree-shakes; the person's own icon (by page or key) replaces it.
- **The guard** (§9) is `scripts/check-house-guard.mjs`, run by `npm run check:ui` (and `npm run check:house` alone). It reads whole files under `src/house/` only. "The kit" is `src/house/kit/`: raw buttons, ticks, tabs, native date/time and `<select>` are allowed only there; `type="color"` and `!important` nowhere. A line marked `house-ok: <why>` is skipped.

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
