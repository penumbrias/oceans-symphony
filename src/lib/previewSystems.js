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
    rec({ timestamp: isoOffset(1, 10), mood: 7, energy: 6, emotions: ["bright"] }),
    rec({ timestamp: isoOffset(2, 13), mood: 5, energy: 5, emotions: ["thoughtful"] }),
    rec({ timestamp: isoOffset(3, 11), mood: 8, energy: 7, emotions: ["creative"], note: "Mira spent the morning composing." }),
    rec({ timestamp: isoOffset(4, 18), mood: 6, energy: 4, emotions: ["soft","grateful"] }),
    rec({ timestamp: isoOffset(6, 10), mood: 7, energy: 6, emotions: ["organised"], note: "Iris filed the week's notes." }),
    rec({ timestamp: isoOffset(8, 13), mood: 6, energy: 5, emotions: ["steady"] }),
    rec({ timestamp: isoOffset(10, 9), mood: 7, energy: 7, emotions: ["happy"] }),
    rec({ timestamp: isoOffset(12, 14),mood: 6, energy: 5, emotions: ["content"] }),
  ];

  const activities = [
    rec({ timestamp: isoOffset(0, 8),  activity_name: "Morning tea",   duration_minutes: 20, color: "#fde68a", notes: "Halo's hour." }),
    rec({ timestamp: isoOffset(0, 13), activity_name: "Reading",       duration_minutes: 45, color: "#0ea5e9" }),
    rec({ timestamp: isoOffset(1, 14), activity_name: "Composing",    duration_minutes: 90, color: "#ec4899", notes: "Mira at the piano." }),
    rec({ timestamp: isoOffset(2, 10), activity_name: "Walk",          duration_minutes: 30, color: "#10b981" }),
    rec({ timestamp: isoOffset(3, 11), activity_name: "Drawing",      duration_minutes: 60, color: "#f43f5e" }),
    rec({ timestamp: isoOffset(4, 16), activity_name: "Therapy session", duration_minutes: 50, color: "#7c3aed" }),
    rec({ timestamp: isoOffset(6, 13), activity_name: "Code editor",  duration_minutes: 80, color: "#06b6d4", notes: "Echo redesigned the inner-world page." }),
    rec({ timestamp: isoOffset(8, 19), activity_name: "Cooking",      duration_minutes: 50, color: "#65a30d" }),
    rec({ timestamp: isoOffset(11, 16),activity_name: "Game night",   duration_minutes: 120, color: "#a855f7" }),
  ];

  const journals = [
    rec({
      created_date: isoOffset(0, 21),
      title: "How journal entries work",
      content: "<p><b>Journal entries</b> are long-form, dated, and optionally attached to one {alter} via the <code>alter_id</code> field. Use them for end-of-day reflection, therapy homework, or any prose you want kept.</p><p>This entry has tags <code>tutorial</code> + <code>journals</code> — tags filter the Journals page. The body supports HTML (bold, italic, lists, links).</p>",
      tags: ["tutorial", "journals"], alter_id: alters.welcome.id,
    }),
    rec({
      created_date: isoOffset(2, 22),
      title: "Designing my profile",
      content: "<p>Spent an hour today rebuilding the profile in Raw mode. The animation on the cyan dot is just a tiny CSS keyframe — surprisingly satisfying once you remember that bios are basically tiny webpages.</p>",
      tags: ["alters", "design"], alter_id: alters.echo.id,
    }),
    rec({
      created_date: isoOffset(5, 22),
      title: "Custom fields cleanup",
      content: "<p>Pruned the system-wide fields down to three (favourite song, comfort food, when this alter first appeared) and moved the trivia I had on Atlas's profile into per-alter fields instead. Cleaner.</p>",
      tags: ["alters", "housekeeping"], alter_id: alters.iris.id,
    }),
  ];

  const checkIns = [
    rec({ created_date: isoOffset(0, 8),  mood: 7, communication_quality: 8, system_harmony: 8, note: "Welcome on the dashboard, Halo in the kitchen, Iris on the calendar. Easy morning." }),
    rec({ created_date: isoOffset(2, 21), mood: 6, communication_quality: 7, system_harmony: 7, note: "System meeting touched on the new theme presets. Echo wants to redo the Inner Room." }),
    rec({ created_date: isoOffset(5, 21), mood: 7, communication_quality: 8, system_harmony: 8, note: "Steady week. Mira's been composing every morning." }),
  ];

  const statusNotes = [
    rec({ timestamp: isoOffset(0, 9),  note: "Welcome at the front. Halo behind, lighting candles." }),
    rec({ timestamp: isoOffset(0, 16), note: "Iris took over for the afternoon to file the week's letters." }),
    rec({ timestamp: isoOffset(2, 10), note: "Mira composing." }),
    rec({ timestamp: isoOffset(4, 13), note: "Echo refactored the dashboard cards." }),
    rec({ timestamp: isoOffset(6, 19), note: "Halo and Atlas co-front for the evening tea ritual." }),
    rec({ timestamp: isoOffset(9, 11), note: "All six of us at one of those rare full-system check-ins." }),
  ];

  // ── Relationships ──────────────────────────────────────────────────────
  // A handful so the System Map page looks alive.
  const relationships = [
    rec({ alter_id_a: alters.atlas.id,  alter_id_b: alters.iris.id,    relationship_type: "Co-host" }),
    rec({ alter_id_a: alters.welcome.id,alter_id_b: alters.atlas.id,   relationship_type: "Hands off to" }),
    rec({ alter_id_a: alters.iris.id,   alter_id_b: alters.mira.id,    relationship_type: "Edits drafts for" }),
    rec({ alter_id_a: alters.halo.id,   alter_id_b: alters.atlas.id,   relationship_type: "Soothes" }),
    rec({ alter_id_a: alters.echo.id,   alter_id_b: alters.iris.id,    relationship_type: "Trusts deeply" }),
  ];

  const systemEvents = [
    rec({ type: "split", date: new Date(2018, 0, 1).toISOString(), year_only: true, source_alter_ids: [alters.welcome.id], result_alter_ids: [alters.atlas.id, alters.echo.id], cause: "Capacity",  notes: "Atlas and Echo emerged the same year — wayfinding and architecting." }),
    rec({ type: "split", date: new Date(2019, 0, 1).toISOString(), year_only: true, source_alter_ids: [alters.welcome.id], result_alter_ids: [alters.halo.id],                cause: "Comfort",   notes: "Halo arrived to hold the warmth." }),
    rec({ type: "split", date: new Date(2020, 0, 1).toISOString(), year_only: true, source_alter_ids: [alters.iris.id],     result_alter_ids: [alters.mira.id],                cause: "Creativity",notes: "Mira split off from Iris's voice into a creative one." }),
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
  // Intentionally empty — this preview focuses on individual alter profiles
  // rather than subsystem grouping. The Groups page in real use is for
  // splitting larger systems into subsystems.
  const groups = [];

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
  ];

  const bulletinComments = [
    rec({ bulletin_id: bulletins[0].id, author_alter_id: alters.iris.id,    content: "Tip: comments support the same basic HTML formatting as posts.", created_date: isoOffset(0, 19, 30) }),
    rec({ bulletin_id: bulletins[0].id, author_alter_id: alters.atlas.id,   content: "Tip 2: tap an emoji count and you see the reactor list for that emoji.", created_date: isoOffset(0, 20) }),
    rec({ bulletin_id: bulletins[1].id, author_alter_id: alters.atlas.id,   content: "Got the mention — added myself to the Inner Room. Thank you!", created_date: isoOffset(1, 11, 20) }),
    rec({ bulletin_id: bulletins[6].id, author_alter_id: alters.echo.id,    content: "Confirmed — landed in the morning push. Should be live for everyone now.", created_date: isoOffset(6, 17) }),
    rec({ bulletin_id: bulletins[6].id, author_alter_id: alters.iris.id,    content: "Beautiful. @Welcome — would you mind testing it on your end?", created_date: isoOffset(6, 17, 15) }),
    rec({ bulletin_id: bulletins[6].id, author_alter_id: alters.welcome.id, content: "Tested. Looks great.", created_date: isoOffset(6, 17, 30) }),
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
  ];

  // ── Tasks ──────────────────────────────────────────────────────────────
  const tasks = [
    rec({ title: "Pick a theme preset for the new front rotation", completed: false, priority: "low",    assigned_alter_ids: [alters.halo.id] }),
    rec({ title: "Write a bulletin announcing this week's system meeting", completed: true, priority: "medium", completed_date: isoOffset(2, 11), assigned_alter_ids: [alters.iris.id] }),
    rec({ title: "Refactor the inner-world layout in Raw mode", completed: false, priority: "low", assigned_alter_ids: [alters.echo.id] }),
    rec({ title: "Schedule next therapy appointment",              completed: false, priority: "high",   assigned_alter_ids: [alters.atlas.id] }),
  ];

  const dailyTaskTemplates = [
    rec({ title: "Morning meds",      schedule_days: [0,1,2,3,4,5,6], schedule_time: "08:00", priority: "high"   }),
    rec({ title: "Evening journal",   schedule_days: [0,1,2,3,4,5,6], schedule_time: "21:00", priority: "low"    }),
    rec({ title: "Weekly system meeting", schedule_days: [0],         schedule_time: "19:00", priority: "medium" }),
  ];

  const sleepEntries = [
    rec({ date: new Date(Date.now() - 0 * DAY).toISOString().slice(0,10), bedtime: "23:00", wake_time: "07:30", quality: 4, notes: "Steady night." }),
    rec({ date: new Date(Date.now() - 1 * DAY).toISOString().slice(0,10), bedtime: "23:30", wake_time: "07:00", quality: 3 }),
    rec({ date: new Date(Date.now() - 3 * DAY).toISOString().slice(0,10), bedtime: "00:15", wake_time: "07:45", quality: 3, notes: "Stayed up writing the bulletins." }),
  ];

  const reminders = [
    rec({ label: "Morning meds",   schedule_time: "08:00", schedule_days: [0,1,2,3,4,5,6], is_active: true }),
    rec({ label: "Therapy weekly", schedule_time: "16:00", schedule_days: [3],            is_active: true }),
  ];

  const customEmotions = [
    rec({ label: "welcoming", color: "#38BDF8" }),
    rec({ label: "creative",  color: "#EC4899" }),
    rec({ label: "organised", color: "#DB2777" }),
    rec({ label: "soft",      color: "#F59E0B" }),
  ];

  const triggerTypes = [
    rec({ label: "Time pressure",      color: "#EF4444" }),
    rec({ label: "Loud rooms",         color: "#F97316" }),
    rec({ label: "Late-night editing", color: "#06B6D4" }),
  ];

  const activityCategories = [
    rec({ name: "Creative",   color: "#EC4899", parent_category_id: null }),
    rec({ name: "Movement",   color: "#10B981", parent_category_id: null }),
    rec({ name: "Reading",    color: "#0EA5E9", parent_category_id: null }),
    rec({ name: "Cooking",    color: "#F59E0B", parent_category_id: null }),
    rec({ name: "Therapy",    color: "#7C3AED", parent_category_id: null }),
  ];

  const activityGoals = [
    rec({ activity_name: "Walk",       target_minutes_per_week: 90 }),
    rec({ activity_name: "Composing",  target_minutes_per_week: 240 }),
  ];

  const groundingTechniques = [
    rec({ name: "5-4-3-2-1",          category: "sensory",   description: "Name 5 things you can see, 4 you can hear, 3 you can touch, 2 you can smell, 1 you can taste.",         steps: ["5 see","4 hear","3 touch","2 smell","1 taste"], duration_seconds: 180, is_default: true,  is_archived: false, order: 0 }),
    rec({ name: "Box breathing",      category: "breath",    description: "Breathe in 4, hold 4, out 4, hold 4. Loop until calm.",                                                steps: ["In 4","Hold 4","Out 4","Hold 4"],                duration_seconds: 240, is_default: true,  is_archived: false, order: 1 }),
    rec({ name: "Halo's tea ritual",  category: "comfort",   description: "Boil water, choose a tea, breathe in the steam for one full minute before sipping.",                  steps: ["Boil water","Choose tea","Pour and breathe in steam","Sip slowly"], duration_seconds: 360, is_default: false, is_archived: false, order: 2, suggested_for: [alters.halo.id] }),
  ];
  const groundingPreferences = [
    rec({ alter_id: alters.welcome.id, preferred_technique_ids: [groundingTechniques[0].id, groundingTechniques[1].id] }),
    rec({ alter_id: alters.halo.id,    preferred_technique_ids: [groundingTechniques[2].id] }),
  ];

  const innerWorldLocations = [
    rec({
      name: "The Inner Room",
      description: "The central meeting space — where the system gathers for system-meetings. List the {alters} who attend as occupants so picking a meeting is one tap.",
      color: "#a78bfa", x: 200, y: 150,
      occupant_alter_ids: [alters.welcome.id, alters.atlas.id, alters.iris.id, alters.halo.id],
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
      color: "#06b6d4", x: 320, y: 80,
      occupant_alter_ids: [alters.echo.id],
    }),
    rec({
      name: "The Hearth",
      description: "Halo lives here. Candles, tea, the warmest corner of the system.",
      color: "#f59e0b", x: 320, y: 240,
      occupant_alter_ids: [alters.halo.id],
    }),
    rec({
      name: "The Letter Room",
      description: "Iris's archive. Drawers of correspondence — both for the system and for outsiders.",
      color: "#db2777", x: 80, y: 260,
      occupant_alter_ids: [alters.iris.id],
    }),
  ];

  const alterMessages = [
    rec({ alter_id: alters.welcome.id, author_alter_id: alters.iris.id,  content: "If you're new to the app, start by tapping into each of our profiles. Each one explains a different bio mode.", created_date: isoOffset(1, 10) }),
    rec({ alter_id: alters.echo.id,    author_alter_id: alters.iris.id,  content: "The Raw HTML on your card is gorgeous. Could you write a journal entry walking me through the gradient?", created_date: isoOffset(3, 14) }),
    rec({ alter_id: alters.halo.id,    author_alter_id: alters.welcome.id, content: "I love watching the whole app turn warm when you take primary. Theme presets are the best feature.", created_date: isoOffset(5, 19) }),
  ];

  const alterNotes = [
    rec({ alter_id: alters.welcome.id, content: "Demo profile — feel free to overwrite when this is no longer needed.", created_date: isoOffset(20, 12) }),
    rec({ alter_id: alters.iris.id,    content: "All system fields filled in. Per-alter fields demonstrate things only Iris cares about.", created_date: isoOffset(15, 18) }),
    rec({ alter_id: alters.echo.id,    content: "If you fork the Raw HTML, the @keyframes block needs to live inside the bio — global stylesheets won't apply.", created_date: isoOffset(8, 22) }),
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
    rec({ date: new Date(Date.now() - 0 * DAY).toISOString().slice(0,10), template_id: diaryTemplates[0].id, fields: { mood: 7, anxiety: 3, skills_used: ["grounding","journaling"] }, notes: { what: "Welcome on the dashboard. Good day." } }),
    rec({ date: new Date(Date.now() - 2 * DAY).toISOString().slice(0,10), template_id: diaryTemplates[0].id, fields: { mood: 6, anxiety: 4, skills_used: ["movement"] },                notes: { what: "Mira composing in the morning, Iris filing in the afternoon." } }),
  ];
  const dailyProgress = [
    rec({ date: new Date(Date.now() - 0 * DAY).toISOString().slice(0,10), tasks_completed: 2, tasks_total: 4 }),
    rec({ date: new Date(Date.now() - 2 * DAY).toISOString().slice(0,10), tasks_completed: 3, tasks_total: 3 }),
  ];

  const symptomCheckIns = [
    rec({ symptom_id: symptoms[0].id, timestamp: isoOffset(2, 14), severity: 7 }),
    rec({ symptom_id: symptoms[3].id, timestamp: isoOffset(7, 10), severity: 5 }),
  ];

  const supportJournals = [
    rec({ title: "Welcoming the new feature",  topic: "managers", content: "Echo wanted to know if the rest of us would mind if they redid the inner-world layout. We didn't. Felt good to be asked.", created_date: isoOffset(4, 22), tags: ["managers","ifs"] }),
  ];
  const learningProgress = [
    rec({ topic: "managers",     progress: 0.4, last_visited: isoOffset(4, 22) }),
    rec({ topic: "self-energy",  progress: 0.5, last_visited: isoOffset(11, 21) }),
  ];

  const reportTemplates = [
    rec({ name: "Weekly clinical summary", description: "Last 7 days of mood, switches, journal excerpts.", date_range_days: 7,  sections: ["mood_chart","switch_count","journal_excerpts","status_notes"], default: true }),
  ];
  const reportExports = [
    rec({ template_id: reportTemplates[0].id, exported_at: isoOffset(0, 17), format: "pdf",  filename: "symphony-weekly.pdf" }),
  ];

  const mentionLogs = [
    rec({ mentioned_alter_id: alters.atlas.id, source_type: "bulletin", source_id: bulletins[1].id, source_label: "Bulletin Board", navigate_path: `/bulletin/${bulletins[1].id}`, read: false, created_date: isoOffset(1, 11) }),
    rec({ mentioned_alter_id: alters.echo.id,  source_type: "bulletin", source_id: bulletins[6].id, source_label: "Bulletin Board", navigate_path: `/bulletin/${bulletins[6].id}`, read: false, created_date: isoOffset(6, 16) }),
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
export const PREVIEW_SYSTEMS = [
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
