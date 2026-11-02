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
import { tutorialRouteKey } from "@/lib/pageTutorials";

// alterId — ID of the alter whose profile to navigate to during profile steps.
// tourAlterWasCreated — true if we created a temporary demo alter.
//
// One step = one idea (v0.317.0). The page tutorials ("New to this page?")
// play these steps one at a time, so a step's body stays short — two or
// three sentences about the ONE thing it highlights. A feature with more to
// say gets more steps, not a longer one. `node scripts/check-tour-steps.mjs`
// fails on a body over STEP_BODY_LIMIT characters or a duplicated step.
export const STEP_BODY_LIMIT = 300;

const SECTION_LABELS = (t) => ({
  welcome: "Welcome", newui: "New UI", dashboard: "Home", fronting: t.Fronting,
  alters: t.Alters, profile: `${t.Alter} profile`, timeline: "Timeline",
  meetings: `${t.System} Meetings`, journals: "Journals", bulletin: "Bulletin Board",
  tasks: "Tasks", activities: "Activities", polls: "Polls", reminders: "Reminders",
  analytics: "Analytics", systemmap: `${t.System} Map`, grounding: "Support",
  contacts: "Contacts", therapy: "Therapy Report", settings: "Settings",
  friends: "Friends", chat: `${t.System} Chat`, done: "Done!",
});

export function buildSteps(t, alterId = null, tourAlterWasCreated = false, uiV2On = false) {
  const ai = alterId;
  const labels = SECTION_LABELS(t);
  // Every step has the same shape; this fills the defaults so each entry
  // below only says what's particular to it.
  const s = (section, step) => ({
    section, sectionLabel: labels[section], target: null, look: null, action: null, ...step,
  });
  // Profile steps: on the profile when we know whose, else the directory.
  const profile = (tab) => (ai ? `/alter/${ai}${tab ? `?tab=${tab}` : ""}` : "/Home");
  const onProfile = (target, elseTarget = null) => (ai ? target : elseTarget);

  return [
    // ─── WELCOME ────────────────────────────────────────────────────────────
    s("welcome", {
      emoji: "🌊", title: "Welcome to the tour",
      body: `This tour visits each page and points at one thing at a time. Next moves on, Back goes back, and Skip jumps to the next section. The app moves to each page for you.`,
      route: "/",
    }),
    s("welcome", {
      emoji: "♿", title: "Accessibility, any time",
      body: `The Accessibility button in the corner stays with you through the whole tour. Tap it for bigger text, high contrast or low-vision mode. It's all in Settings → Accessibility too.`,
      route: "/", look: `the floating "Accessibility" button in the corner of the screen`,
    }),

    // ─── Classic-hosted v2 bars (classic look only — v2 has its own) ────────
    ...(!uiV2On ? [
      s("welcome", {
        emoji: "⚡", title: "The quick actions bar",
        body: `The slim handle above the bottom tabs unfolds the quick actions bar: one tap for a check-in, a note, an activity, a symptom, a task or setting ${t.front}.`,
        route: "/", look: `the slim dash-and-chevron handle just above the bottom tab bar`,
      }),
      s("welcome", {
        emoji: "🎚️", title: "Your bars, your way",
        body: `Your pinned ${t.alters} can float as a bar too, and a new top bar can replace this header. Switch them on in the setup guide, and change how they look in Display options → Bars.`,
        route: "/", look: `Settings → Appearance → Edit bars…`,
      }),
      s("welcome", {
        emoji: "🧩", title: "The widget board",
        body: `Swipe left on the home screen, or tap the grid button beside Help, to open the widget board: extra pages you build from live widgets. Swipe right on its first page to come back.`,
        route: "/", look: `the small grid button beside the Help icon at the top-right of the home screen`,
      }),
      s("welcome", {
        emoji: "🚪", title: "Which one opens first",
        body: `Settings → Appearance → Layout picks whether the app opens on this home screen or the widget board. Your boards follow you to your other devices with device sync.`,
        route: "/",
      }),
      s("welcome", {
        emoji: "✏️", title: "Edit your home screen",
        body: `Press and hold an empty spot, or open the ⚙ menu and choose "Edit home screen". This screen is the same canvas as the widget board, so it edits the same way.`,
        route: "/", look: `the ⚙ cog in the top-right — "Edit home screen" is the first item`,
      }),
      s("welcome", {
        emoji: "✋", title: "Move, resize, remove",
        body: `In edit mode, hold a card until it lifts, then drag it to a new spot or onto "Drop to remove". Hold an edge to resize it. The apps button opens "Add widget".`,
        route: "/",
      }),
      s("welcome", {
        emoji: "⚙️", title: "A card's options",
        body: `Each card's gear opens its options: what it shows, its mode and its look. "Reset to default" is in Settings → Appearance → Layout, and offers to keep your arrangement first.`,
        route: "/",
      }),
    ] : []),

    // ─── NEW UI (only when the ui_v2 toggle is on) ──────────────────────────
    ...(uiV2On ? [
      s("newui", {
        emoji: "🧪", title: "Your home screen is a widget board",
        body: `The home screen is made of widgets. Each one shows or does one thing: who's ${t.fronting}, today's plans, a journal, a breathing circle. You choose which ones, where they sit and how they look.`,
        route: "/", look: `your widgets — every block is one you can move, resize, restyle or remove`,
      }),
      s("newui", {
        emoji: "✏️", title: "Start editing",
        body: `Press and hold an empty spot, or open the ⚙ menu (top-right) and choose "Edit home screen". Widgets ignore taps while you edit, so you can't set one off by accident.`,
        route: "/", look: `the ⚙ cog in the top-right — "Edit home screen" is the first item`,
      }),
      s("newui", {
        emoji: "✋", title: "Move and resize",
        body: `Hold a widget until it lifts, then drag it. Drop it on another widget's left or right edge to sit beside it, or on "Drop to remove". Hold an edge to resize.`,
        route: "/",
      }),
      s("newui", {
        emoji: "☑️", title: "Change several at once",
        body: `Hold a widget and let go without dragging to start selecting. Tap more widgets to add them, then restyle them together or use "Edit all". Deselect ends it.`,
        route: "/",
      }),
      s("newui", {
        emoji: "➕", title: "Add widgets",
        body: `In edit mode, the apps button (top-left) has an "Add widget" tab. It opens on groups by what widgets are for, like Right now, Log, Plan & track and Profiles, or search across all of them.`,
        route: "/", look: `the app-logo button in the top-left — in edit mode its drawer gains the "Add widget" tab`,
      }),
      s("newui", {
        emoji: "👀", title: "Try before you add",
        body: `Each widget is a card with a small live preview and an Add button. Widgets that come in versions, like the planner's views, are one card: tap it to pick the version, size and style first.`,
        route: "/",
      }),
      s("newui", {
        emoji: "🔎", title: "Minimal, normal, expanded",
        body: `Most widgets come in three depths. Minimal is just the answer. Normal is the full view. Expanded adds its actions, like dragging on an activity grid to log time right there.`,
        route: "/", look: `a widget's gear (in edit mode) → the Minimal / Normal / Expanded switch at the top`,
      }),
      s("newui", {
        emoji: "🎨", title: "A widget's options",
        body: `In edit mode, a widget's gear opens its options in tabs: Content, Text, Shape, Colour and Styles. The sheet opens at half height so you can watch the widget change.`,
        route: "/", look: `the small gear that appears on each widget while editing`,
      }),
      s("newui", {
        emoji: "🎚️", title: "Sliders and resets",
        body: `Every size is a slider with its number beside it; tap the number to type one. A greyed value is inherited, × clears one value, and each tab ends with Reset. Remove is under ⋯.`,
        route: "/",
      }),
      s("newui", {
        emoji: "🧱", title: "Overlap, layers and rotation",
        body: `Shape → Arrange lets a widget overlap others, move it forward or back in the stack, and rotate it.`,
        route: "/",
      }),
      s("newui", {
        emoji: "⚡", title: "Quick actions",
        body: `The split handle above the bottom bar opens two things: its right half shows quick actions, its left half the pinned ${t.alters} bar. Support is always one of the quick actions.`,
        route: "/", look: `the split handle above the bottom bar`,
      }),
      s("newui", {
        emoji: "🌊", title: "Calm widgets",
        body: `Add widget → Calm has the Support page's tools as widgets: a breathing circle, the Scratch pad to draw on, and the Soundscape with play, stop, the countdown and volume right on the page.`,
        route: "/",
      }),
      s("newui", {
        emoji: "🔁", title: "Swap the bars",
        body: `Want the quick actions always showing? Display options → Bars → Quick actions bar → "Swap with bottom bar" keeps them fixed and folds the page tabs behind the handle.`,
        route: "/",
      }),
      s("newui", {
        emoji: "🎛️", title: "Every bar in one place",
        body: `Display options → Bars holds every bar: top, bottom tabs, quick actions, pinned ${t.alters} and side rail. Each has Show, Position, Size, Look and What's on it. Bars belong to this device.`,
        route: "/", look: `Display options (the sliders button in the top bar's menu) → Bars`,
      }),
    ] : []),

    // ─── HOME ───────────────────────────────────────────────────────────────
    s("dashboard", {
      emoji: "🔄", title: "Pull down to refresh",
      body: `On a phone, pull down from the top of any page and let go to refresh it. Handy after restoring a backup, or when a friend's ${t.front} feels a beat behind.`,
      route: "/", look: `nothing to find — just drag down from the top of the page and release`,
    }),
    s("dashboard", {
      emoji: "📥", title: "Notifications inbox",
      body: `The 📥 inbox in the header holds @ mentions, messages and reminders that have fired. A dot means something's unread. Tap a notification to jump straight to it.`,
      route: "/", look: `the 📥 inbox icon in the top-right of the header`,
    }),
    s("dashboard", {
      emoji: "☰", title: "The sidebar", classicOnly: true,
      body: `Tap the logo in the top-left to open the sidebar. Every page is there, grouped by what it does. It closes by itself when you pick a page.`,
      route: "/", look: `the Oceans Symphony logo in the top-left of the header`,
    }),
    s("dashboard", {
      emoji: "🔲", title: "Sidebar or app grid", classicOnly: true,
      body: `The grid icon in the sidebar's header switches to an app grid; the list icon switches back. Choose which pages it lists in Settings → Appearance → Layout → Sidebar.`,
      route: "/", look: `the grid icon at the top of the open sidebar`,
    }),
    s("dashboard", {
      emoji: "🛒", title: "The grocery list",
      body: `The cart icon opens what looks like an ordinary grocery list, and it works as one. It's also a privacy cover: triple-tap anywhere in the app to open it instantly.`,
      route: "/", target: "grocery-list-button",
      look: `the 🛒 cart icon in the sidebar (tap the logo top-left to see it)`,
    }),
    s("dashboard", {
      emoji: "📝", title: "More than groceries",
      body: `Tap the list's name to switch lists or make new ones. A list can stay open while the app is locked, hold notes (the ✎ button), or be a deck of flash cards to study.`,
      route: "/", look: `the list name at the top of the grocery list`,
    }),
    s("dashboard", {
      emoji: "✔️", title: "Bought, ran out, again",
      body: `Tick an item when you buy it, tap again when it runs out, and star the ones you buy often. With encryption on, the lock icon closes the list and locks the app.`,
      route: "/",
    }),

    // ─── FRONTING ───────────────────────────────────────────────────────────
    s("fronting", {
      emoji: "👥", title: `Set ${t.fronters}`,
      body: `This window sets who's ${t.fronting}. Everyone in ${t.front} shows as a card at the top; × removes them. Tap anyone in the list to add them.`,
      // Target left null so the trigger button (now hidden behind the modal)
      // doesn't drive the spotlight or flip the tour card to the top.
      route: "/", look: `the window — try tapping an ${t.alter} to add them`, action: "open-set-front",
    }),
    s("fronting", {
      emoji: "📶", title: `${t.Fronting} levels`,
      body: `Each card shows that ${t.alter}'s ${t.fronting} level. Whoever is at the top level leads. Add levels of your own, like Observing, in Settings → Tracking → ${t.Fronting} levels.`,
      route: "/", look: `the level on each card at the top of the window`, action: "open-set-front",
    }),
    s("fronting", {
      emoji: "🔃", title: "Sort and view",
      body: `The sort button cycles A→Z, Z→A, and most or least ${t.fronting} time. The buttons beside it switch between a list, an avatar grid and your groups.`,
      route: "/", target: "setfront-sort",
      look: `the highlighted sort button in the search row`, action: "open-set-front",
    }),
    s("fronting", {
      emoji: "⚡", title: `Triggered ${t.switch}`,
      body: `If something set off this ${t.switch}, tick "Triggered ${t.switch}?" and pick what: sensory, emotional, a reminder, or types of your own. It feeds the ${t.Switch} Log analytics.`,
      route: "/", target: "setfront-triggered",
      look: `the highlighted "Triggered ${t.switch}?" box at the bottom`, action: "open-set-front",
    }),
    s("fronting", {
      emoji: "📖", title: `Journal this ${t.switch}`,
      body: `Tick "Journal this ${t.switch}?" to open a journal entry right after saving. It's linked to this ${t.switch} and kept under ${t.Switch} Logs in Journals.`,
      route: "/", target: "setfront-journal",
      look: `the highlighted "Journal this ${t.switch}?" box at the bottom`, action: "open-set-front",
    }),

    // ─── ALTERS (the directory) ─────────────────────────────────────────────
    s("alters", {
      emoji: "🪪", title: `Your ${t.system}'s profile`,
      body: `The top of this page is your ${t.system}'s own profile: name, picture, bio and banner. Set them in Settings → Profile. Tap "About this ${t.system}" to read the bio.`,
      route: "/Home", target: "system-profile", look: `the highlighted header at the top of the page`,
    }),
    s("alters", {
      emoji: "👤", title: `Your ${t.alters}`,
      body: `Every ${t.alter} has a card with their name, pronouns, role and colour. Whoever is ${t.fronting} floats to the top with a glowing border. Tap a card to open their profile.`,
      route: "/Home", target: "alters-grid", look: `the highlighted cards below the search bar`,
    }),
    s("alters", {
      emoji: "📌", title: `Pinned ${t.alters}`,
      body: `Pin an ${t.alter} from their profile and they show here and in the pinned bar. Tap a chip for their menu; hold it for the level rail. The ⚙ picks who's pinned and how they look.`,
      route: "/Home", target: "pinned-alters", look: `the Pinned row — it shows once you've pinned someone`,
    }),
    s("alters", {
      emoji: "🔃", title: "Sort",
      body: `The ↕ button sorts A→Z, Z→A, or by most or least ${t.fronting} time. Whoever is ${t.fronting} always stays on top.`,
      route: "/Home", target: "alter-sort", look: `the highlighted sort button beside the search bar`,
    }),
    s("alters", {
      emoji: "🔲", title: "List or grid",
      body: `This button cycles between a list and a 2–5 column grid. The camera beside it blurs names, or names and pictures, for screenshots.`,
      route: "/Home", target: "alter-view-toggle", look: `the highlighted list/grid button`,
    }),
    s("alters", {
      emoji: "👆", title: `Putting someone in ${t.front}`,
      body: `In the list, the button at the end of a row puts that ${t.alter} in ${t.front}; hold it for the level spectrum. In the grid, hold an avatar for the same button and their options.`,
      route: "/Home", target: "alters-grid",
    }),
    s("alters", {
      emoji: "🎚️", title: "The level spectrum",
      body: `With the level spectrum open, slide to a level and lift. Slide right onto the round bubble to open that ${t.alter}'s options instead. Tune it in Settings → Tracking → ${t.Fronting} levels.`,
      route: "/Home",
    }),
    s("alters", {
      emoji: "📁", title: "Groups",
      body: `The 👁 shows or hides your group folders, + makes a group, and the grid icon changes how groups are laid out. Folder-minus hides grouped ${t.alters} from the list below.`,
      route: "/Home", target: "alter-groups-controls", look: `the highlighted group buttons`,
    }),
    s("alters", {
      emoji: "🗂️", title: "The groups manager",
      body: `The ⚙ gear opens the groups manager. Tap a folder to step inside and the breadcrumbs to step out. Select several groups to move, recolour or delete them together.`,
      route: "/Home", target: "alter-groups-controls", look: `the ⚙ gear among the group buttons`,
    }),
    s("alters", {
      emoji: "➕", title: `Add an ${t.alter}`,
      body: `Tap "Add ${t.Alter}" to make a new profile. A name is enough to start; everything else can be filled in later from their Info.`,
      route: "/Home", target: "alter-add-btn", look: `the highlighted "+ Add ${t.Alter}" button`,
    }),
    s("alters", {
      emoji: "🪪", title: `The new ${t.alter} sheet`,
      body: `Info, Custom fields and Links tabs, the same as ${t.Alter} info, and a Profile style row for the look. Nothing about the ${t.alter} is saved until you tap Add.`,
      route: "/Home", target: ["new-alter-sheet", "alter-add-btn"], look: `the "New ${t.alter}" sheet (open it with Add)`,
    }),
    s("alters", {
      emoji: "📥", title: "Import and export",
      body: `Import, beside Add, brings ${t.alters} in from a backup or another plural app. Export makes a shareable document of the ${t.alters} you choose, with names hidden if you like.`,
      route: "/Home", target: "alter-add-btn",
    }),
    s("alters", {
      emoji: "🌫️", title: "New presences",
      body: `Sensed someone you can't quite place? Record a presence, even just a colour or a feeling. This page notices when a presence comes back, or might be someone you already know.`,
      route: "/presences", target: "new-presences", look: `the New Presences page`,
    }),
    s("alters", {
      emoji: "🖼️", title: "Assets",
      body: `Everything you've stored lives here: pictures, songs, videos and files, sorted into folders. Tap a folder to open it; search looks through all of them.`,
      route: "/assets", target: "assets-library", look: "the Assets page",
    }),
    s("alters", {
      emoji: "🧰", title: "Each item",
      body: `Tap a picture to see it full screen. Every item can show its details, be renamed, saved to your device, kept out of backups, moved or deleted (you're warned if it's still in use).`,
      route: "/assets", target: "assets-library",
    }),
    s("alters", {
      emoji: "♻️", title: "Reuse, don't re-upload",
      body: `Make your own folders, and tap Select to move or delete many at once. Anywhere you can add a picture, the 🖼 button picks one from here, so nothing is stored twice.`,
      route: "/assets", target: "assets-library",
    }),

    // ─── ALTER PROFILE ──────────────────────────────────────────────────────
    s("profile", {
      emoji: "📋", title: "A profile is a page of widgets",
      body: `Like the home screen, a profile is built from widgets. Each tab in this bar is a page: Profile, ${t.Fronting}, Custom fields, Messages, Notes, Journal, Wishes and Connections.`,
      route: profile(), target: onProfile("alter-profile-tabs", "alters-grid"),
      look: ai ? `the highlighted page bar — swipe it to see every page` : `tap any ${t.alter} card to open their profile`,
    }),
    s("profile", {
      emoji: "⬆️", title: "Along the top",
      body: `Up top: previous and next ${t.alter}, the pin, ${t.Front} (tap to put them in ${t.front}, hold for the level rail), Info, and the pencil.`,
      route: profile(), look: `the buttons along the top of the profile`,
    }),
    s("profile", {
      emoji: "🪪", title: "Info holds everything",
      body: `Info is everything about this ${t.alter}: name, pronouns, colour, picture, role and the bio with its full editor. It saves as you type, with undo and redo at the top.`,
      route: profile(), target: onProfile("alter-profile-edit-btn"),
      look: ai ? `the highlighted Info button` : `open a profile and look for Info at the top-right`,
    }),
    s("profile", {
      emoji: "🗃️", title: "Info's four pages",
      body: `Info has four pages: Info, Custom fields, Pictures and Links (groups, tags and Get to know me). Widgets only show what's in Info, so nothing is lost when no widget shows it.`,
      route: profile(), target: onProfile("alter-profile-edit-btn"),
    }),
    s("profile", {
      emoji: "🏷️", title: "Custom fields",
      body: `Custom fields can be short or long text, lists, dates, numbers or yes/no, for one ${t.alter} or everyone. A field's ⋯ renames it, changes its kind, hides it or deletes it.`,
      route: profile("fields"), target: onProfile("alter-profile-tabs"),
      look: `Info → Custom fields, or the Custom fields page`,
    }),
    s("profile", {
      emoji: "🔁", title: "Old or new profile",
      body: `Profile layout, under "Profile page" in Info, says which profile this ${t.alter} uses and switches it. Both layouts are kept, so you can go back and forth any time.`,
      route: profile(), target: onProfile(["profile-layout-switch", "alter-profile-edit-btn"]),
    }),
    s("profile", {
      emoji: "🎨", title: "Profile style",
      body: `Profile style, under "Profile page" in Info, is this profile's own look: colours, pictures, fonts, the space between widgets, what the header shows, and a song that plays when the page opens.`,
      route: profile(), target: onProfile("alter-profile-edit-btn"),
    }),
    s("profile", {
      emoji: "🧩", title: "Edit the page",
      body: `The pencil edits the page itself, and it keeps looking exactly as it does. Hold a widget to move it in the column, drag its edges to resize, and tap its ⚙ for its options.`,
      route: profile(), target: onProfile("alter-profile-layout-btn"),
      look: ai ? `the highlighted pencil (Edit page)` : `open a profile and look for the pencil at the top-right`,
    }),
    s("profile", {
      emoji: "🧲", title: "Snap to grid",
      body: `While editing, Snap in the bottom bar turns grid snapping off, so widgets move and size in small steps. One widget can have its own choice in its ⚙ → Shape → Arrange.`,
      route: profile(),
    }),
    s("profile", {
      emoji: "➕", title: "Add to a page",
      body: `While editing, Widgets in the bottom bar adds anything: a heading, text, a picture or video, a song, a Field with chosen custom fields, Tags, Notes and more. Add page makes a new page.`,
      route: profile(),
    }),
    s("profile", {
      emoji: "📑", title: "Pages in the bio",
      body: `A Bio or Field widget can show its text as pages: tabs you swipe between. In its ⚙ → Content, "Add a page" offers ready pages like Backstory, or a blank one. Each page is kept in Info.`,
      route: profile(),
    }),
    s("profile", {
      emoji: "🔗", title: "Someone else's widgets",
      body: `Most widgets here can show someone else: in a widget's options, "Whose" → "Another ${t.alter}". A Field widget's "Whose info" can also pick a group.`,
      route: profile(),
    }),
    s("profile", {
      emoji: "💾", title: "Keep or discard",
      body: `Save & close keeps your changes; Discard puts it all back. Save also offers "Use this layout for all", "Use as the default" and "Reset", each asking first.`,
      route: profile(),
    }),
    s("profile", {
      emoji: "📊", title: `${t.Fronting} page`,
      body: `This page shows this ${t.alter}'s time in ${t.front}: totals up top, then every session, newest first.`,
      route: profile("fronting"), target: onProfile("alter-profile-tabs"),
    }),
    s("profile", {
      emoji: "✉️", title: "Messages",
      body: `Messages holds private notes left for this ${t.alter}, and their board posts. A message for someone who's ${t.fronting} shows on the home screen until it's read.`,
      route: profile("messages"), target: onProfile("alter-profile-tabs"),
    }),
    s("profile", {
      emoji: "📝", title: "Notes and journal",
      body: `Notes is for things others should know about this ${t.alter}. The Journal page shows their entries; write one there and it's signed by them.`,
      route: profile("notes"), target: onProfile("alter-profile-tabs"),
    }),
    s("profile", {
      emoji: "💗", title: "Wishes",
      body: `Wishes holds what this ${t.alter} wishes for: an item, an activity, an experience, a goal or a need. Type it, pick a kind and tap Add.`,
      route: profile("wishes"), target: onProfile("alter-profile-tabs"),
    }),
    s("profile", {
      emoji: "🗓️", title: "Following up on a wish",
      body: `Wishes show how long they've waited. "Plan it" puts an activity in the planner. Done and Let go keep a wish in the history instead of deleting it.`,
      route: profile("wishes"),
    }),
    s("profile", {
      emoji: "🔗", title: "Connections",
      body: `Connections gathers who and where this ${t.alter} is tied to: relationships with other ${t.alters}, lineage, inner-world places, and the activities they enjoy or avoid.`,
      route: profile("connections"), target: onProfile("alter-profile-tabs"),
    }),
    s("profile", {
      emoji: "🌳", title: "Lineage",
      body: `Lineage records fusions, splits, dormancy, returns and reformations, dated by year. Recording a split adds "Split from" relationships for you.`,
      route: profile("connections"),
    }),
    s("profile", {
      emoji: "⚙️", title: "Archive, merge and delete",
      body: `Info's ⋯ menu has Export, Merge (for a duplicate from an import), sharing, Archive (hides them without deleting) and Delete, which goes to the trash.`,
      route: profile(), target: onProfile("alter-profile-edit-btn"), look: `Info → the ⋯ menu`,
    }),
    s("profile", {
      emoji: "👥", title: "Other profiles work the same",
      body: `Groups, contacts and inner-world places have profiles like this one, each with its own Info and Edit page. An older profile shows a "Try the new profile" card, and can switch back any time.`,
      route: profile(),
    }),
    ...(tourAlterWasCreated && ai ? [s("profile", {
      emoji: "🗑️", title: "Clean up the demo profile",
      body: `The "Tour Demo" profile was made just for this tour. It's deleted when the tour ends, or you can delete it now from Info → ⋯ → Delete.`,
      route: profile(), target: "alter-profile-edit-btn",
    })] : []),

    // ─── TIMELINE ───────────────────────────────────────────────────────────
    s("timeline", {
      emoji: "📅", title: "The timeline",
      body: `The timeline shows your ${t.system}'s history day by day: ${t.fronting}, check-ins, feelings, activities, symptoms, places, journals and statuses. Scroll down for earlier days; it never runs out.`,
      route: "/timeline", target: "timeline-container", look: `the highlighted day-by-day timeline`,
    }),
    s("timeline", {
      emoji: "🔦", title: "Filters",
      body: `These buttons show or hide each kind of entry: activities, journals, feelings, ${t.fronting}, symptoms and places. Turn the others off to see just one.`,
      route: "/timeline", target: "timeline-filters", look: `the highlighted row of icons under the heading`,
    }),
    s("timeline", {
      emoji: "📆", title: "Jump to a date",
      body: `Pick a date and tap Jump to go straight to that day. "Back to today" brings you home again.`,
      route: "/timeline", target: "timeline-jump", look: `the highlighted date picker and Jump button`,
    }),
    s("timeline", {
      emoji: "📊", title: "A day's tally",
      body: `Each day's header has a "Tally" link. It opens a summary of that day: tasks, feelings, symptoms, activity time and more.`,
      route: "/timeline", target: "timeline-container", look: `the "Tally" link on the right of any day header`,
    }),
    s("timeline", {
      emoji: "⏮️", title: "Add something you missed",
      body: `Press and hold any day to add what you didn't log then: a ${t.fronting} session (several ${t.alters}, each with a level), a check-in, a symptom or an activity.`,
      route: "/timeline", target: "timeline-container", look: `press and hold on any day`,
    }),

    // ─── SYSTEM MEETINGS ────────────────────────────────────────────────────
    s("meetings", {
      emoji: "✨", title: `${t.System} meetings`,
      body: `A meeting is a gentle five-step check-in for the whole ${t.system}: arrive, notice, greet, share, close. Past meetings are listed here, and show in reports, the timeline and analytics.`,
      route: "/system-checkin", target: "meetings-list", look: `the highlighted list of past meetings`,
    }),
    s("meetings", {
      emoji: "➕", title: "Start a meeting",
      body: `Tap "New Meeting" and the app walks you through each step, with room for notes. Every part is optional.`,
      route: "/system-checkin", target: "meetings-new", look: `the highlighted "New Meeting" button`,
    }),
    s("meetings", {
      emoji: "👁️", title: "Notice who's near",
      body: `"Notice who's near" opens the usual ${t.alter} picker. Each ${t.alter} you add gets their own feelings, symptom ratings and a note.`,
      route: "/system-checkin", target: "meetings-new", look: `inside a new meeting`,
    }),
    s("meetings", {
      emoji: "💬", title: "Open dialogue",
      body: `Under "Invite Sharing", turn on "Open dialogue" for a ${t.System} Chat right inside the meeting. Keep it with the meeting, or save it to a chat channel.`,
      route: "/system-checkin", target: "meetings-new", look: `inside a new meeting, under "Invite Sharing"`,
    }),

    // ─── JOURNALS ───────────────────────────────────────────────────────────
    s("journals", {
      emoji: "📖", title: "Journals",
      body: `Journals hold longer writing from any ${t.alter}, sorted into folders. Tap a folder to open it; the breadcrumb at the top shows where you are.`,
      route: "/journals", target: "journals-list", look: `the highlighted folders and entries`,
    }),
    s("journals", {
      emoji: "📁", title: "Folders",
      body: `"New Folder" makes a folder here, as deep as you like. Entries written inside a folder are filed there.`,
      route: "/journals", target: "journals-folder-btn", look: `the highlighted "New Folder" button`,
    }),
    s("journals", {
      emoji: "✏️", title: "Write an entry",
      body: `Tap "New Entry" to write. Pick who's writing, give it a title, and change the Date if it happened another day. Type a #hashtag anywhere to tag it.`,
      route: "/journals", target: "journals-new-entry", look: `the highlighted "New Entry" button`,
    }),
    s("journals", {
      emoji: "🧰", title: "The toolbar",
      body: `The toolbar formats text and adds pictures, links to pages in the app, @ mentions, -signposts and ~commands. The eraser turns text back to plain.`,
      route: "/journals", target: "journals-new-entry",
    }),
    s("journals", {
      emoji: "🔒", title: "Who can read it",
      body: `An entry can be limited to chosen ${t.alters} or groups, so only they can open it.`,
      route: "/journals", target: "journals-new-entry",
    }),
    s("journals", {
      emoji: "🏷️", title: "@ mentions",
      body: `Mention an ${t.alter} with @ and they get a notification linking straight to the entry. @ mentions work in bulletins, messages and meeting notes too.`,
      route: "/journals", target: "journals-new-entry",
    }),
    s("journals", {
      emoji: "📥", title: "Import notes",
      body: `"Import files" brings in .txt, .md or .html notes. You'll see a list first to untick any, and pick a folder and who wrote them. Each entry keeps the file's date.`,
      route: "/journals", target: "journals-import", look: `the highlighted "Import files" button`,
    }),
    s("journals", {
      emoji: "🔄", title: `${t.Switch} logs`,
      body: `The "${t.Switch} Logs" tab holds the entries written with "Journal this ${t.switch}?", each linked to its ${t.switch}.`,
      route: "/journals", target: "journals-tabs", look: `the "${t.Switch} Logs" tab`,
    }),
    s("journals", {
      emoji: "🔍", title: "Find an entry",
      body: `Search by title or text, filter by author, or tap a tag. The eye button shows only what's open to whoever is ${t.fronting}.`,
      route: "/journals", target: "journals-filters", look: `the highlighted search and filters`,
    }),

    // ─── BULLETIN BOARD ─────────────────────────────────────────────────────
    s("bulletin", {
      emoji: "🗓️", title: "Something to do",
      body: `Above the board is one box for anything you mean to do. Type it and it's a to-do. Give it a day under "When" and it's a plan too, on the planner and the timeline.`,
      route: "/", target: "quick-task-button", look: `the "What do you want to do?" box`,
    }),
    s("bulletin", {
      emoji: "📋", title: "The bulletin board",
      body: `The board is for messages the whole ${t.system} can see: announcements, reminders, notes for everyone. Private messages go to one ${t.alter}; bulletins go to all.`,
      route: "/", target: "bulletin-list", look: `the highlighted board — scroll down to see it`,
    }),
    s("bulletin", {
      emoji: "💬", title: "Comments and pins",
      body: `Tap a bulletin to open its comments, where others can reply and react. @ mention someone to notify them, and tap 📌 to pin a bulletin to the top.`,
      route: "/", target: "bulletin-list",
    }),

    // ─── TASKS ──────────────────────────────────────────────────────────────
    s("tasks", {
      emoji: "✅", title: "Daily tasks and habits",
      body: `Tasks are little routines that repeat. Each has points and a streak; finishing them levels you up.`,
      route: "/tasks", target: "tasks-daily", look: `the highlighted task cards`,
    }),
    s("tasks", {
      emoji: "📊", title: "Level and streak",
      body: `This bar shows your level, today's points, your current streak and your best one. It fills as you tick tasks off.`,
      route: "/tasks", target: "tasks-level-bar", look: `the highlighted level bar`,
    }),
    s("tasks", {
      emoji: "🗂️", title: "Daily, weekly, monthly, yearly",
      body: `Each tab holds the tasks for that period, with a count on each. Weekly, monthly and yearly tasks reset when their period starts.`,
      route: "/tasks", target: "tasks-freq-tabs", look: `the highlighted tabs`,
    }),
    s("tasks", {
      emoji: "⚙️", title: "Edit your tasks",
      body: `Edit opens the task manager: add, change, hide, reorder or delete tasks. AUTO tasks tick themselves when you do the thing, like saving a check-in; MANUAL ones you tick.`,
      route: "/tasks", target: "tasks-edit-btn", look: `the highlighted "Edit" button`,
    }),
    s("tasks", {
      emoji: "🔢", title: "How a task is done",
      body: `Under "How it's completed", a MANUAL task can be done once, several times, as a tally, or in steps (a checklist that resets each period).`,
      route: "/tasks", target: "tasks-edit-btn",
    }),
    s("tasks", {
      emoji: "⏱️", title: "Tasks that log activities",
      body: `A MANUAL task can also record activities: timed, running until you end it, or just logged. Ticking it asks first.`,
      route: "/tasks", target: "tasks-edit-btn",
    }),
    s("tasks", {
      emoji: "📝", title: "To-do list",
      body: `The to-do list is for one-off things with no repeat. Add it, tick it off, done. Good for errands and therapy goals.`,
      route: "/todo", target: "tasks-list", look: `the to-do list`,
    }),

    // ─── ACTIVITIES ─────────────────────────────────────────────────────────
    s("activities", {
      emoji: "📅", title: "The planner",
      body: `A week where entries sit at their real times. Press and hold empty time and drag to log something past or plan something ahead. Drag sideways to run across days.`,
      route: "/planner", target: "planner", look: `the week grid with the hours on the left`,
    }),
    s("activities", {
      emoji: "👆", title: "Change an entry",
      body: `Tap an entry to open it. Hold its top or bottom edge to make it longer or shorter. Tap empty time to see what happened that hour, or add something there.`,
      route: "/planner", target: "planner",
    }),
    s("activities", {
      emoji: "🤏", title: "Zoom",
      body: `Pinch the grid: up and down zooms the hours, sideways widens the days (Ctrl + scroll on a computer). The sliders button sets hour height, day width and 24-hour time.`,
      route: "/planner", target: "planner",
    }),
    s("activities", {
      emoji: "📍", title: "On the grid",
      body: `Turn on check-ins or places to see them on the grid; tap one to open it. The + on a day pulls from your to-do list, and a line marks now.`,
      route: "/planner", target: "planner",
    }),
    s("activities", {
      emoji: "🧭", title: "Calendar",
      body: `Calendar shows a Day, Week, Month or Year. Tap a day on the month or year to open it, or hold and drag across days to plan one entry over them all.`,
      route: "/planner", target: "planner-sections", look: `the Calendar / Plans / Insights switch`,
    }),
    s("activities", {
      emoji: "🎂", title: "Dates and colours",
      body: `Birthdays and other dates from ${t.alter} profiles show on the calendar; tap one to open the profile. A plan with a colour tag colours its day.`,
      route: "/planner", target: "planner-sections",
    }),
    s("activities", {
      emoji: "📋", title: "Plans",
      body: `Plans lists everything scheduled: Overdue, Today, This week, This month and Later. A repeating series is one row, and the Resolved filter keeps past plans.`,
      route: "/planner", target: "planner-sections",
    }),
    s("activities", {
      emoji: "📈", title: "Insights",
      body: `Insights has the week's totals per activity and per ${t.alter}, weekly goals, an all-time tally, and "Plan follow-through": how often plans really happen, hardest first.`,
      route: "/planner", target: "planner-sections",
    }),
    s("activities", {
      emoji: "🗓️", title: "Plans and logs",
      body: `Plans have a dashed outline; logged activities are solid. Tap a plan to mark it done, partly, skipped or cancelled, or to move it.`,
      route: "/planner", target: "planner", look: `any plan on the grid`,
    }),
    s("activities", {
      emoji: "▶️", title: "Start now",
      body: `"Start now" times a plan live. It shows as a bubble above the bottom bar on every screen; tap its stop button to end it, or to say when it really ended.`,
      route: "/planner", target: "planner",
    }),
    s("activities", {
      emoji: "🕑", title: "Real times",
      body: `Starting or finishing a plan asks when: on time, now, or another time. So a plan you got to late keeps the times it really happened.`,
      route: "/planner", target: "planner",
    }),
    s("activities", {
      emoji: "🔔", title: "Plans needing review",
      body: `Plans whose time has passed wait on the home screen under "Plans needing review", one tap each. Turn that off in Settings → Reminders.`,
      route: "/planner", target: "planner",
    }),
    s("activities", {
      emoji: "✓", title: "What each outcome looks like",
      body: `✓ done, ◐ partly, greyed ⤼ skipped, crossed out for cancelled, ↻ rescheduled. Only done and partly count toward your totals.`,
      route: "/planner", target: "planner",
    }),
    s("activities", {
      emoji: "🔁", title: "Repeating plans",
      body: `Changing a repeating plan asks first: just this one, this and later ones, or all of them. "Just this one" splits it off the series.`,
      route: "/planner", target: "planner",
    }),
    s("activities", {
      emoji: "⏱️", title: "One sheet for every entry",
      body: `Logging, starting or planning an activity always opens the same sheet. It asks first: Already happened, Still going (a timer) or Coming up (a plan).`,
      route: "/planner", target: "planner", look: `hold and drag on empty time, or tap New`,
    }),
    s("activities", {
      emoji: "⏳", title: "How long",
      body: `Pick it with "+ Activity" (recent ones are one-tap chips), then set a length or an end time. Tap "Starts" to work back from the end: "ended at 1:30, after 45 minutes".`,
      route: "/planner", target: "planner",
    }),
    s("activities", {
      emoji: "🔗", title: "Line it up",
      body: `"Now" sets the start (or end) to now. Before / After + Set places it next to the last one logged or the last on the timeline. "Line up with…" lets you tap any other activity.`,
      route: "/planner", target: "planner",
    }),
    s("activities", {
      emoji: "🏷️", title: "Extras",
      body: `Everything else is a + chip: who was ${t.fronting}, who you were with, notes, a to-do, a place and a colour tag. Plans also get repeats, reminders and Critical.`,
      route: "/planner", target: "planner",
    }),
    s("activities", {
      emoji: "⚡", title: "Your activities",
      body: `This page holds the activities themselves. Add one, nest it inside another (drag it, or select it and tap "→ here"), rename, recolour or delete it.`,
      route: "/activities", target: "activities-manage", look: `the activity list`,
    }),
    s("activities", {
      emoji: "💞", title: "Who and feelings",
      body: `Select an activity and tap Details to see how it's going, which ${t.alters} enjoy, need, avoid or interrupt it, and which feelings it helps with.`,
      route: "/activities", target: "activities-manage", look: `tap an activity, then Details`,
    }),
    s("activities", {
      emoji: "🎯", title: "Goals", experimental: true,
      body: `Goals works like a notebook. Start a goal, a project or a story, then fill its page with sections, and sections inside those, as deep as you like.`,
      route: "/goals", target: "goals-page", look: `the Goals page`,
    }),
    s("activities", {
      emoji: "📄", title: "What a page holds", experimental: true,
      body: `Notes, to-dos (round, and also on your to-do list), checkboxes (square, page only), links and activity trackers. Type [[a page's title]] in a note to link to it.`,
      route: "/goals", target: "goals-page",
    }),
    s("activities", {
      emoji: "🗺️", title: "Board and map", experimental: true,
      body: `Switch a page to Board to see its sections as columns, or Map to see how everything connects. The Pages menu shows the whole tree.`,
      route: "/goals", target: "goals-page",
    }),
    s("activities", {
      emoji: "🤝", title: "Needs", experimental: true,
      body: `Needs is one place for what everyone wants. Balance shows how long it's been since each ${t.alter} got something they enjoy, need or wished for, longest first.`,
      route: "/needs", target: "needs-page", look: `the Needs page`,
    }),
    s("activities", {
      emoji: "🔄", title: "Taking turns", experimental: true,
      body: `Wishes lists everyone's shared wishes. Turns helps when ${t.alters} want different things: agree who goes first, and the second turn goes in the planner.`,
      route: "/needs", target: "needs-page",
    }),

    // ─── POLLS ──────────────────────────────────────────────────────────────
    s("polls", {
      emoji: "🗳️", title: "Polls",
      body: `Polls let the whole ${t.system} decide together. Results show as bars, with the avatars of who voted for what. Closed polls stay for reference.`,
      route: "/polls", target: "polls-list", look: `the highlighted list of polls`,
    }),
    s("polls", {
      emoji: "➕", title: "Make a poll",
      body: `Tap Create, type a question and add 2 to 8 options. The pencil beside a poll's question edits it later.`,
      route: "/polls", target: "polls-create", look: `the highlighted "Create" button`,
    }),
    s("polls", {
      emoji: "🔢", title: "Two ways to vote",
      body: `By ${t.alter}: each voter votes once, and tapping again takes it back. Anonymous tally: each tap adds one, with − to subtract. Switch modes when you create or on the poll.`,
      route: "/polls", target: "polls-create",
    }),
    s("polls", {
      emoji: "🙋", title: "Voting as",
      body: `On a poll, "Voting As" picks who's voting: whoever is ${t.fronting}, or any mix. One tap then votes once for each of them. A poll posted to the board pins itself there.`,
      route: "/polls", target: "polls-list",
    }),

    // ─── REMINDERS ──────────────────────────────────────────────────────────
    s("reminders", {
      emoji: "🔔", title: "Reminders",
      body: `Reminders nudge you and open the right thing when tapped: a check-in reminder opens Quick Check-In, a ${t.front} reminder opens the ${t.front} picker. They can repeat or happen once.`,
      route: "/reminders", target: "reminders-list", look: `the Reminders page`,
    }),
    s("reminders", {
      emoji: "⚙️", title: "Make a reminder",
      body: `The Manage tab lists your reminders. "New Reminder" asks for a title, when it repeats, and what tapping it should do.`,
      route: "/reminders", target: "reminders-manage-tab", look: `the highlighted "Manage" tab`,
    }),
    s("reminders", {
      emoji: "📬", title: "The inbox",
      body: `The Inbox tab holds reminders waiting for you. Do what it suggests, or snooze it for later.`,
      route: "/reminders", target: "reminders-inbox-tab", look: `the highlighted "Inbox" tab`,
    }),
    s("reminders", {
      emoji: "🩺", title: "If notifications are blocked",
      body: `If something is stopping notifications, like a switched-off permission or battery saver, this page shows it with a one-tap fix.`,
      route: "/reminders", target: "reminders-list",
    }),
    s("reminders", {
      emoji: "📌", title: "Status bar",
      body: `On the Android app, Settings → Notifications & reminders → Status bar can keep who's ${t.fronting}, active symptoms and a running activity in your phone's status bar.`,
      route: "/reminders", look: `Settings → Notifications & reminders → "Status bar"`,
    }),

    // ─── ANALYTICS ──────────────────────────────────────────────────────────
    s("analytics", {
      emoji: "📊", title: "Overview",
      body: `Analytics opens on the last 7 days compared with your usual: ${t.fronting} time, ${t.switches}, check-ins and sleep. Below are insight cards and a calendar of the days you logged.`,
      route: "/analytics", target: "analytics-charts", look: `the highlighted Overview`,
    }),
    s("analytics", {
      emoji: "🗂️", title: "The tabs",
      body: `The other tabs group everything: ${t.Fronting}, Wellbeing, Life, and ${t.Alters} (a fingerprint of each ${t.alter}). They share the date range at the top.`,
      route: "/analytics", target: "analytics-charts", look: `the tab row under the title`,
    }),
    s("analytics", {
      emoji: "👥", title: `Who ${t.fronts} most`,
      body: `Under ${t.Fronting}, Stats ranks ${t.alters} by ${t.fronting} time, average session, longest and count. "Time of Day" shows when each ${t.alter} tends to ${t.front}.`,
      route: "/analytics", target: "analytics-charts", look: `the ${t.Fronting} tab → Stats`,
    }),
    s("analytics", {
      emoji: "🔀", title: `Together and ${t.switches}`,
      body: `Also under ${t.Fronting}: who tends to ${t.front} together, and what tends to trigger ${t.switches}.`,
      route: "/analytics", target: "analytics-charts",
    }),
    s("analytics", {
      emoji: "💜", title: "Feelings, symptoms, activities",
      body: `Wellbeing has feeling and symptom trends. Life has activities, plans, to-dos, places and time with contacts.`,
      route: "/analytics", target: "analytics-charts",
    }),
    s("analytics", {
      emoji: "🔍", title: "Patterns",
      body: `Wellbeing → "Patterns (advanced)" looks for links across everything, like activities that follow certain feelings. The more you log, the more it finds.`,
      route: "/analytics", target: "analytics-charts",
    }),
    s("analytics", {
      emoji: "🎛️", title: "Choose what the log shows",
      body: `The round sliders button picks which entry types the Check-In Log shows. Hiding one only hides it here; it's still saved and on the timeline.`,
      route: "/checkin-log", target: "checkin-log-display", look: `the highlighted round sliders button`,
    }),
    s("analytics", {
      emoji: "➕", title: "Add a note",
      body: `The round + beside it adds a note with its own date and time, signed by an ${t.alter} if you like.`,
      route: "/checkin-log", target: "checkin-log-display",
    }),

    // ─── SYSTEM MAP ─────────────────────────────────────────────────────────
    s("systemmap", {
      emoji: "🗺️", title: `The ${t.system} map`,
      body: `The Analytics map sizes ${t.alters} by ${t.fronting} time and places them by who ${t.fronts} together. "Filters & Display" at the bottom chooses who's shown.`,
      route: "/system-map", target: "system-map-canvas", look: `the highlighted map`,
    }),
    s("systemmap", {
      emoji: "🌌", title: "Inner world",
      body: `The Inner World tab is your own layout. Drag ${t.alters} to place them, build separate maps, stack named layers, and add backdrop pictures.`,
      route: "/system-map", target: "system-map-canvas", look: `the "Inner World" tab at the top`,
    }),
    s("systemmap", {
      emoji: "📍", title: "Places",
      body: `Tap a place's name, or double-tap it, to rename, recolour, resize or lock it. A place can link to another map or layer; tap its ↗ to go there.`,
      route: "/system-map", target: "system-map-canvas",
    }),
    s("systemmap", {
      emoji: "🏠", title: "Place profiles",
      body: `Every place has its own profile page, like an ${t.alter}'s, with the places inside it and who's there. Prefer text? The Canvas/List switch lists every place.`,
      route: "/system-map", target: "system-map-canvas",
    }),
    s("systemmap", {
      emoji: "🔗", title: "Relationships",
      body: `Below the map, the relationships panel lists how ${t.alters} are related. Add your own types in Settings → ${t.Alters} → Relationship types.`,
      route: "/system-map", target: "system-map-canvas", look: `scroll below the map`,
    }),

    // ─── SUPPORT ────────────────────────────────────────────────────────────
    s("grounding", {
      emoji: "🫧", title: "Support",
      body: `This page has two tabs, Support and Learn. The ring at the top breathes with you; tap its pattern's name to change it. The 🫧 bubble on every screen brings you back here.`,
      route: "/grounding", target: "grounding-tabs", look: `the highlighted Support / Learn tabs`,
    }),
    s("grounding", {
      emoji: "🌳", title: "Browse all techniques",
      body: `Every grounding technique, by kind. Tap one for a step-by-step guide. Rate it, add your own notes, and favourite it so it comes first.`,
      route: "/grounding", target: "grounding-browse", look: `the highlighted "Browse all" button`,
    }),
    s("grounding", {
      emoji: "🧭", title: "Help me figure out what I need",
      body: `Pick how you feel right now and the app suggests three techniques and a breathing exercise. If it's a crisis, help lines come first.`,
      route: "/grounding", target: "grounding-state-check", look: `the highlighted button`,
    }),
    s("grounding", {
      emoji: "🌬️", title: "Guided breathing",
      body: `Box breathing, 4-7-8, a longer out-breath and more, each with a moving guide for breathing in, holding and out. Set how long it lasts.`,
      route: "/grounding", target: "grounding-breathing", look: `the highlighted "Guided breathing" button`,
    }),
    s("grounding", {
      emoji: "🎧", title: "Soundscape",
      body: `Brown noise, rain, wind, waves or soft tones, drawn as they play. It keeps going while you move around the app, with a small bar to stop it.`,
      route: "/grounding", target: "grounding-soundscape", look: `the highlighted "Soundscape" button`,
    }),
    s("grounding", {
      emoji: "🎛️", title: "Shape the sound",
      body: `Tune warmth, pitch, a binaural beat, the rain, and whether it stays steady or drifts. Set a timer, and save sounds you like.`,
      route: "/grounding", target: "grounding-soundscape",
    }),
    s("grounding", {
      emoji: "🌠", title: "Focus",
      body: `Focus shows the visual full screen, with a breathing guide if you like. Pick a visual: Calm, Layers, Stars, Fractal or Detailed.`,
      route: "/grounding", target: "grounding-soundscape",
    }),
    s("grounding", {
      emoji: "🌿", title: "Nature sounds",
      body: `Rain, storms, waves, birdsong and forests recorded around the world. They stream when you play them, so they add nothing to the app's size.`,
      route: "/grounding", target: "grounding-nature", look: `the highlighted "Nature sounds" button`,
    }),
    s("grounding", {
      emoji: "🎲", title: "Favourites and shuffle",
      body: `Heart the sounds you like, filter by tag, shuffle, or jump to a random spot in a long recording. On the phone app you can save a sound to play offline.`,
      route: "/grounding", target: "grounding-nature",
    }),
    s("grounding", {
      emoji: "✨", title: "Scratch pad",
      body: `A particle sandbox. Press and drag to draw particles; when you let go, a ruleset decides what they do.`,
      route: "/grounding", target: "grounding-scratchpad", look: `the highlighted "Scratch pad" button`,
    }),
    s("grounding", {
      emoji: "🌀", title: "Rulesets",
      body: `Pick a ruleset like Whirlpool, Drift or Orbit, or tune each rule yourself. Tilt the phone and the particles slide that way. It opens full screen too.`,
      route: "/grounding", target: "grounding-scratchpad",
    }),
    s("grounding", {
      emoji: "📚", title: "Learn",
      body: `13 modules of short lessons, from Grounding to Building on Progress, each with reflection prompts. "Try Now" opens a technique right from the reading.`,
      route: "/grounding", target: "grounding-tabs", look: `tap the "Learn" tab`,
    }),
    s("grounding", {
      emoji: "📖", title: "Resources",
      body: `The Resources tile on the Learn tab credits the workbooks the lessons come from, mainly Finding Solid Ground, and links further reading.`,
      route: "/grounding", look: `the Resources tile at the top of the Learn tab`,
    }),
    s("grounding", {
      emoji: "🛡️", title: "Safety plan",
      body: `Your safety plan keeps warning signs, coping cards and your window of tolerance in one place. Fill it in a little at a time, in a calmer moment.`,
      route: "/safety-plan", look: `the Safety Plan page`,
    }),

    // ─── CONTACTS ───────────────────────────────────────────────────────────
    s("contacts", {
      emoji: "📇", title: "Contacts",
      body: `Contacts is for people outside the ${t.system}: friends, family, therapists. Each has a profile: Safe, Caution or Unsafe, phone and email, and whether they know about the ${t.system}.`,
      route: "/contacts", look: `the Contacts page — tap "Add" to make one`,
    }),
    s("contacts", {
      emoji: "🆘", title: "Emergency support",
      body: `Flag someone as an emergency support contact and they show in a "who can I ask for help?" banner at the top, with one-tap call or text.`,
      route: "/contacts",
    }),
    s("contacts", {
      emoji: "🗂️", title: "Your way",
      body: `Add your own fields (birthday, how you met…), sort people into categories, and rename the Safe, Caution and Unsafe labels under "Labels".`,
      route: "/contacts",
    }),
    s("contacts", {
      emoji: "🤝", title: "Time together",
      body: `On a contact's profile, "I'm with them" tracks time together. They show under "Currently with" on the home screen until you end it.`,
      route: "/contacts",
    }),
    s("contacts", {
      emoji: "🔗", title: "How they're connected",
      body: `A contact's Relationships page records how they relate to the ${t.system}, one ${t.alter} or a group. The link shows on that ${t.alter}'s profile too.`,
      route: "/contacts", look: `a contact's profile → Relationships`,
    }),

    // ─── THERAPY REPORT ─────────────────────────────────────────────────────
    s("therapy", {
      emoji: "📄", title: "Therapy report",
      body: `A summary of any stretch of time to bring to therapy: ${t.fronting}, feelings, symptoms, sleep and more, across amnesia gaps. Pick the last 7 or 30 days, or your own dates.`,
      route: "/therapy-report", target: "therapy-report-builder", look: `the dates at the top of the builder`,
    }),
    s("therapy", {
      emoji: "🛋️", title: "Save things for therapy",
      body: `Anywhere you can type a ~command, type ~therapy and what you want to bring up. It waits here under "To bring up" for your next report.`,
      route: "/therapy-report", target: "therapy-notes", look: `the "To bring up" card`,
    }),
    s("therapy", {
      emoji: "⚙️", title: "Choose what's in it",
      body: `Every section has its own switch, with Select all and Clear all. Turn on just what you want to talk about.`,
      route: "/therapy-report", target: "therapy-report-builder",
    }),
    s("therapy", {
      emoji: "🎛️", title: "How much detail",
      body: `Each section you turn on offers its own detail, like journal titles or full entries, or a ${t.fronting} summary instead of every session.`,
      route: "/therapy-report", target: "therapy-report-builder",
    }),
    s("therapy", {
      emoji: "🙈", title: "Leave things out",
      body: `Symptoms, Activities and ${t.Alter} Profiles have "manage exclusions": untick anything to leave just that out of the report.`,
      route: "/therapy-report", target: "therapy-report-builder",
    }),
    s("therapy", {
      emoji: "💾", title: "Export and templates",
      body: `Download PDF makes the report; on a phone it opens the share sheet. Copy as text works for email. Save your choices as a template for next time.`,
      route: "/therapy-report", target: "therapy-report-builder", look: `the buttons at the bottom of the builder`,
    }),

    // ─── SETTINGS ───────────────────────────────────────────────────────────
    s("settings", {
      emoji: "⚙️", title: "Finding your way",
      body: `Settings is one list, grouped: You, General, Look, ${t.Alters}, Tracking, Notifications, Data & privacy, About. Type what you want to change in the search box to jump straight to it.`,
      route: "/settings", target: "settings-quick-nav", look: `the highlighted search box`,
    }),
    s("settings", {
      emoji: "✏️", title: `Name and words`,
      body: `Profile is where your ${t.system}'s name lives, and Terminology changes the words the app uses, like "${t.system}", "${t.alter}" and "${t.fronting}". Changes show everywhere at once.`,
      route: "/settings", target: "settings-system", look: `the highlighted Profile row`,
    }),
    s("settings", {
      emoji: "🎨", title: "Appearance",
      body: `Every look setting lives in Display options: fonts and text size, shape, bars, colours, themes and presets. This row under Look opens it; the New UI and language switches are under General.`,
      route: "/settings", target: ["settings-display-options", "settings-appearance"], look: `the Display options row, under Look`,
    }),
    s("settings", {
      emoji: "💾", title: "Presets and themes",
      body: `In Display options → Styles, save your look as a preset, choosing which parts it keeps. Link a preset to an ${t.alter} and the app changes to their look when they ${t.front}.`,
      route: "/settings", target: ["settings-display-options", "settings-appearance"], look: `Display options → Styles`,
    }),
    s("settings", {
      emoji: "♿", title: "Sizes for low vision",
      body: `Accessibility keeps low-vision mode, reduce motion and high contrast. Text size, tap targets and bar height are in Display options — this button opens it.`,
      route: "/settings#accessibility", target: ["settings-a11y-display-options", "settings-accessibility"], look: `the Display options button on the Accessibility page`,
    }),
    s("settings", {
      emoji: "🧩", title: t.Alters,
      body: `Custom fields for every profile, relationship types, archived ${t.alters} and contacts, a duplicate finder, ${t.alter} order, list labels, and profile layouts and songs.`,
      route: "/settings", target: "settings-alters", look: `the highlighted ${t.Alters} group`,
    }),
    s("settings", {
      emoji: "💜", title: "Tracking",
      body: `Shortcuts, the check-in manager, your own emotions and triggers, ${t.fronting} levels, and grouping analytics by group for big ${t.systems}.`,
      route: "/settings", target: "settings-checkin", look: `the highlighted Tracking group`,
    }),
    s("settings", {
      emoji: "⚡", title: "Shortcuts",
      body: `Shortcuts are one-tap actions you build: set ${t.front}, start an activity, post a status, add a to-do, open a page and more. Tap Add, fill it in and name it.`,
      route: "/settings#shortcuts", target: ["settings-quick-actions", "settings-checkin"], look: `the Shortcuts page, under Tracking`,
    }),
    s("settings", {
      emoji: "✋", title: "Using shortcuts",
      body: `Hold any key on the quick actions bar, or the apps button, and your shortcuts pop up right there. On the classic home screen, hold Quick Check-In.`,
      route: "/settings#shortcuts", target: ["settings-quick-actions", "settings-checkin"],
    }),
    s("settings", {
      emoji: "🪞", title: `More than one ${t.system}`,
      body: `Keep several ${t.systems}, each with its own ${t.alters}, journals and settings. Add, switch, rename or delete one (a backup is saved first). Tap your ${t.system}'s name on the home screen to switch.`,
      route: "/settings", target: "settings-systems", look: `the highlighted ${t.Systems} row`,
    }),
    s("settings", {
      emoji: "🔒", title: "Your data stays here",
      body: `Everything stays on this device, and there's no account. Data leaves only when you choose: a backup, Friends, cloud reminders, an import, or device sync.`,
      route: "/settings", target: "settings-data", look: `the highlighted Data & privacy group`,
    }),
    s("settings", {
      emoji: "🔐", title: "Password lock",
      body: `For extra safety, turn on encryption under Storage & encryption. It locks everything on this device behind a passphrase. "Keep original images" lives here too.`,
      route: "/settings#storage", target: ["settings-storage", "settings-data"], look: `the Storage & encryption page, under Data & privacy`,
    }),
    s("settings", {
      emoji: "💾", title: "Backups",
      body: `Export a full backup as .json, or "Everything (.zip)" with all your pictures, songs and files too. Import either one to restore.`,
      route: "/settings", target: "settings-data",
    }),
    s("settings", {
      emoji: "⏰", title: "Automatic backups",
      body: `Auto-backup saves a backup on a schedule, and can lock it with a password and give it a plain name. If backups go stale, an amber card on the home screen backs up in one tap.`,
      route: "/settings", target: "settings-data",
    }),
    s("settings", {
      emoji: "☁️", title: "A copy off this device",
      body: `On the phone and desktop apps, "Keep a copy off this phone" copies every backup to Google Drive, OneDrive, Dropbox or an SD card.`,
      route: "/settings", target: "settings-data",
    }),
    s("settings", {
      emoji: "📋", title: "When downloads are blocked",
      body: `Some in-app browsers block downloads. Copy/Paste Backup, just under the download button, saves your data as text you can paste somewhere safe.`,
      route: "/settings", target: "settings-data",
    }),
    s("settings", {
      emoji: "🗜️", title: "Lots of files",
      body: `Under Advanced you can back up just files, one type at a time, or in .zip parts. Files marked with the cloud button in Assets stay out of backups.`,
      route: "/settings", target: "settings-data",
    }),
    s("settings", {
      emoji: "🧭", title: "Find my data",
      body: `If the app ever opens looking empty, tap "Find my data" on the home or welcome screen before setting up or importing anything.`,
      route: "/settings", target: "settings-data",
    }),
    s("settings", {
      emoji: "🔍", title: "See your data",
      body: `A plain list of what's stored here, by category, with counts and sizes. Export one category, or delete one; a backup of it is saved first.`,
      route: "/settings#data-inspector", target: ["settings-data-inspector", "settings-data"], look: `the "See your data" page, under Data & privacy`,
    }),
    s("settings", {
      emoji: "🔌", title: "Sync between devices",
      body: `Keep two of your devices in step with no cloud. Plug your phone into your computer, or use a USB stick; each device writes its own file and reads the other's.`,
      route: "/settings#device-sync", target: ["settings-device-sync", "settings-data"], look: `the "Sync between devices" page, under Data & privacy`,
    }),
    s("settings", {
      emoji: "🛟", title: "Sync never deletes",
      body: `Something removed on one device but kept on the other comes back. Anything the other device dropped is listed for you to decide on.`,
      route: "/settings#device-sync", target: ["settings-device-sync", "settings-data"],
    }),
    s("settings", {
      emoji: "⚖️", title: `When ${t.fronts} disagree`,
      body: `If both devices logged a ${t.switch}, you choose which is right. "Compare ${t.front} history between devices" shows both, day by day.`,
      route: "/settings#device-sync", target: ["settings-device-sync", "settings-data"],
    }),
    s("settings", {
      emoji: "⬇️", title: "Check for updates", desktopOnly: true,
      body: `On the desktop app, "Check for updates" at the top of Settings downloads a newer version, saves everything, and restarts on it.`,
      route: "/settings", target: "settings-desktop-update", look: `the highlighted "Check for updates" button`,
    }),
    s("settings", {
      emoji: "🔁", title: "Re-run setup",
      body: `The setup guide can be run again any time from About → Tour & onboarding. It never deletes or overwrites anything, so another ${t.alter} can walk through it too.`,
      route: "/settings#tour", target: ["rerun-setup", "settings-about"], look: `the highlighted "Re-run setup" button`,
    }),
    s("settings", {
      emoji: "🧪", title: "Experimental features",
      body: `Needs, Goals and Mods are still settling, so they stay hidden until you switch on Experimental features, under General. Switching it off only hides them.`,
      route: "/settings", target: "settings-experimental", look: `the Experimental features row, under General`,
    }),
    s("settings", {
      emoji: "📦", title: "Tracking presets",
      body: `"Browse presets" offers packs of things some ${t.systems} track, like Dissociation, Focus, Sensory and Daily care. Tick what fits; nothing is added twice.`,
      route: "/manage-checkin", target: "symptom-presets", look: `the highlighted "Browse presets" button`,
    }),
    s("settings", {
      emoji: "💗", title: "Who feelings belong to",
      body: `The Feelings tab holds your emotions, and decides who an entry belongs to when you don't say: everyone in ${t.front}, all but some levels, or nobody.`,
      route: "/manage-checkin", target: "checkin-feelings-tab", look: `the highlighted Feelings tab`,
    }),
    s("settings", {
      emoji: "🎯", title: "One feeling, chosen people",
      body: `In Quick Check-In, hold an emotion to pick exactly who feels it. Small coloured dots mark feelings that belong to someone other than the default.`,
      route: "/manage-checkin", target: "checkin-feelings-tab",
    }),
    s("settings", {
      emoji: "🕰️", title: "Recent changes",
      body: `Recent Changes keeps a copy of profile edits, layout changes, sync replacements and anything removed for good. Open one to see what was there, then Restore it.`,
      route: "/history", target: "history-archive", look: `the Recent Changes page`,
    }),
    s("settings", {
      emoji: "👤", title: "Restoring someone",
      body: `A restored ${t.alter} comes back as themselves, so their ${t.fronting} history and groups reconnect. Each kind of change keeps its own history, so one burst can't crowd out another.`,
      route: "/history", target: "history-archive",
    }),
    s("settings", {
      emoji: "🗑️", title: "The trash",
      body: `Deleting moves things to the trash here. Things deleted together come back together. The trash empties after 30 days, or however long you choose.`,
      route: "/history", target: "trash", look: `the Trash at the top of Recent Changes`,
    }),
    s("settings", {
      emoji: "⏳", title: "The time lock",
      body: `Turn on the time lock and nobody can delete protected things early: ${t.alters} with history, groups, journals, channels, bulletins and maps.`,
      route: "/history", target: "trash",
    }),
    s("settings", {
      emoji: "🧩", title: "Mods", experimental: true,
      body: `Mods add extra features. This page has a library that comes with the app, and Install adds one someone shared as a .osmod file.`,
      route: "/mods", target: "mods-page", look: `the Mods page`,
    }),
    s("settings", {
      emoji: "🛡️", title: "What a mod can do", experimental: true,
      body: `You'll see what a mod adds and tick what it may see. Mods run walled off with no internet, only change their own data, and their data stays in your backups.`,
      route: "/mods", target: "mods-page",
    }),

    // ─── FRIENDS ────────────────────────────────────────────────────────────
    s("friends", {
      emoji: "🤝", title: "Friends",
      body: `Share who's ${t.fronting} with people you trust. Swap friend codes, each accept the request, and you'll see each other's ${t.front}.`,
      route: "/friends", target: "friends-code", look: `your friend code`,
    }),
    s("friends", {
      emoji: "🔔", title: `${t.Front} updates`,
      body: `"Notify on change" sends a push when a friend's ${t.front} changes; their status also refreshes here every 30 seconds. Privacy levels choose how much you share.`,
      route: "/friends", look: `a friend's card`,
    }),
    s("friends", {
      emoji: "🔐", title: `Sharing ${t.alters}`,
      body: `Make privacy levels that choose what's shown (name, pronouns, bio…) and put ${t.alters} in them. Everyone stays private until you do.`,
      route: "/friends", look: `any profile's Info → ⋯ → Sharing`,
    }),
    s("friends", {
      emoji: "🗝️", title: "Only they can read it",
      body: `On a friend's card, grant the levels they may see. It's end-to-end encrypted, so only that friend can read it. Compare a safety number to be sure it's really them.`,
      route: "/friends", look: `a friend's card → "Members this friend can see"`,
    }),

    // ─── SYSTEM CHAT ────────────────────────────────────────────────────────
    s("chat", {
      emoji: "💬", title: `${t.System} chat`,
      body: `A chat for ${t.alters} to talk to each other. Make channels for different topics, and pick who's speaking so the history reads like a conversation.`,
      route: "/chat",
    }),
    s("chat", {
      emoji: "📂", title: "Channels",
      body: `On a phone, the panel button on the left of the header slides the channel list in. Sort channels into coloured categories; Edit lets you drag them around.`,
      route: "/chat", look: `the panel button on the left of the header`,
    }),
    s("chat", {
      emoji: "↩️", title: "Replies and mentions",
      body: `Reply to a message to quote it. @mention an ${t.alter} and it shows in their mentions.`,
      route: "/chat",
    }),
    s("chat", {
      emoji: "🤫", title: "Whispers",
      body: `Type "/w @name [secret]" to hide the bracketed part as a whisper to those ${t.alters}. It works in bulletins, comments and notes too.`,
      route: "/chat",
    }),
    s("chat", {
      emoji: "🔒", title: "Private channels",
      body: `A private channel is for chosen ${t.alters}. When none of them are ${t.fronting}, its name is hidden and opening it asks first.`,
      route: "/chat",
    }),
    s("chat", {
      emoji: "📎", title: "Pictures and files",
      body: `The paperclip attaches pictures, videos, songs or files at full quality; they play right in the chat and are kept in Assets. Chat never goes into therapy reports.`,
      route: "/chat",
    }),

    // ─── DONE ───────────────────────────────────────────────────────────────
    s("done", {
      emoji: "👁️", title: "Want to see it filled in?",
      body: `Settings → About → Preview mode opens an example ${t.system} where every ${t.alter} explains one feature. Your real data stays untouched.`,
      route: "/settings", target: ["settings-preview", "settings-about"], look: `the Preview mode row, under About`,
    }),
    s("done", {
      emoji: "💜", title: "That's the tour",
      body: `Log at your own pace; nothing forgotten in the moment is lost. Replay the tour from the ⚙ menu on the home screen, or tap "Show me around" on any page. Take good care.`,
      route: null,
    }),
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
  // A stand-in alter id so the profile steps register as the profile page.
  const all = buildSteps({}, "_", false).concat(buildSteps({}, "_", false, true));
  const set = new Set();
  for (const s of all) {
    if (s.route && s.section !== "welcome" && s.section !== "newui") set.add(tutorialRouteKey(s.route));
  }
  _routesCache = set;
  return set;
}

export default function FeatureTour({ onClose, restrictToRoute = null }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const t = useTerms();

  // A page tutorial on a profile walks THAT profile.
  const routeAlterId = restrictToRoute?.match(/^\/alter\/([^/?#]+)/)?.[1] || null;
  const [tourAlterId, setTourAlterId] = useState(routeAlterId);
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
    // Page tutorials never make a demo profile: off a profile, the profile
    // steps aren't part of the run anyway.
    if (!altersLoaded || restrictToRoute) return;
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
    const all = buildSteps(t, restrictToRoute ? (tourAlterId || "_") : tourAlterId, tourAlterWasCreated, uiV2On)
      .filter((st) => !(uiV2On && st.classicOnly))
      // Desktop-only controls (the update button) aren't on screen elsewhere.
      .filter((st) => !(st.desktopOnly && !isDesktop()))
      // Needs, Goals and Mods stay out of the tour until experimental
      // features are switched on.
      .filter((st) => !(st.experimental && !experimentalOn));
    if (!restrictToRoute) return all;
    const key = tutorialRouteKey(restrictToRoute);
    return all.filter(s => s.route && tutorialRouteKey(s.route) === key && s.section !== "welcome" && s.section !== "done");
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

  // Each step's highlight is one "generation": a retry still waiting for an
  // earlier step's target must not clear the step on screen now (fast Next
  // taps past a missing target used to wipe the next step's spotlight).
  const highlightGenRef = useRef(0);
  const applyHighlight = useCallback((target, attempt = 0, gen = null) => {
    if (gen == null) gen = ++highlightGenRef.current;
    else if (gen !== highlightGenRef.current) return;
    clearHighlight();
    if (!target) return;
    // A target can list fallbacks: the exact control first, then what holds
    // it (a collapsed Settings section shows the section instead).
    const el = [].concat(target).map((id) => document.querySelector(`[data-tour="${id}"]`)).find(Boolean);
    if (!el) {
      // Retry until the page finishes rendering — up to ~2 s
      if (attempt < 10) setTimeout(() => applyHighlight(target, attempt + 1, gen), 200);
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
                    {/* A page tutorial counts the whole walk-through ("3 of
                        7"); the full tour counts within its section. */}
                    {restrictToRoute ? (
                      <span className="text-[0.625rem] text-muted-foreground">
                        Step {step + 1} of {steps.length}
                      </span>
                    ) : sectionStepCount > 1 && (
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
