# Loose Ends — living audit (updated 2026-08-04, v0.113.1, branch claude/ui-v2)

*Purpose: nothing about this project's state should depend on anyone's memory.
When an item is finished, move it to "Done" with the version. When you find a
new one, add it. Update the date line above whenever you touch this file.*

## Needs doing — high priority

- [ ] **FeatureTour has zero UI-v2 steps.** With v2 on, tour steps target
  classic elements that don't exist. This violates the CLAUDE.md tour rule and
  is the single biggest onboarding gap. Needs: a v2 branch in `buildSteps()`
  (home canvas, edit mode, quick actions, apps button, cog menu, Display
  options) gated on `ui_v2.enabled`, using v2 `data-tour` anchors.
- [ ] **Merge-to-main plan.** `claude/ui-v2` is ~18 releases ahead of main
  (v0.95.7 → v0.113.1). v2 is double-gated (build flag + per-user toggle), so a
  merge is safe in principle, but wants: fresh export/import round-trip test,
  the seven-scenario boot check, and Play `versionCode` continuity. The old
  question "cherry-pick the v0.96.1 setup-chip fix to main?" is superseded by
  merging (the chip has had further fixes on-branch since).
- [ ] **Tasks/plans consolidation** — proposal written
  (`docs/tasks-consolidation-proposal.md`), awaiting owner sign-off on its
  three open questions, then Phases 1–5.

## Needs doing — widget catalogue gaps (owner's "widgets for every page" goal)

- [ ] Weekly activity grid widget (`ActivityWeeklyGrid` embed).
- [ ] Formal schedule/log composer widget (create plans/logs from the canvas —
  blocked on consolidation Phase 4 so it wraps the ONE create path).
- [ ] Analytics display widgets beyond fronting-leaders/recent-activities
  (emotion trends, symptom charts — embed the analytics components).
- [ ] Alter-profile boards in the board widget (`AlterMessage` is a separate
  system from `BulletinBoard`; flagged since v0.108.0).
- [ ] Timeline strip widget; goals progress widget; location widget;
  reminders-inbox widget (list exists; inbox with act/dismiss doesn't).
- [ ] Picker categories per app page as the catalogue grows (currently 9
  categories; fine today, revisit past ~60 widgets).

## Needs doing — smaller

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
  (`widgetLook.js`); never direct properties on the wrapper.
- **One surface per job**: settings live integrated in Appearance (v2 pieces
  woven in by relevance); capture modals flip modes in place rather than
  swapping components.

## Done (this cycle, for orientation)

- v0.110–0.113: R4/R5 feedback — drawer redesign (hold-to-edit, folders,
  sidebar mode), chat/poll/links widgets, look-rendering fix, settings
  integration + reset, page-aware cog menu, breathing widget rebuild + pace,
  activity-capture consolidation (−144 lines).
- v0.95.x: import/export integrity + two-device sync + conflict review (on
  main since v0.95.7).
