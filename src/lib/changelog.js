/**
 * App changelog — update this file whenever a feature or fix ships.
 *
 * Format per release:
 *   { date: "Month D, YYYY", version?: "X.Y.Z", changes: [{ type, text }] }
 *
 * `version` is the LAST version published on that date. Leave it OFF the
 * current (top) block — Recent Updates shows the live APP_VERSION there, so
 * same-day releases don't each need a re-stamp. When a NEW date block is
 * added on top, stamp the previous top block with the version it ended on.
 *
 * types:
 *   "feature"  — new capability worth describing
 *   "improve"  — enhancement to something existing
 *   "fix"      — bug fix worth calling out
 *   "hotfix"   — minor/internal fix, keep text brief
 */

export const CHANGELOG = [
  {
    date: "June 24, 2026",
    changes: [
      {
        type: "fix",
        text: "Reminders delivered while the app is closed now vibrate and pop up like they should (they were arriving silently).",
      },
      {
        type: "improve",
        text: "\"Plan something\" now has every plan option in its pills — set it as a to-do, add a location, repeat, reminder, or mark it critical — and picking who it's for uses the same searchable list as everywhere else.",
      },
      {
        type: "fix",
        text: "Checking off a daily task from the dashboard now puts it on the Timeline at the moment you ticked it, instead of grouping it with the rest.",
      },
      {
        type: "fix",
        text: "Desktop: the dashboard no longer shifts sideways when you open the \"Plan something\" box.",
      },
      {
        type: "improve",
        text: "A sleep that's in progress now shows up as an Active Activity (on the dashboard and in the ongoing notification), so it's easy to spot and end.",
      },
      {
        type: "improve",
        text: "Quick task vs. Plan: tapping into each now explains what it makes — a to-do for your To-Do List, vs. a scheduled activity on your Activity Tracker.",
      },
      {
        type: "improve",
        text: "You can now edit a bulletin comment after posting it (tap the pencil), and edit a lineage event's date/cause/notes in System History.",
      },
      {
        type: "improve",
        text: "You can now edit a private message after sending it (on an alter's board), and edit or delete your saved Learn reflections.",
      },
      {
        type: "improve",
        text: "The \"What's new\" bar now shows the version number next to each update's date.",
      },
      {
        type: "fix",
        text: "Timeline: the hour gridlines were drawn a touch low, so activities looked like they ended ~15 min early — lines now sit at their true hour and the activity bar's end is clearer.",
      },
      {
        type: "fix",
        text: "Timeline: an activity's bar now spans its full duration accurately — it was ending a bit short of the real end time.",
      },
      {
        type: "improve",
        text: "Tapping an activity on the timeline now shows its start and end times (and duration), not just the start.",
      },
      {
        type: "improve",
        text: "Activity Tracker time labels now line up with the gridlines instead of sitting just below them.",
      },
      {
        type: "improve",
        text: "Daily tasks now appear on the timeline at the time you actually ticked each one off, instead of all bunched into one marker. (Tasks that complete automatically still group together.)",
      },
      {
        type: "fix",
        text: "Colours that use the app's accent (uncategorised activities like a completed plan, plus various highlights across the app) were coming out invisible — they now render their colour again.",
      },
      {
        type: "fix",
        text: "Activities without a category (like a completed plan) now show their full coloured bar on the timeline — they were rendering as just a dot with an invisible bar.",
      },
      {
        type: "fix",
        text: "Completed plans now show on the timeline as their own activity block — before, a plan that overlapped another activity got hidden inside it.",
      },
      {
        type: "improve",
        text: "Tapping a daily-tasks marker on the timeline now lists which tasks you finished, not just the count.",
      },
      {
        type: "fix",
        text: "Journal Edit/Delete moved to the bottom of the entry — Delete is no longer right next to the close button where it was easy to hit by mistake.",
      },
      {
        type: "fix",
        text: "Activity edit popup (e.g. editing a sleep) no longer gets cut off on the right — the Start/End date fields now fit the box.",
      },
      {
        type: "feature",
        text: "The Timeline now surfaces even more of your day — sleep, lineage events, diary cards, polls, reminders that fired, reflections, alter notes and daily-task completions all show up alongside everything else. Tap any of them to open it.",
      },
      {
        type: "feature",
        text: "Octocon import now brings your polls across too — both choice and yes/no/veto polls, with every vote kept against the right alter and any voter comments preserved.",
      },
      {
        type: "feature",
        text: "Reliable reminders: a new \"force-stop-proof\" option (Settings → Notifications) gets reminders to you even when your phone has fully closed the app — no Friends setup needed. Off by default; the app stays fully offline until you switch it on.",
      },
      {
        type: "fix",
        text: "Octocon import: a custom-field value whose field was deleted in Octocon is now kept (as an \"Imported field\") instead of being dropped.",
      },
    ],
  },
  {
    date: "June 23, 2026",
    version: "0.67.8",
    changes: [
      {
        type: "feature",
        text: "Import from Octocon — bring your alters, groups, custom fields and fronting history over from an Octocon .json export (Settings → Data, or the Import button on the Alters page).",
      },
      {
        type: "fix",
        text: "Journal authors whose name uses brackets (like \"[Name]\") are no longer dropped when a second author is added — every author is kept.",
      },
      {
        type: "fix",
        text: "You can now delete a journal entry — open it and tap the trash icon.",
      },
      {
        type: "fix",
        text: "Reminders now send real push notifications by default (they were quietly in-app-only) — your existing reminders were switched on too. Turn off \"Push notification\" on any you want to keep silent.",
      },
      {
        type: "fix",
        text: "Scheduled reminders now fire reliably when the app is closed — including on Samsung, which was dropping them. (Requires this update's app install.)",
      },
      {
        type: "improve",
        text: "Subsystems you've expanded on the alters page now stay expanded when you come back from viewing an alter, instead of collapsing to default.",
      },
      {
        type: "improve",
        text: "Pages now remember where you were — returning to the alters list (or any page) after viewing an alter keeps your scroll position and view instead of jumping back to the top.",
      },
      {
        type: "improve",
        text: "You can now start a plan live straight from the dashboard's \"Plans needing review\" card — tap Start to time it (it moves to Active Activities).",
      },
      {
        type: "fix",
        text: "Fixed the top-bar buttons (Settings, Reminders, the menu) sometimes not responding to taps near their top edge — an invisible layer was covering the top of the screen.",
      },
      {
        type: "feature",
        text: "Quick Check-In: a side slider on the Feeling section quick-logs a 0–5 rating — Energy level by default; tap its label to track any other rating symptom/habit.",
      },
      {
        type: "feature",
        text: "Quick Check-In: ‹ Prev / Next › arrows at the bottom step through the sections one at a time.",
      },
      {
        type: "fix",
        text: "Quick Check-In's Good / Neutral / Bad buttons now show in their category colour and count as positive/neutral/negative in emotion analytics.",
      },
      {
        type: "feature",
        text: "You can now start a plan live: open a plan, tap \"Start now\" to time it, and tap End to complete it — it shows under Active Activities meanwhile.",
      },
      {
        type: "feature",
        text: "Add a note when you start or finish an activity — it's saved onto the activity and shows in its details everywhere.",
      },
    ],
  },
  {
    date: "June 22, 2026",
    version: "0.66.11",
    changes: [
      {
        type: "fix",
        text: "Activity Tracker day view no longer opens with its header (the date and any birthdays) cut off behind the top bar.",
      },
      {
        type: "improve",
        text: "Date custom fields (like birthdays) now show on the Activity Tracker's week and day views and on the Timeline — not just the month calendar.",
      },
      {
        type: "fix",
        text: "Fixed the Activities page crashing when you opened it.",
      },
      {
        type: "fix",
        text: "Dropdown menus are readable again on dark themes — the list options were rendering near-invisible (light text on a light popup). Affects the date field's Month/Day pickers and every other dropdown.",
      },
      {
        type: "fix",
        text: "Date custom field: you can now save just a month and day with no year (pick them from dropdowns) — the year is genuinely optional now, instead of being required to save.",
      },
      {
        type: "improve",
        text: "Web app on a computer: swipe and press-and-hold now work with a mouse on every alter surface (dashboard fronters, set-front picker, profiles…), not just the alters grid.",
      },
      {
        type: "improve",
        text: "Settings: the header backup button is now a small menu — export a backup now, or jump straight to import.",
      },
      {
        type: "improve",
        text: "Sidebar tidy-up: Timeline moved to Tracking, System Meeting and Friends to Journal & Content, and System History to the System group.",
      },
      {
        type: "feature",
        text: "Custom fields can now be a \"Date\" type, with the year optional. A date field like a birthday shows as a marker on that day in the Activity Tracker month calendar — so any annual event can surface there.",
      },
      {
        type: "fix",
        text: "Rich text: \"Heading 1\" now shows at heading size, and block quotes render with a proper quote bar (coloured left border + italic) instead of just slightly-indented text — in bios and everywhere rich text appears.",
      },
      {
        type: "feature",
        text: "New Presences: record someone you sense but can't pin down yet — a name, colour, vibe or note — from its own page or the new \"New presence\" tab when you set fronters. It flags when a presence reoccurs or might be a known alter.",
      },
      {
        type: "feature",
        text: "New Presences: turn a recorded presence into a full alter in one tap — its name, colour, emoji and notes carry over — and choose to keep the linked alters as relationships or add the new alter into a subsystem of one of them.",
      },
      {
        type: "improve",
        text: "New Presences: after you create an alter from a presence, that presence leaves the list, and the new alter's \"first appearance\" defaults to when you first recorded the presence.",
      },
      {
        type: "improve",
        text: "New Presences: in Set Front you can now pick a presence you've recorded before (it logs that it's around again) instead of only making new ones; the page lets you edit and merge presences; and the colour picker now matches the alter editor.",
      },
      {
        type: "improve",
        text: "Web app on a computer: many pages (Settings, Tasks, Friends, Polls, Locations and more) now use the wider screen instead of sitting in a narrow centre strip. More desktop polish to come.",
      },
      {
        type: "improve",
        text: "Web app on a computer: the dashboard now flows into two columns on a wide screen instead of one tall strip. (Phones are unchanged.)",
      },
    ],
  },
  {
    date: "June 21, 2026",
    version: "0.65.24",
    changes: [
      {
        type: "improve",
        text: "Web app on a computer: you can now press-and-hold and click-drag alter cards with a mouse (to change front, set primary, etc.) — not just by touch. First step of a desktop polish pass.",
      },
      {
        type: "fix",
        text: "The daily \"Check in\" task now clears the moment you open the app, not only after you visit the Daily Tasks page.",
      },
      {
        type: "improve",
        text: "Typing +name while posting now opens the same author picker as -name does (+ adds an author, - makes them the sole author).",
      },
      {
        type: "feature",
        text: "The settings ⚙️ in the top bar now opens a quick menu with shortcuts for the page you're on (like customizing the dashboard) plus All settings — so a stray tap doesn't dump you into the full settings page.",
      },
      {
        type: "fix",
        text: "Editing an active symptom that runs past midnight no longer makes its bar disappear — you can now set the end on the correct day, and an end before the start is rejected.",
      },
      {
        type: "improve",
        text: "Press and hold a symptom bar on the Timeline to edit its start/end times (tap still opens details) — same as fronting sessions.",
      },
      {
        type: "fix",
        text: "On an alter's profile, the Edit button no longer gets cut off the right edge in portrait — the action buttons now wrap, and Save is a compact icon.",
      },
      {
        type: "fix",
        text: "Editing a plan from the weekly view now opens the full plan editor — before, both \"Edit plan\" and \"Manage\" led to the same Manage screen.",
      },
      {
        type: "improve",
        text: "The \"no front update for N minutes\" reminder now fires while the app is closed and resets whenever the front changes (turn on Push for the reminder).",
      },
    ],
  },
  {
    date: "June 20, 2026",
    version: "0.65.18",
    changes: [
      {
        type: "feature",
        text: "Bulletins: sign with -name to make someone the sole author, or +name to add another. With no one fronting, a post now defaults to your last author (or the whole system). A short how-to shows in the composer.",
      },
      {
        type: "fix",
        text: "Adjusting a symptom session's end time now properly ends it — so the \"Active symptoms & habits\" notification no longer lingers when nothing is actually active.",
      },
      {
        type: "fix",
        text: "The \"Signed by\" authors on a bulletin no longer list the same person twice (could happen after changing fronters).",
      },
      {
        type: "improve",
        text: "Recent Updates (Settings) now shows which app version each day's changes shipped in.",
      },
      {
        type: "feature",
        text: "Filter the alters list by role — pick one or more roles in the filter popup.",
      },
      {
        type: "improve",
        text: "\"Manage plan\" now has a notes box, so you can add or edit a plan's note right there.",
      },
    ],
  },
  {
    date: "June 19, 2026",
    version: "0.65.13",
    changes: [
      {
        type: "fix",
        text: "Reopening the app now refreshes to the current time and state, so a plan that became active while it was closed (and the date) no longer show stale until you navigate.",
      },
      {
        type: "feature",
        text: "Archive several alters at once — a new bulk-archive button on the alters page.",
      },
      {
        type: "feature",
        text: "You can now set an alter to front straight from their profile — a Start/Stop fronting button in the header.",
      },
      {
        type: "feature",
        text: "Quick Check-In: tap Good / Neutral / Bad as a base mood if you don't want to pick a specific emotion.",
      },
      {
        type: "improve",
        text: "Quick Check-In now shows when your last check-in was.",
      },
      {
        type: "fix",
        text: "Alter picker, Groups tab: a member's subsystems now nest beneath them like in the alters list (subsystems are no longer missing from the Groups view).",
      },
      {
        type: "fix",
        text: "Formatting toolbar buttons now correctly stay lit while a style (bold, italic…) is active as you type, and clear when you turn it off.",
      },
      {
        type: "improve",
        text: "You can now set up your sharing privacy levels before creating a Friends profile — no friend needed first.",
      },
      {
        type: "improve",
        text: "A friend's safety number is now hidden until you tap to reveal it.",
      },
      {
        type: "fix",
        text: "Exporting to OpenPlural now uses stable IDs, so importing the same export more than once no longer creates duplicate alters or fronting sessions.",
      },
      {
        type: "feature",
        text: "OpenPlural / PluralSpace import now has a \"Replace everything\" option that wipes the categories you tick and imports fresh — it always saves a full backup to your device first.",
      },
      {
        type: "fix",
        text: "Emoji aliases now work in @mentions and /w whispers — e.g. @😀 highlights and resolves to the right person.",
      },
      {
        type: "feature",
        text: "Groups can now hide their archived members from the group's own member list (a toggle in the group's config).",
      },
      {
        type: "improve",
        text: "On the day view, the \"Quick plans\" strip now stays pinned at the top while you scroll the timeline.",
      },
      {
        type: "improve",
        text: "Editing an alter's profile now has a \"Pin to the top\" toggle — same as the press-and-hold option on the alters list.",
      },
      {
        type: "feature",
        text: "New \"Back up now\" button at the top of Settings saves a full backup to your device in one tap.",
      },
      {
        type: "fix",
        text: "Fixed the alter-picker Groups tab — it no longer lists subsystems, now shows groups that contain subgroups, and each row shows the alter's avatar.",
      },
      {
        type: "improve",
        text: "Formatting toolbar buttons (bold, italic, lists…) now light up while they're active.",
      },
      {
        type: "improve",
        text: "A few more view preferences now travel along with your backup to a new device.",
      },
    ],
  },
  {
    date: "June 18, 2026",
    changes: [
      {
        type: "improve",
        text: "System Meetings now credits its source — Monika Ostroff's 5 Minute System Check-In — and Healing My Parts is linked under Quick Support → Learn → Resources.",
      },
      {
        type: "improve",
        text: "First-run setup now lets you Start fresh or bring data in right away — from a backup file, or by syncing from Simply Plural / PluralKit / PluralSpace. The optional password encryption toggle is still there.",
      },
      {
        type: "improve",
        text: "The OpenPlural / PluralSpace importer now lets you pick \"Add & update\" or \"Replace from file\" for records that already exist. Either way, nothing is ever deleted.",
      },
      {
        type: "feature",
        text: "Import a Simply Plural export file (Settings → Import) — brings members, groups, fields, front history, system profile, and chat (which the SP API can't provide because it's encrypted) into the app.",
      },
    ],
  },
  {
    date: "June 17, 2026",
    changes: [
      {
        type: "improve",
        text: "System chat (channels, categories, messages) now transfers too — via OpenPlural import/export and Simply Plural exports.",
      },
      {
        type: "improve",
        text: "OpenPlural import/export is now far more complete — roles & tags, system profile (name/bio/avatar/banner), message prefix↔alias, birthdays, and per-member notes, on top of alters/groups/fields/fronts/journals/relationships.",
      },
      {
        type: "feature",
        text: "Export to a Simply Plural file (Settings → Data & Privacy → Export) — import it into PluralSpace, Simply Plural, or any app that reads SP exports.",
      },
      {
        type: "fix",
        text: "An alter who's been fronting a long time now reliably floats to the top of the Alters list (long-running fronters were sometimes missed).",
      },
    ],
  },
  {
    date: "June 16, 2026",
    changes: [
      {
        type: "feature",
        text: "Export your whole system to the portable OpenPlural format (Settings → Data & Privacy → Export) — a .zip you can import into PluralSpace or any OpenPlural app.",
      },
      {
        type: "feature",
        text: "Import from OpenPlural exports (e.g. PluralSpace): members, groups, custom fields, front history, journals, and relationships — from a .zip or .json in the Import screen.",
      },
    ],
  },
  {
    date: "June 13, 2026",
    changes: [
      {
        type: "improve",
        text: "Import your members from another plural app (Simply Plural or PluralKit) right from the Alters page — no need to dig into Settings.",
      },
      {
        type: "fix",
        text: "Recording a system change event (e.g. an Emergence) no longer crashes to a white screen.",
      },
      {
        type: "fix",
        text: "Dashboard now reliably shows who's fronting — it reads the same live front data the rest of the app uses, so it no longer occasionally showed “no one fronting” after you'd set a front.",
      },
      {
        type: "fix",
        text: "Rich-text “web link” button now asks for the address and inserts a working link (it used to add a dead placeholder).",
      },
      {
        type: "fix",
        text: "Headings (H1–H3) added from the formatting toolbar now show at heading sizes in posts.",
      },
      {
        type: "improve",
        text: "The “What's new” bar shows on the dashboard automatically again whenever a new version ships.",
      },
    ],
  },
  {
    date: "June 12, 2026",
    changes: [
      {
        type: "fix",
        text: "Currently-fronting notification now shows just each fronter's name, not the alias too.",
      },
      {
        type: "improve",
        text: "Activity Tracker loads faster and paging between weeks/months is now instant (no longer reloads everything each time).",
      },
      {
        type: "improve",
        text: "Quick Check-In: each chosen activity can be set active (+) right there, and given a quick duration or note inline.",
      },
      {
        type: "improve",
        text: "Log Activity and New Plan: a “Now” button next to start/end fills in the current date & time.",
      },
      {
        type: "fix",
        text: "Revealing a whisper on a Dashboard bulletin no longer opens the author's page by mistake.",
      },
      {
        type: "fix",
        text: "Bulletin signposting keeps every author again (not just the last one); “Signed by” now has a Clear all.",
      },
      {
        type: "fix",
        text: "The currently-fronting notification no longer lists the primary fronter twice.",
      },
      {
        type: "fix",
        text: "Group pickers now show your group folders properly nested instead of flattened to one level.",
      },
      {
        type: "improve",
        text: "Set Fronters and the Quick Check-In “Who's fronting” picker now have a by-subsystem/group view for finding members in large systems.",
      },
      {
        type: "improve",
        text: "Export members and therapy reports can now narrow who's included to a chosen privacy level in one tap.",
      },
    ],
  },
  {
    date: "June 11, 2026",
    changes: [
      {
        type: "improve",
        text: "When ending an active activity you can now set the end time, in case you forgot to end it at the actual moment.",
      },
      {
        type: "improve",
        text: "Tapping a persistent notification now opens the right place — current fronters opens the switch screen; the activity timer opens Activities (symptoms already opened their menu).",
      },
      {
        type: "fix",
        text: "Member pickers no longer jump back to the top when you expand a group or change an alter's level.",
      },
      {
        type: "fix",
        text: "Inner-world map: after placing a subsystem's root you can now still place its members (they used to disappear) — already-placed alters now show dimmed instead of vanishing.",
      },
      {
        type: "fix",
        text: "Fixed a crash that made the Journals page fail to open.",
      },
      {
        type: "improve",
        text: "Inner-world map: the “not on this layer” list is now the standard searchable, by-subsystem/group list — tap an alter to arm it, then tap the canvas to drop it. Recording a fusion/split/dormancy uses the same list too.",
      },
      {
        type: "improve",
        text: "Journal “Written by” now lets you pick one or more authors from the standard searchable, by-subsystem/group list (the first is the primary author). The create-relationship pickers use the same list (single-select).",
      },
      {
        type: "improve",
        text: "More member pickers now use the one standard list (searchable, by subsystem/group, lazy): the journal author filter, the chat speaker picker, and the activity fronter picker.",
      },
      {
        type: "improve",
        text: "The Groups tab (export + privacy levels) now expands so you can see and pick the alters inside each group; subsystems stay under the Members tab.",
      },
      {
        type: "improve",
        text: "Friends: the “set levels per member” list and the per-friend hide list now use the same searchable, subsystem/group-organized, lazy-loading picker as everywhere else — one consistent pattern across the app.",
      },
      {
        type: "improve",
        text: "Picking members (export, privacy levels) now uses one consistent picker everywhere — Members (by subsystem or flat) + Groups tabs, search, Select all / Clear all — and long lists load as you scroll instead of capping. The Export “who to include” list can now be organized by subsystem too.",
      },
      {
        type: "fix",
        text: "Friends Groups tab now lists only folder groups (subsystems live under the Members tab), and the “members they can see” list is scrollable + loads on scroll.",
      },
      {
        type: "improve",
        text: "Privacy-level member picker now scales to large systems: a Members tab (by-subsystem or flat, with Select all / Clear all) and a Groups tab to assign a whole group/subsystem at once. Groups stay collapsed until you open them.",
      },
      {
        type: "feature",
        text: "Set a group's or subsystem's friends-sharing levels right from its profile page — “Friends sharing”, optionally including nested subsystems.",
      },
      {
        type: "improve",
        text: "Posts, comments and bulletins now turn web links — both [text](https://…) and pasted https:// URLs — into clickable links.",
      },
      {
        type: "improve",
        text: "Alters page: you can now expand several of an alter's subsystems at once, instead of only one at a time.",
      },
      {
        type: "fix",
        text: "Export members organized by group: a subsystem is now written out in full only once (repeats just say “listed above”) instead of repeating the whole thing wherever its owner appears.",
      },
      {
        type: "feature",
        text: "Friends: you can now manage a privacy level's members directly — add a whole group or subsystem (nesting respected) or individual members — from Friends → Member sharing → Manage by level.",
      },
      {
        type: "improve",
        text: "Friends privacy levels: selected pills are now clearly filled with a ✓ (vs outlined when off), and each friend's card lists exactly which members they can see right now.",
      },
      {
        type: "fix",
        text: "Recurring plan occurrences (including ones in the past) can now be marked done/partial/skipped/cancelled or rescheduled, and show up in your plan lists — they were wrongly treated as already logged.",
      },
      {
        type: "fix",
        text: "On a group/subsystem page, tapping a member who owns several subsystems now lets you choose which one to open (it used to jump to just one).",
      },
      {
        type: "feature",
        text: "Run several activities at once — active activities now show as their own “Active activities” row on the dashboard (tap one to end & log, adjust its start, or discard). Toggle/reorder it in Settings → Appearance → Dashboard layout.",
      },
      {
        type: "feature",
        text: "Accessibility mode, text size, and high contrast are now reachable from a button on the very first setup screens and all through the guided tour — no need to finish onboarding first.",
      },
      {
        type: "improve",
        text: "New “Active” toggle in Log Activity — start something now and end & log it later (keeps who's fronting + notes). Replaces the separate Start activity button.",
      },
      {
        type: "improve",
        text: "Tap an active symptom — on the dashboard or its notification — to jump straight to its severity and end-session controls.",
      },
      {
        type: "improve",
        text: "Persistent activity & symptom notifications now have an “End” button so you can stop and log right from the notification.",
      },
      {
        type: "fix",
        text: "Persistent “active symptoms” notification now detects your symptoms and habits (it was showing none), and the persistent notifications only appear when something's actually active.",
      },
      {
        type: "fix",
        text: "Fixed a crash when turning on the “Current fronters” persistent notification.",
      },
      {
        type: "fix",
        text: "Export members: “Organize by group” now nests your groups, subgroups, and subsystems properly instead of listing everyone in one flat pile.",
      },
      {
        type: "feature",
        text: "Android app: optional always-on notifications you can pin from Settings → Notifications — current fronters, active symptoms, and an activity timer you can end & log from the tray.",
      },
      {
        type: "fix",
        text: "Friends: the “safety number” for verifying an encrypted connection now shows whenever you expand a friend's card (it was buried under Visibility), with a note when a friend hasn't set up encryption yet.",
      },
      {
        type: "fix",
        text: "Recurring plans: you can now manage each occurrence — including past ones — by opening it and tapping “Manage this occurrence” to mark it done/partial/skipped/cancelled or reschedule.",
      },
      {
        type: "improve",
        text: "“Start activity” now uses the same activity picker as logging an activity.",
      },
      {
        type: "feature",
        text: "Activity Tracker: a new “Start activity” button times an activity in real time, like start/end sleep — pick what you're doing and tap End to log it automatically with the elapsed time. It keeps running even if you close the app.",
      },
      {
        type: "improve",
        text: "Export members: selected members are now clearly highlighted (the checkmark used to vanish on white-coloured members), you can export as a PDF as well as HTML, and there's an option to organize the export by group/subsystem.",
      },
      {
        type: "improve",
        text: "Friends page: a new “Member sharing & privacy levels” section lets you create levels and assign members right there, instead of only from each profile.",
      },
      {
        type: "fix",
        text: "Bulletins: line breaks and paragraphs in a post now show the way you typed them — they were getting squashed into one block.",
      },
      {
        type: "improve",
        text: "Editing a bulletin now has the same Simple/Fancy formatting, image/GIF, and @mention tools as writing one — and editing no longer strips a post's formatting.",
      },
      {
        type: "improve",
        text: "Current Fronters always lists the primary fronter first.",
      },
    ],
  },
  {
    date: "June 10, 2026",
    changes: [
      {
        type: "improve",
        text: "Friends: a tour walkthrough now covers the new encrypted member-sharing, and the privacy explainer spells out that the shared member list is end-to-end encrypted while your live fronting status stays relay-visible so it can send notifications that name who's fronting (set a friend's fronting view to count-only or hidden for full privacy).",
      },
      {
        type: "feature",
        text: "End-to-end-encrypted member sharing is live: members you put in a privacy level are shared with the friends you grant that level, and opening a friend's card shows what they share with you — only the fields each level allows, and nothing the server can read.",
      },
      {
        type: "feature",
        text: "Groundwork for end-to-end-encrypted friend sharing: your device now has its own encryption key, and the Friends page explains how it protects your data (a plain-language and a technical version) plus a per-friend “safety number” you can compare to confirm no one's tampering.",
      },
      {
        type: "feature",
        text: "Privacy levels (groundwork): create privacy levels that each reveal different details, assign members to them (a member can be in several), and choose which levels each friend may see — with a simple slider or by picking exact levels. Members stay private until you add them to a level.",
      },
      {
        type: "feature",
        text: "New “Export members” feature — make a shareable document of your members (pick who, how much detail, and whether to anonymize names) to send to a friend. Export your whole list from the Alters page, or just one from a profile's Options tab.",
      },
      {
        type: "fix",
        text: "Insert-link: linking to a location now opens that location's page (it was landing on the analytics map).",
      },
      {
        type: "feature",
        text: "Insert-link: you can now link to a map layer too — it opens the inner-world map on that layer. Layers sit in a collapsed section in the picker.",
      },
      {
        type: "fix",
        text: "Daily Tasks: the preset “check-in” now clears when you open the app, not only when you open the Daily Tasks page.",
      },
      {
        type: "improve",
        text: "Journal entries: the “Signing as” authors are now removable — tap × to drop one you didn't mean to include.",
      },
      {
        type: "improve",
        text: "Comments now have the same 🔒 Whisper toggle as bulletins — pick exactly who can read a comment, hidden behind a tap-to-reveal bar for everyone else.",
      },
      {
        type: "feature",
        text: "You can now drag the floating support bubble (🫧) to the “hide” target at the bottom of the screen to turn it off, and bring it back from the Quick Support page (or Settings → Accessibility).",
      },
      {
        type: "improve",
        text: "Edit Bulletin: the author picker is now searchable and scrollable with removable chips, matching the rest of the app.",
      },
      {
        type: "fix",
        text: "Inserted links now land where they should: a link to a journal folder opens that folder, and the “Go to Safety Plan lesson” button opens the actual lesson (both used to drop you on the generic page).",
      },
      {
        type: "improve",
        text: "Insert-link picker: the categories (members, journals, folders, check-ins, locations) are now collapsible, so the list is easier to navigate.",
      },
      {
        type: "improve",
        text: "Accessibility: screen readers now announce in-app notifications and reminders, the formatting-toolbar buttons have proper labels, and several form fields gained labels.",
      },
      {
        type: "fix",
        text: "Bulletins: a new 🔒 Whisper toggle lets you pick exactly who can read a post — it's hidden behind a tap-to-reveal bar for everyone else. More reliable than typing “/w” (which still works).",
      },
      {
        type: "feature",
        text: "Each member's profile has a new Locations tab listing the inner-world locations they're in, with links to each location and to its spot on the map.",
      },
      {
        type: "feature",
        text: "Alters page: a new flatten button shows every member in one list (ignoring subsystem nesting), so you can see them all at once.",
      },
      {
        type: "fix",
        text: "Activity Tracker: the “show alters” toggle now actually shows who was fronting during each activity (it was using an old detection method and never showed anyone).",
      },
      {
        type: "improve",
        text: "Page titles now use one consistent heading style across the app (Activity Tracker, Timeline, Reminders, To-Do, and more), matching the more polished pages.",
      },
      {
        type: "fix",
        text: "Opening a page now starts at the top instead of sometimes appearing already scrolled down.",
      },
      {
        type: "fix",
        text: "Emoji aliases now sign posts: if a member uses an emoji as their alias, just including that emoji in a bulletin, message, or comment signs the entry as them. Mentions still put @ before the emoji (like @😀).",
      },
      {
        type: "improve",
        text: "The @mention picker in chat now matches and inserts emoji aliases too.",
      },
      {
        type: "feature",
        text: "Writing a bulletin or comment now shows a live “Signed by” list of who it'll be attributed to — tap × to remove anyone you didn't mean to include.",
      },
      {
        type: "fix",
        text: "Currently-fronting panel: a member's note/feelings panel now opens directly under the member you tapped, instead of below the whole list.",
      },
      {
        type: "improve",
        text: "Inner-world map: the layer name in the top-left now opens the layers & members panel (the separate corner button is gone), and there's a new full-screen button.",
      },
      {
        type: "fix",
        text: "Profile bios with hard-coded text sizes now grow and shrink with the Text size slider like the rest of the app.",
      },
      {
        type: "improve",
        text: "When your text size is very large, a tip suggests rotating your phone to landscape for easier reading.",
      },
    ],
  },
  {
    date: "June 9, 2026",
    changes: [
      {
        type: "feature",
        text: "New Accessibility mode for low-vision users (Settings → Accessibility) — it reconfigures the layout into a single column with larger tap targets and no cut-off text, instead of only enlarging content. More accessibility improvements are on the way.",
      },
      {
        type: "improve",
        text: "Accessibility mode: at very large text sizes the top header and bottom bar stay slim instead of ballooning, and the header shrinks further in landscape — so rotating your phone gives more room for content.",
      },
      {
        type: "improve",
        text: "“High contrast” (Settings → Accessibility) is now a true black-and-white scheme for maximum legibility, instead of a slight contrast boost.",
      },
      {
        type: "feature",
        text: "Inner-world map now has a List view (Canvas/List toggle) — a screen-reader-friendly index of every location grouped by map and layer, each opening its profile. Opens automatically when Accessibility mode is on.",
      },
      {
        type: "improve",
        text: "Accessibility mode: long passages of text no longer stretch too wide on big or landscape screens, with a little extra letter spacing for easier reading.",
      },
      {
        type: "feature",
        text: "Settings → Accessibility now has the Text size slider plus button-size and nav-bar-height controls right there — so you can make the font bigger without hunting through Appearance.",
      },
      {
        type: "improve",
        text: "Screen-reader support: added a “Skip to main content” link and spoken page names when you move between pages.",
      },
      {
        type: "improve",
        text: "Inner-world map: when the layers panel is collapsed it's now a small button in the bottom-left corner, so the map canvas uses the full width.",
      },
      {
        type: "fix",
        text: "Inner-world map: animated GIFs now keep playing as location backgrounds and backdrop images — they previously only moved while you were dragging or resizing.",
      },
      {
        type: "fix",
        text: "Inner-world map: a backdrop image's edit popup can be reopened again after you close it.",
      },
      {
        type: "improve",
        text: "Inner-world map: the Edit Location popup gained opacity, rotation, and stack-order (forward/back) controls, and the colour is now a single tappable swatch (no hex field) to keep it compact.",
      },
      {
        type: "improve",
        text: "The PluralKit connector is now import-only — the “Export to PluralKit” button has been removed.",
      },
      {
        type: "improve",
        text: "Data & Privacy settings have a cleaner layout: Backup & export, a new Import group (with Simply Plural & PluralKit nested inside it), Automatic backups, Storage & encryption, and Privacy cover. The “cache images offline / recompress images” tools moved down into Storage & encryption.",
      },
      {
        type: "fix",
        text: "Syncing from Simply Plural no longer pulls alters out of your local folders/subsystems or wipes their tags — a sync now only updates the info Simply Plural owns and leaves your organisation alone.",
      },
      {
        type: "improve",
        text: "Inner-world map: open a location's editor by tapping its name or double-tapping the location — and it now opens reliably. Added a button in the editor to lock a location's position.",
      },
      {
        type: "fix",
        text: "Inner-world map: you can now clear a location's width/height field and type a new number instead of it snapping back to 40.",
      },
      {
        type: "improve",
        text: "Inner-world map: in view mode, double-tap a location for a quick popup of its linked location, sub-locations, and the alters inside — with collapsible sections.",
      },
    ],
  },
  {
    date: "June 6, 2026",
    changes: [
      {
        type: "fix",
        text: "Syncing from PluralKit (“Update + add new”, including with “use display name”) no longer pulls alters out of your local folders/subsystems or wipes their tags — a sync now only updates the info PluralKit owns and leaves your organisation alone.",
      },
      {
        type: "improve",
        text: "Header extras now has a separate toggle for an alter's own custom fields (vs shared/system ones), and anything shown in the header is moved there — it no longer also appears in the body below.",
      },
      {
        type: "fix",
        text: "Pronouns in the profile header are back to hiding when the name already contains them; a new “Always show pronouns” toggle (in Header extras) forces them to show.",
      },
      {
        type: "improve",
        text: "Inner-world map: the Edit Location popup is now compact (name, colour, shape, background, width/height, link, delete). Description and other details live on the location's profile page — open it with the ↗.",
      },
      {
        type: "feature",
        text: "Inner-world map: in view mode, tapping a location shows a quick popup with its description, link, an expandable list of the alters there, and any sub-locations. Tap its name to open the full profile.",
      },
      {
        type: "improve",
        text: "Inner-world map: tap a backdrop image in edit mode to adjust it (opacity, rotation, stacking, replace) — the same way you edit locations.",
      },
      {
        type: "feature",
        text: "Alter profile headers can now show the alter's groups, subsystems, and custom fields as chips (icon, name, or both) — turn them on under “Header extras” in the profile editor. Group/subsystem chips link to their pages.",
      },
      {
        type: "fix",
        text: "An alter's pronouns now always show in their profile header.",
      },
      {
        type: "fix",
        text: "Swiping an alter in the list view to add/remove/change front now actually works — it was silently failing while the slide animation still played.",
      },
      {
        type: "feature",
        text: "Screenshot blur mode has a new “avatars only” option — blur icons/avatars but keep names readable. The toggle now cycles off → names → avatars → both.",
      },
      {
        type: "improve",
        text: "On the Alters page, the grid/list view and blur toggles now also apply to the Groups section — group folders blur and can switch to a grid, just like alters.",
      },
      {
        type: "fix",
        text: "On a location's profile page, “Open inner-world map” and the map/layer link now open the inner-world map focused on the right map (and layer) — they used to dump you on the analytics map.",
      },
      {
        type: "fix",
        text: "Swiping to add or change front works in the alters LIST view again (it had broken there — grid view still worked).",
      },
      {
        type: "fix",
        text: "“Who was fronting?” in Log Activity now uses the standard searchable Set Fronters picker, so the search actually works.",
      },
      {
        type: "improve",
        text: "Log Activity now has separate start-date and end-date fields, for activities that cross midnight.",
      },
      {
        type: "fix",
        text: "The emoji field is back in the alter profile editor (next to Alias), and alter emojis show on grid cards again.",
      },
      {
        type: "feature",
        text: "Alters can have an emoji again — it sits next to Alias when editing, with an option to use the emoji as the alias (mention with @ that emoji).",
      },
      {
        type: "improve",
        text: "Log Activity now defaults to ending at the current time and starting 30 minutes earlier, with quick 15m / 30m / 1hr duration presets and a “from end/start” toggle.",
      },
      {
        type: "feature",
        text: "Logging an activity with fronters now records a matching fronting session for them, with a “Still fronting now” toggle to keep it open. The fronter picker there is now searchable.",
      },
      {
        type: "feature",
        text: "Locations now have their own profile pages (like alter and group profiles) — see a location's description, which alters and sub-locations are inside it, and its map link. Open one from a location's editor, the Relationships & Locations list, or search.",
      },
      {
        type: "improve",
        text: "Location profile pages now use the same look and feel as alter and group profiles — themed banner, page background, custom fonts and colours, and a rich description editor.",
      },
    ],
  },
  {
    date: "June 5, 2026",
    changes: [
      {
        type: "fix",
        text: "Inner-world map: brought back the lock toggle for locations — a locked location can't be moved or resized until you unlock it.",
      },
      {
        type: "improve",
        text: "Inner-world map: Snap to grid now applies to locations and backdrop images too, not just placed members.",
      },
      {
        type: "improve",
        text: "Inner-world map: locations now show which map and layer they live on in the Relationships & Locations list and detail view.",
      },
      {
        type: "improve",
        text: "Inner-world map: following a location link to a specific layer now isolates that layer (hides the others), so it's meaningfully different from linking to a whole map. Tap \"show all\" to bring the rest back.",
      },
      {
        type: "improve",
        text: "Inner-world map: the group/subsystem filter and the location-link picker are now proper searchable, nested pickers (matching the rest of the app) instead of flat menus, and the toolbar is a tidy, consistent set of icons.",
      },
      {
        type: "fix",
        text: "Inner-world map: in View mode, backdrop images can no longer be selected or highlighted — it's display-and-navigate only, as intended.",
      },
      {
        type: "improve",
        text: "Image pickers now also let you paste a direct image URL, alongside choosing from your asset library or uploading.",
      },
      {
        type: "feature",
        text: "Inner-world map: a View mode (display & navigate only — switch hidden layers and follow location links without risk of moving anything), plus the ability to lock individual backdrop images or whole layers against accidental edits.",
      },
      {
        type: "fix",
        text: "Inner-world map: the backdrop-image editor no longer covers the whole map, its sliders actually slide now, and a placed image can be moved, resized, and adjusted.",
      },
      {
        type: "fix",
        text: "Inner-world map: tapping a placed alter to select it no longer risks deleting it — the remove × only appears once it's selected. Added search + group/subsystem filtering to the \"not on this layer\" list and a clearer indicator of which layer you're on.",
      },
      {
        type: "improve",
        text: "Image pickers (including inner-world backdrops & location backgrounds) can now choose from your asset library, not just upload new. The create-relationship type picker now shows nested relationship types properly (searchable & indented).",
      },
      {
        type: "improve",
        text: "Friends list now refreshes the instant a friend changes who's fronting (push-driven) and polls far less in the background — lighter on your data and battery.",
      },
      {
        type: "feature",
        text: "Inner-world map: you can now drop in backdrop images (placed behind everything — drag, resize, set opacity) and link a location to another map or layer (tap its ↗ badge to jump there).",
      },
      {
        type: "fix",
        text: "Inner-world map: your existing maps and locations now show immediately on first open after the update, instead of appearing blank until you tapped something. (Nothing was ever lost — it was a refresh timing issue.)",
      },
      {
        type: "improve",
        text: "Friends privacy notice now reflects push reminders: it explains that turning on reminder push also uses the relay, and how to keep the reminder's wording on your device (switch off \"Show reminder text in notifications\").",
      },
      {
        type: "feature",
        text: "The inner-world map now supports multiple maps and layers — make separate maps, add named layers you can show/hide and reorder, and place the same alter on more than one layer. Your existing inner world moves into a default map automatically. (More coming: backdrop images and location links.)",
      },
      {
        type: "fix",
        text: "Animated GIFs now stay animated when used as a bio image or an inner-world map background — they were being flattened to a single still frame. (Avatars, banners, and posts already kept them moving.)",
      },
      {
        type: "feature",
        text: "Reminders now fire as push notifications — arriving on time (and vibrating) even when the app is fully closed or swiped away, not just while it's open. A new Reminder-settings toggle controls whether the reminder's text shows in the notification or stays private.",
      },
      {
        type: "fix",
        text: "Restoring a backup with \"Replace All\" no longer deletes your Friends profile — your identity is kept, so friends stop seeing a duplicate \"ghost\" of you.",
      },
      {
        type: "fix",
        text: "PluralKit / Simply Plural sync no longer throws alters out of the folders and subsystems you organised them into — re-syncing now keeps your local grouping. (Use \"Replace all\" if you want the import to take over instead.)",
      },
      {
        type: "improve",
        text: "The push-notification test now shows the real error code when a send fails, making it easier to pin down a key or config problem.",
      },
      {
        type: "feature",
        text: "Instant friend notifications: when a friend you follow changes who's fronting, your phone is now alerted within seconds — even with the app fully closed — once you've turned on their bell and allowed notifications.",
      },
      {
        type: "feature",
        text: "New Settings → Alter setup → \"Find & remove duplicates\": cleans up duplicate imported alters (ones sharing a Simply Plural / PluralKit id), keeping the most complete copy and moving its fronting history onto it.",
      },
      {
        type: "fix",
        text: "Popups (colour picker, relationship editor, image/asset picker, link picker) no longer show the profile background image through them — they're solid and readable again.",
      },
      {
        type: "fix",
        text: "Profile style: profile sections are translucent again over a background image (only pop-ups stay solid) — and the doubled backing behind the editor is gone.",
      },
      {
        type: "improve",
        text: "Profile style: the Wave colour now opens a picker (choose one of your custom colours or a custom hex) and recolours the app's header wave while you're on that profile's page.",
      },
      {
        type: "fix",
        text: "Profile style: the \"Text\" custom colour now actually changes the page text — picking it recolours all the text instead of leaving it stuck white.",
      },
      {
        type: "fix",
        text: "Whispered bulletins now reveal when tapped from the dashboard and board, not just on the full bulletin page.",
      },
      {
        type: "improve",
        text: "Relationship types are now managed with a drag-to-nest tree (like the activity \"Customize\" menu) — nest, reorder, rename, recolour, and add sub-types.",
      },
      {
        type: "improve",
        text: "Profile style custom colours now show their current live colour instead of blank, so it's clear what each one controls — and you can clear any back to the app default.",
      },
      {
        type: "improve",
        text: "Profile style: the readable backing now extends fully behind the editor and the Notes/Board/Messages/Info tabs when a background image is set.",
      },
      {
        type: "improve",
        text: "Group profile: the Profile style section now sits under the bio (matching the alters page), and Undo/Redo sit beside the Save button on both edit pages.",
      },
      {
        type: "feature",
        text: "Press and hold a fronting chip on the dashboard for the full action menu — go to profile, pin, create subsystem, add to groups, and more — same as the alters page.",
      },
      {
        type: "feature",
        text: "New Relationships tab on each alter's profile to view and define their relationships (shared with the System Map).",
      },
      {
        type: "feature",
        text: "Alter and group edit pages now have Undo and Redo buttons next to Save.",
      },
      {
        type: "improve",
        text: "\"Create subsystem\" stays available in the press-and-hold menu even when an alter already has one — alters can have several.",
      },
      {
        type: "improve",
        text: "Profile style: custom colours are now laid out like Settings (four on top, four on bottom, wave on the right) and preview live as you change them; header/body sync is a compact control with a direction toggle and a live-link lock.",
      },
    ],
  },
  {
    date: "June 4, 2026",
    changes: [
      {
        type: "feature",
        text: "Profile style: the Header and Body each have their own full custom-colour palette now (like Settings → Appearance) — the header leaves out the wave colour, and the separate colours section is gone.",
      },
      {
        type: "feature",
        text: "Relationship types can now be nested under a parent to group them (e.g. Family → Sibling, Child).",
      },
      {
        type: "feature",
        text: "Alter-specific custom fields (in the Info tab) now support the same field types as system-wide fields — text, number, yes/no, and list — and format the same way.",
      },
      {
        type: "improve",
        text: "Archived alters now show an \"Archived\" tag (with one-tap Restore) on their profile, and archived members are tagged in a group's member list — so they're no longer mistaken for normal members.",
      },
      {
        type: "fix",
        text: "Fixed profile photos showing as broken images in several places — analytics, diary, system maps, fronting history and more.",
      },
      {
        type: "improve",
        text: "@mentions inside journal entries are now tappable and jump straight to that alter's profile.",
      },
      {
        type: "feature",
        text: "System Meetings: Open Dialogue now uses the real system chat — formatting toolbar, @mention and -signpost autocomplete — and you can keep it to the meeting or save it to a System Chat channel.",
      },
      {
        type: "improve",
        text: "System Meetings: there's now a single \"Notice who's near\" header, with the \"Choose who's near\" picker right under it.",
      },
      {
        type: "improve",
        text: "Profile edit: only the Profile-style card now gets a full colour backing over a background image — the rest of the form is backed per-section like the view page.",
      },
      {
        type: "improve",
        text: "Profile style now shows the full custom-colour palette — all 8 colours plus the wave colour — directly, instead of tucked behind a collapsed section.",
      },
      {
        type: "improve",
        text: "An alter's board / activity feed now shows post previews with their real formatting and images, instead of stripping them to plain text.",
      },
      {
        type: "improve",
        text: "System Meetings: present members now show as tappable cards like the \"Currently fronting\" widget — tap one to open its notes, emotions and symptoms.",
      },
      {
        type: "improve",
        text: "System Meetings: the Open Dialogue chat now stretches to the full width of the Invite Sharing card.",
      },
      {
        type: "fix",
        text: "An alter's profile photo no longer shows as a broken image at the top of their profile.",
      },
      {
        type: "fix",
        text: "Profile style: the in-profile Lineage tab and the \"System Fields\" label now take your colour backing over a background image, so they stay readable.",
      },
      {
        type: "improve",
        text: "System Meetings: \"Notice who's near\" is now a single section — the participants live inside the Step 2 block instead of a separate redundant card below it.",
      },
      {
        type: "improve",
        text: "Profile style: the nav tabs, Prev/Next/Edit buttons, group/subsystem labels, and your activity-feed cards now take your profile colour over a background image instead of floating transparently.",
      },
      {
        type: "feature",
        text: "Profile style: the header now has its own background-opacity slider, you can set all 8 page colours (plus wave) per profile, and there's a \"sync header ↔ body\" button.",
      },
      {
        type: "improve",
        text: "System Meetings: \"Notice who's near\" is now a single section — pick people through the Set Fronters modal, and each shows the same feelings / symptoms / note panel as Currently Fronting.",
      },
      {
        type: "fix",
        text: "System Meetings: the Open Dialogue space now works exactly like system chat (signposts, whispers, formatting), lives under Invite Sharing, and anyone you signpost is added to who's near. A note clarifies every field is optional.",
      },
      {
        type: "improve",
        text: "Settings → Appearance: the mobile bottom bar starts collapsed with a matching header, and the size sliders no longer get nudged while you scroll.",
      },
      {
        type: "feature",
        text: "System Meetings: turn on \"Open dialogue\" to get a chat space just for that meeting where alters can talk back and forth; the whole conversation saves with the meeting.",
      },
      {
        type: "improve",
        text: "System Meetings: pick who's present from a searchable list instead of typing each name.",
      },
      {
        type: "fix",
        text: "Appearance: the built-in preset, wave-colour, and font dropdowns no longer get cut off or covered — they open fully now.",
      },
      {
        type: "improve",
        text: "Appearance: the UI-size slider now shows a tick for every step; Dashboard, the bottom bar, and Upcoming plans are grouped into one \"Layout\" section, and the bottom-bar config autosaves.",
      },
      {
        type: "improve",
        text: "Settings → Appearance fully reorganised: UI size + touch/nav sliders up top, fonts as direct rows, a tidier Theme section (preset swatch dropdown, custom colours, wave colour), then Corner style, Presets, and Layout.",
      },
      {
        type: "feature",
        text: "Saving a theme preset now lets you pick exactly which parts to include — colours, fonts, UI size, corner style, layouts, system banner, terminology, and more.",
      },
      {
        type: "feature",
        text: "Profile style: set a full per-page colour palette (all 8 theme colours) that overrides the app theme on that profile — and the background colour now shows through as you lower the image opacity, filling the cards and inputs.",
      },
      {
        type: "improve",
        text: "The header wave colour can now be any of your palette colours or a fully custom colour.",
      },
      {
        type: "improve",
        text: "Removed the dashboard-grid editor from Settings — rearrange the dashboard grid directly on the dashboard page.",
      },
      {
        type: "fix",
        text: "Profile background colour no longer washes the whole page over a background image — it now fills the cards and entry windows (bio, sections, inputs) in both view and edit mode, with a \"Surface opacity\" slider to let the image show through.",
      },
      {
        type: "improve",
        text: "Removed the redundant \"labels in lists\" setting from Appearance — switch a name between display name, alias, or both from the toggle shown inline wherever alters are listed.",
      },
      {
        type: "improve",
        text: "Profile style: the Background and Text colour pickers now sit side by side to save space.",
      },
      {
        type: "improve",
        text: "Profile style: with a background image set, your background colour now fills the cards (bio, sections), and you can tune header opacity, image opacity, and a readability tint over the image.",
      },
      {
        type: "improve",
        text: "The alter profile's Edit page now matches the Add New Alter screen: avatar beside the name, and a single \"first appearance\" field replacing the separate birthday + origin-year fields.",
      },
      {
        type: "improve",
        text: "New alters no longer have a groups field while being created — you assign groups and subsystems from the profile once it's saved.",
      },
      {
        type: "improve",
        text: "In the Profile style editor, the Body options now sit directly under \"Profile style\" instead of in their own dropdown — only the Header stays collapsible.",
      },
      {
        type: "improve",
        text: "The Add/Edit alter screen now uses the same Profile style editor as everywhere else, gaining background-opacity and readability controls.",
      },
      {
        type: "improve",
        text: "Refreshed the first-run welcome screen with the app icon and a clearer description of what Oceans Symphony does.",
      },
      {
        type: "fix",
        text: "Colour pickers now respond to taps when opened from the Add New Alter / Group editors — previously the popup didn't register input and taps fell through to the page behind it.",
      },
      {
        type: "improve",
        text: "The first-run welcome and storage-setup screens are now a single screen, with a warmer, clearer intro.",
      },
      {
        type: "fix",
        text: "The \"choose root alter\" and \"parent group\" dropdowns in the alter/group editors no longer pop up in the wrong place or get cut off.",
      },
      {
        type: "improve",
        text: "The \"Parent group\" picker is now a nested, searchable dropdown that respects your group/subsystem nesting, and the members + subsystem options sit higher up the Add New Group form.",
      },
      {
        type: "improve",
        text: "Creating a group from Manage Groups now opens the full Add New Group screen (avatar, colour, bio, profile style) instead of just a name box.",
      },
      {
        type: "feature",
        text: "Triple-tapping to open the Grocery List privacy cover now shows a one-time \"What's this?\" explainer, with controls to change how many taps trigger it — or turn it off.",
      },
      {
        type: "improve",
        text: "Editing an alter's or group's profile from its page now uses the same tidy Header/Body style editor — including font choices — as the add-new screens.",
      },
      {
        type: "fix",
        text: "Profile background images no longer show a second, scrolling copy — the background is now a single fixed layer behind the whole page.",
      },
      {
        type: "improve",
        text: "The welcome intro now appears first, before the storage setup, when you open the app for the first time.",
      },
      {
        type: "improve",
        text: "Adding members while creating a new group now opens the full Manage Members picker (search, filters, grid/list) instead of a small dropdown — and all members stay visible there regardless of a group's hide settings.",
      },
      {
        type: "fix",
        text: "The colour pickers in the Add New Alter / Add New Group editors now open on top of the editor instead of behind it.",
      },
      {
        type: "improve",
        text: "Avatar buttons in the alter and group editors now wrap neatly under the picture instead of overflowing past it.",
      },
      {
        type: "improve",
        text: "Profile font choices now offer the same font list as Settings → Appearance.",
      },
      {
        type: "improve",
        text: "Assigning a new alter to groups now uses a nested, expandable picker that respects your group/subsystem nesting, instead of a flat dropdown.",
      },
      {
        type: "feature",
        text: "The Add/Edit alter screen is redesigned: name and avatar sit up top, a single \"first appearance\" field replaces the old birthday/origin-year pair, and there's a full bio editor.",
      },
      {
        type: "feature",
        text: "New Profile Style section when adding or editing an alter — set a header and background colour, image, text colour, and font, with the header styled separately from the body.",
      },
      {
        type: "feature",
        text: "Redesigned the Add New Group screen: avatar, subsystem root, parent group, a searchable member picker, bio, and the same Profile Style controls.",
      },
      {
        type: "feature",
        text: "New Group config (formerly member visibility): hide a group's members from Set Front, Friends, mentions/signposts/whispers, authorship lists, system maps, and analytics.",
      },
      {
        type: "feature",
        text: "First launch now opens with a short welcome explaining what Oceans Symphony is, before setup.",
      },
      {
        type: "fix",
        text: "The first-run disclaimer is no longer cut off at the top and bottom by the header and navigation bars.",
      },
    ],
  },
  {
    date: "June 1, 2026",
    changes: [
      {
        type: "improve",
        text: "The whole Settings menu now follows one clean layout — every section is a tidy list of collapsible subsections (collapsed by default), matching the redesigned Profile section.",
      },
      {
        type: "fix",
        text: "A group/subsystem's background image now fills the whole screen, not just the area behind the content.",
      },
      {
        type: "improve",
        text: "Profile settings polish: the view-count moved into the Profile header bar, the picture's buttons now wrap neatly under the picture, the banner preview tracks the height slider again, and the bio editor's Plain/Simple/Blocks/Raw switch is now icon-only.",
      },
      {
        type: "fix",
        text: "Press-and-hold menus (groups, alters, filters) no longer get cut off at the bottom behind the navigation bar.",
      },
      {
        type: "fix",
        text: "A group/subsystem's background image now stretches edge-to-edge instead of sitting in an inset, rounded box.",
      },
      {
        type: "improve",
        text: "Group/subsystem profiles can now set a Page text colour and Header text colour, the same as alter profiles.",
      },
      {
        type: "improve",
        text: "Settings section icons are now minimal, monochrome icons that follow your theme colour instead of colourful emoji.",
      },
      {
        type: "improve",
        text: "Profile settings rebuilt to match the new layout: picture and banner sit side by side with icon-only buttons, the terminology preset moved to the top and is now a dropdown, and banner options stay tidy in a collapsible section.",
      },
      {
        type: "improve",
        text: "Settings → Notifications now explains why out-of-app alerts (like a friend changing front) can lag or be missed when the app is closed, with steps to make Android background activity more reliable.",
      },
      {
        type: "improve",
        text: "Settings is getting a cleaner, more consistent layout. The Profile section is first: icon-only image buttons, and the banner options and terminology are now tidy collapsible subsections. More sections to follow.",
      },
      {
        type: "fix",
        text: "Friends: fixed friends sometimes seeing \"no one is fronting\" for your system even when someone was up front — the app was briefly sending an empty front while it loaded.",
      },
      {
        type: "fix",
        text: "Friends: friend-front alerts no longer come through twice. While the app is open you'll get an in-app toast; the out-of-app notification is handled separately so they don't double up.",
      },
      {
        type: "improve",
        text: "The bulletin Quick task's activity picker is now a nested, expandable list that keeps your category folders — the same as the Quick Check-In.",
      },
      {
        type: "improve",
        text: "Tidied the bulletin Quick task: Due date and Scheduled now share one pill, and Pin-to-dashboard + Mark-urgent moved inside the Priority pill.",
      },
      {
        type: "fix",
        text: "Activity day view no longer repeats your check-in emotions under every activity (and on every hour a long activity spans) — they now appear once, at the time you logged them.",
      },
      {
        type: "improve",
        text: "You can now choose how long \"infer presence from authored content\" counts around each post (30 minutes up to 6 hours) in Settings → Appearance.",
      },
      {
        type: "fix",
        text: "Custom fields on the Profile tab now show their rich text (colours, links, etc.) correctly instead of raw code.",
      },
      {
        type: "fix",
        text: "In the bio editor you can now apply a font and a text colour to the same text (and stack a highlight on top) — before it only kept one.",
      },
      {
        type: "improve",
        text: "Formatting toolbars now always open collapsed; tap \"More\" for the extra tools.",
      },
      {
        type: "improve",
        text: "PluralKit import no longer duplicates members you already imported from Simply Plural — it now matches on name, alias, or display name. Added an option to import using each member's PluralKit display name.",
      },
      {
        type: "fix",
        text: "Whispers are now clearly visible — they show a \"🔒 tap to reveal\" pill instead of a blank gap, so you can always see and tap them.",
      },
      {
        type: "improve",
        text: "The /w whisper now works partway through a message, not just at the start. The \"hide the whole thing?\" warning only appears if you use /w without [brackets] mid-message.",
      },
      {
        type: "feature",
        text: "Whispers now work in your notes too — \"/w @name [secret]\" hides the bracketed part in alter notes, to-do details, and activity/check-in notes, the same as in chat and bulletins.",
      },
      {
        type: "feature",
        text: "Whisper privately anywhere you post: type \"/w @name [secret]\" in chat, a bulletin, or a comment and only the bracketed part hides behind a tap-to-reveal bar. Leave the brackets off to hide the whole post.",
      },
      {
        type: "fix",
        text: "Links to other pages in the app now stay clickable after you send a chat message or post a bulletin — before they turned into plain text.",
      },
      {
        type: "improve",
        text: "The chat formatting toolbar now starts hidden — tap Format above the message box to reveal the bold/colour/etc. buttons. The channel list is no longer see-through, and the \"Direct Messages\" section is now \"Private channels\".",
      },
      {
        type: "improve",
        text: "On phones the chat channels list now slides in from the left as an overlay instead of replacing the conversation, and its button moved to the left of the chat header. Tap a channel or tap outside to slide it away.",
      },
      {
        type: "feature",
        text: "Private chat channels now double as a privacy safeguard: when none of their alters are fronting, the channel name is hidden in the sidebar and opening it asks \"this channel is private to X — view anyway?\". When a member is fronting it's fully open with no prompt.",
      },
      {
        type: "fix",
        text: "The \"Who's fronting?\" picker in Quick Check-In now has the same swipe gestures as the Set Fronters modal — tap to toggle, swipe-left (or hold) for primary, swipe-left-then-up to solo.",
      },
      {
        type: "improve",
        text: "Chat sidebar has an Edit button up top: turn it on to drag channels and categories into a new order (within their group) or tap any of them to edit. The new-channel/new-category toggle now reads plainly, and category colours use the app's full colour picker.",
      },
      {
        type: "feature",
        text: "System chat now has real nestable categories: the New button toggles to \"New category\" to make colour-coded, collapsible categories (up to 3 deep) and pick which channels go in them — channels show indented under their category, new categories sit at the top. Existing categories migrate automatically.",
      },
      {
        type: "improve",
        text: "The fronting shortcuts in the Quick Actions menu now use the same gestures as everywhere else: tap to set/add, swipe-left or long-press to make primary, swipe-left-then-up to solo, swipe-right to toggle front.",
      },
      {
        type: "improve",
        text: "The bulletin-board Quick task now has all the to-do options — due date, scheduled date, activity, priority, a goal, a note, plus Pin-to-dashboard and Mark-urgent toggles — each as an expandable pill so it stays tidy.",
      },
      {
        type: "improve",
        text: "You can now mark a to-do urgent straight from the bulletin board: press and hold the task and choose \"Mark as urgent.\"",
      },
      {
        type: "improve",
        text: "Formatting toolbar: added a \"clear formatting\" eraser button (strip styles / go back to plain text), and the \"?\" guide now explains that colours and Fun effects apply to text you've selected first.",
      },
      {
        type: "improve",
        text: "PluralKit member import now lets you choose how it reconciles — update + add new (default), only add new, or replace all — like the Simply Plural import.",
      },
      {
        type: "fix",
        text: "Export to PluralKit was silently failing: locally-uploaded avatars and HTML bios no longer break the upload (local images are skipped; bios send as plain text), and failures now tell you why.",
      },
      {
        type: "fix",
        text: "Emotion analytics no longer lists deleted or legacy alters as raw ID strings — unrecognized alters are skipped.",
      },
      {
        type: "improve",
        text: "The Plain bio editor — also used for journals and profile fields — now shares system chat's upgraded toolbar: toggle-style bold/italic/headings (tap once, keep typing styled), the tidy Basic/More/Fun layout with a \"?\" guide, the censor bar, and the template-field button.",
      },
      {
        type: "feature",
        text: "Analytics can now infer who was present from what alters write: posting a chat message, bulletin, or journal counts as being \"around\" for ~2 hours, so activities, emotions and symptoms get attributed to that alter even without fronting tracking. On by default — toggle in Settings → Customization.",
      },
      {
        type: "improve",
        text: "Each \"Coming up\" plans panel on the dashboard now keeps its own count/time-window — so you can have one showing just today and another showing the week. (It used to be a single shared setting.)",
      },
      {
        type: "improve",
        text: "Quick plans (no set time) now show in their own section at the top of the Activity Tracker's day view, instead of being tucked into the 11pm slot.",
      },
      {
        type: "improve",
        text: "Whisper messages now stay hidden (blurred) until tapped. If a recipient is currently fronting it reveals on tap; otherwise it first asks \"this message is only intended for X — display?\".",
      },
      {
        type: "improve",
        text: "Quick tasks from the bulletin board now expand into pills — set a due date, priority, note, or pin it to the dashboard without leaving the board.",
      },
      {
        type: "improve",
        text: "The \"Plan something\" box on the dashboard is slimmer so it takes up less space.",
      },
      {
        type: "improve",
        text: "The system picture and banner can now be picked from your saved Image Assets, not just uploaded or pasted as a URL.",
      },
      {
        type: "fix",
        text: "The system banner no longer shows on individual alter or subsystem profiles (they have their own background) — it stays on the dashboard and alters page.",
      },
      {
        type: "improve",
        text: "System chat composer now formats text inline as you type — bold looks bold, no raw tags — just like the Plain bio editor, with @mentions, -signposts, and /w whispers all still working.",
      },
      {
        type: "improve",
        text: "Chat formatting buttons now toggle like a normal editor: tap Bold and keep typing in bold until you tap it off (same for italic, headings, lists, etc.) — no need to select text first.",
      },
      {
        type: "feature",
        text: "Direct Messages in system chat: mark a channel \"Private\" to limit it to specific alters — it shows under a Direct Messages section with a lock, and only those alters can be picked as the speaker.",
      },
      {
        type: "feature",
        text: "System chat whispers: type \"/w @name your message\" to post a private, lock-marked whisper to specific alters in the channel.",
      },
      {
        type: "feature",
        text: "New Authorship analytics (Analytics → Authorship): see what each alter has written across chat, the bulletin board, comments, and journals.",
      },
      {
        type: "fix",
        text: "An alter's background image now fills the whole profile screen too (same fix as groups) — the header image still stays up top as the banner.",
      },
      {
        type: "fix",
        text: "A group/subsystem's background image now fills the whole screen instead of being trapped in the header — the separate header image still stays up top as the banner.",
      },
      {
        type: "improve",
        text: "System chat and the bulletin board now share the same smart @mention / -signpost picker, and it's newly available on alter notes and the dashboard status field.",
      },
      {
        type: "improve",
        text: "The @mention picker is smarter everywhere it appears (check-ins, tasks, activities, journals): it now works when you edit mid-text — not just at the end — and shows avatars, your custom alter labels, and respects \"hide from mentions\".",
      },
      {
        type: "feature",
        text: "New censor bar: wrap text in ||double bars|| (or tap the new toolbar button) to hide it behind a bar that reveals when tapped — handy for sensitive info, in bios, bulletins, and chat.",
      },
      {
        type: "improve",
        text: "Formatting toolbar: the \"?\" guide now shows the real button icons, the float/wave text effects actually animate now, and the bio-only \"make editable\" button no longer clutters the chat box.",
      },
      {
        type: "fix",
        text: "Editing a repeating plan's whole series no longer forces one occurrence's done/scheduled state onto the others — each keeps the status that fits its own date.",
      },
      {
        type: "hotfix",
        text: "Internal hardening: safer encryption-password changes, an image-block parsing fix, and grounding-preference import de-duplication.",
      },
      {
        type: "fix",
        text: "Front/primary pop-up messages and buttons now use your custom terms (e.g. \"headmate\" instead of \"fronter\") instead of the hardcoded defaults.",
      },
      {
        type: "fix",
        text: "The link button in the Plain bio editor now opens a proper input box (it used a browser prompt that did nothing in the app).",
      },
      {
        type: "fix",
        text: "Weekly goal progress now counts only this week's activities that actually happened (scheduled/skipped/cancelled plans no longer inflate it).",
      },
      {
        type: "fix",
        text: "\"Upcoming plans\" no longer shows an empty header for plans you've already marked done/skipped, and a same-day quick plan stays \"scheduled\" all day instead of flipping to logged late at night.",
      },
      {
        type: "fix",
        text: "@mentions no longer fire for the wrong alter — mentioning \"@Sam\" no longer also pings \"Samantha\" (and vice-versa).",
      },
      {
        type: "fix",
        text: "System banner no longer overflows the screen width (it was causing the whole app to scroll sideways).",
      },
      {
        type: "fix",
        text: "System Chat: the message box and formatting bar no longer get pushed off the bottom of the screen as messages pile up.",
      },
      {
        type: "improve",
        text: "Simplified the chat/text formatting bar: clearer icons and just the basics by default, with structural tools (headings, lists, quote, alignment…) under \"More\" and the decorative effects under a nested \"Fun\". A \"?\" guide explains them.",
      },
      {
        type: "fix",
        text: "Alter avatars now show everywhere again — the alters list, group/subsystem member lists, current-fronters chips, and the press-and-hold menu were showing a blank icon for some saved images.",
      },
      {
        type: "fix",
        text: "Deleting a bulletin comment no longer fails behind the scenes (it was throwing an error and not refreshing).",
      },
      {
        type: "fix",
        text: "Therapy report: the emotion check-in \"who\" column and the Sleep section now fill in correctly instead of coming up blank.",
      },
      {
        type: "fix",
        text: "Bulletin Board and To-Do List are now listed in the side menu.",
      },
      {
        type: "fix",
        text: "Your system banner no longer gets covered up on the Groups manager and Privacy pages.",
      },
      {
        type: "fix",
        text: "Front history: hovering a session shows its note text instead of raw code, and downloading the extra fonts now reports failure correctly when you're offline.",
      },
      {
        type: "hotfix",
        text: "Deleted chat messages no longer show up in search; separated reminder/plan notification id ranges; corrected the encryption detail in the privacy notice.",
      },
      {
        type: "fix",
        text: "PluralKit import no longer duplicates alters that came from Simply Plural — it now matches existing alters by name and links them to PluralKit, so re-imports update them in place. (Existing duplicates can still be merged via System History.)",
      },
      {
        type: "improve",
        text: "Formatting toolbar: added a \"?\" button that explains what each tool does (advanced tools tucked under \"More\"), and the font menu no longer hides behind other elements in the system chat.",
      },
      {
        type: "improve",
        text: "System banner: added a soft readability wash behind the top of the page so titles and headers stay legible over the image.",
      },
      {
        type: "fix",
        text: "The Activity Tracker no longer paints over your system banner — it now shows behind the top of the page like everywhere else.",
      },
      {
        type: "improve",
        text: "The banner height slider now previews the real height as you drag it.",
      },
      {
        type: "improve",
        text: "Your system banner now shows edge-to-edge behind the top of your pages, with controls for its height, image position, and which pages it appears on (Settings → System Profile).",
      },
      {
        type: "improve",
        text: "Merged the separate system description into the system bio — now just one place to write about your system.",
      },
      {
        type: "fix",
        text: "Activity tracker week view: the hour labels now line up with the top of each row (where the hour begins) instead of the middle.",
      },
      {
        type: "improve",
        text: "Bulletin board \"Plan something…\" is now a single line that expands when you tap it, with a Quick-plan toggle — and it now properly creates the plan in your Activity Tracker.",
      },
      {
        type: "fix",
        text: "Fixed editing a profile bio template: typing into a template field in the Simple editor now saves instead of being silently discarded.",
      },
    ],
  },
  {
    date: "May 31, 2026",
    changes: [
      {
        type: "fix",
        text: "Activity tracker day view: the hour labels now sit at the top of each hour's cell (where the hour begins) instead of floating in the middle.",
      },
      {
        type: "feature",
        text: "New \"Rich text\" custom field type — write formatted notes (bold, lists, links, images) on a profile and they show up formatted.",
      },
      {
        type: "feature",
        text: "Your system now has its own profile — add a banner image and a longer formatted bio (Settings → System Profile), shown at the top of the alters page.",
      },
      {
        type: "improve",
        text: "Added 14 more fonts (Quicksand, Comfortaa, EB Garamond, Bebas Neue, JetBrains Mono…) as an optional one-time download in Settings → Appearance, so they don't bloat the app for everyone.",
      },
      {
        type: "improve",
        text: "Groups and subsystems now show their name in their own colour across the app — in folders, breadcrumbs, profiles, and menus — kept readable against your theme.",
      },
      {
        type: "feature",
        text: "Make a quick plan right from the bulletin board — type a title to schedule it for today, with optional time, category, length, and more behind tap-to-expand pills.",
      },
      {
        type: "improve",
        text: "Bulletin board: the full post box now opens as soon as you tap the field, not once you start typing.",
      },
      {
        type: "improve",
        text: "Logging an activity: if your search doesn't match anything, you can now create that activity right there — everywhere activities are picked.",
      },
      {
        type: "fix",
        text: "System Chat: removed an empty gap that appeared below the channel list and message box until you scrolled.",
      },
      {
        type: "fix",
        text: "Alter profile background images now show behind the whole page again, not just the header — including ones that previously appeared blank.",
      },
      {
        type: "improve",
        text: "Ending a sleep log now works just like logging a past sleep — set interruption counts/times, save the note to your Dream Journal, and it records your notes correctly.",
      },
      {
        type: "improve",
        text: "Wider image support: WebP, AVIF and animated images now keep their transparency and animation instead of being flattened.",
      },
      {
        type: "fix",
        text: "Alters grid: expanding a nested subsystem no longer expands every other copy of that alter. Deeper subsystems now drill in with a breadcrumb (like the list view) instead of redirecting to their profile.",
      },
    ],
  },
  {
    date: "May 30, 2026",
    changes: [
      {
        type: "feature",
        text: "Group & subsystem profiles now have tabs: Profile, Board, and Notes. Each group gets its own private bulletin board (posts, comments, polls — just like the main one, but isolated to that group) and its own notes.",
      },
      {
        type: "improve",
        text: "Tapping a group or subsystem on an alter's profile now opens that group/subsystem's profile page.",
      },
      {
        type: "fix",
        text: "System Map: filtering by a group now correctly shows that group's members — it was collapsing to a single alter. You can now filter by subsystem too.",
      },
      {
        type: "improve",
        text: "Group & subsystem profiles: the members list now uses the same chips as the alters page (with correct avatars). Front/primary can't be changed from there, but press-and-hold opens the full menu.",
      },
      {
        type: "improve",
        text: "The press-and-hold alter menu can now remove an alter from a subsystem they belong to.",
      },
      {
        type: "feature",
        text: "Press and hold a pinned alter for the same quick menu as the alters list — open profile, set/remove front, make primary, unpin, add to groups, and more.",
      },
      {
        type: "fix",
        text: "Fixed a bug where a barely-started swipe on a pinned alter could leave taps unresponsive (only scrolling worked). Abandoned swipes now cleanly do nothing.",
      },
      {
        type: "fix",
        text: "The 🖼 \"choose from assets\" picker was showing empty — it now lists every stored image (avatars, backgrounds, uploads, and more), like the Assets page, sorted into folders.",
      },
      {
        type: "improve",
        text: "Image Assets page: folders are now collapsible, you can create/rename/reorder your own folders, and big folders load more images as you scroll.",
      },
      {
        type: "improve",
        text: "Global search now also finds grounding techniques and inner-world map locations.",
      },
      {
        type: "feature",
        text: "New Image Assets page (in the menu): every image you've stored in the app, auto-sorted into folders. Rename, organise into folders, bulk-upload, delete, and reuse any image anywhere.",
      },
      {
        type: "improve",
        text: "You can now insert images from your assets into bios, bulletins, comments and chat — tap the 🖼 button in the toolbar.",
      },
      {
        type: "improve",
        text: "Global search now finds subsystems (opening their profile) and your chat messages too.",
      },
      {
        type: "feature",
        text: "New image Assets library: upload images once (in bulk too), sort them into folders, and reuse any of them anywhere that takes a picture — tap the 🖼 button next to any image upload. No re-uploading or duplicate storage, and they're included in backups.",
      },
      {
        type: "improve",
        text: "Avatars, headers and backgrounds (on alter and group profiles, and the add-new form) now have a \"choose from assets\" button beside Upload.",
      },
      {
        type: "feature",
        text: "If an alter owns several subsystems, you can set a custom image for their combined subsystems chip — pick it from your assets in their edit profile.",
      },
      {
        type: "improve",
        text: "The alters page search bar and filters now sit just above the alters list (below the groups section).",
      },
      {
        type: "improve",
        text: "Groups and subsystems now show their own custom image (when set) everywhere their icon appears — folders, choosers, menus and chips — not just in a couple of spots.",
      },
      {
        type: "improve",
        text: "System Chat: the \"choose speaker(s)\" picker is now a clean centered popup with search, instead of floating behind the keyboard.",
      },
      {
        type: "improve",
        text: "Coming back from an alter's profile now returns you to where you were in the alters list — the nested subsystem or group you were browsing — instead of jumping to the top.",
      },
      {
        type: "improve",
        text: "In the alters list, deeply nested subsystems now \"drill in\" with a breadcrumb (like the groups section) instead of opening the subsystem's profile — so you can keep exploring on the same page and tap the breadcrumb to back out.",
      },
      {
        type: "improve",
        text: "Creating a member from a subsystem now opens the full \"Add new\" form prefilled into that subsystem, so you can fill out the whole profile at once. That form can now also drop the new alter into groups/subsystems.",
      },
      {
        type: "fix",
        text: "You can now set an alter's emoji from their edit profile page, not only when first adding them.",
      },
      {
        type: "improve",
        text: "In the alters list, expanding a subsystem now highlights its icon in a brighter shade of the subsystem's own colour instead of a blue ring.",
      },
      {
        type: "improve",
        text: "The groups section of the alters page now behaves like the alters section: swipe a member to set front, press and hold for the quick menu, names/icons blur with screenshot mode, and the grid/list view applies.",
      },
      {
        type: "feature",
        text: "Press and hold a group folder for a popup to manage members, assign a \"root\" (turn it into a subsystem), or open its profile.",
      },
      {
        type: "improve",
        text: "Group profile: the \"Owner\" field is now called \"Root\" and uses a searchable alter picker instead of a plain dropdown.",
      },
      {
        type: "fix",
        text: "Journals: the author filter's alter list can now be scrolled (it was getting clipped).",
      },
      {
        type: "improve",
        text: "Subsystems are now manageable like groups: press and hold one in the alters list (or tap its tile in grid view, or open it in Manage Groups) for a popup to manage members, create a new member, or open its profile.",
      },
      {
        type: "improve",
        text: "The alter press-and-hold menu can now pin or unpin an alter to the top of the alters page.",
      },
      {
        type: "fix",
        text: "GIFs now stay animated when set as a profile background (not just the header) — some uploads weren't being recognised as GIFs and got flattened.",
      },
      {
        type: "fix",
        text: "Member avatars now display correctly in the Manage Group Members picker.",
      },
      {
        type: "improve",
        text: "The bio editor's mode help now accurately explains Plain, Simple (edit only template-marked spots), Blocks, and Raw.",
      },
      {
        type: "improve",
        text: "The alters page filter is now a proper popup: switch between nested/flat lists, multi-select groups and subsystems (searchable pills), match Any or All of them, and Clear all.",
      },
      {
        type: "fix",
        text: "Fixed a bug where tapping a group in the groups section could carry through and open an alter's profile that appeared underneath it.",
      },
      {
        type: "feature",
        text: "Press and hold an alter on the alters page for a quick menu: open their profile, create or open their subsystem, add/remove from front, make/demote primary, or add them to groups.",
      },
      {
        type: "improve",
        text: "An alter's subsystems now show on their profile, just below Groups.",
      },
      {
        type: "improve",
        text: "The profile's group editor is now labelled \"Edit groups\" and splits Groups and subsystems into separate tabs.",
      },
      {
        type: "feature",
        text: "Bulletin comments and replies now have a Fancy mode too — tap the ✨ button by the box for a formatting toolbar plus image/GIF upload. Comments also show @mentions as links now.",
      },
      {
        type: "feature",
        text: "System Chat now supports formatting and image/GIF uploads — a toolbar sits under the message box. @mentions and -signposts work exactly as before.",
      },
      {
        type: "improve",
        text: "Press and hold a subsystem in the alters list (or a group in the groups section) to jump straight to its profile page. Holding is ignored while you're scrolling.",
      },
      {
        type: "feature",
        text: "Groups can now hide their members from the alters list and/or from @mention & -signpost suggestions — toggle these on the group's profile page.",
      },
      {
        type: "feature",
        text: "The alters page has a new filter next to search: show just one group's or subsystem's members, or list every alter flat (unnested).",
      },
      {
        type: "feature",
        text: "Bulletin board now has a Fancy mode — a formatting toolbar (bold, colours, headings, boxes, fonts) plus image and GIF upload. Toggle Simple/Fancy above the box; @mentions and -signposts work exactly the same either way.",
      },
      {
        type: "improve",
        text: "In the alters list, the subsystem expander now sits next to the activity bolt (instead of below the chip) and can show the subsystem's own avatar — matching the groups section.",
      },
      {
        type: "fix",
        text: "Member profile pictures now display correctly on group/subsystem profile pages.",
      },
      {
        type: "improve",
        text: "Expanding an empty subsystem in the alters list now shows an \"add a member\" slot so you can populate it right there.",
      },
      {
        type: "improve",
        text: "You can now open a group or subsystem's profile straight from Manage Groups (an open-profile button on the selected group).",
      },
      {
        type: "feature",
        text: "Groups and subsystems now have their own profile page — give them a name, emoji, colour, avatar, banner/background, description, an owner (which makes it a subsystem), and manage members, just like an alter's profile. Tap a subsystem to open it.",
      },
      {
        type: "fix",
        text: "You can now expand a nested subsystem right inside the alters grid — before, it only opened the profile.",
      },
      {
        type: "improve",
        text: "Subsystems are hidden from the Groups list by default now; a Subsystems toggle reveals them there when you want.",
      },
      {
        type: "improve",
        text: "In the alters list, the subsystem expander shows the subsystem's own folder icon (or its avatar, if you set one), matching the groups section.",
      },
      {
        type: "fix",
        text: "Animated GIFs now stay animated when set as a profile picture, banner, or background (they were being flattened to a still). Large GIFs show a quick storage warning.",
      },
      {
        type: "fix",
        text: "Tapping a subsystem on an alter's profile now opens the member editor right there, instead of jumping you to the Groups page.",
      },
      {
        type: "improve",
        text: "When adding members to a subsystem, alters that would create a loop are greyed out with a short explanation, so the nesting can't get corrupted.",
      },
      {
        type: "feature",
        text: "Alters grid view: a subsystem owner now has a \"Members\" chevron — expanding it shows the subsystem's members in a tinted card (in the owner's colour) right below them, so it's clear who belongs to it.",
      },
      {
        type: "improve",
        text: "Manage Groups now has a separate Subsystems tab, so alter-owned subsystems no longer mix in with your regular groups. Tap one to manage its members.",
      },
      {
        type: "feature",
        text: "Bio editor (Plain mode): an image button in the toolbar lets you upload a picture straight into your bio — no need to switch to the Blocks editor. Animated GIFs keep their animation.",
      },
      {
        type: "improve",
        text: "Bio editor: a help button (?) now explains what the Plain / Simple / Blocks / Raw editing modes each do.",
      },
      {
        type: "fix",
        text: "Opening a subsystem no longer lists every alter — it now correctly shows just that subsystem's members.",
      },
      {
        type: "fix",
        text: "The Manage Group Members picker no longer lists archived alters.",
      },
      {
        type: "improve",
        text: "Manage Group Members: tap anywhere on an alter's row to add/remove them — no need to hit the small checkbox.",
      },
      {
        type: "improve",
        text: "Pinned gallery: fronting alters are now shown with a larger icon (like the alters grid) instead of a glow.",
      },
      {
        type: "feature",
        text: "Subsystems now nest right in the alters list: an alter that owns a subsystem shows an expander on their row, and tapping it reveals the members indented beneath (deeper subsystems keep expanding, switching to an \"open\" link once the nesting gets too deep to stay readable).",
      },
      {
        type: "fix",
        text: "Alters listed inside a group on the alters page now render as a single clean row (matching the main alters list) instead of a doubled-up box-in-a-box.",
      },
      {
        type: "fix",
        text: "Hardened against a rare freeze where the app stopped responding to taps (but still scrolled) after the phone slept and woke. An interrupted drag of the floating Grounding bubble could leave touch handling wedged; that state is now always cleaned up when the app goes to the background.",
      },
      {
        type: "improve",
        text: "Pinned gallery: fronting alters now have a bold glowing ring so it's clear at a glance who's active.",
      },
      {
        type: "improve",
        text: "Pinned gallery: the sole-fronter gesture is now a deliberate swipe up, THEN left (not a loose upper-left diagonal), so it won't fire by accident.",
      },
      {
        type: "feature",
        text: "Subsystems: when an alter inside a subsystem owns their own subsystem, a folder button on their row lets you drill into it — nested navigation with breadcrumbs, like groups.",
      },
      {
        type: "fix",
        text: "The floating Grounding bubble can no longer be dragged up behind the top header where it got stuck — it now stays clear of the header, and any bubble already stuck there is freed on next open.",
      },
      {
        type: "feature",
        text: "Subsystems (first part): an alter can own a group as their subsystem. Create one from the alter's profile (Groups section → Create subsystem); when you open that group the parent alter shows at the top. More subsystem tools are on the way.",
      },
      {
        type: "fix",
        text: "Fixed the app becoming unresponsive — header and bottom nav not tapping — after pinning an alter. A pin popup could get stuck over the screen; that popup is gone, and pinning now lives as a Pin button on the alter's profile.",
      },
      {
        type: "improve",
        text: "Once you've pinned an alter, the pinned gallery now appears on the dashboard automatically, just below Currently Fronting. Hide it anytime in Settings → Appearance → Dashboard layout.",
      },
      {
        type: "improve",
        text: "Pinned gallery gestures: tap an alter to open them, swipe up to add to front (or toggle primary if they're already fronting), swipe down to remove from front, and swipe up-and-right to make them the sole fronter. The chip follows your finger — so if you grab one by accident while scrolling, you can move it back to the middle and nothing happens.",
      },
      {
        type: "fix",
        text: "Pinned gallery on the dashboard now lands just below Currently Fronting instead of at the bottom of the page.",
      },
      {
        type: "improve",
        text: "The pinned-alters gallery can now be added to the Dashboard too — turn it on under Settings → Appearance → Dashboard layout.",
      },
      {
        type: "fix",
        text: "Markdown in text custom fields now renders on the alter's Profile tab, not just the Info tab.",
      },
      {
        type: "feature",
        text: "Alters can have an emoji/symbol — set it next to the name in the edit screen, and it shows beside their name on the profile and in lists.",
      },
      {
        type: "feature",
        text: "Pin alters! Tap the Pin button at the top-left of an alter's profile and they appear in a quick-access gallery at the top of the alters page (and on the dashboard). It's just a shortcut — they stay in their group and list too.",
      },
      {
        type: "feature",
        text: "Text-type custom fields (and alter-specific fields) now support Markdown — use **bold**, *italics*, lists, and links in them. Other field types are unchanged.",
      },
      {
        type: "fix",
        text: "Removed the duplicate \"Back\" button on alter profiles — the app header already has one.",
      },
    ],
  },
  {
    date: "May 26, 2026",
    changes: [
      {
        type: "improve",
        text: "Bulletin posts and comments now show the actual day and time of day next to the \"N days ago\" — e.g. \"May 26 at 3:42 PM · 2 hours ago\".",
      },
      {
        type: "improve",
        text: "System Check-In feelings now save as a full Quick Check-In — the alters present in Step 2 attach as the check-in's fronting alters, and the sensations + notes text folds into the EmotionCheckIn note. Means analytics, therapy reports, and the Check-In Log all see the full context instead of just an unattributed emotion list.",
      },
      {
        type: "improve",
        text: "Therapy report: \"Diary Cards\" section relabelled to \"DBT tracking\" — the underlying data still flows through, but the standalone Diary Card feature is gone (it's collected automatically when you use Quick Check-In now). PDF, plain-text, and section picker all updated.",
      },
      {
        type: "improve",
        text: "System Check-In step 2 (\"Notice who's near\"): \"Feelings noticed\" is now the same emotion-wheel picker used in Quick Check-In, instead of a free-text box. Past notes still display correctly.",
      },
      {
        type: "feature",
        text: "Settings → Accessibility now has a toggle to hide the floating Grounding bubble. Grounding is still reachable from the sidebar when the bubble is off.",
      },
      {
        type: "improve",
        text: "Check-In Log analytics: hovering a day on any per-day chart now highlights the same day on every other per-day chart — Emotional Balance, Body States, Entry Frequency, Distress Rate, and Mood Trend all share a cursor so you can read across them at once.",
      },
      {
        type: "fix",
        text: "Check-In Log analytics distress rate now actually works — it counts check-ins that include an emotion you've marked distressing (Settings → Emotions), instead of relying on a flag that nothing in the app ever sets.",
      },
      {
        type: "improve",
        text: "Check-In Log analytics: new \"Body & Nervous System States\" card breaks every body-category emotion into Calm / Flight / Fight / Freeze / Collapse, with a balance bar and per-day stacked trend.",
      },
      {
        type: "improve",
        text: "Added a Discord support server link to the top of Settings, next to Template gallery and Latest releases.",
      },
      {
        type: "improve",
        text: "Quick plans always default to today — even when the quick-plan toggle was already on from a previous use. Regular plans still default to tomorrow.",
      },
      {
        type: "improve",
        text: "Check-In Log analytics: emotions now grouped by Good / Neutral / Bad / Body category (taken from the emotion wheel) with an overall balance bar + per-day stacked trend. New \"Time of Day\" chart shows when you check in and which hours skew distressing. Per-alter patterns table surfaces each alter's dominant emotion category, top emotion, and distress rate. New \"When Distress Showed Up\" section finds the symptoms, emotions, and activities that co-occurred within ±30 minutes of each distress check-in.",
      },
      {
        type: "improve",
        text: "Check-In Log analytics now pulls from check-ins, symptom check-ins, status notes, per-alter session emotions/symptoms, activities, and diary cards — not just diary cards. New \"Entry Frequency\" and \"Distress Rate\" charts replace the always-empty Intensity chart, plus a summary card with totals at the top.",
      },
      {
        type: "fix",
        text: "Check-In Log analytics now shows a helpful hint when your selected range is empty but you have entries outside it — and the Analytics button is now always available, not gated on diary cards.",
      },
      {
        type: "fix",
        text: "Changing the \"front\" terminology now auto-conjugates correctly — typing \"control\" as the base term gives you \"controlling\" / \"controller\" instead of leaving stale \"fronting\" / \"fronter\" overrides in place. (If you already saved a bad value, open Settings → Terminology → Advanced and clear the Fronting / Fronter fields manually.)",
      },
      {
        type: "fix",
        text: "Pinch-zoom no longer accidentally opens the grocery list cover — multi-finger gestures (pinching the Inner World map, etc.) now clear the privacy-tap counter instead of adding to it.",
      },
      {
        type: "improve",
        text: "Analytics map now runs its layout in a background thread, so very large systems no longer freeze the page while it builds. A \"Building layout…\" spinner shows while it works, and you can switch tabs or tap around freely in the meantime.",
      },
      {
        type: "feature",
        text: "New \"Show me around\" prompt appears the first time you open each page — explore one page at a time instead of taking the whole tour at once. Toggle or replay in Settings → About & help.",
      },
      {
        type: "improve",
        text: "Tour and welcome guide are less wordy — trimmed the repeated paragraph spelling out every possible way to interpret fronting.",
      },
      {
        type: "improve",
        text: "Default dashboard order: Pinned tasks now sit below the Quick Check-In button so the tour can scroll to the check-in without the bottom bar covering it. Existing custom layouts are untouched.",
      },
      {
        type: "fix",
        text: "Tour layout fixed when it opens a modal — the tour card no longer flies to the top of the screen, and highlights inside modals (sort, triggered, journal in Set Fronters) are now visible.",
      },
      {
        type: "improve",
        text: "Removed the dismissable \"no right way to set front\" hint that appeared every time the Set Fronters modal opened.",
      },
      {
        type: "improve",
        text: "Journals: \"New folder\" and \"New entry\" buttons are stacked vertically and a touch smaller, giving more horizontal room for the folder name and entry count.",
      },
      {
        type: "improve",
        text: "Dashboard: \"Pinned tasks\" now uses the same compact section-label header as Coming up, Pinned, and Active symptoms — no more outlier card with extra padding.",
      },
      {
        type: "improve",
        text: "Native app: top header is a bit shorter, removing the excess space below the title and icons.",
      },
      {
        type: "improve",
        text: "Dashboard: pinned to-dos now look the same whether they were pinned from the To-Do page or from the bulletin board.",
      },
      {
        type: "improve",
        text: "Dashboard: more breathing room between Active Symptoms and the Quick Check-In button.",
      },
      {
        type: "improve",
        text: "Settings → Data & privacy: Backup & Export and Auto-backup are now the first two items in the section, ahead of storage mode and other less-frequent controls.",
      },
      {
        type: "feature",
        text: "Coming-up plans on the dashboard now has its own settings cog — tap it to change how many plans show (count or time window) without opening Settings.",
      },
      {
        type: "improve",
        text: "Active Symptoms popup: severity can now be set to 0 (\"not bothering right now\") without ending the session — handy for quick adjustments while a symptom comes and goes.",
      },
      {
        type: "fix",
        text: "Very large systems no longer crash the Analytics Map. The Analytics tab now shows a friendly \"taking a breather\" message and the Inner World map stays accessible. Working on a better long-term fix for large systems.",
      },
      {
        type: "fix",
        text: "Importing a backup in \"Add new\" mode no longer creates duplicate copies of the default daily tasks.",
      },
      {
        type: "improve",
        text: "Privacy notice on the onboarding screen reads correctly whether you're in the app or in a browser.",
      },
      {
        type: "improve",
        text: "Onboarding screen is a little cleaner — removed the redundant \"Check releases on GitHub\" prompt above the privacy notice.",
      },
      {
        type: "fix",
        text: "Editing a fronter's symptoms from the dashboard no longer wipes symptoms you'd already saved on that session.",
      },
      {
        type: "fix",
        text: "Simply Plural import no longer fails with a network error — the data sync now goes through cleanly.",
      },
      {
        type: "fix",
        text: "Deleting all local data now returns you to the welcome/setup screen instead of an empty dashboard.",
      },
      {
        type: "fix",
        text: "Removed a Back button on the first-run setup screen that didn't go anywhere.",
      },
      {
        type: "improve",
        text: "Cleaned up the dashboard and settings — removed the older-version data-migration banners and the first-launch migration prompt.",
      },
      {
        type: "fix",
        text: "Notification position now works — in-app banners appear in the corner you pick under Notifications → Where they appear, instead of always at the top.",
      },
      {
        type: "fix",
        text: "Number fields (like the dashboard's \"show N bulletins\" and the System Map co-fronter count) can now be cleared and typed into — they no longer snap back to the old value.",
      },
      {
        type: "feature",
        text: "Set front: swipe an alter left then up to clear the current front and make them the sole fronter — handy if your system doesn't co-front. Works on the alters list, dashboard, and Set Fronters screen.",
      },
      {
        type: "fix",
        text: "Daily Tasks: the done/undone toggles no longer look oversized when large touch targets are turned on.",
      },
      {
        type: "fix",
        text: "Dashboard: tapping a pinned daily task now jumps to its page (Journal, Check-in, etc.), like it does on the Daily Tasks page.",
      },
    ],
  },
  {
    date: "May 25, 2026",
    changes: [
      {
        type: "fix",
        text: "System Map no longer freezes the app when opened by systems with a large number of alters.",
      },
      {
        type: "fix",
        text: "Activity Tracker: tapping an activity in the weekly grid now opens its info popover — on touch it often wouldn't appear before.",
      },
      {
        type: "improve",
        text: "Activity Tracker: pinch-to-zoom on the weekly grid is more responsive.",
      },
      {
        type: "feature",
        text: "Daily Tasks: one \"Hide completed\" toggle drops finished tasks from the list; tap it again (\"Show completed\") to reveal them. It sticks across sessions.",
      },
      {
        type: "improve",
        text: "Alter profile: the Alias field now notes that it's used as a shorthand for @ mentions and - signposts.",
      },
      {
        type: "improve",
        text: "Activity Tracker: switching the grid interval (1h / 30m / 15m) now keeps the hour lines in the same place — the row height scales so an hour always occupies the same space. Hour lines are solid and bold, 30-minute lines lighter, and 15-minute lines a light dashed line.",
      },
    ],
  },
  {
    date: "May 24, 2026",
    changes: [
      {
        type: "fix",
        text: "End sleep log: sleep quality is now set with tappable 1–10 buttons instead of a drag slider that wouldn't respond to touch, and the modal scrolls so Save stays reachable.",
      },
      {
        type: "fix",
        text: "Set Fronters: the Save button is no longer pushed off-screen when you expand the triggered-switch options — the toggles now scroll and the buttons stay pinned.",
      },
      {
        type: "fix",
        text: "Toggle switches no longer look oversized/broken when large touch targets are on.",
      },
      {
        type: "fix",
        text: "Chat: the default \"general\" channel no longer duplicates itself. Opening Chat on a fresh load could spawn a new \"general\" before existing channels finished loading.",
      },
    ],
  },
  {
    date: "May 23, 2026",
    changes: [
      {
        type: "feature",
        text: "Weekly Goals can now target a habit, not just an activity category — the goal circle counts that habit's session time. (#248)",
      },
      {
        type: "feature",
        text: "Sleep Tracker: \"Start sleep\" / \"End sleep\" buttons so you can log bedtime when you go to bed and wake time when you wake up, instead of entering both at once.",
      },
      {
        type: "feature",
        text: "New \"Pinned tasks\" card on the dashboard surfaces your recurring Daily Tasks — auto-by-frequency or hand-picked, with a tunable scrollable height.",
      },
      {
        type: "feature",
        text: "Double-tap a fronter chip (dashboard) or a session card (alter History tab) to jump to that session on the Timeline or edit it; jump-to pulses a glow so you can find it.",
      },
      {
        type: "feature",
        text: "Tapping a notification that opens another page now scrolls to and briefly glows the exact item it was about.",
      },
      {
        type: "fix",
        text: "Web app: fixed a \"blank screen of death\" that could appear a day or two after an update (stale cached page pointing at deleted scripts).",
      },
      {
        type: "fix",
        text: "Pinch-to-zoom on the Activity Tracker grid is now snappy instead of laggy.",
      },
      {
        type: "fix",
        text: "Timeline: scrolling down now flows continuously into the previous day instead of dead-ending at the bottom of each day.",
      },
      {
        type: "fix",
        text: "Pinned tasks widget no longer 404s when you tap a task or the \"All\" button.",
      },
      {
        type: "fix",
        text: "Quick Check-In's \"Who's fronting?\" list now shows your alters when opened from a reminder.",
      },
      {
        type: "fix",
        text: "Editing a check-in with a long note now loads the full journal text, not the truncated preview. (#229)",
      },
      {
        type: "fix",
        text: "Adding an Activities, Diary, or Location section to an existing check-in now actually saves. (#229)",
      },
      {
        type: "fix",
        text: "Lineage tab: Emergence events now show as \"Emergence\" (not \"Fusion\"), and co-emerged alters aren't shown as each other's predecessors/successors.",
      },
      {
        type: "fix",
        text: "Alter profile header no longer repeats pronouns/alias when they're already inside the alter's name.",
      },
      {
        type: "fix",
        text: "Group management and the alter Info tab now use your custom terms instead of hardcoded \"members\" / \"System\" / \"Alter\".",
      },
      {
        type: "fix",
        text: "Grocery list: \"New list…\" popup no longer flashes the layout before appearing.",
      },
      {
        type: "fix",
        text: "Preview Mode no longer overrides your text-size / accessibility settings.",
      },
      {
        type: "fix",
        text: "Wiki preview banner now honestly reports when it's behind the current app version instead of always claiming \"up to date\".",
      },
      {
        type: "fix",
        text: "Daily Task \"Sleep logged\" trigger now fires correctly when you end a sleep.",
      },
      {
        type: "improve",
        text: "Saved theme presets now capture every Appearance setting (colours, fonts, theme mode, text size, wave colour, corner style, alter-label mode, dashboard + navigation layout, terms) and restore them all in one shot.",
      },
      {
        type: "improve",
        text: "Quick Support: clearer \"Browse all techniques\" / \"Back to Quick Support\" buttons, a back button on the all-techniques page, and a calming breathing ring on the suggestions screen.",
      },
      {
        type: "improve",
        text: "Activity picker shows coloured \"follow the trail\" dots on parent rows when you've selected something nested inside them.",
      },
    ],
  },
  {
    date: "May 21, 2026",
    changes: [
      {
        type: "fix",
        text: "Activity Details modal: opening it for one activity after editing a different one no longer shows a blank modal — the stale editing-id was making the body render nothing. Edit state now resets when the modal opens or the underlying activity changes.",
      },
      {
        type: "fix",
        text: "Logging an activity with no end time now actually saves with no duration instead of forcing a one-hour-after-start fallback. The Activity Details edit form leaves the End field blank when there's no duration, and saving with a blank End writes `duration_minutes: null`. Read-only view shows \"—\" for End/Duration on instant-style logs.",
      },
      {
        type: "fix",
        text: "Web (oceans-symphony.app) was white-screening with a \"No QueryClient set\" error when boot landed on the unlock / firstrun / recovery screens. Those early-boot branches weren't wrapped in QueryClientProvider, so the grocery panel's useQuery hook crashed the render. Wrapped all three boot branches.",
      },
      {
        type: "fix",
        text: "Reminder banner X button now actually marks the reminder as dismissed in the database, so it (a) doesn't re-fire next session and (b) shows up in the Recently Handled list. Previously the X only hid the visual toast without persisting.",
      },
      {
        type: "fix",
        text: "Backup & Export now shows a clear \"the app needs to reload to pick up the latest assets\" message instead of a raw \"Failed to fetch dynamically imported module\" error when the WebView has a stale chunk reference from a previous build. Underlying problem is a one-time stale cache after an app update — closing + reopening the app resolves it.",
      },
      {
        type: "improve",
        text: "Wave-colour picker: the Background swatch is now an explicit \"Off\" option (with a ⊘ icon) that hides the header wave entirely. Picking the same colour as the page background used to look like a faintly-visible band; now it cleanly hides the wave.",
      },
      {
        type: "fix",
        text: "Contrast adjustment for alter / group / role chips no longer changes colours dramatically. It now shifts lightness by the smallest amount needed to hit the WCAG 3:1 readability bar instead of snapping to a fixed lightness target, so a deep navy stays a deep navy (just visible).",
      },
      {
        type: "fix",
        text: "Wave-colour picker: the Background swatch is now visible even when its fill matches the surrounding card. Added a checkered backdrop behind each swatch so any colour — including one that perfectly camouflages — still reads as a tappable target.",
      },
      {
        type: "feature",
        text: "Wave colour is now user-pickable. Under Settings → Appearance → Wave colour, choose which palette swatch (Background, Surface, Primary, Secondary, Accent, Muted, Text, Text 2nd) fills the header wave at 0.3 opacity. Defaults to Muted.",
      },
      {
        type: "feature",
        text: "Backup & Export now has two buttons: \"Save to device\" drops the file straight into Downloads/Oceans Symphony/ (no share sheet), and \"Share or send elsewhere\" opens the share sheet so you can route the backup to Drive, email, Send to PC, etc. Audited the backup coverage: every non-device-bound entity in the codebase is included.",
      },
      {
        type: "improve",
        text: "Header wave now uses your Muted palette colour at 0.3 opacity instead of Surface, so it reads as a chrome / divider tone rather than competing with the card-background.",
      },
      {
        type: "fix",
        text: "Friend-front-change banners (and a handful of other neutral toasts: reminder dismiss, reminder snooze, push-test progress, bio editor undo/discard, backup-canceled) now respect the Notification Settings toggles. They were bypassing the filter because they used the un-categorised toast() call; routed through toast.info so the Info Messages switch controls them.",
      },
      {
        type: "fix",
        text: "Settings: opening a section no longer makes the page jump to a different scroll position. The accordion now keeps the tapped section's header pinned to the same spot in the viewport even when collapsing an above-the-fold section underneath it.",
      },
      {
        type: "fix",
        text: "Backup & Export on the native Android build now actually saves the file to Downloads/Oceans Symphony/ instead of opening the share sheet. The previous fix wrote the file to MediaStore successfully but then mis-checked the result code (`media-store` vs the real `filesystem`), so every native export fell through to the share fallback even when the silent save had worked.",
      },
      {
        type: "fix",
        text: "Backup & Export on the TWA / web build now actually saves the file to the device's Downloads folder instead of opening the share sheet. The web pathway used to prefer `navigator.share` (which Android renders as a share UI); backup callers now prefer the anchor-download path, which the WebView's download manager writes straight to Downloads.",
      },
      {
        type: "fix",
        text: "Backup & Restore: Import can now actually pick a backup file from Google Drive (and any other cloud picker) — the `.json,.txt` filter blocked Drive entries whose MIME came through as octet-stream. Manual Export now writes straight to Downloads/Oceans Symphony/ on Android instead of forcing the share sheet; if MediaStore isn't available it still falls back to share, so nothing's lost.",
      },
      {
        type: "fix",
        text: "Header wave is now seamless — dropped the separate outline stroke that was overlapping the fill and creating a visible darker edge. Fill opacity dialled down to 0.3 for a barely-there wash.",
      },
      {
        type: "improve",
        text: "The wave block at the top of the header now uses your chosen Surface colour from Appearance → Custom Colors, so the header chrome matches the rest of your theme palette.",
      },
      {
        type: "improve",
        text: "Text & UI Size now appears in BOTH Appearance and Accessibility — same picker, same setting, reachable from whichever section you happen to be in. Font Family still lives only in Appearance.",
      },
      {
        type: "improve",
        text: "Settings page restructured: 11 top-level sections collapsed down to 8, reordered so commonly-tweaked things (notifications, accessibility) sit higher and the rarely-touched stuff (disclaimer, updates, bug report, preview mode) folds into a single \"About & help\" section at the bottom. Section labels are cleaner: \"Alters & Fields\" → \"Alter setup\", \"Tracking & Analytics\" → \"Tracking setup\". Profile stays first.",
      },
      {
        type: "improve",
        text: "Settings page is shorter to scroll: only one section opens at a time now (an accordion), so picking a section auto-closes the others. Reminders moved into the Notifications & toasts section (renamed \"Notifications & reminders\") so related controls live together.",
      },
      {
        type: "fix",
        text: "Notifications & toasts \"Where they appear\" position picker actually moves the toaster now. Sonner's `position` prop wasn't reactive on remount; we re-key the container so each new corner takes effect immediately.",
      },
      {
        type: "fix",
        text: "Set Fronters modal: the Name / Alias / Both toggle now actually changes how alters are labelled in the modal — the list rows, the grid-view cards, the selected-fronter chips at the top, and the avatar fallback initials all honour your label-mode preference. Names also fully use CSS truncation (no more 7-char chop).",
      },
      {
        type: "fix",
        text: "Toast notifications and modal dialogs no longer slide under the device status bar / Spotify pill / notification island at the top, or the gesture chin at the bottom. Toasts get a safe-area-aware offset, and the base Dialog now subtracts both insets from its max height + center calc — fixes every modal in the app at once.",
      },
      {
        type: "feature",
        text: "New Settings → Notifications & toasts: toggle which kinds of in-app banner messages appear (success / info / warning — errors always stay on), pick how long they linger (2s / 4s / 6s / 10s), and move them to any corner of the screen.",
      },
      {
        type: "fix",
        text: "Set Fronters modal: the Name / Alias toggle no longer overlaps the close X in the top-right corner, and the modal stays inside the device safe area so it doesn't slide under the status bar / notification island.",
      },
      {
        type: "fix",
        text: "Tapping an alter in the Set Fronters list no longer accidentally toggles the alter listed above (or below) it. Android's synthetic click after a touch sometimes lands on the neighbouring row — the tap-suppress logic now spans the whole page so the stray click can't fire a second selection.",
      },
      {
        type: "fix",
        text: "Set Fronters modal: the X button on a fronter chip now actually removes them on tap. Previously, on touch, the tap bubbled to the chip's swipe handler — which interpreted it as a primary-toggle — so the only way to deselect was a swipe-right. Same fix applied to FronterPicker.",
      },
      {
        type: "fix",
        text: "Activity Tracker weekly grid: tapping a small activity pill (like a quick-logged pill sitting on top of a Sleep block) now opens THAT activity's details instead of falling through to whatever larger activity sat in the same cell. Each pill has its own tap target now.",
      },
      {
        type: "fix",
        text: "\"You have X planned in N minutes\" banner no longer fires for plans you've already marked done / skipped / cancelled. The banner now only surfaces plans that are still actually scheduled.",
      },
      {
        type: "feature",
        text: "Activity Tracker → Planned now has an Upcoming / Past toggle. Past shows every plan you've already resolved (done, partial, skipped, cancelled), with a status badge next to the name and same horizon filters (today / week / month / year).",
      },
      {
        type: "fix",
        text: "Bio Import Template no longer drops the text from lines that also contain multiple images. A line like `![A](url) **Rinn** Frequent fronter ![B](url)` used to come out as just a 2-image gallery with no text at all; now the prose around the images is preserved as a text block right under the gallery.",
      },
      {
        type: "feature",
        text: "New Settings → Data & Privacy → Quick-tap privacy cover: pick how many quick taps open the Grocery List as a privacy overlay (2 / 3 / 4 / 5), or turn the gesture off entirely if it's been misfiring.",
      },
      {
        type: "fix",
        text: "Floating grounding / quick-support bubble no longer hides behind the bottom navigation bar. It now respects the bottom nav height + safe-area, and persisted positions from older builds get hoisted back up on the next launch if they were dragged into the nav.",
      },
      {
        type: "improve",
        text: "Simply Plural sync now sends explicit no-cache headers on every API call so an aggressive Android WebView or proxy can't serve a stored older response on a fresh import. (Won't fix SP-side caching, but rules out the local browser as a culprit.)",
      },
      {
        type: "fix",
        text: "Simply Plural import: alters no longer get force-archived (or slip through un-archived) when SP returns the archive flag in an unexpected shape. The old read was a loose `!!archived`, which mis-classified timestamps and alternate field names. Now only an explicit boolean true / \"true\" / 1 counts as archived; anything else lands in your active list so nothing gets lost. If a member was archived on SP and lands as active here, you can re-archive from the alter profile.",
      },
      {
        type: "feature",
        text: "Quick alter-label toggle: a small pill button now sits in the Alters directory header, the Set Front modal header, and the Polls page header that cycles the label mode through Name → Alias → Both without having to dive into Settings.",
      },
      {
        type: "fix",
        text: "Long alter names in the avatar grid + fronter picker no longer chop off at 12 characters of text. The hard slice is gone — names show in full and use CSS truncation (ellipsis) only when they actually run past the cell width.",
      },
      {
        type: "fix",
        text: "Simply Plural import: one bad alter no longer halts the whole import. Previously, if a single alter's write to local storage failed mid-way through, every alter after it was silently skipped — which is why some systems ended up with around half their members copied across. Each alter now imports independently, and the final toast lists how many failed (with details in the devtools console).",
      },
      {
        type: "feature",
        text: "System Chat: channels can now be grouped into categories — add an optional category when creating or editing a channel and channels with the same category stack under one header in the sidebar. Up / down arrows next to each channel let you reorder them within a category.",
      },
      {
        type: "fix",
        text: "System Chat: removed the duplicate \"Back\" button in the chat header and trimmed the empty band between the message composer and the bottom navigation bar.",
      },
      {
        type: "feature",
        text: "Bulletins are now editable — long-press any bulletin to find a new \"Edit content + author\" action. Rewrite the post text, change which alters get attribution, or re-attribute to the whole system. Works on regular bulletins and task bulletins.",
      },
      {
        type: "fix",
        text: "In-app mention notification banner no longer slides under the device status bar / Spotify pill. It now respects the device's top safe-area inset.",
      },
      {
        type: "improve",
        text: "Tapping a chat mention notification now opens the specific channel AND scrolls to the exact message that mentioned you, with a temporary highlight ring so you can spot it. Works for both new mentions and any older mention-log records.",
      },
      {
        type: "improve",
        text: "Therapy Report \"most frequently logged emotions / symptoms\" now shows the count alongside each item (e.g. \"hopeless (4×)\") and requires at least 2 occurrences to qualify. A one-off check-in is no longer summarised as a top emotion in the clinical narrative.",
      },
      {
        type: "fix",
        text: "Activity Tracker weekly grid: the page no longer scrolls during the drag part of long-press-drag-select. The grid now hard-disables touch-scrolling the instant the press fires, so dragging your finger after the half-second hold actually selects cells instead of scrolling the page underneath.",
      },
      {
        type: "fix",
        text: "Activity Tracker weekly grid: quick-plan chips no longer paint on top of activities. They now live in their own band right below the day-of-week row so the time grid below stays clear. Past + today columns work the same way.",
      },
      {
        type: "fix",
        text: "Activity Tracker weekly grid: pinch-zoom no longer zooms the entire page. The grid container now disables the browser's pinch gesture so only the in-app pinch (row-height zoom) fires.",
      },
      {
        type: "fix",
        text: "Activity Tracker weekly grid: long-press-drag activity selection actually works on touch now. The page no longer scrolls underneath the gesture once the press fires, the selection banner doesn't shift the grid mid-press, and small finger jitter during the half-second hold no longer cancels the press.",
      },
      {
        type: "improve",
        text: "Activity Tracker weekly grid: past / elapsed time cells now render visibly darker than future cells, so the boundary between \"already happened\" and \"upcoming\" is glanceable. The tint sits under logged / scheduled activity blocks, so coloured activities still show through fully.",
      },
      {
        type: "fix",
        text: "Activity Tracker weekly grid: long activity labels no longer overlap the next activity's label below them. When a longer activity is followed by another one starting partway through, the long activity's name now stops at the new activity's row instead of bleeding down on top of it.",
      },
      {
        type: "fix",
        text: "Toast messages (Save Plan validation, save confirmations, error reports, etc.) actually appear on screen now. The toast renderer wasn't mounted, so pressing Save Plan with no title / activity / linked to-do looked like the button was broken — really the \"add one of these first\" toast was firing but had nowhere to render.",
      },
    ],
  },
  {
    date: "May 20, 2026",
    changes: [
      {
        type: "improve",
        text: "Activity Tracker weekly grid: hold an empty cell for half a second to drop the activity-selection start there, then drag your finger to pick the end cell in one gesture. The current target highlights as you drag, releases as the activity's end on touch up. Moving the finger before the half-second elapses cancels (so scrolling doesn't accidentally start a selection).",
      },
      {
        type: "improve",
        text: "Activity Tracker weekly grid: pinch with two fingers to zoom row heights up or down. Same range as the Display menu's slider (6 – 80 px), live as you pinch.",
      },
      {
        type: "improve",
        text: "Activity Tracker weekly grid hover/long-press popup: each activity row is now tappable and opens that activity's details modal directly, so you don't have to dismiss the popup and find the cell again.",
      },
      {
        type: "improve",
        text: "Long-running fronting sessions (open >48 hours) are no longer silently capped at 48h in analytics. Their full duration is counted as-is; the banner just flags them so you can confirm or close any that aren't actually still active. Your data is yours to interpret — the app's job is to ask, not to rewrite the numbers in the background.",
      },
      {
        type: "feature",
        text: "Chat reply chip now has a Discord-style @ ON / OFF toggle. When ON (default), replying to a message mentions the alter being replied to so they get a notification; tap to mute the reply so it doesn't ping. Tapping the notification routes back to the reply in the channel.",
      },
      {
        type: "fix",
        text: "System Structure Map node sizing + co-fronting distances are correct again. The map was still using the legacy \"unclosed session counts to right now\" math the analytics rework already killed elsewhere, so every alter ended up about the same size (one stale-open session inflated everyone's totals equally). Now goes through the shared session normaliser like the rest of analytics.",
      },
      {
        type: "fix",
        text: "The Alters page grid + the row-style alter cards now respect your Settings → Appearance → Alter labels preference (Display name / Alias only / Both). They were hard-coded to alias-first regardless of the toggle.",
      },
      {
        type: "improve",
        text: "Get to know me custom-field questions now use the same input type the custom field was defined with — Yes/No fields show two buttons (no more typing \"yes\"), Number fields show a number keypad, List fields hint to comma-separate items. Text fields stay as a plain text input. Boolean and number answers replace prior values; text and list still append + dedupe.",
      },
      {
        type: "improve",
        text: "Get to know me's \"What colour feels most present right now?\" now shows your existing alters' colours as swatches at the top — tap one to pick it. The free-form gradient picker stays below for when you actually want to assign a brand-new colour.",
      },
      {
        type: "improve",
        text: "The \"From Get to know me\" section now also renders directly on the alter's Profile tab (not just the Info tab) so direct answers show up in the same place the old tag pills did. The legacy Tags pill cloud beneath it is now labelled \"legacy — Get to know me no longer writes here\" so it's clear that section is just for cleaning up old data.",
      },
      {
        type: "improve",
        text: "Replaced the Get to know me tag pills with a custom-field-style \"From Get to know me\" section. Each question (energy, body / head, role lean, dominant feeling) shows up as a labelled row of pills (e.g. \"Energy: High / wired energy, Calm / settled energy\"), one pill per answer, with an × to remove individual values. No more tag soup on the profile.",
      },
      {
        type: "improve",
        text: "Alter profile tags get a one-click \"Clear all\" button alongside the per-tag × so you can wipe legacy tag data in one go instead of pruning each tag individually. (The Tags section only shows up when there's still legacy data to clean up — new Get to know me answers no longer write here.)",
      },
      {
        type: "improve",
        text: "Get to know me tags are now context-stamped — picking \"High / wired\" on the energy question stores \"High / wired energy\" instead of a bare \"High / wired\" that didn't say what it was about. The alter profile's Tags section also notes \"sourced from Get to know me\" so it's transparent where they come from.",
      },
      {
        type: "fix",
        text: "Get to know me preset questions no longer auto-tag your alter with inferred concepts. Picking \"High / wired\" used to silently stamp high-energy, manic, and playful onto the alter — surprising and felt intrusive. Now only the literal answer you picked is stored. The Help me unblend matcher still respects pre-existing inferred tags so old data isn't ignored.",
      },
      {
        type: "improve",
        text: "Each tag on the alter profile now has an × delete button so you can prune ones that landed there automatically (or by mistake) without going through edit mode.",
      },
      {
        type: "fix",
        text: "Get to know me answers now actually fill in the matching custom field on the alter's Info tab — they were being written to the wrong field name, so values like \"Hyperfocusing\" set via Get to know me never appeared in the alter's profile. Existing alters lazy-migrate the next time you open their profile.",
      },
      {
        type: "fix",
        text: "Alter profile no longer crashes for alters whose custom-field values were saved by Get to know me or Help me unblend. The Info tab's \"per-alter ad-hoc fields\" section now ignores the unblend writeback's object-shaped data instead of trying to call .filter() on it — both features keep working, they just don't share the same field name's display surface anymore.",
      },
      {
        type: "fix",
        text: "Alter profile pages now show a readable error screen instead of a blank black page when something throws during render — useful for catching the \"tap a fronting alter and the app crashes\" class of bug. The error message and stack are printed so the issue can be reported and traced.",
      },
      {
        type: "feature",
        text: "New Settings → Appearance → Corner style toggle: switch every card, button, input, and pill to sharp corners across the app. Avatars and other intentionally circular elements stay round.",
      },
      {
        type: "improve",
        text: "Stale-sessions banner on the Analytics page is now a tappable review modal. Each open-too-long session lists the alters, start time, and three actions: close now, retro-close at a chosen date/time, or mark as still active. Sessions you mark as still active opt out of the 48h analytics cap so legitimately long-running fronts aren't truncated.",
      },
      {
        type: "fix",
        text: "Analytics rework: every chart that aggregates fronting sessions now goes through a shared session normaliser. The old code treated unclosed sessions as if they were still running right now, which is why a 30-day window could show \"5085h solo\". Sessions you forgot to close are capped at 48h and the page warns you so you can go close them.",
      },
      {
        type: "fix",
        text: "Co-fronting analytics: solo vs co-fronting time is now computed via overlap slices, not by adding the same session's duration twice. The numbers in the breakdown match what actually happened. Both the legacy group-session model and the per-alter individual model feed in consistently — the standalone Co-Fronting page previously ignored individual sessions entirely.",
      },
      {
        type: "fix",
        text: "Activity charts (frequency, time-of-day, trends, summary cards) no longer count scheduled / cancelled / skipped activities as if they happened. Only logged, done, and partial activities feed the totals now.",
      },
      {
        type: "feature",
        text: "New Insights tab on the Analytics hub composes plan completion rates, goal progress, check-in distress rate, to-do completion, reminder acknowledgement, sleep summary, top locations, and a mood-after-activity correlation block — all using data you already have.",
      },
      {
        type: "fix",
        text: "Check-In Log analytics now actually counts your check-ins. The Top Emotions chart was only reading diary cards, so users with lots of Quick Check-In entries saw a near-empty chart. Emotion check-ins are now included in the tally, and a new \"Check-In Intensity\" trend line shows average intensity per day from your check-ins (alongside the existing diary-card mood trend).",
      },
      {
        type: "fix",
        text: "Rescheduling a quick plan now asks for a new date only — no time picker — since quick plans are tied to days, not specific times. The end-of-day sentinel timestamp is reapplied automatically.",
      },
      {
        type: "feature",
        text: "New Settings → Appearance toggle: choose how alters appear in lists, dropdowns, and pickers — Display name, Alias only, or Both. Default is Display name (most distinguishable when alters share aliases). Wired into the alter pickers, the chat composer (speaker chip, mention popup, signpost popup), and message author labels. Other surfaces will migrate progressively.",
      },
      {
        type: "fix",
        text: "System Chat: alter names whose colour was too close to the page background were unreadable. Author labels, reply previews, the speaker chip, and @mention pills now run through the same contrast adjuster used elsewhere in the app — your chosen colour stays the same, the displayed text just shifts toward lighter/darker until it's legible.",
      },
      {
        type: "improve",
        text: "System Chat composer: typing @ in a message opens the same Mention popup as bulletins; typing - opens a Sign as author popup, with —system at the top. Pick from either to autocomplete. The speaker chip on the composer auto-updates to whatever the message will actually be attributed to, so what you see is what posts.",
      },
      {
        type: "improve",
        text: "System Chat composer: tap the speaker chip to open a popover that matches the Journals filter-by-alter UI — multi-select with avatars, search, \"—system\" pinned at the top. Pick one or more speakers for the next message.",
      },
      {
        type: "improve",
        text: "System Chat: messages now render alter avatars instead of a single letter, including stacked avatars when multiple alters co-spoke a message.",
      },
      {
        type: "feature",
        text: "System Chat signposting: typing -system or -aliasname inside a chat message strips that token from the text and attributes the message to those speakers, overriding the picker — same convention as bulletins and journals.",
      },
      {
        type: "improve",
        text: "Activity Tracker weekly grid: empty time slots that are already in the past now have a slightly darker tint so the current / upcoming part of the week reads as \"available\" at a glance. Cells with logged or planned content keep their own colours unchanged.",
      },
      {
        type: "fix",
        text: "System Chat page was rendering blank on mobile because the layout was overshooting the device viewport and pushing everything behind the bottom nav. Now fills the available area correctly with the composer always visible.",
      },
      {
        type: "fix",
        text: "Plan Activity modal: toggling Quick plan on now always snaps the date to today (was previously gated to new plans only).",
      },
      {
        type: "improve",
        text: "Dashboard menu list view now has the same edit pencil as the grid. In edit mode you can tap × to hide a row; hidden rows move to a \"Hidden\" section at the bottom (ghosted, tap to add back). Same saved config as the grid, so toggling in either view stays in sync.",
      },
      {
        type: "feature",
        text: "System Chat (/chat) — a Discord-style multi-channel chat for alters to talk to each other. Create named channels, send messages with an alter signpost on every line, @mention any alter by name, reply-quote inline, edit and delete your own messages. Chat content is intentionally NEVER included in therapy reports. Reactions, threads, and pinned messages are the next iteration.",
      },
      {
        type: "improve",
        text: "Privacy &amp; Data notice and Settings → Data Storage now spell out exactly what's stored where: which entities live in IndexedDB (encrypted when encryption is on), which preferences live in plaintext localStorage (theme, last-opened list ids, the friends identity, grocery lists you marked \"available when locked\"), what encryption actually covers (AES-256-GCM with a PBKDF2-derived key, salt embedded in the payload), and what's never stored (analytics, telemetry, account, server-side copies). Friends mode's exact share scope is itemised so it's obvious nothing else ever leaves the device.",
      },
      {
        type: "fix",
        text: "Help me unblend and Get to know me are now in the sidebar (under Tools) and the dashboard grid defaults. If you saved your dashboard layout before they shipped, open the dashboard menu's edit mode and drag them in from the ghost row.",
      },
      {
        type: "feature",
        text: "Grocery list now supports multiple named lists. Tap the list name in the header to switch lists or create new ones (wish lists, hardware, anywhere). Each new list has an optional \"Available when the app is locked\" toggle that stores it unencrypted in your browser — those lists stay accessible from the unlock screen so you don't have to enter your password while shopping. The other lists stay encrypted with the rest of your data.",
      },
      {
        type: "feature",
        text: "Grocery list now remembers when you bought things. Checking an item off groups it under the date you purchased it. Tap a green check again to mark the item as ran out (red X) — it stays under the purchase date but moves below the in-stock items so you can see when the broccoli in the fridge actually came from. Ran-out rows get Restore (back to the shopping list) and Remove buttons; bulk \"Clear all ran-out items\" leaves the in-stock history alone.",
      },
      {
        type: "feature",
        text: "Plan Activity modal: \"Create a new to-do from this plan\" toggle inline with the existing \"Link to a to-do\" picker. Saving the plan creates a fresh to-do with the plan's title, notes, and due date, then links it automatically. Mutually exclusive with picking an existing to-do — you'd only ever want one linked.",
      },
      {
        type: "fix",
        text: "Quick plans day popup: \"tap to open details\" actually opens the details modal now. The handler was silently swallowing the tap on mobile (and on any small cursor wobble on desktop).",
      },
      {
        type: "improve",
        text: "Plans needing review on the Dashboard: double-tap a row to open the Activity Details / Manage Plan screen (same as the pinned critical plans card). Single tap still does nothing so the Done / Partial / Skipped / Cancelled buttons stay the one-shot affordance.",
      },
      {
        type: "improve",
        text: "Custom Fields reordering is now drag-and-drop. The old up/down arrows would stop responding past a few rows because field orders had collided over time; reordering now always renumbers cleanly so the list stays movable end-to-end.",
      },
      {
        type: "fix",
        text: "Get to know me custom-field questions now include a text input so you can enter a new answer — previously, once any alter had filled the field, only the existing values were offered as pills with no way to type a new one.",
      },
      {
        type: "fix",
        text: "Adding a custom emotion (e.g. \"disgust\") from the per-alter session editor or the dashboard fronter quick-editor now actually saves and pre-selects it — previously typing one and hitting add did nothing.",
      },
      {
        type: "improve",
        text: "Alter profile History tab no longer auto-merges front history from alters you logged as a fusion / split source. There's a clear toggle (off by default) to fold that inherited history in when you want it.",
      },
      {
        type: "improve",
        text: "Alter history tab banner now explains exactly where \"from split source\" / pre-fusion entries come from (a fusion or split event you logged in System History) and how to remove them.",
      },
      {
        type: "fix",
        text: "Custom-field unblend questions now show \"Custom field: <name>\" instead of the raw field UUID. The Edit Question alter dropdown also sits anchored under its trigger button (the popover was jumping around the screen and blocking page scroll).",
      },
      {
        type: "improve",
        text: "Get to know me has an \"Include custom fields\" toggle to filter them out of the queue, and Manage Unblend Questions has Hide All / Show All buttons for the custom field section.",
      },
      {
        type: "improve",
        text: "Help me unblend now surfaces a custom-field / pronouns / role / colour question as soon as any one alter has data for it — previously the queue dried up after a couple of questions because the threshold was 2+ alters with 2+ distinct values.",
      },
      {
        type: "fix",
        text: "Get to know me preset choice questions (energy / body / role / dominant feeling) now actually save — they merge into each alter's tags (and set role for role lean when the alter has none) so Help me unblend's matcher picks them up next time.",
      },
      {
        type: "fix",
        text: "Get to know me choice questions: button now works even without a selection — it switches to \"Skip & next\" so you can advance past a question you don't want to answer. With one or more options picked it saves them all and shuffles.",
      },
      {
        type: "improve",
        text: "Custom fields auto-load as Help me unblend questions by default. New scrollable \"Custom field questions\" section in Manage Unblend Questions lets you hide / show each field individually. The Add Question modal no longer has a Custom Field response type since it's redundant.",
      },
      {
        type: "improve",
        text: "Active Symptoms popup now opens centered (no longer cut off behind the bottom nav) and has an Edit start time button so you can correct when a symptom session actually began.",
      },
      {
        type: "fix",
        text: "Task creation: assigning an activity / expanding a sub-activity no longer kicks you back to the prior page. The picker's buttons were defaulting to type=submit inside the task form.",
      },
      {
        type: "improve",
        text: "Get to know me: choice questions are now multi-select. Field questions show pre-existing values as a labelled \"already on file\" panel and append your new answer alongside — nothing gets overwritten when you select an alter.",
      },
      {
        type: "improve",
        text: "Day Total PER-ALTER section now renders each alter's emotions / symptoms / notes as individual coloured pills grouped under the alter's name. Main day-total chips no longer double-count per-alter session entries.",
      },
      {
        type: "improve",
        text: "Emotion analytics: new day-of-week, month-of-year, and season breakdowns, plus a chronological list of every emotion logged in the selected range.",
      },
      {
        type: "fix",
        text: "Deleting a reminder now cascades to its scheduled instances so the bell-icon badge clears properly. Lingering orphan instances from before are also auto-cleaned the next time the inbox refreshes.",
      },
      {
        type: "fix",
        text: "Create Poll Created By picker swapped to a single searchable dropdown — tapping an alter no longer ends up selecting a different one.",
      },
      {
        type: "feature",
        text: "Emotion analytics revamp: readable bar lists, common emotions per alter (same dataset Help me unblend pulls), emotions over time, co-occurring emotion pairs, and emotion↔activity / emotion↔symptom correlations. Now pulls per-alter session emotions alongside check-ins so nothing's missed.",
      },
      {
        type: "improve",
        text: "Editing a per-alter check-in entry now opens the same Note/Emotions/Symptoms/Trigger editor the dashboard uses — pre-filled with whatever was set, replacing on save instead of an awkward inline editor.",
      },
      {
        type: "improve",
        text: "Get to know me custom-field questions are now labelled \"Custom field: <name>\" instead of \"What's the <name>?\" — easier to recognise what they're about.",
      },
      {
        type: "fix",
        text: "Day Total PER-ALTER section now lists every alter-specific symptom, emotion, and note in one consolidated row per alter — previously only the first symptom in a group was shown.",
      },
      {
        type: "improve",
        text: "Check-in log: alter-specific notes, emotions, and symptoms are now editable inline (not just deletable). Per-alter emotions also feed into the Day Total emotion tally so nothing's missed.",
      },
      {
        type: "feature",
        text: "Manage Unblend Questions: every preset and auto-generated question can now be customised, duplicated, or hidden — not just user-created ones. Hidden ones move to a Hidden section where you can restore them.",
      },
      {
        type: "fix",
        text: "Alter Groups: editing a group's parent can no longer create a loop (group becoming its own ancestor). The parent picker also hides descendants of the group you're editing.",
      },
      {
        type: "improve",
        text: "Polls Created By / Voting As pickers now use the same Set Fronters / Associated Alters style picker, with a System-wide toggle alongside it.",
      },
      {
        type: "improve",
        text: "Get to know me shuffle now cycles through unseen questions before repeating — once you've worked through every available question, the pool resets.",
      },
      {
        type: "improve",
        text: "Add Unblend Question (multiple-choice): the per-option \"which alters does this match?\" picker is now a searchable dropdown instead of a wall of alter pills.",
      },
      {
        type: "improve",
        text: "Get to know me choice questions now have a Save & next button — picking an option only stages it; saving advances to the next question.",
      },
      {
        type: "fix",
        text: "Check-in log: edit + delete buttons are always pinned to the right edge, the check-in edit pencil is always visible (was hidden on mobile until you tapped), and dark alter-coloured symptom pills now have readable contrast.",
      },
      {
        type: "improve",
        text: "Check-in log: alter-specific notes / emotions / symptoms can now be deleted, and alter-specific symptoms feed into the Day Total tally.",
      },
      {
        type: "improve",
        text: "Quick plans popup: tapping a plan opens Activity Details (mark done, edit, delete). Press &amp; hold to jump straight to Manage Plan as before.",
      },
      {
        type: "improve",
        text: "Check-in log: every entry now has edit/delete affordances — standalone symptoms can have their severity tweaked or be removed, and location rows have a delete button. Changes reflect on the Timeline immediately.",
      },
      {
        type: "fix",
        text: "Editing or deleting a check-in now also updates the symptoms logged alongside it — they used to stay on the timeline as ghosts. Symptoms attached to the check-in pre-fill in the edit modal so you can toggle them off.",
      },
      {
        type: "fix",
        text: "Create Poll: alter picker is now a searchable dropdown instead of a tall avatar grid that broke modal scrolling.",
      },
      {
        type: "improve",
        text: "Get to know me alter picker is now the same as the Set front modal — search, sort, list/grid view, primary stars, swipe gestures. Sync-to-front toggle still controls whether tapping also mutates the live front.",
      },
      {
        type: "improve",
        text: "Get to know me cycles through every custom field even before data exists, with a text input plus quick-tap pills for existing values. Selected alters' current value pre-fills the input.",
      },
      {
        type: "improve",
        text: "Question search on Get to know me — type to jump straight to any question instead of shuffling.",
      },
      {
        type: "improve",
        text: "Add Question modal lets you pick any custom field (not just ones with data). Help me unblend hides questions whose answers couldn't narrow the list and prompts you to seed data via Get to know me when there's nothing useful left to ask.",
      },
      {
        type: "improve",
        text: "Manage unblend questions: your own questions can now be edited or duplicated, not just deleted. Add-question button moved out of Help me unblend's header into the manager.",
      },
      {
        type: "improve",
        text: "Help me unblend / Get to know me: 'Different' button renamed to 'Shuffle'.",
      },
      {
        type: "improve",
        text: "Get to know me: question now sits above the alter picker, and the picker uses the same avatar grid as the Set front modal instead of the previous chip list.",
      },
      {
        type: "feature",
        text: "New 'Get to know me' page — answer unblend questions to build up data over time. Pick which alters the answer applies to, with a 'Sync to current front' toggle that ties selection to fronting state.",
      },
      {
        type: "feature",
        text: "New 'Manage unblend questions' page — see every question (preset, auto-generated, your own) in one place, add or delete your own.",
      },
      {
        type: "feature",
        text: "New 'List' custom field type alongside Text / Number / Yes-No. Type items comma-separated; each gets stored + matched individually, and displays as pills on the alter page.",
      },
      {
        type: "improve",
        text: "Help me unblend list-type matching is now opt-in via the new field type — pre-existing text fields stay opaque, only fields you mark as List split per item.",
      },
      {
        type: "feature",
        text: "Help me unblend now lets you add your own questions. Pick a response type (custom field, multiple choice, color, pronouns, role, or age) and the engine wires up scoring for you.",
      },
    ],
  },
  {
    date: "May 19, 2026",
    changes: [
      {
        type: "improve",
        text: "Help me unblend 'dominant feeling' question now uses your actual emotion history. Options are the emotions you've logged most often, and scoring rewards the alter who's felt it the most.",
      },
      {
        type: "improve",
        text: "Help me unblend: color picker is now the full hex picker (not just swatches), and questions auto-generate from your alter data — pronouns, role, and every custom field with at least two distinct values becomes its own question.",
      },
      {
        type: "improve",
        text: "Help me unblend: 'Likely fronters' is now a full scrollable list of every alter sorted by likeliness, with the currently-fronting alters pinned to the top.",
      },
      {
        type: "feature",
        text: "New 'Help me unblend' page — a gentle question flow that helps figure out which alter is fronting. Time-of-day baseline + color/energy/age questions narrow a 'Likely fronters' list. Tap 'I don't know' a few times and it offers a grounding break.",
      },
      {
        type: "feature",
        text: "Activity Tracker quick-plan pills: double-tap opens a popup listing every quick plan for that day with full names. Tap a plan to manage/edit it.",
      },
      {
        type: "fix",
        text: "Plan Activity modal: turning on the Quick plan toggle now defaults the date to today instead of tomorrow.",
      },
      {
        type: "feature",
        text: "Groups Manager: new 'All groups (flat)' view + automatic rescue banner for groups that got buried under a broken parent chain. One tap moves them back to root.",
      },
      {
        type: "fix",
        text: "Groups Manager: drag-and-drop now refuses to move a group into one of its own descendants (which used to bury entire subtrees out of reach). Group rendering is also clamped to depth 8 and ignores self-parents.",
      },
      {
        type: "fix",
        text: "Check-In Log no longer splits a single Quick Check-In's emotions into one row per emotion. All emotions from a session render together as pills on one row.",
      },
      {
        type: "improve",
        text: "What's New bar opens as a slim banner by default — tap to expand. Existing entries trimmed to 1-sentence summaries.",
      },
      {
        type: "improve",
        text: "What's New bar is now collapsed by default — tap to expand and read the entries.",
      },
      {
        type: "improve",
        text: "What's New bar lazy-loads older changes via a 'Show older' button. Hotfixes are filtered out.",
      },
      {
        type: "feature",
        text: "Dashboard 'What's New' bar now actually shows the latest changelog entries, dismissible per version.",
      },
      {
        type: "fix",
        text: "Active Symptoms popup is no longer cut off at the bottom — safe-area inset moved to the right place + 80vh cap.",
      },
      {
        type: "feature",
        text: "Daily-task AUTO templates can combine multiple triggers with Any (or) / All (and) mode.",
      },
      {
        type: "improve",
        text: "Currently Fronting toggle in dashboard layout now has a note that the app works without a fronter.",
      },
      {
        type: "fix",
        text: "Dashboard 'rearrange tiles' pencil button now matches the column-count toggle styling next to it.",
      },
      {
        type: "feature",
        text: "New 'Quick plan' type — date-only plans, render as pills on the weekly grid, toggleable visibility.",
      },
      {
        type: "improve",
        text: "Activity Tracker: today's column now has a soft tint to stand out.",
      },
      {
        type: "improve",
        text: "Timeline symptom sessions now have an 'Edit session' button in their detail popup, matching alters.",
      },
      {
        type: "feature",
        text: "New /bulletins page with infinite scroll, search, and composer.",
      },
      {
        type: "feature",
        text: "Dashboard Bulletin Board batch size is now configurable from Dashboard layout settings.",
      },
      {
        type: "improve",
        text: "Dashboard layout settings now use real drag-and-drop instead of up/down arrows.",
      },
      {
        type: "feature",
        text: "New Dashboard layout settings under Appearance — toggle and reorder every dashboard block. Custom Status now stands alone, usable without Currently Fronting.",
      },
    ],
  },
  {
    date: "May 18, 2026",
    changes: [
      {
        type: "fix",
        text: "Timeline: scrolling over an activity icon no longer triggers its detail popup when the finger lifts. Only stationary taps open it.",
      },
      {
        type: "feature",
        text: "Therapy Report: new 'Preview & Customize → PDF' flow lets you exclude individual entries before final export.",
      },
      {
        type: "feature",
        text: "Analytics: new System-wide view alongside per-alter views in Co-Fronting Analytics and Alter × Symptom Correlation.",
      },
      {
        type: "feature",
        text: "Bulletins + bulletin comments now support `-system` signposting, with the system's avatar + name in the autocomplete.",
      },
      {
        type: "feature",
        text: "Journal entries now support `-system` (and your custom term) as a signpost — attributes to the whole system, no specific alter.",
      },
      {
        type: "fix",
        text: "Switch Log: tapping a symptom slider now dismisses the keyboard so the sliders aren't hidden behind it.",
      },
      {
        type: "fix",
        text: "Swipe-back chevron no longer gets stuck on screen after a multi-finger gesture.",
      },
      {
        type: "improve",
        text: "Activity Planner: long activities now show one status badge at their head and let their name wrap across the full duration.",
      },
      {
        type: "improve",
        text: "Check-In Log: collapsed day rows now show the Day Total summary inline so you can scan recent days without expanding each one.",
      },
      {
        type: "fix",
        text: "Quick Check-In modal: opening tap can no longer accidentally hit a button — touch-block overlay is now mounted on the first paint.",
      },
      {
        type: "fix",
        text: "Journal editor no longer loses co-authors on re-edit. All author markers rehydrate into the signpost field on load.",
      },
      {
        type: "feature",
        text: "Journal signpost field now autocompletes alters as you type (`-h` → dropdown of matching alters), matching the bulletin composer.",
      },
      {
        type: "fix",
        text: "CRITICAL: backup/export was failing with 'filter is not a function' for every user. Exports work again.",
      },
      {
        type: "improve",
        text: "Grocery privacy cover: turning OFF the lock-on-close toggle now requires your encryption password.",
      },
      {
        type: "fix",
        text: "Log Analytics 'Symptom & Habit Frequency' now includes symptoms logged via Quick Check-In, not just diary card entries.",
      },
      {
        type: "fix",
        text: "Daily Tasks 'hold to change' shortened from 2s to 1s, and now refetches latest progress before saving.",
      },
      {
        type: "fix",
        text: "Quick Check-In modal touch-block bumped from 200ms to 400ms so the opening tap can't auto-select Save/Cancel.",
      },
      {
        type: "fix",
        text: "Fixed a phantom header band that appeared above the real app header on Android in 0.17.24–0.17.27.",
      },
      {
        type: "fix",
        text: "Journals: Fronter view dropdown no longer scrolls the page horizontally when opened.",
      },
      {
        type: "fix",
        text: "Journal/block rich-text rendering now strips unsafe HTML before display.",
      },
      {
        type: "fix",
        text: "Journals: Fronter view dropdown labels no longer get clipped on the left edge.",
      },
      {
        type: "feature",
        text: "You can now rename and delete custom journal folders and subfolders. Long-press (or right-click) any folder card for a small menu with Rename and Delete. Deleting moves any entries inside to the parent folder (or to the root for top-level folders) — entries themselves are never deleted, and subfolder hierarchy is preserved.",
      },
      {
        type: "improve",
        text: "Added missing edit/delete options to a handful of create-only places: Custom Fields can now be renamed and have their type changed (previously only the name on the alter card was editable); weekly Activity Goals can now have their target minutes edited; and several existing Delete buttons (Custom Emotions, Trigger Types, Quick Actions, Custom Fields, Activity Goals) now ask for confirmation first.",
      },
    ],
  },
  {
    date: "May 17, 2026",
    changes: [
      {
        type: "hotfix",
        text: "Hotfix: renamed the 'Browser push' delivery-channel checkbox in the New Reminder dialog to 'Push notification' since on the native Android build the channel uses OS notifications, not browser push.",
      },
      {
        type: "hotfix",
        text: "Hotfix: silenced two Android 15 deprecation warnings the Play Console flags on every upload by switching to the modern EdgeToEdge.enable API and removing the deprecated statusBarColor / navigationBarColor theme attributes. No user-facing change — system bars still render the same way; this is purely a forward-compat housekeeping change.",
      },
      {
        type: "fix",
        text: "Fixed grounding techniques duplicating after a backup restore. Default techniques (Box breathing, Gentle movement, etc.) are no longer included in backups — they get re-seeded automatically on every device. Backups now only carry over the techniques you've created or customised yourself. Existing duplicates from older restores are cleaned up automatically the next time you open the Grounding page — your favourites, ratings, and custom techniques aren't touched.",
      },
      {
        type: "fix",
        text: "Moved the 'Top of Dashboard' and 'Bottom of Dashboard' upcoming-plans surfaces to actually render on the Dashboard (they were still rendering on the Alters page despite their labels saying Dashboard). 'Top of Dashboard' now sits above Currently Fronting; 'Bottom of Dashboard' sits below the bulletin board. Your toggle states carry over unchanged.",
      },
      {
        type: "feature",
        text: "You can now control how many upcoming plans show on the Dashboard — either pick a count ('next 5 plans') or a time window ('next 2 weeks', 'this month', etc.). Setting lives under Settings → Upcoming Plans Visibility.",
      },
      {
        type: "fix",
        text: "Settings → Upcoming Plans Visibility now correctly labels the two main surfaces as 'Top of Dashboard' and 'Bottom of Dashboard' (they were labelled 'Top of Home' / 'Bottom of Home', which was confusing because /Home is actually the Alters directory).",
      },
      {
        type: "fix",
        text: "Signposting now picks up multiple alters in one entry. Two new behaviours: type `-kyo/hex` to credit both kyo and hex with one tag (slash-separated), and short prefixes like `-hex` resolve to a longer alter name (e.g. hexandroga) when that prefix uniquely identifies one alter. Works the same way in Journals, Bulletin posts, and Bulletin comments — they all share one parser now.",
      },
      {
        type: "fix",
        text: "Fixed a bug where edits to a sleep record's dream notes didn't propagate to the linked dream Journal entry. New sleep records now link both ways; edits stay in sync going forward. Existing dream journals from before this fix remain — new edits to the underlying sleep will start linking them after the next edit.",
      },
      {
        type: "improve",
        text: "Picking an author for a journal entry now auto-fills the signpost field with that alter's name so you can sign the entry without retyping. Type your own signpost any time to override.",
      },
      {
        type: "feature",
        text: "Even more Daily Task auto-triggers (now ~35 events) — alter added, bulletin posted, poll voted, theme changed, grounding technique used, streak milestone hit, and more. The pts label on the leveling bar also now scales with the selected period: 'today / this week / this month / this year'.",
      },
      {
        type: "feature",
        text: "Daily Tasks now supports a much wider catalogue of auto-trigger events — set a task to auto-complete when you log an activity, complete a to-do, check in emotionally, record a switch, log a location, finish a planned activity, hit a weekly goal, and more. The full list is in the trigger dropdown when you edit a daily task template.",
      },
      {
        type: "fix",
        text: "Fixed the new-task form on Manage Tasks appearing far below the visible area when you tapped the + on a frequency section. The form now opens inline directly under whichever section header you tapped, so you can see what you're filling in without scrolling.",
      },
      {
        type: "hotfix",
        text: "Hotfix: documented the parallel-agent friction pattern in CLAUDE.md so future maintenance sessions know when to queue agents serially versus in parallel.",
      },
      {
        type: "hotfix",
        text: "Hotfix: the show/hide groups toggle on the Alters page now remembers its state across reloads.",
      },
      {
        type: "fix",
        text: "The 'Fronter view' button in Journals now actually filters entries to journals authored by currently-fronting alters. Tap the small chevron next to it to fine-tune the alter selection.",
      },
      {
        type: "feature",
        text: "Added permission-giving messaging across the app: there's no \"right\" way to use Oceans Symphony — it's your home. The Tour, Guide page, and a first-time hint near the Set Front button now explicitly invite you to use fronting however it shows up for your system, whether that's full executive control, co-consciousness, or just an alter coming to mind.",
      },
      {
        type: "improve",
        text: "Trimmed the bundled fonts to Latin + Latin Ext subsets only, cutting the app's download size by roughly 60%. Users typing in Cyrillic, Arabic, or other non-Latin scripts will see their chosen custom font fall back to the system default — full subset support will come back as an opt-in download in a future update.",
      },
      {
        type: "fix",
        text: "Fixed the Edit button in the journal entry viewer closing the modal without opening the editor — the close and re-open were racing on the same React tick and the editor's mount got swallowed by the closing modal's animation.",
      },
      {
        type: "hotfix",
        text: "Hotfix: expanded developer documentation in CLAUDE.md so future maintenance sessions can pick up the codebase without context loss.",
      },
      {
        type: "improve",
        text: "Quick Check-In rework: Save and Cancel now sit at the top of the modal so they're reachable without scrolling. Tapping outside the modal no longer dismisses it (use X / Save / Cancel) — that should kill the 'I tapped off and lost everything' frustration. Check-In Log entries are now editable: long-press (touch) or double-click (mouse) on a row to reopen it in the Quick Check-In modal, adjust anything, and save to update — no more duplicate entries.",
      },
      {
        type: "fix",
        text: "Some activity categories were invisible after the recent nesting recovery — a category that ended up pointing at itself as its own parent (a corruption mode produced by older drag-drop) was excluded from both the customize view and the Quick Check-In picker. Activity-category root resolution now surfaces self-parented rows the same way it already handles orphans, so missing categories reappear without any data change.",
      },
      {
        type: "fix",
        text: "Several Activity Tracker follow-ups: the Day view's header now respects Android edge-to-edge so the date/Add row no longer slides under the status bar; the SCHEDULED status chip on activity cards no longer overlaps the activity name (it sits inline above the title now); and the Log Activity dialog has a proper date picker plus an always-visible End time + duration field (the date used to be locked to whatever cell you tapped and the End time was hidden when there was no preselected range).",
      },
      {
        type: "fix",
        text: "Removed a redundant top-padding that was leaving a giant empty gap below the page header on the Activity Tracker — the layout wrapper was double-reserving safe-area-inset-top that AppLayout was already handling.",
      },
      {
        type: "improve",
        text: "Compacted the Activity Tracker header: the three primary buttons (New Plan, Log Activity, Manage Activities) now share a single row, and Week/Month/Year sits in the top-right. Also fixed Android edge-to-edge overlap on the top (header was sliding under the status bar) and on the Planned-tab list (last items were sliding under the bottom nav).",
      },
      {
        type: "feature",
        text: "Activity Planner Phase 3: a new Plan completion tracker surfaces how often plans get completed, cancelled, or skipped — broken down by category, time of day, and day of week, with plain-text insights underneath. Plan stats now appear in Therapy Reports automatically. Optional native reminders fire before upcoming plans (configurable 15 min / 30 min / 1 hour / 1 day, off by default). A few stragglers from Phase 1 — the Check-in Log and pinned critical plans — now respect the new lifecycle states properly.",
      },
      {
        type: "improve",
        text: "Activity Planner Phase 2: log and plan now have separate, focused dialogs instead of one mega-modal. Editing a recurring plan asks whether you mean this instance, this and future, or the whole series. Creating a new category warns you when the name matches an existing category instead of silently linking past activities. Setting added under Notifications to turn off the unresolved-plan reminder card.",
      },
      {
        type: "feature",
        text: "Plans are now first-class. Every scheduled plan (recurring or one-off) has a lifecycle — long-press a plan chip on the week grid (or use Manage Plan in details) to mark it Done, Partial (with optional actual time), Skipped, Cancelled, or to Reschedule. The week grid now distinguishes scheduled plans (dashed outline, 50% fill) from logged activities (solid fill); a plan visually fills in when you mark it done. Unresolved past-time plans surface on the Dashboard with one-tap resolution so nothing silently drifts into the tally. Done/partial count toward your activity tally — skipped, cancelled, and still-scheduled plans don't. Recurrence-instance editing, settings toggles, and analytics around completion rates are coming in the next phase.",
      },
    ],
  },
  {
    date: "May 16, 2026",
    changes: [
      {
        type: "fix",
        text: "Fixed the Activities page becoming unusable after nesting too many sub-activities (or after a cyclic parent reference, e.g. an activity that somehow ended up nested under itself). The tree now safely handles cycles, caps how deeply it renders, and shows a recoverable error per-row instead of blanking the whole page. If you were already locked out, opening Activities now shows a recovery option to flatten the offending nesting without losing any of your activities or their logged history.",
      },
      {
        type: "improve",
        text: "Global search (the 'Search everything' input on the Dashboard) now covers every alter — including dormant and archived ones — and matches against pronouns, custom fields, bio, group memberships, tags, birthday, and any other profile field. It also indexes journal entries, tasks, status notes, locations, emotion check-ins, system-change events, alter notes, reminders, and more; you can search by name, content, or even a date string.",
      },
      {
        type: "fix",
        text: "When a group or role chip's colour is too close to the page background, the chip now fills with a brighter version of your chosen hue (same colour family, lifted lightness) so the chip itself stands out — instead of just a thin outline around an empty-looking pill. Your saved colour is unchanged.",
      },
      {
        type: "fix",
        text: "Group and role chips now also swap their text colour to a readable foreground when the user-picked chip colour is too close to the page background — previously the contrast halo added an outline but the text inside the chip stayed in the original colour and could still be unreadable.",
      },
      {
        type: "fix",
        text: "Fixed restored system name, bio, and avatar appearing blank after importing a backup in 'Add new' mode — the import was being shadowed by an empty default record created on first run. Existing users on restored data: re-open Settings → System and your imported values should now appear; if anything is still missing, re-import the backup in 'Add new' mode and it'll take this time.",
      },
      {
        type: "fix",
        text: "The medical-scope disclaimer (Settings → Disclaimer) is now also reachable as a collapsed bar at the top of the Quick Support, Learn, and Resources screens — so anyone landing in those areas first sees that this app isn't a medical product without hunting through Settings.",
      },
      {
        type: "fix",
        text: "Added a subtle contrast halo behind alter/group/role chips when their colour is too close to the page background to read, and a soft outline behind role badges drawn over avatar photos. Your chosen colours don't change — only the visibility helper is added when needed.",
      },
      {
        type: "fix",
        text: "Cleaned up the Quick Support / grounding-techniques menu — merged the overlapping Imagery and Visualization sections into a single Imagery category, and removed a pair of duplicate techniques (Peaceful place visualization was the same exercise as Safe place visualization, and Bilateral tapping was the same exercise as Butterfly hug). Existing custom techniques you saved under 'Visualization' still appear — they now show up under Imagery automatically.",
      },
      {
        type: "fix",
        text: "Added a brief touch-block when the Grocery list or Quick Check-In modal first opens, so a stray finger doesn't accidentally check off a list item or tap a feeling slider before you've even seen the screen.",
      },
      {
        type: "fix",
        text: "Fixed the bottom navigation bar being partially hidden behind Android's gesture pill / 3-button system bar on phones with on-screen nav — the tab buttons are now properly inset above the system controls.",
      },
      {
        type: "feature",
        text: "Restored the **Copy/Paste Backup** workflow under Settings → Backup. Lets you export your data as text chunks (configurable number of parts) and re-import by pasting them back — useful when file downloads are blocked, e.g. when the app is opened from inside the Facebook or Instagram in-app browser.",
      },
      {
        type: "fix",
        text: "Fixed several rare cases where switching/fronting actions could either leave two alters marked as primary, silently promote a co-fronter to primary, or lose symptoms attached to switch-journal entries.",
      },
      {
        type: "fix",
        text: "More follow-up fixes to fronting/switching consistency: rapid-tap and dialog-race conditions could occasionally leave duplicate primaries or attach a switch journal to the wrong session. PluralKit and SimplyPlural imports no longer fabricate a 'primary' alter — they import everyone as a co-fronter, matching what those source systems actually track.",
      },
      {
        type: "fix",
        text: "Fixed reminder cards stacking up on the Dashboard when you haven't addressed the previous one (no more 'Checking in on the system' x3). Also smoothed out the System History page so it opens cleanly instead of stuttering or freezing.",
      },
    ],
  },
  {
    date: "May 15, 2026",
    changes: [
      {
        type: "improve",
        text: "Added a public account-deletion page at oceans-symphony.app/delete-account that explains how to wipe your on-device data and your Friends server profile, what gets deleted vs. kept, and how to reach us if you can't open the app. This is the URL referenced from the Play Store listing under Data Safety, but it works for anyone — bookmark it if it's useful.",
      },
      {
        type: "improve",
        text: "Custom terminology now supports word-form overrides. The auto-conjugator assumes the base term you set for 'Front' is a regular verb root — which works for 'front', 'shift', 'influenc', etc., but produced nonsense for adjective-ish terms like 'active' (yielding 'activing' / 'activer' instead of 'activating' / 'active fronter'). Settings → Terminology now has an 'Advanced word forms' expander where you can type the correct Fronting / Fronter / Switching forms explicitly. Leave them blank and the auto-conjugation runs as before.",
      },
      {
        type: "improve",
        text: "Alter birthday field is now free-form text instead of forcing a YYYY-MM-DD date picker — you can enter 'Age 7', 'around middle school', 'March 2018', or an exact date, depending on what fits each alter. The 🎂 line on the alter profile renders whatever you type. PluralKit sync still only sends the value when it's a valid ISO date so the API doesn't reject the upload.",
      },
      {
        type: "improve",
        text: "Birthday and Origin Year are now linked since they're the same 'when did this alter first appear' idea — both fields show up in the alter edit modal AND the inline profile editor. If only one is filled, the other auto-fills from it on load (and as you type). Once both have values, edits stay independent. A small 'Sync from birthday (YYYY)' button surfaces next to Origin Year whenever the years drift apart, so you can re-link them in one click.",
      },
      {
        type: "fix",
        text: "Home-screen quick actions (long-press the app icon on Android) weren't reliably triggering on the native build. Two bugs: (1) the 'Toggle a daily task' action type had no executor in the Dashboard's quick-action handler, so tapping that shortcut appeared to do nothing — added the missing handler so it now flips today's task completion (and awards/refunds XP) just like the in-app menu. (2) The Dashboard's quick-action effect used a one-shot ref guard, so after the FIRST shortcut tap of a session subsequent taps were ignored even when the URL changed via appUrlOpen — switched to watching the URL itself (cleared via router navigate so even tapping the same shortcut twice in a row works).",
      },
      {
        type: "improve",
        text: "Clarified the Birthday + Origin Year fields on the alter editor — they were reading as duplicate boxes because nothing told you what each one drives. They're now grouped under a 'When they first appeared' heading with inline hints: Birthday is free-form and shows on the profile's 🎂 line, Origin Year is the integer that feeds the Alter History timeline. The auto-link + sync button behavior is unchanged.",
      },
      {
        type: "improve",
        text: "Location features (Log Location quick action, the GPS button on Check-In, and the Get-GPS button on the Location History add modal) now request location permission properly on the native Android build. Previously the location permission was stripped from the manifest entirely (we'd removed everything the background-runner library injected because nothing was using them yet), so the Android permission dialog could never appear — feature would just silently fail. Now: foreground location permission is declared, @capacitor/geolocation prompts when needed, and a denial shows a clear toast pointing the user at Settings → Apps → Oceans Symphony → Permissions.",
      },
      {
        type: "fix",
        text: "Home-screen 'Log location' quick action used to silently create a record literally named 'Location' with no GPS data — because the OS-launcher path skipped the in-app row that collects category + coords. Tapping the shortcut now pops the in-app quick actions sheet so you can capture GPS and pick a category pill before saving, matching the long-press menu flow.",
      },
      {
        type: "improve",
        text: "Location entries in the Check-In Log now show the raw GPS coordinates beneath the pill with a tap-to-open-in-Maps link, matching the Location History page and timeline view. Previously the pill only showed the place name — useful for at-a-glance reading, but you couldn't see where exactly the GPS captured.",
      },
      {
        type: "fix",
        text: "TWA-to-native migration modal (the 'Welcome to the native Oceans Symphony' screen shown on the very first launch after the Play auto-update) was unscrollable on shorter screens — the explanation paragraphs pushed the Import/Start-fresh buttons off the bottom of the viewport with no way to scroll or dismiss, trapping users on the screen. The modal backdrop is now scrollable, with safe-area padding so the buttons stay clear of the gesture pill.",
      },
      {
        type: "fix",
        text: "Edge-to-edge follow-up: the Preview Mode banner and the Upcoming Plans 'You have X planned…' banner are now full-bleed — their amber/primary background stretches to the screen edges to match the header, instead of being inset 16px by the main content padding. The banners moved out of the scrolling content area to sit directly under the header bar (where the user expects them); the Base44 migration card stays inside the page padding because it's a rounded card that needs breathing room.",
      },
      {
        type: "improve",
        text: "Native Android build: app now renders edge-to-edge — the header background extends up under the system status bar and the bottom nav extends down to the screen edge, instead of the WebView being a boxed area below/above the system UI. Content (icons, text, tap targets) still respects the safe-area insets via env(safe-area-inset-*) paddings, so nothing ends up tucked under the clock or the gesture pill. Modern Android look.",
      },
      {
        type: "fix",
        text: "Banners (preview mode, upcoming-plans 'You have X planned in Y minutes', base44 migration) used to render in document flow ABOVE the sticky page header. Once the body became unscrollable in 0.16.7, those banners stopped scrolling out of the way and permanently pushed the header down — stacking awkwardly with the in-app notification popup at the very top of the screen. Banners now render INSIDE the main scroll area so they scroll with page content; the 'Oceans Symphony' header sits cleanly at the top in every state.",
      },
      {
        type: "fix",
        text: "PluralKit avatar imports now actually display. The PK API returns whatever avatar URL is set on each member — for migrated members that's pluralkit.me's CDN (works fine), but for older un-migrated members it's a Discord CDN URL, which expires under Discord's signed-URL policy and won't load from a browser. We now download each avatar at import time, save it to local image storage, and store a `local-image://` URL on the alter so it survives URL expiration AND works offline. Discord URLs are detected and skipped (the user is told to re-upload in PluralKit so it migrates to PK's CDN, then re-run import). Cached avatars are reported in the success toast.",
      },
      {
        type: "improve",
        text: "Native Android build: app icon and splash screen are now generated from the Oceans Symphony logo (the same one you see in the PWA / on the web), not the default Capacitor placeholder. Source PNGs live in assets/icon-only.png and assets/splash.png; running 'npx capacitor-assets generate --android' regenerates every mipmap and drawable density bucket from them.",
      },
      {
        type: "hotfix",
        text: "Hotfix: Play Console rejected the 0.16.7 build because @capacitor/background-runner declares ACCESS_BACKGROUND_LOCATION and several other sensitive permissions that we don't actually use (the runner could do geolocation, our task just polls a URL). Stripped the unused permission declarations from the merged manifest via tools:node='remove' so Play stops flagging them. Bumped versionCode to 101 for the resubmit.",
      },
      {
        type: "fix",
        text: "Header was STILL sliding off-screen on scroll despite removing the auto-hide hook in 0.16.4. Root cause: the app-shell root container was min-h-screen (could grow taller than viewport when content overflowed), which let the document body itself scroll and dragged the 'sticky' header up with it. Pinned the root to exactly h-screen with overflow-hidden — only inner <main> with overflow-auto can scroll now, and the header has nowhere to go.",
      },
      {
        type: "improve",
        text: "TWA-to-native migration prompt now appears on the first-run onboarding screen instead of as a modal that pops up on top of the Dashboard after setup is already complete. Users coming from the Play Store auto-update see the 'go grab a backup from oceans-symphony.app in Chrome' guidance before they make any storage-mode choices, so they don't accidentally start fresh and then get told mid-app that they should have imported something.",
      },
      {
        type: "fix",
        text: "Native Android build: corrected the production domain references throughout the app. The TWA was wrapping oceans-symphony.app (the canonical domain), not oceans-symphony.vercel.app (a staging URL). Chrome's storage is keyed by origin, so the migration modal pointing TWA users at the vercel.app URL would have sent them to an empty database. Fixed: the migration modal copy, the native-app Friends API base URL, the background-runner's Friends poll URL, and the CLAUDE.md notes future agents read.",
      },
      {
        type: "improve",
        text: "Native Android build: auto-backup now saves to the public Downloads folder (under 'Downloads/Oceans Symphony/') via a new MediaStore plugin instead of the @capacitor/filesystem Documents path that scoped-storage Android 11+ silently refuses. Backups survive app uninstall AND don't trigger a share-sheet prompt — they just land in a place every Files app shows. On Android 9 and below the plugin falls back to a direct legacy-storage write to the same place. Share sheet is now only used as a last-resort if both paths fail; we explicitly do NOT silently drop into the app-scoped External folder because that gets wiped on uninstall and defeats the point of a backup.",
      },
      {
        type: "fix",
        text: "Header auto-hide on scroll was still firing in portrait despite the landscape-only guard introduced in 0.15.4 — turned out to be Capacitor WebView quirks around how viewport dimensions get reported during scroll. Removed the auto-hide feature entirely so the header is now reliably pinned at the top in every orientation. If we want a landscape-only auto-hide back later it'll come as an opt-in accessibility toggle rather than default behaviour.",
      },
      {
        type: "feature",
        text: "Native Android build now ships as an UPDATE to the existing TWA Play listing instead of a separate co-installable app. Your closed-internal testers will get the native build automatically the next time they get the Play Store. A first-launch modal explains that their old TWA data is still safe in Chrome (open oceans-symphony.app in Chrome → Download Backup → import into the new native app). Bumped versionCode to 100 so the upload supersedes any prior TWA build.",
      },
      {
        type: "fix",
        text: "Alter colour wasn't applying to the row treatment (icon background, left border, role chip) for any alter whose saved hex value wasn't a valid CSS hex — most commonly a stray 5-digit value like '#8b5c1' instead of a 6-digit one. The validation in the list / folder / grid renderers was a naive `length > 3` check that accepted invalid values, which CSS then refused to parse, leaving that one alter looking unstyled next to the others. Now validated as a proper CSS hex (3/4/6/8 digits with a leading #). Invalid colours fall back to the default purple in grid view and to a neutral 'no colour' treatment in the list rows — consistent with alters that genuinely have no colour set. If your alter is still missing their colour after this update, open Aspects → that alter → re-save the colour from the picker; the picker won't let you save anything other than a valid 6-digit hex.",
      },
      {
        type: "hotfix",
        text: "Hotfix: Android build was failing on @capacitor/background-runner due to an outdated proguard-android.txt reference in the plugin's gradle config. Patched via patch-package so the fix applies automatically on every npm install.",
      },
      {
        type: "feature",
        text: "Native Android build: friends' front-change notifications now fire even when the app is fully closed — we wire @capacitor/background-runner up to Android's WorkManager, which wakes a tiny JS task every ~15 minutes to poll the Friends server and fire a local notification on any tracked change. Caveats kept honest: 15 minutes is WorkManager's floor (won't run more often even if we asked), and some OEM battery savers (Samsung One UI, Xiaomi MIUI) throttle background tasks aggressively — disabling battery-optimisation for Symphony in Android Settings fixes that. The in-app 30s polling still runs while the app is open, so foreground delivery stays snappy.",
      },
      {
        type: "feature",
        text: "Native Android build: notifications now route to one of two channels so you can configure each independently in system Settings → Apps → Oceans Symphony → Notifications. 'Reminders' (used by check-in nudges, scheduled / interval reminders, the backup reminder, etc.) defaults to high importance with sound, vibration, and a heads-up bubble. 'Switch updates' (used for own-system 'alter takes front' reminders and friend front-change notifications) defaults to low importance — silent and banner-only in the tray, no vibration, no heads-up. Each channel's sound, vibration, and importance can be customised separately in the OS Settings page.",
      },
      {
        type: "fix",
        text: "Auto-hide header was firing in PORTRAIT despite the 0.15.2 landscape-only guard — the orientation media query was returning wrong values in some Capacitor WebView builds. Switched to a direct innerWidth/innerHeight comparison so the gate is rock-solid. Portrait always shows the header; landscape still auto-hides on scroll-down.",
      },
      {
        type: "fix",
        text: "Native Android build: tapping an external link inside the app (GitHub releases, Notion template, Google Maps location pins on activities and check-ins, the CTAD Clinic YouTube link, the ISSTD / DID-Research / Infinite Mind resources, any URL someone pastes into a bulletin) now opens in a system Chrome tab you can swipe back from, instead of trapping you on that external page inside the Symphony app with no way back. A single global anchor-click listener catches every <a target='_blank'>, plus the handful of explicit window.open call sites switched to the new openExternalUrl helper. Web and TWA are unchanged.",
      },
      {
        type: "fix",
        text: "Native Android build: friends' front-change notifications now fire even though Web Push doesn't work in a Capacitor WebView. The Web Push pipeline that delivers these notifications on web/TWA never reached the native build, so toggling 'Notify on change' for a friend silently did nothing. Native now polls the Friends server every 30 seconds while the app is open, compares each friend's front timestamp against the last value we saw, and fires a local notification on change for any friend you've enabled. Honest caveat: this only runs while the app process is alive (foreground or recent-background) — fully-closed Android stops the polling, so friends who update while you've fully swiped the app away won't trigger a notification until you reopen.",
      },
      {
        type: "improve",
        text: "Auto-hide header on scroll now activates ONLY in landscape orientation (previously triggered at large font sizes regardless of orientation). Portrait keeps the header fixed in place so it never disappears mid-tap. Landscape gets the auto-hide so the chrome doesn't eat ~20% of the limited vertical viewport.",
      },
      {
        type: "fix",
        text: "Native Android build: Friends profile setup was failing with 'Unexpected token < … is not valid JSON' because /api/friends requests resolved against the WebView's private hostname (app.local.oceans-symphony) and returned a 404 HTML page instead of the real API JSON. The Friends client now points at the production Vercel deployment when running natively. Web and TWA continue to use same-origin relative paths.",
      },
      {
        type: "improve",
        text: "Online resources: the CTAD Clinic entry now links directly to the UK CTAD Clinic's YouTube channel (still useful content even if you're not in the UK). The blurb still notes that several clinics use the CTAD name regionally, so 'search CTAD clinic plus your region' for local treatment remains the right path.",
      },
      {
        type: "feature",
        text: "Native Android build: long-pressing the app icon on your home screen now shows YOUR configured Quick Actions (the same ones you get from long-pressing the in-app Quick Check-In button), not a single generic 'Quick Actions' entry. Tapping a shortcut opens the app and runs that exact action — log a feeling, set a fronter, start a grounding exercise, whatever you've set up. Reorder or rename them in Settings → Quick Actions and the home-screen list updates automatically. Android caps the menu at 4 shortcuts per app, so the first four (by your saved order) get surfaced.",
      },
      {
        type: "improve",
        text: "Native Android build: the 'Storage persistence' row in Settings → Auto-backup never did anything on the native app (the Web Storage API the button calls always returns false in a Capacitor WebView — the concept only applies to browsers). Replaced it on native with a 'Backup destination' picker: 'Documents folder' (silent — backups land directly in your Documents folder with no share-sheet popup, the new default) or 'Ask each time' (share sheet, the previous behaviour). On web/TWA the persistence row stays as-is because there it's actually meaningful.",
      },
      {
        type: "feature",
        text: "Dashboard edit mode now shows 'ghost' tiles for every nav item you've previously removed from the grid — they appear at the end of the live tiles, at a lighter opacity, with a green + badge instead of the red ×. Tap to add the tile back to your dashboard, no detour through Settings. Ghosts can't be dragged above live tiles (they're outside the drag region by design) so 'ghosts always at the end' holds even mid-edit.",
      },
      {
        type: "feature",
        text: "Native Android build: long-press the app icon on your home screen for a 'Quick Actions' shortcut that drops you straight into the same Quick Actions overlay you already get from long-pressing the in-app Quick Check-In button. Customise the menu items themselves from Settings → Quick Actions; the OS shortcut just opens whatever menu you've configured.",
      },
      {
        type: "improve",
        text: "At large accessibility font sizes (150% / 175% / 200%) the mobile header now auto-hides when you scroll down and slides back in when you scroll up. The chrome was eating more than a fifth of the viewport at those sizes — defeating the point of bumping the font for legibility. At normal sizes the header stays put as before, no surprise motion.",
      },
      {
        type: "fix",
        text: "Journals page: opening the Author filter dropdown no longer wrecks the layout (search bar truncated, header pushed off-screen left, etc). The dropdown was overflowing the right edge of the viewport, which let the page horizontal-scroll. Added a defensive overflow-x:hidden at the app root so any future stray-wide child can't trigger this same class of bug, plus constrained the dropdown to the viewport width.",
      },
      {
        type: "fix",
        text: "Native Android build: 'Download Backup' (the primary export in Settings → Data & Privacy → Backup & Export) and the Recovery screen's 'Save standard backup' / 'Save raw on-device file' / pre-reset auto-save buttons were ALL still using the old anchor-download path that no-ops in a Capacitor WebView. Routed every remaining file-save call site through the shared shareFile helper. The Backup & Export screen and the Recovery screen now pop the system share sheet on native exactly like 'Back up now' and 'Save PDF' do.",
      },
      {
        type: "fix",
        text: "Native Android build: 'Back up now' and the therapy-report 'Save PDF' button were both silently doing nothing. Same root cause — navigator.share inside the Capacitor WebView reports canShare({files}) as false and the anchor-download fallback is a no-op there, so the buttons appeared to do nothing with no error. Both now route through a shared file-share helper (src/lib/shareFile.js) that writes to the app's cache via @capacitor/filesystem and hands the file to @capacitor/share — the system share sheet pops up so you can save it to Files, Drive, email, etc. Failures now toast loudly instead of silently. Web/TWA users continue to use the existing Web Share / anchor download path unchanged.",
      },
      {
        type: "fix",
        text: "Native Android build (regression): 'Back up now' was silently failing because the previous build only opted into the native Filesystem write for the auto path, not the manual button — the manual button fell through to navigator.share / anchor download, neither of which work inside a Capacitor WebView. On native we now always try the Filesystem write first; if scoped-storage permission to write into the public Documents folder is denied, we fall back to writing to the app cache + handing the file to the system share sheet via @capacitor/share so you can still file it. Both successes and failures now toast explicitly — no more silent no-shows.",
      },
      {
        type: "feature",
        text: "Scheduled backups got a proper mode picker in Settings → Data & Privacy → Auto-backup. Three choices: Off (no scheduled backups), Back up automatically (runs when you open the app and a backup is due — on native Android, writes straight to your device's Documents folder with no chooser; on web/TWA, the share sheet pops up like before), and Notify me to back up (NATIVE ANDROID ONLY — the OS sends you a tray notification at your chosen interval, tap it to run the backup). The reminder mode also schedules itself with the OS so it fires on the right day even if you haven't opened the app, and survives reboots. Web/PWA shows a 'Native only' explainer for the reminder mode so it's clear why it's unavailable.",
      },
      {
        type: "improve",
        text: "Backup keys list (the set of localStorage preferences that get bundled into every backup) is now a single source of truth in src/lib/backupKeys.js, used by the manual export, the auto-backup, and the recovery raw snapshot. Previously each had its own copy and they had silently drifted — the auto-backup had been missing the same 8 keys the manual export was missing prior to 0.11.7 (journal folders, auto-backup interval, etc.). Auto-backups now capture everything the manual export captures.",
      },
      {
        type: "improve",
        text: "Native Android build: reminder notifications in the tray now show Snooze 10m and Snooze 1h buttons — tap one and the OS will re-fire the reminder at that time, without you needing to open the app. The snooze also writes a record into your inbox so you can see what's been deferred. For more detailed snooze options (tomorrow, next week, custom), tap the notification itself to open the in-app inbox.",
      },
      {
        type: "improve",
        text: "Native Android build: pre-scheduled reminders that the OS fires while the app is closed now honour each reminder's auto-resolve rule when they're back-filled into the inbox on reopen. Example: a 'check in if you haven't recently' reminder set to auto-resolve will no longer leave a stale 'fired' entry in your inbox if you actually had checked in just before it buzzed. The tray notification still appears (Android delivers it before we can evaluate), but the inbox stays clean.",
      },
      {
        type: "fix",
        text: "Landscape orientation: the mobile header was eating roughly a fifth of the viewport because it inherited the portrait 56px row height and the decorative wave block. The header row is now 44px in landscape (still meets the 44x44 tap target minimum) and the wave decoration is hidden in landscape — content area gets the breathing room back.",
      },
      {
        type: "feature",
        text: "Native Android build: reminders now fire even when the app is fully closed. We pre-schedule each upcoming `scheduled` (daily/weekly at HH:MM), `interval` (every N minutes), and `event` (calendar event) reminder with the OS up to 14 days in advance — Android's AlarmManager handles the wake-up, so a 9 AM 'morning check-in' will buzz your phone whether the app is open, backgrounded, or swiped away. On reopen, any reminders the OS fired while you were away are back-filled into the inbox so you don't lose track. Pure-context reminders (e.g. 'when no front update for 2h') still need the app open to evaluate — they keep the existing in-app polling. Pause-all and quiet-hours settings are honoured. Web and TWA users are unaffected.",
      },
      {
        type: "improve",
        text: "Native Android build: reminder notifications now have sound, vibration, and the heads-up bubble — they were silent before because the default Capacitor channel is IMPORTANCE_LOW. We now create a dedicated 'Reminders' channel at IMPORTANCE_HIGH on first launch. Per-channel sound/vibration can be customised in system Settings → Apps → Oceans Symphony → Notifications → Reminders.",
      },
      {
        type: "improve",
        text: "Landscape orientation now uses the mobile layout (top + bottom bars, full-width content) instead of trying to squeeze a 208px sidebar onto a phone landscape viewport — the previous behaviour squished the main content into a 500px-ish column with empty space on the right. The desktop sidebar layout now kicks in at the lg: breakpoint (1024px CSS px) so tablets in landscape and actual desktop browsers still get it; phones in any orientation get the mobile layout.",
      },
      {
        type: "fix",
        text: "Reminders onboarding: the 'Hi [{terms.alter} name]' preset showed the literal text {terms.alter} instead of your alter term, and the 'When a specific {alter} takes {front} — pick {alter} first' subtitle only replaced the first {alter} placeholder. Both now interpolate every occurrence using your customised terminology.",
      },
      {
        type: "fix",
        text: "Native Android build: the sticky page header no longer slides behind the system status bar when you scroll, and no longer collides with the system clock/signal/battery icons in landscape orientation. The previous fix only handled the at-rest position by reserving a separate spacer above the header — the safe-area inset is now baked into the header itself, so it stays clear of system UI in both portrait and landscape, scrolled or not. The bottom navigation bar and the in-app banners get the same treatment for the side and bottom insets. Web and TWA continue to render identically (the OS reports zero insets).",
      },
      {
        type: "fix",
        text: "Backup export now includes eight previously-missed user preferences and one piece of real user data that was being silently dropped from every backup: your journal folder structure (os_journal_folders), your auto-backup interval, the heading-font accessibility setting, the grocery cover privacy lock, and four small view-mode/display preferences. If you've ever restored a backup and noticed your journal folders were gone or your backup schedule had reset, that was why. Existing backup files don't contain these keys; new backups taken after this update do.",
      },
      {
        type: "feature",
        text: "Native Android build: reminders now appear as real system-tray notifications instead of being silenced. Web Push doesn't work inside the native WebView, so on the native app reminders go through Android's local-notifications channel instead. Tap Enable in Settings → Reminders → Push notifications to grant the OS permission; the Web-Push-specific 'VAPID not configured' warning is hidden on native. The 'Test push notification' and 'Show local test notification' buttons both work on native — the Deep-push test is web-only and is hidden. Web and TWA users continue to use the existing Web Push pipeline unchanged.",
      },
      {
        type: "improve",
        text: "Native Android build: the WebView no longer overlaps the system status bar, so the app header sits below the clock and signal icons instead of underneath them. Web and TWA builds are unaffected.",
      },
      {
        type: "feature",
        text: "First-run setup now has an 'Import a backup file' button. Useful when you're installing on a new device — instead of starting empty and then finding the Import option in Settings, you can pull in an existing backup before you've even finished setup. Accepts all three file shapes the app supports: a standard backup, a raw plain on-device file, or a raw encrypted on-device file (you'll be prompted for the password the file was encrypted with). Imported data is loaded as plain on the new device; you can re-enable encryption from Settings afterwards if you want.",
      },
      {
        type: "improve",
        text: "Auto-backup settings now say upfront that backups only run when the app is opened. If you don't open the app for a stretch, the schedule pauses for that gap — open the app at least as often as your interval, or hit 'Back up now' before a long break. Browsers and installed PWAs can't reliably run scheduled tasks in the background, so we want to be clear about it rather than imply set-and-forget.",
      },
      {
        type: "feature",
        text: "Raw on-device data files saved from the Recovery screen are now importable as backups. Settings → Data & Privacy → Import (and the Recovery screen's own Restore button) accept three formats now: a standard Symphony backup file, a raw on-device file (plain), and a raw on-device file (encrypted — you'll be prompted for the password the file was encrypted with). The Recovery screen also gains a new 'Save as standard backup file' button (alongside 'Save a copy of my raw data') so you can choose to download the on-device data wrapped in the standard backup envelope when it isn't encrypted — convenient for importing on another device without going through the raw-file path.",
      },
      {
        type: "improve",
        text: "Recovery screen's Restore step now has a Replace / Add-only toggle, matching the Settings importer — useful when you're recovering onto a device that already has some data you want to keep.",
      },
      {
        type: "fix",
        text: "Hotfix: clarified the Data Recovery screen copy. The previous wording said the saved raw file 'can be used to recover your data later, even if it's encrypted' — which was misleading, because the file is ciphertext and still needs your password to be decrypted. The new copy explains honestly that recovering encrypted data requires BOTH the saved file AND the password, so people don't reset under the false impression that the raw copy alone is enough.",
      },
      {
        type: "fix",
        text: "Major data-safety overhaul to fix a rare but serious case where reopening the app — particularly on Android after the OS or a device-cleaner app cleared part of the WebView's storage overnight — could send the user back into the first-run setup screen against their existing data and effectively wipe it. The boot path now inspects IndexedDB directly before deciding whether you're a new user, and refuses to treat anything that has data on disk as 'first run'. If your data is encrypted but the encryption flag in localStorage was lost, the app now restores the flag from the encrypted file itself and shows the unlock screen as expected. The encryption salt is now stored alongside the encrypted data (not only in localStorage) so a localStorage wipe alone can no longer make encrypted data permanently undecryptable.",
      },
      {
        type: "feature",
        text: "New Data Recovery screen. If the app ever boots into a state where it can see stored data on this device but can't read it (corrupted file, missing encryption salt, IndexedDB error, repeatedly-wrong password, etc.), it now shows a recovery screen instead of either crashing, showing a blank app, or sending you into setup. From there you can save a raw copy of the on-device data file (encrypted ciphertext and all — keep it for support / future recovery), restore from a previous Oceans Symphony backup file, or — only as a last resort — reset the device, which always saves a raw copy to your Downloads folder first before wiping. Reaching this screen no longer destroys anything until you explicitly confirm.",
      },
      {
        type: "improve",
        text: "Persistent storage is now requested before any data is read on app boot, instead of only after the dashboard has rendered. On installed PWAs / TWAs (Android Chrome especially) this gives the storage layer the strongest possible guarantee the OS won't evict it under memory pressure between sessions.",
      },
      {
        type: "improve",
        text: "Unlock screen: after three failed password attempts the screen now shows a 'Can't unlock? Open recovery options' link, so you don't have to keep guessing if something has actually gone wrong with the data file (e.g. the salt was lost) — you can go straight to saving a raw copy and getting help.",
      },
      {
        type: "fix",
        text: "Setup screen will now refuse to complete if it detects existing data on the device. Previously, in the rare wipe scenario above, completing setup again would write a fresh empty database on top of the user's real data. The setup screen now blocks that path and tells you to reload so the unlock / recovery flow can run.",
      },
    ],
  },
  {
    date: "May 14, 2026",
    changes: [
      {
        type: "feature",
        text: "New Auto-Backup feature under Settings → Data & Privacy. Pick a schedule (Daily / Weekly / Every 2 weeks / Monthly) and the app writes a full JSON backup of your data to your device's Downloads folder on that cadence. The Downloads folder lives outside the app's WebView sandbox, so a backup file there survives 'Clear app data', device-cleaner apps, app updates that reset storage, app reinstalls, and most other ways an installed PWA / TWA can lose its data. A 'Back up now' button forces an immediate write and the panel shows the timestamp of the last backup. The same panel also surfaces the browser's storage-persistence verdict (whether your data is eviction-resistant) and offers a button to re-request persistence if the browser hasn't granted it yet — on app boot we now automatically call navigator.storage.persist() so installed PWAs / TWAs get persistence by default. Backups are equivalent to the manual Export — every entity, all local images, and your local UI settings.",
      },
      {
        type: "feature",
        text: "Check-In Log entries can now be edited and deleted in place. The 💬 status-note rows (the 'What's happening right now…' Dashboard saves) get a pencil + trash pair: tap pencil to edit the text inline, tap trash once to arm, tap again within 4 seconds to actually delete (two-tap confirm so a stray finger doesn't lose a note). Formal check-in cards grow a small pencil next to their note text so you can fix typos in the quick-check-in note without re-doing the whole check-in. Edits and deletes propagate everywhere those records show up — the Timeline, the Dashboard's status preview, Therapy Report, etc. all refresh immediately.",
      },
      {
        type: "improve",
        text: "Polls can now be deleted from the detail view. A trash icon next to the Edit / Pin buttons asks for a second tap to confirm (4-second arm window) and then removes the poll record. For polls that originated from a Bulletin Board post, the bulletin's `poll_id` link is cleared too so the bulletin's poll block stops showing as a stale linked-poll.",
      },
      {
        type: "feature",
        text: "New system-wide profile picture. Upload an image (or paste a URL) under Settings → System Name section and it surfaces anywhere the app refers to the system as a whole — 'System' bulletin posts (no specific alter author), 'System-wide' polls in the Polls page (creator avatar + name in the header, system-vote chip next to options), and the AuthorsRow placeholder. Connecting Simply Plural OR PluralKit also auto-fills the system avatar from that account's system-level avatar (and a missing system name from PK), so SP / PK users don't have to upload it twice.",
      },
      {
        type: "improve",
        text: "Bulletin delete is now a two-tap confirm. The trash icon arms on the first tap (turns red and reads 'Confirm') and only deletes on a second tap within 4 seconds — the icon is small and easy to misfire on a phone, especially with how tightly it sits next to the pin. Auto-disarms if you walk away.",
      },
      {
        type: "fix",
        text: "The Guide modal (the welcome / overview cards reachable from the Guide button on the home page) no longer cuts off the dots and the Next/Skip buttons on the last few pages. The modal used `overflow-hidden` on its outer container, so when the body text was tall enough to exceed the dialog's max-height — Privacy & Data is the worst offender — the footer was clipped off the bottom and the user couldn't advance. The header + footer are now pinned, and the body scrolls inside the dialog. Same scroll fix applied to the Report a Bug modal so the Open-on-GitHub / Cancel buttons never get cut off either on shorter phones.",
      },
      {
        type: "fix",
        text: "After finishing the intro breathing exercise inside the 'Help me figure out what I need' flow on the Grounding page, the screen no longer drops you back to the main grounding entry. The state-check answers and the three suggested techniques are still right where you left them, so you can pick the technique you actually wanted after the breathing. Breathing exercises launched from anywhere else (the main entry, the breathing-only picker) still settle back to the entry screen, since those landing pages don't carry any state worth restoring.",
      },
      {
        type: "improve",
        text: "Editing a planned activity now opens the full Plan Activity modal (with start/end date+time, recurrence stays read-only, activity category picker, title, location, critical lead-step windows, fronting alters, linked to-do, and notes) instead of the lightweight Activity Details edit form that only let you change start/end/category/alters/notes. Tap a plan on the calendar or in the Coming Up list → Edit → all of the plan's fields are now editable in one place. (Logged activities still use the lighter inline edit since they don't have the full plan-only field set.)",
      },
      {
        type: "improve",
        text: "Plan locations are now tappable everywhere they show up — Activity Details, the Coming Up widget, and the Critical pinned-plan cards. Tapping opens Google Maps (web or your default Maps app on mobile) pre-filled with that location text. No more copy-paste-to-Maps shuffle when you're heading out the door.",
      },
      {
        type: "fix",
        text: "Buttons that navigate to another page inside the app no longer reload the whole page. Previously a handful of in-app navigations (the Quick Check-In 'open grounding' prompt, the Inner-World Map 'View full profile', the 404 page's Go Home button, and the Activity Tracker's row-click that routes to a linked to-do) used `window.location.href = '/path'` — which does a full page reload, and in some Android Chrome / PWA combinations a full reload can occasionally pop the standalone app out into the browser tab. Those calls now use the in-app navigation (react-router's `navigate`), so they stay client-side and shouldn't bounce out of the installed PWA anymore. (Intentional full reloads remain after destructive resets — Delete-all-data, logout — where the entire app state needs to clear.)",
      },
      {
        type: "improve",
        text: "Quick '+ Add option' button at the bottom of a poll's option list. Tap it on the detail view to reveal an inline input, type a new option, hit Enter (or the Add button) and it appends to the poll right away — no more bouncing through the Edit modal just to add a missing option. Same 8-option cap as the Edit modal. Hidden when the poll is closed.",
      },
      {
        type: "feature",
        text: "Polls page: 'Voting As' is now a button that pops a multi-select modal (instead of a tall inline grid). The modal defaults to whoever is currently fronting, and you can pick any combination of alters and/or System-wide. Each tap on an option then casts a vote once per selected voter, so multiple alters can cast their votes in one shot. Hit 'Reset to current front' inside the modal to snap back to the fronters; tap individual tiles to add or remove them. The button label summarises the picks ('Castiel + 2 others', 'System-wide', etc.) so you can see at a glance who's voting next.",
      },
      {
        type: "feature",
        text: "Polls can now be edited after creation. A pencil icon next to the poll's question opens an Edit modal where you can rename the question, edit existing option labels (votes stay attached), add new options (up to 8), remove options (with a confirm if there are votes that would be lost), and flip the voting mode between per-alter and anonymous tally. Re-keying of votes is handled automatically when options are added or removed, so vote counts stay aligned with the visible options.",
      },
      {
        type: "improve",
        text: "Critical pinned-plan cards on the Dashboard (the orange 'Critical · 15 min before / Therapy' style cards at the top of the page) now respond to a double-tap by opening that plan's Activity Details modal in the Activity Tracker. Single-tap is still a no-op so you don't accidentally navigate while reaching for the dismiss X. Upcoming-plans rows in the Coming Up widget also deep-link straight into the matching plan's details modal now (instead of dropping you on the calendar with no selection).",
      },
      {
        type: "feature",
        text: "Polls now have two voting modes: per-alter (the existing behaviour — one vote per alter, tap again to remove) and anonymous tally count (each tap on an option just adds 1, no toggle, no per-alter accounting). Toggle 'Anonymous tally count' at the top of the Create Poll modal or on any existing poll's detail view. Whichever mode you pick becomes the default for the next poll you make (each poll can still be flipped individually). In tally mode the 'Voting As' avatar grid is hidden (no voter to pick), the 'you voted' highlight goes away, and a − button appears next to each option so you can subtract a click that landed on the wrong option. Bulletin Board polls and pinned poll cards both honour whichever mode the linked poll is in, so voting from any surface stays consistent.",
      },
      {
        type: "improve",
        text: "Pinning a poll now surfaces it in the Bulletin Board's Pinned section (in a votable card) instead of the Dashboard's top Pinned section. Polls posted to the Bulletin Board auto-pin themselves there too, so the question is hard to miss right after you post it. Hit the pin icon again on the poll's detail view (or the small pin in the corner of the pinned card) to unpin from the board. The Dashboard's top Pinned section is back to just to-dos and bulletins — pinned polls live where the votes are, alongside the rest of the board.",
      },
      {
        type: "improve",
        text: "On the Polls page, the 'Voting As' and 'Created By' dropdowns are gone. They're replaced by an avatar grid that mirrors the Set Front modal — a circular tile per alter plus a leading 'System-wide' tile, with the selected one highlighted. Tap a tile to pick that voter; tap System-wide to vote/post as the system. No more scrolling a tall dropdown to find an alter.",
      },
      {
        type: "feature",
        text: "Bulletin Board polls now mirror to the Polls page. When you post a bulletin with a poll attached, a corresponding Poll entity is created automatically and shows up in the Polls page list. Voting from either surface updates the same record, so counts and your selected option stay consistent. Double-tap a bulletin's poll block to jump straight to its detail view on the Polls page (a small Open-in-Polls icon does the same with one tap). The Polls list and detail view label these as 'from Bulletin Board' so you can tell them apart from polls created directly on the Polls page. Existing inline-only bulletin polls (made before this change) keep working in-place; only new bulletins create the linked Poll record.",
      },
      {
        type: "improve",
        text: "Desktop / web header now reads 'Oceans Symphony' (not just 'Symphony') and stretches edge-to-edge: the logo + name sit flush to the left side of the window and the nav buttons sit flush to the right. Previously the header content was constrained to a centred max-width column, so on a wide window the title floated near the centre with empty space on either side. Mobile header layout is unchanged.",
      },
      {
        type: "feature",
        text: "New Display menu on the Check-In Log lets you choose which entry types appear in the log: check-ins, status notes (the 'What's happening right now…' Dashboard inputs), symptoms, activities, locations, per-alter entries, and diary data. Toggling one off only hides it from the Check-In Log view — your data is still recorded and still surfaces elsewhere (Timeline, analytics, etc.). The choice persists across sessions. Use 'Hide everything' / 'Show everything' at the bottom of the menu to flip the whole set at once. Replaces the long-standing request to be able to remove individual status note rows from the log; in practice, hiding the entry type is what most testers actually wanted.",
      },
      {
        type: "fix",
        text: "Voting on a poll posted to the Bulletin Board now works when no specific alter is fronting (or when fronters haven't been set at all). Previously the vote handler silently bailed out unless `currentAlterId` was truthy, which made the option buttons appear unresponsive — and because the app also has a triple-tap-anywhere panic gesture that opens the Grocery List privacy cover, mashing the option three times in quick succession would open the Grocery panel instead of voting. Votes are now stored against the active fronter or, when nobody is fronting, a system-wide identifier. The same fix also covers bulletin reactions (the +React button and the 'Add yours' button in the reaction list).",
      },
      {
        type: "improve",
        text: "Picking a specific alter is now optional everywhere it used to be required. On Polls, both creating a poll and voting on one no longer block you with 'Select an alter' — the dropdown defaults to a clear 'System-wide (no specific alter)' option so you can post or vote as the system as a whole. System-wide polls can be closed by anyone (poll-creator polls still close only via the creator). Vote counts include system-wide votes with a neutral system chip in the avatars row.",
      },
      {
        type: "fix",
        text: "Banners imported from Simply Plural and PluralKit now show up as the alter's profile header image. Previously the banner URL was stored on the alter but nothing displayed it, so headers stayed blank even when SP/PK had a banner set. The header image is wired to the same checkbox as avatars on SP import — uncheck 'Refresh avatars & banners on existing alters' if you've manually picked a different header in OS and want to keep it.",
      },
      {
        type: "fix",
        text: "Re-importing from Simply Plural no longer wipes locally-customised profile-style settings on existing alters. The importer was passing the full custom_fields object to update, which replaced any local-only keys (background color, background image, hide-header flag, header text color, header image, section background opacity, page text color) with just the SP custom fields. Local `_*` keys are now preserved across re-imports while SP custom fields stay authoritative.",
      },
      {
        type: "fix",
        text: "Re-importing from Simply Plural now refreshes avatars and banners on existing alters by default. Previously the 'Overwrite avatars on existing alters' checkbox defaulted to OFF, so if an alter's avatar URL changed on SP's side (e.g. you sync SP from PluralKit on Discord and PK migrated their image CDN from cdn.discordapp.com to cdn.pluralkit.me), the new URL was silently skipped and your local copy kept the stale URL — which now 404s because Discord's CDN started rejecting unsigned attachment URLs. The checkbox is now ON by default and is labelled 'Refresh avatars & banners on existing alters'; uncheck it before importing if you've manually customised avatars locally and want to keep them.",
      },
    ],
  },
  {
    date: "May 13, 2026",
    changes: [
      {
        type: "fix",
        text: "Friends who used to see 'No one fronting' even while you had an active alter up front should now see the right names. The cause: the friend-front sync was only reading the new per-alter session format and skipping the older grouped session format (one row with primary_alter_id + co_fronter_ids). Long-running sessions from before the schema change pushed an empty fronters list every time. Sync now handles both formats. A switch via any path will trigger a fresh push within 30 seconds; you can also open and save Set Fronters once to force one immediately.",
      },
      {
        type: "feature",
        text: "New in-app bug reporter under Settings → Report a Bug. Fill in a short summary, what happened, what you expected, and (optionally) repro steps. Tap 'Open on GitHub' and your phone's browser opens a fully pre-filled GitHub issue — your app version, current URL, screen size, and user agent are auto-attached so we don't have to ask. A mailto: fallback covers users without a GitHub account. All bug reports land in one place where they're labelled and triaged.",
      },
      {
        type: "improve",
        text: "Anonymize / screenshot-mode toggle (the camera icon on the Alters page) now also blurs the alters in the Dashboard's Currently Fronting widget — names blur in 'names' mode, names AND avatars blur in 'all' mode. Previously the toggle only affected the Alters page, so screenshots that included the dashboard's currently-fronting strip would still reveal identities. The mode persists in localStorage so it stays consistent across both surfaces.",
      },
      {
        type: "feature",
        text: "Two small icons (orange ⚠ Triggered, 📖 Journal) now sit next to the Switch button in the Currently Fronting widget on the Dashboard. When you switch via a method that doesn't go through the Set Fronters modal — long-press, quick action, etc. — you can still flag the switch as triggered and capture a category/label, or open the Switch Journal flow, after the fact. The trigger icon glows orange when the current switch is already flagged. Available whenever there's at least one active fronting session.",
      },
      {
        type: "improve",
        text: "Set Fronters modal: the selected-alter chips at the top now support the same gestures as the dashboard's Currently Fronting widget and the list rows below. Long-press a chip to toggle primary, swipe left to toggle primary, swipe right to remove the chip from the selection. Tap still toggles primary as before. Helpful preview labels now fade in above each chip as you start a swipe so you can tell what's about to happen.",
      },
      {
        type: "improve",
        text: "Feature Tour caught up to recent UI changes. The 'Notifications Bell' step is now 'Notifications Inbox' and references the inbox icon the header actually uses (which we picked deliberately to distinguish it from the bell used for reminders elsewhere). Older steps that mentioned 'a notification in the bell' have been updated to say 'in the inbox' to match. Also added a new step on the dashboard explaining how to open the sidebar — tap the logo in the top-left of the header.",
      },
      {
        type: "feature",
        text: "New Resources page in Support → Learn that credits the source workbooks the curriculum is drawn from (Finding Solid Ground primarily, with material from Coping With Trauma-Related Dissociation) and links to further reading and well-known online resources for the plural / DID community — Dissociation Made Simple, When Rabbit Howls, did-research.org, ISSTD, An Infinite Mind. Reachable from a new Resources tile alongside My Reflections and Needs Check-In at the top of the Learn tab. The Guide's Support & Learn slide and the Feature Tour now also mention the source workbooks so credit is visible from the very first run.",
      },
      {
        type: "hotfix",
        text: "Hotfix: Guide / Support & Learn card said '10-module curriculum' but the actual curriculum has 13 modules. Updated to match.",
      },
      {
        type: "hotfix",
        text: "Hotfix: renamed the welcome modal's 'Skip tour' button to 'Skip guide' — the modal is the Guide (overview cards on first run), and the Tour is the separate interactive feature walkthrough. Calling its skip button 'Skip tour' was confusing.",
      },
      {
        type: "fix",
        text: "Removed the misleading X close button on the first-run 'Choose your language' modal. The X never actually closed the modal — terminology selection is required to proceed — but its presence suggested otherwise. The Save & Continue button is now the only way forward, which matches reality.",
      },
      {
        type: "feature",
        text: "Simply Plural's custom fronts can now be imported as symptoms in addition to (or instead of) alters. Custom fronts often represent dissociative / emotional / physical states — anxious, depressed, in pain — which are usually a better fit for the Symptoms tracker than the alter list. Settings → Data & Privacy → Simply Plural → 'Custom Fronts → symptoms' is a separate checkbox from 'Custom Fronts → alters', so you can pick either, both, or neither. Each imported symptom is tagged with the SP id so a second import updates the label/color instead of duplicating, and your per-symptom is_positive flag is preserved across re-imports.",
      },
      {
        type: "fix",
        text: "PNG image uploads (avatars, banners, headers, inner-world backgrounds, journal block images, relationship images) preserve transparency now. The compression step was force-encoding every uploaded image to JPEG, which doesn't support transparency, so transparent PNGs ended up with black backgrounds. Uploads that come in as PNG now stay as PNG; everything else (JPEG, etc.) still gets JPEG-compressed as before.",
      },
      {
        type: "fix",
        text: "Push notifications were being silently dropped because two separate service workers were registered at the same root scope — the main offline-caching SW (sw.js) and a dedicated push SW (sw-reminders.js). Per the Service Worker spec, two registrations at the same scope conflict and alternate as the active one; after every page load /sw.js was the active SW, and pushes still routed to it but it had no push event handler, so they vanished. Local 'Show local test' notifications worked because they bypass the push event lifecycle. The push handler is now folded into the main sw.js so there's exactly one SW at the root scope, and old /sw-reminders.js registrations from previous builds are unregistered automatically the next time push is enabled. After the deploy, force-stop the app and reopen so the new SW activates (or uninstall+reinstall if you really want to be sure).",
      },
      {
        type: "fix",
        text: "Push notifications never appeared in the system tray even though every check in the diagnostic was green. Cause: the service worker's notification icon was pointing at /oceans-symphony-logo.png, which doesn't exist (the actual icon is /icon-192.png). When Chrome on Android handles a push event, a failing icon fetch during showNotification can silently abort the entire notification display — local 'Show local test' notifications don't go through the same code path, which is why those worked while real pushes didn't. Icon paths now point at /icon-192.png everywhere. After the new deploy is live, force-stop the app and reopen to let the new service worker take over.",
      },
      {
        type: "improve",
        text: "Settings → Custom Fields list is now scrollable when you have more than six fields. Previously a long list of custom fields pushed everything else on the Settings page way down; the list now caps at about six rows tall and scrolls within the card so the rest of the page stays reachable.",
      },
      {
        type: "feature",
        text: "PluralKit integration — connect your PluralKit account in Settings → Data & Privacy and (1) import members and groups, (2) import switch history (with selectable date range, last 7 days to all-time), and (3) export local alters back to PluralKit (new local alters get created on PK, existing ones get updated; switches and groups are NOT exported). Your PluralKit token is stored locally on this device only and (if storage encryption is on) encrypted at rest — it is sent only to api.pluralkit.me and never logged. PluralKit tokens are full read-write by design, so the connect dialog reminds you that you can invalidate a leaked token from Discord with `pk;token refresh`. Export is rate-paced to stay under PluralKit's 3-write-per-second limit.",
      },
      {
        type: "fix",
        text: "The in-app Back button (top-left chevron) sometimes did nothing when you tapped it — particularly after deep-linking into a page or reloading. The button was driven by a counter that incremented on every navigation including backward navigation, so it could think there was history to go back to when there wasn't, and React Router's navigate(-1) silently no-ops in that case. The button now reads React Router's own history index, and if there's no real history to pop it falls back to the Dashboard so the tap is never a dead end.",
      },
      {
        type: "fix",
        text: "Critical accessibility fix: the first-run disclaimer modal was unreadable / unsignable at large OS text sizes. The checkbox label was pushing the Continue button off the bottom of the visible area with no way to scroll to it, so anyone using accessibility text sizing was hard-locked out of the app after their first install. The whole disclaimer card now scrolls as one unit (header sticky at the top while you scroll), the Continue button is taller, and the layout works at any text scaling.",
      },
      {
        type: "fix",
        text: "Friend-request Accept and Decline buttons on the Friends page now give immediate visible feedback when tapped — a 'Accepting…' / 'Declining…' loading toast appears the instant you tap, then resolves to success or a real error message. Previously the buttons felt unresponsive if the network call was slow or failed silently. The tap targets are also a bit taller (36px min height) for easier finger placement and use the standard touch-manipulation hint so Android doesn't insert its own ~300ms tap delay.",
      },
      {
        type: "hotfix",
        text: "Hotfix: reverted the modal ghost-tap shield from v0.9.9 — it was breaking interactions in every dialog (Terms Setup wouldn't accept a selection, Set Fronters dismissed when you tapped the search field, etc.). Taps inside dialog content were falling through to the backdrop for the first 300ms after open. The original ghost-tap problem on the Dashboard's Quick Check-In button can come back, but a frozen modal is much worse than an occasional mis-selection — we'll re-do that fix more carefully in a future release with a different approach.",
      },
      {
        type: "feature",
        text: "Plans can now repeat on a schedule. When you create a new plan, a Repeat section lets you pick Daily / Weekly / Every 2 weeks / Monthly and how many occurrences (up to 52) — perfect for setting up a weekly therapy appointment or a daily standing meeting in one shot. Each occurrence is its own plan record so individual ones can be edited or skipped, and they all share a recurrence group so future versions of the app can offer edit-series / delete-series.",
      },
      {
        type: "improve",
        text: "Activity picker now has a search box that works just like the emotion search. Type to filter all activities (including nested ones inside categories like Self Care or Recreation) into a flat list — no more drilling through the tree when you remember the activity name but not which category it lives in. Each result shows the category path so you can tell similarly-named entries apart.",
        text: "Added a clear medical / scope disclaimer to the app. Oceans Symphony is a personal journaling and organisation tool — it is not a health app, not a therapy app, and not a substitute for professional care. The developers are a DID system, not licensed clinicians, and the app has not been reviewed or endorsed by any medical institution. A first-run modal asks new users to acknowledge this before continuing, and the full text is always available under Settings → Disclaimer (including crisis-line numbers in case the app is opened in an emergency it can't help with).",
        text: "Grocery list got a real upgrade. (1) Frequent items — tap the star next to any item to save it as a frequent purchase; saved items appear as one-tap chips above the list so you can re-add them without retyping. (2) Lock-on-close — if you have encryption turned on, a lock icon in the header lets you arm 'closing this list requires my password', turning the grocery cover into a one-tap hide-and-lock gesture. (3) The list now stays anchored when you tap the input — only the input slides up with the keyboard, so you can still see everything you've already written. The grocery list also got its own feature-tour step explaining the privacy-cover behaviour and the triple-tap gesture, since it's not just a grocery list. Frequent-item favourites are included in your data backup.",
        text: "Added a Play Store tester recruitment banner to the Dashboard. We need a handful of testers to graduate Oceans Symphony from internal testing to the public Google Play listing — drop your Google account email in the banner and tap Sign me up, and your phone's email app will open with a pre-filled message addressed to the developer. The banner is dismissable per device.",
      },
      {
        type: "hotfix",
        text: "Hotfix: belt-and-suspenders for the Android URL bar fix — the Vite plugin that copies the Digital Asset Links file into the build output works locally but may be unreliable on Vercel's build environment, so the build script now also explicitly copies the file as a postbuild step and prints the resulting directory to the build log so we can verify it ran.",
      },
      {
        type: "fix",
        text: "Fixed an annoying ghost-tap when opening modals on Android. Tapping the Dashboard's Quick Check-In button could auto-select whichever emotion chip happened to be rendered under your finger when the modal popped open — same thing for any modal triggered by a tap. Android Chrome (and the TWA wrapper) synthesises a click event ~300ms after each tap, and that click was landing on the freshly-opened dialog content. Modals now ignore taps for the first 300ms after opening, which catches the ghost click without being long enough to feel sluggish.",
      },
      {
        type: "fix",
        text: "TWA URL bar across the top of the Android app is finally gone. Google's Digital Asset Links verifier was hitting the previous Vercel rewrite for /.well-known/assetlinks.json as a redirect, and the spec disallows any redirects when fetching the file. The asset links file is now served directly from the canonical /.well-known/ path in the build output via a tiny Vite plugin that copies it into dist/.well-known/ (Vite normally skips dot-directories under public/). Force-stop and reopen the app once the new deploy is live and Android will re-verify cleanly.",
      },
      {
        type: "fix",
        text: "Added Google Play's app-signing certificate fingerprint to the Digital Asset Links file. Play re-signs uploaded bundles with its own key, so the cert running on installed devices is different from the local upload key — without Play's fingerprint in assetlinks.json, Android can't verify the link and the Chrome URL bar shows across the top of the installed app. Both fingerprints are now listed (upload key + Play signing key). Force-stop and reopen the app once the new deploy is live to clear Android's cached verdict.",
      },
      {
        type: "fix",
        text: "The Android app was displaying a Chrome URL bar across the top instead of running fullscreen. The Digital Asset Links file at /.well-known/assetlinks.json was returning 403 because Vite doesn't copy dot-prefixed directories from public/ to the build output, so Android couldn't verify the link between the app and the site. The file is now served from /assetlinks.json with a Vercel rewrite exposing it at the well-known path Android looks for. Once the new deploy is live, the URL bar will go away on next app launch (verification re-runs automatically).",
      },
      {
        type: "fix",
        text: "PWA manifest was declaring the app under the 'health' category and describing it as 'built for dissociative systems', which Google Play's TWA classifier was reading as a medical-app declaration and rejecting the listing on Play Console Requirements grounds regardless of how the store listing was worded. Manifest category is now lifestyle/productivity/utilities, and the description and shortcut labels are reframed as a journaling/organizer app — the in-app feature names and behaviour are unchanged.",
      },
      {
        type: "fix",
        text: "The /privacy page was showing a blank screen instead of the privacy policy. The page bypasses the normal app setup so it stays reachable before login, but that bypass was missing the React Query provider that the terminology hook depends on, so the component crashed on render. The provider is now included in the bypass, and the privacy policy loads correctly whether or not the app has been set up.",
      },
      {
        type: "improve",
        text: "Dashboard grid defaults overhauled. Every page except 'Home' is now on the grid by default (added the missing To-Do List, System History, and Location History; dropped the redundant 'Home' tile since the grid lives on Home itself). Tiles are now ordered by intent — daily capture flow first (alters, meeting, timeline, journals, tasks, to-do, check-in log), then tracking, then system internals, then care, then sharing/reminders, then settings — instead of the previous random-looking order. Existing users with a custom layout keep their layout; the three new tiles get appended automatically.",
      },
      {
        type: "improve",
        text: "Timeline event column now packs co-timed entries into horizontal lanes instead of stacking everything vertically — a batch of quick-tasks logged within seconds of each other shows up as a single row of small icons rather than a tall ladder, so you can tell at a glance that they all happened at roughly the same moment. Each event still expands into a full detail popup on tap.",
      },
      {
        type: "fix",
        text: "Quick-task bulletins (the `📊 Quick task` button on the Bulletin Board) were appearing twice on the Timeline — once as a 📌 bulletin entry showing the raw `[task:abc123…] title` content, and once as a ✓ task entry. The bulletin half is now suppressed since the task already represents the same record, and any stray task-bulletin that does slip through has its `[task:ID]` prefix stripped from the detail popup so the raw identifier doesn't leak into the UI.",
      },
      {
        type: "fix",
        text: "Backup & restore was silently dropping the Grocery list (and a couple of other entities) — `GroceryItem` was registered in the entity allow-list but never assigned to any export category, and the export iterator walks the categories rather than the allow-list. Added a new 'Grocery List' category, plus folded the previously-missing `SymptomDefinition` into 'Symptoms & Tracking' and `QuickAction` into 'Settings & Custom'. Existing backups taken before this fix won't have those entities — re-export to capture them. Also documented the two-array trap in CLAUDE.md so future entities don't slip through.",
      },
      {
        type: "fix",
        text: "Stuck 'ghost' fronting sessions that wouldn't stay ended (a record with no end_time that re-appeared on the Timeline every time you reopened it) now have two escape hatches in the session popover. 1) The existing 'End session now' button additionally sweeps every other ghost session for the same alter that's older than 12 hours, so ending one stuck row clears the whole pile in a single tap. 2) A new red 'Delete session' button (two-tap-confirm) hard-deletes the FrontingSession record outright for cases where ending alone doesn't make it disappear.",
      },
      {
        type: "hotfix",
        text: "Hotfix: v0.8.8 changelog claimed the Accessibility text-size grid was expanded but the actual options array didn't get updated in that commit — fixing it now. The Accessibility page now genuinely exposes Tiny through Huge (200%).",
      },
      {
        type: "fix",
        text: "Accessibility settings page only had 4 text-size options (Small / Default / Large / Extra Large). The full set — Tiny through Huge (200%) — was added to Advanced Appearance but never made it onto the Accessibility page where it actually belongs. Accessibility now exposes all 11 sizes including the 175% and 200% options.",
      },
      {
        type: "improve",
        text: "Task-bulletin cards pinned to the Dashboard now inherit the urgent-orange styling from their linked to-do — so when an urgent to-do is the one being rendered as a bulletin card (the de-dup case), it keeps the amber border + 'Urgent to-do' label instead of looking like a regular pinned task-bulletin.",
      },
      {
        type: "fix",
        text: "Dashboard's Pinned strip was showing the same to-do twice when it had been pinned both from the To-Do page (Task.pinned_to_dashboard) and from the bulletin board (a task-bulletin's dashboard pin). Now it de-duplicates: if a task-bulletin pinned to the dashboard references the same task as a pinned-to-do, we render only the bulletin card (so the inline checkbox, comments, and rich actions are preserved) and skip the plain to-do row.",
      },
      {
        type: "improve",
        text: "Per-alter notes, emotions, and symptoms now also roll up into the Check-In Log's Day Total section under a new 'Per-alter' row, so the at-a-glance day summary reflects them too instead of only the per-entry list above.",
      },
      {
        type: "fix",
        text: "Check-In Log was including future-dated planned activities (e.g. an appointment scheduled for next Friday showed up on Friday's row before it had happened). The log is a history view, not a calendar — so planned activities whose timestamp is still in the future are now filtered out and only appear once their time has actually elapsed.",
      },
      {
        type: "feature",
        text: "Pinned and urgent to-dos on the Dashboard now have a checkbox you can tap to mark them complete inline — no more bouncing into the To-Do List page just to tick something off. Tapping the row still opens the task; tapping just the circle toggles complete. Completed tasks drop off the Pinned strip automatically.",
      },
      {
        type: "feature",
        text: "Timeline symptom and emotion rows now show a small alter-color dot stack indicating which alter(s) were fronting at the moment the entry was logged. Tapping the row opens the details popup, which lists the tied alters as full name + color chips. Symptoms use the active fronting session at start-time; emotions use the check-in's saved fronting_alter_ids.",
      },
      {
        type: "improve",
        text: "Accessibility: text & UI size in Advanced Appearance now goes up to 175% (XXXXL) and 200% (Huge) for low-vision users — the previous cap was 150%. Also swept the codebase replacing fixed-pixel font sizes (`text-[10px]`, `text-[9px]`, etc.) with rem-equivalent classes so the small text inside chips, badges, and metadata labels now scales properly with the accessibility setting instead of staying tiny at any zoom level.",
      },
      {
        type: "feature",
        text: "Per-alter notes, emotions, and symptoms — the things you log via the fronting-alter dropdown on the Dashboard, and the 'Note for X appears as 💬 on their timeline' field — now surface read-only in two new places: (1) the Check-In Log shows them on the same day timeline as your regular check-ins, with the alter's name + color chip on each entry; (2) the alter's Board tab gets a new 'Session' filter that lists every per-alter note / emotion / symptom they're associated with. No data is duplicated — both views render directly from the FrontingSession record.",
      },
      {
        type: "feature",
        text: "Long-press a to-do (on the dashboard's Pinned strip or on the To-Do List page) to open a quick-actions sheet with the two most-changed toggles — Pin to dashboard and Mark as urgent — without having to open the full edit form. Tap to navigate as usual; press and hold for ~500ms to bring up the sheet.",
      },
      {
        type: "fix",
        text: "Pin to dashboard / Mark as urgent toggles inside the to-do edit form were hand-rolled with `bg-muted-foreground/30` for the off-state, which rendered nearly invisible against the surrounding card on dark themes. Replaced them with the (now-fixed) shadcn Switch component so the off-state has a real border + visible thumb, matching every other toggle in the app.",
      },
      {
        type: "fix",
        text: "Simply Plural import was dropping avatars for any member whose avatar was stored as a UUID rather than a full URL (common in larger / older systems where mobile uploads were saved as `avatarUuid`). The importer only read `avatarUrl` / `avatar_url`, so anything in `avatarUuid` was silently discarded. Added a CDN URL composer that builds `https://spaces.apparyllis.com/avatars/{system_uid}/{avatarUuid}` when only the UUID is present, falling back to an empty avatar if neither field is set. Applies to both regular alters and custom fronts.",
      },
      {
        type: "fix",
        text: "Toggle switches (e.g. Pin to dashboard / Mark as urgent in the to-do form) were nearly invisible in their off-state on dark themes — the shadcn Switch was using the `--input` CSS variable for the unchecked track, but the app's themes never define `--input`, so it fell back to a near-black default that blended into the card background. Switched the unchecked track to `bg-muted` with a visible border, and brightened the unchecked thumb to `bg-foreground/80`, so the off-state stays visible on every theme without changing the on-state.",
      },
      {
        type: "fix",
        text: "Alter profile role pill was unreadable when the alter's color was similar to their header background color (e.g. a deep-purple alter with a deep-purple header wash) — both the soft tint and the text were the same hue, so the role chip disappeared into the backdrop. The pill now does a WCAG contrast check: if the role-text color and the header background are too close (ratio < 3:1, AA-large), it switches to a solid pill using the alter's color as the background and an automatically-picked black/white text color, so the chip stays visible while still showing the alter's color identity.",
      },
      {
        type: "fix",
        text: "Grocery list / privacy cover header was being clipped under the iOS status bar on iPhones — the panel is `fixed inset-0` and didn't account for `env(safe-area-inset-top)`. The X close button and \"Grocery list\" title were overlapping the time / battery indicators. Added safe-area padding to the panel's top and bottom so the header clears the status bar and the input clears the home indicator.",
      },
    ],
  },
  {
    date: "May 10, 2026",
    changes: [
      {
        type: "fix",
        text: "Tapestry preview's daily task templates weren't showing up on the Daily Tasks page — the records used the old schedule_days / schedule_time / priority schema instead of the current frequency / mode / is_active / points shape, so the is_active filter dropped every row. Rewrote them with the proper schema (10 templates, six daily + four weekly, with descriptions and point values).",
      },
      {
        type: "fix",
        text: "Sleep tracker preview data was crashing the Sleep page — bedtime / wake_time were stored as HH:MM strings, but the page expects full ISO datetimes. parseISO returned Invalid Date and format() threw. Rewrote the 14 sleep entries with proper ISO datetimes built from a (daysAgo, bedHour, wakeHour) helper, quality values on the 1–10 scale, plus a couple with extra flags (interrupted, dreamed, had_nightmare) so the Sleep page has variety to show.",
      },
      {
        type: "improve",
        text: "Pinned bulletins, pinned to-dos, and critical-plan banners now show only on the Dashboard, not on the Alters / Home page. The Alters page is the directory; the dashboard is the at-a-glance home. Surfacing the same pins on both made the alters list cluttered.",
      },
      {
        type: "fix",
        text: "System Meeting page crashed when opened in preview mode (and for any check-in created before the date column existed). The list and detail views both read `checkIn.date.split(\"-\")` without checking whether `date` was set; `undefined.split` threw and unmounted the page. Both sites now fall back to `created_date` when `date` is missing, with an \"Undated check-in\" label if both are absent or unparseable.",
      },
      {
        type: "fix",
        text: "Two more places had the same naive `${task.due_date}T23:59:59` string-concat that silently mis-counted (and could throw on) tasks with full-ISO due_dates: the To-Do nav badge in both the AppLayout sidebar and the dashboard quick-nav grid. Both now branch on whether the string already contains \"T\" and NaN-guard the result so a corrupt timestamp doesn't poison the count.",
      },
      {
        type: "fix",
        text: "Tapping the upcoming-plans banner used to crash the app the moment it navigated to /activities. The activity grid's task-synthesis step did the same naive `${t.due_date}T08:00:00` string-concat that crashed the Dashboard last release — for tasks with full ISO due_dates that produced garbage and Invalid Date, which `ts.toISOString()` threw on. Parser now detects both shapes (YYYY-MM-DD vs full ISO) and skips genuinely broken records instead of unmounting the page.",
      },
      {
        type: "fix",
        text: "Dashboard crashed in preview mode (and any time a pinned to-do had a full-ISO due_date) because the Pinned strip's row was naively appending \"T00:00:00\" to the date string and feeding the result to `new Date()`. For ISO timestamps that produced \"…ZT00:00:00\" — Invalid Date — and `format()` threw, taking the dashboard with it. Now uses a robust parser that handles both YYYY-MM-DD and full ISO shapes.",
      },
      {
        type: "fix",
        text: "Set Fronters modal was rendering empty (just the title bar) during the feature tour because the tour disables Radix's modal backdrop so the tour buttons stay tappable — without the backdrop, the page behind bled through and the modal looked broken. The dialog now paints its own scrim at z-40 while the tour is active, so modals stay readable as proper modals during walkthrough steps.",
      },
      {
        type: "improve",
        text: "Filled out the Tapestry example system (the non-wiki preview) so screenshots have more to show: reminders rewritten in the modern schema with a mix of trigger types (scheduled, interval, contextual, event) and inline actions; ~18 more activities scattered across the past month so the Month + Year views render populated; a couple of pinned and urgent to-dos so the Dashboard Pinned strip surfaces something interesting, plus one with a scheduled_at so it shows on the activity grid as a real block.",
      },
      {
        type: "improve",
        text: "Moved the 🛒 Grocery list button from the dashboard header into the sidebar drawer header (next to the X close button). One less icon at the top of the dashboard. Still openable via triple-tap anywhere on the screen, and via the View/Add grocery list quick actions if you've configured them.",
      },
      {
        type: "fix",
        text: "App Wiki: the mini-toolbar walkthrough alter had pages of text rendered as one giant strikethrough block, because the code-chip helper inserted example HTML tag text (\"<s>\", \"<strong>\", \"<em>\", etc.) without escaping — the browser parsed them as real formatting tags. Code chip examples now properly escape `<`, `>`, `&`, `\"`, so the wiki reads as documentation instead of as one long crossed-out paragraph.",
      },
      {
        type: "fix",
        text: "App Wiki preview alters were rendering blank and weren't grouped — the alter entity uses `description` (not `bio`) for the bio HTML, and groups own their members via `member_alter_ids` (not the other way round). Both are corrected and the 17 wiki bios + 7 group folders now show up properly.",
      },
      {
        type: "fix",
        text: "\"Revert to preset\" in Settings → Appearance no longer crashes the app. The crash was reading `colors.bg` when the resolved theme was undefined (e.g. when selectedTheme was still \"custom\" and customColors had just been cleared). The reading is now null-safe, and Revert falls back to a real preset if the captured originalTheme was also \"custom\".",
      },
      {
        type: "fix",
        text: "Picking a built-in preset after using Custom Colors used to revert to the custom colours every time the app reopened. The persistence effect only wrote customColors when set and never removed the localStorage entry when cleared, so the stale custom-color blob would override the preset on next load. Switching presets now properly clears the custom-color persistence.",
      },
      {
        type: "fix",
        text: "Grocery list \"Clear checked items\" now requires two taps within 4 seconds — first tap shows \"Tap again to clear\" in red, second tap actually deletes. Prevents accidental taps from wiping the list. The list still persists across sessions otherwise.",
      },
      {
        type: "improve",
        text: "Push notification diagnostics: added a \"Deep push test (30s)\" button next to the existing test. It sends a real push tagged with a unique ID, then listens for the service worker to echo it back via postMessage. Three possible outcomes: **delivered** (whole pipeline works — if no tray notification, the OS is suppressing display only), **sw_only** (server accepted the push but the SW never woke up within 30s — stale subscription or VAPID key mismatch or battery saver), or **send_failed** (server rejected the send). The regular Test push diagnostic also now compares build-time VITE_VAPID_PUBLIC_KEY against the server's VAPID_PUBLIC_KEY and surfaces a clear MISMATCH row if they differ — that's the silent killer where pushes look successful but never get delivered.",
      },
      {
        type: "feature",
        text: "**App Wiki preview** — Preview Mode now has a new \"App Wiki\" example system whose alters' profiles are a walkthrough of the whole app. 17 wiki alters across seven categories: Start Here (Welcome + Gestures cheatsheet), Dashboard, Alter profiles (page tour + edit modes + mini-toolbar reference + fields & tabs + fronting), Tracking (Timeline + Activity Tracker + Quick Check-In + To-Do), Sharing & relay (Bulletin Board + Friends Mode), Notifications (Reminders + push diagnostics), and Personal (Settings & themes + Privacy & backup). Tour preserved as a second option. Wiki banner shows the app version the walkthrough is current with.",
      },
      {
        type: "improve",
        text: "Preview Mode banner now shows which app version the walkthrough text is up to date with — currently v0.6.0. The wiki-style walkthrough preview (built on top of the existing example system) will roll out in follow-up commits, with each preview alter dedicated to one app area: Dashboard, the alter profile edit modes, the mini-toolbar, bulletin board, timeline, activity tracker, reminders, friends mode, and so on. The banner version tag tells users when a wiki section was last refreshed.",
      },
      {
        type: "improve",
        text: "Bio Blocks editor: blocks now actually reorder by dragging the grip handle at the left of the block header. Up/down chevron buttons are still there as a keyboard fallback. Powered by @dnd-kit/sortable.",
      },
      {
        type: "fix",
        text: "The \"Message\" button at the top of an alter's Board view used to do nothing — it set state with no listener. It now jumps to the alter's Messages tab and auto-opens the compose form.",
      },
      {
        type: "improve",
        text: "Lineage tab now also shows the alter's explicit relationships (\"trauma holder for\", \"twin\", \"split from\", etc.) alongside the system-change events, with arrows reflecting direction.",
      },
      {
        type: "improve",
        text: "Alter profile birthday field is just labeled \"Birthday\" now (was \"Birthday / Split date\"). Board tab has a short help line explaining it's the alter's activity feed — every bulletin, comment, journal, check-in, and mention they're part of.",
      },
      {
        type: "fix",
        text: "Bulletin posts, tasks, and comments now stay permanently tied to whoever wrote them — the front at post time, the signposted alters, or System if neither. Previously, when the record had no saved author it fell back to *current* fronters, so a post made by Kane would visually re-author itself to whoever was fronting when you scrolled past it later. The fallback is removed everywhere (BulletinCard, TaskBulletinCard, the standalone BulletinPage, and the comment thread).",
      },
      {
        type: "fix",
        text: "Light mode looking dark when the phone was in dark mode (and vice-versa) was actually Android Chrome's force-dark feature inverting the page, not our theme logic. We now set `color-scheme: only light` / `only dark` explicitly on the root element, which opts out of the OS-level inversion entirely. Light is light, dark is dark, regardless of the phone setting. The Sonner toast component also now uses our ThemeContext (was importing next-themes which wasn't wired up).",
      },
      {
        type: "improve",
        text: "Sidebar drawer header now has the app icon on the left of \"Navigation\" — tapping the logo/title closes the drawer and goes back to the Dashboard, so you don't need to hunt for the Dashboard row.",
      },
      {
        type: "improve",
        text: "Settings page now shows the build version + an \"alpha\" chip in the top right. The version (currently 0.5.1) bumps with every changelog entry so testers can reference the exact build when reporting issues.",
      },
      {
        type: "fix",
        text: "Reminders that only had \"Browser push\" as the delivery channel could go silent when push wasn't actually enabled on the device. Two changes: (1) saving a push-only reminder while push is off now auto-adds the in-app banner channel, and (2) every fired reminder is now also recorded as an in-app delivery, so the toast/inbox always surfaces it even if push silently fails.",
      },
      {
        type: "improve",
        text: "Quick Actions hold-menu (long-press Quick Check-In) now stays open when you scroll through it — previously every pointerdown anywhere on the page closed it, even when that pointerdown was the start of a scroll inside the menu. Outside-tap detection is now a real tap test (pointerdown → pointerup at roughly the same coordinates), so a scroll gesture is ignored. The long-press that opens the menu also cancels if your finger moves more than ~12px during the hold, so an accidental scroll during the press no longer triggers the menu.",
      },
      {
        type: "improve",
        text: "Brought back the System (follow OS) theme mode as a third state in the cycle (Dark → Light → System → Dark). When set to System the app now correctly mirrors `prefers-color-scheme` and updates live if the OS flips. The earlier light/dark mismatch bug was about how the saved mode was being read — that path is rewritten so 'system' really tracks the OS now, while 'light' and 'dark' still ignore the OS entirely.",
      },
      {
        type: "fix",
        text: "Front session sweep now runs proactively on app load, not just when the Set Fronters modal opens. Users who never open that modal would otherwise sit with stuck state forever — duplicates per alter, multiple is_primary rows, or ghost-active sessions (is_active flipped to false but end_time left null). The same three reconciliations the modal already does (per-alter dedupe, multi-primary demotion, ghost-active end_time fill) now run once per page load with a 1.5s delay.",
      },
      {
        type: "improve",
        text: "Reminders settings now has a \"Test push notification\" button. It runs through the full push pipeline — service worker support, PushManager support, VAPID key present, browser permission granted, service worker registration, active subscription, and a real call to /api/push/send — and surfaces the specific failing check inline. If everything passes it sends an actual test notification. Saves the \"I enabled push but never get notifications\" guessing game.",
      },
      {
        type: "fix",
        text: "Bulletin posts, bulletin comments, and quick tasks were sometimes attributed to \"System\" with no avatar even though someone was clearly fronting — this happened when the parent query was still hydrating (e.g. a post made right after page load) and the in-memory `frontingAlterIds` was momentarily empty. All three paths now do a defensive live-fetch of active fronting sessions before falling back to System, so authorship reflects who's actually fronting.",
      },
      {
        type: "fix",
        text: "Dashboard's \"primary fronter\" detection now picks the session marked `is_primary`, not just the first row sorted by start-time. With co-fronters joining/leaving, the most-recent row was sometimes a co-fronter rather than the actual primary, which leaked through into downstream consumers.",
      },
      {
        type: "fix",
        text: "Editing a fronting session via the Timeline popover used to silently fail — there was no error toast on save, so if the backend rejected the update the modal stayed open with no feedback. Errors now surface as a toast, and a successful save shows \"Session ended\" / \"Session saved\". Added an \"End session now\" one-tap button on the popover itself so sessions stuck without an end time can be closed without going into the full Edit flow.",
      },
      {
        type: "fix",
        text: "Sweep \"ghost active\" fronting sessions on Set Fronters open and on clear-via-Unsure. These were rows where `is_active` had been flipped to false but `end_time` was still null — they appeared as Active in the Timeline popover but couldn't be ended via the Set Fronters modal because the modal's query only sees `is_active: true`. The sweep sets `end_time = now` for any such orphan so they stop displaying as Active, and the Timeline popover now also shows \"— (no end time)\" instead of \"Active\" for rows that are no longer is_active.",
      },
      {
        type: "fix",
        text: "Set Fronters modal no longer shows the previously-fronting alter as still selected after the front has been cleared. The modal's open-time refresh refetches active sessions, but if there were none, it used to leave whatever was already in state — so the last primary kept appearing as selected. Now it explicitly clears the in-modal primary / co-fronter selection when no active sessions exist.",
      },
      {
        type: "improve",
        text: "Smaller gap between the header and the page content (mobile header shrunk back to h-14, Dashboard top padding removed). The Tour button on the Dashboard no longer trails a sparkle emoji.",
      },
      {
        type: "fix",
        text: "Made the Dashboard's \"notification history\" button visually distinct from the global Reminders bell — it now uses an Inbox icon instead of a bell, so the two buttons at the top of the screen are easier to tell apart.",
      },
      {
        type: "fix",
        text: "Notification History modal: \"Clear all\" no longer overlaps the dialog's own close (X) button — the header reserves padding on the right so the two controls don't collide.",
      },
      {
        type: "improve",
        text: "Header wave block tuned: the wash is now visible enough to clearly read as a sky / water boundary instead of a near-invisible tint (fill opacity ~2× higher, edge stroke noticeably darker). Wave extends a bit lower in the header so its trough sits just under the centre of the title rather than slicing through it. Restored a thin bottom border on the header to match the divider style used on the bottom tab bar.",
      },
      {
        type: "improve",
        text: "Header redesign, take two. The top bar now has a faint primary-tinted wash on its top half with a wavy bottom edge that scrolls very slowly sideways — calm-waves motion, behind the title and icons so the wave line passes through the middle of them. The \"Oceans Symphony\" title is centered. New default heading font: DM Serif Display (similar high-contrast serif to Playfair, but distinct so the app doesn't look like every other Base44 template). Playfair is still selectable in Appearance → Heading Font for users who prefer it. The animation respects `prefers-reduced-motion` and pauses for users who've asked for less motion.",
      },
      {
        type: "improve",
        text: "Sweep through the codebase to honour user-configured terminology. Reminders (warnings, scope labels, instance cards), the activity log/plan modal (\"Who was fronting?\"), session popovers (\"Primary fronter\", \"Triggered switch\"), the alter card title tooltip and demote toast, the Set Fronters modal, the data backup category list, the report builder/preview section labels, the noteworthy thresholds page, the Privacy page (Simply Plural + Friends sections), the dashboard fronters panel, and the sidebar's history link — all now respect your custom words for system, alter, fronting, fronter, switch, etc.",
      },
      {
        type: "feature",
        text: "To-Do List ↔ Activity Tracker integration. (1) To-do categories now use your real activity categories instead of a hardcoded Work/Health/Personal list — same picker, same colours, same analytics. (2) Tasks can be marked **urgent** or **pinned to dashboard**; both surface in the Pinned strip at the top of the Dashboard and Home page, with urgent ones styled like critical plans. (3) Tasks have a new **Scheduled** datetime field, separate from the Due date — Due is a deadline (\"must be done by\"), Scheduled is a deliberate plan (\"I'll do this at\"). (4) Tasks with a Scheduled time or a Due date appear directly on the Activity Tracker week/month/year grid as pills (amber for urgent, indigo otherwise) — tapping one opens the to-do. (5) The To-Do nav button (sidebar + dashboard quick-nav) shows an amber count badge for tasks that are urgent OR have a due date / scheduled time within the next 72 hours. (6) Priority is now a chip group instead of a native dropdown so the selected state is readable on every theme.",
      },
      {
        type: "improve",
        text: "Moved the alter count display (\"46 active alters · 71 archived\") from the top of the Home page into Settings → Profile. It's hidden by default behind a \"View alter count\" button — tap to reveal, tap \"hide\" to put it away again. Each visit starts hidden.",
      },
      {
        type: "feature",
        text: "Plan Activity now integrates with the To-Do list. (1) Double-tapping a time range that's in the future on the Activity Tracker week view now opens the Plan modal directly, so you get the planning fields (title, location, critical, to-do link) instead of the leaner log-a-past-activity form. (2) The Plan modal has a new \"Link to a to-do\" picker — pick any open to-do to schedule it for that time; the task's due date syncs automatically. (3) All three plan options — title, activity category, linked to-do — are now independently optional: pick any one (or combine them). (4) The Notes field is relabeled \"Description / notes\" in plan mode and has a richer placeholder, since plans often need more context than past-activity logs.",
      },
      {
        type: "improve",
        text: "Privacy & Data Notice now explicitly calls out Friends mode: by default nothing leaves this device, and Friends mode is the only feature that transmits anything off-device — it's opt-in, off until you set it up, and only ever sends your system name, display name, and your current front status at the privacy level you choose (full / count only / hidden, with per-friend overrides). Updated wherever the notice appears: Settings, first-run setup, intro tour, and feature tour.",
      },
      {
        type: "fix",
        text: "Pinned tasks on the Dashboard / Home Pinned strip now render as proper task cards (with checkbox, title, etc.) instead of raw bulletins showing the literal `[task:UUID]` prefix in the content. The Pinned strip was discriminating on `bulletin_type` but tasks are identified by a content prefix.",
      },
      {
        type: "improve",
        text: "Privacy & Data Notice clarified everywhere it appears (Settings, first-run setup, intro tour, feature tour). Now spells out that local mode is private by design — every record stays on this device only, with nothing uploaded, synced, or sent to any server — and that password encryption is an additional layer of security on top, not the only thing keeping data private.",
      },
      {
        type: "fix",
        text: "Fix crash when picking an activity time range. Double-tapping to start adding an activity and then tapping an end cell was kicking the time-range modal into an infinite re-render loop, which then crashed the app. The modal now updates state via useEffect instead of mid-render, so the time pickers settle on the values you picked and the modal opens normally.",
      },
      {
        type: "fix",
        text: "Critical / urgent planned activities now surface on the Home page too, not just the Dashboard. Matches the new behaviour of the Pinned bulletin strip — both pinned posts and urgent plans appear at the top of both surfaces when their lead-step window opens.",
      },
      {
        type: "fix",
        text: "Bulletin \"Pin to top of dashboard\" now actually appears at the top of the dashboard. The Pinned section was only mounted on the Home page, so pinning from the action menu set the flag but the post never surfaced anywhere visible. The Pinned strip now renders on both the Dashboard (just above Current Symptoms) and the Home page.",
      },
      {
        type: "fix",
        text: "Activity Tracker week view: a single tap on a cell no longer opens the details sheet — you need to double-tap, like before. Single tap was firing the sheet by accident while scrolling or picking a time slot for a new entry.",
      },
      {
        type: "improve",
        text: "Triple-tap privacy gesture is now tighter — three taps within 500ms (was 700ms) to open the grocery-list cover, so it doesn't fire accidentally during normal interaction.",
      },
      {
        type: "improve",
        text: "Bulletin board: tapping the \"You were mentioned\" banner now jumps to (and highlights) the bulletin where you were mentioned, the same way clicking on a notification does. The X still just dismisses without navigating.",
      },
      {
        type: "feature",
        text: "Grocery list with privacy-cover mode. Tap the 🛒 icon in the dashboard header (or set up Grocery list / Add to grocery list as quick actions) to open a full-screen grocery list that covers the entire app, including the bottom tab bar — so a glance at the screen reveals nothing about the system. **Triple-tap anywhere** to open the cover instantly when you need to hide the screen fast. Items persist across sessions; tap to check off, swipe-friendly trash icons to remove, one-tap clear of checked items.",
      },
      {
        type: "improve",
        text: "Bulletin board: the Comments button now shows a count badge of how many comments a post has, so you can see active threads at a glance without expanding each one.",
      },
      {
        type: "improve",
        text: "Activity Tracker week view: tapping an activity cell now opens the details sheet directly, instead of expanding the cell in place. Long notes (like dream journals on a Sleep entry) used to push the rest of the day's column off-screen.",
      },
      {
        type: "feature",
        text: "Preview Mode rewritten as a tour of the alter profile editor's capabilities, with the rest of the app fully populated. Six demo alters — Welcome, Atlas, Mira, Echo, Iris, Halo — each show off a different bio mode (Plain / Simple / Blocks / Raw HTML) plus the Custom Fields tab and the Mini Toolbar. Every alter ships its own theme preset so the whole app's look swaps as you change primary fronter. Groups are organised hierarchically (Index → By Role / By Gender / By Age → leaf groups). Every entity table is filled — bulletins, threaded comments, polls, tasks, sleep, locations, inner world rooms, alter messages, alter notes, diary cards, support journals, mention logs.",
      },
      {
        type: "fix",
        text: "Bulletin reactions: tapping a reaction's count now opens a popover listing who reacted (with avatars + names), instead of removing the current alter's reaction. The popover has a small \"Add yours / Remove yours\" button if you do want to toggle.",
      },
      {
        type: "fix",
        text: "Friends \"Notify on change\" now fires for every fronting change, not just saves through the Set Fronters modal. Quick-action gestures (long-press, swipe, hold-menu) used to mutate the local front without pushing the new state to the Friends server, so opted-in friends were never notified. Front-status now syncs from a shared listener that runs on any path.",
      },
      {
        type: "hotfix",
        text: "Hotfix: Try Preview button silently failing — the preview tapestry referenced two alters (Thorne, Scout) that were removed in the recent profile-diversity pass, so build() threw and Preview Mode never started.",
      },
      {
        type: "fix",
        text: "Retroactive Quick Check-In: the activity AND the diary card are now stamped at the back-dated time you set, instead of being filed under today. Emotions, symptoms, and the journal note already used the back-dated time correctly; this catches the last two records that were leaking the wall clock.",
      },
      {
        type: "improve",
        text: "Bulletin posts now render basic HTML formatting (bold, italic, underline, lists, links, line breaks) and resolve term placeholders like {alter} / {alters}. Previously the raw tags showed up as text in the post body.",
      },
      {
        type: "fix",
        text: "Dashboard status-note buttons (Emotions / Symptoms / Triggered) are now icon-only with tooltips, so they no longer wrap labels mid-word on narrow screens.",
      },
      {
        type: "improve",
        text: "Preview Mode (Sample Tapestry) now ships with the full preset symptom catalogue — mood, energy, anxiety, depression, switches, habits — so the Quick Check-In sheet looks the way it does for a real user with defaults seeded. Also refreshed the alter line-up: trimmed redundant one-liner profiles and added four new richly-styled templates (recipe card, typewritten letter, daily planner, museum exhibit label).",
      },
      {
        type: "feature",
        text: "Long-pressing the Oceans Symphony icon on your home screen now shows quick-action shortcuts: Quick Check-In, Set Fronters, Journals, and Tasks. Tapping a shortcut launches straight into that flow. (Android home-screen icon menu — works on installed PWAs.)",
      },
      {
        type: "improve",
        text: "Set Fronters modal now shows a hint about swipe gestures (swipe right to toggle, swipe left to set primary) so the gesture controls are discoverable.",
      },
      {
        type: "fix",
        text: "Setting an alter as primary fronter (long-press on the Alters page, dashboard hold-menu, or the Set Fronters modal) now reliably promotes the right alter. Previously, stale duplicate active sessions or a mid-flight cache could result in the wrong alter showing as primary, or a 'ghost' alter appearing in the front. Every primary-toggle path now refetches fresh sessions, demotes every existing primary (not just the first), and the dashboard chip uses the actual is_primary flag instead of array position.",
      },
      {
        type: "feature",
        text: "Activity Tracker now has Month and Year views in addition to the existing Week view. Month view is a calendar grid (one cell per day) with a heatmap tint and dots for each activity; Year view is a 3x4 grid of mini-month calendars. Tap a day to drill into the day view, or a month header in Year view to jump into Month view.",
      },
      {
        type: "feature",
        text: "Activity Tracker has a new + Plan Activity button beside the Logged/Planned tabs. It opens a planning modal with date/time pickers so you can schedule any future activity without scrolling to its slot.",
      },
      {
        type: "improve",
        text: "Activity Tracker Display sliders (Row height, Col width) now move in 1px increments instead of 5px steps and have − / + nudge buttons on either side for precise tuning.",
      },
      {
        type: "improve",
        text: "Set Weekly Goal modal now uses the same nested category pills as the quick check-in's activity selector instead of a plain dropdown.",
      },
      {
        type: "improve",
        text: "Activity Tracker now defaults its column width to fit all 7 days within the screen, so you don't have to scroll horizontally on first open. You can still drag the Col width slider in Display settings to make columns wider.",
      },
      {
        type: "fix",
        text: "Custom Colors swatches in Appearance settings now update immediately when you switch built-in presets — they were previously stuck showing the colors of the previously selected preset.",
      },
      {
        type: "improve",
        text: "Appearance settings layout: Font Family and Heading Font are now side-by-side, the Theme Mode (light/dark/system) toggle moved below them, the Heading Font dropdown matches the Font Family one (searchable, categorised), and the heading-font list now includes every font available for the body text.",
      },
      {
        type: "improve",
        text: "Backup & Export simplified — Copy to Clipboard, View as Text, and paste-based imports are gone now that file download/import works reliably. The \"backup is large\" warning banner has also been removed; the Recompress Images button is still available if you want to shrink backup size.",
      },
      {
        type: "fix",
        text: "Modals (like Set Fronters) now stay centered above the on-screen keyboard. Previously the keyboard would cover the search field and results — now the dialog automatically lifts above it.",
      },
      {
        type: "improve",
        text: "Terminology preview (in Settings and onboarding) now shows one line per term with all of its forms together (e.g. \"front · fronts · fronting · fronter\") instead of splitting into separate Singular/Plural/Other rows.",
      },
      {
        type: "fix",
        text: "Custom fields on alter pages now preserve line breaks when displayed. Multi-line entries like bulleted lists no longer collapse into a single paragraph after saving.",
      },
    ],
  },
  {
    date: "May 8, 2026",
    changes: [
      {
        type: "improve",
        text: "Friends page now shows a privacy disclaimer explaining exactly what does and doesn't leave your device — full disclaimer on the no-profile setup screen, collapsible \"What gets shared with the cloud relay?\" panel once you have a profile.",
      },
      {
        type: "feature",
        text: "Edit Friends Profile modal now has a Delete profile button. Tap once to arm, tap again to confirm — your profile is removed from the relay, you're removed from every friend's list, and your local identity is wiped, returning the Friends page to the Set Up Profile state.",
      },
      {
        type: "fix",
        text: "Timeline horizontal scroll works again — when pinch-to-zoom was added it inadvertently locked the timeline to vertical-only scrolling. Both directions scroll now, and pinch-to-zoom still works.",
      },
      {
        type: "feature",
        text: "Edit Session modal now has a Delete session button at the bottom (tap once to arm, tap again to confirm). Removes the session entirely instead of leaving it on the timeline.",
      },
      {
        type: "improve",
        text: "Timeline default zoom is less zoomed-in — most of a day now fits on a single phone screen without scrolling. Pinch-to-zoom still works, and your saved zoom level is preserved if you've already set one.",
      },
      {
        type: "fix",
        text: "Timeline: alter and symptom bars no longer extend the entire day when a session was marked closed but had a missing end time. The renderer now treats those records as zero-length, and a one-shot startup repair backfills the missing end time on existing data so the timeline reads correctly going forward.",
      },
      {
        type: "improve",
        text: "Preview Mode is now a single, more fleshed-out example: The Tapestry. The two earlier examples (The Hearth, Inner Compass) have been retired. Atlas (the host) gets the constellation profile that was previously Self's, and the example now ships with more journals, activities, status notes, and check-ins — across more voices in the system.",
      },
      {
        type: "feature",
        text: "Activity Tracker now has a Planned tab. Schedule activities for the future (today / this week / this month / this year / all upcoming) — pick a future date in the compose modal and the activity is filed under Planned. Filter chips switch between horizons; an empty state appears when nothing's planned for the selected window.",
      },
      {
        type: "feature",
        text: "Upcoming plans can surface in lots of places — and you choose which. Settings → Appearance → Upcoming plans visibility is a multi-toggle: top of Home, bottom of Home, Currently-fronting alter panel (the inline panel that opens when you tap a fronting chip — defaults to ON, low-clutter and contextual), top of Bulletin Board, soft in-app banner near reminder window. The Activity Tracker's Planned tab is always on. Designed to help with dissociative amnesia: redundant surfaces so an alter with no recall still finds the plan when they touch a familiar part of the app.",
      },
      {
        type: "feature",
        text: "Long-press any bulletin or task on the Bulletin Board to open an action menu — Pin to top of dashboard (surfaces it on the Home page above the alters grid), Pin on board (the original board-pin), and Delete. The dashboard pin is independent of the board pin, so the same item can sit at the top of both surfaces.",
      },
      {
        type: "feature",
        text: "System History events can now be hidden — useful when an import (e.g. Simply Plural with merges) creates a flood of fusion / split events that clutter the timeline. Tap the eye-off icon on any event to hide it; a \"Show N hidden\" chip appears at the right of the filter row to bring them back. Hidden events also drop out of the Lineage tab on alter profiles.",
      },
      {
        type: "fix",
        text: "Pinned bulletin tasks now show a filled pin icon, matching pinned bulletin posts.",
      },
      {
        type: "fix",
        text: "The Home page heading was hardcoded to \"Your System\" — it now respects your custom term, so it reads \"Your inner family\", \"Your collective\", \"Your committee\", etc. when you've customised it.",
      },
      {
        type: "fix",
        text: "Dashboard nav grid no longer blocks page scrolling when you swipe over the tiles outside of edit mode. The Edit button next to the search bar is also a clean pencil icon now — no border, no label.",
      },
      {
        type: "improve",
        text: "In the alters grid view, swiping left on an alter who isn't fronting now starts a fronting session and sets them as primary in one go. Previously, swipe-left only worked if they were already fronting.",
      },
      {
        type: "improve",
        text: "Preview Mode now ships three new example systems: The Hearth (a small DID system with five alters), The Tapestry (a large polyfragmented DID system with 24 alters across hosts, protectors, caretakers, littles, teens, introjects, gatekeeper, persecutors, fragments, and dormants), and Inner Compass (a singlet using IFS — one Self surrounded by Manager, Firefighter, and Exile parts). Each preview also brings its own theme, font, and terminology so you can feel the app in three very different shapes. Several alters in each preview carry their own theme preset that takes over the entire app — colors, font, AND vocabulary — when they're the primary fronter. Swipe an alter's avatar to set them primary and watch the look-and-feel switch. Selected preview alters also have hand-styled profile pages — kid-coded with stickers, stark and edgy, ornate with quotes, monospace and clinical — to show what the profile editor's HTML bio + per-alter background colours can do.",
      },
      {
        type: "improve",
        text: "Pinch-to-zoom on the timeline: pinch with two fingers anywhere in a day's timeline to expand or compress the row height. Replaces the Zoom button + slider, which has been removed.",
      },
      {
        type: "fix",
        text: "Long-press popups on the timeline (the retroactive entry picker and the session-split menu) no longer fire when you're scrolling. They now cancel as soon as your finger moves more than a few pixels, so they only appear on a real press-and-hold in one spot.",
      },
      {
        type: "improve",
        text: "New gesture controls in the alters grid view: tap an avatar to open their profile, swipe right to add or remove them from front, and swipe left to promote or demote primary fronter (only when they're already fronting). The grid-view toggle and anonymize-mode toggle have moved out of the top toolbar and into the right side of the Alters section header — closer to where you'd actually use them.",
      },
      {
        type: "fix",
        text: "Reverted a recent timeline change that broke vertical scrolling, drag-to-resize row height, and the horizontal hour gridlines. The timeline is back to its previous, working layout.",
      },
      {
        type: "feature",
        text: "Added Preview Mode under Settings → Preview Mode. Pick one of three example systems (with their own terminology) and the entire app temporarily fills with curated demo data so you can explore how features feel when populated. Your real data is hidden but never touched — anything you change while previewing disappears the moment you exit. A persistent banner at the top of the screen makes it impossible to confuse demo and real data, and the tour now ends with a pointer to it for anyone feeling lost.",
      },
      {
        type: "improve",
        text: "Removed the unused PluralKit sync integration. PluralKit's API security model isn't a great fit for sensitive alter data, and the feature wasn't reachable from the app anyway. Simply Plural import (read-only) remains available.",
      },
      {
        type: "improve",
        text: "Privacy & Data Notice now clearly explains that data is stored unencrypted by default, and that enabling password encryption provides on-device encryption at rest (not end-to-end).",
      },
      {
        type: "improve",
        text: "Onboarding tour now mentions that the app is in active development and bugs may be encountered, and the Privacy & Data slide reflects the updated encryption explanation.",
      },
      {
        type: "fix",
        text: "Terminology settings previews now use the same pluralization, gerund, and agent-noun rules as the rest of the app — e.g. headmates, influencing, fronters — instead of naive string concatenation.",
      },
      {
        type: "feature",
        text: "Heading font is now customisable in Accessibility settings. Choose from 10 options — serif, sans-serif, handwriting, and display styles — to change the font used for page titles and the app name.",
      },
      {
        type: "fix",
        text: "Custom color swatches in Appearance now always reflect the colours actually rendered on screen (read from live CSS variables) instead of potentially stale preset data.",
      },
      {
        type: "improve",
        text: "The Privacy & Data Notice in Settings is now its own collapsible section at the top of the page, making it easy to find and dismiss.",
      },
      {
        type: "improve",
        text: "Backup downloads are now plain .json files instead of compressed binary — easier to inspect, store, and share.",
      },
      {
        type: "improve",
        text: "Timeline zoom is now controlled by a two-finger pinch gesture instead of a slider button — pinch in or out on the timeline to adjust row height.",
      },
      {
        type: "improve",
        text: "Alters list/grid view toggle and column count selector are now separate controls positioned just above the alters list, making them easier to find and use.",
      },
      {
        type: "improve",
        text: "Alters page: the currently fronting display now uses the same chip-grid style as the dashboard (with session notes, emotion/symptom panel, and hold-menu). Alters grid: swipe right to toggle front, swipe left to toggle primary, tap to open profile.",
      },
      {
        type: "improve",
        text: "The dashboard edit button is now a minimal icon with no border. Quick Actions settings moved to the top of the Tracking & Analytics section.",
      },
      {
        type: "fix",
        text: "The swipe-back arrow indicator no longer gets stuck on screen after a cancelled touch gesture (e.g. when iOS interrupts a swipe). Pinned bulletins now show a single solid pin icon instead of two pins.",
      },
    ],
  },
  {
    date: "May 7, 2026",
    changes: [
      {
        type: "fix",
        text: "Notification bell badge now only lights up when there are unread notifications for currently-fronting alters — it no longer stays lit after all notifications have been seen. Notification History also has a \"Clear all\" button to delete the full history.",
      },
      {
        type: "improve",
        text: "Friends front-change banners now appear live during your session (every 60 s) rather than only on the next app open. No push subscription required — changes show as an in-app toast whenever a friend's front updates.",
      },
      {
        type: "fix",
        text: "Custom front terms that need consonant doubling (e.g. \"control\" → \"controlling\", \"controller\") now produce correct English spelling. Previously all terms just appended -ing/-er without doubling.",
      },
      {
        type: "fix",
        text: "System History page now uses your custom system term throughout — page title, \"system birth\" marker, birth date label, and empty-state description all reflect your configured terminology.",
      },
      {
        type: "fix",
        text: "Record System Event modal now uses your configured alter term in event type descriptions (e.g. \"Two or more [alters] merge...\") and the dialog title uses your system term.",
      },
      {
        type: "improve",
        text: "Dashboard grid now supports drag-and-drop rearranging. Tap the pencil icon to enter edit mode, drag tiles to reorder, tap × to remove a tile, then tap Done to save. The layout and remove buttons are preserved across sessions.",
      },
      {
        type: "feature",
        text: "Per-friend alter visibility: expand any friend card and tap \"Visibility\" to control exactly which alters they can see, or override the privacy level (names / count only / hidden) for that friend specifically. Alters already hidden from all friends are shown as non-toggleable.",
      },
      {
        type: "fix",
        text: "Friends list now auto-refreshes every 30 seconds without needing to manually tap the refresh button. It also loads fresh data immediately whenever you open the Friends page.",
      },
      {
        type: "fix",
        text: "Co-fronter terminology was incorrectly derived from the alter term (showing \"co-alter\") instead of the fronter term. It now correctly shows \"co-fronter\" by default and respects custom front terms.",
      },
      {
        type: "fix",
        text: "Quick Action symptom logs are now tied to currently-fronting alters (matching what happens when you log via Quick Check-In), and the guide's \"notes from other parts\" now uses your configured alter term.",
      },
      {
        type: "improve",
        text: "Tapping a currently-fronting alter on the dashboard now opens their full profile page, consistent with tapping them in the alter directory.",
      },
      {
        type: "improve",
        text: "Group breadcrumb: each ancestor segment is now a tappable link that jumps back to that level — no more tapping Back repeatedly. The path also shows all levels instead of collapsing early, and the Members button is now icon-only to give the breadcrumb more room.",
      },
      {
        type: "fix",
        text: "Reminders scheduler: widened the firing window from 60 s to 90 s so reminders are never silently dropped when the scheduler runs slightly late. Also, push-only reminders now fall back to an in-app banner if browser push isn't subscribed yet, rather than disappearing silently.",
      },
      {
        type: "improve",
        text: "Quick Nav grid toggle on the home screen now cycles through list and 2–5 column grid layouts on each tap, matching the alter directory toggle.",
      },
      {
        type: "improve",
        text: "Daily task review: tapping a completed task now shows the time it was logged (e.g. \"Completed at 2:35 PM\") instead of the date, which was redundant since the date is already on the column header.",
      },
      {
        type: "fix",
        text: "Friends: \"Notify on change\" push notifications now work correctly. Fixed a bug where the notification preference wasn't visible to the friend's account when they updated their front. Also re-syncs your push subscription to the server automatically when you open the Friends page.",
      },
      {
        type: "feature",
        text: "Alter directory: view toggle now cycles through list → 2 → 3 → 4 → 5 columns → list on each tap, replacing the separate column-count button.",
      },
      {
        type: "feature",
        text: "Alter directory: new screenshot/anonymize toggle (camera icon) cycles through off → blur names → blur names & avatars. Useful for taking screenshots without revealing identities.",
      },
      {
        type: "improve",
        text: "Settings reorganized: \"System\" section renamed to \"Profile\"; Analytics grouping moved into \"Tracking & Analytics\" (was a separate section); Archived Alters list now scrollable when long.",
      },
      {
        type: "fix",
        text: "Archived Alters header now uses your custom terminology instead of the hardcoded word \"Members\".",
      },
      {
        type: "fix",
        text: "Reminder delivery channels are now respected: reminders set to \"Browser push\" only no longer incorrectly show an in-app banner. The push channel only fires when the reminder has it selected.",
      },
      {
        type: "feature",
        text: "Alter directory now has a \"hide grouped\" toggle (folder-minus icon in the toolbar). When active, alters that already appear in a group are hidden from the flat list below, keeping the directory uncluttered.",
      },
      {
        type: "fix",
        text: "Friends: front status now syncs to the server when you open the Friends page, so friends who were already fronting before setting up Friends will show correctly — not stuck on \"No one fronting\".",
      },
      {
        type: "feature",
        text: "Theme presets now save and restore your terminology. When you save a custom preset, your current system/alter/switch/front terms are captured with it. Applying the preset restores all four terms automatically — including when a preset is applied via a fronter-linked theme.",
      },
      {
        type: "feature",
        text: "Friends & Front Sharing — exchange friend codes with trusted people to share who's fronting in real time. Friends see your front status using your own terminology. Control privacy per-alter (hide individual alters from friends) and system-wide (names, count only, or fully hidden). Opt in to push notifications when a friend's front changes. Accessible from the new Friends page in navigation, sidebar, and dashboard grid.",
      },
      {
        type: "fix",
        text: "Alter options tab — 'Delete member' and the archived description now use your chosen terminology.",
      },
    ],
  },
  {
    date: "May 8, 2026",
    changes: [
      {
        type: "fix",
        text: "Polls page — 'Select an alter' labels and toast messages now use your chosen terminology.",
      },
      {
        type: "fix",
        text: "New Task modal and mention textarea — 'use @ to mention an alter' placeholder now uses your chosen terminology.",
      },
      {
        type: "fix",
        text: "Terminology audit — 23 hardcoded 'alter', 'system', 'front', 'fronting', 'fronter', and 'switch' strings replaced with user-chosen terms across 20 components: Switch Journal modal, Journal editor, Emotion check-in, Set Front modal, Archived alters settings, System map, Timeline session popups, Activity details, Relationship modal, Bulletin comments, Quick Actions config, Group member modals, and more.",
      },
      {
        type: "feature",
        text: "Native push notifications — reminders now deliver as real Android/iOS notifications via Web Push, appearing in your notification tray even when the app is in the background. Enable in Settings → Reminders. Requires VAPID keys set up in your Vercel project (see README).",
      },
      {
        type: "improve",
        text: "Check-In Log day total now aggregates all of the day's data — status notes, diary card values (joy, emotional misery, physical misery, skills, urges, meds), and all standalone entries. Wellness scores are averaged across multiple diary cards; urge values show the peak. The entry count in the total header reflects every tracked item for the day, not just formal check-ins.",
      },
      {
        type: "fix",
        text: "Reminder editor — 'Set who's fronting' and 'View system map' action labels now use your chosen terminology. Auto-resolve 'front updated' option also uses your term. Preset 'Checking in on the system' reminder is now created with your term for front in the button label.",
      },
      {
        type: "improve",
        text: "Alters grid view now has a 3/4 column toggle — tap the number button in the toolbar while in grid mode to switch between 3 and 4 columns. Your preference is saved.",
      },
      {
        type: "improve",
        text: "Onboarding guide flow — after completing setup (first run or after Delete All Data), the Guide now automatically opens so new users get an overview of Symphony. At the end of the guide, a tip points to the Tour ✨ button for a hands-on interactive walkthrough.",
      },
      {
        type: "fix",
        text: "Delete All Local Data now navigates to the home screen after onboarding completes, so the guide auto-opens correctly on the dashboard instead of leaving the user on the Settings page.",
      },
      {
        type: "hotfix",
        text: "Hotfix: removed inaccurate 'Settings → Feature Tour' note from terminology setup screen.",
      },
      {
        type: "fix",
        text: "Reminder toast 'Update front' button now reliably opens the Set Front modal. The previous approach created a fresh modal component on each tap which could fail to open; it now uses the same stable always-rendered pattern as the Reminders inbox.",
      },
      {
        type: "fix",
        text: "Therapy report templates — the old 'save as template' checkbox was tied to generating a report and didn't work on its own. Templates section is now always visible at the top of the report builder with a name field and a standalone Save button. Tap Save to save at any time without generating a report.",
      },
      {
        type: "fix",
        text: "Term pluralization — words ending in 'ch' or 'sh' now correctly pluralize with 'es' (e.g. 'switch' → 'switches', not 'switchs').",
      },
      {
        type: "improve",
        text: "Daily task review grid now shows the day of week (Mon, Tue, etc.) above each date column so you can see exactly which day a task was completed. Tap any completed ✓ cell to see the full completion date in a banner. Hold a cell for 2 seconds (with a fill animation) to toggle it complete/incomplete — prevents accidental record changes.",
      },
      {
        type: "improve",
        text: "Reminder inbox cards now show a default action button based on reminder category — Check In reminders show a 'Check In' button, Grounding reminders show 'Open Grounding' — even if no inline actions were explicitly configured.",
      },
    ],
  },
  {
    date: "May 7, 2026",
    changes: [
      {
        type: "fix",
        text: "Therapy report PDF save on Android — on devices where the Web Share API supports file sharing (Android Chrome, modern iOS), the Save button now opens the native share sheet instead of using a blob URL anchor click. Blob URL downloads are unreliable in standalone PWA mode and caused about:blank navigation; the share sheet lets you save to Files, Google Drive, send to apps, etc.",
      },
      {
        type: "fix",
        text: "Therapy report text export — journal entries, bulletin posts, and alter bios were showing raw HTML and CSS markup instead of readable text. All rich-text fields are now stripped to plain text before being included in the report.",
      },
      {
        type: "feature",
        text: "Therapy report item exclusions — within the Symptoms & Habits, Activities, and Member Profiles sections, expand \"manage exclusions\" to uncheck any individual symptom, habit, activity, or member. Excluded items are left out of that report without affecting anything else in the app. Exclusions are saved when you save a template.",
      },
      {
        type: "feature",
        text: "Therapy report overhaul — every section is now individually toggleable with per-section detail levels. New sections: Locations (GPS/manual), Sleep Log (duration, quality, nightmares), and Skills & Exercises (completed grounding exercises with optional written responses). Fronting history can now include a full session-by-session log. Emotion check-ins can show all entries. Diary cards can show all or noteworthy-only. Bulletins can show titles or full content. Member profiles appendix now shows full bios when requested (previously truncated to 200 characters).",
      },
      {
        type: "fix",
        text: "Therapy report PDF download now works — the PDF was being invalidated before the browser could save it. Download reliably completes on both mobile and desktop.",
      },
      {
        type: "fix",
        text: "Therapy report content cutoff — journal entries, alter bios, and the alter appendix were being clipped at the bottom of page 1. All sections now correctly continue across multiple pages.",
      },
      {
        type: "fix",
        text: "Backup & restore now includes appearance settings — theme, light/dark mode, custom colors, user-saved presets, alter-to-theme links, font family, text size, and other accessibility settings are all preserved in the backup file.",
      },
      {
        type: "feature",
        text: "Therapy report templates are now usable — saved templates appear at the top of the report builder with a Load button that restores all your sections, detail levels, and cover page settings. Templates can also be deleted from there.",
      },
      {
        type: "improve",
        text: "UI size range extended — Text & UI Size now goes from 50% (Tiny) to 150% (XXXL), adding six new size steps below and above the previous 87.5%–125% range.",
      },
      {
        type: "fix",
        text: "Bottom nav labels now center-align when they wrap to two lines (e.g. 'System Meeting' at larger text sizes).",
      },
      {
        type: "fix",
        text: "Guide and Tour buttons on the home screen no longer wrap awkwardly — they now stack vertically when the header is narrow.",
      },
      {
        type: "improve",
        text: "Removed the 'Offline Ready' status badge from the header — PWA offline support still works, it just no longer announces itself.",
      },
      {
        type: "hotfix",
        text: "Hotfix: removed legacy fronting data migration dialog — no longer needed, was showing a stuck 'Migrating data...' spinner for users without legacy data.",
      },
      {
        type: "fix",
        text: "Custom color editor — swatches now seed from the app's currently displayed colors instead of showing gray when no custom colors have been saved. Opening the editor always reflects your active theme.",
      },
      {
        type: "fix",
        text: "Custom color editor — editing colors while in dark mode now correctly updates the dark palette instead of being silently overwritten by the auto-generated dark theme.",
      },
      {
        type: "fix",
        text: "Custom color editor — Text and Text 2nd swatches were missing, making it impossible to change text colors. Both are now shown and editable.",
      },
      {
        type: "fix",
        text: "Tasks page crashed on load due to a variable used before declaration. Navigating to Tasks (including via the feature tour) no longer crashes the app.",
      },
      {
        type: "fix",
        text: "Alter-linked themes now switch correctly when primary fronter is changed via the long-press menu on the dashboard, not only through the Set Front modal.",
      },
      {
        type: "hotfix",
        text: "Hotfix: startup crash caused by missing useTheme() call in AppLayout after previous edit.",
      },
      {
        type: "fix",
        text: "Analytics section grid — descriptions for System Members, Co-fronting, and Patterns & Insights were using hardcoded words instead of your chosen terminology.",
      },
      {
        type: "feature",
        text: "Appearance overhaul — font family moved into Appearance settings with a searchable dropdown of 27+ fonts across 7 categories. Save named theme presets that capture your colors, font, text size, and light/dark mode. Link a preset to any alter so their theme auto-applies the moment they become primary fronter.",
      },
      {
        type: "feature",
        text: "GPS location auto-naming — when you tap GPS in any location log, Symphony checks if the coordinates match a previously named place (within ~150 m) and pre-fills the name. The most recently used name for that spot is always used, so renaming a place only affects future entries.",
      },
      {
        type: "improve",
        text: "Delete All Local Data now returns to first-run onboarding (privacy notice + encryption setup + terminology chooser) instead of just reloading the app.",
      },
      {
        type: "fix",
        text: "First-run onboarding screen (privacy & data notice, local encryption setup) was being skipped entirely — now correctly displays before the app loads on a fresh install.",
      },
      {
        type: "improve",
        text: "Check-In Log now shows all tracked data, not just formal check-ins. Days with standalone symptom updates, activities, locations, or status notes appear as their own entries in the timeline even when no check-in was done. Days with only standalone data now appear in the log at all.",
      },
      {
        type: "improve",
        text: "Bio editor Plain mode toolbar now matches the advanced Blocks toolbar: H1 heading, Nature gradient, inline code, styled boxes (dark/glass/purple/radial), visual effects (float, glow, spin, wave, faded, rotation), font family picker (Aa), and clear formatting.",
      },
      {
        type: "fix",
        text: "BioEditor Simple Mode — clicking static template text no longer opens an edit dialog. Only the dotted-underline span fields are tappable.",
      },
      {
        type: "feature",
        text: "Migration banner — users coming from the old base44 version are now shown a banner with a link to recover their data.",
      },
      {
        type: "improve",
        text: "Simply Plural import — Alters is now an optional checkbox. You can import polls, groups, or front history without touching your existing alters.",
      },
      {
        type: "fix",
        text: "Daily task review — AUTO tasks (Check-in, Journal entry, etc.) were always showing × in the history grid even when completed. Their IDs are now correctly saved so the grid reflects real history.",
      },
      {
        type: "feature",
        text: "Check-In Log improvements — locations logged during a check-in now appear per-entry and in the day total. Status notes and quick-action symptoms (logged outside the modal) also now appear in day totals.",
      },
      {
        type: "improve",
        text: "Activity terminology — 'Category' labels across Activity Tracker, Goals, Reminders, and the feature tour now correctly say 'Activity' or 'Activity Type'.",
      },
      {
        type: "feature",
        text: "Toggle daily task quick action — add any manual daily task to your quick actions to check it off or see its status without opening the Tasks page. Live state, stays open.",
      },
      {
        type: "fix",
        text: "Quick actions reordering — items that shared the same order value were stuck and couldn't be moved past each other. Now always uses index-based swapping.",
      },
      {
        type: "fix",
        text: "Ghost click — tapping the quick check-in hold button was also triggering the date picker in the modal that opened immediately after. Fixed with pointer event prevention.",
      },
      {
        type: "improve",
        text: "Quick check-in hold time reduced from 1.5 s to 0.5 s.",
      },
      {
        type: "fix",
        text: "Quick action symptom log now creates a SymptomSession (making it active on the dashboard) in addition to a SymptomCheckIn, matching what the modal does.",
      },
      {
        type: "hotfix",
        text: "Hotfixes on QuickActionsMenu: dropdown background was transparent; activity action schema mismatch.",
      },
    ],
  },
  {
    date: "May 6, 2026",
    changes: [
      {
        type: "feature",
        text: "Diary quick actions — individual diary fields (Joy, Skills practiced, Rx meds taken, Suicidal urges, etc.) can now each be added as separate quick actions.",
      },
      {
        type: "feature",
        text: "Add to front quick action — new 'Add to front' type adds an alter alongside existing fronters without clearing them. Visually distinguished from 'Set as front' with a green Add badge vs blue Set badge.",
      },
      {
        type: "improve",
        text: "Quick action symptom rows now exactly match the check-in modal UI — checkbox, label, '— 0 1 2 3 4 5' rating buttons with colour-matched styling, and a circular + log button.",
      },
      {
        type: "feature",
        text: "Simply Plural — custom fronts can now be imported as alters, with their front history resolved on import.",
      },
    ],
  },
  {
    date: "May 5, 2026",
    changes: [
      {
        type: "feature",
        text: "Quick Actions system — hold the Quick Check-In button for 0.5 s to pop up a customisable shortcut menu. Add actions for emotions, symptoms, activities, locations, diary fields, fronting, daily tasks, and more. Configure from Settings → Check-In & Tracking.",
      },
      {
        type: "feature",
        text: "Daily Tasks — task templates now support daily / weekly / monthly / yearly frequencies. Templates manager has drag-to-reorder and per-frequency sections.",
      },
      {
        type: "improve",
        text: "Set Front modal — long-press an alter pill to toggle between primary and co-fronting. Selected alters pinned to top of list.",
      },
      {
        type: "improve",
        text: "Front history sort — Alters page now has four sort modes for front history.",
      },
      {
        type: "hotfix",
        text: "Hotfixes on SetFrontModal: duplicate active sessions, duplicate fronter display.",
      },
    ],
  },
  {
    date: "May 4, 2026",
    changes: [
      {
        type: "feature",
        text: "Feature tour overhaul — 65 guided steps across 18 sections with per-element spotlight highlighting, auto-open modals, skip-section navigation, and demo data.",
      },
      {
        type: "feature",
        text: "To-Do List added to navigation configuration options.",
      },
      {
        type: "improve",
        text: "Accessibility fonts — Atkinson Hyperlegible and Nunito added as selectable app fonts.",
      },
      {
        type: "hotfix",
        text: "Hotfixes on Groups controls, tour card focus trap, activity category picker.",
      },
    ],
  },
];
