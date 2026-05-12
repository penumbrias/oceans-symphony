// Curated example "system" used by Preview Mode.
//
// This is a demo dataset whose primary purpose is to **show off the alter
// profile editor's capabilities**. Each demo alter has a profile written in a
// different bio mode (Plain / Simple / Blocks / Raw HTML), uses a different
// custom-fields setup, and ships its own theme preset that takes over when
// they're the primary fronter.
//
// The bulletin board is preserved with worked examples of mentions, threads,
// reactions, polls, and pinning. Other entity tables are kept lightly
// populated so visiting the timeline / reports / tasks pages doesn't look
// empty, but the centre of gravity is the alter profiles.
//
// Data is generated relative to "now" so the timeline always shows recent
// activity, regardless of when the user enables Preview Mode.

const DAY = 86400000;
const HOUR = 3600000;

function uid(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function isoOffset(daysAgo, hour = 12, min = 0) {
  const d = new Date(Date.now() - daysAgo * DAY);
  d.setHours(hour, min, 0, 0);
  return d.toISOString();
}

function nowIso() {
  return new Date().toISOString();
}

function rec(fields) {
  const now = nowIso();
  return {
    id: uid("p"),
    created_date: now,
    updated_date: now,
    created_by: "preview@symphony.app",
    ...fields,
  };
}

function toMap(records) {
  const out = {};
  for (const r of records) out[r.id] = r;
  return out;
}

// Wrap rich HTML so the bio renderer treats it as a single text block.
// htmlToBlocks splits on `\n<div>` / `\n<hr>`, so we strip whitespace between
// tags before wrapping. Anything inside renders via dangerouslySetInnerHTML —
// `<style>` blocks, inline SVG, CSS animations, and gradients all work.
function richBio(html) {
  return `<div class="bio-text">${html.replace(/>\s*\n\s*</g, "><").trim()}</div>`;
}

function pushSession(arr, alterId, daysAgo, startHour, durationHours, isPrimary = true) {
  const start = new Date(Date.now() - daysAgo * DAY);
  start.setHours(startHour, 0, 0, 0);
  arr.push(rec({
    alter_id: alterId,
    is_primary: isPrimary,
    start_time: start.toISOString(),
    end_time: new Date(start.getTime() + durationHours * HOUR).toISOString(),
    is_active: false,
  }));
}

// ---------------------------------------------------------------------------
// The Tour — six demo alters, each showcasing a different bio mode and
// theme preset. The bulletin board demonstrates mentions / reactions /
// threads / polls.
// ---------------------------------------------------------------------------
function buildTapestry() {
  // ── Demo alter definitions ─────────────────────────────────────────────
  // Each alter exhibits one editor mode and ships a unique theme preset.
  // Bios are written so reading a profile teaches the user how that mode
  // works.

  const welcomeBio = `
<p><b>Welcome to Preview Mode.</b> The six alter profiles in this demo each show off a different way to design an alter page. Long-press my chip on the dashboard to make me primary, then tap into any alter to see how their bio is built — and watch the whole app's theme swap as you switch primary fronters.</p>
<p>The four bio modes — <b>Plain</b>, <b>Simple</b>, <b>Blocks</b>, and <b>Raw</b> — sit in the toolbar at the top of the bio editor. This profile uses <b>Plain</b>: a familiar rich-text WYSIWYG with bold, italic, lists, and links. No layout, no chrome — just typed words and inline formatting.</p>
<ul>
  <li>Tap @Atlas to see <b>Simple</b> mode (text + image blocks rendered as a preview).</li>
  <li>Tap @Mira for <b>Blocks</b> (drag-to-reorder typed sections).</li>
  <li>Tap @Echo for <b>Raw HTML</b> (full design control with CSS).</li>
  <li>Tap @Iris for the <b>custom fields</b> walkthrough.</li>
  <li>Tap @Halo for the <b>mini toolbar</b> &amp; per-alter theme presets.</li>
</ul>
<p>You can leave Preview Mode at any time from <i>Settings → Preview Mode</i> or the banner at the top of the page. Anything you change while previewing disappears the moment you exit — your real data is never touched.</p>
`;

  const atlasBio = richBio(`
<p style="margin:0 0 .6em"><b>Atlas — Simple mode demo.</b> Switch the bio editor to <b>Simple</b> when you have a few short text passages and one or two images and you want them rendered as a clean preview without dealing with grid layouts.</p>
<p style="margin:0 0 .6em">Behind the scenes Simple is the same block model as Blocks — the difference is what you see while editing. Simple shows the rendered output and lets you click any text to edit it inline. Drag images, reflow text. No drag handles, no add-block menu.</p>
<div style="display:flex;gap:12px;align-items:flex-start;margin:8px 0;">
  <div style="flex-shrink:0;width:96px;height:96px;border-radius:14px;background:radial-gradient(circle at 35% 30%, #a5b4fc 0%, #4f46e5 60%, #1e1b4b 100%);box-shadow:0 0 24px rgba(99,102,241,.3);"></div>
  <div style="flex:1;font-size:.92em;line-height:1.7;">
    <b style="color:#a5b4fc;">image · text</b><br>
    Insert this block to put a small image on the left and let the body text flow around it. The same block has an "image · right" mirror.
  </div>
</div>
<div style="display:flex;gap:12px;align-items:flex-start;margin:8px 0;flex-direction:row-reverse;">
  <div style="flex-shrink:0;width:96px;height:96px;border-radius:14px;background:linear-gradient(135deg,#fbbf24,#f59e0b);box-shadow:0 0 18px rgba(251,191,36,.3);"></div>
  <div style="flex:1;font-size:.92em;line-height:1.7;">
    <b style="color:#fbbf24;">text · image</b><br>
    The mirror block, with the image on the right. Both blocks accept a width slider and a "crop to square" toggle in the editor sidebar.
  </div>
</div>
<p style="margin:1em 0 0;font-size:.84em;font-style:italic;color:#94a3b8;">When you save, Simple stores the underlying blocks the same way Blocks does — so you can switch modes mid-edit without losing structure.</p>
`);

  const miraBio = richBio(`
<p style="margin:0 0 1em"><b>Mira — Blocks mode demo.</b> Blocks gives you discrete typed sections you can drag, duplicate, and delete. The picker (a "+" button under each block) offers six block types:</p>
<div style="display:grid;grid-template-columns:1fr;gap:8px;font-size:.92em;">
  <div style="border:1px solid #fce7f3;background:#fdf2f8;border-radius:10px;padding:10px 12px;">
    <b style="color:#be185d;">📷 Image</b> — a standalone image, alignment + size + crop options.
  </div>
  <div style="border:1px solid #fce7f3;background:#fdf2f8;border-radius:10px;padding:10px 12px;">
    <b style="color:#be185d;">📝 Text</b> — a paragraph block with inline formatting and per-block colours.
  </div>
  <div style="border:1px solid #fce7f3;background:#fdf2f8;border-radius:10px;padding:10px 12px;">
    <b style="color:#be185d;">⬅️ Image · Text</b> / <b style="color:#be185d;">Text · Image ➡️</b> — combo blocks where the image and copy live side by side.
  </div>
  <div style="border:1px solid #fce7f3;background:#fdf2f8;border-radius:10px;padding:10px 12px;">
    <b style="color:#be185d;">🖼️ Gallery</b> — multiple images in a row, with a max-height slider so the row stays even.
  </div>
  <div style="border:1px solid #fce7f3;background:#fdf2f8;border-radius:10px;padding:10px 12px;">
    <b style="color:#be185d;">━ Divider</b> — a horizontal rule between sections.
  </div>
</div>
<hr style="border:none;border-top:1px dashed #fbcfe8;margin:1em 0">
<p style="margin:0;font-size:.86em;font-style:italic;color:#9d174d;">Each block has a six-dot grip on its left for drag-to-reorder, and the trash icon on its right for delete. The picker re-appears under whatever block you finished editing.</p>
`);

  const echoBio = richBio(`
<style>
@keyframes echo-shimmer{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
@keyframes echo-pulse{0%,100%{opacity:.5;transform:scale(1)}50%{opacity:1;transform:scale(1.04)}}
</style>
<div style="background:linear-gradient(135deg,#020617 0%,#0c4a6e 50%,#020617 100%);background-size:200% 200%;animation:echo-shimmer 8s ease-in-out infinite;border:1px solid #06b6d4;border-radius:18px;padding:0;overflow:hidden;position:relative;">
  <div style="position:absolute;top:14px;right:14px;width:8px;height:8px;border-radius:50%;background:#06b6d4;box-shadow:0 0 16px #06b6d4;animation:echo-pulse 1.6s ease-in-out infinite;"></div>
  <div style="background:linear-gradient(180deg,rgba(6,182,212,.18),transparent);padding:18px 18px 12px;">
    <div style="font-family:'Courier New',monospace;font-size:.62em;letter-spacing:.4em;color:#67e8f9;text-transform:uppercase;margin-bottom:6px;">// raw mode demo</div>
    <div style="font-family:'Atkinson Hyperlegible',sans-serif;font-size:1.6em;font-weight:300;letter-spacing:.16em;color:#cffafe;">ECHO</div>
    <div style="font-size:.74em;color:#67e8f9;margin-top:4px;font-style:italic;">ze/zir · architect · since 2018</div>
  </div>
  <div style="padding:14px 18px 18px;color:#a5f3fc;font-size:.88em;line-height:1.85;">
    <p style="margin:0 0 .9em;">Raw mode hands you a text editor with the full HTML/CSS toolbox: <code style="background:rgba(6,182,212,.15);padding:1px 5px;border-radius:3px;color:#cffafe;">&lt;style&gt;</code> blocks, gradients, animations, SVG, custom fonts. Anything a browser can render.</p>
    <div style="display:grid;grid-template-columns:auto 1fr;gap:6px 14px;font-size:.78em;border-top:1px solid rgba(6,182,212,.3);padding-top:12px;">
      <div style="color:#67e8f9;letter-spacing:.1em;">USE FOR</div><div style="color:#cffafe;">when the four built-in blocks don't capture the layout you want.</div>
      <div style="color:#67e8f9;letter-spacing:.1em;">AVOID IF</div><div style="color:#cffafe;">you don't write code — Plain or Blocks will be faster.</div>
      <div style="color:#67e8f9;letter-spacing:.1em;">EXPORTS AS</div><div style="color:#cffafe;">one big text block; Simply Plural can import these.</div>
    </div>
  </div>
  <div style="background:linear-gradient(0deg,rgba(6,182,212,.1),transparent);padding:8px 18px;border-top:1px solid rgba(6,182,212,.25);font-family:'Courier New',monospace;font-size:.65em;color:#67e8f9;letter-spacing:.18em;">// end · keep weird</div>
</div>
`);

  const irisBio = richBio(`
<p style="margin:0 0 .8em;font-family:Georgia,serif;color:#831843;font-size:1.05em;"><b>Iris — Custom Fields demo.</b> If you'd rather organise an alter's info as labelled rows than as prose, fill in the <b>Custom Fields</b> tab on the profile page. Each row is a small structured fact: pronouns, age, gender, favourite song, comfort food, anything.</p>
<p style="margin:0 0 .8em;font-family:Georgia,serif;color:#9d174d;font-size:.9em;line-height:1.7;">Two flavours:</p>
<ul style="font-family:Georgia,serif;color:#831843;font-size:.9em;line-height:1.7;margin:0 0 .8em;padding-left:1.4em;">
  <li><b>System fields</b> — defined once in <i>Settings → Custom Fields</i>, then every alter gets the same row to fill in.</li>
  <li><b>Per-alter fields</b> — added directly on this profile, only visible here. Use these for one-off facts that don't apply to other alters.</li>
</ul>
<p style="margin:0;font-family:Georgia,serif;color:#9d174d;font-size:.86em;font-style:italic;">Drag rows to reorder. Hide a row with the eye icon. Saved alongside the bio — backups capture both.</p>
`);

  const haloBio = richBio(`
<style>@keyframes halo-warm{0%,100%{box-shadow:0 0 22px rgba(245,158,11,.28)}50%{box-shadow:0 0 38px rgba(245,158,11,.55),0 0 70px rgba(245,158,11,.15)}}</style>
<div style="background:linear-gradient(180deg,#1a0f06 0%,#3b1d08 50%,#1a0f06 100%);border:2px solid #f59e0b;border-radius:10px;padding:0;overflow:hidden;animation:halo-warm 5s ease-in-out infinite;">
  <div style="background:linear-gradient(135deg,rgba(245,158,11,.18),transparent);padding:14px 18px;border-bottom:1px solid rgba(245,158,11,.3);text-align:center;">
    <div style="color:#f59e0b;font-size:.6em;letter-spacing:.4em;">✦ THE ✦</div>
    <div style="font-family:'Playfair Display',serif;font-size:1.7em;font-weight:700;color:#fde68a;letter-spacing:.12em;">STYLIST</div>
    <div style="color:#f59e0b;font-size:.6em;letter-spacing:.4em;">✦ HALO ✦</div>
  </div>
  <div style="padding:16px 18px;color:#fed7aa;font-size:.88em;line-height:1.8;">
    <p style="margin:0 0 .9em;"><b>Halo — Mini Toolbar &amp; Theme Preset demo.</b> While editing in Plain or Raw mode, the strip of icons under the editor is the <b>mini toolbar</b>. Quick-inserts for everything you'd otherwise hand-type:</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 12px;font-size:.82em;">
      <div><b style="color:#fbbf24;">B / I / U</b> — bold, italic, underline.</div>
      <div><b style="color:#fbbf24;">H2 / H3</b> — section headings.</div>
      <div><b style="color:#fbbf24;">List</b> — bullet or numbered.</div>
      <div><b style="color:#fbbf24;">Link</b> — wraps the selection.</div>
      <div><b style="color:#fbbf24;">Image</b> — paste a URL or upload.</div>
      <div><b style="color:#fbbf24;">Hr</b> — horizontal rule divider.</div>
      <div><b style="color:#fbbf24;">Color</b> — text colour swatches.</div>
      <div><b style="color:#fbbf24;">Quote</b> — left-bordered blockquote.</div>
    </div>
    <hr style="border:none;border-top:1px solid rgba(245,158,11,.3);margin:14px 0;">
    <p style="margin:0;font-size:.85em;"><b style="color:#fbbf24;">Theme presets.</b> The amber/black scheme you're seeing right now is my preset. <i>Settings → Themes → Per-Alter Presets</i> lets you bind any colour palette + font + heading colour combo to an alter — the whole app swaps when they become the primary fronter, then snaps back when someone else takes over. Try long-pressing my chip on the dashboard.</p>
  </div>
  <div style="background:linear-gradient(0deg,rgba(245,158,11,.1),transparent);padding:8px;border-top:1px solid rgba(245,158,11,.3);text-align:center;">
    <div style="color:rgba(245,158,11,.5);font-size:.6em;letter-spacing:.4em;">✦ ✦ ✦ ✦ ✦</div>
  </div>
</div>
`);

  // System-wide custom fields — shown on every alter's Info tab. Iris fills
  // these in fully to demonstrate the feature; the others fill in a few.
  const cfFavoriteSong = uid("cf");
  const cfComfortFood  = uid("cf");
  const cfFirstAppeared = uid("cf");

  const defs = [
    {
      k: "welcome", n: "Welcome", p: "any/all", c: "#38bdf8",
      r: "Tour guide", y: 2024, t: ["host","guide"],
      html: welcomeBio,
      cf: {
        [cfFavoriteSong]: "Whatever's on the radio.",
        [cfComfortFood]: "Whatever the rest of the system is having.",
        [cfFirstAppeared]: "When you opened Preview Mode.",
      },
    },
    {
      k: "atlas", n: "Atlas", p: "they/them", c: "#6366f1",
      r: "Wayfinder", y: 2018, t: ["host"],
      html: atlasBio,
      cf: {
        [cfFavoriteSong]: "Music for Airports — Brian Eno",
        [cfFirstAppeared]: "Late teens — they emerged when the system needed somebody who could make decisions.",
      },
    },
    {
      k: "mira", n: "Mira", p: "she/her", c: "#ec4899",
      r: "Composer", y: 2020, t: ["co-host","creative"],
      html: miraBio,
      cf: {
        [cfFavoriteSong]: "Anything by Joanna Newsom.",
        [cfComfortFood]: "Stovetop hot chocolate.",
      },
    },
    {
      k: "echo", n: "Echo", p: "ze/zir", c: "#06b6d4",
      r: "Architect", y: 2018, t: ["builder"],
      html: echoBio,
      cf: {
        [cfFavoriteSong]: "Aphex Twin — #3.",
      },
    },
    {
      k: "iris", n: "Iris", p: "she/her", c: "#db2777",
      r: "Archivist", y: 2015, t: ["co-host","keeper"],
      html: irisBio,
      cf: {
        [cfFavoriteSong]: "Édith Piaf — Non, je ne regrette rien.",
        [cfComfortFood]: "Buttered toast cut diagonally.",
        [cfFirstAppeared]: "Autumn 2015 — the year the rest of the system needed someone to write things down.",
      },
      // Per-alter custom fields demonstrate the alter_custom_fields array.
      acf: [
        { id: uid("acf"), label: "Birthday",        value: "September 14" },
        { id: uid("acf"), label: "Favorite colour", value: "Mulberry" },
        { id: uid("acf"), label: "Sign-off",        value: "— always, Iris" },
        { id: uid("acf"), label: "Reads",           value: "Letters, biographies, recipe books." },
        { id: uid("acf"), label: "Avoids",          value: "Loud rooms, voicemails." },
      ],
    },
    {
      k: "halo", n: "Halo", p: "any/all", c: "#f59e0b",
      r: "Stylist", y: 2019, t: ["co-host","stylist"],
      html: haloBio,
      cf: {
        [cfFavoriteSong]: "Nina Simone — Feeling Good.",
        [cfComfortFood]: "Cinnamon toast and a pot of black tea.",
      },
    },
  ];

  const alters = {};
  for (const def of defs) {
    alters[def.k] = rec({
      name: def.n, pronouns: def.p, color: def.c, role: def.r,
      description: def.html,
      origin_year: def.y, tags: def.t,
      ...(def.cf  ? { custom_fields:        def.cf  } : {}),
      ...(def.acf ? { alter_custom_fields:  def.acf } : {}),
    });
  }

  // ── Fronting ───────────────────────────────────────────────────────────
  // Welcome is the active primary so the dashboard greets the user as they
  // enter. Halo and Iris co-front so the chip strip isn't lonely.
  const fronting = [];
  fronting.push(rec({
    alter_id: alters.welcome.id, is_primary: true,
    start_time: new Date(Date.now() - 30 * 60000).toISOString(),
    end_time: null, is_active: true,
  }));
  fronting.push(rec({
    alter_id: alters.halo.id, is_primary: false,
    start_time: new Date(Date.now() - 30 * 60000).toISOString(),
    end_time: null, is_active: true,
  }));

  // A short rotation across the demo alters over the past two weeks. Plenty
  // of variety on the timeline without filling the day with bars.
  const sched = [
    [1,  9, 3, "atlas"],
    [1, 14, 2, "mira"],
    [2, 10, 2, "iris"],
    [2, 14, 3, "echo"],
    [3,  9, 4, "halo"],
    [3, 15, 2, "atlas"],
    [4, 10, 3, "iris"],
    [5,  9, 2, "welcome"],
    [5, 12, 3, "echo"],
    [6, 10, 2, "halo"],
    [6, 14, 3, "atlas"],
    [7,  9, 2, "mira"],
    [7, 13, 3, "iris"],
    [8, 10, 4, "atlas"],
    [9, 11, 3, "halo"],
    [10, 9, 2, "echo"],
    [10,13, 3, "iris"],
    [11, 9, 3, "atlas"],
    [12,10, 2, "mira"],
    [13, 9, 3, "halo"],
    [13,14, 3, "atlas"],
    [14, 9, 2, "iris"],
  ];
  sched.forEach(([d, h, dur, who]) => pushSession(fronting, alters[who].id, d, h, dur));

  // ── Day-to-day records ─────────────────────────────────────────────────
  // Light fill so timeline / activities / journal pages don't read empty.

  const emotions = [
    rec({ timestamp: isoOffset(0, 9),  mood: 7, energy: 6, emotions: ["welcoming","curious"] }),
    rec({ timestamp: isoOffset(0, 14), mood: 6, energy: 5, emotions: ["focused"] }),
    rec({ timestamp: isoOffset(0, 21), mood: 7, energy: 4, emotions: ["soft","grateful"], note: "Halo settled the evening." }),
    rec({ timestamp: isoOffset(1, 8),  mood: 6, energy: 5, emotions: ["determined"] }),
    rec({ timestamp: isoOffset(1, 13), mood: 7, energy: 6, emotions: ["bright"] }),
    rec({ timestamp: isoOffset(1, 20), mood: 5, energy: 4, emotions: ["thoughtful"], note: "Iris is in editing mode." }),
    rec({ timestamp: isoOffset(2, 10), mood: 5, energy: 5, emotions: ["wary"], note: "Body felt off — Echo took notes." }),
    rec({ timestamp: isoOffset(2, 16), mood: 7, energy: 6, emotions: ["connected"], note: "Halo and Atlas co-fronted, surprisingly steady." }),
    rec({ timestamp: isoOffset(3, 11), mood: 8, energy: 7, emotions: ["creative"], note: "Mira at the piano." }),
    rec({ timestamp: isoOffset(3, 18), mood: 6, energy: 6, emotions: ["productive"] }),
    rec({ timestamp: isoOffset(4, 12), mood: 4, energy: 3, emotions: ["dissociative"], note: "Switching every 90 min — tiring." }),
    rec({ timestamp: isoOffset(4, 18), mood: 6, energy: 4, emotions: ["soft","grateful"] }),
    rec({ timestamp: isoOffset(5, 11), mood: 8, energy: 7, emotions: ["bright","silly"], note: "Welcome and Halo had the morning." }),
    rec({ timestamp: isoOffset(5, 18), mood: 6, energy: 5, emotions: ["settled"] }),
    rec({ timestamp: isoOffset(6, 10), mood: 7, energy: 6, emotions: ["organised"], note: "Iris filed the week's notes." }),
    rec({ timestamp: isoOffset(7, 14), mood: 5, energy: 4, emotions: ["irritated"] }),
    rec({ timestamp: isoOffset(7, 20), mood: 4, energy: 3, emotions: ["heavy"], note: "Therapy was hard today." }),
    rec({ timestamp: isoOffset(8, 12), mood: 6, energy: 5, emotions: ["steady"] }),
    rec({ timestamp: isoOffset(9, 11), mood: 7, energy: 7, emotions: ["happy"] }),
    rec({ timestamp: isoOffset(10, 17),mood: 5, energy: 4, emotions: ["restless"] }),
    rec({ timestamp: isoOffset(11, 19),mood: 4, energy: 3, emotions: ["lonely"] }),
    rec({ timestamp: isoOffset(12, 14),mood: 6, energy: 5, emotions: ["content"] }),
    rec({ timestamp: isoOffset(13, 9), mood: 6, energy: 6, emotions: ["calm","hopeful"] }),
  ];

  const activities = [
    rec({ timestamp: isoOffset(0, 8),  activity_name: "Morning tea",     duration_minutes: 20, color: "#fde68a", notes: "Halo's hour." }),
    rec({ timestamp: isoOffset(0, 13), activity_name: "Reading",         duration_minutes: 45, color: "#0ea5e9" }),
    rec({ timestamp: isoOffset(0, 17), activity_name: "Tea + journaling",duration_minutes: 35, color: "#fde68a" }),
    rec({ timestamp: isoOffset(1, 10), activity_name: "Walk",            duration_minutes: 30, color: "#10b981" }),
    rec({ timestamp: isoOffset(1, 14), activity_name: "Composing",       duration_minutes: 90, color: "#ec4899", notes: "Mira at the piano." }),
    rec({ timestamp: isoOffset(2,  9), activity_name: "Yoga",            duration_minutes: 40, color: "#65a30d" }),
    rec({ timestamp: isoOffset(2, 19), activity_name: "Drawing",         duration_minutes: 75, color: "#f43f5e", notes: "Mira and Iris, side by side." }),
    rec({ timestamp: isoOffset(3, 11), activity_name: "Errands",         duration_minutes: 60, color: "#fbbf24" }),
    rec({ timestamp: isoOffset(3, 18), activity_name: "Movie night",     duration_minutes: 130, color: "#a855f7" }),
    rec({ timestamp: isoOffset(4, 16), activity_name: "Therapy session", duration_minutes: 50, color: "#7c3aed" }),
    rec({ timestamp: isoOffset(5, 10), activity_name: "Park visit",      duration_minutes: 90, color: "#10b981" }),
    rec({ timestamp: isoOffset(6, 13), activity_name: "Code editor",     duration_minutes: 80, color: "#06b6d4", notes: "Echo redesigned the inner-world page." }),
    rec({ timestamp: isoOffset(7, 18), activity_name: "Therapy session", duration_minutes: 50, color: "#7c3aed" }),
    rec({ timestamp: isoOffset(8, 19), activity_name: "Cooking",         duration_minutes: 50, color: "#65a30d" }),
    rec({ timestamp: isoOffset(9, 13), activity_name: "Cooking",         duration_minutes: 70, color: "#65a30d", notes: "Halo on dumplings." }),
    rec({ timestamp: isoOffset(10, 19),activity_name: "Reading",         duration_minutes: 50, color: "#0ea5e9" }),
    rec({ timestamp: isoOffset(11, 16),activity_name: "Game night",      duration_minutes: 120, color: "#a855f7" }),
    rec({ timestamp: isoOffset(13, 10),activity_name: "Long walk",       duration_minutes: 80, color: "#10b981" }),
    // Extra activities scattered through the rest of the month so the
    // Month and Year views look populated for screenshots.
    rec({ timestamp: isoOffset(14, 9),  activity_name: "Yoga",            duration_minutes: 35, color: "#65a30d" }),
    rec({ timestamp: isoOffset(15, 14), activity_name: "Therapy session", duration_minutes: 50, color: "#7c3aed" }),
    rec({ timestamp: isoOffset(15, 18), activity_name: "Cooking",         duration_minutes: 75, color: "#65a30d", notes: "Halo + Iris on a slow stew." }),
    rec({ timestamp: isoOffset(16, 11), activity_name: "Composing",       duration_minutes: 100, color: "#ec4899", notes: "Mira working on the second movement." }),
    rec({ timestamp: isoOffset(17, 13), activity_name: "Park visit",      duration_minutes: 60, color: "#10b981" }),
    rec({ timestamp: isoOffset(18, 17), activity_name: "Code editor",     duration_minutes: 95, color: "#06b6d4" }),
    rec({ timestamp: isoOffset(19, 19), activity_name: "Reading",         duration_minutes: 45, color: "#0ea5e9" }),
    rec({ timestamp: isoOffset(20, 10), activity_name: "Errands",         duration_minutes: 90, color: "#fbbf24" }),
    rec({ timestamp: isoOffset(20, 18), activity_name: "Movie night",     duration_minutes: 110, color: "#a855f7" }),
    rec({ timestamp: isoOffset(21, 8),  activity_name: "Morning tea",     duration_minutes: 25, color: "#fde68a" }),
    rec({ timestamp: isoOffset(21, 14), activity_name: "Drawing",         duration_minutes: 65, color: "#f43f5e" }),
    rec({ timestamp: isoOffset(22, 16), activity_name: "Therapy session", duration_minutes: 50, color: "#7c3aed" }),
    rec({ timestamp: isoOffset(23, 11), activity_name: "Walk",            duration_minutes: 45, color: "#10b981" }),
    rec({ timestamp: isoOffset(24, 19), activity_name: "Cooking",         duration_minutes: 60, color: "#65a30d" }),
    rec({ timestamp: isoOffset(25, 13), activity_name: "Game night",      duration_minutes: 140, color: "#a855f7", notes: "Whole system on the couch." }),
    rec({ timestamp: isoOffset(26, 17), activity_name: "Composing",       duration_minutes: 70, color: "#ec4899" }),
    rec({ timestamp: isoOffset(27, 10), activity_name: "Long walk",       duration_minutes: 95, color: "#10b981" }),
    rec({ timestamp: isoOffset(28, 16), activity_name: "Reading",         duration_minutes: 55, color: "#0ea5e9" }),
  ];

  const journals = [
    rec({
      created_date: isoOffset(0, 21),
      title: "How journal entries work",
      content: "<p><b>Journal entries</b> are long-form, dated, and optionally attached to one {alter} via the <code>alter_id</code> field. Use them for end-of-day reflection, therapy homework, or any prose you want kept.</p><p>This entry has tags <code>tutorial</code> + <code>journals</code> — tags filter the Journals page. The body supports HTML (bold, italic, lists, links).</p>",
      tags: ["tutorial", "journals"], alter_id: alters.welcome.id,
    }),
    rec({
      created_date: isoOffset(1, 22),
      title: "Editor modes — picking one",
      content: "<p>If you've never written HTML, stay in <b>Plain</b>. The mini toolbar covers 90% of what you'll want — bold, italic, headings, lists, links, images, blockquotes.</p><p>If your bio has a couple of images you want positioned with text, jump to <b>Simple</b>. It's WYSIWYG over the same block model, so what you see while editing is what saves.</p><p><b>Blocks</b> is for layouts where the order matters — drag a gallery between two paragraphs, etc. <b>Raw</b> is for when you know exactly what HTML you want.</p>",
      tags: ["tutorial", "alters"], alter_id: alters.welcome.id,
    }),
    rec({
      created_date: isoOffset(2, 22),
      title: "Designing my profile",
      content: "<p>Spent an hour today rebuilding the profile in Raw mode. The animation on the cyan dot is just a tiny CSS keyframe — surprisingly satisfying once you remember that bios are basically tiny webpages.</p><p>Notes for future me: keep the styles inside <code>&lt;style&gt;</code> blocks scoped to a wrapper class, otherwise other alters' bios pick them up.</p>",
      tags: ["alters", "design"], alter_id: alters.echo.id,
    }),
    rec({
      created_date: isoOffset(3, 23),
      title: "Composing in the morning",
      content: "<p>Mornings are when I'm sharpest. The piano sits in the front room and the rest of the system mostly leaves me to it until 11ish. Today I finished the bridge for the song that's been stuck for two weeks.</p>",
      tags: ["mira", "music"], alter_id: alters.mira.id,
    }),
    rec({
      created_date: isoOffset(5, 22),
      title: "Custom fields cleanup",
      content: "<p>Pruned the system-wide fields down to three (favourite song, comfort food, when this alter first appeared) and moved the trivia I had on Atlas's profile into per-alter fields instead. Cleaner — system fields are the things every alter should answer; per-alter fields are everything else.</p>",
      tags: ["alters", "housekeeping"], alter_id: alters.iris.id,
    }),
    rec({
      created_date: isoOffset(7, 21),
      title: "Therapy notes — boundaries with primary fronters",
      content: "<p>Brought up that I've been holding the front more than feels good. We landed on a rule: if I'm primary for more than 4 hours and Halo or Iris are co-fronting, the body should hand off rather than push through.</p><p>Atlas — would you log this in our system agreements?</p>",
      tags: ["therapy"], alter_id: alters.atlas.id,
    }),
    rec({
      created_date: isoOffset(10, 22),
      title: "What the theme presets are doing for us",
      content: "<p>The colour swap when primary changes is small, but the cumulative effect — knowing at a glance who's holding the body without having to read the chip — has been bigger than I expected. Halo's amber, Iris's berry, Echo's cyan: the room shifts and we adjust.</p>",
      tags: ["design", "themes"], alter_id: alters.halo.id,
    }),
  ];

  const checkIns = [
    rec({ created_date: isoOffset(0, 8),  mood: 7, communication_quality: 8, system_harmony: 8, note: "Welcome on the dashboard, Halo in the kitchen, Iris on the calendar. Easy morning." }),
    rec({ created_date: isoOffset(2, 21), mood: 6, communication_quality: 7, system_harmony: 7, note: "System meeting touched on the new theme presets. Echo wants to redo the Inner Room." }),
    rec({ created_date: isoOffset(3, 21), mood: 6, communication_quality: 7, system_harmony: 7, note: "Six of us at the meeting. Mira read the bridge of her new song." }),
    rec({ created_date: isoOffset(5, 21), mood: 7, communication_quality: 8, system_harmony: 8, note: "Steady week. Mira's been composing every morning." }),
    rec({ created_date: isoOffset(7, 20), mood: 5, communication_quality: 5, system_harmony: 5, note: "Tense — Atlas and Halo disagreeing about the front-rotation rules." }),
    rec({ created_date: isoOffset(10, 21),mood: 6, communication_quality: 7, system_harmony: 7, note: "Resolved the rotation thing. Halo is the lead on evenings; Atlas covers mornings." }),
    rec({ created_date: isoOffset(11, 9), mood: 7, communication_quality: 8, system_harmony: 8, note: "Felt like a big team this morning." }),
  ];

  const statusNotes = [
    rec({ timestamp: isoOffset(0, 9),  note: "Welcome at the front. Halo behind, lighting candles." }),
    rec({ timestamp: isoOffset(0, 16), note: "Iris took over for the afternoon to file the week's letters." }),
    rec({ timestamp: isoOffset(0, 21), note: "Halo made tea. The kitchen feels like a kitchen again." }),
    rec({ timestamp: isoOffset(1, 15), note: "Iris on phones today." }),
    rec({ timestamp: isoOffset(2, 10), note: "Mira composing." }),
    rec({ timestamp: isoOffset(2, 14), note: "Switching every 90 minutes or so. Tiring but not unsafe." }),
    rec({ timestamp: isoOffset(3,  9), note: "Welcome out and warm. New month vibes." }),
    rec({ timestamp: isoOffset(4, 13), note: "Echo refactored the dashboard cards." }),
    rec({ timestamp: isoOffset(5, 17), note: "Halo came up out of nowhere — kitchen got cinnamon vibes for an hour." }),
    rec({ timestamp: isoOffset(6, 19), note: "Halo and Atlas co-front for the evening tea ritual." }),
    rec({ timestamp: isoOffset(7, 21), note: "Therapy day. Heavy but contained." }),
    rec({ timestamp: isoOffset(8,  9), note: "Atlas needs sleep. Iris is covering today." }),
    rec({ timestamp: isoOffset(9, 11), note: "All six of us at one of those rare full-system check-ins." }),
    rec({ timestamp: isoOffset(11, 20),note: "Game night was loud — Echo, Mira, Halo all at once." }),
    rec({ timestamp: isoOffset(13,  9),note: "Body feels rested. Atlas back at the front." }),
  ];

  // ── Relationships ──────────────────────────────────────────────────────
  // Used by the System Map page. Each entry is one labelled link between
  // two {alters}; relationship types are configured separately so users
  // can add their own labels.
  const relationships = [
    rec({ alter_id_a: alters.atlas.id,   alter_id_b: alters.iris.id,    relationship_type: "Co-host" }),
    rec({ alter_id_a: alters.welcome.id, alter_id_b: alters.atlas.id,   relationship_type: "Hands off to" }),
    rec({ alter_id_a: alters.welcome.id, alter_id_b: alters.iris.id,    relationship_type: "Hands off to" }),
    rec({ alter_id_a: alters.iris.id,    alter_id_b: alters.mira.id,    relationship_type: "Edits drafts for" }),
    rec({ alter_id_a: alters.halo.id,    alter_id_b: alters.atlas.id,   relationship_type: "Soothes" }),
    rec({ alter_id_a: alters.halo.id,    alter_id_b: alters.iris.id,    relationship_type: "Soothes" }),
    rec({ alter_id_a: alters.echo.id,    alter_id_b: alters.iris.id,    relationship_type: "Trusts deeply" }),
    rec({ alter_id_a: alters.echo.id,    alter_id_b: alters.mira.id,    relationship_type: "Collaborates with" }),
    rec({ alter_id_a: alters.mira.id,    alter_id_b: alters.halo.id,    relationship_type: "Sibling-like" }),
    rec({ alter_id_a: alters.atlas.id,   alter_id_b: alters.echo.id,    relationship_type: "Mentor to" }),
  ];

  const systemEvents = [
    rec({ type: "emergence", date: new Date(2015, 8, 1).toISOString(),  year_only: true, source_alter_ids: [],                       result_alter_ids: [alters.iris.id],                       cause: "Burnout",     notes: "Iris stepped forward when Welcome needed a co-host." }),
    rec({ type: "split",     date: new Date(2018, 0, 1).toISOString(),  year_only: true, source_alter_ids: [alters.welcome.id],      result_alter_ids: [alters.atlas.id, alters.echo.id],      cause: "Capacity",    notes: "Atlas and Echo emerged the same year — wayfinding and architecting." }),
    rec({ type: "split",     date: new Date(2019, 0, 1).toISOString(),  year_only: true, source_alter_ids: [alters.welcome.id],      result_alter_ids: [alters.halo.id],                       cause: "Comfort",     notes: "Halo arrived to hold the warmth." }),
    rec({ type: "split",     date: new Date(2020, 0, 1).toISOString(),  year_only: true, source_alter_ids: [alters.iris.id],         result_alter_ids: [alters.mira.id],                       cause: "Creativity",  notes: "Mira split off from Iris's voice into a creative one." }),
    rec({ type: "return",    date: new Date(2024, 5, 1).toISOString(),  year_only: true, source_alter_ids: [],                       result_alter_ids: [alters.welcome.id],                    cause: "Re-grounding",notes: "Welcome stepped back into a tour-guide / grounding role after a long quiet period." }),
  ];

  // ── Symptoms (real preset catalogue, mirrors utils/symptomDefaults.js) ─
  const symptoms = [
    rec({ label: "Overall mood",         category: "symptom", type: "rating",  is_positive: true,  color: "#8B5CF6", order: 0,  is_default: true }),
    rec({ label: "Energy level",         category: "symptom", type: "rating",  is_positive: true,  color: "#F59E0B", order: 1,  is_default: true }),
    rec({ label: "Self esteem",          category: "symptom", type: "rating",  is_positive: true,  color: "#A78BFA", order: 2,  is_default: true }),
    rec({ label: "Anxiety",              category: "symptom", type: "rating",  is_positive: false, color: "#EF4444", order: 3,  is_default: true }),
    rec({ label: "Depression",           category: "symptom", type: "rating",  is_positive: false, color: "#6366F1", order: 4,  is_default: true }),
    rec({ label: "Feeling overwhelmed",  category: "symptom", type: "rating",  is_positive: false, color: "#DC2626", order: 5,  is_default: true }),
    rec({ label: "Trouble sleeping",     category: "symptom", type: "rating",  is_positive: false, color: "#1D4ED8", order: 6,  is_default: true }),
    rec({ label: "Triggered switch",     category: "symptom", type: "boolean", is_positive: false, color: "#B45309", order: 7,  is_default: true }),
    rec({ label: "Random switch",        category: "symptom", type: "boolean", is_positive: false, color: "#92400E", order: 8,  is_default: true }),
    rec({ label: "Used coping skills",   category: "habit",   type: "boolean", is_positive: true,  color: "#06B6D4", order: 0,  is_default: true }),
    rec({ label: "Attended therapy",     category: "habit",   type: "boolean", is_positive: true,  color: "#0891B2", order: 1,  is_default: true }),
    rec({ label: "Self-care",            category: "habit",   type: "boolean", is_positive: true,  color: "#4ADE80", order: 2,  is_default: true }),
  ];
  const symptomSessions = [
    rec({ symptom_id: symptoms[3].id, start_time: isoOffset(2, 14), end_time: isoOffset(2, 16), severity: 5 }),
    rec({ symptom_id: symptoms[5].id, start_time: isoOffset(7, 10), end_time: isoOffset(7, 12), severity: 6 }),
  ];

  const settings = rec({
    term_system: "system",
    term_alter:  "alter",
    term_switch: "switch",
    term_front:  "front",
    is_anonymized: false,
  });

  // ── Per-alter theme presets ────────────────────────────────────────────
  // Every demo alter ships a unique palette + font combination. Long-pressing
  // their dashboard chip swaps the whole app to their preset; switching the
  // primary back swaps it again.
  const themePresets = {
    "Welcome — Sky": {
      light: { bg: "#F0F9FF", surface: "#E0F2FE", primary: "#0284C7", secondary: "#BAE6FD", accent: "#0EA5E9", muted: "#E0F2FE", "text-primary": "#082F49", "text-secondary": "#075985" },
      dark:  { bg: "#0C1827", surface: "#0E2A3F", primary: "#38BDF8", secondary: "#1E3A52", accent: "#7DD3FC", muted: "#1F3447", "text-primary": "#E0F2FE", "text-secondary": "#7DD3FC" },
      font: "'Atkinson Hyperlegible', sans-serif",
      themeMode: null,
      fontSize: "default",
      terms: { system: "system", alter: "alter", switch: "switch", front: "front" },
    },
    "Atlas — Constellation": {
      light: { bg: "#EEF2FF", surface: "#E0E7FF", primary: "#4338CA", secondary: "#C7D2FE", accent: "#6366F1", muted: "#E0E7FF", "text-primary": "#1E1B4B", "text-secondary": "#3730A3" },
      dark:  { bg: "#03050F", surface: "#0F172A", primary: "#A5B4FC", secondary: "#1E1B4B", accent: "#6366F1", muted: "#312E81", "text-primary": "#E0E7FF", "text-secondary": "#A5B4FC" },
      font: "'Atkinson Hyperlegible', sans-serif",
      themeMode: "dark",
      fontSize: "default",
      terms: { system: "system", alter: "alter", switch: "switch", front: "front" },
    },
    "Mira — Bloom": {
      light: { bg: "#FDF2F8", surface: "#FCE7F3", primary: "#BE185D", secondary: "#FBCFE8", accent: "#EC4899", muted: "#FCE7F3", "text-primary": "#500724", "text-secondary": "#9D174D" },
      dark:  { bg: "#1F0B1B", surface: "#2D1325", primary: "#F472B6", secondary: "#5B1B47", accent: "#EC4899", muted: "#4A1737", "text-primary": "#FBCFE8", "text-secondary": "#F0ABFC" },
      font: "'Playfair Display', serif",
      themeMode: null,
      fontSize: "default",
      terms: { system: "system", alter: "alter", switch: "switch", front: "front" },
    },
    "Echo — Neon": {
      light: { bg: "#ECFEFF", surface: "#CFFAFE", primary: "#0E7490", secondary: "#A5F3FC", accent: "#06B6D4", muted: "#CFFAFE", "text-primary": "#083344", "text-secondary": "#155E75" },
      dark:  { bg: "#020617", surface: "#0C1828", primary: "#22D3EE", secondary: "#155E75", accent: "#67E8F9", muted: "#0E2A3F", "text-primary": "#CFFAFE", "text-secondary": "#67E8F9" },
      font: "'Atkinson Hyperlegible', sans-serif",
      themeMode: "dark",
      fontSize: "default",
      terms: { system: "system", alter: "alter", switch: "switch", front: "front" },
    },
    "Iris — Berry": {
      light: { bg: "#FDF2F8", surface: "#FBCFE8", primary: "#DB2777", secondary: "#FBCFE8", accent: "#EC4899", muted: "#FCE7F3", "text-primary": "#500724", "text-secondary": "#831843" },
      dark:  { bg: "#1F0B2E", surface: "#2D1645", primary: "#EC4899", secondary: "#6B1B47", accent: "#F472B6", muted: "#5A3668", "text-primary": "#FBCFE8", "text-secondary": "#F0ABFC" },
      font: "'Playfair Display', serif",
      themeMode: null,
      fontSize: "default",
      terms: { system: "system", alter: "alter", switch: "switch", front: "front" },
    },
    "Halo — Glow": {
      light: { bg: "#FFF7ED", surface: "#FFEDD5", primary: "#C2410C", secondary: "#FED7AA", accent: "#F97316", muted: "#FFEDD5", "text-primary": "#431407", "text-secondary": "#7C2D12" },
      dark:  { bg: "#1F0B05", surface: "#2A1208", primary: "#FB923C", secondary: "#3B1A0A", accent: "#FDBA74", muted: "#5A2E15", "text-primary": "#FFEDD5", "text-secondary": "#FED7AA" },
      font: "'Playfair Display', serif",
      themeMode: null,
      fontSize: "default",
      terms: { system: "system", alter: "alter", switch: "switch", front: "front" },
    },
  };

  const alterThemeLinks = {
    [alters.welcome.id]: "Welcome — Sky",
    [alters.atlas.id]:   "Atlas — Constellation",
    [alters.mira.id]:    "Mira — Bloom",
    [alters.echo.id]:    "Echo — Neon",
    [alters.iris.id]:    "Iris — Berry",
    [alters.halo.id]:    "Halo — Glow",
  };

  // ── Groups ─────────────────────────────────────────────────────────────
  // Hierarchical example: an "Index" container with three top-level
  // facets — By Role, By Gender, By Age — each with leaf subgroups that
  // hold actual alters. Groups can nest arbitrarily; pass `parent: <id>`
  // to put one inside another.
  const gIndex = rec({
    name: "Index",
    color: "#7c3aed",
    description: "Top-level container that holds the three sorting facets below. A real system might use Index for an at-a-glance roster, then dive into a facet for finer-grained organisation.",
    member_alter_ids: [],
    parent: "root", order: 0,
  });
  const gByRole = rec({
    name: "By Role",
    color: "#0ea5e9",
    description: "Sort {alters} by what they do — host, co-host, builder, etc. Each child group lists its members.",
    member_alter_ids: [],
    parent: gIndex.id, order: 0,
  });
  const gByGender = rec({
    name: "By Gender",
    color: "#ec4899",
    description: "Sort {alters} by gender presentation. Many systems use this view for at-a-glance pronoun reference.",
    member_alter_ids: [],
    parent: gIndex.id, order: 1,
  });
  const gByAge = rec({
    name: "By Age",
    color: "#f59e0b",
    description: "Sort {alters} by perceived age. Useful when you have littles, teens, and adults sharing the body.",
    member_alter_ids: [],
    parent: gIndex.id, order: 2,
  });

  // Leaves under By Role
  const gHosts = rec({
    name: "Hosts",
    color: "#0284c7",
    description: "The {alters} who tend to lead day-to-day fronting and decision-making.",
    member_alter_ids: [alters.welcome.id, alters.atlas.id],
    parent: gByRole.id, order: 0,
  });
  const gCoHosts = rec({
    name: "Co-hosts",
    color: "#db2777",
    description: "Secondary leaders — often filling in when the primary host needs rest, or taking specialised slices of the day.",
    member_alter_ids: [alters.iris.id, alters.mira.id],
    parent: gByRole.id, order: 1,
  });
  const gBuilders = rec({
    name: "Builders & Stylists",
    color: "#06b6d4",
    description: "Designers, architects, and the {alters} who shape the system's internal world or external presentation.",
    member_alter_ids: [alters.echo.id, alters.halo.id],
    parent: gByRole.id, order: 2,
  });

  // Leaves under By Gender
  const gFeminine = rec({
    name: "Feminine",
    color: "#f472b6",
    description: "{Alters} who use feminine pronouns or feel feminine in presentation.",
    member_alter_ids: [alters.iris.id, alters.mira.id],
    parent: gByGender.id, order: 0,
  });
  const gNonbinary = rec({
    name: "Non-binary / fluid",
    color: "#a78bfa",
    description: "{Alters} who use neutral pronouns, all pronouns, or move between presentations.",
    member_alter_ids: [alters.welcome.id, alters.atlas.id, alters.echo.id, alters.halo.id],
    parent: gByGender.id, order: 1,
  });

  // Leaves under By Age
  const gAgeless = rec({
    name: "Ageless",
    color: "#94a3b8",
    description: "{Alters} without a clear apparent age — concepts, voices, or fluid-aged presences.",
    member_alter_ids: [alters.welcome.id],
    parent: gByAge.id, order: 0,
  });
  const gAdult = rec({
    name: "Adult",
    color: "#84cc16",
    description: "{Alters} who present as adults.",
    member_alter_ids: [alters.atlas.id, alters.iris.id, alters.mira.id, alters.echo.id, alters.halo.id],
    parent: gByAge.id, order: 1,
  });

  const groups = [
    gIndex,
    gByRole, gByGender, gByAge,
    gHosts, gCoHosts, gBuilders,
    gFeminine, gNonbinary,
    gAgeless, gAdult,
  ];

  // ── Bulletin board ─────────────────────────────────────────────────────
  // Worked examples of every bulletin feature: pin, mention, reactions
  // with multiple reactors, co-authoring, threads, polls.
  const bulletins = [
    rec({
      author_alter_id: alters.welcome.id,
      author_alter_ids: [alters.welcome.id],
      content: "📌 <b>Bulletin Board.</b> System-wide feed. Anyone can post. Type @ then an {alter} name to mention them — they'll see a notification. Pin a post (the pin icon) to lock it to the top. React with emoji and tap a reaction's count to see who reacted. Comment threads collapse below each post.",
      mentioned_alter_ids: [],
      is_pinned: true,
      reactions: { "📌": [alters.atlas.id, alters.iris.id, alters.halo.id, alters.mira.id, alters.echo.id] },
      created_date: isoOffset(0, 19),
    }),
    rec({
      author_alter_id: alters.iris.id,
      author_alter_ids: [alters.iris.id],
      content: "<b>Mention example.</b> @Atlas — the system map's looking lean now that we've got each alter mapped to a relationship type. Want to swing by and add yourself to the Inner Room?",
      mentioned_alter_ids: [alters.atlas.id],
      is_pinned: false,
      reactions: { "👍": [alters.atlas.id, alters.welcome.id] },
      created_date: isoOffset(1, 11),
    }),
    rec({
      author_alter_id: alters.mira.id,
      author_alter_ids: [alters.mira.id],
      content: "<b>Reactions example.</b> Tap the smiley to react. Multiple {alters} can pick the same emoji. Tap an emoji's count to see exactly who reacted.",
      mentioned_alter_ids: [],
      is_pinned: false,
      reactions: {
        "💜": [alters.iris.id, alters.halo.id, alters.welcome.id],
        "🎶": [alters.echo.id, alters.atlas.id],
        "✅": [alters.iris.id],
      },
      created_date: isoOffset(2, 14, 30),
    }),
    rec({
      author_alter_id: alters.atlas.id,
      author_alter_ids: [alters.atlas.id, alters.iris.id],
      content: "<b>Co-author example.</b> A bulletin can be authored by more than one {alter} at once — the avatar list at compose time lets you tap anyone fronting. Iris and I co-wrote this one as a system note.",
      mentioned_alter_ids: [],
      is_pinned: false,
      reactions: { "👥": [alters.welcome.id, alters.echo.id] },
      created_date: isoOffset(3, 12),
    }),
    rec({
      author_alter_id: alters.echo.id,
      author_alter_ids: [alters.echo.id],
      content: "<b>Long-form bulletin.</b> Bulletins support basic HTML — <b>bold</b>, <i>italic</i>, lists, links, line breaks, paragraphs. Use them for system announcements, agreements, or anything you want pinned where everyone can find it. Compare with Journal entries (long-form, alter-attached) and Status Notes (short, system-wide, immutable timeline log).",
      mentioned_alter_ids: [],
      is_pinned: false,
      reactions: { "📝": [alters.iris.id, alters.atlas.id] },
      created_date: isoOffset(4, 14),
    }),
    rec({
      author_alter_id: alters.halo.id,
      author_alter_ids: [alters.halo.id],
      content: "<b>Casual example.</b> bulletins don't have to be Important.™ this is just me saying the kitchen smells like cinnamon and the rest of the system is welcome to come up if they want some 🌙",
      mentioned_alter_ids: [],
      is_pinned: false,
      reactions: { "🥰": [alters.iris.id, alters.welcome.id, alters.mira.id], "🌙": [alters.atlas.id] },
      created_date: isoOffset(5, 19),
    }),
    rec({
      author_alter_id: alters.iris.id,
      author_alter_ids: [alters.iris.id],
      content: "<b>Comments example.</b> Tap the speech bubble to expand the thread under any bulletin. Comments support @mentions too — @Echo, can you confirm the back-end fix for the dashboard chip wrap?",
      mentioned_alter_ids: [alters.echo.id],
      is_pinned: false,
      reactions: {},
      created_date: isoOffset(6, 16),
    }),
    rec({
      author_alter_id: alters.atlas.id,
      author_alter_ids: [alters.atlas.id],
      content: "<b>Pinned vs. recent.</b> Pinned posts (like the guide at the top) stay above unpinned posts regardless of date. Tap the pin icon on a post to toggle.",
      mentioned_alter_ids: [],
      is_pinned: false,
      reactions: { "📍": [alters.iris.id, alters.welcome.id] },
      created_date: isoOffset(8, 10),
    }),
    rec({
      author_alter_id: alters.echo.id,
      author_alter_ids: [alters.echo.id],
      content: "<b>Polls example.</b> Bulletins can carry a poll — see the next post. Members vote by tapping; everyone can see who voted for what once they cast their own vote.",
      mentioned_alter_ids: [],
      is_pinned: false,
      reactions: {},
      created_date: isoOffset(2, 20),
    }),
    rec({
      author_alter_id: alters.welcome.id,
      author_alter_ids: [alters.welcome.id],
      content: "<b>Lists, links &amp; line breaks.</b><br>You can write:<ul><li>bulleted lists</li><li>numbered lists</li><li><b>bold</b> and <i>italic</i></li></ul>And links to docs (the manifest's quick-action shortcuts work on installed PWAs — long-press the home-screen icon to try them).",
      mentioned_alter_ids: [],
      is_pinned: false,
      reactions: { "📚": [alters.iris.id], "✨": [alters.halo.id] },
      created_date: isoOffset(9, 13),
    }),
  ];

  const bulletinComments = [
    rec({ bulletin_id: bulletins[0].id, author_alter_id: alters.iris.id,    content: "Tip: comments support the same basic HTML formatting as posts.", created_date: isoOffset(0, 19, 30) }),
    rec({ bulletin_id: bulletins[0].id, author_alter_id: alters.atlas.id,   content: "Tip 2: tap an emoji count and you see the reactor list for that emoji.", created_date: isoOffset(0, 20) }),
    rec({ bulletin_id: bulletins[0].id, author_alter_id: alters.halo.id,    content: "Tip 3: long-press a bulletin to open the action menu (pin, delete, share, copy link).", created_date: isoOffset(0, 20, 30) }),
    rec({ bulletin_id: bulletins[1].id, author_alter_id: alters.atlas.id,   content: "Got the mention — added myself to the Inner Room. Thank you!", created_date: isoOffset(1, 11, 20) }),
    rec({ bulletin_id: bulletins[2].id, author_alter_id: alters.iris.id,    content: "Threads can run long — they collapse after the first few replies and expand on tap.", created_date: isoOffset(2, 15) }),
    rec({ bulletin_id: bulletins[2].id, author_alter_id: alters.echo.id,    content: "And nested replies indent. Try replying to this comment.", created_date: isoOffset(2, 15, 30) }),
    rec({ bulletin_id: bulletins[3].id, author_alter_id: alters.welcome.id, content: "Co-authored posts show every author's avatar in the row.", created_date: isoOffset(3, 13) }),
    rec({ bulletin_id: bulletins[5].id, author_alter_id: alters.iris.id,    content: "Joining you for the cinnamon. Bringing a book.", created_date: isoOffset(5, 19, 20) }),
    rec({ bulletin_id: bulletins[6].id, author_alter_id: alters.echo.id,    content: "Confirmed — landed in the morning push. Should be live for everyone now.", created_date: isoOffset(6, 17) }),
    rec({ bulletin_id: bulletins[6].id, author_alter_id: alters.iris.id,    content: "Beautiful. @Welcome — would you mind testing it on your end?", created_date: isoOffset(6, 17, 15) }),
    rec({ bulletin_id: bulletins[6].id, author_alter_id: alters.welcome.id, content: "Tested. Looks great.", created_date: isoOffset(6, 17, 30) }),
    rec({ bulletin_id: bulletins[8].id, author_alter_id: alters.welcome.id, content: "Lists also support nesting — try indenting a list item with the toolbar arrows.", created_date: isoOffset(9, 14) }),
  ];

  // ── Polls ──────────────────────────────────────────────────────────────
  const polls = [
    rec({
      question: "Which bio mode should we use for the new arrival's profile?",
      options: [
        { label: "Plain — easiest to start", votes: [alters.welcome.id, alters.atlas.id] },
        { label: "Simple — text + images",   votes: [alters.iris.id] },
        { label: "Blocks — full layout",     votes: [alters.mira.id, alters.halo.id] },
        { label: "Raw — go wild with CSS",   votes: [alters.echo.id] },
      ],
      multi_choice: false,
      author_alter_id: alters.iris.id,
      created_date: isoOffset(2, 21),
    }),
    rec({
      question: "Friday night plan?",
      options: [
        { label: "Game night",   votes: [alters.echo.id, alters.mira.id, alters.halo.id] },
        { label: "Movie night",  votes: [alters.iris.id, alters.welcome.id] },
        { label: "Early bed",    votes: [alters.atlas.id] },
      ],
      multi_choice: false,
      author_alter_id: alters.welcome.id,
      created_date: isoOffset(1, 18),
    }),
    rec({
      question: "Skills to focus on this week",
      options: [
        { label: "Grounding",    votes: [alters.atlas.id, alters.halo.id, alters.welcome.id] },
        { label: "Journaling",   votes: [alters.iris.id, alters.mira.id] },
        { label: "Reaching out", votes: [alters.echo.id] },
        { label: "Movement",     votes: [alters.halo.id, alters.atlas.id] },
      ],
      multi_choice: true,
      author_alter_id: alters.atlas.id,
      created_date: isoOffset(6, 9),
    }),
  ];

  // ── Tasks ──────────────────────────────────────────────────────────────
  const tasks = [
    // A handful of urgent / pinned tasks so the Dashboard Pinned strip
    // surfaces something interesting in screenshots, plus one with a
    // scheduled_at so it renders on the activity grid as a 60-min block.
    rec({ title: "Refill prescriptions",       completed: false, priority: "high",   due_date: isoOffset(-2, 17), assigned_alter_ids: [alters.atlas.id], is_urgent: true, pinned_to_dashboard: true, description: "Lithium + sertraline at the pharmacy down the block." }),
    rec({ title: "Call therapist about the Thursday cancel", completed: false, priority: "high", due_date: isoOffset(-1, 12), assigned_alter_ids: [alters.atlas.id], is_urgent: true, description: "She's offline tomorrow — leave a voicemail." }),
    rec({ title: "Compose lullaby for the inner-world bedtime ritual", completed: false, priority: "low", scheduled_at: isoOffset(-1, 20), assigned_alter_ids: [alters.mira.id], description: "Mira's idea. Forty minutes, piano only." }),
    rec({ title: "Email therapist",            completed: true,  priority: "medium", completed_date: isoOffset(1, 11), assigned_alter_ids: [alters.atlas.id] }),
    rec({ title: "Plan weekend hike",          completed: false, priority: "low",    due_date: isoOffset(-4, 9),  assigned_alter_ids: [alters.halo.id] }),
    rec({ title: "Call Mum",                   completed: false, priority: "medium" }),
    rec({ title: "Buy groceries",              completed: true,  priority: "medium", completed_date: isoOffset(2, 18), assigned_alter_ids: [alters.iris.id] }),
    rec({ title: "Sketch next album cover",    completed: false, priority: "low",    assigned_alter_ids: [alters.mira.id] }),
    rec({ title: "Pick a theme preset for the new front rotation", completed: false, priority: "low", assigned_alter_ids: [alters.halo.id] }),
    rec({ title: "Write a bulletin announcing the system meeting",  completed: true,  priority: "medium", completed_date: isoOffset(2, 11), assigned_alter_ids: [alters.iris.id] }),
    rec({ title: "Refactor the inner-world layout in Raw mode",     completed: false, priority: "low", assigned_alter_ids: [alters.echo.id] }),
    rec({ title: "Schedule next therapy appointment",               completed: false, priority: "high", due_date: isoOffset(-3, 16), assigned_alter_ids: [alters.atlas.id] }),
    rec({ title: "Restock Halo's tea cabinet",                       completed: false, priority: "low", assigned_alter_ids: [alters.halo.id] }),
    rec({ title: "Replace bedroom lightbulb",                        completed: true,  priority: "low", completed_date: isoOffset(3, 19) }),
  ];

  // DailyTaskTemplate uses { frequency, mode, is_active, points,
  // sort_order } — earlier records here used schedule_days /
  // schedule_time / priority and were filtered out by is_active===true.
  const dailyTaskTemplates = [
    rec({ title: "Morning meds",       description: "Levothyroxine + vitamin D, on empty stomach.", frequency: "daily",  mode: "MANUAL", points: 3, is_active: true, sort_order: 0 }),
    rec({ title: "Brush teeth",        frequency: "daily",  mode: "MANUAL", points: 1, is_active: true, sort_order: 1 }),
    rec({ title: "Drink water",        description: "Aim for 6 glasses.",                          frequency: "daily",  mode: "MANUAL", points: 2, is_active: true, sort_order: 2 }),
    rec({ title: "Evening journal",    description: "Five minutes — even one line counts.",        frequency: "daily",  mode: "MANUAL", points: 2, is_active: true, sort_order: 3 }),
    rec({ title: "Read 15 minutes",    frequency: "daily",  mode: "MANUAL", points: 2, is_active: true, sort_order: 4 }),
    rec({ title: "Stretch",            frequency: "daily",  mode: "MANUAL", points: 1, is_active: true, sort_order: 5 }),
    rec({ title: "System meeting",     description: "Sunday roll-call.",                           frequency: "weekly", mode: "MANUAL", points: 5, is_active: true, sort_order: 0 }),
    rec({ title: "Laundry",            frequency: "weekly", mode: "MANUAL", points: 4, is_active: true, sort_order: 1 }),
    rec({ title: "Long walk",          description: "Counts as the weekly cardio.",                frequency: "weekly", mode: "MANUAL", points: 4, is_active: true, sort_order: 2 }),
    rec({ title: "Plan the week",      frequency: "weekly", mode: "MANUAL", points: 3, is_active: true, sort_order: 3 }),
  ];

  // The Sleep page expects full ISO datetimes for bedtime / wake_time
  // (parseISO → format h:mm a). Earlier Tapestry stored HH:MM strings,
  // which made the Sleep page crash. Quality is also on a 1–10 scale in
  // the UI, not 1–5.
  //
  // Helper: build a sleep entry where the bedtime is on the previous
  // calendar day (so "wake on day 5" reads naturally).
  function sleepEntry(daysAgo, bedHour, bedMin, wakeHour, wakeMin, quality, extra = {}) {
    const wakeDate = new Date(Date.now() - daysAgo * DAY);
    wakeDate.setHours(wakeHour, wakeMin, 0, 0);
    const bedDate = new Date(wakeDate);
    // Bedtime is the previous evening — subtract a day, then set hour.
    bedDate.setDate(bedDate.getDate() - 1);
    bedDate.setHours(bedHour, bedMin, 0, 0);
    return rec({
      date: wakeDate.toISOString().slice(0, 10),
      bedtime: bedDate.toISOString(),
      wake_time: wakeDate.toISOString(),
      quality,
      ...extra,
    });
  }
  const sleepEntries = [
    sleepEntry(0,  23,  0, 7, 30, 8, { notes: "Steady night." }),
    sleepEntry(1,  23, 30, 7,  0, 6),
    sleepEntry(2,  22, 45, 6, 50, 9, { notes: "Fell asleep before Halo's tea even cooled." }),
    sleepEntry(3,   0, 15, 7, 45, 5, { notes: "Stayed up writing the bulletins.", is_interrupted: true, interruption_count: 2 }),
    sleepEntry(4,  22, 30, 6, 30, 9, { dreamed: true, notes: "Vivid dream about the inner-world garden." }),
    sleepEntry(5,  23, 15, 7, 15, 7),
    sleepEntry(6,  22,  0, 6, 45, 8),
    sleepEntry(7,   1,  0, 8, 30, 3, { notes: "Therapy night — slept badly.", had_nightmare: true }),
    sleepEntry(8,  23, 30, 7, 30, 7),
    sleepEntry(9,  22, 30, 7,  0, 9),
    sleepEntry(10, 23,  0, 7, 15, 8),
    sleepEntry(11, 23, 30, 7, 30, 7),
    sleepEntry(13, 22, 45, 6, 50, 8, { dreamed: true }),
    sleepEntry(14, 23, 15, 7, 30, 7),
  ];

  const reminders = [
    // Mix of trigger types so the Reminders settings + inbox look populated
    // in screenshots. All inactive triggering — these are display-only
    // examples and the preview is in-memory anyway.
    rec({
      title: "Morning meds",
      body: "Levothyroxine + vitamin D, on empty stomach.",
      category: "meds",
      trigger_type: "scheduled",
      trigger_config: { times: ["08:00"], days: [0, 1, 2, 3, 4, 5, 6] },
      delivery_channels: ["in_app", "push"],
      inline_actions: [{ label: "Mark taken", action_type: "dismiss" }],
      is_active: true,
    }),
    rec({
      title: "Evening journal",
      body: "Five minutes — even one line counts.",
      category: "habit",
      trigger_type: "scheduled",
      trigger_config: { times: ["21:00"], days: [0, 1, 2, 3, 4, 5, 6] },
      delivery_channels: ["in_app", "push"],
      inline_actions: [{ label: "Open journal", action_type: "open_journal" }],
      is_active: true,
    }),
    rec({
      title: "Therapy session",
      body: "Wednesday afternoon — check the safety plan beforehand.",
      category: "appointment",
      trigger_type: "scheduled",
      trigger_config: { times: ["16:00"], days: [3] },
      delivery_channels: ["in_app", "push"],
      inline_actions: [
        { label: "Open safety plan", action_type: "open_route", payload: { path: "/safety-plan" } },
      ],
      is_active: true,
    }),
    rec({
      title: "Drink water",
      body: "Two glasses every couple of hours keeps things tolerable.",
      category: "habit",
      trigger_type: "interval",
      trigger_config: { minutes: 120, active_window: { start: "10:00", end: "20:00" } },
      delivery_channels: ["in_app"],
      is_active: true,
    }),
    rec({
      title: "Weekly system meeting",
      body: "Sunday 7pm — quick roll-call + week ahead.",
      category: "check_in",
      trigger_type: "scheduled",
      trigger_config: { times: ["19:00"], days: [0] },
      delivery_channels: ["in_app", "push"],
      inline_actions: [
        { label: "Start meeting", action_type: "open_route", payload: { path: "/system-checkin" } },
      ],
      is_active: true,
    }),
    rec({
      title: "Check in after a switch",
      body: "Quick grounding question — what's needed right now?",
      category: "grounding",
      trigger_type: "contextual",
      trigger_config: { on: "alter_fronts", delay_minutes: 5 },
      delivery_channels: ["in_app"],
      inline_actions: [
        { label: "Grounding exercise", action_type: "open_grounding" },
        { label: "Quick check-in", action_type: "open_check_in" },
      ],
      is_active: true,
    }),
    rec({
      title: "No front update for a while",
      body: "It's been 6 hours — anyone want to log who's around?",
      category: "check_in",
      trigger_type: "contextual",
      trigger_config: { on: "no_front_update", minutes: 360 },
      delivery_channels: ["in_app"],
      inline_actions: [{ label: "Set fronters", action_type: "open_set_front" }],
      is_active: true,
    }),
    rec({
      title: "Dentist",
      body: "Annual cleaning. Bring the new insurance card.",
      category: "appointment",
      trigger_type: "event",
      trigger_config: {
        datetime: new Date(Date.now() + 5 * 86400000).setHours(14, 0, 0, 0) && new Date(Date.now() + 5 * 86400000).toISOString(),
        pre_alerts: ["1d", "1h"],
      },
      delivery_channels: ["in_app", "push"],
      is_active: true,
    }),
    rec({
      title: "Move car for street sweeping",
      body: "Tuesday + Friday 8am, otherwise it's a $75 ticket.",
      category: "custom",
      trigger_type: "scheduled",
      trigger_config: { times: ["07:30"], days: [2, 5] },
      delivery_channels: ["in_app", "push"],
      is_active: false,
    }),
  ];

  const customEmotions = [
    rec({ label: "welcoming",     color: "#38BDF8" }),
    rec({ label: "curious",       color: "#0EA5E9" }),
    rec({ label: "creative",      color: "#EC4899" }),
    rec({ label: "organised",     color: "#DB2777" }),
    rec({ label: "soft",          color: "#F59E0B" }),
    rec({ label: "scattered",     color: "#94A3B8" }),
    rec({ label: "dissociative",  color: "#A78BFA" }),
    rec({ label: "settled",       color: "#10B981" }),
    rec({ label: "thoughtful",    color: "#6366F1" }),
    rec({ label: "bright",        color: "#FACC15" }),
    rec({ label: "heavy",         color: "#475569" }),
  ];

  const triggerTypes = [
    rec({ label: "Time pressure",        color: "#EF4444" }),
    rec({ label: "Loud rooms",           color: "#F97316" }),
    rec({ label: "Late-night editing",   color: "#06B6D4" }),
    rec({ label: "Family-of-origin",     color: "#7C3AED" }),
    rec({ label: "Unexpected change",    color: "#EAB308" }),
  ];

  const activityCategories = [
    rec({ name: "Creative",       color: "#EC4899", parent_category_id: null }),
    rec({ name: "Movement",       color: "#10B981", parent_category_id: null }),
    rec({ name: "Reading",        color: "#0EA5E9", parent_category_id: null }),
    rec({ name: "Cooking",        color: "#F59E0B", parent_category_id: null }),
    rec({ name: "Therapy",        color: "#7C3AED", parent_category_id: null }),
    rec({ name: "Social",         color: "#A855F7", parent_category_id: null }),
    rec({ name: "Self-care",      color: "#22C55E", parent_category_id: null }),
    rec({ name: "Computer time",  color: "#06B6D4", parent_category_id: null }),
  ];

  const activityGoals = [
    rec({ activity_name: "Walk",         target_minutes_per_week: 90 }),
    rec({ activity_name: "Composing",    target_minutes_per_week: 240 }),
    rec({ activity_name: "Reading",      target_minutes_per_week: 180 }),
    rec({ activity_name: "Self-care",    target_minutes_per_week: 120 }),
  ];

  const groundingTechniques = [
    rec({ name: "5-4-3-2-1",            category: "sensory", description: "Name 5 things you can see, 4 you can hear, 3 you can touch, 2 you can smell, 1 you can taste.",  steps: ["5 see","4 hear","3 touch","2 smell","1 taste"], duration_seconds: 180, is_default: true,  is_archived: false, order: 0 }),
    rec({ name: "Box breathing",        category: "breath",  description: "Breathe in 4, hold 4, out 4, hold 4. Loop until calm.",                                          steps: ["In 4","Hold 4","Out 4","Hold 4"],                duration_seconds: 240, is_default: true,  is_archived: false, order: 1 }),
    rec({ name: "Cold water on hands",  category: "sensory", description: "Run cold water over your wrists or splash on your face. Activates the dive reflex.",             steps: ["Cold water","Hands or face","30 seconds"],      duration_seconds: 90,  is_default: true,  is_archived: false, order: 2 }),
    rec({ name: "Halo's tea ritual",    category: "comfort", description: "Boil water, choose a tea, breathe in the steam for one full minute before sipping.",            steps: ["Boil water","Choose tea","Pour and breathe in steam","Sip slowly"], duration_seconds: 360, is_default: false, is_archived: false, order: 3, suggested_for: [alters.halo.id] }),
    rec({ name: "Mira's chord",         category: "comfort", description: "Sit at the piano (or hum) and hold a single C major chord for thirty seconds. Feel the body react.", steps: ["Find C","Hold","Listen","Release"], duration_seconds: 60, is_default: false, is_archived: false, order: 4, suggested_for: [alters.mira.id] }),
    rec({ name: "Echo's reset",         category: "movement",description: "Close all open tabs, stand up, walk to a different room. Start fresh when you sit back down.",  steps: ["Close tabs","Stand","Different room","Return"], duration_seconds: 120, is_default: false, is_archived: false, order: 5, suggested_for: [alters.echo.id] }),
  ];
  const groundingPreferences = [
    rec({ alter_id: alters.welcome.id, preferred_technique_ids: [groundingTechniques[0].id, groundingTechniques[1].id] }),
    rec({ alter_id: alters.halo.id,    preferred_technique_ids: [groundingTechniques[3].id] }),
    rec({ alter_id: alters.mira.id,    preferred_technique_ids: [groundingTechniques[4].id, groundingTechniques[1].id] }),
    rec({ alter_id: alters.echo.id,    preferred_technique_ids: [groundingTechniques[5].id, groundingTechniques[2].id] }),
    rec({ alter_id: alters.atlas.id,   preferred_technique_ids: [groundingTechniques[0].id] }),
    rec({ alter_id: alters.iris.id,    preferred_technique_ids: [groundingTechniques[1].id] }),
  ];

  const innerWorldLocations = [
    rec({
      name: "The Inner Room",
      description: "The central meeting space — where the system gathers for system-meetings. List the {alters} who attend as occupants so picking a meeting is one tap.",
      color: "#a78bfa", x: 200, y: 160,
      occupant_alter_ids: [alters.welcome.id, alters.atlas.id, alters.iris.id, alters.halo.id, alters.mira.id, alters.echo.id],
    }),
    rec({
      name: "The Drawing Room",
      description: "Mira's space, mostly. Pianos, sketchbooks, half-finished things on every flat surface.",
      color: "#ec4899", x: 90, y: 90,
      occupant_alter_ids: [alters.mira.id],
    }),
    rec({
      name: "The Workshop",
      description: "Echo's domain. A board of post-its for whatever's currently being prototyped.",
      color: "#06b6d4", x: 330, y: 80,
      occupant_alter_ids: [alters.echo.id],
    }),
    rec({
      name: "The Hearth",
      description: "Halo lives here. Candles, tea, the warmest corner of the system.",
      color: "#f59e0b", x: 340, y: 240,
      occupant_alter_ids: [alters.halo.id],
    }),
    rec({
      name: "The Letter Room",
      description: "Iris's archive. Drawers of correspondence — both for the system and for outsiders.",
      color: "#db2777", x: 80, y: 260,
      occupant_alter_ids: [alters.iris.id],
    }),
    rec({
      name: "The Library",
      description: "Use case: somewhere {alters} who like quiet, study, or solo work tend to be. Atlas spends most mornings here when not fronting.",
      color: "#0ea5e9", x: 220, y: 50,
      occupant_alter_ids: [alters.atlas.id, alters.iris.id],
    }),
    rec({
      name: "The Threshold",
      description: "A liminal space at the edge of the inner world — where Welcome greets new arrivals and helps them find their footing.",
      color: "#38bdf8", x: 200, y: 290,
      occupant_alter_ids: [alters.welcome.id],
    }),
    rec({
      name: "Empty Field (no occupants)",
      description: "Use case: a location can exist without occupants — useful as a marker for places that aren't currently in use. Add and remove occupants any time.",
      color: "#64748b", x: 380, y: 160,
      occupant_alter_ids: [],
    }),
  ];

  const alterMessages = [
    rec({ alter_id: alters.welcome.id, author_alter_id: alters.iris.id,    content: "If you're new to the app, start by tapping into each of our profiles. Each one explains a different bio mode.", created_date: isoOffset(1, 10) }),
    rec({ alter_id: alters.welcome.id, author_alter_id: alters.atlas.id,   content: "Seconded. Mine's the Simple-mode walkthrough.", created_date: isoOffset(1, 10, 5) }),
    rec({ alter_id: alters.echo.id,    author_alter_id: alters.iris.id,    content: "The Raw HTML on your card is gorgeous. Could you write a journal entry walking me through the gradient?", created_date: isoOffset(3, 14) }),
    rec({ alter_id: alters.echo.id,    author_alter_id: alters.echo.id,    content: "Done — see the journal entry filed under tags 'alters', 'design'.", created_date: isoOffset(3, 23) }),
    rec({ alter_id: alters.halo.id,    author_alter_id: alters.welcome.id, content: "I love watching the whole app turn warm when you take primary. Theme presets are the best feature.", created_date: isoOffset(5, 19) }),
    rec({ alter_id: alters.mira.id,    author_alter_id: alters.atlas.id,   content: "If you ever want a co-front for an evening of writing, I'm in. Quietly.", created_date: isoOffset(7, 22) }),
    rec({ alter_id: alters.iris.id,    author_alter_id: alters.halo.id,    content: "Thank you for the new system fields list. Cleaner than what we had.", created_date: isoOffset(8, 11) }),
    rec({ alter_id: alters.atlas.id,   author_alter_id: alters.welcome.id, content: "Reminder — therapist asked us to do a body scan together once a week. Sundays?", created_date: isoOffset(11, 16) }),
  ];

  const alterNotes = [
    rec({ alter_id: alters.welcome.id, content: "Demo profile — feel free to overwrite when this is no longer needed.", created_date: isoOffset(20, 12) }),
    rec({ alter_id: alters.atlas.id,   content: "Sleep is non-negotiable. If primary for >4 hours and Iris/Halo are around, hand off rather than push.", created_date: isoOffset(7, 22) }),
    rec({ alter_id: alters.iris.id,    content: "All system fields filled in. Per-alter fields demonstrate things only Iris cares about.", created_date: isoOffset(15, 18) }),
    rec({ alter_id: alters.iris.id,    content: "Do NOT reply to family-of-origin emails the same day. 24-hour rule.", created_date: isoOffset(20, 19) }),
    rec({ alter_id: alters.echo.id,    content: "If you fork the Raw HTML, the @keyframes block needs to live inside the bio — global stylesheets won't apply.", created_date: isoOffset(8, 22) }),
    rec({ alter_id: alters.mira.id,    content: "Mornings are sacred. The piano is in the front room; I don't take other appointments before 11.", created_date: isoOffset(10, 9) }),
    rec({ alter_id: alters.halo.id,    content: "Tea cabinet inventory: black, green, mint, chamomile, oolong. Restock when any drops below half a tin.", created_date: isoOffset(4, 14) }),
  ];

  // ── Diary cards / progress / support journals ──────────────────────────
  const diaryTemplates = [
    rec({ name: "Standard daily", is_default: true, fields: [
      { id: "mood",         label: "Mood",          type: "rating", scale: 10 },
      { id: "anxiety",      label: "Anxiety",       type: "rating", scale: 10 },
      { id: "skills_used",  label: "Skills used",   type: "checkbox-list", options: ["grounding","breathwork","journaling","reaching out","movement"] },
      { id: "what",         label: "What happened", type: "longtext" },
    ]}),
  ];
  const diaryCards = [
    rec({ date: new Date(Date.now() - 0 * DAY).toISOString().slice(0,10), template_id: diaryTemplates[0].id, fields: { mood: 7, anxiety: 3, skills_used: ["grounding","journaling"] },                  notes: { what: "Welcome on the dashboard. Good day." } }),
    rec({ date: new Date(Date.now() - 1 * DAY).toISOString().slice(0,10), template_id: diaryTemplates[0].id, fields: { mood: 5, anxiety: 6, skills_used: ["breathwork"] },                              notes: { what: "Lots of switching. Tiring but not unsafe." } }),
    rec({ date: new Date(Date.now() - 2 * DAY).toISOString().slice(0,10), template_id: diaryTemplates[0].id, fields: { mood: 6, anxiety: 4, skills_used: ["movement"] },                                notes: { what: "Mira composing in the morning, Iris filing in the afternoon." } }),
    rec({ date: new Date(Date.now() - 4 * DAY).toISOString().slice(0,10), template_id: diaryTemplates[0].id, fields: { mood: 3, anxiety: 8, skills_used: ["grounding","reaching out"] },                notes: { what: "Hard day. Asked Halo to take over for the evening." } }),
    rec({ date: new Date(Date.now() - 6 * DAY).toISOString().slice(0,10), template_id: diaryTemplates[0].id, fields: { mood: 6, anxiety: 4, skills_used: ["journaling","movement"] },                  notes: { what: "Therapy. Talked about the front-rotation rules." } }),
    rec({ date: new Date(Date.now() - 8 * DAY).toISOString().slice(0,10), template_id: diaryTemplates[0].id, fields: { mood: 7, anxiety: 3, skills_used: ["grounding","journaling","movement"] },      notes: { what: "Steady. Good handoffs all day." } }),
    rec({ date: new Date(Date.now() - 10 * DAY).toISOString().slice(0,10),template_id: diaryTemplates[0].id, fields: { mood: 5, anxiety: 5, skills_used: ["breathwork"] },                              notes: { what: "Ordinary day. Body felt heavy." } }),
  ];
  const dailyProgress = [
    rec({ date: new Date(Date.now() - 0 * DAY).toISOString().slice(0,10), tasks_completed: 2, tasks_total: 5 }),
    rec({ date: new Date(Date.now() - 1 * DAY).toISOString().slice(0,10), tasks_completed: 4, tasks_total: 4 }),
    rec({ date: new Date(Date.now() - 2 * DAY).toISOString().slice(0,10), tasks_completed: 3, tasks_total: 3 }),
    rec({ date: new Date(Date.now() - 3 * DAY).toISOString().slice(0,10), tasks_completed: 2, tasks_total: 4 }),
    rec({ date: new Date(Date.now() - 4 * DAY).toISOString().slice(0,10), tasks_completed: 1, tasks_total: 3 }),
    rec({ date: new Date(Date.now() - 5 * DAY).toISOString().slice(0,10), tasks_completed: 4, tasks_total: 5 }),
  ];

  const symptomCheckIns = [
    rec({ symptom_id: symptoms[0].id, timestamp: isoOffset(2, 14), severity: 7, notes: "Mood lifted after Halo's tea ritual." }),
    rec({ symptom_id: symptoms[3].id, timestamp: isoOffset(2, 17), severity: 5 }),
    rec({ symptom_id: symptoms[5].id, timestamp: isoOffset(4, 11), severity: 6 }),
    rec({ symptom_id: symptoms[3].id, timestamp: isoOffset(7, 10), severity: 5 }),
    rec({ symptom_id: symptoms[6].id, timestamp: isoOffset(8, 22), severity: 4, notes: "Couldn't fall asleep — Echo coding too late." }),
    rec({ symptom_id: symptoms[0].id, timestamp: isoOffset(11, 14),severity: 8 }),
  ];

  const supportJournals = [
    rec({ title: "Welcoming the new feature",   topic: "managers",     content: "Echo wanted to know if the rest of us would mind if they redid the inner-world layout. We didn't. Felt good to be asked.", created_date: isoOffset(4, 22), tags: ["managers","ifs"] }),
    rec({ title: "After the firefighter",       topic: "firefighters", content: "Snacks, scrolling, three hours gone. Not as a failure — as information.",                                                  created_date: isoOffset(6, 23), tags: ["firefighters"] }),
    rec({ title: "Welcoming Small One",         topic: "exiles",       content: "She came forward in session. Just sadness, no story attached. Sat together.",                                              created_date: isoOffset(9, 22), tags: ["exiles","unburdening"] }),
    rec({ title: "Noticing self-energy",        topic: "self-energy",  content: "There were a few minutes during the system meeting where nobody was forward and yet I — we? — felt warm and unhurried.",   created_date: isoOffset(11, 21), tags: ["self-energy"] }),
  ];
  const learningProgress = [
    rec({ topic: "managers",     progress: 0.6, last_visited: isoOffset(4, 22) }),
    rec({ topic: "firefighters", progress: 0.3, last_visited: isoOffset(6, 23) }),
    rec({ topic: "exiles",       progress: 0.2, last_visited: isoOffset(9, 22) }),
    rec({ topic: "self-energy",  progress: 0.5, last_visited: isoOffset(11, 21) }),
  ];

  const reportTemplates = [
    rec({ name: "Weekly clinical summary", description: "For the Wednesday session — last 7 days of mood, dissociation, switches, key journal excerpts.", date_range_days: 7,  sections: ["mood_chart","dissociation_chart","switch_count","journal_excerpts","status_notes"], default: true }),
    rec({ name: "Monthly overview",        description: "Bigger picture for the monthly check-in — fronting time per alter, symptom patterns.",          date_range_days: 30, sections: ["fronting_summary","symptom_chart","activities_summary","relationships"], default: false }),
  ];
  const reportExports = [
    rec({ template_id: reportTemplates[0].id, exported_at: isoOffset(7, 16), format: "pdf",  filename: "symphony-weekly-2026-04-30.pdf" }),
    rec({ template_id: reportTemplates[0].id, exported_at: isoOffset(0, 17), format: "json", filename: "symphony-weekly-2026-05-08.json" }),
  ];

  const mentionLogs = [
    rec({ mentioned_alter_id: alters.atlas.id,   source_type: "bulletin", source_id: bulletins[1].id, source_label: "Bulletin Board", navigate_path: `/bulletin/${bulletins[1].id}`, read: false, created_date: isoOffset(1, 11) }),
    rec({ mentioned_alter_id: alters.echo.id,    source_type: "bulletin", source_id: bulletins[6].id, source_label: "Bulletin Board", navigate_path: `/bulletin/${bulletins[6].id}`, read: false, created_date: isoOffset(6, 16) }),
    rec({ mentioned_alter_id: alters.welcome.id, source_type: "bulletin", source_id: bulletins[6].id, source_label: "Bulletin Board", navigate_path: `/bulletin/${bulletins[6].id}`, read: true,  created_date: isoOffset(6, 17, 15) }),
    rec({ mentioned_alter_id: alters.atlas.id,   source_type: "journal",  source_id: journals[5].id,  source_label: "Journal entry",  navigate_path: `/journal/${journals[5].id}`,  read: true,  created_date: isoOffset(7, 21) }),
  ];

  // ── Locations (Location entity — local IndexedDB) ─────────────────────
  // Demo of every location category, mix of GPS-captured and manual entries.
  const locations = [
    rec({ timestamp: isoOffset(0, 8),   name: "Home",                 category: "home",    latitude: 40.7128,  longitude: -74.0060, source: "gps",    notes: "Morning coffee." }),
    rec({ timestamp: isoOffset(0, 14),  name: "Co-working space",     category: "work",    latitude: 40.7150,  longitude: -74.0035, source: "gps" }),
    rec({ timestamp: isoOffset(1, 10),  name: "Riverside Park",       category: "outdoor", latitude: 40.8000,  longitude: -73.9728, source: "gps",    notes: "Walk with Halo (well, mentally)." }),
    rec({ timestamp: isoOffset(2, 16),  name: "Therapist",            category: "medical", source: "manual",   notes: "Wednesday session." }),
    rec({ timestamp: isoOffset(3, 19),  name: "Friend's apartment",   category: "social",  source: "manual",   notes: "Movie night." }),
    rec({ timestamp: isoOffset(5, 11),  name: "Farmers market",       category: "outdoor", source: "manual" }),
    rec({ timestamp: isoOffset(7, 16),  name: "Therapist",            category: "medical", source: "manual" }),
    rec({ timestamp: isoOffset(9, 13),  name: "Library",              category: "outdoor", source: "manual",   notes: "Iris in archive mode." }),
    rec({ timestamp: isoOffset(11, 17), name: "Game café",            category: "social",  source: "manual",   notes: "Game night." }),
  ];

  // System-wide custom field DEFINITIONS (what fields exist for everyone).
  const customFields = [
    rec({ id: cfFavoriteSong,  name: "Favorite song",    order: 0, type: "text",     placeholder: "What's playing?" }),
    rec({ id: cfComfortFood,   name: "Comfort food",     order: 1, type: "text",     placeholder: "What you'd cook for them" }),
    rec({ id: cfFirstAppeared, name: "First appeared",   order: 2, type: "longtext", placeholder: "When and how this alter first emerged" }),
  ];

  const relationshipTypes = [
    rec({ label: "Co-host",            is_default: true,  color: "#7c3aed" }),
    rec({ label: "Hands off to",       is_default: false, color: "#38bdf8" }),
    rec({ label: "Edits drafts for",   is_default: false, color: "#ec4899" }),
    rec({ label: "Soothes",            is_default: false, color: "#f59e0b" }),
    rec({ label: "Trusts deeply",      is_default: false, color: "#06b6d4" }),
  ];

  return {
    SystemSettings:    toMap([settings]),
    Alter:             toMap(Object.values(alters)),
    FrontingSession:   toMap(fronting),
    EmotionCheckIn:    toMap(emotions),
    Activity:          toMap(activities),
    JournalEntry:      toMap(journals),
    SystemCheckIn:     toMap(checkIns),
    StatusNote:        toMap(statusNotes),
    AlterRelationship: toMap(relationships),
    SystemChangeEvent: toMap(systemEvents),
    Symptom:           toMap(symptoms),
    SymptomSession:    toMap(symptomSessions),
    SymptomCheckIn:    toMap(symptomCheckIns),
    Group:             toMap(groups),
    Bulletin:          toMap(bulletins),
    BulletinComment:   toMap(bulletinComments),
    Poll:              toMap(polls),
    Task:              toMap(tasks),
    DailyTaskTemplate: toMap(dailyTaskTemplates),
    Sleep:             toMap(sleepEntries),
    Reminder:          toMap(reminders),
    CustomEmotion:     toMap(customEmotions),
    TriggerType:       toMap(triggerTypes),
    ActivityCategory:  toMap(activityCategories),
    ActivityGoal:      toMap(activityGoals),
    GroundingTechnique:toMap(groundingTechniques),
    GroundingPreference: toMap(groundingPreferences),
    InnerWorldLocation:toMap(innerWorldLocations),
    Location:          toMap(locations),
    AlterMessage:      toMap(alterMessages),
    AlterNote:         toMap(alterNotes),
    DiaryTemplate:     toMap(diaryTemplates),
    DiaryCard:         toMap(diaryCards),
    DailyProgress:     toMap(dailyProgress),
    SupportJournalEntry: toMap(supportJournals),
    LearningProgress:  toMap(learningProgress),
    ReportTemplate:    toMap(reportTemplates),
    ReportExport:      toMap(reportExports),
    MentionLog:        toMap(mentionLogs),
    CustomField:       toMap(customFields),
    RelationshipType:  toMap(relationshipTypes),
    $themePresets:     themePresets,
    $alterThemeLinks:  alterThemeLinks,
  };
}

// ---------------------------------------------------------------------------

// Public registry — each system declares its key, name, blurb, theme + font,
// and a builder function so data is freshly generated relative to "now" each
// time Preview Mode is enabled.
// Wiki preview is the walkthrough variant — every alter's profile is a
// docs page for one part of the app. The banner shows "walkthrough up to
// date with vX.Y.Z" while this preset is active (keyed on `wiki: true`).
import { buildWiki } from "./previewWiki";

export const PREVIEW_SYSTEMS = [
  {
    key: "wiki",
    wiki: true,
    name: "App Wiki",
    blurb: "A wiki-style walkthrough. Every alter's profile in this example system is a docs page for one part of the app — Dashboard, the alter profile edit modes, the mini-toolbar, bulletin board, timeline, activity tracker, reminders, friends mode, and more. Read at your own pace. The banner shows which app version the walkthrough was last refreshed against.",
    termsLabel: "system / alter / fronting / switching",
    theme: "cool",
    font:  "'Atkinson Hyperlegible', sans-serif",
    themeMode: null,
    build: buildWiki,
  },
  {
    key: "tapestry",
    name: "The Tour",
    blurb: "Six demo alters, each showcasing a different way to design an alter profile — Plain text, Simple blocks, full Blocks editor, Raw HTML, Custom Fields, and the Mini Toolbar / Theme Presets. Every alter ships its own theme preset so the whole app's look swaps with the primary fronter. The bulletin board is preserved as a worked tour of mentions, threads, reactions, and polls. Real data is hidden but never touched while Preview Mode is on.",
    termsLabel: "system / alter / fronting / switching",
    theme: "charcoal",
    font:  "'Atkinson Hyperlegible', sans-serif",
    themeMode: null,
    build: buildTapestry,
  },
];

export function getPreviewSystem(key) {
  return PREVIEW_SYSTEMS.find((s) => s.key === key) || null;
}
