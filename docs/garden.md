# The garden — how every feature is built

"The garden" is the owner's name for the design the alter profile settled
on in October 2026: **the record is the garden bed, widgets are windows
onto it.** Features had piled up one by one, each with its own page, its
own editor and its own way of saving. The garden replaces that with one
shape that every feature takes.

**All new work follows this file, and old work moves onto it when touched.**
The review in `docs/ui-review-guide.md` checks a diff against it. The
detailed design rules live in `docs/inspector-design-guide.md` (option
menus), `docs/v2-ui-standards.md` (v2 surfaces) and
`docs/widget-contract.md` (widgets); this file says how they fit together.

The reference build is the alter profile (`AlterProfile.jsx`, `AlterInfo`,
`src/v2/garden*Widgets.jsx`). When in doubt, do what it does.

## The seven parts

### 1. The record is the source of truth

Every kind of thing — an alter, a group, a wish, a goal page, a list, an
event — is a record, and each record has **one write path** in `src/lib/`
(`alterEntry.js`, `wishes.js`, `goalTree.js`, `noteLists.js`,
`plannerEvents.js`, …). Screens, widgets and quick actions all call it.
Nothing writes the record any other way, and nothing keeps a second copy
of it in widget settings.

- A widget's settings say **what to show**, never the data itself.
- Info that isn't shown anywhere is still kept. Removing a widget never
  removes data.
- Deletes go to the trash in one batch with everything that belongs to
  the record, layouts included (`trashProfileBoards`).

### 2. One door to the whole record

Everything about a thing can be entered in one place: its **Info** sheet
(alter: `AlterInfo`; goal page: `PageInfoSheet`; contact: its edit
sheet). It is built like the inspector (sheet, `TabBar` or drill-in pages,
`SettingRows`), autosaves through the write path, and lists every field —
including ones no widget shows. Rare and destructive actions (move,
archive, delete) sit in its ⋯ menu.

A collection page (Needs, Notes & lists) has no record of its own, so it
has no Info door; each item in it opens its own one sheet (one wish sheet,
one list sheet, `PlanDetailsSheet` for plans), the same sheet from every
door.

### 3. The page is a board

A page that shows things is a widget board:

- `ProfileBoardCanvas` for a record's own page, `PageBoardCanvas` for an
  app page (`{ owner_type: "page", owner_id }`). Never a new canvas.
- Its standard layout is a seed (`seedBoardFromPages`), one board page per
  tab. The layout row is written on the person's **first** layout edit and
  never before; a machine write (auto-fit) never creates it.
- The header is the same everywhere: **title · Info · Edit page** (the
  grid button). Nothing else crowds it; links to other sections go in the
  nav, not as header buttons.
- Moving widgets uses the one drag model (`useFreeMove`); don't add a
  per-page one.

### 4. Widgets only display (plus quick actions)

A widget shows part of a record and offers the quick actions that belong
there (tick, add, plan, start). Anything it writes goes through the
record's write path, so the change shows everywhere at once.

- Every setting lives on its **Content** tab (`configFields`, `type:
  "component"` for rich ones). No cog menus or dialogs inside the widget.
- It follows `docs/widget-contract.md` (one box, em text, look through CSS
  variables) and is listed in `scripts/check-widget-contract.mjs`.
- It is offered in **every** library — home and every profile. A widget
  that holds per-alter records adds `SCOPE_FIELD` and reads
  `useWidgetScope`. A widget about one record has a "Which…" picker first
  in its options (`linkedWidget` in `src/v2/linkedProfileWidgets.jsx`,
  `needsSetup`), so it works on any board, not only its own page. No
  private registries.
- A full editor is not a widget. If a widget needs a big form, it opens
  the record's sheet.
- Changing what a placed widget shows uses `pastDefaults`; retiring one
  uses `foldWidget`. Ids are never deleted.

### 5. Menus follow the inspector

Every menu that edits how something looks or behaves is built to
`docs/inspector-design-guide.md`: a non-modal sheet, a fixed `TabBar` or
drill-in pages (never pill tabs that split one screen), `SettingRows`
only, sliders with the number beside them, a Reset per tab, destructive
actions under ⋯.

### 6. Every text box speaks the grammar

User-written text uses `MentionTextarea` (toolbar on) and saves through
`prepareAuthoredText` → write → `recordAuthoredText`; it shows through
`RichText`. See CLAUDE.md, "Every free-text field speaks the same
grammar".

### 7. It is registered everywhere

A new surface ships with: a tour step, the three navigation lists, global
search, backup categories (new entities), the changelog, and a wiki page
when it is a whole new area.

## Checklist for a new feature

- [ ] Which record holds the data? Is there one write path for it?
- [ ] Where is its one Info door / item sheet?
- [ ] Is its page a board (`ProfileBoardCanvas` / `PageBoardCanvas`) with
      the standard header?
- [ ] Is each view a widget, offered in every library, with a Which/Whose
      picker or `SCOPE_FIELD`?
- [ ] Are all widget settings on Content?
- [ ] Inspector rules, grammar text boxes, registrations.

## Where things stand

The audit of 2026-11-06 (project files,
`audits/garden-conformance-2026-11/garden-audit.md`) lists what already
follows this and what still has to move.
