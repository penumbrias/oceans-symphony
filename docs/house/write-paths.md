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
