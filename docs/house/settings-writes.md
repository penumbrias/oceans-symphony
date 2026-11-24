# Settings writes (new house step 0.4)

**The rule:** SystemSettings is written through `writeSettings` / `writeLookField`
in `src/lib/settingsWriter.js`. It reads the row fresh
(`pickPrimarySystemSettings`), runs every write through one queue, merges the
nested look fields (`MERGE_FIELDS`: `ui_v2`, `ui_pixel`, `theme`,
`pinned_alters_config`, `page_looks`, `notification_prefs`) key by key, takes
`(fresh) => patch` for anything built from the current value, creates a row
only when none exists (`create: true`), sends board fields through
`boardWriter`'s rules, and writes through the entity proxy so `_ft` and sync
work. Test: `node scripts/test-settings-writer.mjs`.

How to call it:

- One sub-key of a nested look field: `writeSettings({ ui_v2: { dockPos } })`.
- Anything computed from the current value: `writeSettings((fresh) => pinnedBarPatch(fresh, patch))`.
  The function's result is written as is, so return whole field values.
- A scalar: `writeSettings({ corner_mode: "sharp" })`. Add `{ create: true }`
  only where the old code created a row when none existed.

## Moved to the writer (this step)

Look and appearance: Display options (`UiEditSheet.jsx`: corners, app look,
bars, wave, pinned bar, sidebar, top/bottom bar lists, setup packs, preset
apply, bar resets), `useV2Display` (`V2DisplaySettings.jsx`: tokens, bars,
icons, command keys), `usePixelLook` (`uiLook.js`), `writePageLook`
(`pageLooks.js`), `patchLookDefaults` (`profileLookDefaults.js`),
`V2Frame.jsx` (dock position, pinned bar), `ActiveNow.jsx`, `PixelChrome.jsx`,
`BarShowSwitch.jsx`, command keys in `HomeV2.jsx` and `ClassicHomeCanvas.jsx`,
`ExperimentalDashboard.jsx` (saved styles, Home opens on, pinned bar, snap),
`HomeOpensOnRow.jsx`, `FrontLevelStylesEditor.jsx`, `PinnedAltersConfigPanel.jsx`,
`barPicture.js`, `prefLevelIcons.js`, the fronter-linked preset in
`AppLayout.jsx`, `QuickNavMenu.jsx` (dashboard grid), `widgets.jsx` (system
picture).

Other preferences: `AlterLabelToggle`, `AlterLabelSettings`, `AlterOrderSettings`,
`TimezoneSettings`, `QuickJumpSettings`, `GoalsXpSwitch`, `InfoTab` (hidden
fields), `ProfileSettings`, `ProfileSongsSettings`, `FrontLevelsSettings`,
`profileViewPrefs.js`, `soundManager.js`, `profileLayoutSwitch.js`,
`alterInfoEntries.js`.

Fonts, colours, text size and accessibility are not on SystemSettings: they
live in localStorage (`ThemeContext.jsx`, `useAccessibility.js`) and are
mirrored by `localSettingsMirror.js`. Wallpaper and home backgrounds are board
fields, written by `writeBoard`. Neither had a SystemSettings write to move.

## Left as they are, with the reason

| Where | Field(s) | Why it stays for now |
|---|---|---|
| `src/lib/boardWriter.js` (2) | `classic_home`, `ui_v2_home` | The board writer itself. The settings writer delegates board fields to it. Foundation file (Anchor 4.1). |
| `src/lib/boardStore.js` (2) | home boards | The canvas's board store; same rules as the board writer. Foundation file. |
| `src/v2/pages/HomeV2.jsx` (2) | first board seed | A machine seed. It must not be stamped as a person's edit, which the writer would do for board fields. |
| `src/lib/homeBoardUnify.js` (1) | board tidy-up | One-time machine tidy-up with its own keep-a-copy plan per row. |
| `src/lib/deviceSyncRunner.js`, `src/lib/backupSkip.js`, `src/lib/trash.js` | sync, backup and trash bookkeeping | Custody code (Anchor 4.1: not touched by the rebuild without a plan). |
| `src/lib/onboardingState.js` | `onboarding` | Already the one write path for its field, fresh read and merge. Fold in later. |
| `src/lib/emotionDistress.js`, `src/lib/goalTree.js`, `src/lib/useTimezoneSync.js` | `distress_emotions`, `goals_planning_category_id`, `timezone` (boot detect) | Already lib writers on a fresh read, single field. Not look. Fold in with step 0.6. |
| `src/lib/pluralStar.js`, `PluralKitConnect.jsx` (5), `SimplyPluralFileImport.jsx`, `OctoconConnect.jsx`, `OpenPluralConnect.jsx` | imported identity fields | Import flows. They want their own tests (import round trip) before moving. |
| `src/pages/HistoryArchive.jsx` | any field (restore) | Restores a snapshot into a named row by id. It must write exactly that row and value, so it can't use the primary-row picker. |
| `TermsSettings.jsx`, `TermsSetupModal.jsx` | terms, command words | Content, not look. Form save of many scalar fields; safe to move next. |
| `NotificationSettings.jsx` (4), `RemindersSettings.jsx` (4) | notification and reminder prefs | Not look. Some build nested objects from cache; move with reminder editing (0.6). |
| `CustomEmotionsManager.jsx` (3) | `emotion_category_names` | Already fresh-read. Not look. |
| `ManageCheckIn.jsx` (4), `AnalyticsAttributionSettings.jsx` (2) | `quick_checkin_sections`, `attribution_default` | Not look. Scalar/whole-value writes; safe to move next. |
| `FrontingTab.jsx` (2) | analytics view prefs | Not look. Patch from cached prefs; needs a function form. |
| `PrivacyLevelsManager.jsx`, `ContactSafetyLabelsModal.jsx`, `BulletinComposerModal.jsx`, `GroceryPanicTapsSettings.jsx`, `DailyTasks.jsx`, `SystemHistory.jsx`, `SystemSwitcherPanel.jsx`, `AssetsLibrary.jsx` | content settings, system name, asset folder rules | Not look. Each is a small move; `AssetsLibrary` merges from a cached row and should get a function form. |
