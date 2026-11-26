# Room checklist: the new house

The contract that nothing gets lost while the house is rebuilt (plan step 0.2, "Rulers"). Built from Anchor's room inventory (`audits/new-house-2026-11/team/anchor.md` §2), the function tree (`docs/function-tree.md`, leaf numbers in brackets) and the plan's phases (`plan.md` §7). Write paths were checked against the code on `claude/project-thread-nq1rwa` (v0.380.4).

## How to use it

- **Every pull request that moves a room ticks its rows here.** A room with no new home blocks the merge.
- **Status** moves one way: `old` (only the old page has it) → `in new frame` (the old page opens inside the new frame, Phase 2) → `rebuilt` (the new room has it, on kit blocks) → `done` (the room passes the sixteen checks, the walk and the budget, has its tour and help entries, and its old twin is listed for removal).
- A room is retired only when **every function in its row** is reachable in the new house. The rule is per function, not per page (Penumbra, 2026-11-20: never remove working functions).
- **Write path** is the one lib writer every house must call. `MISSING: page writes directly` means the record is still written from UI files; step 0.6 moves it into a tested lib writer **before** the room is rebuilt, and the row's write path is updated then.
- **No stored record changes shape.** Old settings are read and translated (0.5), never migrated. Deletes go only through the cascades that exist today.
- The rulers: `npm run check:budget` (size), `npm run walk -- <port>` (every route, three sizes, both looks). Baselines: `audits/new-house-2026-11/baseline/`.

Phase key: **0.4** one settings writer · **0.5** paint translator · **0.6** plumbing out of the walls · **3.1** fire exit · **3.2** waking up · **3.3** the Day · **4.1/4.2** edit mode · **5.1** keeping commitments · **5.2** writing and talking · **5.3** who we are · **5.4** looking back · **5.5** the house itself · **—** below the floor, never rebuilt.

---

## A. Who we are

| Room (routes) | Functions | Records | Write path | New home | Status |
|---|---|---|---|---|---|
| Alters directory (`/Home`) | Browse, search, grid/list, folders and subsystems, anonymize mode, archive view [1.1, 1.2.1, 8.8.2] | Alter, Group | reads; writes via `alterEntry.js`, `groupMembership.js` | 5.3 | rebuilt (5.3: Alters room, board 03: Groups tree, the floor of cards with Grid · List · Tree, Info for one, several or the system, status line; Find, Sort and every old option in ⋯ with the old page's keys; phone stacks; Tree and the sheets are the shared old ones) |
| Alter profile (`/alter/:id`) | Core identity, pictures and image pools, bio pages, custom fields, preferences and boundaries, important dates, archive, pin, merge, duplicate detection, profile prompts [1.1.1–1.1.8] | Alter, CustomField | `alterEntry.js` (`createAlter`, `saveAlterEdits`, `patchAlterCustomFields`, `deleteAlter`), `alterMerge.js`, `alterRoles.js`, `alterInfoEntries.js` | 5.3 (profile = the board only) | rebuilt (5.3: Alters room, board 12: header, Profile · Notes · Fronting · Links + More, About, Custom fields, the week, Relationships, Groups; phone Info in the header and Edit page · Profile style · Write note; every old ?tab= lands; the inner tabs and the Info form are the shared old ones) |
| Profile pages as boards (alter, group, contact, place) | Per-profile layout, default layouts, bulk "use for all", reset | ProfileBoard | `boardStore.js` / `profileBoard.js`, `profileBoardBulk.js` | 5.3, arranged in 4.2 | old, kept reachable (the Alters room opens the alter's own layout as it is under "Your own layout"; group, contact and place profiles are not rebuilt) |
| Groups and subsystems (`/groups`, `/group/:id`) | Nested folders, group profile, group notes and posts, re-parenting, orphan rescue, subsystem ownership [1.2.1, 1.2.2] | Group, GroupNote | `groupMembership.js`, `groupTree.js`, `deleteGroupCascade`, `groupNotes.js` | 5.3 | old |
| Relationships | Typed edges, direction, strength, type catalogue [1.2.3] | AlterRelationship, RelationshipType | `alterRelationships.js`, `relationshipTypes.js` | 5.3 | old |
| System history / lineage (`/system-history`) | Fusion, split, dormancy, return, emergence; year-only dates; splits create relationships; absorption [1.3.1, 1.3.2] | SystemChangeEvent (+ Alter, AlterRelationship) | MISSING: page writes directly (`RecordSystemChangeModal`, 7 direct Alter writes) → 0.6 | 0.6, then 5.3 | old |
| New presences (`/presences`) | Record sightings, similarity suggestions, merge, promote to member [1.3.3] | Presence | `presenceEntry.js` (`createPresence`, `notePresenceSighting` onto a fresh read, `updatePresence`) | 5.3 (an unblend "someone new" answer can record one, 3.1) | old |
| Inner world (`/system-map`, `/location/:id`) | Maps and layers, places, links between maps, place profiles, member placement, list equivalent [1.4.1–1.4.4] | InnerWorld* (InnerWorldLocation, maps, layers, placements) | `innerWorldModel.js` | 5.3 | old |
| System identity, multiple systems | Name, bio, avatar, banner, birth date; independent systems on one device [1.2.4, 13.3] | SystemSettings, registry | `systems.js`; settings fields via the one look writer (0.4) | 5.5 | old |
| Assets (`/assets`) | Picture and file library, folders, owned folders, reuse [12.5, 13.6] | ImageAsset, AssetFolder | `assetFolders.js`, `alterImageUpload.js`, `songUpload.js`; 4 UI files still write ImageAsset → check in 0.6 | 5.3 | old |

## B. Who is here now

| Room (routes) | Functions | Records | Write path | New home | Status |
|---|---|---|---|---|---|
| Set front / co-front / levels | Concurrent sessions, primary, one-gesture add/remove/replace, session notes/feelings/symptoms [2.1.1–2.1.3] | FrontingSession | `setFront.js` (`applyFrontSelection`, `changeFront`) | 3.2 (with the handover card) | rebuilt (Set front sheet, board 47: the house draws SetFrontSheet's board layout in its own paint whatever the look; on a phone full screen under board 47's "‹ Set front" header down to the bottom zone; Alters · By group · New presence, search, sort, grid, levels and hold-to-level, remove, trigger, Unsure (the presence path and Just clear), switch journal; insides of the tree, grid cards and presence form are the shared old ones) |
| Switch context | Trigger categories, switch journal, flag-as-triggered later [2.1.4] | FrontingSession, TriggerType, JournalEntry | `triggerCategories.js` (`triggerPatch`); switch journal: MISSING (JournalEntry) → 0.6 | 3.2 | old |
| Front history editing | Edit, split, end, remove, add past sessions; stale-open review; duplicate cleanup; front conflicts [2.2.1, 2.2.2] | FrontingSession | `frontSessionEdit.js`, `reconcileActiveFront`, `frontConflicts.js` | 3.3 (on the Day) | old |
| Inferred presence (opt-in) | Derive presence from authored content [2.2.3] | MentionLog (authored trail) | read only | 3.3 (a Day layer) | old |
| Help me unblend (`/unblend`) | Guided question flow, ranked candidates, skip/shuffle [2.3.1] | UnblendQuestion, HiddenUnblendQuestion | `getToKnowMeWriteback.js` | 3.1 (fire exit) | rebuilt (3.1: board 38; same engine, `useUnblendSession.js`; front through `changeFront`; question delete to the trash with Undo) |
| Get to know me (`/get-to-know-me`) | Answer while grounded, write answers back to fields [2.3.3, 1.1.8] | UnblendQuestion, Alter | `getToKnowMeWriteback.js` | 5.3 (shares the question engine with unblend) | old |
| Question curation (`/unblend/questions`) | Write, hide, customize, restore questions [2.3.2] | UnblendQuestion, HiddenUnblendQuestion | MISSING: page writes directly (curation UI, 2 + 1 files) → 0.6 | 0.6, then 5.3 | old |
| Front tracking off | Attribution falls back to authorship; swatch shows the system [2.4] | SystemSettings (`attribution_default`) | settings writer (0.4) | 2.1 frame, every room | old |

## C. Capture the moment

| Room (routes) | Functions | Records | Write path | New home | Status |
|---|---|---|---|---|---|
| Quick check-in | Feelings (multi, per-emotion attribution, intensity, distress flag), symptom points, distress → support [3.2.1, 3.2.2, 8.5] | EmotionCheckIn, SymptomCheckIn, CustomEmotion, SymptomDefinition | `checkinEntry.js` (`logEmotionCheckIn`, `logSymptomCheckIn(s)`); catalogues: CustomEmotion MISSING (6 UI files) → 0.6 | 3.2 (Do sheet, no-typing path) | rebuilt (Quick check-in sheet, boards 16 and 17: the house draws QuickCheckInModal's board layout in its own paint whatever the look, from every door (frames, Home, old hosts, the log's edit, the timeline, reminder toasts); the eight hideable sections, Wheel \| List on the Feeling head, roots, crumb, + my own, the side rating, hold a feeling → "Who feels X?" with Match the check-in and Clear (nobody); on a phone the sheet stops at the bottom zone or the keyboard; the other sections' insides are the shared old ones) |
| Symptom episodes | Running episodes, ratings [3.2.2] | SymptomSession | `symptomSessions.js`, `rateSymptomSession` | 3.2 | old |
| Manage check-in (`/manage-checkin`) | What you track: emotions, symptoms, catalogue updates, presets [3.5] | CustomEmotion, SymptomDefinition, DiaryTemplate | MISSING: page writes directly (CustomEmotion, DiaryTemplate) → 0.6 | 5.5 | old |
| Status notes | Immutable log, full grammar, signposts [3.2.3] | StatusNote | `saveStatusNote` / `updateStatusNote` (checkinEntry.js) | 3.2 | old |
| Locations (real world) | Category, name, optional GPS, "who" rule [3.2.4] | Location | `logLocation` | 3.2 capture; history in 5.4 | old |
| Sleep (`/sleep`) | Start/end, quality, interruptions, dream link, planner "Sleep" mirror [3.2.5] | Sleep (+ Activity, JournalEntry) | `sleepEntry.js` (`startSleep`, `endSleep`, `mirrorSleepActivity`) | 3.2 capture; nights on the Day 3.3 | old |
| Company | Time with outside people, start/end, last seen [3.2.7, 7.3] | ContactEncounter | `contactEncounters.js` | 3.2 | old |
| Medications and doses (`/medications`) | Medication list, doses taken, dose reminders | Medication, MedicationDose | `medications.js` | 3.2 (doses), 5.1 (the list) | old |
| Diary cards (relic) | User-templated daily card [3.2.8] | DiaryCard, DiaryTemplate | `logDiaryCard` (`diaryData.js`) | 3.3 (folds into check-in sections on the Day) | old |
| System meeting (`/system-checkin`) | Stepped group check-in, per-participant entries, dialogue [3.2.9] | SystemCheckIn (+ check-ins, front) | MISSING: page writes directly (must route through `checkinEntry` and `setFront`) → 0.6 | 0.6, then 5.2 | old |
| Inline grammar | `~commands`, signposts, whispers, @mentions in every text field [3.4] | MentionLog + target records | `authoredText.js`, `logCommands.js`, `commandTerms.js` | 1.2 kit (authored-text field), every room | old |

## D. Keep commitments

| Room (routes) | Functions | Records | Write path | New home | Status |
|---|---|---|---|---|---|
| Planner (`/planner`) | Plans with lifecycle, recurrence (three branches), reschedule history, critical pins, unresolved surfacing [4.1.1–4.1.4] | Activity | `activityEntry.js`, `planCreate.js`, `planner/resolvePlan.js`, `recurrenceUtils.js` | 5.1 (views over the Day's layers) | rebuilt (5.1: Planner room, board 04: Day · Week · Month · Year · Plans list in one row, the week's time columns with drag to plan or log, drag to move and resize (`moveActivityTime`, Undo), the all-day row (events, profile dates, untimed plans, to-dos), month, Categories, This week, Goals, Needs a decision (Done · Partly · Skipped · Move · Called off), Plans list with Select several, Insights, Options (overlays, clock, week start, hour height); the editor and details sheets are the shared old ones) |
| Activities (`/activities`) | Past logs, live timers, nested category tree [3.2.6, 4.5] | Activity, ActivityCategory | `activityEntry.js`, `activitySession.js`, `activityCategoryEntry.js`; 5 UI files still write ActivityCategory → check in 0.6 | 5.1 | old |
| Dated events | Payday, birthdays, events with pre-alerts | PlannerEvent | `plannerEvents.js` | 3.3 (Day layer), 5.1 | rebuilt in the Planner room (5.1: all-day row, month and year rings, + Event, Events coming up; the event sheet is the shared old one) |
| To-do (`/todo`) | Priority, due dates, subtasks, quantities, pinning, linked plans [4.2] | Task | `taskCreate.js` (`deleteTask`), `linkedCompletion.js` (`setTaskCompleted`) | 5.1 | old |
| Routines (`/tasks`) | Templates by period, 36 auto-triggers, points, levels, streaks, period review [4.3] | DailyTaskTemplate, DailyProgress, TaskTick | `dailyTaskSystem.js`, `toggleDailyProgressTasks`, `toggleTemplateDone` | 5.1 | old |
| Weekly activity goals | Time targets per category [4.4] | ActivityGoal | MISSING: page writes directly (`ActivityGoalsPanel`) → 0.6 | 0.6, then 5.1 | old |
| Needs (`/needs`) | Wishes, turns | Wish, TurnAgreement | `wishes.js` | 5.1 | old |
| Notebook (`/goals`) | Goal pages, steps, writing sessions, flash cards | Goal, GoalStep | `goalTree.js`, `goals.js`, `goalWriting.js` | 5.1 | old |
| Notes and lists (`/notes`) | Lists, the panic-cover grocery list [8.8.1] | GroceryList, GroceryItem, GroceryFavorite | `noteLists.js` | 5.1 (cover stays in the frame, 2.1) | old |
| Reminders (`/reminders`) | Rule types, respectful behaviour, plan alerts, delivery lanes, follow-through [10.1–10.5] | Reminder, ReminderInstance | 4 schedulers (`nativeReminderScheduler`, `planReminderScheduler`, `remindersScheduler`, medication/event); editing MISSING: page writes directly (`ReminderEditorModal`, `RemindersManage`, `RemindersOnboarding`) → 0.6 | 0.6, then 5.1 | old |

## E. Writing

| Room (routes) | Functions | Records | Write path | New home | Status |
|---|---|---|---|---|---|
| Journals (`/journals`) | Rich text, titles, tags, single/co-authors, mentions, folders, switch logs, dream entries, locked entries, search, author and fronter filters, drafts [5.1–5.5] | JournalEntry | `journalEntry.js` (`test-journal-entry`); readers `journalAuthors.js`, `journalDate.js` | 5.2 | rebuilt (5.2: Write room, board 05: Journals panel with Find, folders, {Switch} journals and entries; the entry on its page; Info: this entry and What this entry did; status line; Edit draws the old editor in place; phone stacks, the entry opens with Info in the header and Edit entry · New entry as the bar; Lock on a saved entry not yet, see building code §20) |
| Learn reflections, safety plan sections | Reflections from lessons, needs checks [5.3, 8.6, 8.7] | SupportJournalEntry, LearningProgress | MISSING: page writes directly (3 + 1 files) → 0.6 | 0.6, then 3.1 (safety plan) and 5.2 | old |
| Text templates | Reusable text, folders | TextTemplate, TextTemplateFolder | `textTemplates.js` | 5.2 | old |
| Alter notes, board, inbox; group and contact notes | Per-member notes, board messages, private inbox, group/contact notes [6.4] | AlterNote, AlterMessage, GroupNote, ContactNote | `alterNotes.js`, `alterMessages.js`, `groupNotes.js`, `contactNotes.js` | 5.2 | old |

## F. Talking inside

| Room (routes) | Functions | Records | Write path | New home | Status |
|---|---|---|---|---|---|
| Chat (`/chat`) | Channels, categories, ordering, signposts, whispers, private channels, replies, threads, reactions, pins, edit, soft delete [6.1] | SystemChatMessage, SystemChatChannel, SystemChatCategory | `chatEntry.js` (`test-chat-entry`); `chatCategories.js` for the tree | 5.2 | rebuilt (5.2: Write room, board 14: boxed channel tabs, the stream and the composer above the bottom bar, # opens the channel list, private gate kept; computer: Channels · the channel · Info and Writing here; the stream, composer and channel dialog are the shared ones; threads, reactions and pins are not in the app yet) |
| Bulletins (`/bulletins`, `/bulletin/:id`) | Posts, comments at any depth, reactions, pins, task posts [6.2] | Bulletin, BulletinComment | MISSING: page writes directly (Bulletin 8 files, comments 1; `taskCreate.js` only for task posts) → 0.6 | 0.6, then 5.2 | old |
| Polls (`/polls`) | Per-member or anonymous votes, multi-voter, option editing with vote protection [6.3] | Poll | `pollVote.js` for votes; create/edit MISSING: page writes directly (5 files) → 0.6 | 0.6, then 5.2 | old |
| Notifications / mentions inbox | One inbox, source links, dismiss, oriented landing [6.5, 14.3] | MentionLog | `mentionNotices.js` (`dismissMention`) | 2.1 frame (status bar), 3.2 handover | old |

## G. Outside people

| Room (routes) | Functions | Records | Write path | New home | Status |
|---|---|---|---|---|---|
| Contacts (`/contacts`, `/contacts/:id`) | Directory, categories, custom fields, archive, safety and awareness levels, boundaries, emergency dial [7.1, 7.2, 7.4] | Contact* | `contacts.js`, `contactFields.js`, `deleteContact` | 5.3 (emergency dial also in 3.1) | old |
| Friends (`/friends`) | Codes, tiered disclosure, presence sharing, E2E, inbound hygiene [11.1] | FriendIdentity (device-bound) | `friendsApi.js` | 5.3 | old |

## H. Get through the hard moment (latency-critical)

| Room (routes) | Functions | Records | Write path | New home | Status |
|---|---|---|---|---|---|
| Support and grounding (`/grounding`) | One-tap access, technique catalogue, guided runs, ratings, favourites, per-member attribution [8.1, 8.2] | GroundingTechnique, GroundingPreference | `groundingPreferences.js`; techniques MISSING: page writes directly (2 files) → 0.6 | 3.1 | rebuilt (3.1: board 15; favourites, ratings, notes through `groundingPreferenceHandlers`; new techniques through `CustomTechniqueForm`) |
| Breathing | Paced exercises with visual guide [8.3] | — | — | 3.1 | rebuilt (3.1: `?view=breathing`, the old exercise inside a house panel) |
| State check | "What do I need right now", suggestions, crisis resources [8.4] | — | — | 3.1 | rebuilt (3.1: `?view=need`, suggestions and crisis lines) |
| Safety plan (`/safety-plan`) | Warning signs, coping cards, tolerance window; written where it is read [8.6] | SupportJournalEntry | MISSING (see Learn reflections) → 0.6 | 3.1 | rebuilt (3.1: board 39; reads only, Edit opens the lesson that owns the answers) |
| Emergency info and card (`/emergency`) | Card for a helper, deliberate way back | EmergencyInfo | `emergencyInfo.js`, `medications.js` | 3.1 | rebuilt (3.1: boards 40 and 41; `?show=1` is the card, Back/Escape the way out; writes through `saveEmergencyInfo` and `EmergencyInfoSheet`) |
| Crisis resources, floating support button | Always current, not-medical disclaimer [8.9] | — | — | 3.1, button into the frame zones 2.2 | in new frame (2.2: Support is the phone bar's last place; the bubble is not drawn in the house) |
| Support over a room's open dialogs | Support one tap away with any of the room's dialogs or sheets open; typing kept where the room keeps drafts [§14] | — | Radix primitives: done in the frame (Phase 2 fixes, `walk --dialogs`). Each room: replace hand-made `fixed inset-0` overlays with kit sheets or the primitives; give Support a keyboard and screen-reader path while a modal is open | every Phase 3 room | partly (Radix dialogs, sheets, confirms, drawers) |
| Panic cover | Quick-taps open a working decoy, usable before unlock [8.8.1] | GroceryItem, GroceryFavorite | `noteLists.js` | 2.1 / 2.2 frame | old |
| Lock screen | Unlock, panic cover before unlock [8.8.3] | — (storage mode) | — | 3.1 (look only; boot path untouched) | old |
| Learn (psychoeducation) | Lessons, reflections, needs checks [8.7] | LearningProgress, SupportJournalEntry | MISSING → 0.6 | 3.1 (reached from Support), 5.2 for reflections | rebuilt (3.1: Learn panel on Support, `?tab=learn` opens the lessons inside the room) |
| Sounds | Nature sounds, soundscape, own sounds | ImageAsset + localStorage | `natureSounds/ownSounds.js`, `naturePrefs.js` | 3.1 | rebuilt (3.1: Nature sounds tile, `?view=soundscape|nature|scratchpad`, now-playing bar) |

## I. Look back

| Room (routes) | Functions | Records | Write path | New home | Status |
|---|---|---|---|---|---|
| Timeline (`/timeline`), timeline dock, timeline widget | Any day rebuilt across every record type, layers, infinite backscroll [9.1, 3.3] | readers | read only; session edits via `frontSessionEdit.js`, plans via `resolvePlan.js`, episodes via `symptomSessions.js` | 3.3 (one Day, lane view) | rebuilt (3.3: Timeline room, Day · 6 hours · Week, Whose, layers incl. meds and "everything else", Info with Edit/Split/End/It wasn't…/Remove, Add, Tally, landings; Home's dock draws the same parts; the timeline widget is still old) |
| Check-in log (`/checkin-log`) with its daily summary, tally, Day review | The record, filterable, editable after the fact; daily summary (keep, Penumbra) [3.3] | readers (edits through the capture writers) | read only; edits via `checkinEntry.js` | 3.3 (list and summary views) | old |
| Analytics (`/analytics`) | Baselines, presence, wellbeing, life, per-member patterns, observations [9.2–9.7] | readers | read only | 5.4 | old |
| Therapy report (`/therapy-report`) | Sections, detail levels, pruning, anonymize, PDF/text, saved templates, export log, therapy notes [9.8] | ReportTemplate, ReportExport, TherapyNote | MISSING: page writes directly (`TherapyReport.jsx` via `db.ReportTemplate`); TherapyNote via `logCommands.js` → 0.6 | 0.6, then 5.4 | old |
| Location history (`/location-history`) | Log plus history split, maps link | Location | `logLocation` | 5.4 | old |
| Recent changes (`/history`) | Undo history, "Changed by sync", restorable layouts | HistoryEvent | entity layer; removal refused by the time lock | 5.4 (and the History tab, 2.1) | old |
| Search | Every record type, custom fields, natural dates, oriented landing, private-channel rule [9.9] | readers | `globalSearch.js` | 2.1 frame (top bar), 5.4 | old |

## J. Belong to the person (paint, trim and behaviour)

| Room | Functions | Records | Write path | New home | Status |
|---|---|---|---|---|---|
| Terms and command words | Core terms, derived forms, command symbol and words [12.1] | SystemSettings | settings writer (0.4); `commandTerms.js` | 5.5 | old |
| Appearance, Display options, fonts, icons | Themes, light/dark, fonts, corners, accents, readability guard [12.2] | SystemSettings, localStorage, CustomFont | 0.4 (one look writer), read by 0.5 (translator); CustomFont MISSING (2 UI files) | 0.4, 0.5, then 5.5 (one Appearance) | old |
| Page looks, profile looks, widget looks, presets, look history | Per-page backgrounds and songs, `PS.*` profile styling, widget looks, presets, linked themes [12.5, 12.6] | SystemSettings, Alter/Group custom fields, board settings | `writePageLook`, `profileStyle.js`, `widgetLook.js`, `presetSync.js` | 0.5, then 5.5 | old |
| Layout and navigation | Bars, grid, docks, per-screen view prefs [12.3] | SystemSettings (`navigation_config`, `ui_v2`…) | `barsModel.js`; kept in the data, ignored by the new house (plan §5) | 4.1 (new arrangements field) | old |
| Home boards (`/`) | Widget boards, pages, styles, "Home opens on" | SystemSettings (`classic_home`, `ui_v2_home`) | `boardWriter.js`, `stampBoardChanges` | 3.2 (Home with Now; old boards are pages of Home), 4.2 | old |
| Quick actions | One-tap actions, command keys [12.4] | QuickAction, `ui_v2.commandKeys` | MISSING: page writes directly (1 file) → 0.6 | 2.2 (Do sheet) | in new frame (2.2: the Do sheet runs the same quick actions; the write path is still 0.6) |
| Accessibility | Text scale, reduce motion, high contrast, touch size, single column [12.7] | localStorage (`BACKUP_LS_KEYS`) | `useAccessibility.js` | 1.1 kit, every room | old |
| Setup, Tour, wiki | First run, setup card, tour, page tutorials, example systems [14.1, 14.2] | SystemSettings.onboarding | `onboardingState.js` | 5.5 | old |
| Mods (`/mods`, `/mod/:modId/:pageId`) | Sandboxed mod pages and data | ModPackage, ModData | `mods/modStore.js`, `mods/broker.js` | 5.5 | old |

## K. Custody (below the floor: never rebuilt)

Storage modes and encryption, unlock, recovery, multiple systems, backups and auto-backup, device sync, the native and desktop file mirror, trash and the time lock, the Data inspector, imports from six formats and exports [13.1–13.6, 11.2–11.4]. Only their **screens** move, in 5.5; their code is untouched (`anchor.md` §4.1).

| Screen | New home | Status |
|---|---|---|
| Backup and restore, auto-backup, device sync, systems, trash, Data inspector, imports and exports | 5.5 | old |
| Welcome, unlock, recovery screens (boot path untouched; Support reachable from each, 3.1) | 3.1 look only | old |

## Every route, and its room

| Route | Room | New home |
|---|---|---|
| `/` | Home boards | 3.2 |
| `/Home` | Alters directory | 5.3 |
| `/alter/:id` | Alter profile | 5.3 |
| `/contacts`, `/contacts/:id` | Contacts | 5.3 |
| `/settings` | The house itself | 5.5 |
| `/analytics` | Analytics | 5.4 |
| `/journals` | Journals | 5.2 |
| `/diary` → `/checkin-log` | Check-in log (redirect) | 3.3 |
| `/tasks` | Routines | 5.1 |
| `/todo` | To-do | 5.1 |
| `/groups`, `/group/:id` | Groups and subsystems | 5.3 |
| `/location/:id` | Inner world place | 5.3 |
| `/assets` | Assets | 5.3 |
| `/system-checkin` | System meeting | 5.2 |
| `/activities` | Activities | 5.1 |
| `/sleep` | Sleep | 3.2 / 3.3 |
| `/timeline` | Timeline | 3.3 |
| `/system-map` | Inner world | 5.3 |
| `/presences` | New presences | 5.3 |
| `/bulletins`, `/bulletin/:id` | Bulletins | 5.2 |
| `/unblend` | Help me unblend | 3.1 |
| `/get-to-know-me` | Get to know me | 5.3 |
| `/chat` | Chat | 5.2 |
| `/unblend/questions` | Question curation | 5.3 |
| `/manage-checkin` | Manage check-in | 5.5 |
| `/grounding` | Support and grounding | 3.1 |
| `/safety-plan` | Safety plan | 3.1 |
| `/therapy-report` | Therapy report | 5.4 |
| `/reminders` | Reminders | 5.1 |
| `/polls` | Polls | 5.2 |
| `/checkin-log` | Check-in log | 3.3 |
| `/system-history` | System history | 5.3 |
| `/history` | Recent changes | 5.4 |
| `/location-history` | Location history | 5.4 |
| `/friends` | Friends | 5.3 |
| `/planner` | Planner | 5.1 |
| `/goals` | Notebook | 5.1 |
| `/notes` | Notes and lists | 5.1 |
| `/needs` | Needs | 5.1 |
| `/medications` | Medications | 5.1 |
| `/emergency` | Emergency info | 3.1 |
| `/mods`, `/mod/:modId/:pageId` | Mods | 5.5 |
| `/privacy` (full page load only; in-app it hits the old 404 wall) | Privacy | 0.3 (wall replaced), 5.5 |
| any unknown path | The old "Page not found" wall | 0.3 (replaced by an in-frame "this room moved" page) |

## Same room, built more than once

These fold into one room with views (plan decision 4). Every record and every function stays.

| One job | Built today as | One room in the new house |
|---|---|---|
| The day's record | Timeline page, timeline dock, timeline widget, Planner day, Check-in log, Diary cards, Day tally, Day review | The Day (3.3), with lane, list and summary views and layers |
| Something to do | Planner, Activities, To-do, Routines, Notebook steps, Notes and lists, reminders, doses | Things on the Day; Plan & do is the arranging views (5.1) |
| Home | `Dashboard` + `classic_home`, `ExperimentalDashboard` + `ui_v2_home`, legacy `experimental_home`, `dashboard_layout` | One Home with Now; old boards are pages of it (3.2) |
| The frame | `AppLayout`, `V2Frame`, `PixelChrome` | One frame (2.1, 2.2) |
| Look editors | Appearance, Display options, profile style, page looks, widget Look tab, home styles, presets | One Appearance with scopes (5.5) |
| Who's here | Help me unblend, Get to know me | Two doors on one question engine (3.1, 5.3) |
| Quick capture | Left Quick rail, floating quick bar, quick actions tray | The Do sheet and the tool rail (2.2) |
| Right-hand panel | Page help in the inspector slot, Journals' own Info inspector | One right dock: Info, Layers, History, Help (2.1) |
| "Location" | Real-world Location vs inner-world place | Both kept, named apart |

---

## Later

Ideas that are not in the plan's phases, kept here so they are not lost between rounds. Each needs Penumbra's say before it is built.

### Declined in plan §10

- **"Who woke up?" on the first open of each day** (Spark). A question that interrupts opening the app; needs Lantern's review and Penumbra's say first.
- **The evening door** (Spark): System meeting, a journal prompt and Day review offered together from the Day's evening edge. A new feature, easy once the Day exists.
- **Returning from the emergency card never needs the password** (Spark). Declined: the way back follows the person's own lock setting; privacy is their choice. Listed so it is not raised again without that context.
- **"Light" moved wholly to Tide** (review). Declined: kept as check 15 with a number from the budget script, so every builder sees it.

### Spark's later ideas

- **"Your usual" behind the Day** (onion skin): the analytics baselines drawn faintly behind today, so an unusual day shows without visiting Analytics.
- **Search that also captures**: typing a command (`~feeling calm`) in the search box logs it; one box finds and captures.
- **A materials drawer**: Assets, text templates, grounding techniques, profile songs and soundscape tracks in one "things you reuse" drawer.
- **A layout per alter**: the workspace arrangement follows who is in front, as linked themes already do.
- **Outer and inner places on one map**: Location history and the inner-world map as two layers of one map document.
- **Eras as timeline tags**: System History's lineage events laid on the long timeline as named ranges.
- **Phone: no open-pages strip**; recent pages behind a long-press on the title instead.
- **Floating panels** (Clip Studio style): docked only at first (plan decision 7); added later if missed.
- **One "Who's here?" flow** merging unblend, Get to know me and presences. The plan keeps both doors on one engine; a full merge stays on this list.

### Raised by others, parked

- **A new storage format** (Tide, Anchor): the whole-blob save will cost more past 40 MB. A separate, later project with its own seven-scenario check, never part of this rebuild.
