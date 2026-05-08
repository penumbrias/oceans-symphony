// Curated example "systems" used by Preview Mode.
//
// Each entry is a self-contained snapshot of what a populated app might look
// like for someone with that kind of system. Each system uses its own
// terminology AND its own theme + font, so users can see how the app feels
// with different vocabularies and visual identities.
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

// Wrap rich HTML in the canonical bio-editor block format. The editor saves
// bios as `<div data-blocks="<URI-encoded-JSON>"…>` — htmlToBlocks short-
// circuits on the JSON, so the inner `<style>`, SVG, CSS animations, and
// gradients all render through SimplePreview's dangerouslySetInnerHTML
// regardless of how many `\n<div>` patterns the HTML contains.
function richBio(html) {
  const content = html.replace(/>\s*\n\s*</g, "><").trim();
  const blocks = [{ type: "text", content }];
  const encoded = encodeURIComponent(JSON.stringify(blocks));
  return `<div data-blocks="${encoded}" style="width:100%;display:block;"><div class="bio-text">${content}</div></div>`;
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
// SYSTEM 2: The Tapestry — large polyfragmented DID system
// ---------------------------------------------------------------------------
function buildTapestry() {
  // 24 alters across hosts, protectors, caretakers, littles, teens,
  // introjects, fragments, and dormant alters. Polyfragmented systems often
  // include many limited-function "fragments" alongside fully-formed alters.
  // A def's `d` is plain prose; if `html` is set it's used instead and may
  // contain inline CSS. `cf` adds custom_fields for profile chrome.
  const defs = [
    // — Minimal profiles: plain prose, no chrome.
    { k: "jasper",  n: "Jasper",  p: "he/him",     c: "#dc2626", r: "Protector",    d: "Vigilant. Surfaces when threats appear. Doesn't say much.", y: 2002, t: ["protector"] },
    { k: "wren",    n: "Wren",    p: "they/them",  c: "#10b981", r: "Protector",    d: "Quiet protection — watches more than acts. Knows when to leave a room.", y: 2007, t: ["protector"] },
    { k: "kestrel", n: "Kestrel", p: "she/they",   c: "#b91c1c", r: "Persecutor",   d: "Used to keep us small. Working on softening — slowly.", y: 1999, t: ["persecutor","working"] },
    { k: "thorne",  n: "Thorne",  p: "he/him",     c: "#9333ea", r: "Persecutor",   d: "Sharp tongue, harsh judgements. In dialogue with the rest of us.", y: 2004, t: ["persecutor"] },
    { k: "linnet",  n: "Linnet",  p: "she/her",    c: "#06b6d4", r: "Caretaker",    d: "Looks after the littles. Always knows where the cocoa is.", y: 2008, t: ["caretaker"] },
    { k: "fern",    n: "Fern",    p: "she/her",    c: "#65a30d", r: "Caretaker",    d: "The body's caretaker — eating, sleeping, hydration.", y: 2014, t: ["caretaker"] },
    { k: "milo",    n: "Milo",    p: "he/him",     c: "#f59e0b", r: "Little",       d: "Five. Loves dinosaurs and stickers.", y: 2001, ageA: 5, t: ["little"] },
    { k: "tadpole", n: "Tadpole", p: "any",        c: "#14b8a6", r: "Little",       d: "Tiny. Mostly hums. Has a stuffed frog.", y: 2003, ageA: 3, t: ["little","fragment"] },
    { k: "sparrow", n: "Sparrow", p: "she/they",   c: "#fbbf24", r: "Middle",       d: "Eleven. Practical and a little bossy.", y: 2005, ageA: 11, t: ["middle"] },
    { k: "noor",    n: "Noor",    p: "she/her",    c: "#0ea5e9", r: "Introject",    d: "Based on a real-life mentor. Calm advice on tap.", y: 2013, t: ["introject"] },
    { k: "blaze",   n: "Blaze",   p: "he/him",     c: "#f97316", r: "Introject",    d: "Action-hero introject. Useful in emergencies.", y: 2014, t: ["introject"] },
    { k: "zee",     n: "Zee",     p: "ze/zir",     c: "#22d3ee", r: "Sexual",       d: "Holds intimacy and bodily autonomy.", y: 2011, t: ["sexual"] },
    { k: "tiny",    n: "tiny",    p: "any",        c: "#94a3b8", r: "Fragment",     d: "Single-purpose: types fast. Comes up only when the keyboard is needed.", y: 2012, t: ["fragment"] },
    { k: "scout",   n: "Scout",   p: "they/them",  c: "#84cc16", r: "Fragment",     d: "Scans crowded rooms. Limited beyond that.", y: 2010, t: ["fragment"] },
    { k: "lumen",   n: "Lumen",   p: "she/her",    c: "#fbbf24", r: "Dormant",      d: "Fully formed but hasn't fronted in over two years. Resting.", y: 2006, t: ["dormant"], dormant: true },
    { k: "mira",    n: "Mira",    p: "she/her",    c: "#e11d48", r: "Dormant",      d: "Fused mostly into Iris. Still an echo in the background.", y: 2003, t: ["dormant"], dormant: true },

    // — Complex profiles: rich HTML descriptions and per-alter chrome.
    {
      k: "atlas", n: "Atlas", p: "they/them", c: "#7c3aed", r: "Host", y: 1995, t: ["host"],
      // Constellation card — Atlas is the centre of the system, parts as
      // orbiting stars connected by lines.
      html: richBio(`
<style>@keyframes atlas-pulse-star{0%,100%{opacity:.35}50%{opacity:1}}</style>
<div style="background:#03050f;border-radius:20px;padding:24px;position:relative;overflow:hidden;">
  <svg style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;" viewBox="0 0 400 300" preserveAspectRatio="none">
    <line x1="200" y1="150" x2="80"  y2="60"  stroke="rgba(167,139,250,.18)" stroke-width="1"/>
    <line x1="200" y1="150" x2="320" y2="80"  stroke="rgba(167,139,250,.18)" stroke-width="1"/>
    <line x1="200" y1="150" x2="350" y2="200" stroke="rgba(167,139,250,.18)" stroke-width="1"/>
    <line x1="200" y1="150" x2="100" y2="240" stroke="rgba(167,139,250,.18)" stroke-width="1"/>
    <line x1="200" y1="150" x2="60"  y2="170" stroke="rgba(167,139,250,.18)" stroke-width="1"/>
    <circle cx="200" cy="150" r="6" fill="#a78bfa" style="animation:atlas-pulse-star 4s ease-in-out infinite"/>
    <circle cx="80"  cy="60"  r="3" fill="#ec4899" opacity=".85"/>
    <circle cx="320" cy="80"  r="3" fill="#60a5fa" opacity=".75"/>
    <circle cx="350" cy="200" r="3" fill="#f0abfc" opacity=".75"/>
    <circle cx="100" cy="240" r="3" fill="#fbbf24" opacity=".70"/>
    <circle cx="60"  cy="170" r="3" fill="#10b981" opacity=".70"/>
    <circle cx="280" cy="40"  r="2" fill="#fff"    opacity=".4"/>
    <circle cx="40"  cy="100" r="2" fill="#fff"    opacity=".4"/>
    <circle cx="370" cy="140" r="2" fill="#fff"    opacity=".5"/>
  </svg>
  <div style="position:relative;z-index:1;">
    <div style="color:#a78bfa;font-size:.65em;letter-spacing:.4em;text-transform:uppercase;margin-bottom:18px;">✦ Constellation: Atlas</div>
    <div style="font-family:'Atkinson Hyperlegible',sans-serif;font-size:1.6em;font-weight:300;color:#e2e8f0;letter-spacing:.1em;margin-bottom:4px;">ATLAS</div>
    <div style="color:#64748b;font-size:.8em;margin-bottom:18px;">they/them · the host · since 1995</div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:14px;">
      <div style="text-align:center;">
        <div style="color:#a78bfa;font-size:1.4em;">✦</div>
        <div style="color:#64748b;font-size:.65em;margin-top:4px;letter-spacing:.1em;">ROLE</div>
        <div style="color:#e2e8f0;font-size:.78em;">host</div>
      </div>
      <div style="text-align:center;">
        <div style="color:#60a5fa;font-size:1.4em;">✦</div>
        <div style="color:#64748b;font-size:.65em;margin-top:4px;letter-spacing:.1em;">FRONTS</div>
        <div style="color:#e2e8f0;font-size:.78em;">most weeks</div>
      </div>
      <div style="text-align:center;">
        <div style="color:#f0abfc;font-size:1.4em;">✦</div>
        <div style="color:#64748b;font-size:.65em;margin-top:4px;letter-spacing:.1em;">ENERGY</div>
        <div style="color:#e2e8f0;font-size:.78em;">tired·reliable</div>
      </div>
    </div>
    <div style="background:rgba(167,139,250,.05);border:1px solid rgba(167,139,250,.18);border-radius:12px;padding:14px;color:#94a3b8;font-size:.85em;line-height:1.85;">Carries the calendar and the day-to-day. The seat from which the rest of us are met. When Atlas is up, the system feels like a system; when they're tired, Iris steps in.</div>
  </div>
</div>`),
      cf: { _bg_color: "#03050f", _bg_opacity: 0.55, _page_text_color: "#cbd5e1", _header_text_color: "#a78bfa" },
    },
    {
      k: "iris", n: "Iris", p: "she/her", c: "#ec4899", r: "Co-host", y: 2010, t: ["host","ANP"],
      // Newspaper-column profile: clip-path "torn paper" edge, Georgia, journalist-style.
      html: richBio(`
<div style="background:#f4edd4;padding:18px;font-family:Georgia,serif;clip-path:polygon(0 1%,2% 0,5% 1%,100% 0,100% 99%,98% 100%,95% 99%,0 100%);color:#222;">
  <div style="font-size:.62em;text-transform:uppercase;letter-spacing:.22em;color:#666;border-bottom:2px solid #333;padding-bottom:4px;margin-bottom:10px;">Profile · No. 037 · Co-host</div>
  <div style="font-family:'Playfair Display',serif;font-size:1.6em;font-weight:600;letter-spacing:.02em;margin-bottom:2px;">Iris, holding the line</div>
  <div style="font-size:.75em;color:#7a6a4f;margin-bottom:10px;font-style:italic;">she/her · joined the rotation autumn, 2010</div>
  <div style="font-size:.85em;line-height:1.85;column-count:1;">
    She stepped forward the year Atlas burned out — quietly, the way snow arrives. <b>"I am not Atlas,"</b> Iris is fond of saying, <b>"but I can hold the day when she can't."</b> Warm, social, organised. The one who answers the phone, remembers the birthdays, keeps the fridge note legible.
  </div>
  <div style="display:flex;gap:14px;margin-top:14px;font-size:.78em;border-top:1px solid #c8b988;padding-top:10px;">
    <div><b>Fronts</b><br><span style="color:#5a4a30;">most weekdays</span></div>
    <div><b>Loves</b><br><span style="color:#5a4a30;">letters, soft cardigans</span></div>
    <div><b>Origin</b><br><span style="color:#5a4a30;">post-burnout</span></div>
  </div>
</div>`),
      cf: { _bg_color: "#FBCFE8", _bg_opacity: 0.35, _header_text_color: "#831843" },
    },
    {
      k: "halo", n: "Halo", p: "she/her", c: "#fde68a", r: "Introject", y: 2016, t: ["introject"],
      // Tarot-card profile: purple gradient, glow animation, Cinzel-style title,
      // upright/reversed interpretation panels.
      html: richBio(`
<style>@keyframes halo-mystical{0%,100%{box-shadow:0 0 20px rgba(247,144,68,.3)}50%{box-shadow:0 0 38px rgba(247,144,68,.55),0 0 80px rgba(247,144,68,.18)}}</style>
<div style="background:linear-gradient(180deg,#1a0f06,#3b1d08,#1a0f06);border:2px solid #f59e0b;border-radius:8px;padding:0;position:relative;overflow:hidden;animation:halo-mystical 4.5s ease-in-out infinite;max-width:300px;margin:0 auto;">
  <div style="background:linear-gradient(135deg,#f59e0b22,transparent);padding:14px;border-bottom:1px solid #f59e0b44;text-align:center;">
    <div style="color:#f59e0b;font-size:.6em;letter-spacing:.4em;">✦ THE ✦</div>
    <div style="font-family:'Playfair Display',serif;font-size:1.7em;font-weight:700;color:#fde68a;letter-spacing:.12em;">COMFORT</div>
    <div style="color:#f59e0b;font-size:.6em;letter-spacing:.4em;">✦ HALO ✦</div>
  </div>
  <div style="padding:18px;text-align:center;">
    <div style="font-size:3.4em;margin:6px 0;line-height:1;">🌙</div>
    <div style="color:#fcd34d;font-size:.72em;font-style:italic;margin-bottom:14px;">she/her · introject · arrived in winter</div>
    <div style="background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.25);border-radius:6px;padding:12px;color:#fde68a;font-size:.78em;line-height:1.85;font-style:italic;text-align:left;margin-bottom:8px;"><b style="font-style:normal;letter-spacing:.1em;font-size:.85em;">UPRIGHT.</b> Warmth from a story we needed to hear. The kitchen smells like cinnamon. The held breath, finally let out.</div>
    <div style="background:rgba(245,158,11,.04);border:1px solid rgba(245,158,11,.12);border-radius:6px;padding:12px;color:#a78554;font-size:.78em;line-height:1.85;font-style:italic;text-align:left;"><b style="font-style:normal;letter-spacing:.1em;font-size:.85em;">REVERSED.</b> Comfort that softens too much, too fast. The body falls asleep before it has been heard.</div>
  </div>
  <div style="background:linear-gradient(135deg,transparent,#f59e0b22);padding:10px;border-top:1px solid #f59e0b44;text-align:center;">
    <div style="color:#f59e0b66;font-size:.6em;letter-spacing:.4em;">✦ ✦ ✦ ✦ ✦</div>
  </div>
</div>`),
      cf: { _bg_color: "#1f0f05", _bg_opacity: 0.65, _page_text_color: "#fed7aa" },
    },
    {
      k: "vex", n: "Vex", p: "they/them", c: "#a855f7", r: "Teen", y: 2008, ageA: 15, t: ["teen"],
      html: richBio(`
<p style="font-family:'Atkinson Hyperlegible',sans-serif;letter-spacing:.12em;text-transform:uppercase;font-size:.78em;color:#a1a1aa;margin-bottom:.75em">do not patronise.</p>
<p>fifteen. sarcastic. soft underneath, but i won't show that to you.</p>
<hr style="border:none;border-top:1px solid #3f3f46;margin:1.25em 0">
<p style="font-size:.85em;color:#71717a;line-height:1.6">primary fronts: <b style="color:#a1a1aa">weeknights</b><br>listens to: <b style="color:#a1a1aa">deftones, midwest emo, mitski</b><br>do not call me cute.</p>`),
      cf: { _bg_color: "#0a0a0a", _bg_opacity: 0.55, _page_text_color: "#e4e4e7", _header_text_color: "#a1a1aa" },
    },
    {
      k: "rook", n: "Rook", p: "he/they", c: "#3b82f6", r: "Teen", y: 2009, ageA: 17, t: ["teen"],
      html: richBio(`
<p style="font-size:1.05em;color:#1e40af;margin-bottom:.5em"><b>rook · 17 · skater</b></p>
<p>i draw, i skate, i play bass.</p>
<ul style="font-size:.9em;line-height:1.7;color:#1d4ed8">
<li>🎸 bass since i was 13</li>
<li>🛹 mostly mini-ramp</li>
<li>📓 sketchbook always on me</li>
</ul>`),
      cf: { _bg_color: "#1e3a8a", _bg_opacity: 0.18, _page_text_color: "#bfdbfe" },
    },
    {
      k: "poppy", n: "Poppy", p: "she/her", c: "#f43f5e", r: "Little", y: 2002, ageA: 8, t: ["little"],
      html: richBio(`
<p style="font-size:1.2em;font-weight:700;color:#be123c">⭐️🌈 POPPY 🌈⭐️</p>
<p>im 8!! i am a <b style="color:#e11d48">REALLY GOOD</b> drawer 🎨</p>
<ul style="list-style:none;padding-left:0;line-height:1.8">
<li>🐰 bunnies</li>
<li>🍓 strawberries</li>
<li>🦄 unicorns</li>
<li>📺 cartoons (especially bluey)</li>
</ul>
<p>my BEST friend in the system is sparrow. she is older.</p>`),
      cf: { _bg_color: "#FECDD3", _bg_opacity: 0.55, _header_text_color: "#be123c", _section_bg_opacity: 0.2 },
    },
    {
      k: "shade", n: "Shade", p: "they/them", c: "#6b7280", r: "Trauma holder", y: 1998, t: ["trauma","ENP"],
      html: richBio(`
<p style="font-family:'Atkinson Hyperlegible',sans-serif;font-size:.95em;line-height:1.7;color:#9ca3af;text-align:center;letter-spacing:.04em">we hold what couldn't be held.<br>we are not unwell. we are necessary.</p>`),
      cf: { _bg_color: "#0f172a", _bg_opacity: 0.6, _page_text_color: "#cbd5e1", _header_text_color: "#94a3b8", _section_bg_opacity: 0.1 },
    },
    {
      k: "gate", n: "Gate", p: "they/them", c: "#1e40af", r: "Gatekeeper", y: 1997, t: ["gatekeeper"],
      html: richBio(`
<p style="font-family:monospace;font-size:.85em;color:#3730a3;line-height:1.7">
ROLE :: gatekeeper<br>
SCOPE :: front rotation, internal access<br>
EXTERNAL :: declined<br>
ACTIVE SINCE :: 1997
</p>
<p style="margin-top:1em">No outside engagement. Internal only.</p>`),
      cf: { _bg_color: "#1e1b4b", _bg_opacity: 0.18, _header_text_color: "#a5b4fc" },
    },
  ];

  const alters = {};
  for (const def of defs) {
    alters[def.k] = rec({
      name: def.n, pronouns: def.p, color: def.c, role: def.r,
      description: def.html || def.d,
      origin_year: def.y, tags: def.t,
      ...(def.ageA ? { age_apparent: def.ageA } : {}),
      ...(def.dormant ? { is_dormant: true } : {}),
      ...(def.cf ? { custom_fields: def.cf } : {}),
    });
  }

  // Lots of switching — polyfragmented systems often switch frequently.
  const fronting = [];
  fronting.push(rec({
    alter_id: alters.iris.id, is_primary: true,
    start_time: new Date(Date.now() - 90 * 60000).toISOString(),
    end_time: null, is_active: true,
  }));
  fronting.push(rec({
    alter_id: alters.fern.id, is_primary: false,
    start_time: new Date(Date.now() - 90 * 60000).toISOString(),
    end_time: null, is_active: true,
  }));

  const sched = [
    [1,7,3,"atlas"],[1,10,2,"linnet"],[1,12,2,"poppy"],[1,14,3,"iris"],[1,17,2,"vex"],[1,19,3,"jasper"],
    [2,7,4,"atlas"],[2,11,2,"halo"],[2,13,2,"milo"],[2,15,3,"iris"],[2,18,3,"rook"],
    [3,8,3,"noor"],[3,11,2,"sparrow"],[3,13,2,"linnet"],[3,15,3,"atlas"],[3,18,3,"thorne"],
    [4,7,3,"iris"],[4,10,1,"scout"],[4,11,2,"poppy"],[4,13,2,"fern"],[4,15,3,"atlas"],[4,18,3,"vex"],
    [5,8,4,"atlas"],[5,12,2,"halo"],[5,14,2,"tiny"],[5,16,3,"iris"],[5,19,2,"jasper"],
    [6,7,3,"atlas"],[6,10,2,"milo"],[6,12,2,"noor"],[6,14,3,"iris"],[6,17,3,"rook"],
    [7,8,2,"linnet"],[7,10,2,"sparrow"],[7,12,3,"iris"],[7,15,3,"atlas"],[7,18,2,"vex"],[7,20,1,"shade"],
    [8,7,3,"atlas"],[8,10,2,"poppy"],[8,12,2,"fern"],[8,14,3,"iris"],[8,17,2,"thorne"],[8,19,2,"jasper"],
    [9,8,3,"noor"],[9,11,2,"halo"],[9,13,2,"milo"],[9,15,3,"iris"],[9,18,3,"atlas"],
    [10,7,3,"atlas"],[10,10,2,"linnet"],[10,12,2,"vex"],[10,14,3,"iris"],[10,17,2,"poppy"],[10,19,2,"jasper"],
    [11,8,3,"iris"],[11,11,2,"sparrow"],[11,13,2,"fern"],[11,15,3,"atlas"],[11,18,2,"rook"],[11,20,2,"blaze"],
    [12,7,3,"atlas"],[12,10,2,"halo"],[12,12,2,"milo"],[12,14,3,"iris"],[12,17,2,"vex"],[12,19,2,"jasper"],
    [13,8,3,"noor"],[13,11,2,"linnet"],[13,13,2,"poppy"],[13,15,3,"atlas"],[13,18,3,"iris"],
    [14,7,4,"atlas"],[14,11,2,"sparrow"],[14,13,2,"fern"],[14,15,3,"iris"],[14,18,2,"rook"],[14,20,1,"kestrel"],
  ];
  sched.forEach(([d,h,dur,who]) => pushSession(fronting, alters[who].id, d, h, dur));

  const emotions = [
    rec({ timestamp: isoOffset(0, 9), mood: 5, energy: 4, emotions: ["overwhelmed","scattered"] }),
    rec({ timestamp: isoOffset(0, 14), mood: 6, energy: 5, emotions: ["focused"] }),
    rec({ timestamp: isoOffset(1, 11), mood: 4, energy: 3, emotions: ["dissociative"], note: "Lots of switching this morning." }),
    rec({ timestamp: isoOffset(2, 16), mood: 7, energy: 6, emotions: ["connected"], note: "Halo and Atlas co-front, surprisingly steady." }),
    rec({ timestamp: isoOffset(4, 10), mood: 3, energy: 3, emotions: ["sad","tired"], note: "Shade was up briefly." }),
    rec({ timestamp: isoOffset(5, 18), mood: 6, energy: 5, emotions: ["settled"] }),
    rec({ timestamp: isoOffset(7, 14), mood: 5, energy: 4, emotions: ["irritated"] }),
    rec({ timestamp: isoOffset(9, 11), mood: 7, energy: 7, emotions: ["happy"] }),
    rec({ timestamp: isoOffset(11, 19), mood: 4, energy: 3, emotions: ["lonely"] }),
    rec({ timestamp: isoOffset(13, 9), mood: 6, energy: 6, emotions: ["calm","hopeful"] }),
  ];

  const activities = [
    rec({ timestamp: isoOffset(0, 8),    activity_name: "Therapy session", duration_minutes: 50, color: "#7c3aed" }),
    rec({ timestamp: isoOffset(0, 13),   activity_name: "Reading",         duration_minutes: 45, color: "#0ea5e9" }),
    rec({ timestamp: isoOffset(1, 10),   activity_name: "Walk",            duration_minutes: 30, color: "#10b981" }),
    rec({ timestamp: isoOffset(2, 19),   activity_name: "Drawing",         duration_minutes: 75, color: "#f43f5e", notes: "Poppy spent most of this." }),
    rec({ timestamp: isoOffset(4, 15),   activity_name: "Music practice",  duration_minutes: 40, color: "#f97316", notes: "Rook plays bass." }),
    rec({ timestamp: isoOffset(6, 11),   activity_name: "Errands",         duration_minutes: 60, color: "#fbbf24" }),
    rec({ timestamp: isoOffset(7, 18),   activity_name: "Therapy session", duration_minutes: 50, color: "#7c3aed" }),
    rec({ timestamp: isoOffset(9, 13),   activity_name: "Cooking",         duration_minutes: 70, color: "#65a30d", notes: "Fern, of course." }),
    rec({ timestamp: isoOffset(11, 16),  activity_name: "Game night",      duration_minutes: 120, color: "#a855f7" }),
  ];

  const journals = [
    rec({ created_date: isoOffset(0, 22), title: "Mapping the system",       content: "We made a list today — twenty-four of us, give or take. Atlas is exhausted but proud.", tags: ["system map"], alter_id: alters.atlas.id }),
    rec({ created_date: isoOffset(2, 21), title: "Halo's afternoon",          content: "Halo came up around lunch. The kitchen smelled like cinnamon. Poppy drew a picture for her.", tags: ["good day","introject"], alter_id: alters.halo.id }),
    rec({ created_date: isoOffset(4, 20), title: "Shade was here",            content: "Brief surface, then gone again. Took notes. Gate kept things contained.", tags: ["trauma","gatekeeper"], alter_id: alters.gate.id }),
    rec({ created_date: isoOffset(6, 22), title: "Rook's playlist",           content: "Rook made a 90-minute playlist. Vex approves. Iris is mildly horrified.", tags: ["teens"], alter_id: alters.rook.id }),
    rec({ created_date: isoOffset(9, 21), title: "Working with Kestrel",      content: "She agreed to a check-in twice a week instead of fronting unannounced. Progress.", tags: ["persecutor","working"], alter_id: alters.kestrel.id }),
    rec({ created_date: isoOffset(12, 22), title: "Lumen still resting",       content: "Two and a half years dormant now. We trust she'll come back if she wants to.", tags: ["dormant"], alter_id: alters.atlas.id }),
  ];

  const checkIns = [
    rec({ created_date: isoOffset(0, 8),  mood: 5, communication_quality: 6, system_harmony: 6, note: "Lots of co-consciousness today. Iris and Fern co-fronting." }),
    rec({ created_date: isoOffset(3, 21), mood: 6, communication_quality: 7, system_harmony: 7, note: "System meeting went smoothly. Twenty-one people showed up to the inner room." }),
    rec({ created_date: isoOffset(7, 20), mood: 5, communication_quality: 5, system_harmony: 5, note: "Tense — Kestrel and Iris disagreeing about an outside friend." }),
    rec({ created_date: isoOffset(11, 9), mood: 7, communication_quality: 8, system_harmony: 8, note: "Felt like a big team this morning." }),
  ];

  const statusNotes = [
    rec({ timestamp: isoOffset(0, 11), note: "Co-fronting day. Iris is leading; Fern is in the background." }),
    rec({ timestamp: isoOffset(2, 14), note: "Switching every 90 minutes or so. Tiring but not unsafe." }),
    rec({ timestamp: isoOffset(5, 17), note: "Halo came up out of nowhere — kitchen got cinnamon vibes for an hour." }),
    rec({ timestamp: isoOffset(8, 9),  note: "Atlas needs sleep. Iris is covering today." }),
    rec({ timestamp: isoOffset(11, 20), note: "Game night was loud — Rook, Vex, Poppy, Sparrow all up at once." }),
  ];

  const relationships = [
    rec({ alter_id_a: alters.atlas.id, alter_id_b: alters.iris.id,    relationship_type: "Co-host" }),
    rec({ alter_id_a: alters.gate.id,  alter_id_b: alters.shade.id,   relationship_type: "Contains" }),
    rec({ alter_id_a: alters.linnet.id, alter_id_b: alters.milo.id,   relationship_type: "Caretaker of" }),
    rec({ alter_id_a: alters.linnet.id, alter_id_b: alters.poppy.id,  relationship_type: "Caretaker of" }),
    rec({ alter_id_a: alters.linnet.id, alter_id_b: alters.tadpole.id, relationship_type: "Caretaker of" }),
    rec({ alter_id_a: alters.fern.id,  alter_id_b: alters.atlas.id,   relationship_type: "Looks after" }),
    rec({ alter_id_a: alters.kestrel.id, alter_id_b: alters.iris.id,  relationship_type: "Working it out" }),
    rec({ alter_id_a: alters.noor.id,  alter_id_b: alters.atlas.id,   relationship_type: "Mentor to" }),
    rec({ alter_id_a: alters.rook.id,  alter_id_b: alters.vex.id,     relationship_type: "Sibling-like" }),
    rec({ alter_id_a: alters.sparrow.id, alter_id_b: alters.poppy.id, relationship_type: "Older sibling" }),
  ];

  const systemEvents = [
    rec({ type: "split",    date: new Date(2003, 0, 1).toISOString(), year_only: true, source_alter_ids: [alters.atlas.id], result_alter_ids: [alters.poppy.id, alters.milo.id], cause: "Childhood",   notes: "Two littles split off in the same year." }),
    rec({ type: "split",    date: new Date(2008, 0, 1).toISOString(), year_only: true, source_alter_ids: [alters.atlas.id], result_alter_ids: [alters.vex.id, alters.sparrow.id, alters.rook.id], cause: "Adolescence", notes: "Teen layer formed." }),
    rec({ type: "split",    date: new Date(2010, 0, 1).toISOString(), year_only: true, source_alter_ids: [alters.atlas.id], result_alter_ids: [alters.iris.id, alters.scout.id, alters.tiny.id], cause: "Burnout",     notes: "Co-host emerged plus two fragments." }),
    rec({ type: "fusion",   date: new Date(2018, 0, 1).toISOString(), year_only: true, source_alter_ids: [alters.iris.id, alters.mira.id], result_alter_ids: [alters.iris.id], fusion_type: "absorption", notes: "Iris is the alter that persists." }),
    rec({ type: "dormancy", date: new Date(2022, 0, 1).toISOString(), year_only: true, source_alter_ids: [alters.lumen.id], notes: "Lumen has been dormant since." }),
  ];

  const symptoms = [
    rec({ name: "Dissociation", color: "#a78bfa", icon: "🌫️" }),
    rec({ name: "Headache",     color: "#ef4444", icon: "🤕" }),
    rec({ name: "Fatigue",      color: "#64748b", icon: "😴" }),
    rec({ name: "Time loss",    color: "#0ea5e9", icon: "⏳" }),
  ];
  const symptomSessions = [
    rec({ symptom_id: symptoms[0].id, start_time: isoOffset(1, 11), end_time: isoOffset(1, 13), severity: 6 }),
    rec({ symptom_id: symptoms[3].id, start_time: isoOffset(4, 15), end_time: isoOffset(4, 18), severity: 7, notes: "Lost three hours after Shade surfaced." }),
    rec({ symptom_id: symptoms[1].id, start_time: isoOffset(7, 17), end_time: isoOffset(7, 20), severity: 5 }),
    rec({ symptom_id: symptoms[2].id, start_time: isoOffset(10, 19), end_time: isoOffset(10, 23), severity: 6 }),
  ];

  const settings = rec({
    term_system: "system",
    term_alter:  "alter",
    term_switch: "switch",
    term_front:  "front",
    is_anonymized: false,
  });

  // Per-alter theme presets. Iris (the primary fronter on entry) brings
  // the berry palette + Playfair; if the user swipes the primary to Atlas,
  // the system-level charcoal theme returns. Vex, Halo each have their
  // own look-and-feel.
  const themePresets = {
    "Iris Berry": {
      light: { bg: "#FDF2F8", surface: "#FBCFE8", primary: "#DB2777", secondary: "#FBCFE8", accent: "#EC4899", muted: "#FCE7F3", "text-primary": "#500724", "text-secondary": "#831843" },
      dark:  { bg: "#1F0B2E", surface: "#2D1645", primary: "#EC4899", secondary: "#6B1B47", accent: "#F472B6", muted: "#5A3668", "text-primary": "#FBCFE8", "text-secondary": "#F0ABFC" },
      font: "'Playfair Display', serif",
      themeMode: null,
      fontSize: "default",
      terms: { system: "system", alter: "alter", switch: "switch", front: "front" },
    },
    "Vex's Edge": {
      light: { bg: "#FAFAFA", surface: "#F3F3F3", primary: "#27272A", secondary: "#E5E5E5", accent: "#3F3F46", muted: "#D4D4D8", "text-primary": "#0A0A0A", "text-secondary": "#3F3F46" },
      dark:  { bg: "#0A0A0A", surface: "#171717", primary: "#A1A1AA", secondary: "#262626", accent: "#D4D4D8", muted: "#404040", "text-primary": "#FAFAFA", "text-secondary": "#A1A1AA" },
      font: "'Atkinson Hyperlegible', sans-serif",
      themeMode: "dark",
      fontSize: "default",
      terms: { system: "system", alter: "alter", switch: "switch", front: "front" },
    },
    "Halo's Glow": {
      light: { bg: "#FFF7ED", surface: "#FFEDD5", primary: "#C2410C", secondary: "#FED7AA", accent: "#F97316", muted: "#FFEDD5", "text-primary": "#431407", "text-secondary": "#7C2D12" },
      dark:  { bg: "#1F0B05", surface: "#2A1208", primary: "#FB923C", secondary: "#3B1A0A", accent: "#FDBA74", muted: "#5A2E15", "text-primary": "#FFEDD5", "text-secondary": "#FED7AA" },
      font: "'Playfair Display', serif",
      themeMode: null,
      fontSize: "default",
      terms: { system: "system", alter: "alter", switch: "switch", front: "front" },
    },
  };
  const alterThemeLinks = {
    [alters.iris.id]:  "Iris Berry",
    [alters.vex.id]:   "Vex's Edge",
    [alters.halo.id]:  "Halo's Glow",
  };

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
    $themePresets:     themePresets,
    $alterThemeLinks:  alterThemeLinks,
  };
}

// Public registry — each system declares its key, name, blurb, theme + font,
// and a builder function so data is freshly generated relative to "now" each
// time Preview Mode is enabled.
export const PREVIEW_SYSTEMS = [
  {
    key: "tapestry",
    name: "The Tapestry",
    blurb: "A large polyfragmented DID system: 24 alters across hosts, protectors, caretakers, littles, teens, introjects, gatekeeper, persecutors, fragments, and dormants — with splits, fusions, and frequent switching. Iris (currently primary) carries her own berry/Playfair theme; Vex carries a stark dark preset; Halo carries a warm rose-gold one. Profiles range from plain prose to fully-styled cards (constellation, newspaper, tarot, monospace, kid-coded with stickers) so you can see what the bio editor's HTML mode and per-alter background colours can do.",
    termsLabel: "system / alter / fronting / switching",
    theme: "charcoal",
    font:  "'Nunito', sans-serif",
    themeMode: null,
    build: buildTapestry,
  },
];

export function getPreviewSystem(key) {
  return PREVIEW_SYSTEMS.find((s) => s.key === key) || null;
}
