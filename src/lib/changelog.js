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
    date: "May 16, 2026",
    changes: [
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
