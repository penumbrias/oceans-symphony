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
// The Tapestry — large polyfragmented DID system (the Preview Mode example)
// ---------------------------------------------------------------------------
function buildTapestry() {
  // 24 alters across hosts, protectors, caretakers, littles, teens,
  // introjects, fragments, and dormant alters. Polyfragmented systems often
  // include many limited-function "fragments" alongside fully-formed alters.
  // A def's `d` is plain prose; if `html` is set it's used instead and may
  // contain inline CSS. `cf` adds custom_fields for profile chrome.
  const defs = [
    // — Minimal profiles: plain prose, no chrome. One per role so the demo
    // showcases variety without repeating the same one-liner template.
    { k: "jasper",  n: "Jasper",  p: "he/him",     c: "#dc2626", r: "Protector",    d: "Vigilant. Surfaces when threats appear. Doesn't say much.", y: 2002, t: ["protector"] },
    { k: "fern",    n: "Fern",    p: "she/her",    c: "#65a30d", r: "Caretaker",    d: "The body's caretaker — eating, sleeping, hydration.", y: 2014, t: ["caretaker"] },
    { k: "milo",    n: "Milo",    p: "he/him",     c: "#f59e0b", r: "Little",       d: "Five. Loves dinosaurs and stickers.", y: 2001, ageA: 5, t: ["little"] },
    { k: "tadpole", n: "Tadpole", p: "any",        c: "#14b8a6", r: "Little",       d: "Tiny. Mostly hums. Has a stuffed frog.", y: 2003, ageA: 3, t: ["little","fragment"] },
    { k: "sparrow", n: "Sparrow", p: "she/they",   c: "#fbbf24", r: "Middle",       d: "Eleven. Practical and a little bossy.", y: 2005, ageA: 11, t: ["middle"] },
    { k: "blaze",   n: "Blaze",   p: "he/him",     c: "#f97316", r: "Introject",    d: "Action-hero introject. Useful in emergencies.", y: 2014, t: ["introject"] },
    { k: "zee",     n: "Zee",     p: "ze/zir",     c: "#22d3ee", r: "Sexual",       d: "Holds intimacy and bodily autonomy.", y: 2011, t: ["sexual"] },
    { k: "tiny",    n: "tiny",    p: "any",        c: "#94a3b8", r: "Fragment",     d: "Single-purpose: types fast. Comes up only when the keyboard is needed.", y: 2012, t: ["fragment"] },
    { k: "lumen",   n: "Lumen",   p: "she/her",    c: "#fbbf24", r: "Dormant",      d: "Fully formed but hasn't fronted in over two years. Resting.", y: 2006, t: ["dormant"], dormant: true },

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
    {
      k: "noor", n: "Noor", p: "she/her", c: "#0ea5e9", r: "Introject", y: 2013, t: ["introject","mentor"],
      // Noor's profile is intentionally written as a feature tour — the
      // bio editor handles arbitrary HTML, so you can use an alter card
      // as in-app documentation if you want.
      html: richBio(`
<style>@keyframes noor-glow{0%,100%{box-shadow:0 0 18px rgba(14,165,233,.18)}50%{box-shadow:0 0 32px rgba(14,165,233,.32)}}</style>
<div style="background:linear-gradient(180deg,#0c1e2e,#0a2538,#0c1e2e);border:1px solid #0ea5e9;border-radius:16px;padding:0;animation:noor-glow 5s ease-in-out infinite;overflow:hidden;">
  <div style="background:linear-gradient(135deg,#0ea5e922,transparent);padding:14px 16px;border-bottom:1px solid #0ea5e944;">
    <div style="color:#7dd3fc;font-size:.62em;letter-spacing:.3em;text-transform:uppercase;">A guide to the app</div>
    <div style="font-family:'Playfair Display',serif;font-size:1.55em;font-weight:600;color:#e0f2fe;letter-spacing:.04em;margin-top:2px;">Noor — the Docent</div>
    <div style="color:#7dd3fc;font-size:.78em;font-style:italic;margin-top:2px;">she/her · introject · here to show you around</div>
  </div>
  <div style="padding:16px;color:#cbd5e1;font-size:.86em;line-height:1.75;">
    <p style="margin-bottom:1em;">I'm a mentor introject. In Preview Mode my profile doubles as a guided tour. Tap any of the cards below to know what each piece of the app is for.</p>
    <div style="display:grid;grid-template-columns:1fr;gap:8px;margin-bottom:.75em;">
      <div style="background:rgba(14,165,233,.06);border:1px solid rgba(14,165,233,.2);border-radius:10px;padding:10px 12px;">
        <div style="color:#7dd3fc;font-size:.7em;letter-spacing:.18em;text-transform:uppercase;margin-bottom:2px;">Dashboard</div>
        <div style="color:#e0f2fe;font-size:.92em;">Currently fronting chips, status note, quick check-in, search, nav grid, bulletin preview. Long-press a chip for the hold menu; swipe right to remove from front, swipe left to toggle primary.</div>
      </div>
      <div style="background:rgba(14,165,233,.06);border:1px solid rgba(14,165,233,.2);border-radius:10px;padding:10px 12px;">
        <div style="color:#7dd3fc;font-size:.7em;letter-spacing:.18em;text-transform:uppercase;margin-bottom:2px;">Alters</div>
        <div style="color:#e0f2fe;font-size:.92em;">List + grid views with toggle on the right. Tap a face to open this profile; swipe right to add/remove from front; swipe left to set primary. Search, sort by name or {fronting} time, hide grouped, anonymize.</div>
      </div>
      <div style="background:rgba(14,165,233,.06);border:1px solid rgba(14,165,233,.2);border-radius:10px;padding:10px 12px;">
        <div style="color:#7dd3fc;font-size:.7em;letter-spacing:.18em;text-transform:uppercase;margin-bottom:2px;">Timeline</div>
        <div style="color:#e0f2fe;font-size:.92em;">Vertical day-grid showing alter sessions, symptoms, journals, emotions, locations, activities. Pinch to zoom row height; long-press an empty area for a retroactive entry; tap a session bar to edit or delete it.</div>
      </div>
      <div style="background:rgba(14,165,233,.06);border:1px solid rgba(14,165,233,.2);border-radius:10px;padding:10px 12px;">
        <div style="color:#7dd3fc;font-size:.7em;letter-spacing:.18em;text-transform:uppercase;margin-bottom:2px;">Bulletin Board</div>
        <div style="color:#e0f2fe;font-size:.92em;">A system-wide feed. Anyone can post. @mention an alter and they get a mention notification. Pin posts, react with emoji, attach polls, comment in threads.</div>
      </div>
      <div style="background:rgba(14,165,233,.06);border:1px solid rgba(14,165,233,.2);border-radius:10px;padding:10px 12px;">
        <div style="color:#7dd3fc;font-size:.7em;letter-spacing:.18em;text-transform:uppercase;margin-bottom:2px;">Journal &amp; Check-In</div>
        <div style="color:#e0f2fe;font-size:.92em;">Long-form journal entries (this bio is one of them, technically). Quick Check-Ins are short — mood, energy, emotions, optional symptoms, optional diary card.</div>
      </div>
      <div style="background:rgba(14,165,233,.06);border:1px solid rgba(14,165,233,.2);border-radius:10px;padding:10px 12px;">
        <div style="color:#7dd3fc;font-size:.7em;letter-spacing:.18em;text-transform:uppercase;margin-bottom:2px;">System Map · Lineage · Inner World</div>
        <div style="color:#e0f2fe;font-size:.92em;">Map shows alter relationships as a graph. Lineage records emergences, splits, fusions, dormancy. Inner World lets you place alters in named locations on a 2D canvas.</div>
      </div>
      <div style="background:rgba(14,165,233,.06);border:1px solid rgba(14,165,233,.2);border-radius:10px;padding:10px 12px;">
        <div style="color:#7dd3fc;font-size:.7em;letter-spacing:.18em;text-transform:uppercase;margin-bottom:2px;">Therapy Report</div>
        <div style="color:#e0f2fe;font-size:.92em;">Compose a printable summary of your data over a date range — mood charts, switch counts, journal excerpts. Export to PDF or JSON, share by file.</div>
      </div>
      <div style="background:rgba(14,165,233,.06);border:1px solid rgba(14,165,233,.2);border-radius:10px;padding:10px 12px;">
        <div style="color:#7dd3fc;font-size:.7em;letter-spacing:.18em;text-transform:uppercase;margin-bottom:2px;">Friends</div>
        <div style="color:#e0f2fe;font-size:.92em;">Optional. Share your front status with trusted people via a 4-letter code. Privacy is per-friend (names + colours / count only / hidden) and per-alter (hide specific alters from a specific friend).</div>
      </div>
      <div style="background:rgba(14,165,233,.06);border:1px solid rgba(14,165,233,.2);border-radius:10px;padding:10px 12px;">
        <div style="color:#7dd3fc;font-size:.7em;letter-spacing:.18em;text-transform:uppercase;margin-bottom:2px;">Settings</div>
        <div style="color:#e0f2fe;font-size:.92em;">Custom terms (system / alter / front / switch and their inflections), themes (per-alter presets that auto-apply when they front), accessibility (font, heading font, text size, touch targets), backup &amp; restore.</div>
      </div>
    </div>
    <p style="font-size:.82em;color:#7dd3fc;font-style:italic;margin-top:1em;">— calm advice on tap, since 2013.</p>
  </div>
</div>`),
      cf: { _bg_color: "#0c1e2e", _bg_opacity: 0.18, _header_text_color: "#7dd3fc" },
    },
    {
      k: "linnet", n: "Linnet", p: "she/her", c: "#06b6d4", r: "Caretaker", y: 2008, t: ["caretaker"],
      // Recipe-card profile — warm cream paper, dashed border, "from the kitchen of"
      // header. Shows a caretaker as a domestic, ingredient-list portrait.
      html: richBio(`
<div style="background:#fdf6e3;padding:18px;border-radius:8px;border:1px solid #d4b896;font-family:Georgia,serif;color:#2c1810;box-shadow:inset 0 0 0 4px #fdf6e3,inset 0 0 0 5px #d4b896;">
  <div style="text-align:center;border-bottom:2px dashed #b8956a;padding-bottom:10px;margin-bottom:14px;">
    <div style="font-size:.65em;letter-spacing:.3em;color:#8b6f47;text-transform:uppercase;margin-bottom:4px;">— from the kitchen of —</div>
    <div style="font-family:'Playfair Display',serif;font-size:1.6em;font-weight:600;letter-spacing:.04em;color:#7c4a16;">Linnet</div>
    <div style="font-size:.78em;color:#8b6f47;font-style:italic;margin-top:2px;">caretaker · she/her · est. 2008</div>
  </div>
  <div style="display:grid;grid-template-columns:auto 1fr;gap:8px 14px;font-size:.88em;line-height:1.7;">
    <div style="font-weight:700;color:#7c4a16;">Tends to:</div><div>the littles, mostly. Milo, Poppy, Tadpole, Sparrow.</div>
    <div style="font-weight:700;color:#7c4a16;">Reliable for:</div><div>cocoa, plasters, finding lost socks, knowing where the cocoa is.</div>
    <div style="font-weight:700;color:#7c4a16;">Fronts:</div><div>school mornings &amp; sick days.</div>
    <div style="font-weight:700;color:#7c4a16;">Pairs with:</div><div>Fern (body care) and Sparrow (older-sibling energy).</div>
  </div>
  <div style="margin-top:14px;padding-top:10px;border-top:1px dashed #b8956a;font-size:.82em;font-style:italic;color:#5a3a1a;">"a cup of warm something fixes more than people give it credit for."</div>
</div>`),
      cf: { _bg_color: "#fdf6e3", _bg_opacity: 0.45, _header_text_color: "#7c4a16" },
    },
    {
      k: "kestrel", n: "Kestrel", p: "she/they", c: "#b91c1c", r: "Persecutor", y: 1999, t: ["persecutor","working"],
      // Typewritten letter — manila paper, Courier, scratched-out edits. A
      // softening persecutor putting down draft fourteen of an apology.
      html: richBio(`
<div style="background:#f4ecd8;padding:22px 20px;border-radius:2px;font-family:'Courier New',Courier,monospace;color:#2a2018;position:relative;box-shadow:0 2px 4px rgba(0,0,0,.15);">
  <div style="position:absolute;top:8px;right:12px;font-size:.7em;color:#6b5a3e;border:1px solid #6b5a3e;padding:1px 6px;border-radius:1px;text-transform:uppercase;letter-spacing:.15em;">draft 14</div>
  <div style="font-size:.7em;letter-spacing:.18em;color:#6b5a3e;text-transform:uppercase;margin-bottom:14px;">a letter, slowly being written</div>
  <p style="font-size:.95em;line-height:1.85;margin:0 0 .9em;">i used to keep us small.</p>
  <p style="font-size:.95em;line-height:1.85;margin:0 0 .9em;">i thought that was care. i thought making us feel <s style="color:#a37553;">worthless</s> <span style="color:#5a3018;font-weight:700;">small</span> was the same as making us safe.</p>
  <p style="font-size:.95em;line-height:1.85;margin:0 0 .9em;">it wasn't. i'm sorry.</p>
  <p style="font-size:.95em;line-height:1.85;margin:0 0 .9em;">i'm slow at this. softness is a foreign language to me. but the rest of the system is teaching me, patiently, and i am learning.</p>
  <div style="border-top:1px dashed #8a7050;padding-top:10px;margin-top:16px;font-size:.75em;color:#6b5a3e;letter-spacing:.05em;">
    KESTREL · she/they · persecutor → working<br>
    arrived 1999 · in dialogue, on most days
  </div>
</div>`),
      cf: { _bg_color: "#f4ecd8", _bg_opacity: 0.4, _page_text_color: "#2a2018", _header_text_color: "#6b5a3e" },
    },
    {
      k: "brae", n: "Brae", p: "she/her", c: "#f4a548", r: "Steward", y: 2017, t: ["adult","steward"],
      // Daily-planner page — ruled notebook lines, checkboxes, a marigold
      // sticky-note. The practical adult who keeps the calendar tidy.
      html: richBio(`
<div style="background:#f9f5e7;background-image:linear-gradient(transparent 28px,#a4b8d0 28px,#a4b8d0 29px,transparent 29px);background-size:100% 29px;background-position:0 12px;padding:18px;border-radius:6px;border:1px solid #d4cfb8;font-family:'Atkinson Hyperlegible',sans-serif;color:#1f2937;">
  <div style="border-left:3px solid #f4a548;padding-left:12px;margin-bottom:14px;">
    <div style="font-size:1.4em;font-weight:700;color:#9a4f0c;letter-spacing:.02em;line-height:1;">Brae's day</div>
    <div style="font-size:.8em;color:#7a6a4f;margin-top:2px;">she/her · steward · est. 2017</div>
  </div>
  <div style="font-size:.78em;color:#7a6a4f;text-transform:uppercase;letter-spacing:.18em;margin-bottom:6px;">to-do (ongoing)</div>
  <ul style="list-style:none;padding:0;margin:0 0 14px 0;font-size:.92em;line-height:1.95;">
    <li><span style="display:inline-block;width:14px;height:14px;border:1.5px solid #4a5563;border-radius:2px;background:#dcfce7;margin-right:8px;vertical-align:middle;text-align:center;font-size:.85em;color:#15803d;line-height:14px;">✓</span><span style="text-decoration:line-through;color:#7a8694;">refill weekly pill organiser</span></li>
    <li><span style="display:inline-block;width:14px;height:14px;border:1.5px solid #4a5563;border-radius:2px;background:#dcfce7;margin-right:8px;vertical-align:middle;text-align:center;font-size:.85em;color:#15803d;line-height:14px;">✓</span><span style="text-decoration:line-through;color:#7a8694;">water plants (basil ok, fern droopy)</span></li>
    <li><span style="display:inline-block;width:14px;height:14px;border:1.5px solid #4a5563;border-radius:2px;margin-right:8px;vertical-align:middle;"></span>finalise grocery list with Fern</li>
    <li><span style="display:inline-block;width:14px;height:14px;border:1.5px solid #4a5563;border-radius:2px;margin-right:8px;vertical-align:middle;"></span>book dentist (overdue 4 mo.)</li>
    <li><span style="display:inline-block;width:14px;height:14px;border:1.5px solid #4a5563;border-radius:2px;margin-right:8px;vertical-align:middle;"></span>kindly remind Atlas about laundry</li>
  </ul>
  <div style="background:#fefce8;border:1px solid #facc15;padding:8px 10px;font-size:.82em;color:#713f12;border-radius:2px;transform:rotate(-1deg);box-shadow:1px 1px 2px rgba(0,0,0,.08);">
    <b>note to self:</b> "completing the task is care. it doesn't have to feel like care for it to count."
  </div>
</div>`),
      cf: { _bg_color: "#f9f5e7", _bg_opacity: 0.4, _header_text_color: "#9a4f0c" },
    },
    {
      k: "pell", n: "Pell", p: "they/them", c: "#b48b4a", r: "Memory keeper", y: 2006, t: ["memory","archive"],
      // Museum exhibit label — dark navy header strip, brass accent rule, an
      // archival catalogue card laying out era / medium / condition / curator.
      html: richBio(`
<div style="background:#fafaf8;border:1px solid #c8c2b6;border-radius:2px;padding:0;font-family:Georgia,serif;color:#1a1a1a;overflow:hidden;">
  <div style="background:#1f2533;color:#f5f5f0;padding:14px 16px;border-bottom:3px solid #b48b4a;">
    <div style="font-size:.6em;letter-spacing:.32em;color:#b48b4a;text-transform:uppercase;margin-bottom:4px;">specimen no. 0291</div>
    <div style="font-family:'Playfair Display',serif;font-size:1.55em;font-weight:600;letter-spacing:.06em;">Pell</div>
    <div style="font-size:.74em;color:#c2b89e;font-style:italic;margin-top:3px;">they/them · memory keeper · accessioned 2006</div>
  </div>
  <div style="padding:14px 16px;font-size:.86em;line-height:1.8;">
    <div style="font-size:.68em;letter-spacing:.2em;color:#5a4a30;text-transform:uppercase;margin-bottom:4px;">description</div>
    <p style="margin:0 0 12px;">Pell holds the things the rest of the system would prefer not to carry: birthdays, anniversaries, the names of people who hurt us, the names of people who didn't. They surface when the calendar surfaces them. They keep good records.</p>
    <div style="display:grid;grid-template-columns:auto 1fr;gap:4px 14px;font-size:.78em;color:#3a3328;border-top:1px solid #d4c8a8;padding-top:10px;">
      <div style="font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#5a4a30;">era:</div><div>2006 — present</div>
      <div style="font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#5a4a30;">medium:</div><div>memory, mostly verbatim</div>
      <div style="font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#5a4a30;">condition:</div><div>fair · accurate · slightly heavy</div>
      <div style="font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#5a4a30;">curator:</div><div>collaborates with Atlas, Iris, Shade</div>
    </div>
  </div>
  <div style="padding:8px 16px;background:#f0ebde;border-top:1px solid #c8c2b6;font-size:.7em;color:#5a4a30;font-style:italic;">filed under: <b>kept things</b></div>
</div>`),
      cf: { _bg_color: "#fafaf8", _bg_opacity: 0.35, _header_text_color: "#b48b4a" },
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
    rec({ timestamp: isoOffset(0, 21), mood: 7, energy: 4, emotions: ["soft","grateful"], note: "Halo settled the evening." }),
    rec({ timestamp: isoOffset(1, 8),  mood: 5, energy: 5, emotions: ["determined"] }),
    rec({ timestamp: isoOffset(1, 11), mood: 4, energy: 3, emotions: ["dissociative"], note: "Lots of switching this morning." }),
    rec({ timestamp: isoOffset(1, 19), mood: 6, energy: 5, emotions: ["calm"] }),
    rec({ timestamp: isoOffset(2, 10), mood: 5, energy: 4, emotions: ["wary"], note: "Jasper checked the locks twice." }),
    rec({ timestamp: isoOffset(2, 16), mood: 7, energy: 6, emotions: ["connected"], note: "Halo and Atlas co-front, surprisingly steady." }),
    rec({ timestamp: isoOffset(3, 13), mood: 6, energy: 6, emotions: ["productive"] }),
    rec({ timestamp: isoOffset(4, 10), mood: 3, energy: 3, emotions: ["sad","tired"], note: "Shade was up briefly." }),
    rec({ timestamp: isoOffset(4, 22), mood: 5, energy: 4, emotions: ["thoughtful"] }),
    rec({ timestamp: isoOffset(5, 11), mood: 8, energy: 7, emotions: ["bright","silly"], note: "Poppy and Milo had the morning." }),
    rec({ timestamp: isoOffset(5, 18), mood: 6, energy: 5, emotions: ["settled"] }),
    rec({ timestamp: isoOffset(6, 9),  mood: 6, energy: 6, emotions: ["focused","calm"] }),
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
    rec({ timestamp: isoOffset(0, 8),    activity_name: "Therapy session",  duration_minutes: 50,  color: "#7c3aed" }),
    rec({ timestamp: isoOffset(0, 13),   activity_name: "Reading",          duration_minutes: 45,  color: "#0ea5e9" }),
    rec({ timestamp: isoOffset(0, 17),   activity_name: "Tea + journaling", duration_minutes: 35,  color: "#fde68a", notes: "Halo's hour." }),
    rec({ timestamp: isoOffset(1, 10),   activity_name: "Walk",             duration_minutes: 30,  color: "#10b981" }),
    rec({ timestamp: isoOffset(1, 14),   activity_name: "Spreadsheet work", duration_minutes: 90,  color: "#06b6d4", notes: "Iris on weekday admin." }),
    rec({ timestamp: isoOffset(2, 9),    activity_name: "Yoga",             duration_minutes: 40,  color: "#65a30d" }),
    rec({ timestamp: isoOffset(2, 19),   activity_name: "Drawing",          duration_minutes: 75,  color: "#f43f5e", notes: "Poppy spent most of this." }),
    rec({ timestamp: isoOffset(3, 11),   activity_name: "Errands",          duration_minutes: 60,  color: "#fbbf24" }),
    rec({ timestamp: isoOffset(3, 18),   activity_name: "Movie night",      duration_minutes: 130, color: "#a855f7" }),
    rec({ timestamp: isoOffset(4, 15),   activity_name: "Music practice",   duration_minutes: 40,  color: "#f97316", notes: "Rook plays bass." }),
    rec({ timestamp: isoOffset(5, 10),   activity_name: "Park visit",       duration_minutes: 90,  color: "#10b981", notes: "Tadpole loved the ducks." }),
    rec({ timestamp: isoOffset(6, 11),   activity_name: "Errands",          duration_minutes: 60,  color: "#fbbf24" }),
    rec({ timestamp: isoOffset(7, 18),   activity_name: "Therapy session",  duration_minutes: 50,  color: "#7c3aed" }),
    rec({ timestamp: isoOffset(8, 14),   activity_name: "Skating",          duration_minutes: 60,  color: "#3b82f6", notes: "Rook hit the mini-ramp." }),
    rec({ timestamp: isoOffset(9, 13),   activity_name: "Cooking",          duration_minutes: 70,  color: "#65a30d", notes: "Fern, of course." }),
    rec({ timestamp: isoOffset(10, 19),  activity_name: "Reading",          duration_minutes: 50,  color: "#0ea5e9" }),
    rec({ timestamp: isoOffset(11, 16),  activity_name: "Game night",       duration_minutes: 120, color: "#a855f7" }),
    rec({ timestamp: isoOffset(13, 10),  activity_name: "Long walk",        duration_minutes: 80,  color: "#10b981" }),
  ];

  // Journals — each example is also a tour of a journal feature.
  const journals = [
    rec({
      created_date: isoOffset(0, 22),
      title: "How journal entries work",
      content: "<p><b>Journal entries</b> are long-form, dated, and optionally attached to one {alter} via the alter_id field. Use them for end-of-day reflection, therapy homework, or any prose you want kept.</p><p>This entry has tags <code>tutorial</code> + <code>journals</code> — tags filter the Journals page. The body supports HTML (bold, italic, lists, links).</p>",
      tags: ["tutorial","journals"], alter_id: alters.noor.id,
    }),
    rec({
      created_date: isoOffset(1, 20),
      title: "Tagged + alter-attached example",
      content: "Attached to Iris (alter_id) and tagged with <code>co-host</code>. Filtering by tag pulls just these. Filtering by alter on the alter's profile shows just their journal entries.",
      tags: ["co-host","example"], alter_id: alters.iris.id,
    }),
    rec({
      created_date: isoOffset(2, 21),
      title: "Plain-text minimum example",
      content: "A journal entry can be as short as one sentence — no title required, no tags required, no alter required.",
      tags: [],
    }),
    rec({
      created_date: isoOffset(3, 22),
      title: "Rich HTML example",
      content: "<h3>Section heading</h3><p>The journal editor supports the full bio-editor toolbar (bold, italic, lists, blockquotes, code, links, colour, gradient text, glass / dark / radial boxes).</p><blockquote style='border-left:3px solid #a78bfa;padding-left:.75em;color:#94a3b8;'>Quoted reflection from earlier in the week.</blockquote><p>Mix and match HTML to the depth you want.</p>",
      tags: ["tutorial","editor"], alter_id: alters.atlas.id,
    }),
    rec({
      created_date: isoOffset(4, 20),
      title: "Therapy-tagged",
      content: "Use a consistent tag like <code>therapy</code> across sessions; the Therapy Report can pull entries by tag for inclusion in a clinical summary.",
      tags: ["therapy"], alter_id: alters.iris.id,
    }),
    rec({
      created_date: isoOffset(5, 22),
      title: "From a little (kid-style example)",
      content: "you can write in any voice. caps, no punctuation, emojis 🐰🌈. nothing makes the entry \"valid\" or not. just write.",
      tags: ["littles"], alter_id: alters.poppy.id,
    }),
    rec({
      created_date: isoOffset(6, 22),
      title: "Multi-alter mention example",
      content: "Journals attach to ONE primary alter via alter_id, but you can mention others in the body — type @ then a name. Mentions show up in the mentioned alter's notification log.",
      tags: ["mentions"], alter_id: alters.rook.id,
    }),
    rec({
      created_date: isoOffset(7, 21),
      title: "Long reflection example",
      content: "Use the journal for processing — the Quick Check-In is for short-term mood / energy / symptoms, the journal is for longer thought. The Support Journal (separate) is for IFS-style parts work.",
      tags: ["therapy","reflection"], alter_id: alters.iris.id,
    }),
    rec({
      created_date: isoOffset(9, 21),
      title: "Working-with-a-part example",
      content: "Some systems use the journal to record dialogues with a specific {alter}. Tag with the {alter}'s name and attach via alter_id so future filters surface it easily.",
      tags: ["dialogue","persecutor"], alter_id: alters.kestrel.id,
    }),
    rec({
      created_date: isoOffset(10, 23),
      title: "Private one-line example",
      content: "do not read this. fine, ok. it was a fine day. mitski. i am going to bed.",
      tags: ["private"], alter_id: alters.vex.id,
    }),
    rec({
      created_date: isoOffset(12, 22),
      title: "Linked-to-event example",
      content: "Journals can document System Change Events — fusions, splits, dormancies. Tag with <code>lineage</code> + <code>fusion</code> / <code>split</code> / <code>dormancy</code> for cross-reference with the Lineage tab.",
      tags: ["lineage","dormant","fusion"], alter_id: alters.atlas.id,
    }),
  ];

  const checkIns = [
    rec({ created_date: isoOffset(0, 8),  mood: 5, communication_quality: 6, system_harmony: 6, note: "Lots of co-consciousness today. Iris and Fern co-fronting." }),
    rec({ created_date: isoOffset(2, 21), mood: 6, communication_quality: 7, system_harmony: 7, note: "Steady. Halo brought softness this afternoon." }),
    rec({ created_date: isoOffset(3, 21), mood: 6, communication_quality: 7, system_harmony: 7, note: "System meeting went smoothly. Twenty-one people showed up to the inner room." }),
    rec({ created_date: isoOffset(5, 22), mood: 7, communication_quality: 8, system_harmony: 8, note: "Littles had the morning, adults had the afternoon. Smooth handoff." }),
    rec({ created_date: isoOffset(7, 20), mood: 5, communication_quality: 5, system_harmony: 5, note: "Tense — Kestrel and Iris disagreeing about an outside friend." }),
    rec({ created_date: isoOffset(10, 21),mood: 6, communication_quality: 7, system_harmony: 7, note: "Teens have been more co-present. Vex even said hi to Sparrow." }),
    rec({ created_date: isoOffset(11, 9), mood: 7, communication_quality: 8, system_harmony: 8, note: "Felt like a big team this morning." }),
  ];

  const statusNotes = [
    rec({ timestamp: isoOffset(0, 11), note: "Co-fronting day. Iris is leading; Fern is in the background." }),
    rec({ timestamp: isoOffset(0, 19), note: "Halo made tea. The kitchen feels like a kitchen again." }),
    rec({ timestamp: isoOffset(1, 15), note: "Iris on phones today." }),
    rec({ timestamp: isoOffset(2, 14), note: "Switching every 90 minutes or so. Tiring but not unsafe." }),
    rec({ timestamp: isoOffset(3, 9),  note: "Sparrow is in charge of the morning. Don't argue." }),
    rec({ timestamp: isoOffset(5, 17), note: "Halo came up out of nowhere — kitchen got cinnamon vibes for an hour." }),
    rec({ timestamp: isoOffset(7, 21), note: "Therapy day. Shade was discussed; Gate kept things contained. Quiet evening." }),
    rec({ timestamp: isoOffset(8, 9),  note: "Atlas needs sleep. Iris is covering today." }),
    rec({ timestamp: isoOffset(10, 13),note: "Vex is here. They will not say so. They are." }),
    rec({ timestamp: isoOffset(11, 20), note: "Game night was loud — Rook, Vex, Poppy, Sparrow all up at once." }),
    rec({ timestamp: isoOffset(13, 9), note: "Body feels rested. Atlas back at the front." }),
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
    rec({ type: "split",    date: new Date(2010, 0, 1).toISOString(), year_only: true, source_alter_ids: [alters.atlas.id], result_alter_ids: [alters.iris.id, alters.tiny.id], cause: "Burnout",     notes: "Co-host emerged plus a typist fragment." }),
    rec({ type: "split",    date: new Date(2017, 0, 1).toISOString(), year_only: true, source_alter_ids: [alters.iris.id], result_alter_ids: [alters.brae.id], cause: "Logistics overload", notes: "Brae split off from Iris to take on day-to-day stewardship." }),
    rec({ type: "dormancy", date: new Date(2022, 0, 1).toISOString(), year_only: true, source_alter_ids: [alters.lumen.id], notes: "Lumen has been dormant since." }),
  ];

  // Mirror the real preset symptom catalogue (utils/symptomDefaults.js) plus
  // the four DID-specific items the tapestry wants to log against, so the
  // Quick Check-In sheet in Preview Mode looks the way it does for a real
  // user with defaults seeded.
  const symptoms = [
    // Rating
    rec({ label: "Overall mood",       category: "symptom", type: "rating", is_positive: true,  color: "#8B5CF6", order: 0,  is_default: true }),
    rec({ label: "Energy level",       category: "symptom", type: "rating", is_positive: true,  color: "#F59E0B", order: 1,  is_default: true }),
    rec({ label: "Self esteem",        category: "symptom", type: "rating", is_positive: true,  color: "#A78BFA", order: 2,  is_default: true }),
    rec({ label: "Anxiety",            category: "symptom", type: "rating", is_positive: false, color: "#EF4444", order: 3,  is_default: true }),
    rec({ label: "Depression",         category: "symptom", type: "rating", is_positive: false, color: "#6366F1", order: 4,  is_default: true }),
    rec({ label: "Feeling irritable",  category: "symptom", type: "rating", is_positive: false, color: "#F97316", order: 5,  is_default: true }),
    rec({ label: "Feeling overwhelmed",category: "symptom", type: "rating", is_positive: false, color: "#DC2626", order: 6,  is_default: true }),
    rec({ label: "Emotional numbness", category: "symptom", type: "rating", is_positive: false, color: "#64748B", order: 7,  is_default: true }),
    rec({ label: "Trouble sleeping",   category: "symptom", type: "rating", is_positive: false, color: "#1D4ED8", order: 8,  is_default: true }),
    // Boolean symptoms
    rec({ label: "Amnesia / memory problems", category: "symptom", type: "boolean", is_positive: false, color: "#3B82F6", order: 9,  is_default: true }),
    rec({ label: "Triggered switch",          category: "symptom", type: "boolean", is_positive: false, color: "#B45309", order: 10, is_default: true }),
    rec({ label: "Random switch",             category: "symptom", type: "boolean", is_positive: false, color: "#92400E", order: 11, is_default: true }),
    rec({ label: "Rapid switching",           category: "symptom", type: "boolean", is_positive: false, color: "#C2410C", order: 12, is_default: true }),
    rec({ label: "General stress",            category: "symptom", type: "boolean", is_positive: false, color: "#2563EB", order: 13, is_default: true }),
    rec({ label: "Relationship stress",       category: "symptom", type: "boolean", is_positive: false, color: "#7C3AED", order: 14, is_default: true }),
    // Habits
    rec({ label: "Feeling calm",       category: "habit", type: "boolean", is_positive: true, color: "#10B981", order: 0, is_default: true }),
    rec({ label: "Used coping skills", category: "habit", type: "boolean", is_positive: true, color: "#06B6D4", order: 1, is_default: true }),
    rec({ label: "Attended therapy",   category: "habit", type: "boolean", is_positive: true, color: "#0891B2", order: 2, is_default: true }),
    rec({ label: "Exercise / movement",category: "habit", type: "boolean", is_positive: true, color: "#16A34A", order: 3, is_default: true }),
    rec({ label: "Self-care",          category: "habit", type: "boolean", is_positive: true, color: "#4ADE80", order: 4, is_default: true }),
    // DID-specific entries the tapestry timeline references by name.
    rec({ name: "Dissociation", label: "Dissociation", category: "symptom", type: "rating", is_positive: false, color: "#a78bfa", icon: "🌫️", order: 15, is_default: false }),
    rec({ name: "Headache",     label: "Headache",     category: "symptom", type: "rating", is_positive: false, color: "#ef4444", icon: "🤕", order: 16, is_default: false }),
    rec({ name: "Fatigue",      label: "Fatigue",      category: "symptom", type: "rating", is_positive: false, color: "#64748b", icon: "😴", order: 17, is_default: false }),
    rec({ name: "Time loss",    label: "Time loss",    category: "symptom", type: "rating", is_positive: false, color: "#0ea5e9", icon: "⏳", order: 18, is_default: false }),
  ];
  // Indexes 20..23 are Dissociation, Headache, Fatigue, Time loss respectively.
  const symptomSessions = [
    rec({ symptom_id: symptoms[20].id, start_time: isoOffset(1, 11), end_time: isoOffset(1, 13), severity: 6 }),
    rec({ symptom_id: symptoms[23].id, start_time: isoOffset(4, 15), end_time: isoOffset(4, 18), severity: 7, notes: "Lost three hours after Shade surfaced." }),
    rec({ symptom_id: symptoms[21].id, start_time: isoOffset(7, 17), end_time: isoOffset(7, 20), severity: 5 }),
    rec({ symptom_id: symptoms[22].id, start_time: isoOffset(10, 19), end_time: isoOffset(10, 23), severity: 6 }),
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

  // ─────────────────────────────────────────────────────────────────────────
  // The rest of this function fills out every other entity type the app
  // supports, so a user entering Preview Mode can see what each feature
  // looks like populated. Most records are realistic enough; a handful are
  // intentionally written as in-app documentation so the preview also acts
  // as a feature tour.
  // ─────────────────────────────────────────────────────────────────────────

  // === Groups (subsystems) ===========================================
  const groups = [
    rec({ name: "The Adults", color: "#7c3aed", description: "Hosts, co-host, and the alters who handle daily logistics.", member_alter_ids: [alters.atlas.id, alters.iris.id, alters.fern.id, alters.linnet.id, alters.noor.id, alters.brae.id, alters.pell.id], parent: "root", order: 0 }),
    rec({ name: "The Protectors", color: "#dc2626", description: "Watchers, gatekeepers, and the alters who step in when things feel unsafe.", member_alter_ids: [alters.jasper.id, alters.gate.id, alters.kestrel.id, alters.shade.id], parent: "root", order: 1 }),
    rec({ name: "The Littles & Middles", color: "#f59e0b", description: "Younger alters. Cared for by Linnet and Sage-style caretakers.", member_alter_ids: [alters.milo.id, alters.poppy.id, alters.tadpole.id, alters.sparrow.id], parent: "root", order: 2 }),
    rec({ name: "The Teens", color: "#a855f7", description: "Adolescent alters. Loud, sharp, mostly fronting on weekends.", member_alter_ids: [alters.vex.id, alters.rook.id], parent: "root", order: 3 }),
    rec({ name: "Introjects", color: "#0ea5e9", description: "Alters modelled on outside figures or fictional characters.", member_alter_ids: [alters.noor.id, alters.halo.id, alters.blaze.id], parent: "root", order: 4 }),
    rec({ name: "Fragments & Dormants", color: "#94a3b8", description: "Alters with limited functions, plus those resting from active fronting.", member_alter_ids: [alters.tiny.id, alters.lumen.id], parent: "root", order: 5 }),
  ];

  // === Bulletins (system message board) ==============================
  // Each example below is also a working demo of one bulletin feature, so
  // the board is its own self-explaining tour.
  const bulletins = [
    rec({
      author_alter_id: alters.noor.id,
      author_alter_ids: [alters.noor.id],
      content: "📌 <b>Bulletin Board — quick guide.</b> The board is a system-wide feed. Anyone can post. You can @mention an {alter} and they'll see a notification. Pinning (the pin icon) keeps a post at the top. Reactions are emoji-only and tap-the-count shows who reacted. Comments are threaded under each post. Polls can be attached at compose time.",
      mentioned_alter_ids: [],
      is_pinned: true,
      reactions: { "📌": [alters.iris.id, alters.atlas.id, alters.fern.id, alters.noor.id] },
      created_date: isoOffset(0, 19),
    }),
    rec({
      author_alter_id: alters.iris.id,
      author_alter_ids: [alters.iris.id],
      content: "<b>Mention example.</b> Type @ then an {alter} name to mention them — like @Atlas. The mentioned {alter} appears in their personal mention log and gets a notification.",
      mentioned_alter_ids: [alters.atlas.id],
      is_pinned: false,
      reactions: { "👍": [alters.atlas.id] },
      created_date: isoOffset(1, 10),
    }),
    rec({
      author_alter_id: alters.linnet.id,
      author_alter_ids: [alters.linnet.id],
      content: "<b>Reactions example.</b> Tap the smiley to react. Multiple {alters} can react with the same emoji. Tap the count to see who reacted.",
      mentioned_alter_ids: [],
      is_pinned: false,
      reactions: { "💛": [alters.poppy.id, alters.tadpole.id, alters.milo.id], "🙏": [alters.atlas.id], "✅": [alters.iris.id] },
      created_date: isoOffset(2, 20, 30),
    }),
    rec({
      author_alter_id: alters.atlas.id,
      author_alter_ids: [alters.atlas.id],
      content: "<b>Co-author example.</b> A post can be authored by more than one {alter} when you tap the avatar list at compose time. Iris and I co-wrote this one.",
      mentioned_alter_ids: [],
      is_pinned: false,
      reactions: { "👥": [alters.noor.id] },
      author_alter_ids_extra_note: "co-author",
      created_date: isoOffset(3, 12),
    }),
    rec({
      author_alter_id: alters.iris.id,
      author_alter_ids: [alters.atlas.id, alters.iris.id],
      content: "<b>Long-form bulletin.</b> Bulletins support basic HTML — bold, italic, lists, links, line breaks. Use them for system announcements, decisions, agreements you want everyone to see. Compare with Journal entries (long-form, alter-attached) and Status Notes (short, system-wide, immutable timeline log).",
      mentioned_alter_ids: [],
      is_pinned: false,
      reactions: { "📝": [alters.noor.id] },
      created_date: isoOffset(4, 14),
    }),
    rec({
      author_alter_id: alters.gate.id,
      author_alter_ids: [alters.gate.id],
      content: "<b>Comments example.</b> Each bulletin has a thread. Tap the speech-bubble to comment. Comments don't accept polls or co-authors — keep it conversational.",
      mentioned_alter_ids: [],
      is_pinned: false,
      reactions: {},
      created_date: isoOffset(5, 16),
    }),
    rec({
      author_alter_id: alters.poppy.id,
      author_alter_ids: [alters.poppy.id],
      content: "<b>Casual example.</b> bulletins don't have to be Important.™ this is just me saying i drew a bunny 🐰🌈",
      mentioned_alter_ids: [],
      is_pinned: false,
      reactions: { "🥰": [alters.linnet.id, alters.iris.id, alters.sparrow.id], "🐰": [alters.tadpole.id] },
      created_date: isoOffset(6, 14),
    }),
    rec({
      author_alter_id: alters.atlas.id,
      author_alter_ids: [alters.atlas.id],
      content: "<b>Pinned vs. recent.</b> Pinned posts (like the guide at the top) appear above unpinned, regardless of date. Tap the pin again to unpin.",
      mentioned_alter_ids: [],
      is_pinned: false,
      reactions: { "📍": [alters.iris.id] },
      created_date: isoOffset(8, 10),
    }),
  ];

  const bulletinComments = [
    rec({ bulletin_id: bulletins[0].id, author_alter_id: alters.iris.id,  content: "Tip: comments support the same basic markdown the post does.", created_date: isoOffset(0, 19, 30) }),
    rec({ bulletin_id: bulletins[0].id, author_alter_id: alters.atlas.id, content: "Tip 2: tapping a reaction count shows the reactor list.", created_date: isoOffset(0, 20) }),
    rec({ bulletin_id: bulletins[1].id, author_alter_id: alters.atlas.id, content: "Got the mention — appeared at the top of my Notifications inbox.", created_date: isoOffset(1, 10, 15) }),
    rec({ bulletin_id: bulletins[5].id, author_alter_id: alters.iris.id,  content: "Threads can be long — they collapse after a few replies and tap-to-expand.", created_date: isoOffset(5, 16, 20) }),
    rec({ bulletin_id: bulletins[5].id, author_alter_id: alters.noor.id,  content: "And you can @mention inside a comment too.", created_date: isoOffset(5, 16, 30) }),
    rec({ bulletin_id: bulletins[6].id, author_alter_id: alters.linnet.id, content: "It's beautiful, Poppy. Going on the fridge.", created_date: isoOffset(6, 14, 20) }),
  ];

  // === Polls (system decisions) ======================================
  const polls = [
    rec({
      question: "What should we focus on this week in therapy?",
      options: [
        { label: "Working with Kestrel", votes: [alters.atlas.id, alters.iris.id, alters.noor.id] },
        { label: "Halo's emergence",    votes: [alters.fern.id] },
        { label: "Lumen check-in",      votes: [alters.gate.id] },
      ],
      multi_choice: false,
      author_alter_id: alters.atlas.id,
      created_date: isoOffset(2, 21),
    }),
    rec({
      question: "Friday night plan?",
      options: [
        { label: "Game night",  votes: [alters.rook.id, alters.vex.id, alters.poppy.id, alters.sparrow.id, alters.iris.id] },
        { label: "Movie night", votes: [alters.fern.id, alters.linnet.id] },
        { label: "Early bed",   votes: [alters.atlas.id, alters.gate.id] },
      ],
      multi_choice: false,
      author_alter_id: alters.iris.id,
      created_date: isoOffset(1, 18),
    }),
  ];

  // === Tasks (To-Do List) ============================================
  const tasks = [
    rec({ title: "Refill prescriptions",       completed: false, priority: "high",   due_date: isoOffset(-2, 17), assigned_alter_ids: [alters.iris.id] }),
    rec({ title: "Email therapist",            completed: true,  priority: "medium", completed_date: isoOffset(1, 11), assigned_alter_ids: [alters.atlas.id] }),
    rec({ title: "Plan weekend hike",          completed: false, priority: "low",    due_date: isoOffset(-4, 9), assigned_alter_ids: [alters.fern.id] }),
    rec({ title: "Call Mum",                   completed: false, priority: "medium" }),
    rec({ title: "Buy groceries (Wed list)",   completed: true,  priority: "medium", completed_date: isoOffset(2, 18) }),
    rec({ title: "Sketch from prompt #14",     completed: false, priority: "low",    assigned_alter_ids: [alters.poppy.id, alters.rook.id] }),
    rec({ title: "Replace bedroom lightbulb",  completed: true,  priority: "low",    completed_date: isoOffset(3, 19) }),
    rec({ title: "System meeting prep notes",  completed: false, priority: "medium", due_date: isoOffset(-1, 19), assigned_alter_ids: [alters.atlas.id, alters.noor.id] }),
    rec({ title: "Restock Halo's tea cabinet", completed: false, priority: "low",    assigned_alter_ids: [alters.halo.id, alters.fern.id] }),
  ];

  // === Daily Task Templates (recurring) ==============================
  const dailyTaskTemplates = [
    rec({ title: "Morning meds",      time_of_day: "08:00", days_of_week: [0,1,2,3,4,5,6], priority: "high",   description: "Take morning meds." }),
    rec({ title: "Hydration check",   time_of_day: "12:00", days_of_week: [0,1,2,3,4,5,6], priority: "medium", description: "Big glass of water." }),
    rec({ title: "Evening journal",   time_of_day: "21:30", days_of_week: [0,1,2,3,4,5,6], priority: "low",    description: "5-minute end-of-day reflection." }),
    rec({ title: "Therapy homework",  time_of_day: "19:00", days_of_week: [1,3],            priority: "medium", description: "Tuesday + Thursday IFS practice." }),
  ];

  // === Sleep entries =================================================
  // Sleep entries — variety designed to demonstrate every Sleep field:
  //   quality (1–10), is_interrupted + interruption_count + interruption_times,
  //   dreamed, had_nightmare, free-form notes. The notes also double as
  //   short captions explaining what each entry is showing.
  const sleepEntries = [
    rec({
      date: new Date(Date.now() - 0 * DAY).toISOString().slice(0, 10),
      bedtime: isoOffset(0, 23, 15), wake_time: isoOffset(-1, 7, 30),
      quality: 8,
      notes: "Example: a clean night — quality high, uninterrupted, no dreams logged. The Sleep Tracker shows this on the timeline as a single bar from bedtime to wake.",
      is_interrupted: false, dreamed: false, had_nightmare: false,
    }),
    rec({
      date: new Date(Date.now() - 1 * DAY).toISOString().slice(0, 10),
      bedtime: isoOffset(1, 22, 45), wake_time: isoOffset(0, 6, 50),
      quality: 6,
      notes: "Example: one mid-night wake — interruption_count: 1, interruption_times records when. Useful for spotting patterns over time.",
      is_interrupted: true, interruption_count: 1, interruption_times: [isoOffset(1, 3, 5)],
      dreamed: true, had_nightmare: false,
    }),
    rec({
      date: new Date(Date.now() - 2 * DAY).toISOString().slice(0, 10),
      bedtime: isoOffset(2, 23, 50), wake_time: isoOffset(1, 7, 0),
      quality: 4,
      notes: "Example: rough night — multiple wakes, no specific timestamps recorded (the field is optional).",
      is_interrupted: true, interruption_count: 2,
      dreamed: false, had_nightmare: false,
    }),
    rec({
      date: new Date(Date.now() - 3 * DAY).toISOString().slice(0, 10),
      bedtime: isoOffset(3, 22, 10), wake_time: isoOffset(2, 8, 5),
      quality: 9,
      notes: "Example: highest-quality night this week. Try the Sleep analytics page to see weekly averages and quality distributions.",
      is_interrupted: false, dreamed: true, had_nightmare: false,
    }),
    rec({
      date: new Date(Date.now() - 4 * DAY).toISOString().slice(0, 10),
      bedtime: isoOffset(4, 0, 30),  wake_time: isoOffset(3, 7, 20),
      quality: 3,
      notes: "Example: nightmare flagged. had_nightmare: true. The analytics view counts these separately and the timeline marks the night with a 🌙 badge.",
      is_interrupted: true, interruption_count: 3, interruption_times: [isoOffset(4, 1, 30), isoOffset(4, 3, 45), isoOffset(4, 5, 15)],
      dreamed: true, had_nightmare: true,
    }),
    rec({
      date: new Date(Date.now() - 5 * DAY).toISOString().slice(0, 10),
      bedtime: isoOffset(5, 23, 0),  wake_time: isoOffset(4, 7, 0),
      quality: 7,
      notes: "Example: minimal entry — only the required fields. Notes / dreamed / nightmare can all stay blank.",
      is_interrupted: false, dreamed: false, had_nightmare: false,
    }),
    rec({
      date: new Date(Date.now() - 6 * DAY).toISOString().slice(0, 10),
      bedtime: isoOffset(6, 21, 30), wake_time: isoOffset(5, 5, 0),
      quality: 5,
      notes: "Example: short night — under 8 hours. Combined with low quality this typically explains a low-energy check-in the next morning.",
      is_interrupted: false, dreamed: false, had_nightmare: false,
    }),
    rec({
      date: new Date(Date.now() - 7 * DAY).toISOString().slice(0, 10),
      bedtime: isoOffset(7, 22, 30), wake_time: isoOffset(6, 6, 30),
      quality: 6,
      notes: "Example: a typical night — 8 hours, one wake, no nightmare, no notes about who fronted at bedtime. Most entries look like this.",
      is_interrupted: true, interruption_count: 1,
      dreamed: false, had_nightmare: false,
    }),
  ];

  // === Reminders =====================================================
  const reminders = [
    rec({ title: "Take morning meds",   action_type: "open_diary",          frequency: "daily",  time: "08:00", delivery_channels: ["in_app", "push"], is_active: true,  description: "Daily reminder to take meds and log the check-in." }),
    rec({ title: "Hydration check",     action_type: "open_quick_check_in", frequency: "daily",  time: "12:00", delivery_channels: ["in_app"],         is_active: true }),
    rec({ title: "Therapy at 4pm",      action_type: "none",                frequency: "weekly", time: "15:30", days_of_week: [3], delivery_channels: ["in_app","push"], is_active: true,  description: "30-min heads-up before therapy." }),
    rec({ title: "Evening journal",     action_type: "open_journal",        frequency: "daily",  time: "21:30", delivery_channels: ["in_app"],         is_active: true }),
    rec({ title: "Weekly system meeting", action_type: "open_system_check_in", frequency: "weekly", time: "20:00", days_of_week: [0], delivery_channels: ["in_app","push"], is_active: true, description: "Sunday-night sit-down." }),
  ];

  // === Custom emotions / triggers / activity categories ==============
  const customEmotions = [
    rec({ label: "co-conscious",   category: "neutral",  color: "#a78bfa" }),
    rec({ label: "blurry",         category: "negative", color: "#94a3b8" }),
    rec({ label: "found",          category: "positive", color: "#10b981" }),
    rec({ label: "switching-soon", category: "neutral",  color: "#f59e0b" }),
    rec({ label: "rooted",         category: "positive", color: "#65a30d" }),
    rec({ label: "rushed",         category: "negative", color: "#dc2626" }),
  ];
  const triggerTypes = [
    rec({ label: "Phone call",     emoji: "📞", hint: "unexpected calls, voicemails" }),
    rec({ label: "Family contact", emoji: "👪", hint: "family of origin contact" }),
    rec({ label: "Big crowd",      emoji: "🏟️", hint: "loud, packed spaces" }),
    rec({ label: "Old song",       emoji: "🎵", hint: "music with strong memory associations" }),
  ];
  const activityCategories = [
    rec({ name: "Self-care",      color: "#10b981" }),
    rec({ name: "Therapy & work", color: "#7c3aed" }),
    rec({ name: "Creative",       color: "#f43f5e" }),
    rec({ name: "Movement",       color: "#0ea5e9" }),
    rec({ name: "Connection",     color: "#fbbf24" }),
    rec({ name: "Rest",           color: "#94a3b8" }),
  ];
  const activityGoals = [
    rec({ category: "Movement",   target_minutes_per_week: 90,  description: "Walks, yoga, skating." }),
    rec({ category: "Creative",   target_minutes_per_week: 180, description: "Drawing, music, writing — anyone." }),
    rec({ category: "Connection", target_minutes_per_week: 60,  description: "Therapy, friends, system meetings." }),
  ];

  // === Grounding techniques ==========================================
  const groundingTechniques = [
    rec({ name: "5-4-3-2-1 senses",  category: "sensory",   description: "Name 5 things you see, 4 you can touch, 3 you hear, 2 you smell, 1 you taste.", steps: ["5 things you see","4 things you can touch","3 things you hear","2 things you smell","1 thing you taste"], duration_seconds: 180, is_default: true,  is_archived: false, order: 0 }),
    rec({ name: "Cold-water reset",  category: "sensory",   description: "Splash cold water on the face or hold an ice cube to interrupt a freeze.", steps: ["Cup cold water in hands","Hold to face for 15s","Take three slow breaths","Pat dry"], duration_seconds: 60, is_default: false, is_archived: false, order: 1 }),
    rec({ name: "Inner room walk",   category: "imaginal",  description: "For internal anchoring — walk through the system's inner room and greet whoever's there.", steps: ["Close your eyes","Picture the inner room","Notice who's in it","Say hi without trying to fix anything"], duration_seconds: 240, is_default: false, is_archived: false, order: 2, suggested_for: [alters.shade.id, alters.atlas.id] }),
    rec({ name: "Box breathing 4×4", category: "breath",    description: "4-second inhale, 4 hold, 4 exhale, 4 hold — repeat.", steps: ["Inhale 4s","Hold 4s","Exhale 4s","Hold 4s","Repeat for 2 minutes"], duration_seconds: 120, is_default: true, is_archived: false, order: 3 }),
    rec({ name: "Halo's tea ritual", category: "comfort",   description: "Halo's recipe — boil water, choose a tea, breathe in the steam for one full minute before sipping.", steps: ["Boil water","Choose tea","Pour and breathe in steam for 1 minute","Sip slowly"], duration_seconds: 360, is_default: false, is_archived: false, order: 4, suggested_for: [alters.halo.id, alters.fern.id] }),
  ];
  const groundingPreferences = [
    rec({ alter_id: alters.atlas.id, technique_ids: [groundingTechniques[0].id, groundingTechniques[3].id], notes: "Atlas's go-to combo." }),
    rec({ alter_id: alters.shade.id, technique_ids: [groundingTechniques[2].id, groundingTechniques[1].id], notes: "Inner-room walk first; cold water if surfacing." }),
  ];

  // === Inner world locations =========================================
  // Each location is a node on the Inner World Map (Settings → System Map →
  // Inner World tab). Drag to reposition; tap to assign occupant alters;
  // colour is shown as the node ring. Descriptions are free-form text the
  // user can use however they want — these examples double as hints about
  // how the feature can be used.
  const innerWorldLocations = [
    rec({
      name: "The Inner Room",
      description: "Use case: a central meeting space. List the {alters} who attend system meetings as occupants — handy for choosing who to summon when scheduling a System Meeting.",
      color: "#a78bfa", x: 200, y: 150,
      occupant_alter_ids: [alters.atlas.id, alters.iris.id, alters.noor.id, alters.gate.id],
    }),
    rec({
      name: "The Garden",
      description: "Use case: a calm outdoor area. Use it for {alters} associated with grounding and the body. Pair with a Grounding Technique that suggests this space.",
      color: "#65a30d", x: 80, y: 80,
      occupant_alter_ids: [alters.fern.id, alters.linnet.id],
    }),
    rec({
      name: "The Library",
      description: "Use case: somewhere {alters} who like quiet, study, or solo work tend to be. Mentor-style introjects often map here.",
      color: "#0ea5e9", x: 320, y: 90,
      occupant_alter_ids: [alters.noor.id, alters.atlas.id],
    }),
    rec({
      name: "The Playroom",
      description: "Use case: a space for the littles. Caretaker {alters} can be added as occupants too so the map shows who's looking after whom.",
      color: "#f59e0b", x: 100, y: 240,
      occupant_alter_ids: [alters.poppy.id, alters.milo.id, alters.tadpole.id, alters.linnet.id],
    }),
    rec({
      name: "The Hallway",
      description: "Use case: a transitional area. Useful for teens, fragments, or any {alter} who's \"between rooms\" — between full development and dormancy, between roles, etc.",
      color: "#a855f7", x: 350, y: 220,
      occupant_alter_ids: [alters.vex.id, alters.rook.id],
    }),
    rec({
      name: "The Vault",
      description: "Use case: a contained / protected area for trauma-holders. A gatekeeper {alter} listed alongside makes it visible who manages access.",
      color: "#1e293b", x: 200, y: 290,
      occupant_alter_ids: [alters.shade.id, alters.gate.id],
    }),
    rec({
      name: "The Workshop",
      description: "Use case: where creative {alters} make things. List multiple — the map renders each occupant's avatar inside the node.",
      color: "#f43f5e", x: 60, y: 170,
      occupant_alter_ids: [alters.poppy.id, alters.rook.id],
    }),
    rec({
      name: "The Lookout",
      description: "Use case: a high-visibility spot for protector {alters}. Great visual indicator when paired with the Protectors group.",
      color: "#dc2626", x: 380, y: 60,
      occupant_alter_ids: [alters.jasper.id],
    }),
    rec({
      name: "Empty Field (no occupants)",
      description: "Use case: a location can exist without occupants — useful as a marker for places that aren't currently in use. Add and remove occupants any time.",
      color: "#64748b", x: 280, y: 280,
      occupant_alter_ids: [],
    }),
  ];

  // === Alter messages (system board to a specific alter) =============
  const alterMessages = [
    rec({ alter_id: alters.kestrel.id, author_alter_id: alters.atlas.id, content: "Hey. Therapist asked us to write you a thank-you for keeping us safe when no one else could. So — thank you. We'd like to know what you need now.", created_date: isoOffset(8, 21) }),
    rec({ alter_id: alters.kestrel.id, author_alter_id: alters.iris.id,  content: "Seconded.", created_date: isoOffset(8, 21, 5) }),
    rec({ alter_id: alters.halo.id,    author_alter_id: alters.poppy.id, content: "i made you a card!! its on the fridge", created_date: isoOffset(5, 15) }),
    rec({ alter_id: alters.lumen.id,   author_alter_id: alters.noor.id,  content: "We're not waiting for you. Rest as long as you need.", created_date: isoOffset(30, 12) }),
  ];

  // === Alter notes (per-alter notes) =================================
  const alterNotes = [
    rec({ alter_id: alters.atlas.id,  content: "Sleep is non-negotiable. If I'm under 6 hours two nights in a row, hand off to Iris.", created_date: isoOffset(20, 22) }),
    rec({ alter_id: alters.iris.id,   content: "Do NOT reply to family-of-origin emails the same day. 24-hour rule.", created_date: isoOffset(15, 19) }),
    rec({ alter_id: alters.shade.id,  content: "Surface protocol: notify Gate, log session, no driving for 4 hours after.", created_date: isoOffset(60, 14) }),
    rec({ alter_id: alters.poppy.id,  content: "favorite snacks: strawberries, cheese crackers, juice boxes (apple)", created_date: isoOffset(40, 10) }),
  ];

  // === Diary cards + daily progress =================================
  const diaryTemplates = [
    rec({ name: "Standard daily",  is_default: true,  fields: [
      { id: "mood",          label: "Mood",          type: "rating", scale: 10 },
      { id: "anxiety",       label: "Anxiety",       type: "rating", scale: 10 },
      { id: "dissociation",  label: "Dissociation",  type: "rating", scale: 10 },
      { id: "switches",      label: "Switches",      type: "number" },
      { id: "skills_used",   label: "Skills used",   type: "checkbox-list", options: ["grounding","breathwork","journaling","reaching out","movement"] },
      { id: "what",          label: "What happened", type: "longtext" },
    ]}),
  ];
  const diaryCards = [
    rec({ date: new Date(Date.now() - 0 * DAY).toISOString().slice(0,10), template_id: diaryTemplates[0].id, fields: { mood: 6, anxiety: 4, dissociation: 3, switches: 5, skills_used: ["grounding","journaling"] }, notes: { what: "Co-fronting with Iris and Fern. Therapy moved to Wednesdays." } }),
    rec({ date: new Date(Date.now() - 1 * DAY).toISOString().slice(0,10), template_id: diaryTemplates[0].id, fields: { mood: 5, anxiety: 6, dissociation: 5, switches: 8, skills_used: ["breathwork"] },                notes: { what: "Lots of switching. Tiring but not unsafe." } }),
    rec({ date: new Date(Date.now() - 2 * DAY).toISOString().slice(0,10), template_id: diaryTemplates[0].id, fields: { mood: 7, anxiety: 3, dissociation: 2, switches: 4, skills_used: ["grounding","movement","reaching out"] }, notes: { what: "Good day. Halo and Atlas co-fronted in the kitchen." } }),
    rec({ date: new Date(Date.now() - 4 * DAY).toISOString().slice(0,10), template_id: diaryTemplates[0].id, fields: { mood: 3, anxiety: 8, dissociation: 7, switches: 3, skills_used: ["grounding"] },                          notes: { what: "Shade surfaced briefly. Heavy day." } }),
    rec({ date: new Date(Date.now() - 6 * DAY).toISOString().slice(0,10), template_id: diaryTemplates[0].id, fields: { mood: 6, anxiety: 4, dissociation: 3, switches: 6, skills_used: ["journaling","movement"] },              notes: { what: "Therapy. Talked about Kestrel." } }),
  ];
  const dailyProgress = [
    rec({ date: new Date(Date.now() - 0 * DAY).toISOString().slice(0,10), tasks_completed: 2, tasks_total: 5 }),
    rec({ date: new Date(Date.now() - 1 * DAY).toISOString().slice(0,10), tasks_completed: 4, tasks_total: 4 }),
    rec({ date: new Date(Date.now() - 2 * DAY).toISOString().slice(0,10), tasks_completed: 1, tasks_total: 3 }),
    rec({ date: new Date(Date.now() - 3 * DAY).toISOString().slice(0,10), tasks_completed: 3, tasks_total: 4 }),
  ];

  // === Symptom check-ins (intensity-only spot checks) =================
  const symptomCheckIns = [
    rec({ symptom_id: symptoms[0].id, timestamp: isoOffset(2, 14), severity: 6, notes: "After the trigger." }),
    rec({ symptom_id: symptoms[0].id, timestamp: isoOffset(2, 17), severity: 4 }),
    rec({ symptom_id: symptoms[1].id, timestamp: isoOffset(5, 11), severity: 5 }),
    rec({ symptom_id: symptoms[3].id, timestamp: isoOffset(4, 18), severity: 7, notes: "Three hours unaccounted for." }),
  ];

  // === Support / IFS-style journal entries ===========================
  const supportJournals = [
    rec({ title: "Welcoming the Critic",   topic: "managers",     content: "Tried to thank the Critic instead of arguing back. Didn't go great. Will try again.", created_date: isoOffset(2, 22), tags: ["managers","ifs"] }),
    rec({ title: "After the firefighter",  topic: "firefighters", content: "Snacks, scrolling, three hours gone. Not as a failure — as information.", created_date: isoOffset(3, 23), tags: ["firefighters"] }),
    rec({ title: "Welcoming Small One",    topic: "exiles",       content: "She came forward in session. Just sadness, no story attached. Sat together.", created_date: isoOffset(7, 22), tags: ["exiles","unburdening"] }),
  ];
  const learningProgress = [
    rec({ topic: "managers",     progress: 0.6, last_visited: isoOffset(2, 22) }),
    rec({ topic: "firefighters", progress: 0.3, last_visited: isoOffset(3, 23) }),
    rec({ topic: "exiles",       progress: 0.2, last_visited: isoOffset(7, 22) }),
    rec({ topic: "self-energy",  progress: 0.5, last_visited: isoOffset(11, 21) }),
  ];

  // === Therapy report templates / exports ============================
  const reportTemplates = [
    rec({ name: "Weekly clinical summary", description: "For the Wednesday session — last 7 days of mood, dissociation, switches, key journal excerpts.", date_range_days: 7,  sections: ["mood_chart","dissociation_chart","switch_count","journal_excerpts","status_notes"], default: true }),
    rec({ name: "Monthly overview",        description: "Bigger picture for the monthly check-in — fronting time per alter, symptom patterns.", date_range_days: 30, sections: ["fronting_summary","symptom_chart","activities_summary","relationships"], default: false }),
  ];
  const reportExports = [
    rec({ template_id: reportTemplates[0].id, exported_at: isoOffset(7, 16), format: "pdf",  filename: "symphony-weekly-2026-04-30.pdf" }),
    rec({ template_id: reportTemplates[0].id, exported_at: isoOffset(0, 17), format: "json", filename: "symphony-weekly-2026-05-08.json" }),
  ];

  // === Mention log ===================================================
  const mentionLogs = [
    rec({ mentioned_alter_id: alters.atlas.id,   source_type: "bulletin", source_id: bulletins[0].id, source_label: "Bulletin Board", navigate_path: `/bulletin/${bulletins[0].id}`, read: false, created_date: isoOffset(0, 19) }),
    rec({ mentioned_alter_id: alters.milo.id,    source_type: "bulletin", source_id: bulletins[1].id, source_label: "Bulletin Board", navigate_path: `/bulletin/${bulletins[1].id}`, read: true,  created_date: isoOffset(1, 20, 30) }),
    rec({ mentioned_alter_id: alters.shade.id,   source_type: "bulletin", source_id: bulletins[6].id, source_label: "Front rotation", navigate_path: `/bulletin/${bulletins[6].id}`, read: false, created_date: isoOffset(4, 22, 30) }),
  ];

  // === Custom fields (system-wide) + alter-specific custom fields ====
  const customFields = [
    rec({ name: "Likes",     order: 0, type: "tags",    placeholder: "Tag list" }),
    rec({ name: "Dislikes",  order: 1, type: "tags",    placeholder: "Tag list" }),
    rec({ name: "Triggers",  order: 2, type: "tags",    placeholder: "Sensory / situational triggers" }),
    rec({ name: "Comfort",   order: 3, type: "longtext",placeholder: "What helps when this alter is overwhelmed" }),
  ];

  // === Relationship types (custom labels for the system map) =========
  const relationshipTypes = [
    rec({ label: "Co-host",        is_default: true,  color: "#7c3aed" }),
    rec({ label: "Protects",       is_default: true,  color: "#dc2626" }),
    rec({ label: "Caretaker of",   is_default: true,  color: "#06b6d4" }),
    rec({ label: "Looks after",    is_default: false, color: "#65a30d" }),
    rec({ label: "Trusts deeply",  is_default: false, color: "#fbbf24" }),
    rec({ label: "Working it out", is_default: false, color: "#a855f7" }),
    rec({ label: "Mentor to",      is_default: false, color: "#0ea5e9" }),
    rec({ label: "Sibling-like",   is_default: false, color: "#f59e0b" }),
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
    blurb: "A populated example dataset that demonstrates every feature of the app — every entity table is filled with worked examples ranging from minimal usage to fullest extent. Bulletins explain the bulletin board, journals explain the journal editor, sleep entries explain each Sleep field, inner-world locations explain the map, and selected alter profiles include rich HTML bios that double as in-app feature documentation. Three alters carry per-alter theme presets (Iris's berry + Playfair, Vex's stark dark, Halo's warm rose-gold) so swiping primary swaps the app's whole look. Real data is hidden but never touched while Preview Mode is on.",
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
