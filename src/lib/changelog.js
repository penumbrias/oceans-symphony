/**
 * App changelog — update this file whenever a feature or fix ships.
 *
 * Format per release:
 *   { date: "Month D, YYYY", changes: [{ type, text }] }
 *
 * types:
 *   "feature"  — new capability worth describing
 *   "improve"  — enhancement to something existing
 *   "fix"      — bug fix worth calling out
 *   "hotfix"   — minor/internal fix, keep text brief
 */

export const CHANGELOG = [
  {
    date: "May 10, 2026",
    changes: [
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
