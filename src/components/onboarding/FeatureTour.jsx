import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { isDesktop } from "@/lib/platform";
import { pickPrimarySystemSettings } from "@/lib/systemSettingsSingleton";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { UI_V2_ENABLED } from "@/lib/featureFlags";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X, ChevronLeft, ChevronRight, MapPin, ChevronsRight } from "lucide-react";
import { useTerms } from "@/lib/useTerms";
import { base44 } from "@/api/base44Client";
import { markTourCompletedToday } from "@/lib/dailyTaskSystem";
import AccessibilityFab from "@/components/accessibility/AccessibilityFab";
import { useExperimentalOn } from "@/lib/experimentalFeatures";

// alterId — ID of the alter whose profile to navigate to during profile steps.
// tourAlterWasCreated — true if we created a temporary demo alter.
export function buildSteps(t, alterId = null, tourAlterWasCreated = false, uiV2On = false) {
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
    {
      section: "welcome", sectionLabel: "Welcome",
      emoji: "♿",
      title: "Accessibility, anytime",
      body: `See the "Accessibility" button in the corner? It's here through setup and this whole tour. Tap it any time to turn on accessibility (low-vision) mode, bump up the text size, or switch on high contrast — handy if the text is hard to read right now. Everything's also in Settings → Accessibility later.`,
      route: "/", target: null,
      look: `the floating "Accessibility" button in the corner of the screen`, action: null,
    },

    // ─── Classic-hosted v2 bars (classic look only — v2 has its own) ────────
    ...(!uiV2On ? [
      {
        section: "welcome", sectionLabel: "Welcome",
        emoji: "⚡",
        title: "Quick bars on the classic look",
        body: `Just above the bottom tab bar sits a slim handle — tap or swipe it up to unfold the quick-action bar: one-tap keys for a check-in, a note, starting an activity or symptom, a task, or setting ${t.front}. Your pinned ${t.alters} can float there as a bar too, and a new top bar (${t.system} name, who's ${t.fronting}, clock, search, notifications) can replace this header. Switch each one on or off in the setup guide; everything else about them — position, size, look, what's on them — is in Display options → Bars (also Settings → Appearance → Edit bars…). On a computer, "Show on wide screens" there puts the same bars beside the sidebar — each keeps its own display, so quick actions can float as a bubble and the ${t.alters} bar can run down the side.`,
        route: "/", target: null,
        look: `the slim dash-and-chevron handle just above the bottom tab bar`, action: null,
      },
      {
        section: "welcome", sectionLabel: "Welcome",
        emoji: "🧩",
        title: "The widget board, one swipe away",
        body: `Swipe LEFT anywhere on this home screen — or tap the grid button next to Help, top-right — to slide onto the widget board: the buildable home made of live widgets. It's the same board the new UI uses, so your pages, layouts and looks carry over exactly. Swipe right on its first page to come back, and Settings → Appearance → Layout picks which of the two greets you when the app opens. Your boards follow you to your other devices with device sync. In edit mode each page has "Show as": Auto fits whatever screen it's on, or pick Phone, Tablet or Desktop to keep that page's shape everywhere — handy for building your phone page on a computer.`,
        route: "/", target: null,
        look: `the small grid button beside the Help icon at the top-right of the home screen`, action: null,
      },
      {
        section: "welcome", sectionLabel: "Welcome",
        emoji: "✏️",
        title: "Edit your home screen in place",
        body: `Your home screen edits exactly like the widget board, because it IS the same canvas. Press and hold an empty spot — or open the ⚙ menu (top-right) and choose "Edit home screen". In edit mode: hold a card until it lifts, then drag it anywhere or onto "Drop to remove"; hold an edge to resize; the apps button opens the drawer with an "Add widget" tab (every classic card plus the board's whole catalogue); each card's gear opens its options, modes and looks. "Reset to default" lives in Settings → Appearance → Layout, and offers to keep your arrangement on the widget board first. The same ⚙ menu's "Edit widget board" edits the board instead.`,
        route: "/", target: null,
        look: `the ⚙ cog in the top-right — "Edit home screen" is the first item`, action: null,
      },
    ] : []),

    // ─── NEW UI (only when the ui_v2 toggle is on) ──────────────────────────
    ...(uiV2On ? [
      {
        section: "newui", sectionLabel: "New UI",
        emoji: "🧪",
        title: "Your home screen is a widget board",
        body: `With the new UI on, the home screen is made of widgets — building blocks for every part of the app. Each one shows or does exactly one thing: who's ${t.fronting}, today's plans, a journal you can write straight into, a chat channel, a breathing circle. You choose which widgets exist, where they sit, and how they look.`,
        route: "/", target: null,
        look: `your widgets on the home screen — every block is one you can move, resize, restyle or remove`, action: null,
      },
      {
        section: "newui", sectionLabel: "New UI",
        emoji: "✏️",
        title: "Editing the home screen",
        body: `Press and hold an empty spot on the home screen — or open the cog menu (top-right) and choose "Edit home screen". In edit mode: hold a widget until it lifts, then drag — to a new spot, or onto "Drop to remove" to delete it. Hold an edge to resize. Hold and let go (without dragging) to start SELECTING — tap more widgets to add them, then restyle or "Edit all" so one change lands on every selected widget; a Deselect button ends it. Widgets are inert while editing, so moving one can't accidentally trigger it.`,
        route: "/", target: null,
        look: `the ⚙ cog in the top-right — "Edit home screen" is the first item`, action: null,
      },
      {
        section: "newui", sectionLabel: "New UI",
        emoji: "➕",
        title: "Adding widgets",
        body: `In edit mode, the apps button (top-left) opens the drawer with an "Add widget" tab: search at the top, then chips that sort widgets by what they're for: Right now, Log, Plan & track, Write & talk, ${t.Alters} & map, Calm, Look back and Page pieces. Each widget is one row with a + to add it straight away. Tap the row for a live preview with your real data, pick Minimal, Normal or Expanded, try a style, and add it already set up — or hold the row and drag it to the spot you want.`,
        route: "/", target: null,
        look: `the app-logo button in the top-left — in edit mode its drawer gains the "Add widget" tab`, action: null,
      },
      {
        section: "newui", sectionLabel: "New UI",
        emoji: "🔎",
        title: "Minimal, normal, expanded",
        body: `Most widgets read at three depths, switched in the widget's options. Minimal is text — the answer, nothing else. Normal is the real thing: the activity week grid, the timeline, your day summary, the check-in log. Expanded adds the actions that belong to it — on the activity grids that means the tracker's own gestures, so you can drag a time range on the home screen and log or plan it there.`,
        route: "/", target: null,
        look: `a widget's gear (in edit mode) → the Minimal / Normal / Expanded switch at the top`, action: null,
      },
      {
        section: "newui", sectionLabel: "New UI",
        emoji: "🎨",
        title: "Every widget's look is yours",
        body: `The gear on any widget (in edit mode) opens its options as five tabs. Content: its name (type one to replace its heading, or switch the heading off), its display mode, then what it shows. Text: body or headings, each with font, size, style and colour. Shape: size, spacing, alignment, corners, outline and shadow. Colour: highlight, background, gradient, picture and blur. Styles: ready-made and saved looks, "Save as a style…", "Apply to other widgets…" and your own CSS. Every size is a slider with its number beside it (tap the number to type), a greyed value means the widget inherits it, × clears one value, and each tab has its own Reset. Move is in the header; Reset and Remove are under ⋯. The sheet opens at half height so you can watch the widget change.`,
        route: "/", target: null,
        look: `the small gear that appears on each widget while editing`, action: null,
      },
      {
        section: "newui", sectionLabel: "New UI",
        emoji: "⚡",
        title: "Quick actions bar & the support anchor",
        body: `The quick-action buttons live behind the right half of the split handle above the bottom bar — the left half folds the pinned ${t.alters} bar in and out (or the actions can be a floating bar or bubble — hold and drag the bubble to park it on any edge). Capture a check-in, note, activity, symptom, task or plan from anywhere. The Support anchor is always among them — one tap to grounding, from any page. Prefer it the other way round? Display options → Bars → Quick actions bar → "Swap with bottom bar" keeps the keys fixed at the bottom and folds the page tabs behind the handle instead.`,
        route: "/", target: null,
        look: `the split handle above the bottom bar — tap or swipe up its right half for quick actions, its left half for the pinned ${t.alters}`, action: null,
      },
      {
        section: "newui", sectionLabel: "New UI",
        emoji: "🎚️",
        title: "Every bar in one place",
        body: `Display options → Bars holds all of them — pick Top bar, Bottom tabs, Quick actions bar, Pinned ${t.alters} bar or Side rail at the top of the tab, and each is laid out the same way: Show, Position, Size, Look, What's on it, with a slider for every size. Any bar's ⚙ gear opens it right at that bar, and the undo button walks bar changes back too. Bars belong to this device, so your phone and computer can each have their own.`,
        route: "/", target: null,
        look: `Display options (the sliders button in the top bar's menu) → Bars`, action: null,
      },
    ] : []),

    // ─── DASHBOARD ──────────────────────────────────────────────────────────
    {
      section: "dashboard", sectionLabel: "Dashboard",
      emoji: "🔄",
      title: "Pull down to refresh",
      body: `On a phone, pull down from the top of any page — the home screen included — and let go to refresh everything on it. Handy after restoring a backup, or when a friend's ${t.front} feels a beat behind.`,
      route: "/", target: null,
      look: `nothing to find — just drag down from the top of the page and release`, action: null,
    },
    {
      section: "dashboard", sectionLabel: "Dashboard",
      emoji: "📥",
      title: "Notifications Inbox",
      body: `The inbox icon (📥) in the top-right of the header opens your notifications — @ mentions from bulletins, messages, and other ${t.alters}, plus any reminder alerts that have fired. It's deliberately a different icon from the bell used for reminders elsewhere so the two don't get confused. A coloured dot appears when there are unread items; tap any notification in the panel to jump directly to its source.`,
      route: "/", target: null,
      look: `the 📥 inbox icon in the top-right of the header — a dot appears when you have unread notifications`, action: null,
    },
    {
      section: "dashboard", sectionLabel: "Dashboard",
      emoji: "☰",
      classicOnly: true,
      title: "Sidebar — opens from the logo",
      body: `Tap the Oceans Symphony logo in the top-left of the header to slide open the sidebar. Every page in the app is reachable from there, grouped by what they do (Tracking, Journal & Content, Tools, Analytics). Prefer tiles? The grid icon in the sidebar header switches to the app grid — and the list icon in the app grid's header switches back. The grocery list / privacy cover lives in the sidebar header too. Choose which pages it lists, and their order within each group, in Settings → Appearance → Layout → Sidebar — each device keeps its own. The sidebar closes automatically as soon as you navigate, so you don't need to dismiss it manually.`,
      route: "/", target: null,
      look: `the Oceans Symphony logo in the top-left of the header — tap it to open the full navigation drawer`, action: null,
    },
    {
      section: "dashboard", sectionLabel: "Dashboard",
      emoji: "🛒",
      title: "Grocery list — also a privacy cover",
      body: `The cart icon in the sidebar opens what looks like a normal grocery list — and works as one. It's also a one-tap privacy screen for those moments when someone glances at your phone. Triple-tap anywhere in the app to open it instantly. Tap the list name in the header to switch lists or create new ones (wish lists, hardware, anywhere). Each new list can be marked "Available when the app is locked" if you want it accessible from the unlock screen — handy when you're shopping and don't want to enter your password every time. Check off items to log when you bought them; tap again to mark "ran out" so you can see when the broccoli in the fridge actually came from. Star items to save them as frequent purchases. If you have encryption turned on, the lock icon in the header means closing the list also clears your session. It takes notes too: the ✎ button starts a fresh note that saves as you type, with one-tap timestamps, camera/photo attachments, and voice input where the platform has it — and "Notes open to" picks whether you land on your last note or a fresh one. Pick "Flash cards" as a new list's type for a study deck: each card has a front and back (text, a photo, or both), and Study shuffles them — tap to flip, then "Again" or "Got it".`,
      route: "/", target: "grocery-list-button",
      look: `the 🛒 cart icon in the sidebar (tap the ☰ menu top-left to see it). Triple-tap anywhere to open it without using the icon.`, action: null,
    },

    // ─── FRONTING ───────────────────────────────────────────────────────────
    {
      section: "fronting", sectionLabel: `${t.Fronting}`,
      emoji: "👥",
      title: `Set ${t.Fronters} — Select`,
      body: `The Set ${t.Fronters} window is now open. Everyone currently ${t.fronting} appears as a card at the top with their avatar, pronouns, and their ${t.fronting} level — × removes them, and tapping any ${t.alter} in the list below adds them. Levels default to ${t.Fronting} / Co-${t.fronting}; add more (like Observing) in Settings → Tracking setup. Whoever sits at the topmost level leads automatically.`,
      // Target left null so the trigger button (now hidden behind the modal)
      // doesn't drive the spotlight or flip the tour card to the top.
      route: "/", target: null,
      look: `the modal — try tapping an ${t.alter} to select them and see their chip appear`, action: "open-set-front",
    },
    {
      section: "fronting", sectionLabel: `${t.Fronting}`,
      emoji: "🔃",
      title: `Sort ${t.Alters} in Modal`,
      body: `The sort button in the search row cycles through four modes: A→Z, Z→A, Most ${t.fronting} time first, and Least ${t.fronting} time first. The view buttons beside it switch between list, avatar grid, and by-group tree. Already-selected ${t.alters} live in the cards above, so the list only shows who can still be added.`,
      route: "/", target: "setfront-sort",
      look: `the highlighted sort icon button in the modal's search bar row`, action: "open-set-front",
    },
    {
      section: "fronting", sectionLabel: `${t.Fronting}`,
      emoji: "⚡",
      title: `Triggered ${t.Switch}`,
      body: `If the ${t.switch} was triggered by something external, check "Triggered ${t.switch}?" to log what caused it — sensory overload, emotional spike, interpersonal, trauma reminder, physical, internal conflict, or any custom types you've added in Settings. This data feeds the ${t.Switch} Log analytics.`,
      route: "/", target: "setfront-triggered",
      look: `the highlighted "Triggered ${t.switch}?" checkbox at the bottom of the modal`, action: "open-set-front",
    },
    {
      section: "fronting", sectionLabel: `${t.Fronting}`,
      emoji: "📖",
      title: `Journal This ${t.Switch}`,
      body: `Check "Journal this ${t.switch}?" before saving to automatically open a journal entry after the ${t.switch} is logged. The entry is linked to the session and appears in the ${t.Switch} Logs tab of Journals. Great for capturing why the ${t.switch} happened while it's still fresh.`,
      route: "/", target: "setfront-journal",
      look: `the highlighted "Journal this ${t.switch}?" checkbox at the bottom of the modal`, action: "open-set-front",
    },

    // ─── ALTERS ─────────────────────────────────────────────────────────────
    {
      section: "alters", sectionLabel: t.Alters,
      emoji: "🪪",
      title: `Your ${t.System}'s Profile`,
      body: `The top of the ${t.alters} page is your ${t.system}'s own profile — set a name, avatar, formatted bio, and a banner image in Settings → ${t.System} Profile. The banner shows edge-to-edge behind your pages (you choose its height, position, and which pages it appears on). Tap "About this ${t.system}" to expand the bio.`,
      route: "/Home", target: "system-profile",
      look: `the highlighted header at the top of the ${t.alters} page`, action: null,
    },
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
      emoji: "📌",
      title: `Pinned ${t.Alters}`,
      body: `Tap the Pin button at the top-left of any ${t.alter}'s profile and they'll appear in this quick-access gallery (and on the dashboard). Pinning is just a shortcut — it doesn't move them out of their group or the main list. Press and hold a chip for the ${t.fronting} level rail (drag past the end to remove them from ${t.front}); tap it for its menu. The ⚙ gear opens Display options → Bars → Pinned ${t.alters} bar: who's pinned, their order, names and size, shared with the pinned bar.`,
      route: "/Home", target: "pinned-alters",
      look: `the Pinned row at the top of the ${t.alters} page — only shows once you've pinned someone`, action: null,
    },
    {
      section: "alters", sectionLabel: t.Alters,
      emoji: "🌫️",
      title: "New presences",
      body: `Sensed someone you can't quite place? Record a "presence" — even just a colour or a vibe — here or via the "New presence" tab when you set ${t.fronters}. This page flags when a presence reoccurs or might already be a known ${t.alter}.`,
      route: "/presences", target: "new-presences",
      look: `the New Presences page`, action: null,
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
      body: `The view toggle cycles through list and 2–5 column grid modes on each tap. List view shows name, pronouns, and role; grid view is avatar-focused and compact. The camera icon next to it cycles through anonymize modes — blur names only, or blur both names and avatars — useful for screenshots without revealing identities. In list view, the button at the end of each row puts an ${t.alter} on ${t.front} (hold it for the level spectrum). In grid view, tap an avatar to open their profile, or press-and-hold it for a small bar with that same ${t.front} button and their options list — slide onto the ${t.front} button and the level spectrum opens under your finger (keep sliding to a level, then lift), or slide onto the list and lift. On the pinned ${t.alters} bar and widget, tap an ${t.alter} for their options, or press-and-hold to go straight to the level spectrum. Wherever the level spectrum is open, slide right until the round options bubble lights up, then lift to open that ${t.alter}'s options (slide back to cancel). How far the slide has to go is set in Tracking setup → ${t.Fronting} levels. The ${t.front} button's icon, and a colour for each ${t.fronting} level, can be changed in Tracking setup → ${t.Fronting} levels.`,
      route: "/Home", target: "alter-view-toggle",
      look: `the highlighted list/grid toggle icon at the top right of the ${t.Alters} section`, action: null,
    },
    {
      section: "alters", sectionLabel: t.Alters,
      emoji: "📁",
      title: "Groups & Folders",
      body: `${t.Alters} can be organized into named groups. The 👁 eye icon toggles the folder tree view on and off. The grid icon next to it cycles the Groups section's own list/2-5 column view, independently of the ${t.Alters} section's view below. The + icon creates a new group. The ⚙️ gear opens the full Groups Manager, which browses the same way this section does — tap a folder to step inside it, breadcrumbs to step back out. At every level you can see what a group holds, reorder groups and their ${t.alters} with the arrows, rename in place, and Select several groups at once to move, recolour or delete them together. The folder-minus icon in the toolbar hides ${t.alters} that already appear in a group from the flat list below — useful for keeping the directory tidy when everyone is grouped.`,
      route: "/Home", target: "alter-groups-controls",
      look: `the highlighted group control icons (👁 + ⚙️) in the ${t.Alters} section header`, action: null,
    },
    {
      section: "alters", sectionLabel: t.Alters,
      emoji: "➕",
      title: `Add a New ${t.Alter}`,
      body: `Tap the highlighted "Add ${t.Alter}" button to create a new profile. Fill in name, alias (or set an emoji and use it as the alias — mention with @ that emoji), pronouns, role, color, avatar, first appearance, bio, and profile style. Groups are added from the profile after you save. Once saved, the avatar and background editors each get a Rotation toggle (Off / Random / In order) — turn it on and "Manage pool images" to upload several pictures, and the one shown will cycle through that pool each time the app reloads. The "Import" button brings your ${t.alters} in from another plural app — Simply Plural, PluralKit, or an OpenPlural/PluralSpace export — right here. The "Export" button makes a shareable document of your ${t.alters} (choose who to include, how much detail, and whether to anonymize names) to send to a friend — and each profile's Options tab can export just that one.`,
      route: "/Home", target: "alter-add-btn",
      look: `the highlighted "+ Add ${t.Alter}" button in the top-right`, action: null,
    },
    {
      section: "alters", sectionLabel: t.Alters,
      emoji: "🖼️",
      title: "Assets",
      body: `Everything you've stored — avatars, banners, backgrounds, bio and chat pictures, songs, videos and files — lives here, auto-sorted into folders — tap a folder to open it, and search finds items in every folder. Videos, audio and other files each have their own folder (Videos, Audio, Others), and songs from song widgets go in Songs Audio. Tap a picture to see it full screen with zoom. Every item has buttons for its details (type, size, length), renaming it, saving it to your device (under its own name and type), leaving it out of backups (the cloud), moving it to a folder, or deleting it (with a warning if it's still in use). Make your own folders, reorder and rename them, bulk-upload, tap Select to move or delete many items at once — or, on the folder grid, to delete your own folders (keeping their files in Unorganized, or deleting everything), and reuse any image anywhere a picture is accepted by tapping the 🖼 button on that upload. Any ${t.alter}'s rotating avatar/background pool also gets its own folder here (named after them), and opening this page from that ${t.alter}'s editor lands you scrolled straight to it. No re-uploading and no duplicate storage.`,
      route: "/assets", target: "assets-library",
      look: "the Assets page", action: null,
    },
    {
      section: "alters", sectionLabel: t.Alters,
      emoji: "📋",
      title: `${t.Alter} Profile — Pages`,
      body: `Tap any ${t.alter} card to open their profile. It's a widget board, like the home screen: each tab in the highlighted bar is a page, and everything on a page is a widget. The pages are: Profile (header, bio, groups, custom fields), Info, Board (${t.system}-wide messages to this ${t.alter}), Messages (private messages), History (${t.fronting} sessions), Notes, Wishlist, Journal (this ${t.alter}'s own journal entries — write one there and it's attributed to them), Lineage, Relationships, Locations (inner-world locations this ${t.alter} is in), Activities, and Options. Swipe the bar to see every page. An ${t.alter} can have a song that plays when their page opens, set in their profile style.`,
      route: ai ? `/alter/${ai}` : "/Home",
      target: ai ? "alter-profile-tabs" : "alters-grid",
      look: ai ? `the highlighted page bar at the top of the ${t.alter} profile` : `tap any ${t.alter} card to open their profile and see the page bar`, action: null,
    },
    {
      section: "alters", sectionLabel: t.Alters,
      emoji: "🧩",
      title: "Edit the Profile Layout",
      body: `The highlighted grid button puts the profile into layout editing, the same as the home screen: hold a widget to move it, drag its edges to resize it, tap its ⚙ for its options (text, shape, colour, styles), and use Widgets in the bottom bar to add headings, text, dividers, a song, or any part of the profile that isn't on this page. Add page makes a page of your own. Save & close keeps it; Discard puts everything back. Each ${t.alter}'s layout is their own, and nothing changes until you edit it.`,
      route: ai ? `/alter/${ai}` : "/Home",
      target: ai ? "alter-profile-layout-btn" : null,
      look: ai ? `the highlighted grid button next to Edit, at the top-right of the profile` : `open a profile and look for the grid button next to Edit`, action: null,
    },
    {
      section: "alters", sectionLabel: t.Alters,
      emoji: "✏️",
      title: "Edit Profile",
      body: `The highlighted Edit button (the pencil) opens the profile's edit form. You can update the name, alias, pronouns, role, color, avatar, first appearance, bio, profile style, groups, and ${t.subsystem || "subsystem"}s. The bio editor's Templates button offers ready-made page designs and stackable sections (headers, likes/dislikes, dividers…) — pick one, then tap the dotted fields to fill it in. Under "Header extras" you can choose to show this ${t.alter}'s groups, ${t.subsystem || "subsystem"}s, or custom fields right in the profile header. Tap Save when done.`,
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
      look: ai ? `tap "History" in the highlighted page bar` : `open an ${t.alter} profile and switch to the History page`, action: null,
    },
    {
      section: "alters", sectionLabel: t.Alters,
      emoji: "📝",
      title: "Notes Tab",
      body: `The Notes tab is a private scratchpad for this ${t.alter} — ${t.alters} can leave notes here that are only visible when viewing this profile. Notes support rich text and can be as long as needed. Useful for important information other ${t.alters} should know about this ${t.alter}.`,
      route: ai ? `/alter/${ai}?tab=notes` : "/Home",
      target: ai ? "alter-profile-tabs" : null,
      look: ai ? `tap "Notes" in the highlighted page bar` : null, action: null,
    },
    {
      section: "alters", sectionLabel: t.Alters,
      emoji: "💗",
      title: "Wishlist Tab",
      body: `The Wishlist tab holds what this ${t.alter} wishes for: an item, an activity, an experience, a goal, or a need. Type a title, pick a kind and tap Add; everything else can wait. Tap the pencil to share it with other ${t.alters} or everyone, mark it important or private, and note what's driving it and how it affects you. Wishes show how long they've been waiting. "Plan it" puts an activity wish in the planner, and "Shopping list" copies an item to the grocery list without saying whose it is. Done and Let go keep a wish in the history instead of deleting it.`,
      route: ai ? `/alter/${ai}?tab=wishlist` : "/Home",
      target: ai ? "alter-wishlist-add" : null,
      look: ai ? `the highlighted "add a wish" box on the Wishlist tab` : `open an ${t.alter} profile and switch to the Wishlist tab`, action: null,
    },
    {
      section: "alters", sectionLabel: t.Alters,
      emoji: "🌳",
      title: "Lineage Tab",
      body: `The Lineage tab records this ${t.alter}'s origin events — fusions (two ${t.alters} merging), splits (one ${t.alter} splitting into multiple), dormancy periods, returns, and reformations (the same ${t.alter} in a new form, with what changed and an optional new name). Events are year-only dated. Split events automatically create "Split from" relationship records in the ${t.System} Map.`,
      route: ai ? `/alter/${ai}?tab=lineage` : "/Home",
      target: ai ? "alter-profile-tabs" : null,
      look: ai ? `tap "Lineage" in the highlighted page bar` : null, action: null,
    },
    {
      section: "alters", sectionLabel: t.Alters,
      emoji: "🔗",
      title: "Relationships Tab",
      body: `The Relationships tab shows how this ${t.alter} connects to other ${t.alters} — the same relationships drawn on the ${t.System} Map. Tap "Add relationship" to define one (pick the other ${t.alter}, a relationship type, and a direction), tap another ${t.alter} to jump to their profile, or edit/remove any relationship here.`,
      route: ai ? `/alter/${ai}?tab=relationships` : "/Home",
      target: ai ? "alter-profile-tabs" : null,
      look: ai ? `tap "Relationships" in the highlighted page bar` : null, action: null,
    },
    {
      section: "alters", sectionLabel: t.Alters,
      emoji: "✉️",
      title: "Private Messages Tab",
      body: `The Messages tab shows private notes left for this ${t.alter}. Use the envelope "Message" button at the top-right of the profile to compose a new one. Messages appear on the dashboard as a banner while the recipient is ${t.fronting}. Pin a message to keep it prominent until dismissed.`,
      route: ai ? `/alter/${ai}?tab=private-messages` : "/Home",
      target: ai ? "alter-profile-tabs" : null,
      look: ai ? `tap "Messages" in the highlighted page bar` : `look for the envelope "Message" button at the top of any profile`, action: null,
    },
    {
      section: "alters", sectionLabel: t.Alters,
      emoji: "⚙️",
      title: "Options Tab — Archive, Merge & Delete",
      body: `The Options tab has Archive (hides the ${t.alter} from the main grid and ${t.fronting} counts without deleting them — useful for inactive ${t.alters}), Merge (ended up with a duplicate from an import? Move everything onto the original and remove the copy), and the Danger Zone delete button which permanently removes them and all their data.`,
      route: ai ? `/alter/${ai}?tab=options` : "/Home",
      target: ai ? "alter-profile-delete" : null,
      look: ai ? `the highlighted "Delete ${t.alter}" button at the bottom of the Options tab` : `open an ${t.alter} profile, tap Options, and look for Archive and Delete`, action: null,
    },
    ...(tourAlterWasCreated && ai ? [{
      section: "alters", sectionLabel: t.Alters,
      emoji: "🗑️",
      title: "Clean Up Demo Profile",
      body: `The "Tour Demo" profile was created just for this tour. You're on the Options tab now — tap "Delete ${t.alter}" to remove it. The tour will also auto-delete it when you tap Done or close the tour, so it's safe to skip this step too.`,
      route: `/alter/${ai}?tab=options`,
      target: "alter-profile-delete",
      look: `the highlighted "Delete ${t.alter}" button — tap it to delete the demo profile`, action: null,
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
      body: `Long-press (press and hold) anywhere on the timeline to add a retroactive entry for that specific day — a ${t.fronting} session (pick several ${t.alters}, browse by subsystem or group, and set each one's ${t.fronting} level), emotion check-in, symptom log, or activity. Nothing is lost just because you forgot to log it in the moment.`,
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
      title: `Notice Who's Near`,
      body: `Everything in a meeting is optional. The "Notice who's near" section is your single place to add who's present — it opens the same Set ${t.Fronters} picker you use everywhere else (searchable, no typing each name). Each ${t.alter} you add gets the same panel as the "Currently ${t.fronting}" widget: feelings, 1–5 symptom rows, and a note — recorded separately. Their feelings also log to Emotions analytics.`,
      route: "/system-checkin", target: "meetings-list",
      look: `the meetings list — tap any past meeting to see the full record, or tap "New Meeting" to try it`, action: null,
    },
    {
      section: "meetings", sectionLabel: `${t.System} Meetings`,
      emoji: "💬",
      title: "Open Dialogue",
      body: `Inside "Invite Sharing" you can flip on "Open dialogue" — the real ${t.System} Chat, right inside the meeting. The same composer, formatting toolbar, and live @ mention / - signpost / /w whisper autocomplete all work. Signposting an ${t.alter} also adds them to "notice who's near". By default it's kept with this meeting, but you can choose to save it to a ${t.System} Chat channel instead — pick an existing one or make a new one.`,
      route: "/system-checkin", target: "meetings-new",
      look: `the "New Meeting" form — open "Invite Sharing" and turn on "Open dialogue" to reveal the chat space`, action: null,
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
      body: `Tap "New Entry" to open the journal editor — the SAME editor ${t.alter} bios use, with Plain / Simple / Blocks / Raw modes, undo, templates, import and preview. Type a hashtag anywhere in the entry (like #dream) and it becomes a tag automatically. The formatting toolbar carries an @ button (compose @ mentions, -signposts and ~commands, then insert them — body @ mentions notify like the mention field does), an eraser that returns your typing to plain text (select text first to strip just that), an image button that previews and sizes a picture before inserting, and a puzzle button for links to pages inside the app. The Date field under the title sets when the entry happened — change it to fix a wrong date (for example after an import). Entries can also have visibility restrictions — limit who can read them to specific ${t.alters} or groups.`,
      route: "/journals", target: "journals-new-entry",
      look: `the highlighted "New Entry" button in the top-right of the Journals page`, action: null,
    },
    {
      section: "journals", sectionLabel: "Journals",
      emoji: "📥",
      title: "Import Files",
      body: `Coming from a notes app like Easy Notes? Tap "Import files" and pick one or many .txt, .md or .html files. You'll see a list first — untick any you don't want, choose a folder and, if you like, which ${t.alter} wrote them. Each file becomes a new entry dated when the file was last changed, so your old notes keep their place in time. Nothing already in your journals is changed, and files over 2 MB are skipped with a note saying which. The Journal widget on the new home screen has an Import link too.`,
      route: "/journals", target: "journals-import",
      look: `the highlighted "Import files" button under "New Entry" on the Journals page`, action: null,
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
      body: `The journal editor has a dedicated "@ mentions" field at the bottom (separate from the main content). Type an ${t.alter}'s name there — they'll receive a notification in the inbox with a link directly to the entry. @ mentions also work in bulletins, board messages, and ${t.system} meeting notes.`,
      route: "/journals", target: "journals-new-entry",
      look: `open a journal entry and scroll to the bottom of the editor to find the @ mention field`, action: null,
    },

    // ─── BULLETIN BOARD ─────────────────────────────────────────────────────
    {
      section: "bulletin", sectionLabel: "Bulletin Board",
      emoji: "🗓️",
      title: "Adding something to do",
      body: `Above the board there's one box for anything you mean to do. Type it and it's a to-do. Open "When" and give it a day — and a time, if it has one — and it becomes a plan as well: it shows on the Activity Tracker and the timeline, and ticking it off in either place finishes it. "More options" carries what you typed into the full plan form for repeats, reminders and who it's for.`,
      route: "/", target: "quick-task-button",
      look: `the "What do you want to do?" box just above the bulletin board`, action: null,
    },
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
      body: `Type @ in a bulletin post to mention an ${t.alter} — they receive a notification in the inbox. Tap any bulletin to expand it and reveal the threaded comment section. Other ${t.alters} can reply and add emoji reactions. Tap the 📌 pin icon on a bulletin to pin it to the top of the board.`,
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
      body: `The Edit button opens the Task Manager inline. Here you can add tasks, edit existing ones, toggle them hidden or visible, drag to reorder within each frequency section, and delete them. Tasks can be MANUAL (tap to complete) or AUTO (completed automatically by app actions like logging a check-in). A MANUAL task can also record activities — pick one or more and how: Timed (runs for a set time, then checks in so you can mark it done, keep going, or move it), Start active (runs until you end it), or Just log it (done now, or for today with no time). Tapping the task then asks first, and opens its link too. Under "How it's completed" a MANUAL task can be done Once, Several times (a set number each period), as a Tally (just counts), or in Steps (a checklist that resets each period).`,
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
      emoji: "📅",
      title: "Planner",
      body: `A Mon–Sun week where entries sit at their real times. Press and hold empty time and drag to log something past or plan something ahead — keep dragging sideways into the next day and the plan runs past midnight, across as many days as you cover. Tap an entry to edit it — name, day, time, category, who was doing it, notes, and its outcome (done / partly / skipped / cancelled / rescheduled). Hold an entry's top or bottom edge to resize it — a plain tap just opens it. Pinch the grid (on a computer: Ctrl + scroll, add Shift for the days): up/down zooms the hours, left/right widens the days (or use the sliders button for hour height, day width, 24h vs AM/PM and the week's first day). Sleep that crosses midnight shows on both days. With the check-ins overlay on, tapping a dot opens that entry in the check-in log; with Places on, your saved locations show as pins (tap one to open it in Location history). Tap empty time to see what happened in that hour — entries, who was ${t.fronting}, feelings and places — or to add something there. Running timers show above the grid. The + on a day pulls from your to-do list. A line marks now, and time already passed is shaded.`,
      route: "/planner", target: "planner",
      look: `the week grid with the hour gutter on the left`, action: null,
    },
    {
      section: "activities", sectionLabel: "Activities",
      emoji: "🧭",
      title: "Calendar, Plans and Insights",
      body: `The planner is where all your activities live — the old Activity Tracker is part of it now. Calendar shows your time as a Day, Week, Month or Year (the arrows step by whichever you pick; tap a day on the month or year to open it; hold and drag across days on the month to plan one entry over the whole span). Give a plan a Color tag in its details and its day is coloured on the Month and Year views; a + marks days with more than one event. Birthdays and other date fields from ${t.alter} profiles show under the date on the Day and Week views (tap one to open that profile) and as dots on the Month. Plans lists everything scheduled, grouped into Overdue, Today, This week, This month and Later, with each repeating series as one row and who and where under each; filter by when, and the Resolved filter keeps every past plan. Insights has the week's totals per activity and per ${t.alter}, your weekly goals (add and edit them there), how often plans actually happen, and an all-time tally. The gear opens the Activities page, and New starts an entry at the next hour.`,
      route: "/planner", target: "planner-sections",
      look: `the Calendar / Plans / Insights switch at the top of the planner`, action: null,
    },
    {
      section: "activities", sectionLabel: "Activities",
      emoji: "⚡",
      title: "Activities Page",
      body: `The Activities page is where your activities themselves live. Add one, nest it inside another (drag it, or select it and tap "→ here"), rename or recolour it, or delete it. Select one and tap Details to see how it's been going (times done, total time, last done, recent entries) and its Who & Feelings links: which ${t.alters} enjoy it, need it, feel obligated to it, dislike or avoid it, or tend to interrupt it ("Your own" adds link types of your own, which can count as a need or as interrupting), and which feelings it helps with or can bring up. Each ${t.alter}'s profile has an Activities tab showing their links from the other side.`,
      route: "/activities", target: "activities-manage",
      look: `the activity list — tap one, then Details`, action: null,
    },
    {
      section: "bulletin", sectionLabel: "Bulletin Board",
      emoji: "🗓️",
      title: "Adding something to do",
      body: `Above the board there's one box for anything you mean to do. Type it and it's a to-do. Open "When" and give it a day — and a time, if it has one — and it becomes a plan as well: it shows on the Activity Tracker and the timeline, and ticking it off in either place finishes it. "More options" carries what you typed into the full plan form for repeats, reminders and who it's for.`,
      route: "/", target: "quick-task-button",
      look: `the "What do you want to do?" box just above the bulletin board`, action: null,
    },
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
      body: `Type @ in a bulletin post to mention an ${t.alter} — they receive a notification in the inbox. Tap any bulletin to expand it and reveal the threaded comment section. Other ${t.alters} can reply and add emoji reactions. Tap the 📌 pin icon on a bulletin to pin it to the top of the board.`,
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
      body: `The Edit button opens the Task Manager inline. Here you can add tasks, edit existing ones, toggle them hidden or visible, drag to reorder within each frequency section, and delete them. Tasks can be MANUAL (tap to complete) or AUTO (completed automatically by app actions like logging a check-in). A MANUAL task can also record activities — pick one or more and how: Timed (runs for a set time, then checks in so you can mark it done, keep going, or move it), Start active (runs until you end it), or Just log it (done now, or for today with no time). Tapping the task then asks first, and opens its link too. Under "How it's completed" a MANUAL task can be done Once, Several times (a set number each period), as a Tally (just counts), or in Steps (a checklist that resets each period).`,
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
      emoji: "📅",
      title: "Planner",
      body: `A Mon–Sun week where entries sit at their real times. Press and hold empty time and drag to log something past or plan something ahead — keep dragging sideways into the next day and the plan runs past midnight, across as many days as you cover. Tap an entry to edit it — name, day, time, category, who was doing it, notes, and its outcome (done / partly / skipped / cancelled / rescheduled). Hold an entry's top or bottom edge to resize it — a plain tap just opens it. Pinch the grid (on a computer: Ctrl + scroll, add Shift for the days): up/down zooms the hours, left/right widens the days (or use the sliders button for hour height, day width, 24h vs AM/PM and the week's first day). Sleep that crosses midnight shows on both days. With the check-ins overlay on, tapping a dot opens that entry in the check-in log; with Places on, your saved locations show as pins (tap one to open it in Location history). Tap empty time to see what happened in that hour — entries, who was ${t.fronting}, feelings and places — or to add something there. Running timers show above the grid. The + on a day pulls from your to-do list. A line marks now, and time already passed is shaded.`,
      route: "/planner", target: "planner",
      look: `the week grid with the hour gutter on the left`, action: null,
    },
    {
      section: "activities", sectionLabel: "Activities",
      emoji: "🧭",
      title: "Calendar, Plans and Insights",
      body: `The planner is where all your activities live — the old Activity Tracker is part of it now. Calendar shows your time as a Day, Week, Month or Year (the arrows step by whichever you pick; tap a day on the month or year to open it; hold and drag across days on the month to plan one entry over the whole span). Give a plan a Color tag in its details and its day is coloured on the Month and Year views; a + marks days with more than one event. Birthdays and other date fields from ${t.alter} profiles show under the date on the Day and Week views (tap one to open that profile) and as dots on the Month. Plans lists everything scheduled, grouped into Overdue, Today, This week, This month and Later, with each repeating series as one row and who and where under each; filter by when, and the Resolved filter keeps every past plan. Insights has the week's totals per activity and per ${t.alter}, your weekly goals (add and edit them there), how often plans actually happen, and an all-time tally. The gear opens the Activities page, and New starts an entry at the next hour.`,
      route: "/planner", target: "planner-sections",
      look: `the Calendar / Plans / Insights switch at the top of the planner`, action: null,
    },
    {
      section: "activities", sectionLabel: "Activities",
      emoji: "⚡",
      title: "Activities Page",
      body: `The Activities page is where your activities themselves live. Add one, nest it inside another (drag it, or select it and tap "→ here"), rename or recolour it, or delete it. Select one and tap Details to see how it's been going (times done, total time, last done, recent entries) and its Who & Feelings links: which ${t.alters} enjoy it, need it, feel obligated to it, dislike or avoid it, or tend to interrupt it ("Your own" adds link types of your own, which can count as a need or as interrupting), and which feelings it helps with or can bring up. Each ${t.alter}'s profile has an Activities tab showing their links from the other side.`,
      route: "/activities", target: "activities-manage",
      look: `the activity list — tap one, then Details`, action: null,
    },
    {
      section: "activities", sectionLabel: "Activities",
      emoji: "🗓️",
      title: "Plans Have a Lifecycle",
      body: `Future activities are plans — they render with a dashed outline so you can tell them apart from solid, logged activity blocks. Tap any scheduled plan to mark it Done, Partial (with optional actual time), Skipped, Cancelled, or to reschedule it — or tap "Start now" to time it live and have it complete itself when you tap End (it shows under Active Activities on the Dashboard meanwhile, and as a small bubble above the bottom bar on every screen; tap its stop button to end it or set when it really ended). You can add a note when you start or finish — it's saved onto the activity and shows in its details everywhere. Past-time plans you haven't reviewed surface on the Dashboard as "Plans needing review" — resolve them in one tap, or tap Start to time one live right from there (you can turn that reminder off in Settings → Reminders). Starting or marking a plan Done asks when: "Started on time" / "Finished on time" uses the plan's own times, or pick Now or another time — so a plan you got to late, or one that ran over, keeps its real times. Done/partial count toward your activity tally; skipped and cancelled never do. On the planner each outcome has its own look: ✓ done, ◐ partly, greyed ⤼ skipped, greyed and crossed-out cancelled, ↻ rescheduled — and when you move a plan, switch off "Count as rescheduled" if you're only fixing what you entered.`,
      route: "/planner", target: "planner",
      look: `the planner grid — tap any plan to open it and pick its outcome`, action: null,
    },
    {
      section: "activities", sectionLabel: "Activities",
      emoji: "🔁",
      title: "Editing Recurring Plans",
      body: `When you edit, delete, or mark a recurring plan, you'll first be asked whether to apply your change to just this instance, this and future occurrences, or every occurrence in the series. "This instance only" splits the record off the series so future edits to the rest won't touch it. Rescheduling always stays single-instance — moving a whole series at once would corrupt the audit trail.`,
      route: "/planner", target: "planner",
      look: `open any recurring plan and try Edit or Delete — the recurrence chooser appears first`, action: null,
    },
    {
      section: "activities", sectionLabel: "Activities",
      emoji: "⏱️",
      title: "Logging vs Planning",
      body: `Every place you log, start or plan an activity opens the same sheet: the planner (hold and drag on empty time, or tap New), the quick actions bar's "Start an activity", the activity widgets on your home screen, and "More options" on a new to-do. It asks one thing first: Already happened, Still going (starts a timer) or Coming up (a plan). Pick what it was with "+ Activity" (your recent ones show as one-tap chips). Tap "Starts" to give the end time instead, so "ended at 1:30, for 45 minutes" works backwards. Set the length by duration (hours and minutes, or a quick 15m–2h chip) or switch to Until for an end time; "Ended now" fits the start to the length, "After the last one" starts where your last activity ended, "After the one just added" chains plans you enter one after another, "Line up with…" opens the day (or its week) so you can tap another activity and start right after it, end right before it or start with it, and "No length" saves just the moment. Still going can start "20 minutes ago" instead of at a clock time. Everything else is a + chip: Who was ${t.fronting} (filled in from who was ${t.fronting} then; the folder button shows your groups and subsystems nested, with a tick to add a whole group at once; switch on "Also record ${t.fronting}" to save that too), With, Notes, To-do, Location and Color tag. Plans also get Days, Any time that day, Repeat, Reminder and Critical. In Quick Check-In, picking an activity shows a thin day view beside it: hold and drag on it to set when that activity happened, and tap the activity to give its length the same way. Tapping any entry, in the planner or a widget, opens the same details: mark it done, start it, move it, or Edit to open this sheet.`,
      route: "/planner", target: "planner",
      look: `hold and drag on empty time in the planner, or tap New — the same sheet opens from Start an activity`, action: null,
    },
    {
      section: "activities", sectionLabel: "Activities",
      emoji: "📈",
      title: "Plan Completion Tracker",
      body: `"Plan follow-through" under Insights on the planner shows how often your scheduled plans actually happen — broken down by category, time of day, and day of week. Pick a window (this week / month / last 3 months / all time) and you'll get a top-line completion percentage, an "avg reschedules" tile, a per-category list sorted by completion rate ascending so pain points come first, and a plain-text insight whenever there's a notable contrast (e.g. "you complete 92% of morning plans but only 41% of evening plans"). The same numbers appear in Therapy Reports under the Plan Completion section.`,
      route: "/planner", target: "planner-sections",
      look: `the highlighted switch — tap Insights and scroll to Plan follow-through`, action: null,
    },
    {
      section: "activities", sectionLabel: "Activities",
      emoji: "🎯",
      title: "Goals",
      body: `Goals works like a notebook. Start a goal (or a project, or a story), then fill its page with sections, and sections inside those, as deep as you like. A page holds notes, to-dos (round, and they're on your To-Do list too, so ticking one counts everywhere), checkboxes (square, they stay on the page), links to other pages and activity trackers. Type [[a page's title]] in a note to link it, and every page lists what links to it. Tap a section's name to open it as its own page, or use its ⋯ menu to indent, move or delete it. The strip under the title starts the page's activities, or Planning, without leaving the page, and the time adds up there. Switch a page to Board to see its sections as columns, or Map to see how everything connects. Pages menu (or the sidebar on a wide screen) shows the whole tree.`,
      route: "/goals", target: "goals-page", experimental: true,
      look: `the Goals page`, action: null,
    },
    {
      section: "activities", sectionLabel: "Activities",
      emoji: "🤝",
      title: "Needs",
      body: `The Needs page is one place for what everyone wants. Balance shows how long it's been since each ${t.alter} got something they enjoy, need or wished for, longest first, with a quick way to plan it. Wishes lists everyone's wishes (private ones stay on their own profile). Turns is for when ${t.alters} want different things: agree who goes first, and the second turn goes in the planner. When you start an activity an ${t.alter} tends to interrupt, a small note says who and what they've been wishing for; tap Got it to carry on. Needs balance, Wishes and Goals are also home-screen widgets.`,
      route: "/needs", target: "needs-page", experimental: true,
      look: `the Needs page`, action: null,
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
      body: `Tap the highlighted Create button to make a new poll. Enter a question and add 2–8 options. Polls have two voting modes: per-${t.alter} (each tile in the multi-select picker votes once, tap an option again to remove that voter) or anonymous tally count (each tap on an option just adds 1, with a − button to subtract). Toggle "Anonymous tally count" at the top of the create modal or on a poll's detail view; whichever mode you last picked becomes the default for the next poll. On a poll's detail view the "Voting As" button opens a multi-select modal — defaults to whoever is currently ${t.fronting}, and you can pick any combination of ${t.alters} (or ${t.System}-wide) so a single tap on an option votes once per selected voter. The pencil icon next to the question opens an Edit modal where you can change the question, edit / add / remove options, or flip the voting mode. Polls posted to the Bulletin Board automatically pin themselves to the board's Pinned section; double-tap a poll inside a bulletin to open it on the Polls page.`,
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
    {
      section: "reminders", sectionLabel: "Reminders",
      emoji: "📌",
      title: "Status bar notifications",
      body: `On the Android app you can keep notifications in your status bar (Settings → Notifications & reminders → Status bar): who's ${t.fronting} right now (updates the instant a ${t.switch} happens), your active symptoms, and a running activity you can end & log straight from there. The ${t.fronting} one can write each ${t.alter} as their name, alias or emoji (for everyone or per ${t.alter}) and leave out chosen ${t.fronting} levels. If anything is stopping notifications on your phone — they're off, reminders may arrive late, or battery saver could stop them — the top of that section and the Reminders page show it with a one-tap fix.`,
      route: "/reminders", target: null,
      look: `Settings → Notifications & reminders → "Status bar" (Android app only)`, action: null,
    },

    // ─── ANALYTICS ──────────────────────────────────────────────────────────
    {
      section: "analytics", sectionLabel: "Analytics",
      emoji: "📊",
      title: "Analytics Overview",
      body: `Analytics opens on the Overview tab: the last 7 days compared against your own usual — ${t.fronting} time, ${t.switches}, check-ins, and sleep, each with a mini trend. Below that is the Insights feed (short pattern cards you can dismiss or mute, each showing exactly what it's based on) and a "Showing up" calendar of days with at least one log — tap a day to open its Timeline.`,
      route: "/analytics", target: "analytics-charts",
      look: `the highlighted Overview — headline cards up top, insight cards and the calendar below`, action: null,
    },
    {
      section: "analytics", sectionLabel: "Analytics",
      emoji: "🗂️",
      title: "Analytics Tabs",
      body: `The other tabs group every analysis by domain: ${t.Fronting} (${t.front} share, history, ${t.switch} timing, co-${t.fronting}), Wellbeing (trends, after-distress, before-${t.switches}, linked patterns, symptoms), Life (activities, plans, goals, to-dos, places, contact time), and ${t.Alters} — a per-${t.alter} fingerprint with their ${t.fronting} texture, emotions, symptoms, and footprint around the app. These tabs share the date range picker — 7d, 30d, 90d, 1y, All Time, or Custom.`,
      route: "/analytics", target: "analytics-charts",
      look: `the tab row under the Analytics title`, action: null,
    },
    {
      section: "analytics", sectionLabel: "Analytics",
      emoji: "🎛️",
      title: "Check-In Log · Display Menu",
      body: `On the Check-In Log, the Display menu (the round sliders button) lets you choose which entry types appear in the log: check-ins, status notes, symptoms, activities, locations, per-${t.alter} entries, and diary data. Toggling one off only hides it from this view — your data is still recorded and still appears on the Timeline. The choice persists across sessions. The round + button next to it adds a note with its own date and time, optionally signed by one of your ${t.alters}. Notes written under an ${t.alter} show a coloured mood dot for each kind of emotion set with them, and a caution sign when the ${t.switch} was triggered.`,
      route: "/checkin-log", target: "checkin-log-display",
      look: `the highlighted round sliders button in the top-right of the Check-In Log header`, action: null,
    },
    {
      section: "analytics", sectionLabel: "Analytics",
      emoji: "👥",
      title: `${t.Alters}`,
      body: `${t.Alters} ranks ${t.alters} by ${t.fronting} time. Stat modes: Total time, Primary-only, Co-${t.front}-only, Average session length, Max, Min, and Count. The "Time of Day" tab shows a heatmap of when each ${t.alter} tends to front by hour — useful for spotting patterns.`,
      route: "/analytics", target: "analytics-charts",
      look: `open the ${t.Fronting} tab → Stats`, action: null,
    },
    {
      section: "analytics", sectionLabel: "Analytics",
      emoji: "💜",
      title: "Emotions, Symptoms & Activities",
      body: `Emotions shows mood trends and check-in frequency over time. Symptoms tracks recurring patterns and can correlate with specific ${t.alters}. Activities shows time-per-activity-type trends and an ${t.Alter} × Activity matrix. All three sections have date range pickers — 7d, 30d, 90d, 1y, All Time, or Custom.`,
      route: "/analytics", target: "analytics-charts",
      look: `Emotions & Symptoms live under the Wellbeing tab; Activities under Life`, action: null,
    },
    {
      section: "analytics", sectionLabel: "Analytics",
      emoji: "🔀",
      title: `Co-${t.Fronting} & ${t.Switch} Logs`,
      body: `Co-${t.Fronting} shows which ${t.alters} tend to ${t.front} together — a co-occurrence analysis of your ${t.system}'s dynamics. ${t.Switch} Log analytics breaks down triggered ${t.switches} by category and visualizes patterns in what tends to cause ${t.switches} over time.`,
      route: "/analytics", target: "analytics-charts",
      look: `both live under the ${t.Fronting} tab`, action: null,
    },
    {
      section: "analytics", sectionLabel: "Analytics",
      emoji: "🔍",
      title: "Patterns & Insights",
      body: `Patterns & Insights cross-references multiple data sources to find correlations — activities that follow certain emotions, whether specific ${t.alters} fronting correlates with symptom changes, and recurring time-of-day patterns. The more you log over time, the more meaningful this section becomes.`,
      route: "/analytics", target: "analytics-charts",
      look: `open the Wellbeing tab → "Patterns (advanced)" at the bottom`, action: null,
    },

    // ─── SYSTEM MAP ─────────────────────────────────────────────────────────
    {
      section: "systemmap", sectionLabel: `${t.System} Map`,
      emoji: "🗺️",
      title: `${t.System} Map`,
      body: `The ${t.System} Map has two tabs: Analytics Map (circles auto-sized by ${t.fronting} time, positioned by co-${t.fronting} overlap) and Inner World Canvas (freeform drag-and-drop layout for your inner world). Big ${t.systems}: the map shows your top ${t.alters} by ${t.fronting} time — the "Filters & Display" bar at the bottom sets how many, or lets you hand-pick who's shown. Below both tabs is the Relationships panel.`,
      route: "/system-map", target: "system-map-canvas",
      look: `the highlighted map canvas — notice the "Analytics" and "Inner World" tabs at the top`, action: null,
    },
    {
      section: "systemmap", sectionLabel: `${t.System} Map`,
      emoji: "🌌",
      title: "Inner World Canvas",
      body: `Switch to the "Inner World" tab to lay out your inner world. Drag ${t.alters} to place them, build separate maps, stack named layers (show/hide & reorder), and drop in backdrop images. The same ${t.alter} can sit on more than one layer, and a location can link to another map or a single layer — tap its ↗ to jump there. Tap an ${t.alter} to see connections; double-tap one then tap another to link them. To edit a location, tap its name or double-tap it — there you can rename, recolour, resize, and lock its position. In view mode, double-tap a location for a quick read-only popup of what's inside. Each location also has its own profile page (like ${t.alter} and group profiles) — open it with the ↗ in the editor or from the Relationships & Locations list to see its sub-locations and which ${t.alters} are inside. Prefer text? Use the Canvas/List toggle for a screen-reader-friendly index of every location grouped by map and layer (it opens here automatically when Accessibility mode is on).`,
      route: "/system-map", target: "system-map-canvas",
      look: `the map canvas — switch to "Inner World" tab and try dragging an ${t.alter} circle`, action: null,
    },
    {
      section: "systemmap", sectionLabel: `${t.System} Map`,
      emoji: "🔗",
      title: "Relationships Panel",
      body: `Below the map canvas, the Relationships panel lists all defined ${t.alter} relationships. Add new ones with built-in types (protector of, split from, caretaker for, etc.) or any custom types you've defined in Settings → ${t.Alters} & Fields → Relationship Types.`,
      route: "/system-map", target: "system-map-canvas",
      look: `scroll below the map canvas to find the Relationships panel`, action: null,
    },

    // ─── GROUNDING & SUPPORT ────────────────────────────────────────────────
    {
      section: "grounding", sectionLabel: "Support",
      emoji: "🫧",
      title: "Support Page",
      body: `The Support page has two tabs: Support and Learn. On the Support tab there are five entry points: Browse all techniques, Help me figure out what I need, Guided breathing, Soundscape, and Scratch pad. The ring at the top breathes with a pattern you choose; tap the pattern name under it to change the pattern or slow it down. There's also a 🫧 floating bubble button in the bottom corner of every screen for instant access from anywhere in the app.`,
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
      emoji: "🎧",
      title: "Soundscape",
      body: `Soundscape makes brown noise, rain, wind, waves and soft tones from math, and draws the shape of the sound as it plays. Pick a sound, then shape it with the knobs under "Shape the sound": warmth, tone pitch, binaural beat, what the rain lands on and how hard it falls, and whether it stays constant or drifts, swells or gusts. Drag the bar under the visual to make it taller or shorter. The sound keeps playing as you move around the app, with a small bar to stop it. Set a timer or let it play, save your own sounds, and use Focus for a full-screen view of the visual, a breathing guide, or both, with a distraction-free option; in Focus, tap the screen and Settings changes the sound, visual, breathing guide and timer without leaving. The visual is Calm by default; switch under it to Layers (each part as its own ripple), Stars (a starfield), Fractal (Julia, Mandelbrot, Newton or Phoenix, or your own formula, under Fractal settings) or Detailed (the live sound). Volume and pitch are capped so it can't get harsh.`,
      route: "/grounding", target: "grounding-soundscape",
      look: `the highlighted "Soundscape" button on the Support tab`, action: null,
    },
    {
      section: "grounding", sectionLabel: "Support",
      emoji: "✨",
      title: "Scratch Pad",
      body: `Scratch pad is a little particle sandbox. Press and drag to draw a line of particles; when you let go, a ruleset decides what they do. Rulesets are made of plain rules: how much speed they keep, how fast they slow and fade, whether neighbours pull together or push apart, a pull to the middle, gravity, swirl, and springs. Pick one (Whirlpool, Drift, Droplets, Spread, Orbit, String, Fall) or tune every rule under "Tune the rules". Tilt the phone and they slide that way ("When I tilt"), or let them always fall to the lowest edge ("Down is down"). Drag the grip under the pad to resize it, or open it full screen, where tapping shows a Settings button with every option.`,
      route: "/grounding", target: "grounding-scratchpad",
      look: `the highlighted "Scratch pad" button on the Support tab`, action: null,
    },
    {
      section: "grounding", sectionLabel: "Support",
      emoji: "📚",
      title: "Learn Tab — Curriculum",
      body: `The Learn tab has 13 modules: Grounding, Separating Past from Present, Imagery Skills, Managing Overwhelming Feelings, Self-Compassion, Understanding Cycles and Patterns, Window of Tolerance, Working with Feelings, Shame and Healing-Focused Thinking, Understanding Triggers, Inner Communication and Cooperation, Daily Structure and Rest, and Building on Progress. Each module has multiple short lessons with reflection prompts. "Try Now" buttons launch the relevant technique directly from the reading.`,
      route: "/grounding", target: "grounding-tabs",
      look: `tap the "Learn" tab in the highlighted tab bar to explore the curriculum modules`, action: null,
    },
    {
      section: "grounding", sectionLabel: "Support",
      emoji: "📖",
      title: "Resources page",
      body: `At the top of the Learn tab there's a Resources button that credits the workbooks the curriculum is drawn from — primarily Finding Solid Ground, with material from Coping With Trauma-Related Dissociation — and links to further reading (Dissociation Made Simple, When Rabbit Howls) plus a handful of online resources (did-research.org, ISSTD, An Infinite Mind). Use it to go straight to the source material when you want to dig deeper than the app's summaries.`,
      route: "/grounding", target: null,
      look: `the Resources tile in the top row of the Learn tab`, action: null,
    },
    {
      section: "grounding", sectionLabel: "Support",
      emoji: "🛡️",
      title: "Safety Plan",
      body: `Your Safety Plan lives at /safety-plan (linked from the Support tab footer). It stores Warning Signs (earliest/escalating/emergency), Coping Cards, and Window of Tolerance levels. Build it gradually over time, or fill it in during a calmer moment. Access it instantly from the nav or the Support tab.`,
      route: "/safety-plan", target: null,
      look: `the Safety Plan page — scroll down to see Warning Signs, Coping Cards, and Tolerance levels`, action: null,
    },

    // ─── CONTACTS ───────────────────────────────────────────────────────────
    {
      section: "contacts", sectionLabel: "Contacts",
      emoji: "📇",
      title: "Contacts",
      body: `Contacts is your directory of people OUTSIDE the system — friends, family, classmates, therapists. Each person gets a profile: mark them Safe / Caution / Unsafe, save phone/email, note whether they know we're a system, and record boundaries, system rules, and what's safe to share. Flag someone as an emergency support contact and they show up in a quick "who can I ask for help?" banner at the top with one-tap call/text. Search finds anyone fast — handy for a "wait, who is this?" moment. You can also add your own custom fields (Birthday, Address, How we met…) to every contact, group people into categories (Family, Work, Medical…) and filter by them, and rename the Safe / Caution / Unsafe labels via "Labels" to fit how you think. On a contact's profile, tap "I'm with them" to track time together — whoever you're with shows under "Currently with" on your dashboard until you end it.`,
      route: "/contacts", target: null,
      look: `the Contacts page — tap "Add" to create one; the Emergency support banner appears once a contact is flagged`, action: null,
    },
    {
      section: "contacts", sectionLabel: "Contacts",
      emoji: "🔗",
      title: "Contact relationships",
      body: `Open any contact and tap the Relationships tab to record how they relate to your ${t.system} as a whole or to individual ${t.alters} — the same idea as the relationships you set between ${t.alters}, but with an outside person. Pick the ${t.system}, an ${t.alter}, or a group, choose a relationship type (Friends, Family, Therapist…), and add notes. Each link also shows up on that ${t.alter}'s own Relationships tab under "External contacts".`,
      route: "/contacts", target: null,
      look: `a contact's profile → the Relationships tab → "Add relationship"`, action: null,
    },

    // ─── THERAPY REPORT ─────────────────────────────────────────────────────
    {
      section: "therapy", sectionLabel: "Therapy Report",
      emoji: "📄",
      title: "Therapy Report Builder",
      body: `The Therapy Report generates a structured document of your ${t.system}'s activity over any date range — bring it to therapy to bridge the amnesia gap between visits. Your therapist sees ${t.fronting} patterns, emotions, symptoms, locations, sleep, and more even across dissociative barriers. Choose Last 7 days, Last 30 days, or a custom range at the top.`,
      route: "/therapy-report", target: "therapy-report-builder",
      look: `the highlighted report builder — date range selector at the top`, action: null,
    },
    {
      section: "therapy", sectionLabel: "Therapy Report",
      emoji: "🛋️",
      title: "Save Things for Therapy",
      body: `Anywhere you can type a ~command (notes, chat, journals, bulletins, statuses), type ~therapy followed by what you want to bring up and it's saved for your next report, at the top under "To Bring Up". A bare ~therapy saves the whole note. Change the command word here if you'd rather type something else.`,
      route: "/therapy-report", target: "therapy-notes",
      look: `the "To bring up" card — what's waiting for your next report, and the command word`, action: null,
    },
    {
      section: "therapy", sectionLabel: "Therapy Report",
      emoji: "⚙️",
      title: "Choose What to Include",
      body: `Every section is independently toggleable with a Select All / Clear All shortcut. Sections: ${t.Fronting} History, Emotion Check-Ins, Custom Status Notes, Symptoms & Habits, Activities, Journal Entries, Diary Cards, Locations, Sleep Log, Bulletin Board, ${t.System} Meetings, Skills & Exercises, Tasks & Habits, Patterns & Narrative, and ${t.Alter} Profiles. The Locations, Sleep Log, and Skills & Exercises sections are new additions that pull from data you've already logged.`,
      route: "/therapy-report", target: "therapy-report-builder",
      look: `the section toggle list — each section has a checkbox and a description`, action: null,
    },
    {
      section: "therapy", sectionLabel: "Therapy Report",
      emoji: "🎛️",
      title: "Per-Section Detail Levels & Exclusions",
      body: `Each section has sub-options that appear when it's turned on. Journal Entries: titles only, first 400 characters, or full entries. ${t.Fronting} History: summary table or full session-by-session log with times and notes. Emotions: top emotions + notable events, or all check-ins. Diary Cards: noteworthy only or all cards. Bulletins: titles or full content. Skills & Exercises: exercise names or written responses. ${t.Alter} Profiles: brief or full bios. Exclusions: under Symptoms & Habits, Activities, and ${t.Alter} Profiles you'll find a "manage exclusions" toggle. Open it to uncheck any individual item — that symptom, activity, or ${t.alter} will be left out of the report without affecting anything else.`,
      route: "/therapy-report", target: "therapy-report-builder",
      look: `the sub-options that appear below a toggled-on section — try expanding Journals or ${t.Fronting} History`, action: null,
    },
    {
      section: "therapy", sectionLabel: "Therapy Report",
      emoji: "💾",
      title: "Export & Templates",
      body: `Tap Download PDF to generate the report. On Android and iOS the button opens the native share sheet — you can save to Files, Google Drive, send via email, or open in any app. On desktop it downloads directly. Export as plain text instead to copy-paste into an email or notes app. Save your current settings as a named template — next session, all your section selections, detail levels, and cover page info reload instantly with no setup.`,
      route: "/therapy-report", target: "therapy-report-builder",
      look: `the Download PDF and Copy as Text buttons at the bottom of the builder`, action: null,
    },

    // ─── SETTINGS ───────────────────────────────────────────────────────────
    {
      section: "settings", sectionLabel: "Settings",
      emoji: "⚙️",
      title: "Settings — Quick Nav",
      body: `Settings has nine collapsible sections. The highlighted quick-nav button row at the top jumps to any section without scrolling. Each section header expands when tapped. Sections: Profile, Appearance, Notifications & reminders, Accessibility, ${t.Alter} setup, Tracking setup, ${t.Systems}, Data & privacy, and About & help.`,
      route: "/settings", target: "settings-quick-nav",
      look: `the highlighted quick-nav button row at the top of the Settings page`, action: null,
    },
    {
      section: "settings", sectionLabel: "Settings",
      emoji: "✏️",
      title: `${t.System} Name & Terminology`,
      body: `The Profile section is expanded by default. Set your ${t.system}'s name at the top. Below it, Terminology Settings lets you customize every word the app uses — "${t.system}", "${t.alter}", "${t.fronting}", "${t.switch}", and more. Changes take effect immediately throughout the entire app including this tour.`,
      route: "/settings", target: "settings-system",
      look: `the highlighted Profile section — already expanded with the name input at the top`, action: null,
    },
    {
      section: "settings", sectionLabel: "Settings",
      emoji: "🎨",
      title: "Appearance — Fonts, Colors & Presets",
      body: `Appearance opens with a UI Size slider and an Advanced block (touch-target + nav-bar-height sliders). Below sit your Font family and Heading font, plus two small icon buttons next to the picker: a download icon for 14 extra decorative fonts (tap the ⓘ beside it for what's actually in that pack — it's more styles, not other languages) and an upload icon to use your own .ttf/.otf/.woff/.woff2 file (up to 5MB, deletable later from the same dropdown). The Theme section — its ☀️/🌙 header chip cycles light / dark / system — holds the built-in presets as a swatch dropdown, your 8 custom colours (editable for light and dark), and the wave colour. Then Corner style, a Presets section (save your look — choosing exactly which parts to include — plus your saved presets and ${t.Fronter} Themes), Dashboard layout, and the navigation bar.`,
      route: "/settings", target: "settings-appearance",
      look: `the highlighted Appearance section — tap its header to expand it`, action: null,
    },
    {
      section: "settings", sectionLabel: "Settings",
      emoji: "🔗",
      title: "Fronter Themes",
      body: `At the bottom of the Appearance section, Fronter Themes lets you link any saved preset to a specific ${t.alter}. The moment that ${t.alter} becomes the primary ${t.fronter} — whether set via the ${t.Front} modal or the long-press menu on the dashboard — the entire app theme switches automatically: colors, font, text size, and light/dark mode all change to match their preset. When ${t.fronting} ends or a different ${t.alter} takes primary, the theme switches again.`,
      route: "/settings", target: "settings-appearance",
      look: `the Fronter Themes section at the bottom of Appearance — search for an ${t.alter} to link a preset to them`, action: null,
    },
    {
      section: "settings", sectionLabel: "Settings",
      emoji: "🧩",
      title: `${t.Alter} setup`,
      body: `The ${t.Alter} setup section has: Custom Fields Manager (add text/number/toggle/dropdown fields to all ${t.alter} profiles), Relationship Types (add custom types for the ${t.System} Map), the Archived ${t.Alters} Manager (view and restore archived profiles), and Archived contacts (find and restore contacts you've archived).`,
      route: "/settings", target: "settings-alters",
      look: `the highlighted ${t.Alter} setup section — tap its header to expand it`, action: null,
    },
    {
      section: "settings", sectionLabel: "Settings",
      emoji: "🪞",
      title: `Multiple ${t.Systems}`,
      body: `Keep more than one ${t.system} in the app — each with its own ${t.alters}, ${t.fronting}, journals, and settings. Add a new ${t.system}, switch between them (you can also tap your ${t.system}'s name on the home screen), rename, or delete one (a backup is saved automatically first). Only one ${t.system} is active at a time.`,
      route: "/settings", target: "settings-systems",
      look: `the highlighted ${t.Systems} section — tap its header to expand it`, action: null,
    },
    {
      section: "settings", sectionLabel: "Settings",
      emoji: "💜",
      title: "Tracking setup",
      body: `Configure the Quick Check-In flow and sections order using the Check-In Manager link. Create custom emotion labels that appear in check-ins. Add custom trigger type categories with emoji and hint text — these appear as options in the "Triggered ${t.switch}?" section of the ${t.Front} modal. The Analytics Grouping setting at the bottom of this section lets you aggregate analytics by group rather than by individual ${t.alter} — useful for larger ${t.systems}.`,
      route: "/settings", target: "settings-checkin",
      look: `the highlighted Tracking setup section — tap its header to expand it`, action: null,
    },
    {
      section: "settings", sectionLabel: "Settings",
      emoji: "⚡",
      title: "Shortcuts",
      body: `Shortcuts (inside Tracking setup) is where you build your personal shortcut library. Tap "Add" to create a new shortcut — there's a wide range of types to pick from (set ${t.front}, log or start an activity/symptom, mark a contact as with you, start/end sleep, post a quick status, add a to-do, jump to any page, and more), fill in the config, and give it a label. Reorder with the up/down arrows. Hold any key on the quick actions bar — or the apps button — to pop your shortcuts up right where you are, next to the bar you held. On the classic dashboard, hold the Quick Check-In button.`,
      route: "/settings", target: "settings-quick-actions",
      look: `the highlighted Shortcuts section — tap the Tracking setup header first if it's collapsed`, action: null,
    },
    {
      section: "settings", sectionLabel: "Settings",
      emoji: "📦",
      title: "Tracking Presets",
      body: `The Check-in manager (Settings → Tracking setup → Check-in manager) now has a "Browse presets" button — a catalogue of things some ${t.systems} track, organised into packs like Dissociation, Trauma responses, Focus, Sensory, and Daily care. Open a pack, tick what fits, and it joins your symptoms/habits list. Everything stays editable, nothing is ever required — they're offered, not prescribed. Anything already in your list under a similar name ("Energy level" for "Energy") isn't added twice, and if your list already has doubles, a "Tidy up" card appears here to merge them in one go.`,
      route: "/manage-checkin", target: "symptom-presets",
      look: `the highlighted "Browse presets" button on the Symptoms tab`, action: null,
    },
    {
      section: "settings", sectionLabel: "Settings",
      emoji: "💗",
      title: "Feelings in Quick Check-In",
      body: `The Feelings tab of the Check-in manager holds your emotions list and chooses who entries belong to when you don't pick: everyone in ${t.front}, everyone except some ${t.fronting} levels, or nobody. That covers widgets, quick actions, reminders and ~commands, and who an emotion starts with in Quick Check-In. In Quick Check-In, press and hold any emotion to pick exactly which ${t.alters} feel it — small coloured dots mark emotions that belong to someone other than the default. The side rating beside Feeling can be turned off here too.`,
      route: "/manage-checkin", target: "checkin-feelings-tab",
      look: `the highlighted Feelings tab`, action: null,
    },
    {
      section: "settings", sectionLabel: "Settings",
      emoji: "🔁",
      title: "Re-run Setup",
      body: `The guided setup you saw on first launch (terminology, tracking packs, emotions, backups) can be replayed any time from Settings → About & help → Tour & onboarding. It never deletes or overwrites anything — useful when a different ${t.alter} wants to walk through it, or after things change.`,
      route: "/settings", target: "rerun-setup",
      look: `the highlighted "Re-run setup" button — expand About & help first if it's collapsed`, action: null,
    },
    {
      section: "settings", sectionLabel: "Settings",
      emoji: "🔒",
      title: "Data & Privacy",
      body: `Oceans Symphony is private by design — by default, every record stays on this device only, in your browser's IndexedDB. Nothing is uploaded or synced by default; there is no account. The only ways anything leaves this device are: exporting a backup yourself, keeping an off-device backup copy (a file you pick in Google Drive or similar), opting in to Friends mode (which sends your display name, ${t.system} name, friend code, friends list, push registration, public key and current ${t.front} at the privacy level you choose — plus any ${t.alters} you share, end-to-end encrypted), turning on cloud-backed reminders (reminder times, and their wording only if you allow it), connecting a third-party import, or turning on device sync (which copies your data to a folder you pick \u2014 a plugged-in phone or a USB stick \u2014 and never touches a network). For an extra layer of security, optionally enable AES-256 password encryption to lock everything behind a passphrase (on-device only — not end-to-end). Export a full JSON backup of everything, or pick the "Everything (.zip)" format — your data plus every picture, song, video and attached file in a single file (its data locked with your backup password when backup locking is on) — and import either one to restore. "Files as .zip" under Advanced saves just your files, under their own names. Advanced also lets you pick which file types go in, and "Back up one type at a time" saves Pictures, Audio, Videos or Attachments as their own .zip. For a big library, "Files as .zip parts" splits your files into zips of a size you choose, and "Restore parts…" puts several back at once. Files you mark with the cloud button in Assets stay out of every backup. If file downloads are blocked (e.g. the Facebook or Instagram in-app browser), use the Copy/Paste Backup alternative right below the download button — it lets you split your data into text chunks you can paste anywhere safe. Your data is fully yours and always exportable. If backups ever go stale or start failing, a small amber card appears on your home screen (and a health line under Auto-backup here) — one tap backs up on the spot. Auto-backup saves the same backup on a schedule, in whichever format you pick (.json, .txt or Everything .zip). There you can also lock backup files with a password and give them a plain file name, so a backup sitting in Downloads doesn't announce what it is. On the phone and desktop apps, "Keep a copy off this phone" (or computer) copies every backup to Google Drive, OneDrive, Dropbox or an SD card, so losing the device doesn't lose the backup. And if the app ever opens looking empty, "Find my data" is right on the home screen and the welcome screen — check there before setting up or importing over the top.`,
      route: "/settings", target: "settings-data",
      look: `the highlighted Data & Privacy section — tap its header to expand it`, action: null,
    },
    {
      section: "settings", sectionLabel: "Settings",
      emoji: "🔍",
      title: "See Your Data",
      body: `Inside Data & Privacy, "See Your Data" is a plain, technical view of exactly what's stored on this device — category by category (${t.alters}, journals, bulletin posts, and so on), each with a record count and size. You can export just one category on its own, or delete one you don't need anymore — deleting always saves a backup of that category to your device first, and cancels the delete entirely if that backup fails, so you're never left without a copy.`,
      route: "/settings", target: "settings-data-inspector",
      look: `the highlighted "See Your Data" section inside Data & Privacy — tap its header to expand it`, action: null,
    },
    {
      section: "settings", sectionLabel: "Settings",
      emoji: "🔌",
      title: "Sync between devices",
      body: `Keep two of your own devices in step without a cloud or an account. Plug your phone into your computer, point the desktop app at its storage (or use a USB stick), and each device writes its own snapshot file and reads the other's. Nothing is sent over a network — the app only reads and writes files. Syncing never deletes: if something was removed on one device but is still on the other, it comes back, and anything the other device dropped is listed for you to decide on rather than disappearing. If both devices logged a ${t.switch} before syncing, you choose which is right; "Compare ${t.front} history between devices" shows both side by side, day by day, so you can pick a device for a span of days and fix single sessions.`,
      route: "/settings", target: "settings-device-sync",
      look: `the highlighted "Sync between devices" section inside Data & Privacy — tap its header to expand it`, action: null,
    },
    {
      section: "settings", sectionLabel: "Settings", desktopOnly: true,
      emoji: "⬇️",
      title: "Check for updates",
      body: `On the desktop app, tap "Check for updates" at the top of Settings. If a newer version is out it downloads, saves everything, and restarts the app on the new version.`,
      route: "/settings", target: "settings-desktop-update",
      look: `the highlighted "Check for updates" button under the Settings title`, action: null,
    },
    {
      section: "settings", sectionLabel: "Settings",
      emoji: "🖼️",
      title: "Keep original images",
      body: `Uploaded pictures are resized when they're large, to keep storage and backups small; pictures that are already small are stored exactly as they are. Turn on "Keep original images" under Storage & encryption to store every upload byte-for-byte at full size, metadata and all.`,
      route: "/settings", target: "settings-storage",
      look: `the highlighted "Storage & encryption" section inside Data & Privacy — tap its header to expand it`, action: null,
    },
    {
      section: "settings", sectionLabel: "Settings",
      emoji: "🕰️",
      title: "Recent changes archive",
      body: `${t.Alter} profile edits, home-screen / widget-board layout rewrites, sync replacements and things the trash removed for good are silently archived on the Recent Changes page (in the sidebar under Tools). Each bucket — ${t.alters}, journals & content, tracking, layouts — keeps its own recent window, so a burst of home-screen edits can never push out the record of a deleted ${t.alter}. Open an entry to see exactly what was there, and tap Restore to bring it back — a deleted ${t.alter} comes back with the same identity, so their ${t.fronting} history and group memberships reconnect. A safety net for the whole ${t.system}: nothing important disappears just because one person deleted it.`,
      route: "/history", target: "history-archive",
      look: `the Recent Changes page with its category buckets`, action: null,
    },
    {
      section: "settings", sectionLabel: "Settings",
      emoji: "🗑️",
      title: "The trash",
      body: `Deleting something moves it to the trash at the top of Recent Changes instead of erasing it. Things deleted together stay together, and Restore puts them all back. The trash empties itself after 30 days (you can pick how long). Switch on the time lock and nobody can delete protected things early (${t.alters} with history, groups, journals, chat channels, bulletins, maps), and turning the lock off only takes effect after the current window.`,
      route: "/history", target: "trash",
      look: `the Trash section at the top of Recent Changes`, action: null,
    },
    {
      section: "settings", sectionLabel: "Settings",
      emoji: "🧪",
      title: "Experimental features",
      body: `Some newer features are still settling: Needs, Goals and Mods. They stay hidden until you switch on Experimental features in Settings → About & help. Switching it off again only hides them; anything you made in them is kept.`,
      route: "/settings", target: "settings-about",
      look: `About & help, then Experimental features`, action: null,
    },
    {
      section: "settings", sectionLabel: "Settings",
      emoji: "🧩",
      title: "Mods",
      body: `Mods add extra features. The Mods page (in the sidebar under Tools) has a library of mods that come with the app, and Install adds one someone shared as a file ending in .osmod. Either way you'll see what it adds and tick what it may see, like your ${t.alters} or who's ${t.fronting}. Each mod runs walled off with no internet access and can only change its own data, which is in your backups and stays when you remove the mod. Its pages show up in your navigation, ready to pin.`,
      route: "/mods", target: "mods-page", experimental: true,
      look: `the Mods page`, action: null,
    },

    // ─── FRIENDS ────────────────────────────────────────────────────────────
    {
      section: "friends", sectionLabel: "Friends",
      emoji: "🤝",
      title: "Friends & Front Sharing",
      body: `The Friends page lets you share who is ${t.fronting} with trusted people outside your ${t.system}. You get a unique friend code — share it with a friend and they share theirs, then you each accept the request. Once connected, you can each see the other's front status in real time.`,
      route: "/friends", target: "friends-code",
      look: `the highlighted Friends page with your unique friend code`, action: null,
    },
    {
      section: "friends", sectionLabel: "Friends",
      emoji: "🔔",
      title: "Front Change Notifications",
      body: `For each friend you can toggle "Notify on change" — when their front updates, you'll get a push notification. If you prefer not to be pinged, their front status still refreshes in the Friends list every 30 seconds so you can check at your own pace. Privacy levels let you share names, count only, or keep the front fully hidden.`,
      route: "/friends", target: null,
      look: `the Friends list with a friend card expanded to show the notify toggle`, action: null,
    },
    {
      section: "friends", sectionLabel: "Friends",
      emoji: "🔐",
      title: `Sharing ${t.alters} (encrypted)`,
      body: `Beyond front status, you can share ${t.alters} themselves. Create "privacy levels" (each chooses what it reveals — name, pronouns, role, bio, and so on) from any profile's Options → Sharing levels, put ${t.alters} into the levels you want (a ${t.alter} can be in several; they're private until you do), then on each friend's card grant them the levels they may see — a simple slider or hand-picked. What they see is end-to-end encrypted: scrambled on your device so the relay can't read it, only that friend can. You can also compare a "safety number" with a friend to be sure no one's impersonating them. Prefer a one-time file instead? The Alters page "Export" button makes a shareable document you send yourself.`,
      route: "/friends", target: null,
      look: `a friend card expanded — look for "Members this friend can see" and the safety number`, action: null,
    },

    {
      section: "chat", sectionLabel: `${t.System} Chat`,
      emoji: "💬",
      title: `${t.System} Chat`,
      body: `A Discord-style chat for ${t.alters} to talk to each other. Create named channels for different topics (Daily check-in, Therapy prep, anywhere). Pick which ${t.alter} is speaking from the author dropdown — every message is signposted, so the history reads like a real back-and-forth. Reply to a message to quote it inline. @mention any ${t.alter} by name and they'll show up in their mention log. Type "/w @name [secret]" to hide just the bracketed part as a private whisper to specific ${t.alters} (leave the brackets off in chat to hide the whole message). The same "/w @name [secret]" works in bulletins, comments, and your notes (alter notes, to-do details, activity and check-in notes) too — only the bracketed part is hidden behind a tap-to-reveal bar. Make a channel "Private" to limit it to chosen ${t.alters} — it shows under Private channels with a lock, and when none of those ${t.alters} are ${t.fronting} its name is hidden and opening it asks "view anyway?" (a privacy safeguard). Organise channels into colour-coded, nestable categories, and tap Edit in the channel list to drag them around. On a phone, tap the panel button on the left of the chat header to slide the channel list in over the conversation, then tap a channel or tap outside to slide it back. Format text with the toolbar and it renders inline as you type — what you see is what you send. The paperclip attaches a video, song or any file at its original quality (it plays right in the chat, with tempo & pitch controls, and is kept in Assets), and pictures can be kept full size or compressed. Tap a picture in chat or bulletins to open it full screen and zoom. A deleted message leaves a placeholder; its trash icon, or the eraser in the channel header, removes them for good. Chat content is NEVER included in therapy reports.`,
      route: "/chat", target: null,
      look: `the panel button on the left of the header — tap it to slide the channel list in over the chat`, action: null,
    },


    // ─── DONE ───────────────────────────────────────────────────────────────
    {
      section: "done", sectionLabel: "Done!",
      emoji: "👁️",
      title: "Feeling lost? Try Preview Mode",
      body: `To see how the app feels with everything filled in, head to Settings → About & help → Preview Mode. It drops you into an example ${t.system} where every ${t.alter} profile walks you through one feature — and the whole app is populated so you can actually try things. Your real data stays exactly where it is; anything you touch in the example vanishes when you exit.`,
      route: "/settings", target: "settings-about",
      look: `the "Preview Mode" block inside About & help — expand that section first`,
      action: null,
    },
    {
      section: "done", sectionLabel: "Done!",
      emoji: "💜",
      title: "Tour Complete 🎉",
      body: `You've explored every page and feature of Oceans Symphony. The app is designed for dissociative ${t.system}s — log at your own pace, and nothing forgotten in the moment is lost forever. You can replay this tour any time from the ⚙ menu on the home screen (Feature tour) or Settings → About. Take good care. 💜`,
      route: null, target: null, look: null, action: null,
    },
  ];
}

// `restrictToRoute` — when set, the tour filters down to steps whose `route`
// matches and drops the global "welcome" + "Tour Complete 🎉" closer. Used
// by the per-page tutorial banner (PageTutorialBanner) so first-time
// visitors to a page get a short scoped walkthrough instead of the full
// linear tour.

// Returns the set of routes that have at least one page-scoped tutorial
// step. Terms are passed in only because buildSteps uses them in titles /
// bodies; we don't actually look at those — only the route field matters
// here — so passing an empty object is fine, but lets us avoid making
// buildSteps callers depend on useTerms.
let _routesCache = null;
export function getRoutesWithTourSteps() {
  if (_routesCache) return _routesCache;
  const all = buildSteps({}, null, false);
  const set = new Set();
  for (const s of all) {
    if (s.route && s.section !== "welcome") set.add(s.route);
  }
  _routesCache = set;
  return set;
}

export default function FeatureTour({ onClose, restrictToRoute = null }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const t = useTerms();

  const [tourAlterId, setTourAlterId] = useState(null);
  const [tourAlterWasCreated, setTourAlterWasCreated] = useState(false);

  const { data: settingsList = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  const uiV2On = UI_V2_ENABLED && (pickPrimarySystemSettings(settingsList) || settingsList[0])?.ui_v2?.enabled === true;

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

  const experimentalOn = useExperimentalOn();
  const steps = useMemo(() => {
    const all = buildSteps(t, tourAlterId, tourAlterWasCreated, uiV2On)
      .filter((st) => !(uiV2On && st.classicOnly))
      // Desktop-only controls (the update button) aren't on screen elsewhere.
      .filter((st) => !(st.desktopOnly && !isDesktop()))
      // Needs, Goals and Mods stay out of the tour until experimental
      // features are switched on.
      .filter((st) => !(st.experimental && !experimentalOn));
    if (!restrictToRoute) return all;
    return all.filter(s => s.route === restrictToRoute && s.section !== "welcome");
  }, [t, tourAlterId, tourAlterWasCreated, restrictToRoute, uiV2On, experimentalOn]);
  const [step, setStep] = useState(0);

  // Safety: if a page-scoped tour ends up with no steps (bad route, or every
  // step's data-tour anchor was removed), exit instead of crashing on
  // steps[step].
  useEffect(() => {
    if (restrictToRoute && steps.length === 0) onClose?.();
  }, [restrictToRoute, steps.length, onClose]);

  // Empty-object fallback keeps the useMemos below (which read current.section)
  // from crashing on the render frame before the no-steps cleanup effect fires.
  const current = steps[step] || {};
  const hasSteps = steps.length > 0;
  const isLast = hasSteps && step === steps.length - 1;
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

  // Page-scoped run with nothing to show — the cleanup effect above is
  // already calling onClose; just render nothing in the meantime.
  if (!hasSteps) return null;

  return createPortal(
    <>
      {/* SVG spotlight — renders a full-screen dim with a transparent cutout over
          the highlighted element. Positioned in the portal so it has no parent
          stacking context; the hole approach works regardless of element z-index. */}
      {spotlightRect ? (
        <svg
          className="fixed inset-0 pointer-events-none"
          // zIndex 55 sits ABOVE the Radix Dialog overlay (z-50) so the
          // spotlight dim + cutout render correctly when the highlighted
          // element is inside a modal (e.g. the SetFrontModal sort button).
          // Below z-99 / z-100 so the tour card and touch blocker stay on top.
          style={{ zIndex: 55, width: "100%", height: "100%", overflow: "visible" }}
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
        <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 55, background: "rgba(0,0,0,0.3)" }} />
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
      <div ref={cardRef} className={`fixed left-0 right-0 z-[100] px-3 pb-2 ${cardAtTop ? "top-4" : ""}`}
        style={cardAtTop ? undefined : { bottom: "calc(var(--bottom-nav-height, 56px) + var(--os-sab, 0px) + 8px)" }}>
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
                    <span className="text-[0.5625rem] font-bold uppercase tracking-widest text-primary/80 bg-primary/10 px-1.5 py-0.5 rounded-full leading-none">
                      {current.sectionLabel}
                    </span>
                    {sectionStepCount > 1 && (
                      <span className="text-[0.625rem] text-muted-foreground">
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
                <p className="text-[0.6875rem] text-primary leading-snug">
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
                aria-label="Back"
                title="Back"
              >
                <ChevronLeft className="w-3 h-3" />
              </button>
              <button
                onClick={() => {
                  if (isLast) {
                    // Only the full linear tour counts as "completing the
                    // tour" for the daily-task trigger. Page-scoped runs
                    // are smaller walkthroughs and shouldn't satisfy the
                    // tour_completed marker.
                    if (!restrictToRoute) markTourCompletedToday();
                    handleClose();
                  } else {
                    goTo(step + 1);
                  }
                }}
                className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity"
              >
                {isLast ? "Done 💜" : (<>Next <ChevronRight className="w-3 h-3" /></>)}
              </button>
              {!isLast && nextSectionFirstStep !== -1 && (
                <button
                  onClick={() => goTo(nextSectionFirstStep)}
                  title="Skip to next section"
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border text-[0.6875rem] text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors flex-shrink-0"
                >
                  Skip <ChevronsRight className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
          <div className="h-1" />
        </div>
      </div>

      {/* Accessibility quick-access during the tour — sits on the opposite edge
          from the tour card, and compact (icon-only) so it never covers tour
          content. */}
      <AccessibilityFab position={cardAtTop ? "bottom-left" : "top-left"} zIndex={101} compact />
    </>,
    document.body
  );
}
