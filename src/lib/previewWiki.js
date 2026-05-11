// Wiki-style preview system. Every alter's profile is a walkthrough of one
// part of the app — Dashboard, Alter profile modes, the mini-toolbar, the
// bulletin board, the timeline, the activity tracker, reminders, friends
// mode, and so on. The alters list functions as a table of contents.
//
// The banner shows "walkthrough up to date with vX.Y.Z" — see
// PreviewModeBanner.jsx. When you materially update a wiki section (because
// the underlying feature changed), bump APP_VERSION as usual.
//
// Bios use plain HTML so they render the same in Plain / Simple / Raw modes.
// We deliberately keep them text-heavy and gradient-light so they're
// readable on every theme. Inline images are avoided — the goal is
// reference docs the user can read at their own pace.

let _counter = 0;
function uid(prefix) {
  _counter += 1;
  return `${prefix}-${_counter}-${Date.now()}`;
}
function toMap(records) {
  return Object.fromEntries(records.map((r) => [r.id, r]));
}
function isoOffset(daysAgo, hour = 12, min = 0) {
  const d = new Date();
  d.setHours(hour, min, 0, 0);
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString();
}

// Small helper so each wiki alter has the same shape.
function wikiAlter({ name, alias, role, color, group_id, bio, order_index }) {
  return {
    id: uid("wiki-alter"),
    name,
    alias: alias || "",
    pronouns: "",
    color,
    role,
    bio,
    bio_mode: "raw", // walkthrough text is hand-authored HTML
    group_id,
    order_index,
    friends_visible: false,
    is_archived: false,
    custom_fields: {},
    avatar_url: "",
    birthday: "",
  };
}

// ─── Group / category structure ─────────────────────────────────────────
const GROUPS = [
  { id: "g-start",   name: "1 · Start Here",      order_index: 0, color: "#22d3ee" },
  { id: "g-dash",    name: "2 · Dashboard",       order_index: 1, color: "#a855f7" },
  { id: "g-alters",  name: "3 · Alter profiles",  order_index: 2, color: "#f59e0b" },
  { id: "g-tracking",name: "4 · Tracking",        order_index: 3, color: "#10b981" },
  { id: "g-sharing", name: "5 · Sharing & relay", order_index: 4, color: "#ec4899" },
  { id: "g-notifs",  name: "6 · Notifications",   order_index: 5, color: "#ef4444" },
  { id: "g-personal",name: "7 · Personal",        order_index: 6, color: "#6366f1" },
];

// ─── Bio templates ──────────────────────────────────────────────────────
// Each function returns a string of HTML. Kept inline so the file reads
// top-to-bottom; if any one bio gets unwieldy, split it out.

const intro = (subtitle, lede) => `
  <p style="opacity:0.7;font-size:0.9em;margin-bottom:6px;">${subtitle}</p>
  <p style="font-size:1.05em;line-height:1.55;">${lede}</p>
`;

const section = (title, body) => `
  <h3 style="margin:14px 0 4px;font-size:1em;font-weight:600;">${title}</h3>
  <div style="font-size:0.92em;line-height:1.55;">${body}</div>
`;

const kbd = (text) => `<code style="background:hsl(var(--muted));padding:1px 6px;border-radius:4px;font-family:monospace;font-size:0.9em;">${text}</code>`;

const tip = (body) => `
  <div style="border-left:3px solid hsl(var(--primary));margin:8px 0;padding:6px 10px;font-size:0.88em;opacity:0.85;">
    <strong>Tip:</strong> ${body}
  </div>
`;

// ── 1. Welcome / index ─────────────────────────────────────────────────
const bioWelcome = `
  ${intro("Wiki · Start Here", "This preview is a walkthrough of the whole app. Each alter in this <em>example system</em> covers one feature area — open them in order, or jump to the one you need.")}
  ${section("How to use it",
    `Every wiki alter is a real alter profile, so the same edit modes and tabs that work on your own alters work here. Their bios are read-only walkthroughs. Open the Alters page to see them all grouped by topic, or use the sidebar to jump straight to a category.`)}
  ${section("Reading order if you're new",
    `<ol style="padding-left:22px;margin:4px 0;line-height:1.55;">
      <li><strong>Gestures cheatsheet</strong> — every swipe / long-press / triple-tap in one place.</li>
      <li><strong>Dashboard</strong> — what every tile on the home screen does.</li>
      <li><strong>Alter profiles</strong> → <strong>Edit modes</strong> → <strong>Mini toolbar</strong> — how to build out a profile.</li>
      <li>Pick the tracking + sharing topics you actually care about. Skip anything you don't.</li>
    </ol>`)}
  ${section("Your real data is safe",
    `Preview Mode hides your real data but never touches it. The banner up top exits back to your own system in one tap. Nothing you change in here is saved.`)}
  ${tip(`The version pinned in the banner is the app version this walkthrough was last refreshed against. If you're on a newer build than the banner says, some bits of these wiki pages might be a little out of date.`)}
`;

// ── 2. Gestures cheatsheet ─────────────────────────────────────────────
const bioGestures = `
  ${intro("Wiki · Shortcuts", "Every gesture the app supports, in one place. Worth skimming once — most of the speed wins are here.")}
  ${section("Alter cards (Home + Set Fronters)",
    `<ul style="padding-left:22px;line-height:1.6;">
      <li><strong>Tap</strong> → open the alter profile.</li>
      <li><strong>Swipe right</strong> on a card → toggle them in/out of front.</li>
      <li><strong>Swipe left</strong> → promote to primary fronter, or demote.</li>
      <li><strong>Long-press</strong> (about half a second) → set as primary instantly.</li>
    </ul>
    The Set Fronters modal shows a "swipe right to toggle · left to set primary" hint at the top so you don't have to memorise the directions.`)}
  ${section("Dashboard — Quick Check-In button",
    `<ul style="padding-left:22px;line-height:1.6;">
      <li><strong>Tap</strong> → opens the Quick Check-In modal.</li>
      <li><strong>Long-press</strong> (500 ms) → opens a Quick Actions hold-menu with your configured shortcuts (log a symptom, set front, mark a habit, etc.). The progress bar fills as you hold; vibrates when it pops.</li>
      <li>While the hold-menu is open, scrolling inside it doesn't close it — only a tap off-menu does. Moving more than ~12 px during the press cancels the hold (so an accidental scroll doesn't trigger it).</li>
    </ul>`)}
  ${section("Activity Tracker grid",
    `<ul style="padding-left:22px;line-height:1.6;">
      <li><strong>Double-tap</strong> an empty cell → start a range selection.</li>
      <li><strong>Tap another cell</strong> → close the range. If the start time is in the future, the Plan modal opens; otherwise the Log modal opens.</li>
      <li><strong>Double-tap</strong> a cell with activities → opens the details sheet.</li>
      <li>Single-tap a cell with activities does <em>nothing</em> — this is deliberate so scrolling and picking a slot don't accidentally open the details sheet.</li>
    </ul>`)}
  ${section("Timeline",
    `<ul style="padding-left:22px;line-height:1.6;">
      <li><strong>Tap</strong> an alter bar → session popover (info, end-now, edit).</li>
      <li><strong>Double-tap</strong> a bar → jump straight to the edit form.</li>
      <li><strong>Long-press</strong> an empty area → retro entry picker (log a session or a check-in at a past time).</li>
      <li>Column widths and the row height are draggable from the right edge of each header.</li>
    </ul>`)}
  ${section("Bulletin board",
    `<ul style="padding-left:22px;line-height:1.6;">
      <li><strong>Long-press</strong> a bulletin → action menu (Pin to top of dashboard / Pin on board / Open / Delete).</li>
      <li><strong>Double-tap</strong> a bulletin card → jump to the standalone page for it.</li>
      <li>Comment ${kbd("Trash")} tap → 10-second countdown before delete. Tap again to confirm now, or just wait it out.</li>
      <li><strong>Tap</strong> the "you were mentioned" banner → jumps to the bulletin you were mentioned in and marks it read. The X dismisses without navigating.</li>
    </ul>`)}
  ${section("Bio editor",
    `<ul style="padding-left:22px;line-height:1.6;">
      <li><strong>Drag</strong> the grip handle at the left of a block header → reorder blocks. Chevron up/down buttons are the keyboard fallback.</li>
      <li>The pencil icon on the mini-toolbar (✎) wraps selected text in a <em>${'\\u003C'}span data-edit="true"${'\\u003E'}</em> region — that region becomes click-to-edit in Simple mode.</li>
    </ul>`)}
  ${section("Privacy panic — triple-tap",
    `Tap the screen <strong>three times within 500 ms</strong>, anywhere, → the Grocery List privacy cover opens over the entire app. Looks like a generic to-do list; the bottom tab bar is fully hidden. Useful when you need to glance away without revealing what app you were using. The gesture is suppressed while you're typing in an input or textarea.`)}
  ${section("Pull-to-refresh (mobile)",
    `Drag down from the top of the page → spinner appears at ~72 px of pull, refreshes when you let go. Resistance increases the further you drag so an over-pull doesn't feel violent.`)}
`;

// ── 3. Dashboard ───────────────────────────────────────────────────────
const bioDashboard = `
  ${intro("Wiki · Dashboard", `The dashboard ('/') is the at-a-glance home for "what is happening right now". Top to bottom:`)}
  ${section("Header bar",
    `App logo on the left (tap → home). Centered title "${"Oceans Symphony"}". On the right: a 🛒 grocery list button (also opens via triple-tap), the notification bell (= reminders + push), and Settings. The bar has a faint primary-tinted wave block on its top half; the wave scrolls slowly. The bottom border matches the bottom tab bar so the header reads as a defined band.`)}
  ${section("Currently Fronting strip",
    `Cards for every active fronting alter. The primary fronter is marked with a star + a green pulse. Cards have the swipe gestures from the Gestures alter:
      <ul style="padding-left:22px;margin:4px 0;line-height:1.55;">
        <li>Swipe right → remove from front.</li>
        <li>Swipe left → promote to primary (or demote).</li>
        <li>Tap → open the alter profile.</li>
      </ul>
      The "Set Front" button on the right opens the full modal with search, sort, alphabetised list, and the trash icon for clearing the front entirely.`)}
  ${section("Pinned strip",
    `Bulletins or tasks you long-pressed → "Pin to top of dashboard", plus any to-dos marked urgent (amber styling) or pinned. Urgent to-dos float to the top. Pinned tasks render as proper task cards with their checkbox; pinned bulletins render with full content.`)}
  ${section("Critical plans strip",
    `Activity plans flagged <em>critical</em> appear here when their lead-step window opens (e.g. 1h before, 15m before). Tap the X to dismiss until the next narrower window — they reappear as the plan gets closer. A plan disappears for good 10 minutes after its end time.`)}
  ${section("Quick Check-In + Quick Actions hold-menu",
    `Big "❤ Quick Check-In" button. Tap → full check-in modal. Long-press → hold-menu with your configurable shortcuts (Took meds / Brush teeth / Log location / start a symptom session / etc.). Configure shortcuts in Settings → Tracking & Analytics → Quick Actions.`)}
  ${section("Search everything",
    `Searches across all entities — alters, bulletins, journals, check-ins, tasks, locations. Tap a result to jump to it.`)}
  ${section("Nav grid",
    `Tiles for every page (Alters, Timeline, Activities, Journals, System Meeting, …). Re-orderable in Settings → Appearance → Navigation Settings. The To-Do tile shows an amber badge for the count of urgent OR due-within-72-hours tasks. The Reminders tile shows a red badge for currently-firing instances.`)}
  ${section("Bulletin Board",
    `The board lives at the bottom of the dashboard. Quick task input above and the composer below. See the Bulletin Board wiki alter for the full feature set.`)}
  ${tip(`The "Guide" and "Tour" buttons (top of the dashboard) launch the in-app feature tour and the onboarding cards. They're separate flows — the tour points at real UI in your system; the guide is the cards explanation.`)}
`;

// ── 4. Alters & Groups ─────────────────────────────────────────────────
const bioAltersGroups = `
  ${intro("Wiki · Alters page", `The "Alters" page (a.k.a. /Home) is the directory. List view, grid view, search, sort, and groups.`)}
  ${section("Layout",
    `System name banner on top (rename in Settings → Profile). Currently-fronting strip just below. Pinned strip below that. Then the alters list itself. The bottom of the page has a "Plan Activity" + Reminders area on Home; that's a Dashboard hand-off, not Alters proper.`)}
  ${section("Search + sort + view modes",
    `Search filters by name, alias, role, custom fields. Sort menu: A→Z, Z→A, most fronting time first, most recent front, custom order (drag handle appears in the alter cards). View modes: list (default), grid, mini, raw — same data, different density.`)}
  ${section("Groups",
    `Folders. An alter can be in multiple groups. Drag-to-reorder. Nest a group inside another to build a hierarchy (e.g. "Subsystems" → "Garden" → "Garden hosts"). Tap a group to filter the list to its members.`)}
  ${section("Gestures on an alter card",
    `Same vocabulary as the dashboard:
      <ul style="padding-left:22px;margin:4px 0;line-height:1.55;">
        <li>Tap → open profile.</li>
        <li>Swipe right → toggle front.</li>
        <li>Swipe left → promote/demote primary.</li>
        <li>Long-press → set as primary directly.</li>
      </ul>
      In grid view the cards animate the action label as you drag.`)}
  ${section("Add / archive",
    `"+ Add Alter" creates a new one with just a name; everything else is editable inside the profile. Archiving moves an alter out of the active list (they still show in front history); manage from Settings → Alters & Fields → Archived Alters.`)}
`;

// ── 5. Alter profile: edit modes ───────────────────────────────────────
const bioEditModes = `
  ${intro("Wiki · Alter profile · Edit modes", `Four bio editing modes, each useful for a different stage of building a profile.`)}
  ${section("Plain",
    `Renders any custom HTML / template as-is and lets you freely edit the visible text. The mini-toolbar appears when you select; you can add formatting on top of an existing template without breaking its code. Good for: heavy edits, full rewrites, raw notes.`)}
  ${section("Simple",
    `Same rendering as Plain but only text wrapped in <code style="font-family:monospace;font-size:0.9em;">${"\\u003C"}span data-edit="true"${"\\u003E"}</code> is editable. Everything else is read-only. Wrap a bit of your template's text in an editable region via the pencil icon (✎) on the mini-toolbar. Good for: shared templates where the layout shouldn't change but a few fields should.`)}
  ${section("Blocks",
    `The structured editor. Add text blocks, image blocks (solo, left, right, gallery), dividers, raw HTML blocks. <strong>Drag the grip handle</strong> at the left of any block header to reorder; chevron buttons are a keyboard fallback. Most users live here.`)}
  ${section("Raw",
    `Shows the entire profile as a single raw HTML field. Use when you want to paste a template wholesale, or for advanced edits. The mini-toolbar still applies to the selected text.`)}
  ${section("Import template",
    `"Import Template" button accepts OS or Simply Plural templates as text or pasted HTML. Lands in Blocks mode; switch to Plain or Simple to fill in the fields without breaking the code.`)}
  ${section("Profile style — per alter",
    `Beyond the bio: each alter can override <strong>background colour</strong>, <strong>background image</strong>, <strong>page text colour</strong>, <strong>header text colour</strong>, and a <strong>page-specific font</strong>. The header can be hidden entirely if you'd rather code the top section yourself. Settings live in the Profile Style section at the bottom of the Profile tab.`)}
  ${tip(`Linking an alter to a theme preset (Settings → Appearance → Fronter-linked themes) makes the whole app's theme switch when that alter becomes primary fronter. Pair that with a per-alter profile-style for a fully recoloured experience while they're up.`)}
`;

// ── 6. Mini Toolbar ────────────────────────────────────────────────────
const bioMiniToolbar = `
  ${intro("Wiki · Mini Toolbar", `Reference for every button in the bio editor's mini-toolbar. The simple row is always visible; the advanced row is hidden behind a ▼ More toggle (state persisted).`)}
  ${section("Simple row — formatting",
    `<strong>B</strong> bold (${kbd("<strong>")}) · <strong>I</strong> italic (${kbd("<em>")}) · <strong>S</strong> strikethrough (${kbd("<s>")}) · <strong>U</strong> underline (${kbd("<u>")}). Each wraps the current selection.`)}
  ${section("Simple row — headings",
    `<strong>H1 / H2 / H3</strong>. Each wraps the selection in the matching tag.`)}
  ${section("Simple row — structure",
    `<strong>↵</strong> line break (${kbd("<br />")} at cursor) · <strong>—</strong> divider (a styled ${kbd("<hr />")}).`)}
  ${section("Simple row — links + editable regions",
    `🔗 <strong>Link</strong> wraps selection in an ${kbd("<a href=\"…\">")} with a placeholder href. 🧩 <strong>Internal link</strong> opens a picker (alter, journal, location, check-in, folder) and inserts a routed ${kbd("<a data-internal-link>")}. ✎ <strong>Editable region</strong> wraps selection in ${kbd("<span data-edit=\"true\">")} — that text becomes click-to-edit in Simple mode. Without this wrap, Simple mode is fully read-only.`)}
  ${section("Simple row — colours",
    `Big <strong>A</strong> with gradient bar = text colour. Open the modal, pick from 20 presets or paste a hex. Same shape for highlight colour (translucent background).`)}
  ${section("Advanced row — alignment",
    `Left / Center / Right wrap selection in ${kbd("<div style=\"text-align:…\">")}.`)}
  ${section("Advanced row — font sizing",
    `xs (0.7em) · sm (0.85em) · lg (1.3em) · xl (1.8em + bold). Each wraps a span with an inline style.`)}
  ${section("Advanced row — sup / sub",
    `X² and X₂ wrap in ${kbd("<sup>")} / ${kbd("<sub>")}.`)}
  ${section("Advanced row — blockquote + code",
    `❝ wraps selection in a styled ${kbd("<blockquote>")} with a left border. </> wraps in inline ${kbd("<code>")}.`)}
  ${section("Advanced row — gradient text",
    `✨ Rainbow · 🌊 Ocean · 🔥 Fire · 🌿 Nature — each applies a multi-stop gradient with <code style="font-family:monospace;font-size:0.88em;">-webkit-background-clip: text</code>. Selected text shows through with the gradient.`)}
  ${section("Advanced row — boxed containers",
    `🔲 dark box · 💠 glass (frosted) · 🟣 purple gradient · 🌑 dark radial. Each wraps selection in a ${kbd("<div>")} with rounded corners and padding.`)}
  ${section("Advanced row — text effects",
    `⚡ float · 💥 glow · 🌀 spin · 〰 wave · 👻 faded · 📦 boxed border · blur · rot (rotate 5°). Float / spin / wave depend on app-level CSS keyframes — they degrade gracefully if a downstream renderer strips animations.`)}
  ${section("Advanced row — font picker",
    `<strong>Aa ▼</strong> opens a categorised dropdown (Sans-serif / Serif / Monospace / Handwriting / Display / Cultural) with ~24 bundled fonts. No Google Fonts CDN — everything is offline.`)}
  ${tip(`The mini-toolbar's <em>state</em> (advanced row open vs closed) is saved to ${kbd("localStorage")} so it stays the way you like it across sessions.`)}
`;

// ── 7. Alter profile: fields & tabs ────────────────────────────────────
const bioProfileFields = `
  ${intro("Wiki · Alter profile · Fields & tabs", `Every field and every tab on an alter profile, in order.`)}
  ${section("Profile tab — identity",
    `<strong>Name</strong> — official display name (used everywhere). <strong>Alias</strong> — short tag for @mentions and -signposts. If Alex's alias is "A", typing <code>@a</code> in a bulletin auto-completes to Alex; signing <code>-a</code> in a comment attributes it to them. <strong>Pronouns</strong>, <strong>Role</strong>, <strong>Color</strong> (drives chips, badges, timeline bars), <strong>Birthday</strong>.`)}
  ${section("Profile tab — bio",
    `Big rich-text bio with Plain / Simple / Blocks / Raw modes (see Edit modes wiki). The mini-toolbar applies in every mode (see Mini Toolbar wiki).`)}
  ${section("Profile tab — profile style",
    `Background colour, background image, page text colour, header text colour, page-specific font, toggle the header on or off. Each setting is per-alter and overrides the system theme while you're on their page.`)}
  ${section("Info tab",
    `Custom Fields and their values. Define the schema in Settings → Alters & Fields → Custom Fields (text / number / boolean). Each alter then fills in their values.`)}
  ${section("Board tab",
    `The alter's in-app activity feed. Every bulletin or comment <em>they</em> author, every journal they sign, every check-in they make, and every <code>@mention</code> directed at them lands here. Tap an item to jump to it. The "Message" button at the top of the Board jumps to the Messages tab and opens compose.`)}
  ${section("Messages tab",
    `Direct messages <em>between</em> alters in this system. Pin a message to the top of the home screen via the pin icon — pinned messages stay visible while the recipient is fronting. Compose with the + button.`)}
  ${section("History tab",
    `Front session log for this alter. Every session, with start / end / duration, primary or co-fronter, attached notes, emotions, symptoms, and triggered-switch info.`)}
  ${section("Notes tab",
    `Long-form notes. Imports from Simply Plural notes if you've connected an SP account. Free-form HTML editor.`)}
  ${section("Lineage tab",
    `<strong>Connections map</strong> — predecessors → this alter → successors, from recorded fusion / split events. <strong>Relationships</strong> — explicit per-pair labels (twin, protector of, trauma holder for, split from). <strong>Event log</strong> — fusion, split, dormancy, return entries with cause + notes. "Record Event" button at the top.`)}
  ${section("Options tab",
    `Archive (move out of active list, keeps history), Friends visibility toggle (hide from <em>all</em> friends at once), delete (with confirmation).`)}
`;

// ── 8. Currently Fronting & Switching ─────────────────────────────────
const bioFronting = `
  ${intro("Wiki · Fronting", `The data model is per-alter sessions. One alter is marked <code>is_primary: true</code>, others are co-fronters.`)}
  ${section("Set Fronters modal",
    `Tap "Set Front" on the dashboard, or open it from the Quick Actions menu. Search field, sort menu, list of every active alter. Hints at the top reminder the swipe gestures. Selected alters appear as chips above the list; the starred one is primary.`)}
  ${section("Switching",
    `Selecting a new front saves new ${kbd("FrontingSession")} rows and ends the prior ones. On save you can mark the switch as triggered, journal it, or both. "Unsure" mode ends every active session without a new front — useful for "no one's clearly out".`)}
  ${section("Co-fronters",
    `Multiple alters can be active at once. Co-fronters appear next to the primary in the dashboard strip. Promote any of them to primary via the star, or via the swipe-left gesture on their card.`)}
  ${section("Ghost session sweep",
    `Sometimes a session ends up with <code>is_active: false</code> but no <code>end_time</code> — the row appears as "Active" in the Timeline popover but doesn't surface anywhere else. On every app load (and every time you open the Set Fronters modal) the app sweeps these orphans and fills in their end_time. You won't normally see this happen.`)}
  ${section("Triggered switches",
    `When toggled on the Set Fronters save, the switch gets tagged with a category (sensory / emotional / interpersonal / trauma / physical / internal / unknown) and an optional label. The Timeline marks these sessions with an orange "Triggered switch" badge. After saving a triggered switch in Quick Check-In, a grounding suggestion appears.`)}
  ${section("Friends + front status",
    `If Friends mode is on, every front change pushes a snapshot to the relay so opted-in friends see your current front. The snapshot follows your privacy level (names / count only / hidden) and per-friend overrides — never alters you've hidden from them. See the Friends Mode wiki alter for the data shape.`)}
`;

// ── 9. Bulletin Board ──────────────────────────────────────────────────
const bioBulletinBoard = `
  ${intro("Wiki · Bulletin board", `The board is your system's internal message wall. Lives at the bottom of the dashboard.`)}
  ${section("Authoring",
    `Tap the type-here box to expand the composer. Authoring uses two parsing rules:
      <ul style="padding-left:22px;margin:4px 0;line-height:1.55;">
        <li><strong>@mention</strong> — type ${kbd("@")} and an autocomplete shows matching alters by name or alias. The mentioned alter gets a notification + a "you were mentioned" banner on their next visit.</li>
        <li><strong>-signpost</strong> — type ${kbd("-")} and an alter name to attribute the post to <em>them</em> instead of the current front. Multiple signposts allowed. Useful when a co-fronter wants to leave a note without you having to switch primaries.</li>
      </ul>
      Quick emoji buttons (😊❤️⚠️📌🔔👍💜🌙) at the bottom of the composer insert at cursor.`)}
  ${section("Author attribution",
    `Authors are fixed at write time. If you typed ${kbd("@")} or ${kbd("-")} signposts, those win. Otherwise the post is authored by whoever's currently fronting. If no one was fronting (or the front list hadn't loaded), the post is authored by "System". Authorship doesn't change later — a bulletin Kane wrote stays Kane's even if the front changes ten minutes later.`)}
  ${section("Pinning",
    `Two independent pins: <strong>Pin on board</strong> keeps a bulletin at the top of the board. <strong>Pin to top of dashboard</strong> surfaces it in the Dashboard's Pinned strip. A bulletin can be on both, on one, or on neither. The dashboard pin is also available for tasks.`)}
  ${section("Tasks via bulletins",
    `A bulletin whose content starts with ${kbd("[task:UUID]")} renders as a checkbox task card. The Quick task input above the composer creates these — type "buy bread", press Enter, you get a task + a bulletin. Toggling the checkbox toggles the underlying Task entity. Append ${kbd(":done")} after the UUID to render as completed.`)}
  ${section("Comments + reactions",
    `Comments are nested up to 2 levels in the card view, unlimited on the standalone page. Same @mention + -signpost grammar. Trash icon → 10-second countdown before the comment actually deletes (tap again to confirm immediately). Reaction pills (👍❤️😊😂😢💜🔥⚠️) work the same as on bulletins; tap a count to see who reacted.`)}
  ${section("Long-press action menu",
    `Long-press a bulletin → menu: Pin to top of dashboard / Pin on board / Open / Delete. Delete has a two-tap confirm.`)}
  ${section("Mention banner",
    `When you switch to an alter who has unread mentions, a "Hey {name}, you were mentioned" banner appears at the top of the board. Tap it → page scrolls to the first unread mention, highlights it, and marks all of them read. The X dismisses without navigating.`)}
`;

// ── 10. Timeline ───────────────────────────────────────────────────────
const bioTimeline = `
  ${intro("Wiki · Timeline", `Vertical day-by-day timeline showing front sessions, check-ins, activities, emotions, symptoms, locations, and events side-by-side.`)}
  ${section("Columns",
    `Left-to-right: time labels, alters, symptoms, events (journals / bulletins / check-ins / tasks), emotions, locations, activities. Every column is independently resizable from its right edge — drag the handle to widen / narrow.`)}
  ${section("Alter bars",
    `Each active session draws as a vertical bar in the alter column. Width = avatar size, height = session length. Primary fronter has an amber border + glow; co-fronters have a white border. A session with a status note shows a 💬 badge at the bottom-right of the avatar.`)}
  ${section("Status notes",
    `Free-form notes attached to a fronting session — different concept from journal entries. Add via the session edit popover. Inline badges on the timeline are clickable.`)}
  ${section("Tap an alter bar",
    `Opens the session info popover: start / end / duration / triggered-switch info if any / session notes / emotions / symptoms. Buttons:
      <ul style="padding-left:22px;margin:4px 0;line-height:1.55;">
        <li><strong>End session now</strong> (only when the session is live or has no end time) — one tap, no extra modal.</li>
        <li><strong>Edit session</strong> — opens the full editor (start, end, "still fronting", primary toggle, delete with two-tap confirm).</li>
        <li><strong>View profile</strong> — jumps to the alter's profile page.</li>
      </ul>
      Errors on save now surface as a toast — earlier builds could silently fail.`)}
  ${section("Long-press an empty area",
    `Retro entry picker. Pick a past time, choose <strong>Front Session</strong> (log a session retroactively) or <strong>Quick Check-In</strong> (back-date a check-in to that time).`)}
  ${section("Daily tally panel",
    `Below the timeline. Per-day rollup: total activities, switch count, fronting time per alter, top emotions, check-in counts, symptom sessions, journal list, tasks, custom statuses, bulletin list. Each row tap-jumps to that record.`)}
`;

// ── 11. Activity Tracker ───────────────────────────────────────────────
const bioActivities = `
  ${intro("Wiki · Activity Tracker", `Track what your system actually does — work, errands, rest, therapy, meals. Two tabs: Logged (past) and Planned (future).`)}
  ${section("Views",
    `Week (default), Month, Year. Week is a 7-day hourly grid. Month is a calendar with day-level heatmap dots. Year is a 3×4 grid of mini-months; tap a day or month to drill down.`)}
  ${section("Logging an activity",
    `Double-tap an empty cell → select start. Tap another cell → select end. The Log modal opens with the date / time pre-filled. Pick a category (or create one inline), optionally pick alters who were fronting (auto-suggested from fronting history during that range), add notes, save.`)}
  ${section("Planning a future activity",
    `Same double-tap → tap flow, but if the start time is in the future, the <strong>Plan</strong> modal opens instead. Extra fields: title (one-off events without polluting your category list), location, critical toggle, "Link to a to-do" picker. Save → it lands on the Planned tab and renders on the grid as a faded block.`)}
  ${section("To-Do integration",
    `When you link a to-do to a plan, the task's <code>due_date</code> syncs to the plan's start date. The to-do list and the activity tracker stay in sync. Tasks with <code>scheduled_at</code> or <code>due_date</code> appear on the grid as pills (indigo by default, amber if urgent); tapping one opens the to-do.`)}
  ${section("Urgent / critical plans",
    `Mark a plan as critical when planning. Pick lead-step windows (1 day before, 4 hours, 1 hour, 30m, 15m, 5m, "Always"). When any window opens, the plan surfaces in the Dashboard / Home Pinned strip with amber styling. Dismiss the pin → it reappears at the next narrower window. Disappears for good 10 minutes after the plan's end time.`)}
  ${section("Display settings",
    `Per-user grid configuration: row height (6–80 px), column width, grid interval (15m / 30m / 60m), sub-hour ticks vs labels, week starts on Sunday or Monday, 24h vs AM/PM. All persisted to localStorage.`)}
  ${section("Toggles on the grid",
    `<strong>Emotions</strong> overlays emotion bubbles below each activity. <strong>Alters</strong> overlays who was fronting during each activity. Add mode (+) enters range-select mode without needing a double-tap.`)}
`;

// ── 12. Quick Check-In ────────────────────────────────────────────────
const bioQuickCheckIn = `
  ${intro("Wiki · Quick Check-In", `One modal that captures a complete moment — what you're feeling, who's fronting, what you're doing, any symptoms, a diary card, a note, your location.`)}
  ${section("Trigger",
    `Tap the "Quick Check-In" button on the dashboard. Or long-press it for the Quick Actions hold-menu — set up shortcuts (Took meds, log a symptom severity, set front) and trigger them without ever opening the full modal.`)}
  ${section("Section pills",
    `Pills along the top toggle which sections are open. None are required; you only fill in what's relevant. Sections:
      <ul style="padding-left:22px;margin:4px 0;line-height:1.55;">
        <li><strong>Feeling</strong> — emotion wheel, multi-select, +Create for custom emotions.</li>
        <li><strong>Fronting</strong> — alter selector with primary star, gestures (tap to toggle, long-press to set primary). Saves new fronting sessions.</li>
        <li><strong>Activity</strong> — category picker, duration, new-activity inline create.</li>
        <li><strong>Symptoms</strong> — start or end a symptom session, severity snapshot.</li>
        <li><strong>Diary</strong> — urges, body/mind, skills used, medication & safety fields.</li>
        <li><strong>Diary card</strong> — full diary template (configurable in Settings).</li>
        <li><strong>Note</strong> — freeform; promoted to a journal entry if > ~50 words.</li>
        <li><strong>Location</strong> — category pills, name input, GPS button.</li>
      </ul>`)}
  ${section("Triggered switch",
    `When the fronting section detects a change of primary, a "🎯 Triggered switch?" toggle appears. Picking a category (sensory / emotional / interpersonal / trauma / physical / internal / unknown) tags the new session(s) so the Timeline shows the orange "Triggered" badge.`)}
  ${section("Grounding suggestion",
    `After a save that includes a triggered switch or a flagged distressing emotion, a small modal asks "Would you like to try a grounding exercise?". One-tap link to the Grounding page.`)}
  ${section("Retroactive entries",
    `Tap the datetime input in the modal header to back-date the whole check-in. Activities, diary cards, emotions, and symptoms all use the back-dated time, not the wall clock.`)}
  ${tip(`Most of the panels above are also reachable from their own pages — but combining them in one check-in is faster, and keeps the timestamps consistent for the moment you're capturing.`)}
`;

// ── 13. To-Do & plans integration ─────────────────────────────────────
const bioTodo = `
  ${intro("Wiki · To-Do list", `One-off tasks with optional due dates and scheduled times. Lives at /todo, integrated with the Activity Tracker.`)}
  ${section("Task fields",
    `<strong>Title</strong> (required). <strong>Description</strong> (with @mentions). <strong>Activity category</strong> — picks from your real categories (the same picker the Activity Tracker uses). <strong>Priority</strong> — Low / Medium / High chip group. <strong>Due date</strong> — a deadline, "must be done by". <strong>Scheduled-at</strong> — a deliberate plan, "I'll do this at". Both optional. <strong>Pin to dashboard</strong> toggle and <strong>Mark as urgent</strong> toggle. <strong>Goal</strong> — target count + unit (e.g. "5 times", "8 glasses").`)}
  ${section("Where tasks surface",
    `<ul style="padding-left:22px;margin:4px 0;line-height:1.55;">
      <li>The To-Do list itself (/todo) with category filter and Show Completed toggle.</li>
      <li>Activity Tracker grid — tasks with a <code>scheduled_at</code> render as 60-min blocks at that time; tasks with only <code>due_date</code> render as pills at 8 AM of the due date. Urgent ones tint amber; the rest indigo. Tapping a task pill opens the to-do, not the activity sheet.</li>
      <li>Dashboard Pinned strip — urgent or pinned-to-dashboard tasks.</li>
      <li>Sidebar + dashboard nav button — an amber badge counts tasks that are urgent OR due within 72 hours.</li>
    </ul>`)}
  ${section("Linking from Plan Activity",
    `When you plan a future activity, the Plan modal has a "Link to a to-do" dropdown. Picking a task associates the plan with it and syncs the task's <code>due_date</code> to the plan's start date. Use this when "I should buy bread by Friday" turns into "I'm going to buy bread Wednesday at 3pm".`)}
  ${section("Categories use your activities",
    `The category dropdown lists every activity category you've set up (work, errands, therapy, etc.). Same picker the Activity Tracker uses — tagging a to-do also feeds the same analytics. The hardcoded "Work / Health / Personal / Learning / Other" list from earlier builds is gone.`)}
`;

// ── 14. Reminders ──────────────────────────────────────────────────────
const bioReminders = `
  ${intro("Wiki · Reminders", `Trigger-based notifications. Lives in the bell icon at the top of the screen.`)}
  ${section("Trigger types",
    `<strong>Scheduled</strong> — specific times on specific days. <strong>Interval</strong> — every N minutes, optionally within an active window. <strong>Contextual</strong> — fires when an app event happens (no front update for N minutes, a specific emotion was logged, an alter starts fronting, a symptom was logged, a sleep activity ended). <strong>Event</strong> — fires once at a specific datetime, with optional pre-alerts (1 day / 1 hour / 15 minutes before).`)}
  ${section("Delivery channels",
    `<ul style="padding-left:22px;margin:4px 0;line-height:1.55;">
      <li><strong>In-app banner</strong> — shows in the corner whenever the app is open. Tap to act, snooze, dismiss.</li>
      <li><strong>Push</strong> — native browser notification, works in the background. Requires browser permission + a registered service worker subscription.</li>
    </ul>
    If you pick push but push isn't enabled on this device, the app automatically adds the in-app channel on save — so a push-only reminder on a device with push off still surfaces visibly.`)}
  ${section("Scope",
    `<strong>System-wide</strong> (default) — fires for everyone. <strong>Specific alter, always</strong> — fires regardless of who's fronting (the alter is the label / context, not the gate). <strong>Specific alter, when fronting</strong> — only fires when that alter is active. Catchup option: queue the reminder until the alter fronts later instead of skipping it.`)}
  ${section("Inline actions",
    `Up to three buttons on the toast: Open Check-In, Open Grounding, Open Set Front, Open Journal, Open Diary, Log Symptom, Open To-Do, Open System Map, Open Timeline, Dismiss, or a custom route. Tap one → routes to the right page and pre-fills.`)}
  ${section("Auto-resolve",
    `Optional rule that <em>suppresses</em> the reminder if its job was already done within the lookback window. Example: a "remember to check in" reminder auto-resolves if you happened to do a check-in in the last 30 minutes.`)}
  ${section("Snooze",
    `Per-reminder snooze options as removable chips (10 min, 1h, 4h, Tomorrow 9am, Next Monday 9am, custom). Snoozed instances re-fire when their snoozed_until timestamp passes.`)}
  ${section("Push diagnostics",
    `Settings → Reminders has a "Test push notification" link that walks the full pipeline (service worker, PushManager, VAPID key, browser permission, registration, subscription, server send) and surfaces the failing step. A second link, "Show local test notification", bypasses push entirely and asks the SW to display directly — if that also doesn't appear, the problem is OS-side (Chrome notification permission, battery optimisation, Do Not Disturb).`)}
`;

// ── 15. Friends Mode ──────────────────────────────────────────────────
const bioFriends = `
  ${intro("Wiki · Friends Mode", `Opt-in cloud relay for sharing your current front with trusted people. Off until you set it up. Lives at /friends.`)}
  ${section("Setup",
    `Pick a display name, optional system name, and a default privacy level. The server gives you back an 8-character friend code (e.g. <code>ABCD-EFGH</code>). Share it with friends; add theirs via the "Add friend" button.`)}
  ${section("Privacy levels",
    `<strong>Full</strong> — friends see fronter names, initials, and colours, plus who's primary. <strong>Count only</strong> — they see "3 fronting" with anonymised "?" placeholders. <strong>Hidden</strong> — they see nothing about your front. Set globally, override per friend.`)}
  ${section("Per-friend overrides",
    `Inside any friend's card → Visibility panel:
      <ul style="padding-left:22px;margin:4px 0;line-height:1.55;">
        <li>Privacy override dropdown — Use global / names / count / hidden.</li>
        <li>Alter-by-alter toggles (only visible when the effective privacy is "names") — hide specific alters from this specific friend. Alters with the global "Friends visible: off" flag are greyed out and locked.</li>
      </ul>`)}
  ${section("What gets sent",
    `Only: system name, display name, the friend list, and your current front status at the chosen granularity. <strong>Never sent</strong>: journals, symptoms, bulletins, locations, activities, anything else. Backend is Upstash Redis behind a Vercel function.`)}
  ${section("Notify on change",
    `Per friend, opt in to receive a banner / push when their front updates. If push isn't enabled on your device when you toggle this on, a warning appears with a link to set it up.`)}
  ${section("Disconnect",
    `"Delete profile" — two-tap confirm. Wipes the server-side identity, removes you from every friend's list, clears local cache. After this, nothing about you is on the relay.`)}
`;

// ── 16. Settings & Themes ─────────────────────────────────────────────
const bioSettings = `
  ${intro("Wiki · Settings & Themes", `Eight sections, quick-nav at the top.`)}
  ${section("Profile",
    `System name + description. "View alter count" reveals the active/archived alter count (hidden by default, each visit starts hidden). Terminology presets at the bottom — pick "Headmates", "Parts (IFS)", "Collective", etc., or set custom words. All app copy honours these.`)}
  ${section("Appearance",
    `Font Family + Heading Font dropdowns (searchable, categorised). Theme mode chip cycles Dark → Light → System → Dark. Eight built-in colour presets (warm, cool, forest, sunset, ocean, berry, charcoal, ivory) plus full custom-colour editing (background / surface / primary / secondary / accent / muted / text / text 2). Save your tweaks as a named preset. "Fronter-linked themes" pairs presets to alters — when an alter becomes primary, the whole app theme switches.`)}
  ${section("Appearance → Navigation Settings",
    `Drag-and-drop which pages appear in the top bar, the bottom bar, or are hidden. Editable in compact list view or a grid editor.`)}
  ${section("Accessibility",
    `Font family (Inter / system / Atkinson Hyperlegible / Nunito), text size (Small / Default / Large / Extra Large), touch target size, nav bar height, high-contrast toggle, reduce-motion toggle (also pauses the header wave animation).`)}
  ${section("Alters & Fields",
    `Custom field schema (text / number / boolean), Relationship type catalog (for the Lineage tab), Archived alters manager.`)}
  ${section("Tracking & Analytics",
    `Quick Actions config (the buttons on the hold-menu), Check-In Manager, Custom Emotions, Custom Trigger Types, Analytics grouping (by alter vs by group).`)}
  ${section("Reminders",
    `Timezone, push toggle, push diagnostics, pause-all kill switch, quiet hours window, default snooze options. See the Reminders wiki alter for the firing logic.`)}
  ${section("Data & Privacy",
    `Backup & Restore (per-category JSON / .symphonyz), password encryption (AES-256-GCM, optional), Simply Plural Connect. The Privacy & Data Notice at the top of the page covers what's stored locally vs what Friends Mode transmits.`)}
  ${section("Recent Updates",
    `Scrollable changelog viewer.`)}
  ${tip(`The build version and "alpha" chip are pinned in the top-right of Settings — bump-with-every-changelog by design, so when reporting a bug you can cite the exact build.`)}
`;

// ── 17. Privacy & Backup ──────────────────────────────────────────────
const bioPrivacy = `
  ${intro("Wiki · Privacy & Backup", `What's stored where, what's encrypted, what gets sent off the device.`)}
  ${section("By default, nothing leaves this device",
    `All app data — alter profiles, fronting history, journals, emotions, activities, sleep, tasks, reminders, diary cards, polls, locations — lives in this browser's IndexedDB. Nothing is uploaded, synced, or sent to any server unless you opt in.`)}
  ${section("Optional: at-rest encryption",
    `Settings → Data & Privacy → Storage Mode → Enable Encryption. Adds AES-256-GCM with a key derived from your password. Data is decrypted in memory only while the app is open. Not end-to-end encrypted — the protection is between this device's storage and the running app. <strong>Lose the password and the data cannot be recovered.</strong>`)}
  ${section("Backups",
    `Manual export. JSON or .symphonyz (gzipped). Per-category checkboxes — back up just alters + bios, just fronting history, etc. Backups are <strong>not encrypted</strong> regardless of your storage mode; store them somewhere safe.`)}
  ${section("Friends mode is the only off-device feature",
    `When enabled, the only data transmitted is: your system name, display name, and current front status at the privacy level you choose. See the Friends Mode wiki alter for what's <em>not</em> sent (everything else).`)}
  ${section("Privacy panic — Grocery list cover",
    `Triple-tap anywhere on the screen (within 500ms) → a generic grocery list takes over the entire app, including the bottom tab bar. Looks like an unrelated to-do app at a glance. Useful when you need to glance away mid-app.`)}
  ${section("Delete all local data",
    `Settings → Data & Privacy → Delete All Local Data. Two-stage confirm (type "delete my data"). Clears IndexedDB, localStorage, wipes Friends mode server-side, redirects to "/" as if it's a fresh install.`)}
`;

// ─── Build ──────────────────────────────────────────────────────────────
export function buildWiki() {
  const alters = [
    wikiAlter({ name: "1. Welcome",                  alias: "start", role: "Index",            color: "#22d3ee", group_id: "g-start",    order_index: 0, bio: bioWelcome }),
    wikiAlter({ name: "2. Gestures cheatsheet",      alias: "swipe", role: "Shortcuts",        color: "#06b6d4", group_id: "g-start",    order_index: 1, bio: bioGestures }),
    wikiAlter({ name: "3. Dashboard",                alias: "dash",  role: "Home screen",      color: "#a855f7", group_id: "g-dash",     order_index: 0, bio: bioDashboard }),
    wikiAlter({ name: "4. Alters page & groups",     alias: "alt",   role: "Directory",        color: "#f59e0b", group_id: "g-alters",   order_index: 0, bio: bioAltersGroups }),
    wikiAlter({ name: "5. Profile · edit modes",     alias: "edit",  role: "Profile editing",  color: "#f97316", group_id: "g-alters",   order_index: 1, bio: bioEditModes }),
    wikiAlter({ name: "6. Profile · mini toolbar",   alias: "tool",  role: "Toolbar reference",color: "#ea580c", group_id: "g-alters",   order_index: 2, bio: bioMiniToolbar }),
    wikiAlter({ name: "7. Profile · fields & tabs",  alias: "field", role: "Profile reference",color: "#dc2626", group_id: "g-alters",   order_index: 3, bio: bioProfileFields }),
    wikiAlter({ name: "8. Fronting & switching",     alias: "front", role: "Sessions",         color: "#eab308", group_id: "g-alters",   order_index: 4, bio: bioFronting }),
    wikiAlter({ name: "9. Bulletin board",           alias: "post",  role: "Sharing wall",     color: "#ec4899", group_id: "g-sharing",  order_index: 0, bio: bioBulletinBoard }),
    wikiAlter({ name: "10. Timeline",                alias: "time",  role: "Day-by-day view",  color: "#84cc16", group_id: "g-tracking", order_index: 0, bio: bioTimeline }),
    wikiAlter({ name: "11. Activity Tracker",        alias: "act",   role: "Activities",       color: "#10b981", group_id: "g-tracking", order_index: 1, bio: bioActivities }),
    wikiAlter({ name: "12. Quick Check-In",          alias: "ci",    role: "Daily capture",    color: "#14b8a6", group_id: "g-tracking", order_index: 2, bio: bioQuickCheckIn }),
    wikiAlter({ name: "13. To-Do & plans",           alias: "todo",  role: "Tasks",            color: "#06b6d4", group_id: "g-tracking", order_index: 3, bio: bioTodo }),
    wikiAlter({ name: "14. Reminders & push",        alias: "ping",  role: "Notifications",    color: "#ef4444", group_id: "g-notifs",   order_index: 0, bio: bioReminders }),
    wikiAlter({ name: "15. Friends mode",            alias: "amigo", role: "Relay & friends",  color: "#f472b6", group_id: "g-sharing",  order_index: 1, bio: bioFriends }),
    wikiAlter({ name: "16. Settings & themes",       alias: "set",   role: "Customisation",    color: "#6366f1", group_id: "g-personal", order_index: 0, bio: bioSettings }),
    wikiAlter({ name: "17. Privacy & backup",        alias: "lock",  role: "Data scope",       color: "#4f46e5", group_id: "g-personal", order_index: 1, bio: bioPrivacy }),
  ];

  const settings = {
    id: uid("wiki-settings"),
    system_name: "Oceans Symphony Wiki",
    system_description: "Walkthrough preview. Open any alter to read about that part of the app. The banner shows which app version this walkthrough was last refreshed against.",
    term_system: "system",
    term_alter: "alter",
    term_switch: "switch",
    term_front: "front",
  };

  // No fronting sessions, no bulletins, no journals — the wiki is reading
  // material, not a populated example system. Tapestry covers the
  // "everything filled in" case.
  return {
    SystemSettings:    toMap([settings]),
    Alter:             toMap(alters),
    Group:             toMap(GROUPS),
    FrontingSession:   toMap([]),
    EmotionCheckIn:    toMap([]),
    Activity:          toMap([]),
    JournalEntry:      toMap([]),
    SystemCheckIn:     toMap([]),
    StatusNote:        toMap([]),
    AlterRelationship: toMap([]),
    SystemChangeEvent: toMap([]),
    Symptom:           toMap([]),
    SymptomSession:    toMap([]),
    SymptomCheckIn:    toMap([]),
    Bulletin:          toMap([]),
    BulletinComment:   toMap([]),
    Poll:              toMap([]),
    Task:              toMap([]),
    DailyTaskTemplate: toMap([]),
    Sleep:             toMap([]),
    Reminder:          toMap([]),
    CustomEmotion:     toMap([]),
    TriggerType:       toMap([]),
    ActivityCategory:  toMap([]),
    ActivityGoal:      toMap([]),
    GroundingTechnique:toMap([]),
    GroundingPreference:toMap([]),
    InnerWorldLocation:toMap([]),
    Location:          toMap([]),
    AlterMessage:      toMap([]),
    AlterNote:         toMap([]),
    DiaryTemplate:     toMap([]),
    DiaryCard:         toMap([]),
    DailyProgress:     toMap([]),
    SupportJournalEntry: toMap([]),
  };
}
