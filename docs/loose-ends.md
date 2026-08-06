# Loose Ends — living audit (updated 2026-08-04, v0.118.0, branch claude/ui-v2)

*Purpose: nothing about this project's state should depend on anyone's memory.
When an item is finished, move it to "Done" with the version. When you find a
new one, add it. Update the date line above whenever you touch this file.*

## Needs doing — high priority

- [ ] **Alters-bar gesture pass (owner request, 2026-08-06 — NOT started).**
  Four parts, one coherent job:
  1. Move the alters-bar collapse chevron OUT of the bar and INTO the action
     bar — in line with the existing dock chevron, ideally just above the
     Set Fronters key, so the bar stops spending a row on its own control.
  2. Swipe UP on the quick-action bar (or on the Set Fronters key) opens the
     alters bar.
  3. Swipe DOWN on the alters bar closes it.
  4. The alters bar's open/closed state stays INDEPENDENT of the
     quick-action bar's open/closed state, while still being openable
     through it.

  Already in place to build on: `altersBar.collapsed` persists in the board
  config and is sanitized (`experimentalHome.js`); the
  `os-v2-toggle-alters-bar` window event folds/unfolds it (listener in
  `ExperimentalDashboard.jsx`, dispatched from `V2Frame.jsx`); Set Fronters
  already has a per-key hold override via `useQuickActionsHold(onTap, onHold)`
  — a swipe handler belongs alongside it.

  **The hard part is gesture arbitration, not the state.** The board pages
  sideways from ANYWHERE on its surface via document-level capture listeners
  (`ExperimentalDashboard.jsx`, the page-swipe effect). A new vertical swipe
  must not steal that, and must not be stolen by it. Read that effect first
  — it is the reference for claiming a direction (axis lock at ~18px, the
  `blockedTarget` exclusions, non-passive `touchmove` preventDefault).

  **Verification is mandatory and specific:** gesture work in this repo has
  been "obviously correct" and wrong four separate times. Synthetic
  PointerEvents DO NOT prove a gesture. Drive it with the browser tool's
  real input (`computer` drag) at a mobile viewport, and beware: a
  `resize_window` viewport override desyncs the tool's input coordinates
  from the page (clicks land hundreds of px away and silently hit `<html>`).
  Verify the coordinate mapping with a temporary document-level listener
  before trusting any drag result.

- [ ] **Merge to main — ON HOLD by owner (2026-08-04: "I want to hold off on
  the update release").** Pre-checks all ran green on 2026-08-04: zero
  storage-layer diff vs main, versionCode strictly increasing (832 → current),
  pure fast-forward, classic mode verified. When the hold lifts: re-run those
  quick checks (versions have moved since), then `git checkout main && git
  merge --ff-only claude/ui-v2 && git push`.

## Needs doing — widget catalogue gaps (owner's "widgets for every page" goal)

- [ ] Weekly activity grid widget (`ActivityWeeklyGrid` embed).
- [ ] Formal schedule/log composer widget (create plans/logs from the canvas —
  now unblocked: wrap `createPlan()` from `src/lib/planCreate.js`).
- [ ] Analytics display widgets beyond fronting-leaders/recent-activities
  (emotion trends, symptom charts — embed the analytics components).
- [ ] Alter-profile boards in the board widget (`AlterMessage` is a separate
  system from `BulletinBoard`; flagged since v0.108.0).
- [ ] Timeline strip widget; goals progress widget; location widget;
  reminders-inbox widget (list exists; inbox with act/dismiss doesn't).
- [ ] Picker categories per app page as the catalogue grows (currently 9
  categories; fine today, revisit past ~60 widgets).

## Needs doing — smaller

- [ ] **Watch: unexplained ui_v2 re-enables** (2026-08-04, twice, dev
  preview). RECURRED 2026-08-05 during fronting-levels verification: flag
  flipped true at a dashboard load right after a settings session. Likely
  cause found and fixed in v0.116.0: `useV2Display().write` forced
  `enabled: true` on EVERY write, and those rows are mounted in classic
  Appearance — one accidental slider touch opted the user into v2. The
  force is removed (writes preserve the flag; only the explicit New UI
  toggle changes it). Keep watching one more cycle; if it recurs, the
  cause is elsewhere.

- [ ] **Landscape audit residue (v0.120.4 fixed the core):** the hold-drag
  level RAIL can exceed a landscape viewport if a user defines ~8+ levels
  (picker overlay + menu dropdown cover that case; rail rows beyond the
  screen are pickable only blind). Consider scaling row height when
  railH > viewport.
- [ ] **Widget catalogue follow-ups (v0.124.0 added 5):** still missing
  activity/plan analytics embeds, a weekly-grid widget, timeline strip,
  goals, locations, reminders-inbox. Check-in parity: the quick check-in
  also has Company/Location/Note steps with no widget yet.
- [ ] **Manual alter order is SYSTEM-WIDE as of v0.126.0**
  (SystemSettings.alter_order, src/lib/alterOrder.js, editor at
  components/shared/AlterArrangementEditor). Wired: AlterGrid (alters
  page — the hand-set order outranks even fronters-first for placed
  alters), AlterSearchSelect, SetFrontSheet (alpha mode), alters_list
  widget (falls back to the global order). NOT yet wired: GroupMembersModal,
  FronterPicker, AlterDropdownPicker, AlterTreeSelect, chat SpeakerPicker,
  the old SetFrontModal picker — do these when touched (one-liner each:
  wrap the list in useAlterOrder().arrange).
- [ ] **Widget catalogue is page-shaped (v0.126.0).** Long-term goal per
  the owner: every classic page's functions reachable as widgets. Gaps by
  section — Activity tracker (weekly grid, log/schedule composer), Tasks
  (daily tasks, streaks), Timeline (no section yet), Analytics (fronting
  leaders lives in the classic registry only; activity/plan analytics),
  Support (grounding techniques, crisis card), Check-in (company,
  location, note steps), Reminders (inbox with act/dismiss).
- [ ] **Font pickers:** widget options + profile style now offer uploaded
  fonts; ProfileStyleEditor still uses a raw <select> (house rule says
  SearchableSelect) — convert when touched.
- [ ] **dockPos syncs across devices** but is arguably per-device (a phone
  edge position makes little sense on a monitor). Layouts are already
  per-device; consider `dockPos` → device-class keyed like `ui_v2_home*`.
- [ ] **Classic Appearance "Presets" don't capture v2 tokens** (accent/radius/
  etc.), so a saved preset restores classic colors only. Decide: extend presets
  or document the boundary.
- [ ] **Unused locale keys** from retired UIs (`options.previewRow`,
  `options.fullPanel`-era strings, `widget.book.*` chips-era strings) — sweep
  `src/locales/en.js` against actual `t()` usage.
- [ ] **Profile songs follow-ups** (v0.119.0 shipped core): per-alter volume;
  "entrance theme on switch-in" (owner explicitly deferred); the asset
  library page doesn't list audio blobs (they're store-only, still in
  backups); consider audio in the v2 alter-link widgets.
- [ ] **Breathing pace on the Grounding page** — the `pace` prop exists; the
  full-screen exercise has no control for it yet (widget-only today).
- [ ] **Gesture map (settled v0.122.1 — owner spec).** Alters page: tap
  chip = profile · hold chip = action menu · bolt tap = add at top level /
  adjust · bolt hold = level rail. Grid tiles: tap = profile · hold =
  menu (no bolt there — fronting via the menu's level dropdown). Fronting
  chips + who's-here/pinned widgets: tap = panel/profile · double-tap =
  menu · hold = rail. SessionActionPopover is now used only by the alter
  profile's History tab (its two actions live in the menu everywhere
  else) — fold it in if that surface is ever touched. The classic pinned
  gallery's "scroll block" config is vestigial (swipes gone).
  TimeOfDayFronters (legacy, collapsed) still splits primary/cofront —
  fine as lead/non-lead; modernise to levels if ever promoted.
- [ ] **Fronting levels follow-ups**: terms for the word "level" itself
  aren't customizable; consider level colors; wiki entry missing (see wiki
  item below). v0.121.0 made levels THE system (always on; defaults =
  Fronting/Co-fronting; legacy rows map primary→top, co→second at READ
  time — no data migration). Dead code to sweep when touched: the
  togglePrimaryFor fallbacks behind usePrimaryGesture, cfg.enabled
  conditionals (now constant true). v0.118.0 retired the primary star when levels are on
  (is_primary now DERIVED: topmost occupied level, ties keep current lead —
  recomputePrimaryFromLevels in setFront.js) and replaced the set-primary
  swipe with the tap-to-pick spectrum on: AlterCard, AlterGridView,
  PinnedAltersGallery, QuickActionsMenu rows, FronterChip. Level display on
  classic FrontingBar rows still pending.
- [ ] **Old SetFrontModal is now ONLY the selection-mode alter picker**
  (v0.117.0 rebuilt the real set-front flow as `SetFrontSheet`, engine in
  `src/lib/setFront.js`). Follow-up: strip the modal's dead set-front code
  paths (unsure/triggered/journal/levels UI, handleSave's front branch) and
  rename it `AlterMultiSelectModal`; its 4 callers are QuickPlanComposer,
  MeetingParticipantsSection, ActivityLogModal, ActivityPlanModal.
- [ ] **Dev-verification trap (for Claude, documented so it stops recurring):**
  in the Vite dev preview, `import('…/base44Client.js')` from the console
  creates a SECOND localDb module instance whose in-memory DB snapshots at
  first import; any later write through it saves the WHOLE stale blob (this
  faked the "ui_v2 re-enables itself" recurrences on 08-04/08-05). Method:
  reload → import+write immediately → reload before trusting app state.
- [ ] **Wiki preview (`previewWiki.js`) knows nothing about v2.** The
  staleness banner is honest about it (WIKI_CONTENT_VERSION < APP_VERSION),
  but before v2 ships to main the wiki wants a v2 walkthrough entry.
- [x] Older v2 widgets are single-mode no longer (v0.133.0): `WidgetModeContext`
  + `rowsForMode` in `primitives.jsx`, a `sized()` wrapper in widgets.jsx, and
  the shared `Row` drops its icon/qualifier at minimal. 17 widgets widened
  this way without rewriting any of them. Still single-mode ON PURPOSE: the
  layout primitives (heading/text/divider/spacer) and the full-surface ones
  (chat channel, bulletin board, notebook, journal, new poll).
- [ ] **New widget strings are unkeyed.** activityWidgets/moreWidgets write
  English directly instead of going through `useT()`, unlike the rest of
  `widgets.jsx`. Fold them into `src/locales/en.js` when the locale work
  starts.
- [ ] **i18n coverage** — only v2 surfaces use `useT()`; classic pages are
  unkeyed. Fine while translations don't exist; becomes the long pole the day
  a locale lands.

- [ ] **Portal-to-body trap (bit us in v0.133.7→.8):** anything portaled to
  document.body whose ROOT element is `.fixed` gets pointer-events force-
  enabled by the vaul guard rule (`body > .fixed {{ pointer-events: auto }}`
  in index.css) — an invisible closed overlay then eats every touch. Always
  wrap body portals in a plain non-fixed div. Check this FIRST when "nothing
  scrolls / nothing taps" appears after adding an overlay.

- [x] **src/v2 was outside eslint's coverage** — which is exactly why an
  undefined identifier (`showStatus` leaked between widget functions)
  shipped and crashed devices with an active symptom episode (v0.134.8).
  eslint.config.js now includes `src/v2/**`; `no-undef` in that tree is a
  shipped-crash class, never a style nit.

## Standing rules distilled this cycle (also in Claude's memory)

- Widgets are **building blocks**: a classic component converted to a widget
  sheds its backpacked conveniences (status bar off the fronting panel, quick
  rows off the board).
- **House picker rules apply inside widgets/config sheets**: unbounded list →
  `SearchableSelect` / `SearchableMultiList`; chips only for ≤5 static options.
- Per-widget **looks are CSS variables consumed by the widget's visible box**
  (`widgetLook.js`); never direct properties on the wrapper. The full rule set
  is now formalized in **`docs/widget-contract.md`** (v0.115.1) — one box per
  widget, em text, accent via `--v2-accent`, compliance test in the doc.
- **One surface per job**: settings live integrated in Appearance (v2 pieces
  woven in by relevance); capture modals flip modes in place rather than
  swapping components.
- **One react-query key = one fetcher shape** (v0.135.1, the symptom-
  resurrection bug). Two `useQuery`s sharing a key but fetching different
  slices (active-only vs full list, or different caps) share ONE cache
  entry — whichever refetches last poisons the other, and when both are
  mounted on the same screen (the v2 board!) it never self-heals. The bare
  key means "the standard full list"; anything narrower gets a suffix:
  `["symptomSessions","active"|"all"]`, `["frontHistory","recent50"]`,
  `["reminders","active"]`, `["activities","recent5"]`, etc. Bare-prefix
  `invalidateQueries` still hits every variant, so writers don't change.
  Known benign leftovers (limit-only variants that never co-mount, self-
  heal on mount refetch): `sleep`, `dailyProgress`, `diaryCards`,
  `bulletins`, `emotionCheckIns`, `contactEncounters`, `symptomCheckIns`,
  and `frontHistory` 2000 (most) vs 20000 (profile HistoryTab — matters
  only past 2000 sessions). Audit script: grep queryKey/queryFn pairs and
  diff fetchers per key (see v0.135.1 session).

## Done (this cycle, for orientation)

- v0.132.1 (pre-tester sweep): the `[data-ui-v2] .px-3` density rule was
  out-specifying `.pl-7` (icon printed over the text) — the escape list now
  covers pl/pr 6–12, so check it FIRST whenever an icon-in-field overlaps.
  Day view's first hour label sat under the sticky quick-plans strip (spacer
  added; the label is drawn half a line above its row on purpose) and the
  now-line crossed the "no activities" text. `updateThingSchedule()` wires
  the edit path — `unscheduleThing` is no longer dead code. Classic
  dashboard has one Add button; the bulletin tour step no longer describes
  the deleted plan composer.
  Verified against the owner's own test record: one Task + one linked
  scheduled Activity, `task_id` set — the merged create path works on real
  data.
- v0.131.0: to-dos and plans merged into one thing with an optional time
  (`src/lib/thingSave.js`; proposal Phase 6). Hold a quiet part of a widget
  to open its options — regions that own a hold now mark themselves
  `data-own-hold` (the level rail, the hold-menu, the activity grid, day
  cells), which is the hook to reuse for any future in-widget hold.
  v0.132.0 finished it: ONE command key (`quick_thing`, "Add") with saved
  bars migrated in `resolveUiV2`, one quick-action widget (the legacy
  `action_quick_task`/`action_quick_plan` ids alias it, hidden from the
  picker), `TaskFormModal` routed through `saveThing` (with a `taskFields`
  passthrough so subtasks/mentions keep their fields), and
  `QuickPlanComposer.jsx` deleted. "More options" now opens
  `ActivityPlanModal` seeded with the draft.
- v0.130.0: bottom-chrome clearance is now MEASURED — `V2BottomChrome`
  publishes `--v2-bottom-chrome-h` (minus its safe-area padding) via a
  ResizeObserver and `--bottom-nav-height` reads it, so every consumer
  (page content at all widths, sidebar, sheets, floating buttons, dock
  clamp) tracks the bar including the open quick-actions drawer. Also:
  grid fit-to-width + controlled `display` props (widget config owns the
  filters), `useDayRangeDrag` for month/year multi-day plan spans,
  configurable command keys (+ plan/set-front by default), saved Quick
  Actions reachable by holding the apps button or any key (hosted at
  Dashboard level in v2 — it used to live inside the quick-checkin widget,
  which a v2 board may not have), compact picker cards for key-sized
  widgets.
- v0.128.0: page-sized widgets — activity week/day/month/year (expanded =
  the tracker's real gestures via a shared modal host in
  `src/v2/activityWidgets.jsx`), timeline + day summary + check-in log +
  daily tasks + chat channels + grounding + learn
  (`src/v2/moreWidgets.jsx`). The timeline's 25 queries and per-day slicing
  moved to `src/lib/timelineData.js`, shared by Timeline.jsx and the
  widgets. `ActivityWeeklyGrid` gained one additive prop (`hideControls`)
  so a tile doesn't spend its height on the filter row. v0.128.1 added
  `embedded` to `ActivityDayView` (no portal / no fixed shell / no
  swipe-close) for the Day view widget — the overlay path is unchanged.
  v0.129.0 made every activity widget above minimal interactive (the
  tracker's gestures + a "+ Plan"/"Log" header) and added
  `src/v2/commandWidgets.jsx`: one widget per quick-action key, firing the
  same Dashboard-hosted modals the command bar fires (QuickNoteSheet is now
  exported from V2Frame rather than duplicated). DailyTallyPanel's
  fronting split moved off primary/co onto the user's levels.
- v0.115.0: consolidation Phases 3+4 — ONE task-create path
  (`src/lib/taskCreate.js`, used by QuickTaskComposer + TaskFormModal;
  companion bulletin is an option, not a fork) and ONE plan-create path
  (`src/lib/planCreate.js`, used by QuickPlanComposer + ActivityPlanModal;
  kept the composer's quick-plan date rule). All five proposal phases now
  shipped (P1 sync v0.114.0, P2 reschedule/carry-over v0.114.0, P5 single
  DailyProgress writer v0.114.1 — five copies found, not four).
- v0.114.2: v2 FeatureTour steps shipped; v0.115.0 reordered them so the
  widget-board step leads under v2 (owner request).
- v0.110–0.113: R4/R5 feedback — drawer redesign (hold-to-edit, folders,
  sidebar mode), chat/poll/links widgets, look-rendering fix, settings
  integration + reset, page-aware cog menu, breathing widget rebuild + pace,
  activity-capture consolidation (−144 lines).
- v0.95.x: import/export integrity + two-device sync + conflict review (on
  main since v0.95.7).
