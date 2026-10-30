# UI review guide — the cheap review any session can run

Every PR that adds or changes UI gets a review before it merges. This file
is that review, written down so the session that did the work can run it
itself in a few minutes: a script for what a grep can see, then a short
read-through for what it can't, then one look in the browser. It distils
what the Fable reviews of October 2026 kept catching, so a Fable agent is
only needed when the owner asks for one.

The design rules themselves live in `docs/inspector-design-guide.md`
(option menus), `docs/v2-ui-standards.md` (every v2 surface) and
`docs/widget-contract.md` (widgets). This guide doesn't repeat them; it
says how to check a diff against them.

**Keep it cheap.** Read the diff, not the whole codebase. No subagents. If
a check needs more than opening the file a hunk is in, note it as a
question in the PR rather than spending an hour proving it.

## 1. Run the checks (one minute)

```
npm run check:ui        # this guide's script: native <select>, raw sliders,
                        # plain Textarea, browser dialogs, hardcoded terms;
                        # warns on pill tabs, steppers, hand-made rows, overlays
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

### Structure — pages, not pills

- **Is one screen split into sections by a row of pills?** This is the
  most common miss. A `useState` like `tab` / `section` / `view` switched
  by `rounded-full` buttons. Fix: an option menu uses `TabBar`
  (`SettingRows.jsx`) with the standard tab names; anything else becomes a
  list of `LinkRow`s that each open a page (drill-in). *Caught:* the group
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

## 3. Look at it (two minutes)

Run the app (`npm run dev`, Playwright's Chromium is installed) at 390 px
wide and open what changed. Check: the first screen makes sense without
scrolling; tabs or pages, not pills; every number has a slider and a box;
the sheet leaves the thing it edits visible; nothing overflows sideways;
dark theme still reads. Take one screenshot for the PR.

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
