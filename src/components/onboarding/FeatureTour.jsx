import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { X, ChevronLeft, ChevronRight, MapPin, ChevronsRight } from "lucide-react";
import { useTerms } from "@/lib/useTerms";

// Steps may carry an `action` string — the tour dispatches a CustomEvent with that
// name after navigating so the relevant modal/panel opens automatically.
function buildSteps(t) {
  return [
    // ─── WELCOME ────────────────────────────────────────────────────────────
    {
      section: "welcome", sectionLabel: "Welcome",
      emoji: "🌊",
      title: "Welcome to the Interactive Tour!",
      body: `This tour walks through every page and feature step by step, section by section. Modals and panels open automatically so you can see exactly what's being described. Use "Skip section →" to jump ahead anytime.`,
      route: "/", target: null, look: null, action: null,
    },

    // ─── DASHBOARD ──────────────────────────────────────────────────────────
    {
      section: "dashboard", sectionLabel: "Dashboard",
      emoji: "🏠",
      title: "Your Home Dashboard",
      body: `The home screen is your mission control — it shows who is currently ${t.fronting}, your latest status note, quick access to every feature, and ${t.system}-wide messages at a glance. Everything important surfaces here.`,
      route: "/", target: null, look: `the full home screen — scroll down to see all sections`, action: null,
    },
    {
      section: "dashboard", sectionLabel: "Dashboard",
      emoji: "👥",
      title: `Currently ${t.Fronting} Widget`,
      body: `This card shows every ${t.alter} who is currently ${t.fronting}. Tap any chip to expand it — you can add a session note, log emotions or symptoms, or mark a triggered ${t.switch} right here without leaving the home screen. Long-hold a chip for a quick actions menu.`,
      route: "/", target: "fronters-widget",
      look: `the "Currently ${t.Fronting}" card — tap any ${t.alter} chip to see the expand panel`, action: null,
    },
    {
      section: "dashboard", sectionLabel: "Dashboard",
      emoji: "🔄",
      title: `Set & Switch ${t.Front}`,
      body: `The "Switch" button (or "Set ${t.Front}" when nobody is ${t.fronting}) opens the ${t.Front} modal. Select ${t.alters}, optionally designate a primary, and save. The app also deduplicates any stale session records automatically on each save.`,
      route: "/", target: "set-front",
      look: `the "Switch" button in the top-right of the ${t.fronting} widget`, action: null,
    },
    {
      section: "dashboard", sectionLabel: "Dashboard",
      emoji: "💜",
      title: "Quick Check-In",
      body: `The Quick Check-In button opens a flow for logging emotions, symptoms, activities, and notes all at once. Any part of the ${t.system} can use it at any time. Check-in notes longer than 50 words automatically become journal entries.`,
      route: "/", target: "quick-checkin",
      look: `the red/pink "Quick Check-In" button — it's opening now`, action: "open-quick-checkin",
    },
    {
      section: "dashboard", sectionLabel: "Dashboard",
      emoji: "💬",
      title: "Status Notes",
      body: `Tap "Set a new status..." to add a system-wide status note — "at work", "in therapy", "rough night". Each save creates a new immutable timestamped record; old ones are never overwritten. The most recent appears as a preview here. Status notes show on the Timeline and in the Therapy Report.`,
      route: "/", target: "status-note",
      look: `the status note input below the ${t.alter} chips`, action: null,
    },
    {
      section: "dashboard", sectionLabel: "Dashboard",
      emoji: "🧭",
      title: "Quick Nav Menu",
      body: `Scroll down the home screen to reach the Quick Nav Menu — shortcuts to every section of the app. Toggle between grid and list layout using the icon in the header. In grid mode you can configure which pages appear and in what order from Settings → Appearance → Navigation.`,
      route: "/", target: "quick-nav",
      look: `the navigation grid or list — scroll down past the status input`, action: null,
    },
    {
      section: "dashboard", sectionLabel: "Dashboard",
      emoji: "🔔",
      title: "Notifications Bell",
      body: `The 🔔 bell in the top nav shows unread notifications — @ mentions from bulletins and journals, private messages from other ${t.alters}, and reminder alerts. Tap any notification to jump directly to the source.`,
      route: "/", target: null,
      look: `the 🔔 bell icon in the top bar — a dot appears when there are unread notifications`, action: null,
    },

    // ─── FRONTING ───────────────────────────────────────────────────────────
    {
      section: "fronting", sectionLabel: `${t.Fronting}`,
      emoji: "👥",
      title: `Set ${t.Front}ers — Search & Select`,
      body: `The Set ${t.Front}ers modal is open now. It lists all active ${t.alters}. Type in the search bar to filter by name. Tap any ${t.alter} to select them — selected ${t.alters} appear as removable chips at the top. Tap a chip's × to deselect.`,
      route: "/", target: "set-front",
      look: `the modal that just opened — try tapping an ${t.alter} to select them`, action: "open-set-front",
    },
    {
      section: "fronting", sectionLabel: `${t.Fronting}`,
      emoji: "⭐",
      title: `Primary vs Co-${t.Front}er`,
      body: `Primary is optional — everyone can co-front without designating a primary at all. If you want one, tap the ★ star beside a selected ${t.alter}'s chip. The primary shows a "Primary" label below their name on the home screen. Tap the primary chip's name again to demote them back to co-fronter.`,
      route: "/", target: null,
      look: `the ★ star that appears beside a chip after selecting an ${t.alter}`, action: "open-set-front",
    },
    {
      section: "fronting", sectionLabel: `${t.Fronting}`,
      emoji: "🔃",
      title: "Sort in the Modal",
      body: `The sort button cycles through four modes: A→Z, Z→A, Most ${t.fronting} time first, and Least ${t.fronting} time first. This is handy for finding frequently or infrequently ${t.fronting} ${t.alters} quickly without scrolling.`,
      route: "/", target: "setfront-sort",
      look: `the sort icon button highlighted in the modal's search row`, action: "open-set-front",
    },
    {
      section: "fronting", sectionLabel: `${t.Fronting}`,
      emoji: "⚡",
      title: `Triggered ${t.Switch}`,
      body: `If a ${t.switch} was triggered by something external, check "Triggered ${t.switch}?" to log the category — sensory, emotional, interpersonal, trauma reminder, physical, internal, or any custom types you've added in Settings. Add a description if helpful. This feeds the Switch Log analytics.`,
      route: "/", target: "setfront-triggered",
      look: `the "Triggered ${t.switch}?" checkbox highlighted at the bottom of the modal`, action: "open-set-front",
    },
    {
      section: "fronting", sectionLabel: `${t.Fronting}`,
      emoji: "📖",
      title: `Journal This ${t.Switch}`,
      body: `Check "Journal this ${t.switch}?" before saving to open a journal entry immediately after the ${t.switch} is logged. The entry is linked to that session and appears in the Switch Logs tab of Journals. Great for capturing context while it's fresh.`,
      route: "/", target: "setfront-journal",
      look: `the "Journal this ${t.switch}?" checkbox highlighted at the bottom of the modal`, action: "open-set-front",
    },

    // ─── ALTERS ─────────────────────────────────────────────────────────────
    {
      section: "alters", sectionLabel: t.Alters,
      emoji: "👤",
      title: `${t.Alter} Grid`,
      body: `Every member of your ${t.system} has a profile card showing their name, pronouns, role, color, and avatar. Currently ${t.fronting} ${t.alters} sort to the top with a colored border glow. Archived ${t.alters} are hidden here but accessible in Settings → Alters & Fields.`,
      route: "/Home", target: "alters-grid",
      look: `the ${t.alter} cards below the search bar`, action: null,
    },
    {
      section: "alters", sectionLabel: t.Alters,
      emoji: "🔃",
      title: "Sort Modes",
      body: `The sort button cycles through A→Z, Z→A, Most ${t.fronting} time first, and Least ${t.fronting} time first. Currently ${t.fronting} ${t.alters} always pin to the top regardless of sort mode — so the active ${t.alters} never get buried.`,
      route: "/Home", target: "alter-sort",
      look: `the sort button (arrow icon) highlighted to the right of the search bar`, action: null,
    },
    {
      section: "alters", sectionLabel: t.Alters,
      emoji: "🔲",
      title: "List & Grid View",
      body: `Toggle between a detailed list view and a compact mosaic grid using the icon next to the sort button. List view shows names, pronouns, and roles. Grid view is compact and visual — ideal for larger ${t.system}s where scanning avatars is faster.`,
      route: "/Home", target: "alter-view-toggle",
      look: `the list/grid toggle icon highlighted to the right of the sort button`, action: null,
    },
    {
      section: "alters", sectionLabel: t.Alters,
      emoji: "📁",
      title: "Groups & Folders",
      body: `${t.Alters} can be organized into groups and subgroups. The 👁 eye icon toggles the folder view. The + icon creates a new group inline. The ⚙️ gear opens the full Groups Manager. Even when folders are hidden, the group controls stay visible on the ${t.Alters} section divider.`,
      route: "/Home", target: null,
      look: `the 👁 + ⚙️ icon row — it's in the Groups header or on the ${t.Alters} section divider if groups are hidden`, action: null,
    },
    {
      section: "alters", sectionLabel: t.Alters,
      emoji: "➕",
      title: `Adding a New ${t.Alter}`,
      body: `Tap the + Add Alter button in the top-right corner to create a new profile. Set their name, pronouns, role, color, avatar, bio, and any custom fields configured in Settings → Alters & Fields. You can also connect a Simply Plural ${t.alter} profile.`,
      route: "/Home", target: null,
      look: `the "+ Add Alter" button in the top-right corner of the ${t.Alters} page header`, action: null,
    },
    {
      section: "alters", sectionLabel: t.Alters,
      emoji: "📋",
      title: `${t.Alter} Profile Tabs`,
      body: `Tap any ${t.alter} card to open their full profile. Tabs include: Profile (bio, custom fields, relationships), History (${t.fronting} sessions), Messages (private notes from other ${t.alters}), and more. Scroll the tab bar horizontally if tabs don't all fit.`,
      route: "/Home", target: null,
      look: `tap any ${t.alter} card, then look at the tabs across the top of their profile`, action: null,
    },
    {
      section: "alters", sectionLabel: t.Alters,
      emoji: "✉️",
      title: "Private Messages",
      body: `The Messages tab lets other ${t.alters} leave private notes. These notes appear on the dashboard while that ${t.alter} is ${t.fronting}. Pin a message to keep it permanently visible at the top of the home screen until explicitly dismissed.`,
      route: "/Home", target: null,
      look: `tap an ${t.alter}, switch to the "Messages" tab, and use the compose button`, action: null,
    },

    // ─── TIMELINE ───────────────────────────────────────────────────────────
    {
      section: "timeline", sectionLabel: "Timeline",
      emoji: "📅",
      title: "Infinite Timeline",
      body: `The Timeline shows everything day by day — ${t.fronting} sessions, check-ins, emotions, activities, symptoms, locations, journal entries, bulletins, and status notes. Scroll upward to load more history. It never runs out.`,
      route: "/timeline", target: "timeline-container",
      look: `the scrolling day-by-day view below the header`, action: null,
    },
    {
      section: "timeline", sectionLabel: "Timeline",
      emoji: "🔦",
      title: "Filter Toggles",
      body: `The pill buttons below the header toggle specific data types on and off — Activities, Events (journals/bulletins), Emotions, Fronting, Symptoms, Locations. Disable everything except Fronting for a clean session history, or show only Emotions to track mood visually.`,
      route: "/timeline", target: null,
      look: `the filter pill buttons (Activities, Events, Emotions…) just below the page title`, action: null,
    },
    {
      section: "timeline", sectionLabel: "Timeline",
      emoji: "📆",
      title: "Jump to Date",
      body: `Use the date input in the header to jump to any specific day instantly — perfect for reviewing a date before a therapy appointment or checking what happened on a memorable day.`,
      route: "/timeline", target: null,
      look: `the date input field and "Jump" button in the page header`, action: null,
    },
    {
      section: "timeline", sectionLabel: "Timeline",
      emoji: "📊",
      title: "Daily Tally",
      body: `Tap the "Tally" button on any day's header to open a structured daily summary — task completion, emotion counts, symptom totals, and activity durations. Great for a daily review or diary-card habit.`,
      route: "/timeline", target: null,
      look: `the "Tally" text at the right edge of any day header on the timeline`, action: null,
    },
    {
      section: "timeline", sectionLabel: "Timeline",
      emoji: "⏮️",
      title: "Retroactive Entries",
      body: `Long-press (press-and-hold on mobile) anywhere on the timeline to add a retroactive entry for that day. Log something that happened earlier, add a missed check-in, or fill in a forgotten ${t.fronting} session. Nothing is permanently lost because you forgot to log it in the moment.`,
      route: "/timeline", target: null,
      look: `long-press on any day section — a menu will appear with options to add data retroactively`, action: null,
    },

    // ─── SYSTEM MEETINGS ────────────────────────────────────────────────────
    {
      section: "meetings", sectionLabel: `${t.System} Meetings`,
      emoji: "✨",
      title: `${t.System} Meetings Overview`,
      body: `${t.System} Meetings are a structured 5-step check-in ritual for the whole ${t.system} to do together. Past meetings are listed with dates and notes. They appear in your Therapy Report, on the Timeline, and in the Meetings analytics section.`,
      route: "/system-checkin", target: null,
      look: `the list of past meetings and the "New Meeting" button at the top`, action: null,
    },
    {
      section: "meetings", sectionLabel: `${t.System} Meetings`,
      emoji: "🌿",
      title: "The 5-Step Ritual",
      body: `Each meeting has 5 steps: (1) Arrive — take a breath, (2) Notice — who's present and how the body feels, (3) Greet — acknowledge each ${t.alter} present, (4) Share — communicate what needs to be heard, (5) Closing — gratitude and a reminder. Each step has a notes field.`,
      route: "/system-checkin", target: null,
      look: `tap "New Meeting" and walk through the 5-step form`, action: null,
    },
    {
      section: "meetings", sectionLabel: `${t.System} Meetings`,
      emoji: "👁️",
      title: `${t.Alters} Present & Emotions`,
      body: `In Step 2 (Notice), mark which ${t.alters} are present — this automatically syncs the active ${t.front} session to match. Emotions logged here create an EmotionCheckIn record visible in emotion analytics. Use @ mentions in Step 3 to tag ${t.alters} by name in notes.`,
      route: "/system-checkin", target: null,
      look: `the "Who's present?" multi-select and emotions fields in Step 2 of the meeting form`, action: null,
    },

    // ─── JOURNALS ───────────────────────────────────────────────────────────
    {
      section: "journals", sectionLabel: "Journals",
      emoji: "📖",
      title: "Journals Overview",
      body: `Journals hold long-form entries from any ${t.alter}. Entries are organized into folders and subfolders — navigate via the breadcrumb at the top. The page shows folder cards and entry cards side by side, with an entry count per folder.`,
      route: "/journals", target: "journals-list",
      look: `the folder grid and journal entry cards below the header`, action: null,
    },
    {
      section: "journals", sectionLabel: "Journals",
      emoji: "✏️",
      title: "Writing an Entry",
      body: `Tap "New Entry" to open the editor. Choose the author (which ${t.alter} is writing), give it a title, write the content, and add optional tags. Entries can have group-level access controls — restrict visibility to specific ${t.alters} or groups if needed.`,
      route: "/journals", target: null,
      look: `the "New Entry" button — usually in the top-right corner`, action: null,
    },
    {
      section: "journals", sectionLabel: "Journals",
      emoji: "🏷️",
      title: "@ Mentions",
      body: `Type @ anywhere in a journal entry or bulletin to mention a specific ${t.alter} or group. A picker appears — select the ${t.alter} and they'll receive a notification in the bell menu. Great for drawing someone's attention to an entry or leaving a note directed at a specific part.`,
      route: "/journals", target: null,
      look: `open a journal entry editor and type @ to see the mention picker appear`, action: null,
    },
    {
      section: "journals", sectionLabel: "Journals",
      emoji: "🔄",
      title: "Switch Logs Tab",
      body: `The "Switch Logs" tab shows automatically-created journal entries tied to ${t.switch} events. When you check "Journal this ${t.switch}?" in the ${t.Front} modal, the entry is saved here linked to that session.`,
      route: "/journals", target: null,
      look: `the "Switch Logs" tab at the top of the Journals page`, action: null,
    },
    {
      section: "journals", sectionLabel: "Journals",
      emoji: "🔍",
      title: "Filters & Search",
      body: `Filter journal entries by author (which ${t.alter} wrote it), by tags, or search full text. The ${t.fronter} view toggle shows only entries written while the currently active ${t.alter} was ${t.fronting}.`,
      route: "/journals", target: null,
      look: `the search bar, author dropdown, and tag filter chips just below the tab bar`, action: null,
    },

    // ─── BULLETIN BOARD ─────────────────────────────────────────────────────
    {
      section: "bulletin", sectionLabel: "Bulletin Board",
      emoji: "📋",
      title: "Bulletin Board",
      body: `The Bulletin Board is for ${t.system}-wide messages — announcements, reminders, notes between ${t.alters}. Unlike private messages (which go to one specific ${t.alter}), bulletins are visible to the whole ${t.system} on the home screen and Timeline.`,
      route: "/", target: "bulletin-list",
      look: `the Bulletin Board section on the home screen — scroll down past the Quick Nav`, action: null,
    },
    {
      section: "bulletin", sectionLabel: "Bulletin Board",
      emoji: "💬",
      title: "@ Mentions & Comments",
      body: `Use @ in a bulletin to notify a specific ${t.alter} — they'll see it in the notification bell. Tap any bulletin to expand it and see the comment section. Other ${t.alters} can reply, creating threaded conversations within your ${t.system}.`,
      route: "/", target: null,
      look: `tap any bulletin to expand it and see the comment field at the bottom`, action: null,
    },

    // ─── TASKS & TO-DO ──────────────────────────────────────────────────────
    {
      section: "tasks", sectionLabel: "Tasks & To-Do",
      emoji: "✅",
      title: "Daily Tasks & Habits",
      body: `Daily Tasks are recurring habits organized by frequency — daily, weekly, monthly, and yearly. Each task has a streak counter tracking consecutive completions. Use these for medication, journaling, therapy homework, meals, or any regular self-care routine.`,
      route: "/tasks", target: "tasks-list",
      look: `the task list with frequency tabs (Daily, Weekly, Monthly, Yearly)`, action: null,
    },
    {
      section: "tasks", sectionLabel: "Tasks & To-Do",
      emoji: "⏮️",
      title: "Retroactive Task Completion",
      body: `Missed logging a task? Retroactively mark tasks complete from the Timeline's Tally panel on any past day. Streaks are computed from logged completions — filling in past days keeps your history accurate.`,
      route: "/tasks", target: null,
      look: `open the Timeline, tap "Tally" on any past day, and find the Tasks section inside the panel`, action: null,
    },
    {
      section: "tasks", sectionLabel: "Tasks & To-Do",
      emoji: "📝",
      title: "To-Do List",
      body: `The To-Do List is separate from recurring habits — it's for one-off tasks and ongoing items without a schedule. Add items, check them off when done, remove when complete. Great for therapy goals, errands, or anything you need to track but not repeat.`,
      route: "/todo", target: null,
      look: `the To-Do List page — accessible from the nav menu or Quick Nav grid`, action: null,
    },

    // ─── ACTIVITIES ─────────────────────────────────────────────────────────
    {
      section: "activities", sectionLabel: "Activities",
      emoji: "🏃",
      title: "Activity Tracking",
      body: `Log any activity — exercise, creative work, social interaction, self-care — with a category, duration, and optional notes. Activities appear on the Timeline, in the Therapy Report, and in the Activities analytics section.`,
      route: "/activities", target: "activities-log",
      look: `the activity list and the "Log Activity" button`, action: null,
    },
    {
      section: "activities", sectionLabel: "Activities",
      emoji: "⏱️",
      title: "Categories & Analytics",
      body: `Each activity has a category and a duration in minutes. The Activities analytics section breaks this down into frequency charts, time-spent-per-category trends, and an ${t.Alter} × Activity matrix showing which ${t.alters} tend to do which activities.`,
      route: "/activities", target: null,
      look: `the category dropdown and duration field when logging — then check Analytics → Activities`, action: null,
    },

    // ─── POLLS ──────────────────────────────────────────────────────────────
    {
      section: "polls", sectionLabel: "Polls",
      emoji: "🗳️",
      title: "Polls — System Voting",
      body: `Polls let the ${t.system} vote on decisions together — what to eat, which coping strategy to try, or any question you want group input on. Each ${t.alter} casts one vote. Results show as colored bars with ${t.alter} avatars indicating who voted for what.`,
      route: "/polls", target: null,
      look: `the Polls page — the list of open and closed polls`, action: null,
    },
    {
      section: "polls", sectionLabel: "Polls",
      emoji: "✅",
      title: "Creating & Voting",
      body: `Tap "Create" to make a new poll with a question and 2–4 options. Select who is voting from the "Voting as" dropdown, then tap your choice. The creator can close the poll when a decision is made. Closed polls are kept for reference and still show the full vote breakdown.`,
      route: "/polls", target: null,
      look: `the Create button in the header and the voting interface inside any open poll`, action: null,
    },

    // ─── REMINDERS ──────────────────────────────────────────────────────────
    {
      section: "reminders", sectionLabel: "Reminders",
      emoji: "🔔",
      title: "Reminders Overview",
      body: `Reminders are scheduled notifications that deep-link into the app. A "Log check-in" reminder opens the Quick Check-In modal directly. A "Set ${t.front}" reminder opens the ${t.Front} modal. Schedules can be one-time, daily, weekly, or monthly.`,
      route: "/reminders", target: "reminders-list",
      look: `the Reminders page — check the Manage tab for your active reminder rules`, action: null,
    },
    {
      section: "reminders", sectionLabel: "Reminders",
      emoji: "⏰",
      title: "Creating a Reminder",
      body: `Tap "New Reminder" on the Manage tab to set up a rule. Give it a title, choose a schedule, set start and optional end dates, and pick what action the notification triggers when tapped. Custom trigger types you've added in Settings appear as options here too.`,
      route: "/reminders", target: null,
      look: `the "New Reminder" button on the Manage tab`, action: null,
    },
    {
      section: "reminders", sectionLabel: "Reminders",
      emoji: "📬",
      title: "Inbox — Act on Fired Reminders",
      body: `The Inbox tab collects all reminders that have fired but haven't been acted on. Tap the action button to do what the reminder suggests, or snooze it to see it again later. Dismissed reminders disappear from the inbox.`,
      route: "/reminders", target: null,
      look: `the "Inbox" tab on the Reminders page`, action: null,
    },

    // ─── ANALYTICS ──────────────────────────────────────────────────────────
    {
      section: "analytics", sectionLabel: "Analytics",
      emoji: "📊",
      title: "Analytics — 12 Sections",
      body: `Analytics breaks your ${t.system}'s data into 12 specialized sections: System Members, Activities, Emotions, Symptoms, Daily Log, Sleep, Journals, Co-${t.fronting}, Switch Logs, System Meetings, Patterns & Insights, and Locations. Tap any card on the landing grid to dive in.`,
      route: "/analytics", target: "analytics-charts",
      look: `the analytics section grid — each card is a different analysis area`, action: null,
    },
    {
      section: "analytics", sectionLabel: "Analytics",
      emoji: "📅",
      title: "Date Range Controls",
      body: `Every analytics section has date range presets — 7 days, 30 days, 90 days, 1 year, All Time, or a custom range. Narrowing the range reveals recent patterns. "All Time" shows everything since you started. Choose "Custom" to pick exact start and end dates.`,
      route: "/analytics", target: null,
      look: `the date range pill buttons (7d, 30d, 90d, 1y, All Time, Custom) near the top of any analytics section`, action: null,
    },
    {
      section: "analytics", sectionLabel: "Analytics",
      emoji: "👥",
      title: "System Members",
      body: `System Members ranks ${t.alters} by ${t.fronting} time with stat modes: Total, Primary-only, Co-${t.front}-only, Average session length, Max, Min, and Count. The Time of Day tab shows a heatmap of when each ${t.alter} tends to front by hour of day.`,
      route: "/analytics", target: null,
      look: `tap "System Members" on the analytics grid — explore stat modes and the Time of Day heatmap`, action: null,
    },
    {
      section: "analytics", sectionLabel: "Analytics",
      emoji: "💜",
      title: "Activities, Emotions & Symptoms",
      body: `Activities analytics shows time-per-category trends and an ${t.Alter} × Activity matrix. Emotions shows mood trends. Symptoms tracks recurring patterns and can be correlated with specific ${t.alters} or time periods. The more you log, the richer these charts become.`,
      route: "/analytics", target: null,
      look: `tap Activities, Emotions, or Symptoms on the analytics grid`, action: null,
    },
    {
      section: "analytics", sectionLabel: "Analytics",
      emoji: "🔀",
      title: `Co-${t.Fronting} & Switch Logs`,
      body: `Co-${t.fronting} analytics shows which ${t.alters} tend to front together — a co-occurrence map of your ${t.system}'s dynamics. Switch Log analytics breaks down triggered ${t.switches} by category and shows patterns in what tends to cause ${t.switches} over time.`,
      route: "/analytics", target: null,
      look: `tap "Co-${t.fronting}" or "Switch Logs" on the analytics grid`, action: null,
    },
    {
      section: "analytics", sectionLabel: "Analytics",
      emoji: "🔍",
      title: "Patterns & Insights",
      body: `Patterns & Insights cross-references multiple data sources to surface correlations — which activities follow certain emotions, whether specific ${t.alters} fronting correlates with symptom spikes. The more you log, the more meaningful this section becomes.`,
      route: "/analytics", target: null,
      look: `tap "Patterns & Insights" on the analytics grid`, action: null,
    },

    // ─── SYSTEM MAP ─────────────────────────────────────────────────────────
    {
      section: "systemmap", sectionLabel: `${t.System} Map`,
      emoji: "🗺️",
      title: `${t.System} Map Overview`,
      body: `The ${t.System} Map has two tabs: Analytics Map (circles auto-sized by ${t.fronting} time and arranged by co-${t.fronting} overlap) and Inner World Canvas (freeform layout for your inner world with custom drawn relationships). Both have a Relationships panel below.`,
      route: "/system-map", target: "system-map-canvas",
      look: `the two tabs at the top — "Analytics" and "Inner World"`, action: null,
    },
    {
      section: "systemmap", sectionLabel: `${t.System} Map`,
      emoji: "🌌",
      title: "Inner World Canvas",
      body: `In the Inner World Canvas tab, drag ${t.alter} nodes to position them freely. Double-click between two ${t.alters} to draw a relationship line. Tap an ${t.alter} node to highlight their connections. Arrange it however your ${t.system} experiences the inner world — no rules apply here.`,
      route: "/system-map", target: null,
      look: `switch to the "Inner World" tab and try dragging an ${t.alter} circle`, action: null,
    },
    {
      section: "systemmap", sectionLabel: `${t.System} Map`,
      emoji: "🔗",
      title: "Relationships Panel",
      body: `Below both map tabs, the Relationships panel lists all defined ${t.alter} relationships. Add relationships with types like "protector of", "split from", "caretaker for", or any custom types defined in Settings → Alters & Fields → Relationship Types.`,
      route: "/system-map", target: null,
      look: `scroll below the map canvas to find the Relationships panel`, action: null,
    },

    // ─── GROUNDING & SUPPORT ────────────────────────────────────────────────
    {
      section: "grounding", sectionLabel: "Support & Grounding",
      emoji: "🫧",
      title: "Support Tab — Three Entry Points",
      body: `The Support tab has three starting paths: Browse all techniques, Help me figure out what I need (guided State Check), and Guided breathing. There's also a 🫧 bubble button in the corner of every screen for instant access from anywhere in the app — even mid-crisis.`,
      route: "/grounding", target: "grounding-content",
      look: `the three large action buttons on the Support tab, and the 🫧 floating button`, action: null,
    },
    {
      section: "grounding", sectionLabel: "Support & Grounding",
      emoji: "🧭",
      title: "State Check Flow",
      body: `"Help me figure out what I need" guides you through a short check-in about your current emotional and body state. Based on your answers, the app suggests three tailored grounding techniques plus a breathing exercise. If you select a crisis state, crisis resources appear prominently.`,
      route: "/grounding", target: null,
      look: `tap "Help me figure out what I need" on the Support tab`, action: null,
    },
    {
      section: "grounding", sectionLabel: "Support & Grounding",
      emoji: "⭐",
      title: "Techniques — Browse, Favorite & Rate",
      body: `Browse all techniques by category — mindfulness, grounding, imagery, breathwork, somatic, and more. Tap any card to open the guided view with step-by-step instructions. Rate it 1–5 stars, add personal notes, and toggle it as a favorite. Favorites always appear at the top.`,
      route: "/grounding", target: null,
      look: `tap "Browse all techniques" then tap any technique card to open the guided view`, action: null,
    },
    {
      section: "grounding", sectionLabel: "Support & Grounding",
      emoji: "🌬️",
      title: "Guided Breathing",
      body: `Breathing exercises feature animated visual cues guiding inhale, hold, and exhale phases. Multiple patterns are available — box breathing, 4-7-8, extended exhale, and more. Each exercise has a configurable duration and animation that syncs with your rhythm.`,
      route: "/grounding", target: null,
      look: `tap "Guided breathing" on the Support tab to see the technique list and start an exercise`, action: null,
    },
    {
      section: "grounding", sectionLabel: "Support & Grounding",
      emoji: "🛡️",
      title: "Safety Plan",
      body: `Your Safety Plan contains Warning Signs (earliest, escalating, emergency), Coping Cards, and Window of Tolerance levels (calm → crisis). Build it through the Learn tab's curriculum (Module 4). Access it anytime from the Support tab footer or the navigation menu.`,
      route: "/safety-plan", target: null,
      look: `the Safety Plan page — accessible from the Support tab footer or the nav menu`, action: null,
    },
    {
      section: "grounding", sectionLabel: "Support & Grounding",
      emoji: "📚",
      title: "Learn — Trauma-Informed Curriculum",
      body: `The Learn tab has 10 modules covering dissociation education, grounding theory, emotional regulation, window of tolerance, safety planning, inner child work, and more. Each module has multiple lessons with "Try Now" buttons that launch the relevant technique directly.`,
      route: "/grounding", target: null,
      look: `switch to the "Learn" tab on the Grounding page`, action: null,
    },

    // ─── THERAPY REPORT ─────────────────────────────────────────────────────
    {
      section: "therapy", sectionLabel: "Therapy Report",
      emoji: "📄",
      title: "Therapy Report Builder",
      body: `The Therapy Report generates a structured document of your ${t.system}'s activity over any date range — bring it to therapy to bridge the memory/amnesia gap between sessions. Your therapist sees ${t.fronting} patterns, emotions, symptoms, and activities even across memory barriers.`,
      route: "/therapy-report", target: "therapy-report-builder",
      look: `the report builder form — date range at top, section checkboxes below`, action: null,
    },
    {
      section: "therapy", sectionLabel: "Therapy Report",
      emoji: "⚙️",
      title: "Selecting Sections & Customizing",
      body: `Choose which sections to include: Overview, ${t.Fronting}, Emotions, Status Notes, Symptoms, Activities, Journals, Diary, Bulletins, System Meetings, Tasks, Patterns, and an ${t.Alter} Appendix. Add a therapist name, confidentiality notice, cover page, and cover note.`,
      route: "/therapy-report", target: null,
      look: `the section checkboxes and customization fields in the report builder`, action: null,
    },
    {
      section: "therapy", sectionLabel: "Therapy Report",
      emoji: "💾",
      title: "Export & Templates",
      body: `Export as a downloadable PDF or plain text for copy-pasting. Save your current configuration as a template so next session you just load it and click Generate — zero setup each time. Templates remember section selections, date range, therapist name, and all options.`,
      route: "/therapy-report", target: null,
      look: `the PDF/Text toggle, Generate button, and Templates dropdown at the bottom of the builder`, action: null,
    },

    // ─── SETTINGS ───────────────────────────────────────────────────────────
    {
      section: "settings", sectionLabel: "Settings",
      emoji: "⚙️",
      title: "Settings Overview",
      body: `Settings has 8 collapsible sections. Use the quick-nav buttons at the top to jump to any section without scrolling. Each section expands to reveal its controls — tap the header again to collapse it.`,
      route: "/settings", target: "settings-content",
      look: `the quick-nav button row at the top and the 8 expandable section headers`, action: null,
    },
    {
      section: "settings", sectionLabel: "Settings",
      emoji: "✏️",
      title: "System Name & Terminology",
      body: `Set your ${t.system}'s name in the System section. In Terminology Settings, customize every user-facing word — "${t.system}", "${t.alter}", "${t.fronting}", "${t.switch}", and more. The entire app reflects your chosen terms immediately, including navigation labels, tooltips, and this very tour.`,
      route: "/settings", target: null,
      look: `expand the "System" section — system name input and Terminology Settings are inside`, action: null,
    },
    {
      section: "settings", sectionLabel: "Settings",
      emoji: "🎨",
      title: "Appearance & Navigation",
      body: `Appearance includes theme selection and NavigationSettings — customize which pages appear in the top nav, mobile bottom bar, and dashboard grid, and in what order. The Dashboard Grid sub-section also controls the column count (2, 3, or 4 columns).`,
      route: "/settings", target: null,
      look: `expand "Appearance" — look for the Navigation card and the column count selector inside`, action: null,
    },
    {
      section: "settings", sectionLabel: "Settings",
      emoji: "🧩",
      title: "Alters & Fields",
      body: `Create custom fields that appear on every ${t.alter} profile (text, number, toggle, or dropdown types). Manage custom relationship types used in the ${t.System} Map. The Archived ${t.Alters} Manager lets you view and restore archived profiles.`,
      route: "/settings", target: null,
      look: `expand "Alters & Fields" — custom fields editor, relationship types, and archived ${t.alters} manager`, action: null,
    },
    {
      section: "settings", sectionLabel: "Settings",
      emoji: "💜",
      title: "Check-In & Tracking",
      body: `Configure what the Quick Check-In shows and in what order using the Check-In Manager. Create custom emotion labels and custom trigger type categories (with emoji and hints) that appear in the Set ${t.Front}ers modal's triggered ${t.switch} section.`,
      route: "/settings", target: null,
      look: `expand "Check-In & Tracking" — Check-In Manager link, custom emotions, and custom trigger types`, action: null,
    },
    {
      section: "settings", sectionLabel: "Settings",
      emoji: "🔒",
      title: "Data & Privacy",
      body: `Enable local-only mode to keep all data on-device with AES-256 encryption — nothing is sent to any server. Export a full JSON backup of all your data, or import one to restore. Connect your Simply Plural account to sync ${t.alter} profiles. All data is always yours and fully exportable.`,
      route: "/settings", target: null,
      look: `expand "Data & Privacy" — local mode toggle, backup/restore buttons, and Simply Plural connect`, action: null,
    },

    // ─── DONE ───────────────────────────────────────────────────────────────
    {
      section: "done", sectionLabel: "Done!",
      emoji: "💜",
      title: "You're all set! 🎉",
      body: `You've explored every page and feature of Oceans Symphony. Everything here is designed with dissociative ${t.system}s in mind — log at your own pace, and nothing forgotten in the moment is lost forever. This tour is always available from the Guide button. Take good care. 💜`,
      route: null, target: null, look: null, action: null,
    },
  ];
}

export default function FeatureTour({ onClose }) {
  const navigate = useNavigate();
  const t = useTerms();
  const steps = useMemo(() => buildSteps(t), [t]);
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

  const applyHighlight = useCallback((target) => {
    document.querySelectorAll("[data-tour-active]").forEach(el => {
      el.removeAttribute("data-tour-active");
      el.style.removeProperty("outline");
      el.style.removeProperty("outline-offset");
      el.style.removeProperty("border-radius");
      el.style.removeProperty("position");
      el.style.removeProperty("z-index");
    });
    if (!target) return;
    const el = document.querySelector(`[data-tour="${target}"]`);
    if (!el) return;
    el.setAttribute("data-tour-active", "1");
    el.style.outline = "3px solid hsl(var(--primary))";
    el.style.outlineOffset = "4px";
    el.style.borderRadius = "8px";
    el.style.position = "relative";
    el.style.zIndex = "49";
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  const goTo = useCallback((newStep) => {
    const s = steps[newStep];
    if (s.route) navigate(s.route);
    // If this step should open a modal/panel, dispatch after route settles
    if (s.action) {
      setTimeout(() => window.dispatchEvent(new CustomEvent(s.action)), 350);
    }
    // Highlight after route + optional modal animation
    const highlightDelay = s.action ? 750 : 400;
    setTimeout(() => applyHighlight(s.target), highlightDelay);
    setStep(newStep);
  }, [steps, navigate, applyHighlight]);

  useEffect(() => {
    window.__tourActive = true;
    goTo(0);
    return () => {
      window.__tourActive = false;
      document.querySelectorAll("[data-tour-active]").forEach(el => {
        el.removeAttribute("data-tour-active");
        el.style.removeProperty("outline");
        el.style.removeProperty("outline-offset");
        el.style.removeProperty("border-radius");
        el.style.removeProperty("position");
        el.style.removeProperty("z-index");
      });
    };
  }, []);

  const handleClose = useCallback(() => {
    window.__tourActive = false;
    onClose();
  }, [onClose]);

  return (
    <>
      {/* Dim overlay — sits below modals so modals still look natural */}
      <div className="fixed inset-0 z-40 bg-black/30 pointer-events-none" />

      {/* Tour card — z-[100] to float above any modal dialog */}
      <div className="fixed bottom-16 left-0 right-0 z-[100] px-3 pb-2">
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
    </>
  );
}
