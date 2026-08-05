# Loose Ends — living audit (updated 2026-08-04, v0.118.0, branch claude/ui-v2)

*Purpose: nothing about this project's state should depend on anyone's memory.
When an item is finished, move it to "Done" with the version. When you find a
new one, add it. Update the date line above whenever you touch this file.*

## Needs doing — high priority

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
- [ ] **i18n coverage** — only v2 surfaces use `useT()`; classic pages are
  unkeyed. Fine while translations don't exist; becomes the long pole the day
  a locale lands.

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

## Done (this cycle, for orientation)

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
