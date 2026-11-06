# Oceans Symphony — UI critique, the strict-professor edition

> **This file is the tracker.** Penumbra asked (2026-11-06) to work through every
> item. Each fix PR updates the **Status** column in "Suggested order" at the
> bottom and ticks its finding. Screenshots and the raw axe scan live in the
> project files (`audits/ui-critique-2026-11/shots/`, `axe-scan.json`).

Written 2026-11-06 against main at **v0.364.1** (`950c410`). Planning only, no code changed.

**Method.** I read `docs/garden.md`, `docs/ui-review-guide.md`, `docs/inspector-design-guide.md`, `docs/v2-ui-standards.md`, the garden-conformance audit, the UI-cohesion roadmap, the widget-board audit, `docs/tasks-consolidation-proposal.md` and the project memory. Then I walked the app in Chromium at **390 × 844**. I went through first run with an empty system, then 25 screens with the built-in example system (Preview Mode → Guide), plus a pass at the app's own **200 % text** setting and in **light mode**. I ran **axe-core 4.10** (WCAG 2.0/2.1/2.2 A + AA) on 12 key pages, and did a few code-wide counts with grep.

**Evidence.** Screenshots are in `shots/` next to this file. Raw axe output is in `axe-scan.json`. Code references are `file:line` at the commit above.

**Severity.**
- **Critical**: it hurts the people the app is for, on every visit, or it fails an accessibility floor.
- **High**: a structural problem that will keep getting worse as features grow.
- **Medium**: a standard isn't met, or something is clearly worse than it needs to be.
- **Low**: polish.

**What I measured against:**
- Nielsen's 10 usability heuristics.
- WCAG 2.2 AA. The criteria cited are 1.4.3 contrast, 1.4.4 resize text, 1.4.10 reflow, 1.4.11 non-text contrast, 2.4.11 focus not obscured, 2.4.7 focus visible, 2.5.7 dragging alternatives, 2.5.8 target size and 4.1.2 name/role.
- W3C COGA, *Making Content Usable for People with Cognitive and Learning Disabilities*. Its objectives are: clear purpose, findable, clear content, help users focus, avoid mistakes, help and support, don't rely on memory, adaptable.
- SAMHSA's six trauma-informed principles: safety, trustworthiness, choice, collaboration, empowerment, and cultural sensitivity.
- Material 3 and Apple HIG (48 dp / 44 pt touch targets).
- NN/g on progressive disclosure, Hick's law, and the app's own garden and inspector guides.

---

## The verdict

The **architecture of intent is excellent.** It's better than most commercial apps I'd review. The garden (record → one write path → Info door → board → display widgets), the inspector guide, the trash, the terminology system and the data-safety rules are real design thinking. They are written down and enforced by a review script. Very few hobby projects get this far.

The **surface hasn't caught up with the intent.** The app was built feature by feature, and each feature brought its own:
- banner,
- header,
- tab style,
- way of saying "delete",
- name.

The result is a screen that asks for the user's attention in five places before it shows them anything. That's the opposite of what an amnesic, possibly-just-switched, possibly-dysregulated person needs.

The "Clip Studio Paint of plural apps" ambition is right, but Clip Studio works because its *default canvas is empty and quiet* and the power sits in panels you open. Oceans Symphony currently ships with the panels open.

If I had to grade it: **concept A, system design A−, execution at phone width C+, accessibility floor D.** The D is mostly a handful of very fixable global causes (contrast, minimum text size, chrome at large text). It isn't hundreds of separate problems.

The single lesson behind most findings below: **calm is a feature.** For this audience, every extra banner, icon, colour and name is a small tax on working memory. Your users pay it again after every switch.

---

## Critical

### C1. Too many things ask for attention at once — the content comes last
**Evidence:** `shots/02-first-screens-notices.jpg`, `01-onboarding-overlays.jpg`, `03`–`08` (bottom of each), `13-text-200pct.jpg`.

- **First run home, top to bottom:**
  1. "New to this page? Show me around"
  2. "Check out the widget board"
  3. "No alters here. Expected your data to be? Find my data"
  4. the page title
  5. a "pinned alters" hint
  6. a floating "Continue setup 0 of 8" card covering the bottom
  7. a "What's new · 18 changes" bar
- **During onboarding:** a storage warning toast ("This browser may clear the app's data…") sits on top of the setup guide's title on *every* step. A floating "Accessibility" button covers the "Find my data" box on the welcome card.
- **Reminders:** a fired reminder ("Drink water") is a 110 px card pinned above the bottom nav on **every page**. It covers about 20 % of the viewport, including the System Chat composer and the end of every list. This fails WCAG **2.4.11 Focus Not Obscured** in practice.
- **Every page:** the page-tutorial prompt takes the first row of every page until it's dismissed page by page (≈30 pages). The global off switch is hidden in Settings (`pages/Settings.jsx:314`).

**Why it matters:**
- Nielsen #8 (aesthetic and minimalist design).
- COGA "help users focus".
- Trauma-informed *safety*: an interface that shouts on arrival raises arousal.
- For an amnesic user, every banner is also a question: "did I already deal with this?"

**Fix:**
1. **One notice slot per page.** Use a single stack with a priority order: data-safety → reminder due → setup → tips → what's new. Show **one** item, with a "+2 more" count. The home notice stack from the cohesion roadmap is the right seed. Extend it to every page and make it the only way to show a banner.
2. **Reminder toasts become a pill after ~8 s.** For example "⭐ Drink water · Done". The pill sits in the header bell or a slim strip. A pill never covers an input, the composer or a list end.
3. **Page-tutorial prompt:** add "Stop showing these" to the banner itself. Don't show it during the first session at all, because the setup guide already covers it.
4. **During onboarding, suppress every other overlay.** The storage warning becomes a guide step, since it's important enough to be one.

### C2. Primary buttons fail contrast in most built-in themes
**Evidence:** axe flags `color-contrast` on all 12 scanned pages. Example: white on `#38bdf8` = **2.14 : 1** on "Add Alter", "New Entry" and "New Task". The cause is a single line: `src/lib/ThemeContext.jsx:474` hardcodes `"primary-foreground": "0 0% 100%"` (white) whatever the primary colour is.

Checked against the built-in presets (`ThemeContext.jsx:22-120`), white text scores:
- warm `#F59E0B` **2.15**
- forest `#22C55E` **2.28**
- cool `#3B82F6` 3.68 (fails below 18 px)
- sunset `#EF4444` 3.76

The Preview banner's "Exit" button (white on amber-600) is **3.18**. Emotion chips in the Check-In Log use white on bright greens and reds, down to **2.27**.

**Why:** WCAG 1.4.3 (4.5 : 1 for body text). Low contrast hits tired, dissociated and low-vision users hardest. This is the app's most-tapped colour.

**Fix:** derive the on-colour from luminance: pick black or white, whichever gives the higher contrast. Do it in the alias block and for `accent-foreground`, emotion chips and alter-colour chips. There's already a contrast-halo helper for alter colours (PRs #89/#92/#93); reuse it. In the theme editor, warn when a custom primary can't reach 4.5 : 1 with either. This is about one hour of work and clears most axe failures app-wide.

### C3. Text is too small by default, and breaks at the app's own large-text setting
**Evidence:**
- **In code:** **≈760** uses of text 11 px or smaller: `text-[0.6875rem]` ×413, `text-[0.625rem]` ×270, `text-[0.5625rem]` ×64, `text-[0.5rem]` ×11.
- **At runtime:**
  - **131 of 678** text nodes on the Timeline are under 12 px.
  - **71 of 145** on the Planner.
  - **64 of 157** in Settings.
- **At the app's 200 % setting** (`13-text-200pct.jpg`):
  - The header, the Preview banner, a "rotate your phone" tip, the reminder card and "Continue setup" fill the whole screen. **No content is visible.**
  - The title runs into the bell, which reads "Oceans Sym🔔".
  - Bottom-nav labels truncate to "Syste" and "Journa".
  - Elements extend to x = 751 px on Home and 1004 px on the Planner in a 390 px viewport.

**Why:**
- WCAG 1.4.4 (resize to 200 % without loss) and 1.4.10 (reflow).
- COGA "adaptable".
- The app *offers* 200 %, so the people who choose it are exactly the ones it then fails.
- Small grey metadata text is also where dates and times live, which is the information amnesic users most need.

**Fix:**
1. **A type scale with a floor.** Five steps (caption 12 · body 15 · subhead 17 · title 22 · display 28), defined as tokens. Nothing user-meaningful goes below 12 px. Add a `check:ui` FAIL for new `text-[0.5–0.6875rem]`, and migrate old ones when touched.
2. **Chrome must not scale linearly.**
   - Cap the header and nav label sizes, using `clamp()` or a separate chrome scale.
   - At large text, the bottom nav shows icons with labels in a long-press tooltip, or switches to 4 items.
   - Notices collapse to one line.
3. **Add "200 % text at 390 px: content visible above the fold" to the UI review guide's look step.**

### C4. Too many names and homes for the same jobs
**Evidence:** the navigation drawer (`09-home-drawer-quickcheckin.jpg`), `navigationConfig.js:5-39` (36 pages), `04-meetings-tasks-todo.jpg`, `05-settings-notebook-needs.jpg`.

**"Something I need to do"** lives in six places:
- **Tasks**: daily/weekly ticks with XP.
- **To-Do List**.
- **Planner**: plans.
- **Activities**.
- **Notebook**: goals with "sections, notes, to-dos, checkboxes".
- **Notes & lists**.

`docs/tasks-consolidation-proposal.md` (2026-08-04) diagnosed this three months ago and is still open.

**One thing, several names:**

| Thing | Names in use |
|---|---|
| The weekly ritual | config "Meeting", bottom nav "System Meeting", page "System Meetings", route `/system-checkin`, tour "check-in" |
| Daily tasks | bottom nav **"Tasks"**, drawer **"Daily Tasks"**; its page subtitle calls them "check-ins" |
| "Notebook" | a section (goals), a home widget (journal entries), and the section's only chip says "Goals" |
| Check-ins | "Quick Check-In", "Check-In Log", "System Meeting" (also a check-in), "Get to know me", "Help me unblend" |

**Why:**
- Nielsen #4 (consistency) and #2 (match the user's words).
- COGA "findable" and "don't rely on memory".
- A person after a switch navigates by *name*. Two names for one place, or one name for two places, means getting lost with no memory of having been there.

**Fix:** write a one-page **IA map** before any more pages ship.
1. **≈6 areas, named by job:**
   - *Today*: home, check-in, front.
   - *Us*: alters, groups, chat, history, map.
   - *Plan & do*: planner, to-dos, routines.
   - *Write*: journals, notebook, notes & lists.
   - *Support*: grounding, safety plan, learn.
   - *Look back*: timeline, analytics, reports.
2. **One canonical name per thing**, used by the nav, the page title, the tour, search and the wiki.
3. **Ship the tasks-consolidation proposal.** At minimum, rename the bottom-nav "Tasks" to match its page and rename the "Notebook" *widget*.
4. **Group the drawer by job, not by entity.** Show the 8–10 most-used pages first, with "All pages" below.

---

## High

### H1. Seven different ways to switch views
**Evidence:**

| Style | Where |
|---|---|
| Underline tabs | Support / Learn |
| Segmented pills | Planner: Calendar · Plans · Insights, and Day · Week · Month · Year |
| Filled pill row | Analytics: Overview · Fronting · Wellbeing · Life |
| Board page strip drawn as chips | Needs: Balance · Wishes · Turns; Notebook: Goals |
| Pill toggles | Journals: All / Switch Logs; Reminders: Inbox / Manage; System Map: Analytics Map / Inner World |
| Chip cloud plus a Prev/Next pager | Quick Check-In, 8 sections |
| 13-item scrolling strip | the alter profile |

In code, `rounded-full` appears **1,119** times.

**Why:** your own guide says pills that split one screen are wrong (`docs/ui-review-guide.md` "Structure — pages, not pills"). Seven idioms for one job means users must re-learn the control on each page (Nielsen #4).

**Fix:** pick **two**:
1. The **page strip** (board pages, view switchers): one component, underline style, scrollable, never wrapping.
2. **Segmented**, only for choosing a *value* (Day/Week/Month).

Migrate Analytics, Journals, Reminders, System Map and Support to (1). Add a `check:ui` warn for `rounded-full` buttons inside a `useState('tab'|'view'|'section')` switcher. The guide describes it, but the script doesn't catch it today.

### H2. Icon-only controls and hidden gestures
**Evidence:**
- **The Alters directory** (`10-alters-directory.jpg`) has about **15 unlabeled icon buttons** on one screen: eye, grid, +, cog (Groups); sort, image, folder, filter (search row); list, grid, camera, archive (Alters); a ⚡ on every card.
- **The Timeline** has six identical blue icon pills as its filters.
- **The Check-In Log** header has +, sliders and a chart icon.
- **axe:** `button-name` failures on To-Do (12), Check-In Log (3) and Home (1).
- **Gestures with no visible alternative, or one only in a hint:**
  - "press and hold an alter to pin them",
  - "Press and hold on any empty area to enter edit mode" (widget board),
  - swipe left for the widget board,
  - long-press check-in rows to edit,
  - triple-tap panic.

  Long-press handlers appear in 23 files. 171 `outline-none` against 32 `focus-visible`, and a strong focus ring exists only in `a11y-mode` (`index.css:537`), so keyboard users on desktop often can't see focus.

**Why:**
- Nielsen #6 (recognition rather than recall).
- WCAG 2.5.7, 4.1.2 and 2.4.7.
- COGA "don't rely on memory".

For DID specifically, a gesture one alter learned is not a gesture the next alter knows. **Hidden gestures are amnesia-hostile by design.**

**Fix:**
1. A rule: **no icon-only button except universally known ones** (×, back, search, ⋯, bell, cog). Everything else gets a word, or goes into a ⋯ menu with words.
2. Every gesture has a visible equivalent. The widget board gets an "Edit page" button, as the garden header already specifies. Pinning goes in the alter's ⋯ menu.
3. Add a default `:focus-visible` ring, not only in a11y mode.

### H3. Destructive actions sit on every row, and confirmation dialogs are everywhere
**Evidence:**
- System Meetings shows a red **Delete** on every row.
- The Check-In Log has a 24 × 24 trash icon on every entry, next to a pencil (`h-6 w-6`). This fails the 44/48 px touch-target guidance and is easy to mis-tap.
- About 127 `confirm(…)` calls remain, even though deletes now go to the trash (v0.278.0).

**Why:**
- Your own guide puts destructive actions under ⋯.
- Nielsen #3 (user control) and #5 (error prevention).

A confirmation for a *recoverable* action trains people to tap "Yes" without reading. That makes the rare *permanent* confirmation (Delete now, Replace all from PluralKit) less safe.

**Fix:**
- Row actions go into a ⋯ menu or a swipe that also has a visible alternative.
- Recoverable deletes: no confirmation, just an **Undo** snackbar that lasts about 10 s and says "In the trash for 30 days". This is safe for amnesic users because the trash is the backstop.
- Keep confirmation dialogs only for things that skip the trash, and make those *type-to-confirm*.

### H4. Quick Check-In isn't quick
**Evidence:** `09-home-drawer-quickcheckin.jpg`. One modal holds:
- a date-time field,
- Cancel and Save at the top,
- **8 section chips**,
- a Guided / Classic mode toggle,
- an unlabeled vertical "Energy level" column,
- an emotion search,
- four big category tiles,
- a custom-emotions cloud,
- and a Prev / Feeling / Next pager at the bottom.

It also has two navigation models at once: the chips *and* the pager. The home button for it is red/pink.

**Why:**
- Hick's law, and progressive disclosure.
- The most frequent logging action should be the lowest-effort action in the app.
- Red reads as alarm (see M3).

**Fix:**
- The default path is **pick a feeling → Save**: two taps, and it attributes to whoever is in front via the existing `attribution_default`.
- "Add more" opens the other sections as a list of rows (drill-in), not chips.
- Put the energy level on the first page as a labelled slider, or leave it out.
- One mode. Keep Guided and let Classic be a setting.

### H5. Streaks and XP in a trauma-informed, amnesic context
**Evidence:** the Tasks page shows "Level 1 · 0/11 pts today · 0 total XP · 🔥 0 day streak · Best 0". There's also a streak-milestone trigger (`DailyTasks.jsx`).

**Why:** streak mechanics punish gaps. Gaps are *exactly* what dissociative amnesia, crises and dormancy produce. "0 day streak · Best 12" after a lost week is a shame message. It cuts against SAMHSA *safety* and *empowerment*. Points can motivate some people, so this needs consent, not removal.

**Fix:**
- Gamification is **opt-in** at setup ("Would points and levels help you, or get in the way?"). Default off for new users. Existing users keep what they have.
- Replace "streak" with **gap-proof framing**, such as "12 days you showed up this month". Never show a zero or a broken chain.
- Hide "Best" unless asked.

### H6. First run says "welcome" three times, and undercuts trust
**Evidence:** `00-welcome.jpg`, `01-onboarding-overlays.jpg`.

1. The welcome card has four paragraphs before the button. It calls the app "OS", which reads as *operating system*. The privacy section's first visible line is "!! Please read !! OS is vibe-coded and in active alpha".
2. Then the guide opens on a second welcome ("WELCOME · 1/1").
3. Then a long disclaimer whose checkbox is only reachable by scrolling. Until then the Next button is disabled, and the hint below it is low contrast.

The step counters ("WELCOME · 1/1", then "SETUP · 1/2") never say how many steps there are in total. The app's bottom nav shows behind the onboarding sheet.

**Why:**
- First impressions set trust, and trust is the whole contract of a local-first app holding someone's history (SAMHSA *trustworthiness*).
- Honesty about alpha status is right. "!! vibe-coded" as the first thing a stranger reads is not the way to say it.

**Fix:**
- **One** welcome: one sentence plus Enter.
- Fold the disclaimer into a short, calm step with the checkbox visible without scrolling. The full text goes behind "Read the full notice".
- A single progress bar: "Step 2 of 5".
- Say the alpha status plainly: "This app is in early testing — keep backups; here's how."
- Hide the app chrome during onboarding.

---

## Medium

### M1. Every page builds its own header
**Evidence:**

| Page | Header |
|---|---|
| Timeline | huge serif title, plus a native date input and Jump |
| Journals | title, plus three stacked buttons (New Folder, New Entry, Import files) |
| Settings | title, Backup dropdown, ALPHA chip, version, a "Template gallery" link and three social icons |
| Planner | no title at all |
| Alters | title truncated to "Preview …" by three buttons |
| Needs / Notebook | the garden header, at a different inset from the others |

**Fix:** one `PageHeader`: title · at most one primary action · ⋯ (with words). For board pages that's the garden's title · Info · Edit page. Move "Import files", "New Folder", the socials and the version into ⋯ or the About page.

### M2. Native date and select controls
**Evidence:**
- Timeline: `mm/dd/yyyy` native date input (axe `label` failure).
- Quick Check-In: native datetime-local.
- To-Do: native "All categories" select (axe `select-name`).
- 26 native `<select>` in code.

**Fix:** one `DateField`/`WhenField` (the planner's `ActivityWhenField` is the seed) and `SearchableSelect` everywhere.

### M3. Colour meaning is inconsistent, and red means "routine"
**Evidence:**
- The Quick Check-In button is red/pink.
- "Bad" is red.
- The emotion "curious" is red (3.92 contrast at 9 px on the Timeline).
- Support's "You don't have to go through this alone" is pink-red text.
- The Check-In Log is a rainbow of saturated chips with white text.

**Why:** trauma-informed *safety*. Red is the alarm colour. Using it for everyday actions either raises arousal or teaches people to ignore it when it matters.

**Fix:** reserve red for destructive actions and genuine danger. Make the Quick Check-In the primary colour. Use a calmer, contrast-checked palette for emotion colours, keeping user-set colours. Support copy uses the normal text colour.

### M4. Nested interactive elements
**Evidence:** axe `nested-interactive` ×21 on home (rows inside widgets), ×14 on the Timeline (day headers), and on the Analytics chart.

**Fix:** a row is either a button or holds buttons, never both. A row that opens something uses a stretched link with sibling buttons.

### M5. Five overlay systems
**Evidence:** **107** `fixed inset-0` overlays, **90** `<Dialog>`, **18** `<Drawer>`. The guide says sheets.

**Fix:** a single `Sheet` primitive (non-modal option, peek height, safe areas, focus trap, Escape/back) and a single `Dialog` for real interruptions. Then migrate surface by surface; garden step 6 (planner sheets) is the first.

### M6. Instructions written as paragraphs instead of shown in the UI
**Evidence:**
- **Activities:** "Tap an activity to select it, then Details, edit, add a sub-activity or delete. Drag (or use '→ here') to nest one inside another."
- **Widget board:** two paragraphs of welcome text.
- **System Map:** a three-line description.
- **The alter profile:** stacks "How alter profiles work now", "Try the new profile" and a "Switch to it / Not now / Don't ask on any profile" prompt above the content (`11-alter-profile-info.jpg`).

**Why:** Nielsen #10 says help should be there *when needed*. If the UI needs a paragraph, the controls are probably what needs fixing.

**Fix:** visible controls with words (see H2). Explainers go behind a ⓘ or "How this works", and after dismissal they never come back unasked. Never show more than one explainer per screen.

### M7. Terminology leaks
**Evidence:**
- No `useTerms` at all: `components/diary/analytics/AlterLoggingChart.jsx` ("Diary entries per alter"), `components/analytics/JournalAnalytics.jsx` ("Most mentioned alters"), `components/analytics/AlterActivityDeepDive.jsx` ("Alter Presence Summary").
- Imports `useTerms` but still hardcodes: `components/alters/RecordSystemChangeModal.jsx:191-463` ("Select at least two alters…", "No alters found", "Alters to archive").
- `components/system/SystemMap.jsx:602` ("Click an alter to center it"; also "Click" on a phone).

**Fix:** a quick sweep. Add these phrases to the `check:ui` term list.

### M8. The Safety Plan needs to be ready faster
**Evidence:** `08-map-reminders-safetyplan.jpg`. The empty state says "You can create one in the Learn section" and offers only "Go to Safety Plan lesson". Below it is a disclaimer box nested inside another disclaimer box.

**Why:** this is a crisis surface. Making one should take one tap, and it should never be gated behind a lesson.

**Fix:**
- A "Start my plan" button that opens the editor with the standard sections pre-filled as prompts. The lesson is an optional link.
- A compact disclaimer, once.

---

## Low

- **L1. The Preview / Wiki guide is 275 versions stale.** The banner says "last refreshed for v0.89.5 · you're on v0.364.1". It's three lines of monospace, which is technical-looking, and it's huge at large text. Reloading on a profile gives "Alter not found", because preview ids regenerate per build. Either refresh the wiki or say "The example covers older features".
- **L2. Copy nits:**
  - "Tall y" wraps inside the Timeline's Tally button.
  - "Show Completed" is Title Case where the rest is sentence case.
  - "MANUAL" chip on daily tasks is implementation jargon.
  - "📅" emoji *and* a calendar icon on "Coming up".
  - "Click" on touch screens.
- **L3. The Week view at 390 px** shows about 3 days. Hours are monospace "00, 01", and the first useful hour is below the fold. Start at the current hour and use the body font.
- **L4. Floating buttons overlap content.** The grounding bubbles button sits on Settings rows; the Accessibility button sits on the welcome card. Floating buttons need reserved space or should hide while scrolling.
- **L5. Daily tasks use switches to mark something done.** A switch means "a setting"; ticking off a task is a checkbox, as on the To-Do List.

---

## Infrastructure — what makes the above keep coming back

1. **No type, colour or space tokens beyond the theme palette.** Sizes are hand-typed (≈900 bracketed `text-[…]`), greys are hardcoded (91), and on-colours are assumed white. Add semantic tokens: `--text-caption … --text-display`, `--on-primary`, `--on-accent`, `--danger`, `--space-1…6`. Put them in `check:ui`, so a new hand-typed size is a FAIL.
2. **Mega-files make consistency fixes expensive.**

   | File | Lines |
   |---|---|
   | `v2/widgets.jsx` | 3,920 |
   | `DataBackupRestore.jsx` | 2,985 |
   | `ExperimentalDashboard.jsx` | 2,886 |
   | `UiEditSheet.jsx` | 2,083 |
   | `CheckInLog.jsx` | 1,980 |
   | `QuickCheckInModal.jsx` | 1,905 |

   Split by responsibility when touched, not as a big-bang refactor.
3. **The review guide checks structure but not accessibility.** Add to `docs/ui-review-guide.md` and the script:
   - an **axe run on the touched route**. I ran it here with Playwright plus `axe-core`; it's about 30 lines and could live in `scripts/`.
   - **contrast of any new colour pair**.
   - **text ≥ 12 px**.
   - **a 200 % text screenshot**.
   - **no icon-only buttons**.
   - **at most one notice per page**.
   - **red only for danger**.
4. **No IA source of truth.** The three navigation lists are kept in sync by hand (CLAUDE.md). An IA map (C4) plus a single page registry would turn "remember to add it in three places" into one place.
5. **Mobile is checked at 390 px, but not at 200 % text, in light mode, or with a keyboard.** Add those three to the look step of the UI review. They take about two minutes each.

---

## What's genuinely good (keep it)

- **The garden and the inspector guide.** These are the right answer to "deep customisation without chaos". The Info sheet (`11-alter-profile-info.jpg`) is clean: labelled rows, real values, an autosave indicator and undo/redo.
- **The Settings list.** Searchable, grouped, drill-in, with one-line hints. It's the best-organised screen in the app.
- **The light theme reads well** (`14-light-theme.jpg`).
- **Trauma-informed copy where it exists.** Analytics' "compared with your own usual — never anyone else's" is exemplary. Reminders' "Notifications are off — turn them on in this site's settings" is a model empty/blocked state.
- **Accessibility foundations.** A skip link exists, `prefers-reduced-motion` is respected, and there's a text-size setting, an a11y mode and Atkinson Hyperlegible.
- **The data-safety copy in onboarding.** The backup choice is clear and honest.

---

## Suggested order (pick what to fix)

| # | Fix | Size | Impact | Status |
|---|---|---|---|---|
| 1 | **C2** on-colour contrast from luminance | S | Clears most axe failures on every page | In progress |
| 2 | **C1** one notice slot + reminder pill + "stop showing tutorials" | M | Every page calmer, content first | To do |
| 3 | **C3** type scale with a 12 px floor + chrome that survives 200 % | M | Readability, WCAG 1.4.4/1.4.10 | To do |
| 4 | **H2** words on icons, a visible alternative for every gesture, default focus ring | M | Amnesia-safe navigation | To do |
| 5 | **C4** IA map + one name per thing (rename only, no moves yet) | S→M | Findability | To do |
| 6 | **H4** two-tap Quick Check-In | M | The most frequent action gets easy | To do |
| 7 | **H3** Undo instead of confirmation for trash-backed deletes; row actions into ⋯ | M | Fewer mis-taps, fewer dialogs | To do |
| 8 | **H5** gamification opt-in, gap-proof streaks | S | Trauma-informed | To do |
| 9 | **H1** two view-switch idioms | M | Consistency | To do |
| 10 | **H6** one-step welcome, calmer alpha notice | S | Trust at first contact | To do |
| 11 | Infrastructure 1 + 3: tokens + accessibility checks in the review guide | S | Stops the drift returning | To do |

Items 1, 5 (renames only), 8, 10 and 11 are each small enough to be one PR. Item 2 builds on the existing home notice stack. Item 3 is mostly tokens plus a migration-when-touched rule.
