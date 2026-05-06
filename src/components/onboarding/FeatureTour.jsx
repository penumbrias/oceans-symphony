import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X, ChevronLeft, ChevronRight, MapPin, ChevronsRight } from "lucide-react";
import { useTerms } from "@/lib/useTerms";
import { base44 } from "@/api/base44Client";

// alterId — ID of the alter whose profile to navigate to during profile steps.
// tourAlterWasCreated — true if we created a temporary demo alter.
function buildSteps(t, alterId = null, tourAlterWasCreated = false) {
  const ai = alterId;
  return [
    // ─── WELCOME ────────────────────────────────────────────────────────────
    {
      section: "welcome", sectionLabel: "Welcome",
      emoji: "🌊",
      title: "Welcome to the Interactive Tour!",
      body: `This tour walks through every page and feature of Oceans Symphony, step by step. The app navigates automatically and highlights each element as it's described. Use "Skip section →" to jump ahead, or Back to revisit. Let's go!`,
      route: "/", target: null, look: null, action: null,
    },

    // ─── DASHBOARD ──────────────────────────────────────────────────────────
    {
      section: "dashboard", sectionLabel: "Dashboard",
      emoji: "🏠",
      title: "Your Home Dashboard",
      body: `The home screen is your command center — it shows who is currently ${t.fronting}, your latest status note, the bulletin board, and quick nav to every feature. Everything important surfaces here without having to dig through menus.`,
      route: "/", target: null,
      look: `the full home screen — take a moment to scroll down and see everything`, action: null,
    },
    {
      section: "dashboard", sectionLabel: "Dashboard",
      emoji: "👥",
      title: `Currently ${t.Fronting}`,
      body: `The ${t.fronting} widget shows every ${t.alter} who is currently ${t.fronting}. Tap any ${t.alter} chip to expand it — you can add a session note, log emotions or symptoms, or mark the ${t.switch} as triggered right there without leaving the home screen.`,
      route: "/", target: "fronters-widget",
      look: `the highlighted "Currently ${t.Fronting}" card with ${t.alter} chips`, action: null,
    },
    {
      section: "dashboard", sectionLabel: "Dashboard",
      emoji: "🔄",
      title: `Set & Switch ${t.Front}`,
      body: `The "Switch" button (or "Set ${t.Front}" when nobody is ${t.fronting}) is how you log a ${t.switch}. Tap it to open the ${t.Front} modal where you'll select ${t.alters}, designate a primary, and save. The previous session automatically ends when you save a new one.`,
      route: "/", target: "set-front",
      look: `the highlighted Switch / "Set ${t.Front}" button in the ${t.fronting} widget`, action: null,
    },
    {
      section: "dashboard", sectionLabel: "Dashboard",
      emoji: "💜",
      title: "Quick Check-In",
      body: `The Quick Check-In button opens a multi-section flow for logging emotions, symptoms, activities, and notes in one go. Any ${t.alter} can use it at any time. It's the fastest way to capture what's happening right now.`,
      route: "/", target: "quick-checkin",
      look: `the highlighted Quick Check-In button — it's opening the modal now`, action: "open-quick-checkin",
    },
    {
      section: "dashboard", sectionLabel: "Dashboard",
      emoji: "⚡",
      title: "Quick Actions (Hold)",
      body: `Press and hold the Quick Check-In button for 3 seconds to pop up your Quick Actions menu — a pill list of shortcuts you've configured. Each action can: open the full modal, jump to a specific section, set a specific ${t.alter} to ${t.front} instantly, log an activity, or log a symptom — all without touching the modal. Configure them in Settings → Check-In & Tracking → Quick Actions.`,
      route: "/", target: "quick-checkin",
      look: `the highlighted Quick Check-In button — hold it for 3 seconds to see your Quick Actions pop up`, action: null,
    },
    {
      section: "dashboard", sectionLabel: "Dashboard",
      emoji: "💬",
      title: "Status Notes",
      body: `The status note field lets you leave a short system-wide note — "at work", "in therapy", "rough night". Every save creates a new timestamped record; nothing is ever overwritten. The most recent note appears above the input as a preview, and all past notes appear on the Timeline.`,
      route: "/", target: "status-note",
      look: `the highlighted status note input area below the ${t.alter} chips`, action: null,
    },
    {
      section: "dashboard", sectionLabel: "Dashboard",
      emoji: "🧭",
      title: "Quick Nav Menu",
      body: `Below the status input is the Quick Nav Menu — shortcuts to every section of the app. Toggle between grid and list view using the icon in its header. In Settings → Appearance → Navigation you can choose which pages appear here and in what order.`,
      route: "/", target: "quick-nav",
      look: `the highlighted Quick Nav grid or list — scroll down to see it`, action: null,
    },
    {
      section: "dashboard", sectionLabel: "Dashboard",
      emoji: "🔔",
      title: "Notifications Bell",
      body: `The bell (🔔) in the top-right shows unread notifications — @ mentions from bulletins and messages, and reminder alerts. A colored dot appears when there are unread items. Tap any notification to jump directly to the source.`,
      route: "/", target: null,
      look: `the 🔔 bell icon in the top bar — a dot appears when you have unread notifications`, action: null,
    },

    // ─── FRONTING ───────────────────────────────────────────────────────────
    {
      section: "fronting", sectionLabel: `${t.Fronting}`,
      emoji: "👥",
      title: `Set ${t.Front}ers — Select`,
      body: `The Set ${t.Front}ers modal is now open. All active ${t.alters} appear as a scrollable list. Tap any ${t.alter} to select them — selected ${t.alters} appear as chips at the top. Tap a chip's × to remove them. Long-press a chip to toggle primary status.`,
      route: "/", target: "set-front",
      look: `the modal — try tapping an ${t.alter} to select them and see their chip appear`, action: "open-set-front",
    },
    {
      section: "fronting", sectionLabel: `${t.Fronting}`,
      emoji: "🔃",
      title: `Sort ${t.Alters} in Modal`,
      body: `The sort button in the modal's search row cycles through four modes: A→Z, Z→A, Most ${t.fronting} time first, and Least ${t.fronting} time first. Currently ${t.fronting} ${t.alters} always appear at the top of the list regardless of sort mode.`,
      route: "/", target: "setfront-sort",
      look: `the highlighted sort icon button in the modal's search bar row`, action: "open-set-front",
    },
    {
      section: "fronting", sectionLabel: `${t.Fronting}`,
      emoji: "⚡",
      title: `Triggered ${t.Switch}`,
      body: `If the ${t.switch} was triggered by something external, check "Triggered ${t.switch}?" to log what caused it — sensory overload, emotional spike, interpersonal, trauma reminder, physical, internal conflict, or any custom types you've added in Settings. This data feeds the Switch Log analytics.`,
      route: "/", target: "setfront-triggered",
      look: `the highlighted "Triggered ${t.switch}?" checkbox at the bottom of the modal`, action: "open-set-front",
    },
    {
      section: "fronting", sectionLabel: `${t.Fronting}`,
      emoji: "📖",
      title: `Journal This ${t.Switch}`,
      body: `Check "Journal this ${t.switch}?" before saving to automatically open a journal entry after the ${t.switch} is logged. The entry is linked to the session and appears in the Switch Logs tab of Journals. Great for capturing why the ${t.switch} happened while it's still fresh.`,
      route: "/", target: "setfront-journal",
      look: `the highlighted "Journal this ${t.switch}?" checkbox at the bottom of the modal`, action: "open-set-front",
    },

    // ─── ALTERS ─────────────────────────────────────────────────────────────
    {
      section: "alters", sectionLabel: t.Alters,
      emoji: "👤",
      title: `${t.Alter} Grid`,
      body: `The ${t.Alters} page shows every member of your ${t.system}. Each card displays name, pronouns, role, color, and avatar. Currently ${t.fronting} ${t.alters} float to the top with a glowing color border. Archived ${t.alters} are hidden here — manage them in Settings → ${t.Alters} & Fields.`,
      route: "/Home", target: "alters-grid",
      look: `the highlighted ${t.alter} card grid below the search bar`, action: null,
    },
    {
      section: "alters", sectionLabel: t.Alters,
      emoji: "🔃",
      title: `Sort ${t.Alters}`,
      body: `The sort button (↕ arrow icon) cycles through A→Z, Z→A, Most ${t.fronting} time first, and Least ${t.fronting} time first. Active ${t.alters} always pin to the top regardless of which sort mode is active.`,
      route: "/Home", target: "alter-sort",
      look: `the highlighted sort button to the right of the search bar`, action: null,
    },
    {
      section: "alters", sectionLabel: t.Alters,
      emoji: "🔲",
      title: "List & Grid View",
      body: `Toggle between a detailed list view (name, pronouns, role visible) and a compact mosaic grid (avatar-focused). List view is better for reading details; grid view is faster for scanning a larger ${t.system} visually.`,
      route: "/Home", target: "alter-view-toggle",
      look: `the highlighted list/grid toggle icon to the right of the sort button`, action: null,
    },
    {
      section: "alters", sectionLabel: t.Alters,
      emoji: "📁",
      title: "Groups & Folders",
      body: `${t.Alters} can be organized into named groups. The 👁 eye icon toggles the folder tree view on and off. The + icon creates a new group. The ⚙️ gear opens the full Groups Manager page where you can nest groups, reorder them, and assign ${t.alters} to multiple groups.`,
      route: "/Home", target: "alter-groups-controls",
      look: `the highlighted group control icons (👁 + ⚙️) in the ${t.Alters} section header`, action: null,
    },
    {
      section: "alters", sectionLabel: t.Alters,
      emoji: "➕",
      title: `Add a New ${t.Alter}`,
      body: `Tap the highlighted "Add ${t.Alter}" button to create a new profile. Fill in name, pronouns, role, color, avatar URL, bio, origin year, and any custom fields. You can also connect a Simply Plural member ID to sync data from Simply Plural.`,
      route: "/Home", target: "alter-add-btn",
      look: `the highlighted "+ Add ${t.Alter}" button in the top-right`, action: null,
    },
    {
      section: "alters", sectionLabel: t.Alters,
      emoji: "📋",
      title: `${t.Alter} Profile — Tab Bar`,
      body: `Tap any ${t.alter} card to open their profile. The tab bar at the top gives access to: Profile (bio + custom fields), Info, Board (${t.system}-wide messages to this ${t.alter}), Messages (private messages), History (${t.fronting} sessions), Notes, Lineage, and Options. Swipe the tab bar to see all tabs.`,
      route: ai ? `/alter/${ai}` : "/Home",
      target: ai ? "alter-profile-tabs" : "alters-grid",
      look: ai ? `the highlighted tab bar at the top of the ${t.alter} profile` : `tap any ${t.alter} card to open their profile and see the tab bar`, action: null,
    },
    {
      section: "alters", sectionLabel: t.Alters,
      emoji: "✏️",
      title: "Edit Profile",
      body: `The highlighted Edit button switches the profile tab into edit mode. You can update the name, pronouns, role, bio, color, avatar URL, origin year, and all custom fields. Tap Save when done. The View button switches back to read-only without saving.`,
      route: ai ? `/alter/${ai}` : "/Home",
      target: ai ? "alter-profile-edit-btn" : null,
      look: ai ? `the highlighted "Edit" button in the top-right of the profile page` : `open a profile and look for the Edit button in the top-right`, action: null,
    },
    {
      section: "alters", sectionLabel: t.Alters,
      emoji: "📊",
      title: `${t.Fronting} History Tab`,
      body: `The History tab shows every ${t.fronting} session for this ${t.alter} — date, duration, whether they were primary or co-${t.fronting}, and any session notes. Sessions are sorted newest first. The total ${t.fronting} time and session count appear in a summary row at the top.`,
      route: ai ? `/alter/${ai}?tab=history` : "/Home",
      target: ai ? "alter-profile-tabs" : null,
      look: ai ? `tap the "History" tab in the highlighted tab bar` : `open an ${t.alter} profile and switch to the History tab`, action: null,
    },
    {
      section: "alters", sectionLabel: t.Alters,
      emoji: "📝",
      title: "Notes Tab",
      body: `The Notes tab is a private scratchpad for this ${t.alter} — headmates can leave notes here that are only visible when viewing this profile. Notes support rich text and can be as long as needed. Useful for important information other ${t.alters} should know about this headmate.`,
      route: ai ? `/alter/${ai}?tab=notes` : "/Home",
      target: ai ? "alter-profile-tabs" : null,
      look: ai ? `tap the "Notes" tab in the highlighted tab bar` : null, action: null,
    },
    {
      section: "alters", sectionLabel: t.Alters,
      emoji: "🌳",
      title: "Lineage Tab",
      body: `The Lineage tab records this ${t.alter}'s origin events — fusions (two ${t.alters} merging), splits (one ${t.alter} splitting into multiple), dormancy periods, and returns. Events are year-only dated. Split events automatically create "Split from" relationship records in the ${t.System} Map.`,
      route: ai ? `/alter/${ai}?tab=lineage` : "/Home",
      target: ai ? "alter-profile-tabs" : null,
      look: ai ? `tap the "Lineage" tab in the highlighted tab bar` : null, action: null,
    },
    {
      section: "alters", sectionLabel: t.Alters,
      emoji: "✉️",
      title: "Private Messages Tab",
      body: `The Messages tab shows private notes left for this ${t.alter}. Use the envelope "Message" button at the top-right of the profile to compose a new one. Messages appear on the dashboard as a banner while the recipient is ${t.fronting}. Pin a message to keep it prominent until dismissed.`,
      route: ai ? `/alter/${ai}?tab=private-messages` : "/Home",
      target: ai ? "alter-profile-tabs" : null,
      look: ai ? `tap the "Messages" tab in the highlighted tab bar` : `look for the envelope "Message" button at the top of any profile`, action: null,
    },
    {
      section: "alters", sectionLabel: t.Alters,
      emoji: "⚙️",
      title: "Options Tab — Archive & Delete",
      body: `The Options tab has two controls: Archive (hides the ${t.alter} from the main grid and ${t.fronting} counts without deleting them — useful for inactive headmates), and the Danger Zone delete button which permanently removes them and all their data.`,
      route: ai ? `/alter/${ai}?tab=options` : "/Home",
      target: ai ? "alter-profile-delete" : null,
      look: ai ? `the highlighted "Delete member" button at the bottom of the Options tab` : `open an ${t.alter} profile, tap Options, and look for Archive and Delete`, action: null,
    },
    ...(tourAlterWasCreated && ai ? [{
      section: "alters", sectionLabel: t.Alters,
      emoji: "🗑️",
      title: "Clean Up Demo Profile",
      body: `The "Tour Demo" profile was created just for this tour. You're on the Options tab now — tap "Delete member" to remove it. The tour will also auto-delete it when you tap Done or close the tour, so it's safe to skip this step too.`,
      route: `/alter/${ai}?tab=options`,
      target: "alter-profile-delete",
      look: `the highlighted "Delete member" button — tap it to delete the demo profile`, action: null,
    }] : []),

    // ─── TIMELINE ───────────────────────────────────────────────────────────
    {
      section: "timeline", sectionLabel: "Timeline",
      emoji: "📅",
      title: "Infinite Timeline",
      body: `The Timeline shows your ${t.system}'s complete history day by day — ${t.fronting} sessions, check-ins, emotions, activities, symptoms, locations, journal entries, and status notes all in one scrollable view. Scroll down to load earlier days; it never runs out.`,
      route: "/timeline", target: "timeline-container",
      look: `the highlighted day-by-day scrolling timeline below the header`, action: null,
    },
    {
      section: "timeline", sectionLabel: "Timeline",
      emoji: "🔦",
      title: "Filter Toggles",
      body: `The icon buttons at the top toggle specific data types on and off. The icons represent: Activities (running figure), Events/journals (book), Emotions (heart), ${t.Fronting} (people), Symptoms (lightning), and Locations (pin). Highlight a single type by turning all others off.`,
      route: "/timeline", target: "timeline-filters",
      look: `the highlighted row of filter toggle icons just below the Timeline heading`, action: null,
    },
    {
      section: "timeline", sectionLabel: "Timeline",
      emoji: "📆",
      title: "Jump to Date",
      body: `The date input and Jump button in the header let you teleport to any specific day instantly — type a date or use the calendar picker and tap Jump. The timeline resets to show that day at the top. Use "Back to today" banner to return to the current date.`,
      route: "/timeline", target: "timeline-jump",
      look: `the highlighted date picker and Jump button in the top-right of the Timeline header`, action: null,
    },
    {
      section: "timeline", sectionLabel: "Timeline",
      emoji: "📊",
      title: "Daily Tally Panel",
      body: `Each day in the timeline has a "Tally" link on the right side of its date header. Tapping it opens a structured daily summary panel — task completion, emotion totals, symptom counts, activity durations, and more. Great for a daily diary-card habit or reviewing a specific day.`,
      route: "/timeline", target: "timeline-container",
      look: `look for a "Tally" text link on the right side of any day header in the timeline`, action: null,
    },
    {
      section: "timeline", sectionLabel: "Timeline",
      emoji: "⏮️",
      title: "Retroactive Entries",
      body: `Long-press (press and hold) anywhere on the timeline to add a retroactive entry for that specific day — a ${t.fronting} session, emotion check-in, symptom log, or activity. Nothing is lost just because you forgot to log it in the moment.`,
      route: "/timeline", target: "timeline-container",
      look: `press and hold on any day section to open the retroactive entry menu`, action: null,
    },

    // ─── SYSTEM MEETINGS ────────────────────────────────────────────────────
    {
      section: "meetings", sectionLabel: `${t.System} Meetings`,
      emoji: "✨",
      title: `${t.System} Meetings`,
      body: `${t.System} Meetings are a structured 5-step ritual designed for the whole ${t.system} to do together — arrive, notice, greet, share, close. Past meetings are listed with dates and notes here. They appear in the Therapy Report, the Timeline, and the Meetings analytics section.`,
      route: "/system-checkin", target: "meetings-list",
      look: `the highlighted list of past meetings and the "New Meeting" button`, action: null,
    },
    {
      section: "meetings", sectionLabel: `${t.System} Meetings`,
      emoji: "➕",
      title: "Start a New Meeting",
      body: `Tap "New Meeting" to open the 5-step form. Each step has a notes field and the app guides you through: (1) Arrive — breathe, (2) Notice — who's present + body check + emotions, (3) Greet — acknowledge each ${t.alter}, (4) Share — what needs to be said, (5) Close — gratitude + reminder.`,
      route: "/system-checkin", target: "meetings-new",
      look: `the highlighted "New Meeting" button at the top of the meetings list`, action: null,
    },
    {
      section: "meetings", sectionLabel: `${t.System} Meetings`,
      emoji: "👁️",
      title: `Who's Present & Emotions`,
      body: `In Step 2, you mark which ${t.alters} are present in the meeting — this automatically updates the active ${t.front} session to match. Emotions logged in Step 2 create EmotionCheckIn records visible in the Emotions analytics section. Steps 3–5 have @ mention support to tag ${t.alters} in notes.`,
      route: "/system-checkin", target: "meetings-list",
      look: `the meetings list — tap any past meeting to see the full record, or tap "New Meeting" to try Step 2`, action: null,
    },

    // ─── JOURNALS ───────────────────────────────────────────────────────────
    {
      section: "journals", sectionLabel: "Journals",
      emoji: "📖",
      title: "Journals — Overview",
      body: `The Journals page shows long-form entries from any ${t.alter}. Entries are organized into folders and subfolders — the breadcrumb at the top shows where you are. The total entry count appears below the title. Tap any folder card to enter it, or tap the title to go back to root.`,
      route: "/journals", target: "journals-list",
      look: `the highlighted folder grid and entry list on the Journals page`, action: null,
    },
    {
      section: "journals", sectionLabel: "Journals",
      emoji: "📁",
      title: "Folders & Subfolders",
      body: `Tap "New Folder" to create a folder at the current level, or "New Subfolder" when inside a folder. Tap a folder card to enter it. The breadcrumb shows your path. Entries created while inside a folder are automatically filed there. You can have unlimited nesting depth.`,
      route: "/journals", target: "journals-folder-btn",
      look: `the highlighted "New Folder" button in the top-right of the Journals page`, action: null,
    },
    {
      section: "journals", sectionLabel: "Journals",
      emoji: "✏️",
      title: "New Entry",
      body: `Tap "New Entry" to open the journal editor. Choose the author (which ${t.alter} is writing), give it a title, write the content using the rich-text editor, assign optional tags, and choose a folder. Entries can also have visibility restrictions — limit who can read them to specific ${t.alters} or groups.`,
      route: "/journals", target: "journals-new-entry",
      look: `the highlighted "New Entry" button in the top-right of the Journals page`, action: null,
    },
    {
      section: "journals", sectionLabel: "Journals",
      emoji: "🔄",
      title: `${t.Switch} Logs Tab`,
      body: `The "${t.Switch} Logs" tab shows journal entries that were automatically created from ${t.switch} events. When you check "Journal this ${t.switch}?" in the ${t.Front} modal, the entry is saved here and linked to that specific ${t.fronting} session.`,
      route: "/journals", target: "journals-tabs",
      look: `the highlighted tab bar — the "${t.Switch} Logs" tab is the second one`, action: null,
    },
    {
      section: "journals", sectionLabel: "Journals",
      emoji: "🔍",
      title: "Search, Author Filter & Tags",
      body: `Use the search bar to find entries by title or content. The Author dropdown filters to a specific ${t.alter}'s entries. Tap any tag chip to filter by tag. The ${t.fronter}-only toggle (eye icon) shows only entries visible to who is currently ${t.fronting}.`,
      route: "/journals", target: "journals-filters",
      look: `the highlighted search bar and filter controls below the tab bar`, action: null,
    },
    {
      section: "journals", sectionLabel: "Journals",
      emoji: "🏷️",
      title: "@ Mentions in Journals",
      body: `The journal editor has a dedicated "@ mentions" field at the bottom (separate from the main content). Type an ${t.alter}'s name there — they'll receive a notification in the bell menu with a link directly to the entry. @ mentions also work in bulletins, board messages, and ${t.system} meeting notes.`,
      route: "/journals", target: "journals-new-entry",
      look: `open a journal entry and scroll to the bottom of the editor to find the @ mention field`, action: null,
    },

    // ─── BULLETIN BOARD ─────────────────────────────────────────────────────
    {
      section: "bulletin", sectionLabel: "Bulletin Board",
      emoji: "📋",
      title: "Bulletin Board",
      body: `The Bulletin Board on the home screen is for ${t.system}-wide messages — announcements, reminders, notes visible to everyone. Unlike private messages (which target one specific ${t.alter}), bulletins are always visible to the whole ${t.system}.`,
      route: "/", target: "bulletin-list",
      look: `the highlighted Bulletin Board section — scroll down past the Quick Nav to see it`, action: null,
    },
    {
      section: "bulletin", sectionLabel: "Bulletin Board",
      emoji: "💬",
      title: "@ Mentions & Comments",
      body: `Type @ in a bulletin post to mention an ${t.alter} — they receive a notification in the bell. Tap any bulletin to expand it and reveal the threaded comment section. Other ${t.alters} can reply and add emoji reactions. Tap the 📌 pin icon on a bulletin to pin it to the top of the board.`,
      route: "/", target: "bulletin-list",
      look: `the highlighted bulletin board — tap any bulletin to expand the comment thread`, action: null,
    },

    // ─── TASKS ──────────────────────────────────────────────────────────────
    {
      section: "tasks", sectionLabel: "Tasks",
      emoji: "✅",
      title: "Daily Tasks & Habits",
      body: `The Tasks page shows recurring habits organized by frequency. Switch between Daily, Weekly, Monthly, and Yearly using the highlighted tab bar. Each task has an XP value and a streak counter. Completing tasks earns XP toward your level shown in the bar above.`,
      route: "/tasks", target: "tasks-daily",
      look: `the highlighted Tasks page with the frequency tabs and task cards`, action: null,
    },
    {
      section: "tasks", sectionLabel: "Tasks",
      emoji: "📊",
      title: "XP Level Bar",
      body: `The highlighted level bar shows your current XP level, today's progress (XP earned vs. possible), your current daily streak, and your best streak ever. The bar fills as you check off tasks. Completing every task in a day keeps your streak going.`,
      route: "/tasks", target: "tasks-level-bar",
      look: `the highlighted XP level bar showing your level, streak, and today's progress`, action: null,
    },
    {
      section: "tasks", sectionLabel: "Tasks",
      emoji: "🗂️",
      title: "Frequency Tabs",
      body: `The four tabs — Daily, Weekly, Monthly, Yearly — each show tasks for that period. A badge shows how many tasks exist in each tab. Switch between them to see and complete tasks for different time scales. Weekly/monthly/yearly tasks reset at the start of each period.`,
      route: "/tasks", target: "tasks-freq-tabs",
      look: `the highlighted frequency tab bar — Daily, Weekly, Monthly, Yearly`, action: null,
    },
    {
      section: "tasks", sectionLabel: "Tasks",
      emoji: "⚙️",
      title: "Edit Tasks (Manage)",
      body: `The Edit button opens the Task Manager inline. Here you can add tasks, edit existing ones, toggle them hidden or visible, drag to reorder within each frequency section, and delete them. Tasks can be MANUAL (tap to complete) or AUTO (completed automatically by app actions like logging a check-in).`,
      route: "/tasks", target: "tasks-edit-btn",
      look: `the highlighted "Edit" button in the top-right of the Tasks header`, action: null,
    },
    {
      section: "tasks", sectionLabel: "Tasks",
      emoji: "📝",
      title: "To-Do List",
      body: `The To-Do List (/todo) is separate from habits — it's for one-off tasks with no repeat schedule. Add any item, check it off when done, and remove it when finished. Great for therapy goals, short-term errands, or anything you need to track but not repeat.`,
      route: "/todo", target: "tasks-list",
      look: `the To-Do List page with the task input field and checklist`, action: null,
    },

    // ─── ACTIVITIES ─────────────────────────────────────────────────────────
    {
      section: "activities", sectionLabel: "Activities",
      emoji: "🏃",
      title: "Activity Tracker",
      body: `The Activity Tracker shows a weekly grid view — each day is a column, each activity block spans its time range. Tap any empty time slot to log a new activity there. Tap an existing block to edit it. Navigate weeks with the ← → arrows in the header.`,
      route: "/activities", target: "activities-log",
      look: `the highlighted weekly activity grid — each column is a day, each row a time slot`, action: null,
    },
    {
      section: "activities", sectionLabel: "Activities",
      emoji: "⏱️",
      title: "Categories, Duration & Notes",
      body: `When logging an activity, give it a name, an optional category (from your configured list or create new), an optional duration in minutes, and optional notes. Duration and category unlock the Activities analytics charts — the more you fill in, the richer the analysis.`,
      route: "/activities", target: "activities-log",
      look: `tap any time slot in the grid to open the activity log form — notice the category and duration fields`, action: null,
    },

    // ─── POLLS ──────────────────────────────────────────────────────────────
    {
      section: "polls", sectionLabel: "Polls",
      emoji: "🗳️",
      title: `Polls — ${t.System} Voting`,
      body: `Polls let the whole ${t.system} vote on decisions together. Each ${t.alter} casts their vote independently. Results show as colored bars with ${t.alter} avatars beside each option showing who voted for what. Open polls accept votes; closed polls are locked for reference.`,
      route: "/polls", target: "polls-list",
      look: `the highlighted Polls page with the list of open and closed polls`, action: null,
    },
    {
      section: "polls", sectionLabel: "Polls",
      emoji: "➕",
      title: "Create a Poll",
      body: `Tap the highlighted Create button to make a new poll. Enter a question, add 2–4 options, and select who is creating it. To vote, open any open poll, select "Voting as" (which ${t.alter} is voting), and tap your choice. Only the poll creator can close it when a decision is reached.`,
      route: "/polls", target: "polls-create",
      look: `the highlighted "Create" button in the top-right of the Polls header`, action: null,
    },

    // ─── REMINDERS ──────────────────────────────────────────────────────────
    {
      section: "reminders", sectionLabel: "Reminders",
      emoji: "🔔",
      title: "Reminders",
      body: `Reminders send scheduled notifications that deep-link into the app. A "Log check-in" reminder opens the Quick Check-In modal directly. A "Set ${t.front}" reminder opens the ${t.Front} modal. Schedules can be one-time, daily, weekly, or monthly with optional end dates.`,
      route: "/reminders", target: "reminders-list",
      look: `the highlighted Reminders page with the Inbox and Manage tabs`, action: null,
    },
    {
      section: "reminders", sectionLabel: "Reminders",
      emoji: "⚙️",
      title: "Manage Tab — Create Rules",
      body: `The Manage tab lists all your active reminder rules. Tap "New Reminder" to create one — give it a title, choose a schedule (daily, weekly, etc.), set start/end dates, and pick the action to trigger. Custom trigger types you've added in Settings appear as action options here.`,
      route: "/reminders", target: "reminders-manage-tab",
      look: `the highlighted "Manage" tab button`, action: null,
    },
    {
      section: "reminders", sectionLabel: "Reminders",
      emoji: "📬",
      title: "Inbox Tab — Act on Reminders",
      body: `The Inbox tab collects all fired reminders waiting for action. Tap the action button to do what the reminder suggests (open check-in, set ${t.front}, etc.), or snooze to see it again later. Dismissed items disappear. Reminders that were acted on from a notification don't appear here.`,
      route: "/reminders", target: "reminders-inbox-tab",
      look: `the highlighted "Inbox" tab button`, action: null,
    },

    // ─── ANALYTICS ──────────────────────────────────────────────────────────
    {
      section: "analytics", sectionLabel: "Analytics",
      emoji: "📊",
      title: "Analytics Landing",
      body: `Analytics has 12 specialized sections accessible from this grid: ${t.System} Members, Activities, Emotions, Symptoms, Daily Log, Sleep, Journals, Co-${t.Fronting}, Switch Logs, ${t.System} Meetings, Patterns & Insights, and Locations. Each section has its own charts and date range controls.`,
      route: "/analytics", target: "analytics-charts",
      look: `the highlighted section grid — each card is a different analysis area`, action: null,
    },
    {
      section: "analytics", sectionLabel: "Analytics",
      emoji: "👥",
      title: `${t.System} Members`,
      body: `${t.System} Members ranks ${t.alters} by ${t.fronting} time. Stat modes: Total time, Primary-only, Co-${t.front}-only, Average session length, Max, Min, and Count. The "Time of Day" tab shows a heatmap of when each ${t.alter} tends to front by hour — useful for spotting patterns.`,
      route: "/analytics", target: "analytics-charts",
      look: `tap "${t.System} Members" on the analytics grid to open this section`, action: null,
    },
    {
      section: "analytics", sectionLabel: "Analytics",
      emoji: "💜",
      title: "Emotions, Symptoms & Activities",
      body: `Emotions shows mood trends and check-in frequency over time. Symptoms tracks recurring patterns and can correlate with specific ${t.alters}. Activities shows time-per-category trends and an ${t.Alter} × Activity matrix. All three sections have date range pickers — 7d, 30d, 90d, 1y, All Time, or Custom.`,
      route: "/analytics", target: "analytics-charts",
      look: `tap Emotions, Symptoms, or Activities on the analytics grid`, action: null,
    },
    {
      section: "analytics", sectionLabel: "Analytics",
      emoji: "🔀",
      title: `Co-${t.Fronting} & Switch Logs`,
      body: `Co-${t.Fronting} shows which ${t.alters} tend to front together — a co-occurrence analysis of your ${t.system}'s dynamics. Switch Log analytics breaks down triggered ${t.switches} by category and visualizes patterns in what tends to cause ${t.switches} over time.`,
      route: "/analytics", target: "analytics-charts",
      look: `tap "Co-${t.Fronting}" or "Switch Logs" on the analytics grid`, action: null,
    },
    {
      section: "analytics", sectionLabel: "Analytics",
      emoji: "🔍",
      title: "Patterns & Insights",
      body: `Patterns & Insights cross-references multiple data sources to find correlations — activities that follow certain emotions, whether specific ${t.alters} fronting correlates with symptom changes, and recurring time-of-day patterns. The more you log over time, the more meaningful this section becomes.`,
      route: "/analytics", target: "analytics-charts",
      look: `tap "Patterns & Insights" on the analytics grid`, action: null,
    },

    // ─── SYSTEM MAP ─────────────────────────────────────────────────────────
    {
      section: "systemmap", sectionLabel: `${t.System} Map`,
      emoji: "🗺️",
      title: `${t.System} Map`,
      body: `The ${t.System} Map has two tabs: Analytics Map (circles auto-sized by ${t.fronting} time, positioned by co-${t.fronting} overlap) and Inner World Canvas (freeform drag-and-drop layout for your inner world). Below both tabs is the Relationships panel.`,
      route: "/system-map", target: "system-map-canvas",
      look: `the highlighted map canvas — notice the "Analytics" and "Inner World" tabs at the top`, action: null,
    },
    {
      section: "systemmap", sectionLabel: `${t.System} Map`,
      emoji: "🌌",
      title: "Inner World Canvas",
      body: `Switch to the "Inner World" tab to arrange ${t.alter} nodes freely by dragging them. Long-press between two ${t.alters} to draw a relationship line. Tap any ${t.alter} node to highlight their connections. Use this canvas to map out your inner world however makes sense to your ${t.system}.`,
      route: "/system-map", target: "system-map-canvas",
      look: `the map canvas — switch to "Inner World" tab and try dragging an ${t.alter} circle`, action: null,
    },
    {
      section: "systemmap", sectionLabel: `${t.System} Map`,
      emoji: "🔗",
      title: "Relationships Panel",
      body: `Below the map canvas, the Relationships panel lists all defined ${t.alter} relationships. Add new ones with built-in types (protector of, split from, caretaker for, etc.) or any custom types you've defined in Settings → Alters & Fields → Relationship Types.`,
      route: "/system-map", target: "system-map-canvas",
      look: `scroll below the map canvas to find the Relationships panel`, action: null,
    },

    // ─── GROUNDING & SUPPORT ────────────────────────────────────────────────
    {
      section: "grounding", sectionLabel: "Support",
      emoji: "🫧",
      title: "Support Page",
      body: `The Support page has two tabs: Support and Learn. On the Support tab there are three entry points: Browse all techniques, Help me figure out what I need, and Guided breathing. There's also a 🫧 floating bubble button in the bottom corner of every screen for instant access from anywhere in the app.`,
      route: "/grounding", target: "grounding-tabs",
      look: `the highlighted Support / Learn tab bar at the top of the page`, action: null,
    },
    {
      section: "grounding", sectionLabel: "Support",
      emoji: "🌳",
      title: "Browse All Techniques",
      body: `Tap "Browse all" to see every grounding technique organized by category — mindfulness, somatic, imagery, breathwork, and more. Tap any card to open the guided step-by-step view. Rate it 1–5 stars, add personal notes about what works for you, and toggle it as a favorite — favorites always appear first.`,
      route: "/grounding", target: "grounding-browse",
      look: `the highlighted "Browse all" button on the Support tab`, action: null,
    },
    {
      section: "grounding", sectionLabel: "Support",
      emoji: "🧭",
      title: "Help Me Figure Out What I Need",
      body: `"Help me figure out what I need" runs a short State Check — you select your current emotional and body state from a list. Based on your answers, the app suggests three tailored grounding techniques and a breathing exercise. If you select a crisis state, crisis resources appear prominently at the top.`,
      route: "/grounding", target: "grounding-state-check",
      look: `the highlighted "Help me figure out what I need" button`, action: null,
    },
    {
      section: "grounding", sectionLabel: "Support",
      emoji: "🌬️",
      title: "Guided Breathing",
      body: `Tap "Guided breathing" to choose a breathing technique — box breathing, 4-7-8, extended exhale, and more. Each has an animated visual cue that guides inhale, hold, and exhale phases in real time. You can set a custom session duration. Breathing can also be suggested by the State Check flow.`,
      route: "/grounding", target: "grounding-breathing",
      look: `the highlighted "Guided breathing" button on the Support tab`, action: null,
    },
    {
      section: "grounding", sectionLabel: "Support",
      emoji: "📚",
      title: "Learn Tab — Curriculum",
      body: `The Learn tab has modules covering dissociation education, grounding theory, emotional regulation, the window of tolerance, safety planning, and inner child work. Each module has multiple short lessons. "Try Now" buttons inside lessons launch the relevant technique directly from the reading.`,
      route: "/grounding", target: "grounding-tabs",
      look: `tap the "Learn" tab in the highlighted tab bar to explore the curriculum modules`, action: null,
    },
    {
      section: "grounding", sectionLabel: "Support",
      emoji: "🛡️",
      title: "Safety Plan",
      body: `Your Safety Plan lives at /safety-plan (linked from the Support tab footer). It stores Warning Signs (earliest/escalating/emergency), Coping Cards, and Window of Tolerance levels. Build it gradually over time, or fill it in during a calmer moment. Access it instantly from the nav or the Support tab.`,
      route: "/safety-plan", target: null,
      look: `the Safety Plan page — scroll down to see Warning Signs, Coping Cards, and Tolerance levels`, action: null,
    },

    // ─── THERAPY REPORT ─────────────────────────────────────────────────────
    {
      section: "therapy", sectionLabel: "Therapy Report",
      emoji: "📄",
      title: "Therapy Report Builder",
      body: `The Therapy Report generates a structured printable document of your ${t.system}'s activity over any date range — bring it to therapy sessions to bridge the memory and amnesia gap between visits. Your therapist sees ${t.fronting} patterns, emotions, symptoms, and activities even across dissociative barriers.`,
      route: "/therapy-report", target: "therapy-report-builder",
      look: `the highlighted report builder form — date range at top, section toggles below`, action: null,
    },
    {
      section: "therapy", sectionLabel: "Therapy Report",
      emoji: "⚙️",
      title: "Choose Sections",
      body: `Toggle which sections to include: Overview, ${t.Fronting}, Emotions, Status Notes, Symptoms, Activities, Journals, Diary Cards, Bulletins, ${t.System} Meetings, Tasks, Patterns, and an ${t.Alter} Appendix. Add your therapist's name, a confidentiality notice, a cover page, and a custom cover note.`,
      route: "/therapy-report", target: "therapy-report-builder",
      look: `the section checkboxes and customization fields in the highlighted report builder`, action: null,
    },
    {
      section: "therapy", sectionLabel: "Therapy Report",
      emoji: "💾",
      title: "Export & Templates",
      body: `Export as a PDF download or plain text for copy-pasting. Save your current configuration as a named template — next session, load the template and click Generate with zero setup. Templates remember your section selections, date range, therapist name, and all options.`,
      route: "/therapy-report", target: "therapy-report-builder",
      look: `the PDF/Text toggle, Generate button, and Templates section at the bottom of the builder`, action: null,
    },

    // ─── SETTINGS ───────────────────────────────────────────────────────────
    {
      section: "settings", sectionLabel: "Settings",
      emoji: "⚙️",
      title: "Settings — Quick Nav",
      body: `Settings has 8 collapsible sections. The highlighted quick-nav button row at the top jumps to any section without scrolling. Each section header expands when tapped. Sections: System, Appearance, Accessibility, Alters & Fields, Check-In & Tracking, Analytics, Reminders, and Data & Privacy.`,
      route: "/settings", target: "settings-quick-nav",
      look: `the highlighted quick-nav button row at the top of the Settings page`, action: null,
    },
    {
      section: "settings", sectionLabel: "Settings",
      emoji: "✏️",
      title: `${t.System} Name & Terminology`,
      body: `The System section is expanded by default. Set your ${t.system}'s name at the top. Below it, Terminology Settings lets you customize every word the app uses — "${t.system}", "${t.alter}", "${t.fronting}", "${t.switch}", and more. Changes take effect immediately throughout the entire app including this tour.`,
      route: "/settings", target: "settings-system",
      look: `the highlighted System section — already expanded with the name input at the top`, action: null,
    },
    {
      section: "settings", sectionLabel: "Settings",
      emoji: "🎨",
      title: "Appearance",
      body: `The Appearance section has theme selector (light, dark, and color themes), Navigation Settings (customize which pages appear in the top nav, bottom bar, and dashboard Quick Nav grid), and advanced appearance options like custom CSS variables. Dashboard column count (2, 3, or 4) is also here.`,
      route: "/settings", target: "settings-appearance",
      look: `the highlighted Appearance section — tap its header to expand it`, action: null,
    },
    {
      section: "settings", sectionLabel: "Settings",
      emoji: "🧩",
      title: `${t.Alters} & Fields`,
      body: `The Alters & Fields section has: Custom Fields Manager (add text/number/toggle/dropdown fields to all ${t.alter} profiles), Relationship Types (add custom types for the ${t.System} Map), and the Archived ${t.Alters} Manager (view and restore archived profiles).`,
      route: "/settings", target: "settings-alters",
      look: `the highlighted Alters & Fields section — tap its header to expand it`, action: null,
    },
    {
      section: "settings", sectionLabel: "Settings",
      emoji: "💜",
      title: "Check-In & Tracking",
      body: `Configure the Quick Check-In flow and sections order using the Check-In Manager link. Create custom emotion labels that appear in check-ins. Add custom trigger type categories with emoji and hint text — these appear as options in the "Triggered ${t.switch}?" section of the ${t.Front} modal.`,
      route: "/settings", target: "settings-checkin",
      look: `the highlighted Check-In & Tracking section — tap its header to expand it`, action: null,
    },
    {
      section: "settings", sectionLabel: "Settings",
      emoji: "⚡",
      title: "Quick Actions Config",
      body: `The Quick Actions section (inside Check-In & Tracking) is where you build your personal shortcut library. Tap "Add" to create a new action — choose the type (open modal, jump to section, set ${t.alter} to ${t.front}, log activity, log symptom), fill in the config, and give it a label and optional emoji. Reorder with the up/down arrows. The next time you hold the Quick Check-In button, your shortcuts appear instantly.`,
      route: "/settings", target: "settings-quick-actions",
      look: `the highlighted Quick Actions config — tap the Check-In section header first if it's collapsed`, action: null,
    },
    {
      section: "settings", sectionLabel: "Settings",
      emoji: "🔒",
      title: "Data & Privacy",
      body: `All data is stored locally on your device — nothing goes to any server. Optionally enable AES-256 password encryption to lock data behind a passphrase. Export a full JSON backup of everything, or import one to restore. Connect Simply Plural to sync ${t.alter} profiles. Your data is fully yours and always exportable.`,
      route: "/settings", target: "settings-data",
      look: `the highlighted Data & Privacy section — tap its header to expand it`, action: null,
    },

    // ─── DONE ───────────────────────────────────────────────────────────────
    {
      section: "done", sectionLabel: "Done!",
      emoji: "💜",
      title: "Tour Complete 🎉",
      body: `You've explored every page and feature of Oceans Symphony. The app is designed for dissociative ${t.system}s — log at your own pace, and nothing forgotten in the moment is lost forever. The Tour button on the dashboard is always there if you want to revisit. Take good care. 💜`,
      route: null, target: null, look: null, action: null,
    },
  ];
}

export default function FeatureTour({ onClose }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const t = useTerms();

  const [tourAlterId, setTourAlterId] = useState(null);
  const [tourAlterWasCreated, setTourAlterWasCreated] = useState(false);

  const { data: existingAlters = [], isSuccess: altersLoaded } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });

  useEffect(() => {
    if (!altersLoaded) return;
    const active = existingAlters.filter(a => !a.is_archived);
    if (active.length > 0) {
      setTourAlterId(active[0].id);
    } else {
      base44.entities.Alter.create({
        name: "Tour Demo", pronouns: "they/them", role: "Demo Profile",
        color: "#8b5cf6", is_archived: false,
      }).then(dummy => {
        setTourAlterId(dummy.id);
        setTourAlterWasCreated(true);
        queryClient.invalidateQueries({ queryKey: ["alters"] });
      }).catch(() => {});
    }
  }, [altersLoaded]);

  const steps = useMemo(() => buildSteps(t, tourAlterId, tourAlterWasCreated), [t, tourAlterId, tourAlterWasCreated]);
  const [step, setStep] = useState(0);

  const current = steps[step];
  const isLast = step === steps.length - 1;
  const isFirst = step === 0;

  // Section metadata
  const sectionStepCount = useMemo(
    () => steps.filter(s => s.section === current.section).length,
    [steps, current.section]
  );
  const stepInSection = useMemo(
    () => steps.slice(0, step + 1).filter(s => s.section === current.section).length,
    [steps, step, current.section]
  );
  const nextSectionFirstStep = useMemo(
    () => steps.findIndex((s, i) => i > step && s.section !== current.section),
    [steps, step, current.section]
  );

  const [spotlightRect, setSpotlightRect] = useState(null);
  const [cardAtTop, setCardAtTop] = useState(false);
  const highlightedElRef = useRef(null);

  const updateSpotlight = useCallback(() => {
    const el = highlightedElRef.current;
    if (!el) { setSpotlightRect(null); setCardAtTop(false); return; }
    const r = el.getBoundingClientRect();
    setSpotlightRect({ left: r.left, top: r.top, width: r.width, height: r.height });
    // Move tour card to top when highlighted element is in the bottom 45% of viewport
    // (prevents the card from covering the spotlight cutout)
    setCardAtTop(r.top > window.innerHeight * 0.55);
  }, []);

  // Keep spotlight in sync with scroll/resize
  useEffect(() => {
    const h = () => { if (highlightedElRef.current) updateSpotlight(); };
    window.addEventListener("scroll", h, { passive: true, capture: true });
    window.addEventListener("resize", h, { passive: true });
    return () => {
      window.removeEventListener("scroll", h, { capture: true });
      window.removeEventListener("resize", h);
    };
  }, [updateSpotlight]);

  const clearHighlight = useCallback(() => {
    document.querySelectorAll("[data-tour-active]").forEach(el => {
      el.removeAttribute("data-tour-active");
      el.style.removeProperty("outline");
      el.style.removeProperty("outline-offset");
      el.style.removeProperty("border-radius");
    });
    highlightedElRef.current = null;
    setSpotlightRect(null);
  }, []);

  const applyHighlight = useCallback((target, attempt = 0) => {
    clearHighlight();
    if (!target) return;
    const el = document.querySelector(`[data-tour="${target}"]`);
    if (!el) {
      // Retry until the page finishes rendering — up to ~2 s
      if (attempt < 10) setTimeout(() => applyHighlight(target, attempt + 1), 200);
      return;
    }
    el.setAttribute("data-tour-active", "1");
    el.style.outline = "3px solid hsl(var(--primary))";
    el.style.outlineOffset = "4px";
    el.style.borderRadius = "8px";
    highlightedElRef.current = el;
    el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    // Update spotlight after scroll settles
    setTimeout(updateSpotlight, 380);
  }, [clearHighlight, updateSpotlight]);

  const goTo = useCallback((newStep) => {
    const prev = steps[step];
    const next = steps[newStep];
    // Only close the modal if the next step doesn't share the same action —
    // consecutive steps with the same action keep the modal open.
    if (prev?.action && prev.action !== next?.action) {
      window.dispatchEvent(new CustomEvent(`${prev.action}-close`));
    }
    if (next.route) navigate(next.route);
    // Only (re)open the modal if the action differs from the previous step.
    if (next.action && next.action !== prev?.action) {
      setTimeout(() => window.dispatchEvent(new CustomEvent(next.action)), 350);
    }
    const highlightDelay = (next.action && next.action !== prev?.action) ? 750 : 400;
    setTimeout(() => applyHighlight(next.target), highlightDelay);
    setStep(newStep);
  }, [steps, step, navigate, applyHighlight]);

  const cardRef = useRef(null);

  // Measure tour card height and publish as --tour-card-height CSS variable so
  // dialogs can reposition themselves above the card.
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      const h = Math.ceil(window.innerHeight - rect.top);
      document.documentElement.style.setProperty("--tour-card-height", `${h}px`);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
      document.documentElement.style.removeProperty("--tour-card-height");
    };
  }, []);

  useEffect(() => {
    window.__tourActive = true;
    goTo(0);
    return () => {
      window.__tourActive = false;
      clearHighlight();
    };
  }, []);

  const handleClose = useCallback(() => {
    const prev = steps[step];
    if (prev?.action) {
      window.dispatchEvent(new CustomEvent(`${prev.action}-close`));
    }
    if (tourAlterWasCreated && tourAlterId) {
      base44.entities.Alter.delete(tourAlterId).catch(() => {});
      queryClient.invalidateQueries({ queryKey: ["alters"] });
    }
    window.__tourActive = false;
    onClose();
  }, [steps, step, onClose, tourAlterWasCreated, tourAlterId, queryClient]);

  return createPortal(
    <>
      {/* SVG spotlight — renders a full-screen dim with a transparent cutout over
          the highlighted element. Positioned in the portal so it has no parent
          stacking context; the hole approach works regardless of element z-index. */}
      {spotlightRect ? (
        <svg
          className="fixed inset-0 pointer-events-none"
          style={{ zIndex: 45, width: "100%", height: "100%", overflow: "visible" }}
        >
          <defs>
            <mask id="tour-spotlight-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%">
              <rect width="100%" height="100%" fill="white" />
              <rect
                x={Math.max(0, spotlightRect.left - 10)}
                y={Math.max(0, spotlightRect.top - 10)}
                width={spotlightRect.width + 20}
                height={spotlightRect.height + 20}
                rx={12}
                fill="black"
              />
            </mask>
          </defs>
          <rect width="100%" height="100%" fill="rgba(0,0,0,0.45)" mask="url(#tour-spotlight-mask)" />
        </svg>
      ) : (
        <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 45, background: "rgba(0,0,0,0.3)" }} />
      )}

      {/* Touch blocker — covers the tour card footprint so nothing behind it gets taps */}
      {cardAtTop ? (
        <div className="fixed top-0 left-0 right-0 z-[99] pointer-events-auto"
          style={{ height: "var(--tour-card-height, 0px)" }} />
      ) : (
        <div className="fixed bottom-0 left-0 right-0 z-[99] pointer-events-auto"
          style={{ height: "var(--tour-card-height, 0px)" }} />
      )}

      {/* Tour card — portal-rendered as last body child so z-[100] always wins.
          Moves to top when the spotlight is in the bottom half of the screen. */}
      <div ref={cardRef} className={`fixed left-0 right-0 z-[100] px-3 pb-2 ${cardAtTop ? "top-4" : "bottom-16"}`}>
        <div className="bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
          {/* Overall progress bar */}
          <div className="h-1 bg-muted">
            <div
              className="h-full bg-primary transition-all duration-500"
              style={{ width: `${((step + 1) / steps.length) * 100}%` }}
            />
          </div>

          <div className="px-4 pt-3 pb-1">
            {/* Header */}
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-2">
                <span className="text-xl">{current.emoji}</span>
                <div>
                  <p className="font-semibold text-sm text-foreground leading-tight">{current.title}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-primary/80 bg-primary/10 px-1.5 py-0.5 rounded-full leading-none">
                      {current.sectionLabel}
                    </span>
                    {sectionStepCount > 1 && (
                      <span className="text-[10px] text-muted-foreground">
                        {stepInSection} of {sectionStepCount}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button onClick={handleClose} className="text-muted-foreground hover:text-foreground p-1 flex-shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <p className="text-xs text-muted-foreground leading-relaxed mb-2">{current.body}</p>

            {/* "Look for" hint */}
            {current.look && (
              <div className="flex items-start gap-1.5 bg-primary/8 border border-primary/20 rounded-lg px-2.5 py-2 mb-3">
                <MapPin className="w-3 h-3 text-primary flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-primary leading-snug">
                  <span className="font-semibold">Look for</span> {current.look}
                </p>
              </div>
            )}

            {/* Nav */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => goTo(step - 1)}
                disabled={isFirst}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 disabled:opacity-30 transition-colors flex-shrink-0"
              >
                <ChevronLeft className="w-3 h-3" /> Back
              </button>
              <button
                onClick={() => isLast ? handleClose() : goTo(step + 1)}
                className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity"
              >
                {isLast ? "Done 💜" : (<>Next <ChevronRight className="w-3 h-3" /></>)}
              </button>
              {!isLast && nextSectionFirstStep !== -1 && (
                <button
                  onClick={() => goTo(nextSectionFirstStep)}
                  title="Skip to next section"
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors flex-shrink-0"
                >
                  Skip <ChevronsRight className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
          <div className="h-1" />
        </div>
      </div>
    </>,
    document.body
  );
}
