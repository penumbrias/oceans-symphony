# Boards: requirements, errors and gaps (new house, step 0.1)

This file holds the work on the mockup boards in `pixel-ui/mockups/` (51 boards: 19 desktop at 1280×900, 32 phone at 390×844). The rules referred to are in `docs/house/building-code.md`. Penumbra approves the boards, and the next step draws them. This file only lists what to draw and what to fix.

---

## 1. Penumbra's painted notes, as requirements

Each note is lifted off the board so that building to the mockup can't lose it. "Done when" is the check a reviewer runs.

### R1, from board 22 (Friends): page help lives in the help section

> "The 'new to this page?' and guided tutorials should go into this section: this applies to all pages with this type of section."

- The right dock's explanatory panel ("How it works" on 22) becomes the **Help** tab of the right dock on every page that has one.
- That tab holds the page's "New to this page?" text and the "Show me around this page" tutorial (the `tourStepsFor()` steps the branch's `PixelHelpPanel` already reads).
- Page tips stop appearing as banners or attention-line items on those pages.
- On a phone and on the compact studio, the same content opens from ⋯ → "Show me around this page", as a sheet.
- **Done when** no page with a Help tab shows its tutorial or "new to this page" tip anywhere else, and every page reaches it in two taps or fewer.

### R2, from board 33 (To-do): one font system that follows the person

> "Make sure the font is staying consistent: of course it should always default to the user's settings, but we seem to have a subfont that is not in the pixel style. With onboarding and accessibility, users should be able to set a non-pixel font or the dyslexia one."

- There are exactly **two font roles**, label and body (building code §7). No third face appears anywhere. Board 33 itself mixes the pixel face with a plain sans in the table, field values and the status bar.
- The defaults follow the person's own choice (plan decision 3: the shipped default, Inter, counts as "not chosen").
- **Setup** (the words step) and **Accessibility** both offer:
  - the body font, with OpenDyslexic and Atkinson in the list;
  - the switch "Labels use my body font", which takes the pixel face out entirely.
- **Done when** a person who picks OpenDyslexic in either place sees no pixel letters anywhere except the logo, and a person who has never chosen a font sees exactly two faces.

### R3, from board 38 (Help me unblend): never the browser's colour picker

> "Don't forget: no HTML default, always use the pretty nice colour picker (in general, whenever colour is chosen, in place of the default HTML palette)."

- Every place where a colour is chosen uses the kit colour picker, built on today's `src/components/shared/ColorPicker.jsx` (react-colorful, portaled, hex field). That includes Unblend's colour question, Appearance swatches, alter colours, categories, layers and widget looks.
- On Unblend, the quick swatches stay so the question can be answered without typing. A "Another colour…" swatch opens the kit picker.
- Each swatch carries its colour's name for screen readers and on long press.
- The guard fails on `type="color"`. There are 0 in `src/` today, and it must stay 0.
- **Done when** a grep for native colour inputs is empty, and every colour control opens the same picker.

### R4, from board 42 (Check-in log): keep the daily summary

> "This page needs to maintain the 'daily summary' functioning."

- Each day header keeps today's **Day Total** behaviour (`DayTotals` and `summaryParts` in `src/pages/CheckInLog.jsx`). That means:
  - the top three feelings (+N);
  - counts of symptoms, activities and locations;
  - "diary logged";
  - per-alter entries.
- The summary stays visible when the day is collapsed, and follows the current filter and "Who" choice.
- Board 42 draws only "4 entries". The redrawn board must show the summary line and the expanded Day Total block.
- On the Day (step 3.3), the same summary is the list view's day header, so it isn't built twice.
- **Done when** every function of today's Day Total is on the new log, checked against the room checklist (step 0.2).

---

## 2. Errors on the boards

### Every board

| # | Error | Fix |
|---|---|---|
| E1 | The logo image is broken ("Oce"), and so is Penumblob's (01, 08, 50) | Real images, or no image |
| E2 | Placeholder text drawn as content: "[Your line here]" (01, 08), "Notes &amp;amp; lists" (51) | Real copy, unescaped |
| E3 | The pixel font's "fi" ligature draws a wrong letter: "profle", "Custom Aelds", "Aelds they chose", "skipping is Ane", "When should this Are?", "NotiAcation", "not Alled", "newest frst" (12, 16, 22, 24, 38, 45) | `font-variant-ligatures: none` wherever the pixel font is used (the branch patches only `settings.css:216`) |
| E4 | Numbers in the pixel font are hard to tell apart (3, 5, 8): "Question 3", "Energy 2 of 5", calendar dates (04, 38, 42, 16) | Values in the body font (code §7) |
| E5 | An "x" means "on" in tick boxes (22, 24, 33, 47, 51) | ✓ (code §3) |
| E6 | ASCII glyphs used as icons: `v`/`-` for layer visibility, `o` bullets, `>` chevrons, `->` arrows, `=` menu, "v" as a dropdown caret (01, 03, 04, 07, 16, 32) | Lucide glyphs (code §8) |
| E7 | Text below 12 px: panel header strips, the uppercase field labels on 41, the "CHANGED BY SYNC" badges on 45, phone bottom-bar labels, the "QUICK"/"PAGE" rail captions on 01 | The type scale; sentence case |
| E8 | Inline targets under 44 px: "+ add", "+ (max 3)" and the filter chips (22, 24, 32, 33) | `h-control` (code §7) |
| E9 | Only the happy path is drawn. No board shows empty, loading, error, disabled, focus, 200% text, light theme or high contrast | One states board per kit block, plus an empty and an error state for each room (the drawing gate) |

### Board by board

| Board | Errors |
|---|---|
| 01 Main | Page tabs ("Pages: Today / Me / Plans") sit at the bottom of the canvas instead of under the header. Timeline chips are cut to "Me", "Ema", "Brea", "Lunc", "Journ". Tool rail icons have no names |
| 03 Alters | "+ New alter" wraps to two lines. The sort control wraps with a text "v". Grid / List / Tree are drawn like buttons (they should be a segmented control) |
| 04 Planner | Event titles are cut off vertically ("Meds", "Email clinic", "Walk"). The plan outcome "Cancel" clashes with the Cancel verb (it should be "Called off"). The view switcher is drawn like "+ Log / + Event" |
| 07 Settings | No "Search everything"; the version is in its place. **"Icons: Pixel / Classic"** offers a set that doesn't exist (retired, code §8). Reset, Import and Share sit in a page footer |
| 08 Phone | "Jrnl" abbreviation. Two header icons are unlabelled |
| 12 Profile phone | The bottom bar is replaced by "Edit page / Profile style / Write note", so **Support can't be reached**. Page tabs and the role tags share one look |
| 16 Check-in | "=" button with no label. "Wheel \| List" is drawn as text. The energy column's tiles are below target size. No bottom bar, so no Support (code §5 keeps it) |
| 22 Friends | Sharing levels are drawn as four loose buttons (should be a segmented control). "Unmark verified" sits where the primary action goes, with no confirm. "Explained in full here." has no link |
| 24 Reminder editor | The page is named twice ("Reminder" header, "Spacey for a while" panel). Cancel/Save sit in a panel header instead of the page header. "… Delete" at the bottom right |
| 32 System history | Filter chips wrap to two rows. "->" arrows |
| 33 To-do | **"Update"** (retired; use Save). "… Delete". The "Who" column is colour only. The "Active 7 / Done" filters look like buttons. Field labels wrap ("Scheduled (plan to do)") |
| 38 Unblend | "Set front to River" spills off the right edge of its panel. "Different question" wraps. The swatches have no names. "Likely in front 62%" reads as a measurement; better: "Leaning: River (4 answers)" |
| 41 Emergency card | Both back and ✕ in the header. The app's bottom bar shows on a card meant for a helper. Uppercase labels |
| 42 Check-in log | Kind tags look like buttons. No daily summary (R4). "Hide everything" is unclear. "Diary cards" is still a filter, though diary cards fold into check-ins |
| 45 Recent changes | Filter chips wrap to two rows. "… Empty trash". Colour-coded tiny caps badges |
| 47 Set front | Cancel/Save sit in a panel header. "x" ticks. "Fronting" / "Co-fronting" look like buttons. "Alters / By group / New presence" look like filter chips but are page tabs |
| 50 Unlock | The app's bottom bar shows while locked. The placeholder is the only label ("Your encryption password…") |
| 51 Quick jump | A single choice drawn as checkboxes (use radios). "&amp;amp;". The header hint reads like a breadcrumb |

---

## 3. Which rooms lack a board

This is mapped against Anchor's room list (`audits/new-house-2026-11/team/anchor.md`, section 2). D is the desktop board, P the phone board, and "—" means no board. The plan's count (13 rooms without a phone board, 8 without a desktop one) came from the Critic's shorter list. Mapped room by room, the gaps are wider. **No board at all is drawn at the compact size (820 px).**

### Rooms with a desktop board but no phone board (15)

| Room (Anchor section) | Desktop board | Built in step |
|---|---|---|
| Alters directory (A) | 03 | 5.3 |
| Groups and subsystems (A) | 26 | 5.3 |
| Planner (D) | 04 | 5.1 |
| To-do (D) | 33 | 5.1 |
| Activities and weekly goals (D) | 34 | 5.1 |
| Journals (E) | 05 | 5.2 |
| Bulletins (F) | 21 | 5.2 |
| Contacts (G) | 27 | 5.3 |
| Friends (G) | 22 | 5.3 |
| Check-in log (I) | 42 | 3.3 |
| Analytics (I) | 06 | 5.4 |
| Therapy report (I) | 43 | 5.4 |
| Settings and Appearance (J) | 07 | 5.5 |
| Assets (K) | 28 | 5.3 |
| Mods (K) | 46 | 5.5 |

### Rooms with a phone board but no desktop board (25)

| Room (Anchor section) | Phone board | Built in step |
|---|---|---|
| Support and grounding (H) | 15 | 3.1 |
| Safety plan (H) | 39 | 3.1 |
| Emergency info (H) | 40 | 3.1 |
| Help me unblend (B) | 38 | 3.1 |
| Unlock (K) | 50 | 3.1 |
| Set front (B) | 47 | 3.2 |
| Quick check-in, with who (C) | 16, 17 | 3.2 |
| Medications (C) | 13 | 3.2 |
| Sleep (C) | 37 | 3.2 |
| Plan / activity editor (D) | 48 | 3.3 / 5.1 |
| Routines (D) | 35 | 5.1 |
| Needs (D) | 36 | 5.1 |
| Reminders and the reminder editor (D) | 23, 24 | 5.1 |
| Chat (F) | 14 | 5.2 |
| Polls (F) | 25 | 5.2 |
| System meeting (C) | 29 | 5.2 |
| Alter profile (A) | 12 | 5.3 |
| System history / lineage (A) | 32 | 5.3 |
| Presences (A) | 30 | 5.3 |
| Get to know me (B) | 31 | 5.3 |
| Location history (I) | 44 | 5.4 |
| Recent changes and trash (I) | 45 | 5.4 |
| Search (I) | 49 | 5.4 |
| Widget inspector / Display options (J) | 10 | 5.5 |
| Quick jump (J) | 51 | 5.5 |

The emergency card (41) is phone-only by design. Its desktop board only needs to show that it opens as the same full-window safety sheet.

### Rooms paired on both sizes (4)

Home (01 / 08), System map (02 / 11), Notebook (19, 20 / 18), and timeline options (01's Layers / 09).

### Rooms with no board at either size

| Room (Anchor section) | Built in step |
|---|---|
| **The Day as a room** (timeline page, list, lane and summary views, Day review). It is only a Home dock on 01 and "Next 6 hours" on 08 | 3.3 |
| Crisis resources; panic cover (the grocery list) (H) | 3.1 |
| Now block, handover card, "Last time…" (plan decision 6) | 3.2 |
| Front history editing, stale sessions, front conflicts, triggers, switch journal (B) | 3.2 |
| Status note as a capture tool, company (C). Only widgets are drawn | 3.2 |
| Notes and lists (D) | 5.1 |
| Dated events, live activity timer (D) | 5.1 |
| Text templates, Learn and reflections (E) | 5.2 |
| Alter notes and inbox messages, the notifications/mentions inbox (E, F) | 5.2 |
| Relationships, group / contact / place profiles, question curation (A, B) | 5.3 |
| System identity and multiple systems (A) | 5.5 |
| Terms, Accessibility, Setup and the welcome steps, Tour (J) | 5.5 |
| Storage setup, recovery, backups, sync, data inspector, imports (K) | 5.5. These stay in the old house's flow and get only a frame board |

### Frame pieces with no board

These are needed before steps 2.1, 2.2 and 4.1:

- the compact studio at 820 px;
- the Do sheet;
- the Everything sheet;
- the attention line, including a failed save;
- the "Example system" label;
- the phone ⋯ menu with the "Open" list;
- the desktop edit-mode bar;
- the phone edit-mode header and tool strip;
- the confirm sheet and the Undo toast;
- the kit date / time field and the kit colour picker.

### Suggested drawing batches (by gate)

1. **Before 2.1/2.2:** the frame pieces above, plus one compact-studio board of Home.
2. **Before 3.1:** desktop boards for Support, Safety plan, Emergency info, Unblend and Unlock; crisis resources; and empty/error states for each.
3. **Before 3.2:** desktop Set front, Check-in, Meds and Sleep; Now and the handover; front history.
4. **Before 3.3:** the Day at both sizes, and the Check-in log on the phone (with R4).
5. **Phase 5:** the rest, room by room, at each room's own gate.
