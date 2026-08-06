# Tasks / Plans / Daily-tasks Consolidation — Proposal (no code yet)

*Written 2026-08-04, per the owner's decision: proposal first, code after sign-off.
Everything in "Current state" was re-verified against the code the day this was written.*

## Why this document exists

"Completing a quick task is basically completing a to-do" — but the app treats
them as strangers. The same intent (do a thing, plan a thing, tick a thing off)
is implemented several times over, each copy with its own look, its own fields,
and its own bugs. The activity-capture half of this was already consolidated in
v0.113.1 (the quick-action Start Activity is now the canonical Log Activity
modal opened in Active mode, −144 lines). This proposal is the remaining, larger
half.

## Current state (verified)

**Five ways to create a task/plan, four of them parallel implementations:**

| Path | Creates | Notes |
|---|---|---|
| `QuickTaskComposer` (bulletin board / classic dashboard) | `Task` + companion `Bulletin` `[task:<id>]` | Own composer UI |
| `TaskFormModal` (To-Do List) | `Task` | Mentions + subtasks; different field handling from the quick composer |
| `QuickPlanComposer` (bulletin board) | `Activity` (scheduled) | Plan-creation logic duplicated with… |
| `ActivityPlanModal` (Activity Tracker) | `Activity` (scheduled) | …its two internal branches — the create path exists in triplicate |
| `QuickAction` `add_task` | bare `Task` | Minimal fields |

**The Task↔Activity link is one-way and completion never syncs.**
`Activity.task_id` pushes the plan's date into `Task.due_date` — and that's all.
Ticking the to-do leaves the plan nagging forever in `UnresolvedPlansCard`;
resolving the plan leaves the to-do open. This is the owner's core pain, verbatim.

**One to-do can render on five surfaces simultaneously** (ToDoList,
DashboardPins, TaskBulletinCard, the synthetic ActivityTracker block, the
AppLayout 72-hour badge), with bespoke dedup logic only in DashboardPins.

**No reschedule affordance where you need it.** `UnresolvedPlansCard` offers
Start/Done/Partial/Skipped/Cancelled but no Reschedule; the only reschedule
lives in `ActivityLifecyclePopover` behind a long-press. Nothing implements
bullet-journal-style carry-over.

**Four independently-written `DailyProgress` toggle merges** — in
`DailyTasks.jsx`, `PinnedDailyTasksWidget`, `QuickActionsMenu`, and
`useDailyCheckInOnOpen`. Four copies of the same read-merge-write is four
places for the next merge bug.

## Proposed changes, in order

Each phase is shippable alone; each is one release.

### Phase 1 — Completion sync across `Activity.task_id` (both directions)
One helper, `syncLinkedCompletion`, used by every place that completes either
side:
- Completing a Task whose linked Activity is `scheduled` → resolve the Activity
  as `done` (timestamped now), so it leaves UnresolvedPlansCard.
- Resolving a linked Activity as `done`/`partial` → mark the Task complete
  (with `completed_date`, which the daily trigger needs).
- `skipped`/`cancelled` deliberately do NOT complete the Task — deciding not to
  do the plan is not doing the to-do. (Owner: veto this if you disagree.)
- Data safety: only ever *sets* completion state on the twin; never deletes,
  never un-completes automatically.

### Phase 2 — Reschedule + carry-over where plans nag
- A **Reschedule** button on `UnresolvedPlansCard` rows (opens the same
  branch-aware picker the lifecycle popover uses; recurring plans keep the
  this-one / this-and-future / whole-series choice).
- A one-tap **"Carry over yesterday's unfinished"** action on the same card:
  moves each unresolved plan's timestamp to today, appending to
  `reschedule_history` (never rewriting it) — the bullet-journal migration.

### Phase 3 — One task composer
Merge `QuickTaskComposer` and `TaskFormModal` into a single `TaskComposer` with
a compact and an expanded state (the v0.113.1 pattern: one modal, modes flip in
place). The bulletin companion-post behaviour becomes an option the bulletin
board passes, not a separate implementation. `QuickAction add_task` opens the
compact state.

### Phase 4 — One plan-creation path
Extract the triplicated create logic (`QuickPlanComposer` + both
`ActivityPlanModal` branches) into one `createPlan()` in `src/lib/planCreate.js`
used by all three surfaces. UI stays where it is; the *logic* becomes single.
Recurring-plan expansion stays in `recurrenceUtils` and is called from exactly
one place afterwards.

### Phase 5 — One `toggleDailyTask` helper
Extract the four DailyProgress read-merge-write copies into
`src/lib/dailyTasks.js` (or extend `dailyTaskSystem.js`), with the
self-fire guard (`daily_task_completed`) living inside the helper.

### Phase 6 — One thing with an optional time (SHIPPED v0.131.0)
Owner call, 2026-08-05: "merge the two into a single thing with an optional
time." A to-do and a plan are now one intent. `src/lib/thingSave.js` is the
single write path: it creates the Task and, when the thing has a day, the
linked scheduled Activity (`task_id`), so the pair can't disagree.
No schema change and no migration — every existing Task and Activity keeps
working, and completion already syncs both ways (Phase 1).
`QuickTaskComposer` grew the time/duration fields and is now the only
composer on the bulletin board; the Plan quick action opens it with the
date showing. `unscheduleThing()` retires a linked plan as `cancelled`
rather than deleting it when the time comes off.
Still separate on purpose: `ActivityPlanModal` (the full plan form —
repeats, reminders, who it's for), reachable as "More options".

## What this does NOT change
- No entity schema changes; no migrations; nothing existing is rewritten in
  storage. All five phases are code-path consolidation plus two new buttons.
- The three views of a day (timeline / tracker / day log) stay separate —
  that's an intentional design, not redundancy.
- Backups: no new entities, so no backup wiring changes.

## Risks / open questions for the owner
1. Phase 1's skipped/cancelled rule — right call?
2. Should carry-over also bump linked Tasks' `due_date` to today? (Proposal: yes.)
3. Phase 3 changes the bulletin board's task row visually (one composer style).
   Acceptable, or should the compact state mimic the current row exactly?
