# Loose Ends — living audit (updated 2026-08-04, v0.115.0, branch claude/ui-v2)

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

- [ ] **Watch: one unexplained ui_v2 re-enable** (2026-08-04, dev preview
  only). Flag flipped true without user action; NOT reproducible — visiting
  /, /tasks, /settings#appearance with v2 off leaves it off. If a tester
  reports v2 turning itself on, suspect any `write({...enabled:true})`
  paths (V2DisplaySettings.write) reachable from an unexpected mount.

- [ ] **dockPos syncs across devices** but is arguably per-device (a phone
  edge position makes little sense on a monitor). Layouts are already
  per-device; consider `dockPos` → device-class keyed like `ui_v2_home*`.
- [ ] **Classic Appearance "Presets" don't capture v2 tokens** (accent/radius/
  etc.), so a saved preset restores classic colors only. Decide: extend presets
  or document the boundary.
- [ ] **Unused locale keys** from retired UIs (`options.previewRow`,
  `options.fullPanel`-era strings, `widget.book.*` chips-era strings) — sweep
  `src/locales/en.js` against actual `t()` usage.
- [ ] **Breathing pace on the Grounding page** — the `pace` prop exists; the
  full-screen exercise has no control for it yet (widget-only today).
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
