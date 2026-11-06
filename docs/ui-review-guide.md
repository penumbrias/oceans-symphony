# UI review guide — the cheap review any session can run

Every PR that adds or changes UI gets a review before it merges. This file
is that review, written down so the session that did the work can run it
itself in a few minutes: a script for what a grep can see, then a short
read-through for what it can't, then one look in the browser. It distils
what the Fable reviews of October 2026 kept catching, so a Fable agent is
only needed when the owner asks for one.

The design rules themselves live in `docs/garden.md` (how every feature
is built: record, Info door, board page, display widgets — read it first),
`docs/inspector-design-guide.md`
(option menus), `docs/v2-ui-standards.md` (every v2 surface) and
`docs/widget-contract.md` (widgets). This guide doesn't repeat them; it
says how to check a diff against them.

The open UI critique (`docs/ui-critique-2026-11.md`) is the list of
known app-wide problems and their agreed fixes; when a diff touches one,
follow its fix and update its status there.

**Keep it cheap.** Read the diff, not the whole codebase. No subagents. If
a check needs more than opening the file a hunk is in, note it as a
question in the PR rather than spending an hour proving it.

## 1. Run the checks (one minute)

```
npm run check:ui        # this guide's script: native <select>, raw sliders,
                        # plain Textarea, browser dialogs, hardcoded terms,
                        # text under 12 px, hand-typed text sizes;
                        # warns on pill tabs, hand-made tab strips, steppers,
                        # hand-made rows, overlays, grey and red classes
npm run check:widgets   # if a widget file changed
npm run check:tour      # if a tour step or data-tour anchor changed
npm run lint
```

`check:ui` only looks at lines the branch adds, so every FAIL is yours. Fix
it, or mark the line `// ui-ok: <why>` when it is genuinely right (a
native `<select>` inside a third-party form, a word in a code example). Every
`warn` is a place to look at in step 2, not an error.

## 2. Read the diff (five minutes)

Go through `git diff origin/main...HEAD -- src` once with these questions.
Each has the usual way it goes wrong and the fix past reviews asked for.

### The garden (`docs/garden.md`)

- **Does the data live in a record with one write path?** A widget that
  stores content in its own settings, or a screen that writes the entity
  directly, is a fork. Route it through the `src/lib/` writer.
- **Is the page a board?** A new page that shows things uses
  `PageBoardCanvas` / `ProfileBoardCanvas` with the standard header
  (title · Info · Edit page), not a hand-built list.
- **Is each view a widget offered everywhere?** No private registries; a
  widget about one record has a Which… picker, one about per-alter records
  has `SCOPE_FIELD`.
- **Is there one editor per record?** Editing opens the record's Info
  sheet or item sheet — not a form swapped into a card.

### Structure — pages, not pills

- **Is one screen split into sections by a row of pills?** This is the
  most common miss. A `useState` like `tab` / `section` / `view` switched
  by `rounded-full` buttons. Fix: views of one screen use `PageStrip`
  (`src/components/shared/PageStrip.jsx`, underlined, scrolls, never
  wraps); an option menu uses `TabBar` (`SettingRows.jsx`) with the
  standard tab names; anything else becomes a list of `LinkRow`s that each
  open a page (drill-in). `check:ui` warns on a hand-made `role="tab"`. *Caught:* the group
  picker's "Groups / Subsystems" pills became the inspector `TabBar`.
- **Pills are fine for choosing a value** — `ChoiceRow`, `Segmented`,
  `Chips` pick *what something is* (Small / Medium / Large, weekdays). The
  test: does tapping it change a setting, or change which part of the
  screen you see? Only the first may be pills.
- **Is it a sheet over the thing it edits?** Then it is a non-modal
  `Drawer` with `PeekHandle`, `usePeekHeight(…, 55)` and
  `sheetPortalGuards`, not a centred dialog or a `fixed inset-0` overlay.
  *Caught:* Alter info over the layout editor was a modal; it became the
  inspector sheet. Pop-ups opened from inside a sheet carry a marker (e.g.
  `data-bio-modal`) so the sheet's guards leave them alone.
- **Box inside a box?** Flat rows under `Group` headings, never a card in
  a card.

### Rows — SettingRows only

- Every setting is a `Row` / `SwitchRow` / `ChoiceRow` / `SliderRow` /
  `ColourRow` / `LinkRow` / `StackedRow`. A `flex justify-between` with a
  label and a `<Switch>` is a hand-made row. *Caught:* the page-tutorial
  switch, the alter-count reveal, the profile layout switch and the
  preference level icons were all hand-made and became rows.
- A row that opens something else is a `LinkRow` (with the current value
  on the right), not a button styled to look like one. *Caught:* the
  "Profile style" row on the new-alter sheet.
- Sizes and counts are `SliderRow`s with the number beside them. No − / +
  steppers unless there is no range (`StepRow`).
- Inherited values show their real number or swatch greyed and dashed,
  with a × to go back. Never the words "app default".
- One Reset per tab, through `ResetRow`. *Caught:* Display options had
  three hand-made reset buttons and no per-bar reset.
- Destructive or rare actions sit in the header's ⋯ menu, not at the
  bottom of a tab.
- **Row actions go in the row's ⋯** (`RowMenu`, a 44 px target with words),
  not a pencil and a bin on every row. *Caught:* the Check-In Log's 24 px
  bin, System Meetings' red Delete on every row.
- **A delete that goes to the trash doesn't ask.** It happens and offers
  Undo (`deleteWithUndo` in `src/lib/undoDelete.js`, "In the trash for N
  days"). Keep a confirmation only for what skips the trash. `check:ui`
  warns on `await confirm(`.

### Reuse — one component per job

- Is there already a component that does this? Search before you build:
  `grep -rn "export function <Thing>" src/components src/v2`. *Caught:* a
  second copy of the recurring-task tick logic (both widgets now render one
  `RecurringTaskRow`); hand-made group chips where `GroupChip` exists.
- Alter pickers: `AlterSearchSelect` / `SetFrontModal` / `GroupMembersModal`.
  Nested lists: `SearchableSelect` with depth, `GroupPickerModal`,
  `ActivityPicker`. User-written text: `MentionTextarea` and
  `prepareAuthoredText` (CLAUDE.md, "Every free-text field").
- Alter names in lists go through `useAlterLabel()`.

### Tokens — never hand-type a size or a colour

- **Text sizes come from the scale**: `text-caption` (12 px), `text-body`,
  `text-lead`, `text-title`, `text-display` — or the plain `text-xs…4xl`.
  A bracketed size (`text-[0.8rem]`) fails `check:ui`; inside a widget, em.
- **Colours come from the theme**: `muted`, `muted-foreground`, `border`,
  `primary` and its `-foreground`. A grey class (`text-gray-500`) ignores
  the theme; `check:ui` warns.
- **Red means danger.** `danger` / `destructive` only for a destructive
  action or a real warning; routine things (a check-in button, a feeling
  category) use the primary colour. `check:ui` warns on red classes.

### Colour and contrast

- **Text on a colour is never assumed white.** On the theme colour use
  `text-primary-foreground` / `text-accent-foreground` (or
  `var(--v2-on-accent)` in widgets); on any other colour (feelings, alter
  and group colours, tags) use `onColor(bg)` from `src/lib/contrast.js`.
  `check:ui` fails on `bg-primary … text-white`. *Caught:* every primary
  button read at about 2:1 on the warm, forest and sky themes.

### Attention — one thing at a time

- **A new banner, tip, promo or floating card claims the attention slot**
  (`useAttentionSlot` from `src/lib/attentionSlot.js`, with a priority from
  `ATTENTION`) and renders only while it holds it. Safety notices and fired
  reminders pass `always: true` so the gentler things wait for them.
  *Caught:* a first visit to home stacked six banners above the content.
- Nothing floating covers a text box the person is typing in.

### Words on controls

- **No icon-only button** except the universally known ones (×, back,
  search, ⋯, bell, cog). Everything else shows a word, or lives in a menu
  whose rows have words. `check:ui` warns on `size="icon"` without an
  `aria-label`. *Caught:* about 15 bare icons on the Alters page.
- **Every gesture has a visible way** (a button or a menu row); hints name
  the visible way first.

### Text size

- **No text under 12 px** outside widgets: `text-xs` is the smallest.
  `check:ui` fails on new `text-[0.5–0.74rem]` / `text-[9–11px]`. Inside a
  widget, sizes are em so the widget's Text size scales them.
- **Look at 200 % text** (Settings → Accessibility → Text size, largest):
  content shows above the fold, titles don't split mid-word, and the bars
  grow only a little (chrome carries `a11y-header-row` / `a11y-bottom-nav`
  or `data-os-chrome`) but never below about 15 px, which is still small
  for someone who chose 200 %. Rows of buttons wrap instead of squeezing a
  word into a vertical strip. *Caught:* at 200 % the header read "Oceans Sym",
  the tabs "Syste" / "Journa", and no content fit on the first screen.

### Words

- Every alter / system / front / switch word through `useTerms()` — body
  text, hints, placeholders, tooltips, tour steps, compound words.
- The surface is named after the thing it edits ("Profile style", not
  "Display options" when it only edits a profile).
- A hint is one short line, and keeps any reassurance the old text had
  (*caught:* "Find my data" lost its "never deletes anything" line).
- Changelog entry is one or two short sentences of what the person will
  notice. *Caught:* entries that explained how it works.

### State — the bugs a screenshot doesn't show

These came up in nearly every review and are invisible in a browser
check, so read for them on purpose.

- **Writes per keystroke.** A text field that saves on every change writes
  the record and adds an undo step per letter. Debounce (≈500 ms), flush
  on blur, unmount and `pagehide`. *Caught:* the bio editor.
- **A draft that is lost.** If the sheet keeps a draft, an action right
  after an edit (Add, Close, switching tab) must use the new value, and a
  draft shows until the write lands. *Caught:* new-alter look edits, the
  level-icons row.
- **Reset and "changed" agree.** Whatever decides a tab has its own
  settings (the dot) must use the same comparison as Reset, or Reset
  appears to do nothing. *Caught:* the calm widgets' edges-only change.
- **A cleared field.** Emptying a slider's number box means "inherit",
  never 0. *Caught:* the Trails slider snapped to 0%.
- **Two places, one option.** If a value can be set from the widget's
  options and from another panel, the widget's own option only overrides
  once it has been set. *Caught:* the Coming up widget's count.
- **Bad stored values.** Read look values through their helper and clamp
  them (opacity, sizes); old boards hold anything.
- **Queries that run for nothing.** A query for a section that is turned
  off is skipped (`enabled:`).
- Per-widget look reaches the content: colours through
  `var(--v2-accent)`, never read off `settings`.

### Navigation and platform

- Back from a deep link goes back in history when there is history, else
  to the parent page. A link to a group/section on the same page scrolls
  again on a second tap.
- Headings are headings (`h2`/`h3`), a search box is a search landmark,
  tap targets are at least 44 px.
- Sliders inside a sheet: `useEdgeSafeSliders(open, [tab])`.
- Nothing only reachable by press-and-hold in a menu (desktop).

### Registration

- New `data-tour` anchor → a tour step (`check:tour`). New page → the three
  navigation lists (CLAUDE.md). New entity → backup wiring. New widget →
  the contract script's file list.

## 3. Look at it (five minutes)

Run the app (`npm run dev`, Playwright's Chromium is installed) at 390 px
wide and open what changed. Check: the first screen makes sense without
scrolling; tabs or pages, not pills; every number has a slider and a box;
the sheet leaves the thing it edits visible; nothing overflows sideways;
dark theme still reads. Take one screenshot for the PR.

Then the accessibility pass, on the routes you touched:

```
npm run check:a11y -- /route              # axe (WCAG 2.2 AA), tap targets,
npm run check:a11y -- /route --text xl5   # text under 12 px, sideways scroll
```

- **axe**: no serious or critical violation (the script fails on them).
- **200 % text** (`--text xl5`, and look at a screenshot): nothing cut off,
  no word split down a strip, the content still starts on the first screen.
- **Keyboard**: Tab reaches every new control in order, the focus ring
  shows, Escape closes what you opened.
- **Contrast of any new colour pair**: 4.5:1 for text, 3:1 for icons and
  borders. Text on a colour goes through `onColor()`.
- **One notice per page**: anything new that floats or banners holds the
  attention slot.
- **No icon-only button**, **red only for danger** (above).

## 4. Write it down

Put a short **UI review** section in the PR body: the checks you ran, and
one line per finding with what you did about it. Fix findings in the same
PR. A finding you chose not to fix gets a reason. That section is what
makes the PR mergeable — not a Fable agent, unless the owner asked for one.

```
### UI review (docs/ui-review-guide.md)
- check:ui, check:widgets, lint: clean
- Pills for Groups/Subsystems → TabBar
- Bio wrote per keystroke → debounced, flushed on blur
- Screenshot at 390 px attached
```
