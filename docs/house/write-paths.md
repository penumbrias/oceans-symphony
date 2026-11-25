# Write paths (house step 0.6, "plumbing out of the walls")

Every room's records save through ONE tested lib module before the room is
rebuilt. Pages call the lib; the lib calls the entity proxy (so `_ft`
stamping, the trash and Recent changes all apply). Record shapes are what
the pages wrote before the move; each test pins them.

Shared test harness: `scripts/lib/entity-harness.mjs` (the real entity proxy
on an in-memory Preview DB, `@/` resolution, stub modules).

| Entity | Lib | Pages moved onto it | Test |
|---|---|---|---|
| JournalEntry | `src/lib/journalEntry.js` | JournalEditorModal, JournalReadBody, ProfileJournalTab, SwitchJournalModal, JournalImportDialog, Journals, QuickCheckInModal, CheckInLog, Sleep log/end/edit modals, v2 notebook widget, logCommands | `test-journal-entry` 10/10 |
| SystemChatMessage / Channel / Category | `src/lib/chatEntry.js` | ChannelView, MeetingDialogue, Chat | `test-chat-entry` 7/7 |
| Bulletin, BulletinComment | `src/lib/bulletinEntry.js` | BulletinComposer, BulletinCommentThread, BulletinCard, BulletinActionMenu, BulletinEditModal, TaskBulletinCard, MentionAlertBanner, taskCreate | `test-bulletin-entry` 10/10 |
| Poll | `src/lib/pollEntry.js` (replaces `pollVote.js`) | Polls, PinnedPollCard, BulletinCard, v2 widgets | `test-poll-entry` 7/7 |
| SystemCheckIn (meetings) | `src/lib/meetingEntry.js` | SystemCheckIn page | `test-meeting-entry` 7/7 |
| SupportJournalEntry, LearningProgress | `src/lib/reflectionEntry.js` | InteractiveExercise, NeedsCheckIn, MyReflections, TopicView | `test-reflection-entry` 4/4 |
| GroundingTechnique | `src/lib/groundingEntry.js` | Grounding (default seeding), CustomTechniqueForm | `test-grounding-entry` 3/3 |
| ActivityGoal | `src/lib/activityGoalEntry.js` | ActivityGoalsPanel | `test-activity-goal-entry` 2/2 |
| Reminder (editing) | `src/lib/reminderEntry.js` | RemindersOnboarding, RemindersManage, ReminderEditorModal | `test-reminder-entry` 4/4 |
| SystemChangeEvent (+ its Alter / AlterRelationship writes) | `src/lib/lineageEvents.js` (`recordLineageEvent`, `setLineageEventHidden`, existing `editLineageEvent` / `deleteLineageEvent`) | RecordSystemChangeModal, SystemHistory | `test-lineage-entry` 5/5 |

## The Day's edit and delete paths (house 3.3, first pull request)

Before any Day screen writes, every edit and delete it needs has a tested
writer. Each one reads the row fresh, writes only the fields the person
changed (against the `baseline` the form opened with, so another device's
change to an untouched field survives), keeps the version before in Recent
changes (`keepEditRestorePoint`, action "edited", restorable from the
archive) and goes through the entity proxy, so `_ft` and `updated_date`
stamp. Deletes go to the trash in ONE batch with what belongs together.
The shared step is `src/lib/recordEdit.js` (`editRecord`, `trashRecords`,
`changedFields`); the restore point's one door is `src/lib/editRestorePoint.js`.

| Entity | Writer | Pages moved onto it |
|---|---|---|
| EmotionCheckIn | `checkinEntry.js`: `editEmotionCheckIn` (emotions restamp `is_distress`; `frontingAlterIds` says who it was for), `editEmotionCheckInNote` (the full grammar; a signpost re-says who), `checkInNoteFields` (the >50-word journal spill), `deleteEmotionCheckIn` (with its symptoms, one batch) | CheckInLog (note edit, delete), QuickCheckInModal edit mode |
| SymptomCheckIn | `checkinEntry.js`: `editSymptomCheckIn`, `deleteSymptomCheckIns`, `syncCheckInSymptoms` (a check-in edit restates its symptoms) | CheckInLog (severity edit, delete), QuickCheckInModal edit mode, v2 log-symptom widgets' Undo |
| SymptomSession | `symptomSessions.js`: `editSymptomSession` (times validated, an end ends it, notes + authors), `endSymptomSession` (one episode), `deleteSymptomSession` | SymptomSessionPopup, CurrentSymptoms (start, notes), SymptomsSection (Undo of a new episode), the "end symptom" notification action |
| Sleep | `sleepEntry.js`: `editSleep` (validated; keeps the planner mirror in step, finds an older night's mirror by bedtime, never invents one; the dream journal link changes only when passed), `deleteSleep` (night + mirror in one batch; the dream journal stays) | SleepEditModal, SleepTracker (delete, discard a running night) |
| Location | `checkinEntry.js`: `editLocation` (logLocation's shape rules), `deleteLocation` | LocationHistory (edit, delete), CheckInLog (delete) |
| DiaryCard | `checkinEntry.js`: `editDiaryCard` (diary fields through `diaryDataToPatch`, the rest kept), `deleteDiaryCardRecord` | DiaryCardEditDialog (and `deleteDiaryCard`, which CheckInLog uses) |
| FrontingSession (who it was) | `frontSessionEdit.js`: `reassignFrontSession`, `undoFrontReassign` | none yet (the Day's session Info, boards 05 F4/F5) |

Test: `node scripts/test-day-entry.mjs` 20/20.

### reassignFrontSession

`mode: "move"` hands `fromAlterId`'s session from `start` to `end` (default:
the whole session; an open end on a running session hands it over from
`start` onward) to `toAlterId`. The session is carved with `ownSessionFor`
(never the grouped shape) and split at `start` and `end` with
`splitFrontSession` (which now returns `{ first, second }`), so level
history carries on as a split does and only the middle piece changes
hands; the original row stays the part before. `mode: "add"` records
`toAlterId` for the stretch too (`addPastFrontSessions`, at the member's
level then). `mode: "remove"` trashes the stretch. Times are validated, and
a member who already has fronting overlapping the stretch is refused (no
double-counted time).

`carryPayload` (default `true`, the recommendation in 3.3 question 3,
pending the owner's answer): notes whose own timestamp falls in the stretch
go with it; the session-level feelings, symptoms and trigger belong to the
session's start and go with the stretch when it begins at the start. With
`false` they stay on the original member's remaining part; when the whole
session is handed over there is no such part, so they travel anyway
(nothing is dropped). "remove" keeps them on the remaining part, or trashes
them with the row when the whole session goes. Records that point at the
session (a switch journal's `fronting_session_id`) keep pointing at the
original row.

Restoring: the session as it was (after the carve) is in Recent changes;
restoring it there brings back its times, member and notes, but the pieces
the split made stay (remove them from history). `undoFrontReassign(result)`
puts everything back at once (pieces to the trash, the trashed stretch
restored, the original row's fields back) and is what the Day's Undo calls.

### Left on purpose

- `SymptomsSection` appends a severity snapshot to a running episode
  without a check-in (the check-in's symptom row); `rateSymptomSession` also
  logs a point check-in, so swapping would change what it records.
- Catalogue merges (`legacyCatalogueMigration.js`, `symptomDefaults.js`)
  re-point `symptom_id` in bulk; `frontingUtils.js` closes zero-length
  episodes in its repair sweep.
- `planner/linkedSleep.js` keeps a night in step with its activity from the
  planner side (best-effort mirror of an activity write).
- `SleepLogModal` creates a past night (a create, not an edit).
- Status notes (`updateStatusNote` exists; the Check-in log's status delete
  still calls the proxy) and the session payload editors (`PerAlterEntryEditor`)
  are outside this step.

### Fixes that came with it

- `logSymptomCheckIns` no longer stores the caller's per-row
  `frontingAlterIds` key as a stray extra field on each SymptomCheckIn (the
  real `fronting_alter_ids` was always written too; old rows keep it).
- A night's wake time before its bedtime is refused instead of saving a
  negative length.
- Editing a check-in, a symptom entry or episode, a night, a place or a
  diary card now keeps the version before in Recent changes ("Edited", with
  Restore), as alter edits already did.

Sweep used:

    grep -rnE "\b(EmotionCheckIn|SymptomCheckIn|SymptomSession|Sleep|Location|DiaryCard)\.(update|delete|bulk[A-Za-z]+)\(" src

## Fixes that came with the move (no record shape changed)

- Whispers: a whisper bulletin's and comment's "authored" MentionLog row, and
  a meeting step's whisper notices, now store `WHISPER_PREVIEW`, never the text.
- Poll votes and tally decrements read the poll fresh, so a stale copy can't
  drop someone else's vote. Bulletin reactions do the same.
- Notices are best-effort after the save, so a failed notice never makes a
  retry save the record twice.
- A newly saved meeting clears its draft (it used to come back as a draft
  that could be saved again), and a double tap can't save two meetings.
- A lineage absorption merge appends onto a fresh read of the alter that
  persists, so an edit made while the modal was open isn't overwritten.

## Left on purpose (not page writes)

- Importers: OpenPluralConnect, SimplyPluralFileImport, OctoconConnect,
  `pluralStar.js`, `floralityImport.js`. They map foreign records in bulk.
- Existing lib paths: `remindersScheduler.js` (firing bookkeeping and
  one-time migrations), `chatCategories.js`, `chatCleanup.js`.

Sweep used:

    grep -rnE "\b(JournalEntry|SystemChat(Message|Channel|Category)|Bulletin|BulletinComment|Poll|SystemCheckIn|SupportJournalEntry|LearningProgress|GroundingTechnique|ActivityGoal|Reminder|SystemChangeEvent)\.(create|update|delete|bulk[A-Za-z]+)\(" src

Only the libs above and the exceptions listed show up.

## Concerns for later rooms

- A deleted chat message is a placeholder (`content: ""`, `deleted_at`), as
  before; the text survives only in Recent changes' snapshot.
- `LearningProgress` is `TRASH_INSTANT` but holds a topic's notes. The lib
  never deletes one, but a future delete would lose notes outright.
- Not yet covered: the SystemSettings look writer (Anchor 4.3), the
  HiddenUnblendQuestion curation, and entities outside this list
  (ReminderInstance acting, GroundingPreference, DiaryTemplate, etc.).
