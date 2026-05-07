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
    date: "May 7, 2026",
    changes: [
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
