// Wiki-style preview system. Every alter's profile is a walkthrough of one
// part of the app — Dashboard, Alter profile modes, the mini-toolbar, the
// bulletin board, the timeline, the activity tracker, reminders, friends
// mode, and so on. The alters list functions as a table of contents.
//
// The banner (PreviewModeBanner.jsx) reads WIKI_CONTENT_VERSION below
// and compares it to APP_VERSION. When the two match it says "up to
// date with vX.Y.Z"; when WIKI_CONTENT_VERSION is older it says
// "last refreshed for vX.Y.Z — you're on vA.B.C" so the user knows
// the walkthrough is stale.
//
// CRITICAL: bump WIKI_CONTENT_VERSION only when you actually update
// the wiki bios in this file — APP_VERSION bumps every PR (per
// CLAUDE.md), but the wiki bios don't. Without this separation the
// banner would always claim "up to date" while the bios miss every
// feature added since the bios were last touched.
//
// Bios use plain HTML so they render the same in Plain / Simple / Raw modes.
// We deliberately keep them text-heavy and gradient-light so they're
// readable on every theme. Inline images are avoided — the goal is
// reference docs the user can read at their own pace.

// Bump this string whenever you meaningfully change a bio in this
// file. PATCH bumps for added detail / small tweaks; MINOR for a
// whole new wiki alter / topic; MAJOR for a structural rewrite.
export const WIKI_CONTENT_VERSION = "0.80.2";

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

// Small helper so each wiki alter has the same shape. NB: the Alter entity
// uses `description` (HTML), not `bio` — that was a typo in the first cut
// and made every wiki bio render empty. Groups likewise own a list of
// alter IDs (`member_alter_ids`), not the other way around.
function wikiAlter({ name, alias, role, color, description, order_index, pronouns = "", custom_fields, alter_custom_fields, avatar_url = "", tags }) {
  return {
    id: uid("wiki-alter"),
    name,
    alias: alias || "",
    pronouns,
    color,
    role,
    description,
    order_index,
    friends_visible: false,
    is_archived: false,
    custom_fields: custom_fields || {},
    ...(alter_custom_fields ? { alter_custom_fields } : {}),
    ...(tags ? { tags } : {}),
    avatar_url,
    birthday: "",
  };
}

// Wrap rich HTML (with <style> blocks, gradients, animations, SVG) so the
// bio renderer treats it as one text block. htmlToBlocks splits on
// `\n<div>` / `\n<hr>`, so strip whitespace between tags before wrapping.
// Used by the showcase pages that flex the Raw-HTML/CSS range.
function richBio(html) {
  return `<div class="bio-text">${html.replace(/>\s*\n\s*</g, "><").trim()}</div>`;
}

// ─── Bio templates ──────────────────────────────────────────────────────
// Each function returns a string of HTML. Kept inline so the file reads
// top-to-bottom; if any one bio gets unwieldy, split it out.

// Designed "hero" header — an eyebrow label + lede inside a soft
// primary-tinted gradient card. Theme-safe (uses the live CSS vars so it
// recolours with the active theme / per-alter preset).
const intro = (subtitle, lede) => `
  <div style="margin:0 0 14px;padding:15px 17px;border-radius:16px;background:linear-gradient(135deg,hsl(var(--primary)/0.16),hsl(var(--primary)/0.02));border:1px solid hsl(var(--primary)/0.25);">
    <div style="font-size:0.68em;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;color:hsl(var(--primary));margin-bottom:7px;">${subtitle}</div>
    <div style="font-size:1.12em;line-height:1.55;font-weight:500;">${lede}</div>
  </div>
`;

// A section: accent-dot heading + a left-ruled body. Reads as "designed"
// without turning every block into a heavy card.
const section = (title, body) => `
  <h3 style="margin:16px 0 5px;font-size:0.95em;font-weight:700;display:flex;align-items:center;gap:8px;">
    <span style="width:6px;height:6px;border-radius:50%;background:hsl(var(--primary));flex-shrink:0;"></span>
    ${title}
  </h3>
  <div style="font-size:0.92em;line-height:1.62;opacity:0.92;padding-left:14px;border-left:1px solid hsl(var(--border));margin-left:2px;">${body}</div>
`;

// HTML-escape so example HTML tags render as literal text inside the
// code chip instead of being parsed as real tags. Without this,
// kbd("<s>") would emit a real <s> tag that strikethroughs everything
// after it; same for <strong>, <em>, etc.
function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const kbd = (text) => `<code style="background:hsl(var(--muted));padding:1px 6px;border-radius:4px;font-family:monospace;font-size:0.9em;">${esc(text)}</code>`;

const tip = (body) => `
  <div style="margin:11px 0;padding:10px 13px;border-radius:12px;background:hsl(var(--primary)/0.08);border:1px solid hsl(var(--primary)/0.22);font-size:0.88em;line-height:1.55;">
    <strong style="color:hsl(var(--primary));">💡 Tip</strong> — ${body}
  </div>
`;

// ── Rich helpers for bespoke "designer example" pages ────────────────────
// A full gradient hero with custom colours (each showcase page picks its own,
// so browsing the guide displays a range of looks). Emoji is optional.
const hero = ({ eyebrow, title, blurb, c1 = "#6366f1", c2 = "#0ea5e9", emoji = "" }) => `
  <div style="position:relative;overflow:hidden;border-radius:18px;padding:20px 20px 18px;margin:0 0 14px;background:linear-gradient(135deg,${c1},${c2});color:#fff;box-shadow:0 8px 30px ${c1}44;">
    <div style="position:absolute;right:-20px;top:-20px;width:120px;height:120px;border-radius:50%;background:rgba(255,255,255,0.12);"></div>
    ${emoji ? `<div style="font-size:1.8em;line-height:1;margin-bottom:8px;">${emoji}</div>` : ""}
    ${eyebrow ? `<div style="font-size:0.66em;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;opacity:0.85;margin-bottom:6px;">${eyebrow}</div>` : ""}
    <div style="font-size:1.5em;font-weight:800;letter-spacing:0.01em;line-height:1.15;">${title}</div>
    ${blurb ? `<div style="font-size:0.95em;line-height:1.5;opacity:0.94;margin-top:8px;max-width:52ch;">${blurb}</div>` : ""}
  </div>
`;

// A responsive grid of little feature cards: [{ emoji, title, body }].
const grid = (items) => `
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:9px;margin:12px 0;">
    ${items.map((it) => `
      <div style="border:1px solid hsl(var(--border));border-radius:13px;padding:11px 12px;background:hsl(var(--muted)/0.35);">
        ${it.emoji ? `<div style="font-size:1.2em;margin-bottom:4px;">${it.emoji}</div>` : ""}
        <div style="font-weight:700;font-size:0.9em;margin-bottom:2px;">${it.title}</div>
        <div style="font-size:0.82em;line-height:1.45;opacity:0.85;">${it.body}</div>
      </div>`).join("")}
  </div>
`;

// A row of headline stats: [{ value, label }].
const stats = (items, accent = "hsl(var(--primary))") => `
  <div style="display:flex;flex-wrap:wrap;gap:10px;margin:12px 0;">
    ${items.map((s) => `
      <div style="flex:1;min-width:88px;border-radius:13px;padding:11px 13px;background:linear-gradient(135deg,${accent}22,transparent);border:1px solid hsl(var(--border));">
        <div style="font-size:1.5em;font-weight:800;line-height:1;color:${accent};">${s.value}</div>
        <div style="font-size:0.72em;text-transform:uppercase;letter-spacing:0.08em;opacity:0.7;margin-top:4px;">${s.label}</div>
      </div>`).join("")}
  </div>
`;

// ── 1. Welcome / index ─────────────────────────────────────────────────
const bioWelcome = `
  ${hero({ eyebrow: "Preview Mode · Start here", title: "Welcome to the guided example", blurb: "Every profile in this example system is a walkthrough of one feature — and the whole app is filled with example data so you can actually try things. Read a page, then follow the <strong>Next →</strong> link at the bottom to walk the whole guide.", c1: "#0ea5e9", c2: "#6366f1", emoji: "🌊" })}
  ${grid([
    { emoji: "👆", title: "It's a real profile", body: "Each page is an actual alter profile — the same tabs and edit modes work here." },
    { emoji: "🎨", title: "Designed to inspire", body: "Many pages flex the profile editor's range; a few stay minimal to show the span." },
    { emoji: "🔗", title: "Walk it in order", body: "Prev / Next links at the foot of every page thread the whole walkthrough." },
    { emoji: "🛟", title: "Your data is safe", body: "Real data is hidden, never touched. Exit any time from the top banner." },
  ])}
  ${section("Where to go first",
    `<ol style="padding-left:20px;margin:4px 0;line-height:1.6;">
      <li><strong>Gestures cheatsheet</strong> — every swipe / long-press / triple-tap in one place.</li>
      <li><strong>Dashboard</strong> — what each tile on the home screen does.</li>
      <li><strong>Alters &amp; profiles</strong> — building a profile, plus the design showcases.</li>
      <li>Then pick the tracking &amp; connection topics you care about — skip the rest.</li>
    </ol>`)}
  ${tip(`Open the <strong>Alters</strong> page to see every topic grouped into folders. The "edit modes" page even owns a <em>subsystem</em> of design-showcase pages — tap into it to see nesting in action.`)}
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
      <li>The pencil icon on the mini-toolbar (✎) wraps selected text in a <code style="font-family:monospace;font-size:0.9em;">&lt;span data-edit="true"&gt;</code> region — that region becomes click-to-edit in Simple mode.</li>
    </ul>`)}
  ${section("Privacy panic — triple-tap",
    `Tap the screen <strong>three times within 500 ms</strong>, anywhere, → the Grocery List privacy cover opens over the entire app. Looks like a generic to-do list; the bottom tab bar is fully hidden. Useful when you need to glance away without revealing what app you were using. The gesture is suppressed while you're typing in an input or textarea.`)}
  ${section("Pull-to-refresh (mobile)",
    `Drag down from the top of the page → spinner appears at ~72 px of pull, refreshes when you let go. Resistance increases the further you drag so an over-pull doesn't feel violent.`)}
`;

// ── 3. Dashboard ───────────────────────────────────────────────────────
const bioDashboard = `
  ${hero({ eyebrow: "Feature · Home screen", title: "Dashboard", blurb: `The at-a-glance home for what's happening right now — current fronters, status, pins, plans, tasks, and search, top to bottom.`, c1: "#a855f7", c2: "#6366f1", emoji: "🏠" })}
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
    `Same rendering as Plain but only text wrapped in <code style="font-family:monospace;font-size:0.9em;">&lt;span data-edit="true"&gt;</code> is editable. Everything else is read-only. Wrap a bit of your template's text in an editable region via the pencil icon (✎) on the mini-toolbar. Good for: shared templates where the layout shouldn't change but a few fields should.`)}
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
    `Long-form notes. Imports notes from a Simply Plural export file. Free-form HTML editor.`)}
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
  ${hero({ eyebrow: "Feature · What you do", title: "Activity Tracker", blurb: `Track what your system actually does — work, errands, rest, therapy, meals. Two tabs: Logged (past) and Planned (future).`, c1: "#10b981", c2: "#0ea5e9", emoji: "⚡" })}
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

// ── 12b. Pinned Daily Tasks widget ─────────────────────────────────────
const bioPinnedDailyTasks = `
  ${intro("Wiki · Pinned tasks card", `Configurable dashboard card surfacing your recurring <em>Daily Tasks</em> (the ones with daily / weekly / monthly / yearly frequencies, set up under the Daily Tasks page). Lets you watch what's due now without leaving the dashboard.`)}
  ${section("Two modes",
    `<strong>Auto by frequency</strong> (default) — pick which frequencies to include (e.g. monthly + weekly + daily) and the priority order (e.g. monthly first, then weekly, then daily). Completed tasks drop out as you check them off. Lower-priority frequencies fill the rest of the list.<br><br>
    <strong>Hand-pick</strong> — pick specific tasks and the order they appear in. Useful when "what I want to glance at on the dashboard" is narrower than "everything incomplete by frequency".`)}
  ${section("Scrollable height",
    `Slider in the settings dialog (140–800 px). Anything beyond the height scrolls inside the card so the rest of the dashboard stays where you left it. Saved per device.`)}
  ${section("Manual tap-to-toggle",
    `For tasks with mode = MANUAL, tap the circle on the left to mark done. Writes through to the same ${kbd("DailyProgress")} record the Daily Tasks page uses, so completion state stays in sync across surfaces.`)}
  ${section("Auto tasks are read-only here",
    `Tasks with mode = AUTO update through the trigger pipeline on the Daily Tasks page (e.g. "create a journal entry today" fires automatically). The widget shows them with an external-link icon — tap it to jump to the Daily Tasks page where the auto state refreshes.`)}
  ${section("Where it lives",
    `Default position: between the "Pinned bulletins & tasks" strip and the "Current symptoms" card. Toggle it off or reorder it under Settings → Appearance → Dashboard Layout, same as every other dashboard element.`)}
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
    `Backup & Restore (per-category JSON / .symphonyz), password encryption (AES-256-GCM, optional), and file imports from other plural apps. The Privacy & Data Notice at the top of the page covers what's stored locally vs what Friends Mode transmits.`)}
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

// ── 18. Symptoms & habits ──────────────────────────────────────────────
const bioSymptoms = `
  ${intro("Guide · Symptoms & habits", `The <strong>System Check-In</strong> page tracks recurring symptoms (dissociation, anxiety, sleep trouble) and habits (took meds, used coping skills) — with per-alter attribution and intensity.`)}
  ${section("Rating vs boolean",
    `Some entries are <strong>1–5 ratings</strong> (overall mood, anxiety, feeling overwhelmed) and some are <strong>yes/no</strong> (triggered switch, attended therapy). Positive ones (mood, self-care) and negative ones (depression, sleep trouble) are coloured differently so a glance reads well.`)}
  ${section("Sessions vs check-ins",
    `A <strong>check-in</strong> is a point-in-time reading. A <strong>session</strong> has a start and an end — start an active symptom (e.g. a dissociative episode) now, end it later, and the duration is recorded. This example has a couple of past sessions and a spread of check-ins so the Timeline symptoms column and the analytics look alive.`)}
  ${section("Where it surfaces",
    `The Timeline symptoms column, the Daily Tally panel, the Wellbeing analytics tab, and the Symptoms section of a therapy report. Attribution defaults to whoever's fronting.`)}
  ${tip(`Add your own symptoms and habits — the catalogue is fully editable in Settings → Tracking. Colour and 1–5-vs-yes/no are per-entry.`)}
`;

// ── 19. Sleep & dream journal ──────────────────────────────────────────
const bioSleep = `
  ${intro("Guide · Sleep", `Log bedtime, wake time, and quality (1–10). This example has two weeks of nights so the trends read properly.`)}
  ${section("Quality + interruptions",
    `Each night stores a quality score, optional notes, and flags for interruptions, nightmares, or vivid dreams. Rough nights (short sleep, a nightmare) stand out against the steady ones.`)}
  ${section("Dream journal",
    `A night flagged as a dream can "Save to Dream Journal" — that writes a linked <strong>Journal entry</strong> so the dream lives in your journals too, tagged and searchable. One record, two surfaces.`)}
  ${section("Mirrors an activity",
    `Logging sleep also mirrors it as a Sleep activity so it shows on the Timeline and feeds your rest totals. You don't double-enter anything.`)}
`;

// ── 20. Locations ──────────────────────────────────────────────────────
const bioLocations = `
  ${intro("Guide · Locations", `A private, timestamped log of where you've been — home, work, outdoors, medical, social. GPS-captured or typed by hand.`)}
  ${section("GPS vs manual",
    `Tap the GPS button to capture coordinates (a "Open in Maps" link appears on those records), or just type a place name and pick a category. This example has both kinds across a week.`)}
  ${section("Why track it",
    `Location context helps make sense of switches and moods — a rough afternoon reads differently when you can see it was a medical appointment. Locations render as their own Timeline column and feed the Life analytics tab.`)}
`;

// ── 21. Diary cards ─────────────────────────────────────────────────────
const bioDiary = `
  ${intro("Guide · Diary cards", `A structured daily card (DBT-style) — mood, anxiety, skills used, and a short "what happened". Fully templated, so you decide what a card asks.`)}
  ${section("Templates",
    `A template is a list of fields — ratings, checkbox-lists, long-text. Build your own in Settings, or use the Standard Daily card this example ships with. Each day is one card against a template.`)}
  ${section("Skills tracking",
    `The checkbox-list field ("grounding / breathwork / journaling / reaching out / movement") turns "did I use a skill today" into something you can actually see a trend in over a week.`)}
`;

// ── 22. Journaling ──────────────────────────────────────────────────────
const bioJournaling = `
  ${intro("Guide · Journaling", `Long-form, dated writing — end-of-day reflection, therapy homework, dream logs. Optionally attached to one alter.`)}
  ${section("Rich text + mentions",
    `The editor supports HTML formatting and @mentions of other alters. Tag entries (this example uses <code>tutorial</code>, <code>design</code>, <code>therapy</code>) — tags filter the Journals page and folders group them.`)}
  ${section("Whispers",
    `Type <code>/w @name a secret</code> in an entry to hide that part behind a whisper bar only that alter reveals — a private note inside a shared journal. Works the same across bulletins and chat.`)}
  ${section("Three kinds of note, on purpose",
    `Journals are long-form and alter-attached. <strong>Status notes</strong> are short, system-wide, and immutable (a Facebook-style log). <strong>Bulletins</strong> are a shared wall. Pick the one that matches the shape of what you're writing.`)}
`;

// ── 23. Grounding & Learn ───────────────────────────────────────────────
const bioGrounding = `
  ${intro("Guide · Grounding & Learn", `In-the-moment crisis support (Grounding) and longer-form psychoeducation for systems (Learn). Reachable any time from the floating support bubble.`)}
  ${section("Grounding techniques",
    `A catalogue of breathing and sensory exercises — 5-4-3-2-1, box breathing, cold water — with a guided timer view. Favourite the ones that work; add your own. A distressing check-in can offer one automatically.`)}
  ${section("Learn module",
    `Topic pages written for plural systems (managers, firefighters, exiles, self-energy, in IFS terms), with interactive exercises and reflection prompts. Your reflections save as Support-journal entries and your progress is tracked per topic.`)}
  ${section("Not medical advice",
    `Every clinical-adjacent surface says so plainly — the app supports care, it doesn't replace it.`)}
`;

// ── 24. Help me unblend / Get to know me ────────────────────────────────
const bioUnblend = `
  ${intro("Guide · Unblend & Get to know me", `Two grounding-through-questions flows. <strong>Help me unblend</strong> walks you through prompts to separate from an overwhelming part; <strong>Get to know me</strong> is a gentler set for a specific alter.`)}
  ${section("Questions are yours",
    `A set of built-in prompts ships ready to use, and you can add your own or hide ones that don't fit. This example adds a couple of custom questions so you can see how the manager works.`)}
  ${section("When to reach for it",
    `Blend / over-identification is real and disorienting. A short structured set of questions — "whose feeling is this? how old does this feel?" — can create just enough distance to think.`)}
`;

// ── 25. Safety plan ─────────────────────────────────────────────────────
const bioSafetyPlan = `
  ${intro("Guide · Safety plan", `A private, always-reachable crisis plan — warning signs, coping steps, people and places that help, and how to make the environment safer.`)}
  ${section("Built for a hard moment",
    `The point is that when things are bad, thinking is hard. A plan written on a calm day, kept one tap away, does the remembering for you. It never leaves the device.`)}
  ${section("Crisis resources",
    `Sits alongside the grounding tools and crisis-line resources so support is one surface, not a scavenger hunt.`)}
`;

// ── 26. Contacts — "who are you with?" ──────────────────────────────────
const bioContacts = `
  ${hero({ eyebrow: "Feature · External people", title: "Contacts", blurb: `A private directory of the people in your life — the parallel to your alter roster, but pointed outward. Safe people, tricky people, professionals.`, c1: "#0ea5e9", c2: "#22c55e", emoji: "🧭" })}
  ${section("Safety + awareness at a glance",
    `Each contact carries a <strong>safety</strong> read (safe / caution / unsafe) and an <strong>awareness</strong> flag (do they know about the system? not at all / partially / fully). Colour-coded so the directory is scannable in a stressed moment. Some are flagged as emergency support.`)}
  ${section("Who are you with?",
    `Start an <strong>encounter</strong> to mark "I'm currently with this person" — it shows on the dashboard the same way current fronters do, and you can tag an activity with the contacts you did it with. This example has a live encounter and some past visits.`)}
  ${section("Notes, relationships, custom fields",
    `Per-contact notes, relationship links (friend / partner / therapist / family), and custom fields — the same building blocks as an alter profile, pointed outward. Folders group them.`)}
`;

// ── 27. System chat ─────────────────────────────────────────────────────
const bioSystemChat = `
  ${intro("Guide · System chat", `An internal group chat for the system — channels, threads, reactions, pinned messages. A living space for inside-talk, distinct from the bulletin wall.`)}
  ${section("Channels + categories",
    `Organise conversations into channels (general, planning, a private one) grouped under categories. This example seeds a few channels with a real back-and-forth so the analytics authorship view has something to read.`)}
  ${section("Signposts & whispers",
    `Type <code>+name</code> to sign a line as a specific alter, or <code>-name</code> to attribute without switching front — the sticky last-author carries down until you change it. <code>/w @name</code> whispers a line to one reader. The composer is the same rich one used across bulletins.`)}
  ${section("Reactions, threads, pins",
    `React with emoji, reply in a thread, pin the message that matters. One message in this example is pinned and one has a thread so you can see both.`)}
`;

// ── 28. Presences ───────────────────────────────────────────────────────
const bioPresences = `
  ${intro("Guide · Presences", `A gentle holding space for <strong>not-yet-alters</strong> — a vibe, a felt sense, someone new you're only starting to notice. Log a presence before it's ready to be a full profile.`)}
  ${section("Sightings over time",
    `Each presence collects timestamped "sightings" so you can see a pattern emerge without pressure to name or define anything. When it's ready, resolve a presence into a full alter — or leave it as it is.`)}
  ${section("Notice who's near",
    `Presences also show up in the system-meeting "notice who's near" picker, so a felt-but-unnamed someone can still be acknowledged in a check-in.`)}
`;

// ── 29. Inner-world map ─────────────────────────────────────────────────
const bioSystemMap = `
  ${intro("Guide · Inner-world map", `A visual layout of your headspace — rooms, places, and where alters tend to be. Maps can have layers; alters get placed on them.`)}
  ${section("Places & occupants",
    `Add locations (a meeting room, a garden, a quiet library) and list the alters usually there. This example seeds a small inner world with a few rooms so the map isn't blank.`)}
  ${section("Layers + big systems",
    `Stack layers (a base map + an overlay), toggle labels, go fullscreen. The map is built to stay usable even for very large systems via display caps and group-collapse.`)}
`;

// ── 30. System history & lineage ────────────────────────────────────────
const bioSystemHistory = `
  ${intro("Guide · System history", `A timeline of <strong>lineage events</strong> — splits, fusions, someone going dormant, someone returning, a new arrival — with dates, causes, and notes.`)}
  ${section("Events + relationships",
    `Recording a split can auto-create "split from" relationships between the alters involved, so the lineage view and the relationship map stay in sync. Year-only events (you remember the year, not the day) display as just the year.`)}
  ${section("Careful wording",
    `Fusion is described as an alter that <em>persists</em>, not a "surviving" one — the absorbed alters aren't being lost. Language here matters and the app tries to get it right.`)}
`;

// ── 31. Analytics ───────────────────────────────────────────────────────
const bioAnalytics = `
  ${hero({ eyebrow: "Feature · Patterns", title: "Analytics", blurb: `Patterns across everything you've logged — fronting, wellbeing, and life context. Read-only and computed from your records; nothing here is entered.`, c1: "#8b5cf6", c2: "#ec4899", emoji: "📊" })}
  ${stats([{ value: "4", label: "tabs" }, { value: "29h", label: "example fronting" }, { value: "6", label: "member fingerprints" }], "#a855f7")}
  ${section("Four tabs",
    `<strong>Overview</strong> — the headline read on the range. <strong>Fronting</strong> — who's out how much, solo vs co-front, switch counts, primary time. <strong>Wellbeing</strong> — mood / anxiety / symptom trends. <strong>Life</strong> — activities, sleep, locations, and contacts correlated against the rest.`)}
  ${section("Alter fingerprints",
    `Each alter gets a "fingerprint" — their characteristic emotions, activities, and times of day — built from attribution across your data. Because this example is populated across weeks, the fingerprints and trends actually render.`)}
  ${section("Trauma-informed by design",
    `Minimum-data gates mean it won't draw confident conclusions from three data points, and the framing avoids scoring you. It's a mirror, not a report card.`)}
`;

// ── 32. Therapy reports ─────────────────────────────────────────────────
const bioReports = `
  ${intro("Guide · Therapy reports", `A date-bounded summary you can hand to a therapist — with per-section opt-in so you share exactly what you want to.`)}
  ${section("Build + save presets",
    `Pick a date range and toggle sections (fronting, mood, symptoms, activities, journal excerpts, status notes, plan completion…). Save a builder preset so the weekly report is one tap next time. This example ships a couple of templates and an export log.`)}
  ${section("Anonymise",
    `An anonymise toggle blurs alter references throughout, for when you want to share patterns without names.`)}
`;

// ── 33. Multiple systems ────────────────────────────────────────────────
const bioMultipleSystems = `
  ${intro("Guide · Multiple systems", `The app can hold more than one separate system — fully independent rosters, settings, and data — switched from the profile menu. (The switcher works on your real data; this walkthrough is a single example system, so there's nothing to switch to here.)`)}
  ${section("Truly separate",
    `Each system is its own world: its own alters, terms, theme, and history. Nothing bleeds between them. Useful for a co-writer, a separate median system, or keeping a work profile apart.`)}
  ${section("Import a whole system",
    `Bring one in from an Ampersand <code>.ampar</code> file, or from PluralKit / Simply Plural, as its own system — or merge into an existing one. Alters and groups can also be transferred between systems, nesting and all.`)}
`;

// ── 34. Avatars & image rotation ────────────────────────────────────────
const bioAvatars = richBio(`
<style>@keyframes rot-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}</style>
<div style="background:linear-gradient(135deg,#1e1b4b,#312e81);border:1px solid #6366f1;border-radius:16px;padding:16px 18px;color:#e0e7ff;">
  <div style="display:flex;align-items:center;gap:14px;margin-bottom:10px;">
    <div style="width:56px;height:56px;border-radius:50%;flex-shrink:0;background:conic-gradient(#a5b4fc,#f472b6,#38bdf8,#a5b4fc);animation:rot-spin 6s linear infinite;box-shadow:0 0 20px rgba(129,140,248,.5);"></div>
    <div>
      <div style="font-size:1.2em;font-weight:700;">Avatars &amp; image rotation</div>
      <div style="font-size:.82em;opacity:.75;">One alter, a whole pool of pictures.</div>
    </div>
  </div>
  <p style="font-size:.9em;line-height:1.65;margin:0 0 .8em;">An alter's avatar can be a single image <em>or</em> a rotating pool — the picture changes on a schedule or at random, so a mood-fluid or age-fluid member isn't pinned to one face. Backgrounds rotate the same way.</p>
  <p style="font-size:.9em;line-height:1.65;margin:0;">Images live in the <strong>Assets Library</strong> (folders, GIFs, per-alter ownership) and are picked from there anywhere the app wants a picture. This example seeds a small library and a rotation pool so the feature has something to show.</p>
</div>
`);

// ── Showcase · Raw HTML / CSS ───────────────────────────────────────────
// This page's bio is authored in Raw mode to demonstrate what the editor
// can produce — animation, gradient, grid, custom type. The content is
// about the feature, not a character.
const bioRawShowcase = richBio(`
<style>
@keyframes gd-shimmer{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
@keyframes gd-pulse{0%,100%{opacity:.5;transform:scale(1)}50%{opacity:1;transform:scale(1.06)}}
</style>
<div style="background:linear-gradient(135deg,#020617 0%,#0c4a6e 50%,#020617 100%);background-size:200% 200%;animation:gd-shimmer 8s ease-in-out infinite;border:1px solid #06b6d4;border-radius:18px;overflow:hidden;">
  <div style="position:relative;background:linear-gradient(180deg,rgba(6,182,212,.18),transparent);padding:18px 18px 12px;">
    <div style="position:absolute;top:14px;right:14px;width:8px;height:8px;border-radius:50%;background:#06b6d4;box-shadow:0 0 16px #06b6d4;animation:gd-pulse 1.6s ease-in-out infinite;"></div>
    <div style="font-family:'Courier New',monospace;font-size:.62em;letter-spacing:.4em;color:#67e8f9;text-transform:uppercase;margin-bottom:6px;">// raw mode showcase</div>
    <div style="font-size:1.7em;font-weight:300;letter-spacing:.12em;color:#cffafe;">A bio is a tiny webpage</div>
  </div>
  <div style="padding:14px 18px 18px;color:#a5f3fc;font-size:.9em;line-height:1.85;">
    <p style="margin:0 0 .9em;">Everything you see on this page — the shimmer, the pulsing dot, the gradient, the monospace label — is written in the alter bio editor's <strong>Raw</strong> mode: plain HTML with a <code style="background:rgba(6,182,212,.15);padding:1px 5px;border-radius:3px;color:#cffafe;">&lt;style&gt;</code> block. Gradients, CSS animation, inline SVG, custom fonts — anything a browser can render.</p>
    <div style="display:grid;grid-template-columns:auto 1fr;gap:6px 14px;font-size:.82em;border-top:1px solid rgba(6,182,212,.3);padding-top:12px;">
      <div style="color:#67e8f9;letter-spacing:.1em;">USE FOR</div><div style="color:#cffafe;">a profile that should look unmistakably like <em>this</em> alter.</div>
      <div style="color:#67e8f9;letter-spacing:.1em;">OR STAY IN</div><div style="color:#cffafe;">Plain / Blocks if you'd rather not touch code — they're faster and just as valid.</div>
      <div style="color:#67e8f9;letter-spacing:.1em;">TIP</div><div style="color:#cffafe;">keep <code style="background:rgba(6,182,212,.15);padding:1px 5px;border-radius:3px;color:#cffafe;">@keyframes</code> scoped to a wrapper class so bios don't affect each other.</div>
    </div>
  </div>
</div>
`);

// ── Showcase · Theme presets ────────────────────────────────────────────
// Carries its own theme preset (Glow). Long-pressing this page's chip on
// the dashboard swaps the whole app to amber; switching primary swaps back.
const bioThemeShowcase = richBio(`
<style>@keyframes gd-warm{0%,100%{box-shadow:0 0 22px rgba(245,158,11,.28)}50%{box-shadow:0 0 38px rgba(245,158,11,.55),0 0 70px rgba(245,158,11,.15)}}</style>
<div style="background:linear-gradient(180deg,#1a0f06 0%,#3b1d08 50%,#1a0f06 100%);border:2px solid #f59e0b;border-radius:12px;overflow:hidden;animation:gd-warm 5s ease-in-out infinite;">
  <div style="background:linear-gradient(135deg,rgba(245,158,11,.18),transparent);padding:14px 18px;border-bottom:1px solid rgba(245,158,11,.3);text-align:center;">
    <div style="color:#f59e0b;font-size:.6em;letter-spacing:.4em;">✦ PER-ALTER ✦</div>
    <div style="font-family:'Playfair Display',serif;font-size:1.6em;font-weight:700;color:#fde68a;letter-spacing:.1em;">THEME PRESETS</div>
  </div>
  <div style="padding:16px 18px;color:#fed7aa;font-size:.9em;line-height:1.8;">
    <p style="margin:0 0 .9em;">The amber-on-black you're seeing right now is <strong>this page's own theme preset</strong>. Bind a palette + font to an alter (Settings → Appearance → Fronter-linked themes) and the <em>whole app</em> recolours when they become the primary fronter — then snaps back when someone else takes over.</p>
    <p style="margin:0;font-size:.86em;"><b style="color:#fbbf24;">Try it:</b> long-press this page's chip on the dashboard to make it primary and watch the app turn warm. Other showcase pages carry their own palettes too — sky, neon, berry, bloom — so switching primary is a live demo of the feature.</p>
  </div>
</div>
`);

// ── Per-page theme presets (6 members carry these) ──────────────────────
// Shape mirrors the Tapestry presets: light + dark palettes, font,
// themeMode, fontSize, terms. Long-pressing a member page's chip swaps the
// whole app to their palette. Names are keyed by the member page.
const WIKI_THEME_PRESETS = {
  "Start — Sky": {
    light: { bg: "#F0F9FF", surface: "#E0F2FE", primary: "#0284C7", secondary: "#BAE6FD", accent: "#0EA5E9", muted: "#E0F2FE", "text-primary": "#082F49", "text-secondary": "#075985" },
    dark:  { bg: "#0C1827", surface: "#0E2A3F", primary: "#38BDF8", secondary: "#1E3A52", accent: "#7DD3FC", muted: "#1F3447", "text-primary": "#E0F2FE", "text-secondary": "#7DD3FC" },
    font: "'Atkinson Hyperlegible', sans-serif", themeMode: null, fontSize: "default",
    terms: { system: "system", alter: "alter", switch: "switch", front: "front" },
  },
  "Raw — Neon": {
    light: { bg: "#ECFEFF", surface: "#CFFAFE", primary: "#0E7490", secondary: "#A5F3FC", accent: "#06B6D4", muted: "#CFFAFE", "text-primary": "#083344", "text-secondary": "#155E75" },
    dark:  { bg: "#020617", surface: "#0C1828", primary: "#22D3EE", secondary: "#155E75", accent: "#67E8F9", muted: "#0E2A3F", "text-primary": "#CFFAFE", "text-secondary": "#67E8F9" },
    font: "'Atkinson Hyperlegible', sans-serif", themeMode: "dark", fontSize: "default",
    terms: { system: "system", alter: "alter", switch: "switch", front: "front" },
  },
  "Theme — Glow": {
    light: { bg: "#FFF7ED", surface: "#FFEDD5", primary: "#C2410C", secondary: "#FED7AA", accent: "#F97316", muted: "#FFEDD5", "text-primary": "#431407", "text-secondary": "#7C2D12" },
    dark:  { bg: "#1F0B05", surface: "#2A1208", primary: "#FB923C", secondary: "#3B1A0A", accent: "#FDBA74", muted: "#5A2E15", "text-primary": "#FFEDD5", "text-secondary": "#FED7AA" },
    font: "'Playfair Display', serif", themeMode: null, fontSize: "default",
    terms: { system: "system", alter: "alter", switch: "switch", front: "front" },
  },
  "Fields — Berry": {
    light: { bg: "#FDF2F8", surface: "#FBCFE8", primary: "#DB2777", secondary: "#FBCFE8", accent: "#EC4899", muted: "#FCE7F3", "text-primary": "#500724", "text-secondary": "#831843" },
    dark:  { bg: "#1F0B2E", surface: "#2D1645", primary: "#EC4899", secondary: "#6B1B47", accent: "#F472B6", muted: "#5A3668", "text-primary": "#FBCFE8", "text-secondary": "#F0ABFC" },
    font: "'Playfair Display', serif", themeMode: null, fontSize: "default",
    terms: { system: "system", alter: "alter", switch: "switch", front: "front" },
  },
  "Toolbar — Bloom": {
    light: { bg: "#FDF2F8", surface: "#FCE7F3", primary: "#BE185D", secondary: "#FBCFE8", accent: "#EC4899", muted: "#FCE7F3", "text-primary": "#500724", "text-secondary": "#9D174D" },
    dark:  { bg: "#1F0B1B", surface: "#2D1325", primary: "#F472B6", secondary: "#5B1B47", accent: "#EC4899", muted: "#4A1737", "text-primary": "#FBCFE8", "text-secondary": "#F0ABFC" },
    font: "'Playfair Display', serif", themeMode: null, fontSize: "default",
    terms: { system: "system", alter: "alter", switch: "switch", front: "front" },
  },
  "Avatars — Constellation": {
    light: { bg: "#EEF2FF", surface: "#E0E7FF", primary: "#4338CA", secondary: "#C7D2FE", accent: "#6366F1", muted: "#E0E7FF", "text-primary": "#1E1B4B", "text-secondary": "#3730A3" },
    dark:  { bg: "#03050F", surface: "#0F172A", primary: "#A5B4FC", secondary: "#1E1B4B", accent: "#6366F1", muted: "#312E81", "text-primary": "#E0E7FF", "text-secondary": "#A5B4FC" },
    font: "'Atkinson Hyperlegible', sans-serif", themeMode: "dark", fontSize: "default",
    terms: { system: "system", alter: "alter", switch: "switch", front: "front" },
  },
};

// System-wide custom-field definitions used by the showcase pages' Info
// tabs. Stable ids so buildPages (values) and previewSystems (the
// CustomField entity definitions) stay in sync. Exported for the assembler.
export const WIKI_CUSTOM_FIELDS = [
  { id: "wcf-comfort",  name: "Comfort",          order: 0, type: "text",     placeholder: "What helps them settle" },
  { id: "wcf-besttime", name: "Best time of day", order: 1, type: "text",     placeholder: "Morning / night / anytime" },
  { id: "wcf-sensory",  name: "Sensory likes",    order: 2, type: "longtext", placeholder: "Textures, sounds, tastes" },
  { id: "wcf-pronoun",  name: "Pronoun notes",    order: 3, type: "text",     placeholder: "Any nuance" },
];

// ─── Build the feature-page set ──────────────────────────────────────────
// Every page is an alter profile whose bio documents one feature area. Six
// "member" pages carry a theme preset + are the ones the assembler
// (previewSystems.js) attributes fronting / tracking data to, so the app
// looks lived-in while every page stays a walkthrough. Returns the pieces;
// previewSystems assembles the full entity dict + generated data.
export function buildPages() {
  const A = {
    // 1 · Start here
    welcome:    wikiAlter({ name: "Welcome — start here",   alias: "start", role: "Guided tour",      color: "#38bdf8", order_index: 0,  pronouns: "any/all", description: bioWelcome,
      custom_fields: { "wcf-comfort": "A slow cup of tea and the dashboard open.", "wcf-besttime": "Whenever you open the app." } }),
    gestures:   wikiAlter({ name: "Gestures cheatsheet",    alias: "swipe", role: "Shortcuts",        color: "#06b6d4", order_index: 1,  description: bioGestures }),
    // 2 · Alters & profiles
    altersPage: wikiAlter({ name: "Alters page & groups",   alias: "alt",   role: "Directory",        color: "#f59e0b", order_index: 2,  description: bioAltersGroups }),
    editModes:  wikiAlter({ name: "Profile · edit modes",   alias: "edit",  role: "Profile editing",  color: "#f97316", order_index: 3,  description: bioEditModes }),
    toolbar:    wikiAlter({ name: "Profile · mini toolbar", alias: "tool",  role: "Toolbar reference",color: "#ec4899", order_index: 4,  description: bioMiniToolbar }),
    fields:     wikiAlter({ name: "Profile · fields & tabs",alias: "field", role: "Profile reference",color: "#db2777", order_index: 5,  pronouns: "she/they", description: bioProfileFields,
      custom_fields: { "wcf-comfort": "Quiet and a warm drink.", "wcf-besttime": "Late evening.", "wcf-sensory": "Soft blankets, low light, lo-fi.", "wcf-pronoun": "she/her, but they/them is fine too." },
      alter_custom_fields: [
        { id: uid("acf"), label: "Reads",  value: "Long-form essays, recipe books." },
        { id: uid("acf"), label: "Avoids", value: "Loud rooms, surprise phone calls." },
      ] }),
    rawShowcase:   wikiAlter({ name: "Raw HTML showcase",   alias: "raw",   role: "Design range",     color: "#06b6d4", order_index: 6,  description: bioRawShowcase,
      custom_fields: { "wcf-sensory": "Gradients, monospace, a single pulsing dot." } }),
    themeShowcase: wikiAlter({ name: "Theme presets showcase", alias: "theme", role: "Design range",  color: "#f59e0b", order_index: 7,  description: bioThemeShowcase }),
    avatars:    wikiAlter({ name: "Avatars & rotation",     alias: "face",  role: "Design range",     color: "#6366f1", order_index: 8,  description: bioAvatars }),
    // 3 · Fronting & system
    fronting:   wikiAlter({ name: "Fronting & switching",   alias: "front", role: "Sessions",         color: "#eab308", order_index: 9,  description: bioFronting }),
    systemHistory: wikiAlter({ name: "System history",      alias: "hist",  role: "Lineage",          color: "#a855f7", order_index: 10, description: bioSystemHistory }),
    systemMap:  wikiAlter({ name: "Inner-world map",        alias: "map",   role: "Headspace",        color: "#8b5cf6", order_index: 11, description: bioSystemMap }),
    presences:  wikiAlter({ name: "Presences",              alias: "vibe",  role: "Not-yet-alters",   color: "#c084fc", order_index: 12, description: bioPresences }),
    // 4 · Tracking
    dashboard:  wikiAlter({ name: "Dashboard",              alias: "dash",  role: "Home screen",      color: "#a855f7", order_index: 13, description: bioDashboard }),
    timeline:   wikiAlter({ name: "Timeline",               alias: "time",  role: "Day-by-day view",  color: "#84cc16", order_index: 14, description: bioTimeline }),
    activities: wikiAlter({ name: "Activity Tracker",       alias: "act",   role: "Activities",       color: "#10b981", order_index: 15, description: bioActivities }),
    checkIn:    wikiAlter({ name: "Quick Check-In",         alias: "ci",    role: "Daily capture",    color: "#14b8a6", order_index: 16, description: bioQuickCheckIn }),
    symptoms:   wikiAlter({ name: "Symptoms & habits",      alias: "sym",   role: "Tracking",         color: "#ef4444", order_index: 17, description: bioSymptoms }),
    sleep:      wikiAlter({ name: "Sleep & dreams",         alias: "sleep", role: "Rest",             color: "#4f46e5", order_index: 18, description: bioSleep }),
    locations:  wikiAlter({ name: "Locations",              alias: "loc",   role: "Where you've been",color: "#0ea5e9", order_index: 19, description: bioLocations }),
    todo:       wikiAlter({ name: "To-Do & plans",          alias: "todo",  role: "Tasks",            color: "#06b6d4", order_index: 20, description: bioTodo }),
    pinnedDailyTasks: wikiAlter({ name: "Pinned tasks card",alias: "pin",   role: "Dashboard widget", color: "#0ea5e9", order_index: 21, description: bioPinnedDailyTasks }),
    diary:      wikiAlter({ name: "Diary cards",            alias: "card",  role: "Daily card",       color: "#14b8a6", order_index: 22, description: bioDiary }),
    // 5 · Reflection & support
    journaling: wikiAlter({ name: "Journaling",             alias: "journ", role: "Long-form",        color: "#8b5cf6", order_index: 23, description: bioJournaling }),
    grounding:  wikiAlter({ name: "Grounding & Learn",      alias: "calm",  role: "Support",          color: "#22c55e", order_index: 24, description: bioGrounding }),
    unblend:    wikiAlter({ name: "Unblend & get to know me",alias: "unbl", role: "Grounding Qs",     color: "#16a34a", order_index: 25, description: bioUnblend }),
    safetyPlan: wikiAlter({ name: "Safety plan",            alias: "safe",  role: "Crisis plan",      color: "#dc2626", order_index: 26, description: bioSafetyPlan }),
    reminders:  wikiAlter({ name: "Reminders & push",       alias: "ping",  role: "Notifications",    color: "#f97316", order_index: 27, description: bioReminders }),
    // 6 · Connection
    contacts:   wikiAlter({ name: "Contacts",               alias: "who",   role: "External people",  color: "#0ea5e9", order_index: 28, description: bioContacts }),
    systemChat: wikiAlter({ name: "System chat",            alias: "chat",  role: "Inside-talk",      color: "#6366f1", order_index: 29, description: bioSystemChat }),
    bulletin:   wikiAlter({ name: "Bulletin board",         alias: "post",  role: "Sharing wall",     color: "#ec4899", order_index: 30, description: bioBulletinBoard }),
    friends:    wikiAlter({ name: "Friends mode",           alias: "amigo", role: "Relay & friends",  color: "#f472b6", order_index: 31, description: bioFriends }),
    // 7 · Insight & data
    analytics:  wikiAlter({ name: "Analytics",              alias: "stats", role: "Patterns",         color: "#a855f7", order_index: 32, description: bioAnalytics }),
    reports:    wikiAlter({ name: "Therapy reports",        alias: "rep",   role: "Summaries",        color: "#7c3aed", order_index: 33, description: bioReports }),
    settings:   wikiAlter({ name: "Settings & themes",      alias: "set",   role: "Customisation",    color: "#6366f1", order_index: 34, description: bioSettings }),
    privacy:    wikiAlter({ name: "Privacy & backup",       alias: "lock",  role: "Data scope",       color: "#4f46e5", order_index: 35, description: bioPrivacy }),
    multipleSystems: wikiAlter({ name: "Multiple systems",  alias: "sys",   role: "Parallel systems", color: "#4338ca", order_index: 36, description: bioMultipleSystems }),
  };
  const alters = Object.values(A);

  // The six "member" pages carry theme presets and get attributed data.
  const alterThemeLinks = {
    [A.welcome.id]:       "Start — Sky",
    [A.rawShowcase.id]:   "Raw — Neon",
    [A.themeShowcase.id]: "Theme — Glow",
    [A.fields.id]:        "Fields — Berry",
    [A.toolbar.id]:       "Toolbar — Bloom",
    [A.avatars.id]:       "Avatars — Constellation",
  };

  // Groups own their members via `member_alter_ids` + `parent` + `order`.
  const groups = [
    { id: uid("wiki-group"), name: "1 · Start here",        color: "#38bdf8", description: "Welcome + the gestures cheatsheet. Read these first.",                       member_alter_ids: [A.welcome.id, A.gestures.id], parent: "root", order: 0 },
    { id: uid("wiki-group"), name: "2 · Alters & profiles", color: "#f59e0b", description: "The directory, the four edit modes, the toolbar, custom fields — and showcase pages that flex what a profile can look like.", member_alter_ids: [A.altersPage.id, A.editModes.id, A.toolbar.id, A.fields.id, A.rawShowcase.id, A.themeShowcase.id, A.avatars.id], parent: "root", order: 1 },
    { id: uid("wiki-group"), name: "3 · Fronting & system", color: "#a855f7", description: "Who's out, lineage over time, the inner-world map, and presences.",           member_alter_ids: [A.fronting.id, A.systemHistory.id, A.systemMap.id, A.presences.id], parent: "root", order: 2 },
    { id: uid("wiki-group"), name: "4 · Tracking",          color: "#10b981", description: "Dashboard, timeline, activities, check-ins, symptoms, sleep, locations, tasks, diary.", member_alter_ids: [A.dashboard.id, A.timeline.id, A.activities.id, A.checkIn.id, A.symptoms.id, A.sleep.id, A.locations.id, A.todo.id, A.pinnedDailyTasks.id, A.diary.id], parent: "root", order: 3 },
    { id: uid("wiki-group"), name: "5 · Reflection & support", color: "#22c55e", description: "Journaling, grounding & learn, unblend, safety plan, reminders.",           member_alter_ids: [A.journaling.id, A.grounding.id, A.unblend.id, A.safetyPlan.id, A.reminders.id], parent: "root", order: 4 },
    { id: uid("wiki-group"), name: "6 · Connection",        color: "#ec4899", description: "Contacts (external people), system chat, bulletins, and friends mode.",       member_alter_ids: [A.contacts.id, A.systemChat.id, A.bulletin.id, A.friends.id], parent: "root", order: 5 },
    { id: uid("wiki-group"), name: "7 · Insight & data",    color: "#6366f1", description: "Analytics, therapy reports, settings, privacy, and multiple systems.",        member_alter_ids: [A.analytics.id, A.reports.id, A.settings.id, A.privacy.id, A.multipleSystems.id], parent: "root", order: 6 },
  ];

  // A subsystem (a group OWNED by an alter via `owner_alter_id`) demonstrates
  // that feature: the "edit modes" page owns a nested set of design-showcase
  // pages. It shows up under its owner on the Alters page.
  const showcaseSubsystem = {
    id: uid("wiki-group"),
    name: "Design showcases",
    color: "#f97316",
    description: "A subsystem owned by the edit-modes page — pages that flex the editor's range.",
    owner_alter_id: A.editModes.id,
    member_alter_ids: [A.rawShowcase.id, A.themeShowcase.id, A.avatars.id],
    order: 0,
  };
  const allGroups = [...groups, showcaseSubsystem];

  // The app resolves group + subsystem membership from each alter's `groups`
  // array (objects {id,name,color}) via getMemberAlters — NOT from a group's
  // member_alter_ids. Populate it so tapping a folder / subsystem actually
  // lists its pages.
  const byId = Object.fromEntries(alters.map((a) => [a.id, a]));
  for (const g of allGroups) {
    for (const aid of g.member_alter_ids || []) {
      const al = byId[aid];
      if (!al) continue;
      (al.groups ||= []).push({ id: g.id, name: g.name, color: g.color });
    }
  }

  // Sequential walkthrough: append an in-app Prev/Next footer to each page (in
  // top-level reading order) so a reader can move through the whole guide by
  // tapping — using the same `data-internal-link` the link picker inserts.
  const order = groups.flatMap((g) => g.member_alter_ids);
  const navLink = (al, label) => `<a data-internal-link="/alter/${al.id}" style="color:hsl(var(--primary));text-decoration:none;font-weight:600;">${label}</a>`;
  order.forEach((id, i) => {
    const al = byId[id];
    if (!al) return;
    const prev = i > 0 ? byId[order[i - 1]] : null;
    const next = i < order.length - 1 ? byId[order[i + 1]] : null;
    al.description += `<div style="display:flex;justify-content:space-between;gap:12px;margin-top:20px;padding-top:12px;border-top:1px solid hsl(var(--border));font-size:0.85em;">` +
      `<span>${prev ? navLink(prev, `← ${prev.name}`) : ""}</span>` +
      `<span style="text-align:right;">${next ? navLink(next, `${next.name} →`) : ""}</span>` +
      `</div>`;
  });

  const settings = {
    id: uid("wiki-settings"),
    system_name: "Preview Mode — example system",
    system_description: "Every profile is a walkthrough of one feature, and the whole app is filled with example data so you can try things. Your real data is untouched.",
    term_system: "system",
    term_alter: "alter",
    term_switch: "switch",
    term_front: "front",
  };

  return {
    A,
    alters,
    groups: allGroups,
    settings,
    themePresets: WIKI_THEME_PRESETS,
    alterThemeLinks,
    customFields: WIKI_CUSTOM_FIELDS,
  };
}
