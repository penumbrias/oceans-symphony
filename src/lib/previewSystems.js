// Curated "guided example" used by Preview Mode.
//
// One example system whose alters ARE the walkthrough — each profile
// documents a feature area (see previewWiki.js), and a handful of them
// double as design showcases that flex the bio editor's range. On top of
// that, every section of the app is filled with realistic example data
// attributed to those pages, so entering Preview Mode drops you into a
// lived-in app you can actually poke at. Real data is hidden but never
// touched while Preview Mode is on.
//
// Data is generated relative to "now" so the timeline always shows recent
// activity, regardless of when the user enables Preview Mode.
//
// The page definitions + bios + theme presets live in previewWiki.js;
// this file imports them and generates the surrounding dataset.

import { buildPages } from "./previewWiki";
import { PREVIEW_SYSTEMS_META } from "./previewMeta";

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
// The one guided example. Alters come from previewWiki.js (feature pages);
// six "member" pages carry theme presets and get the attributed data.
// ---------------------------------------------------------------------------
function buildGuidedDemo() {
  const pages = buildPages();
  const A = pages.A;

  // Member handles — the six pages that carry theme presets and appear in
  // the fronting / timeline / analytics data. Named by feature so the demo
  // reads as "a system whose members are named after app areas" — clearly
  // an example, not a characterised cast.
  const M = {
    welcome: A.welcome,       // Sky
    toolbar: A.toolbar,       // Bloom
    fields:  A.fields,        // Berry
    raw:     A.rawShowcase,   // Neon
    theme:   A.themeShowcase, // Glow
    avatars: A.avatars,       // Constellation
  };

  // ── Fronting ───────────────────────────────────────────────────────────
  // Welcome is the active primary so the dashboard greets the user on entry.
  // One co-fronter so the chip strip isn't lonely.
  const fronting = [];
  fronting.push(rec({
    alter_id: M.welcome.id, is_primary: true,
    start_time: new Date(Date.now() - 30 * 60000).toISOString(),
    end_time: null, is_active: true,
  }));
  fronting.push(rec({
    alter_id: M.theme.id, is_primary: false,
    start_time: new Date(Date.now() - 30 * 60000).toISOString(),
    end_time: null, is_active: true,
  }));

  // A rotation across the six members over the past four weeks — variety on
  // the timeline and enough spread for the analytics to compute.
  const order = [M.welcome, M.toolbar, M.fields, M.raw, M.theme, M.avatars];
  const sched = [
    [1, 9, 3, 1], [1, 14, 2, 2], [2, 10, 2, 3], [2, 14, 3, 4], [3, 9, 4, 5],
    [3, 15, 2, 1], [4, 10, 3, 2], [5, 9, 2, 0], [5, 12, 3, 3], [6, 10, 2, 5],
    [6, 14, 3, 1], [7, 9, 2, 2], [7, 13, 3, 4], [8, 10, 4, 1], [9, 11, 3, 5],
    [10, 9, 2, 3], [10, 13, 3, 4], [11, 9, 3, 1], [12, 10, 2, 2], [13, 9, 3, 5],
    [13, 14, 3, 1], [14, 9, 2, 4], [16, 10, 3, 0], [18, 11, 2, 3], [20, 9, 3, 1],
    [22, 14, 2, 2], [24, 10, 3, 5], [26, 9, 2, 4], [28, 11, 3, 0],
  ];
  sched.forEach(([d, h, dur, idx]) => pushSession(fronting, order[idx].id, d, h, dur));

  // ── Day-to-day records ─────────────────────────────────────────────────
  // Neutral, feature-flavoured content — no invented personalities.

  const emotions = [
    rec({ timestamp: isoOffset(0, 9),  mood: 7, energy: 6, emotions: ["welcoming", "curious"] }),
    rec({ timestamp: isoOffset(0, 14), mood: 6, energy: 5, emotions: ["focused"] }),
    rec({ timestamp: isoOffset(0, 21), mood: 7, energy: 4, emotions: ["settled", "grateful"], note: "Good first day exploring." }),
    rec({ timestamp: isoOffset(1, 8),  mood: 6, energy: 5, emotions: ["determined"] }),
    rec({ timestamp: isoOffset(1, 13), mood: 7, energy: 6, emotions: ["bright"] }),
    rec({ timestamp: isoOffset(1, 20), mood: 5, energy: 4, emotions: ["thoughtful"] }),
    rec({ timestamp: isoOffset(2, 10), mood: 5, energy: 5, emotions: ["wary"], note: "Body felt off — logged it to notice the pattern." }),
    rec({ timestamp: isoOffset(2, 16), mood: 7, energy: 6, emotions: ["connected"] }),
    rec({ timestamp: isoOffset(3, 11), mood: 8, energy: 7, emotions: ["creative"] }),
    rec({ timestamp: isoOffset(3, 18), mood: 6, energy: 6, emotions: ["productive"] }),
    rec({ timestamp: isoOffset(4, 12), mood: 4, energy: 3, emotions: ["dissociative"], note: "Switching often today — tiring." }),
    rec({ timestamp: isoOffset(4, 18), mood: 6, energy: 4, emotions: ["soft", "grateful"] }),
    rec({ timestamp: isoOffset(5, 11), mood: 8, energy: 7, emotions: ["bright", "silly"] }),
    rec({ timestamp: isoOffset(5, 18), mood: 6, energy: 5, emotions: ["settled"] }),
    rec({ timestamp: isoOffset(6, 10), mood: 7, energy: 6, emotions: ["organised"] }),
    rec({ timestamp: isoOffset(7, 14), mood: 5, energy: 4, emotions: ["irritated"] }),
    rec({ timestamp: isoOffset(7, 20), mood: 4, energy: 3, emotions: ["heavy"], note: "Therapy was hard today." }),
    rec({ timestamp: isoOffset(8, 12), mood: 6, energy: 5, emotions: ["steady"] }),
    rec({ timestamp: isoOffset(9, 11), mood: 7, energy: 7, emotions: ["happy"] }),
    rec({ timestamp: isoOffset(10, 17), mood: 5, energy: 4, emotions: ["restless"] }),
    rec({ timestamp: isoOffset(11, 19), mood: 4, energy: 3, emotions: ["lonely"] }),
    rec({ timestamp: isoOffset(12, 14), mood: 6, energy: 5, emotions: ["content"] }),
    rec({ timestamp: isoOffset(13, 9),  mood: 6, energy: 6, emotions: ["calm", "hopeful"] }),
    rec({ timestamp: isoOffset(16, 15), mood: 7, energy: 6, emotions: ["focused"] }),
    rec({ timestamp: isoOffset(20, 12), mood: 6, energy: 5, emotions: ["steady"] }),
    rec({ timestamp: isoOffset(24, 18), mood: 5, energy: 4, emotions: ["tired"] }),
  ];

  const activities = [
    rec({ timestamp: isoOffset(0, 8),  activity_name: "Morning tea",      duration_minutes: 20, color: "#fde68a" }),
    rec({ timestamp: isoOffset(0, 13), activity_name: "Reading",          duration_minutes: 45, color: "#0ea5e9" }),
    rec({ timestamp: isoOffset(0, 17), activity_name: "Tea + journaling", duration_minutes: 35, color: "#fde68a" }),
    rec({ timestamp: isoOffset(1, 10), activity_name: "Walk",             duration_minutes: 30, color: "#10b981" }),
    rec({ timestamp: isoOffset(1, 14), activity_name: "Creative time",    duration_minutes: 90, color: "#ec4899" }),
    rec({ timestamp: isoOffset(2, 9),  activity_name: "Yoga",             duration_minutes: 40, color: "#65a30d" }),
    rec({ timestamp: isoOffset(2, 19), activity_name: "Drawing",          duration_minutes: 75, color: "#f43f5e" }),
    rec({ timestamp: isoOffset(3, 11), activity_name: "Errands",          duration_minutes: 60, color: "#fbbf24" }),
    rec({ timestamp: isoOffset(3, 18), activity_name: "Movie night",      duration_minutes: 130, color: "#a855f7" }),
    rec({ timestamp: isoOffset(4, 16), activity_name: "Therapy session",  duration_minutes: 50, color: "#7c3aed" }),
    rec({ timestamp: isoOffset(5, 10), activity_name: "Park visit",       duration_minutes: 90, color: "#10b981" }),
    rec({ timestamp: isoOffset(6, 13), activity_name: "Computer time",    duration_minutes: 80, color: "#06b6d4" }),
    rec({ timestamp: isoOffset(7, 18), activity_name: "Therapy session",  duration_minutes: 50, color: "#7c3aed" }),
    rec({ timestamp: isoOffset(8, 19), activity_name: "Cooking",          duration_minutes: 50, color: "#65a30d" }),
    rec({ timestamp: isoOffset(9, 13), activity_name: "Cooking",          duration_minutes: 70, color: "#65a30d" }),
    rec({ timestamp: isoOffset(10, 19), activity_name: "Reading",         duration_minutes: 50, color: "#0ea5e9" }),
    rec({ timestamp: isoOffset(11, 16), activity_name: "Game night",      duration_minutes: 120, color: "#a855f7" }),
    rec({ timestamp: isoOffset(13, 10), activity_name: "Long walk",       duration_minutes: 80, color: "#10b981" }),
    rec({ timestamp: isoOffset(14, 9),  activity_name: "Yoga",            duration_minutes: 35, color: "#65a30d" }),
    rec({ timestamp: isoOffset(15, 14), activity_name: "Therapy session", duration_minutes: 50, color: "#7c3aed" }),
    rec({ timestamp: isoOffset(16, 11), activity_name: "Creative time",   duration_minutes: 100, color: "#ec4899" }),
    rec({ timestamp: isoOffset(17, 13), activity_name: "Park visit",      duration_minutes: 60, color: "#10b981" }),
    rec({ timestamp: isoOffset(18, 17), activity_name: "Computer time",   duration_minutes: 95, color: "#06b6d4" }),
    rec({ timestamp: isoOffset(19, 19), activity_name: "Reading",         duration_minutes: 45, color: "#0ea5e9" }),
    rec({ timestamp: isoOffset(20, 10), activity_name: "Errands",         duration_minutes: 90, color: "#fbbf24" }),
    rec({ timestamp: isoOffset(21, 8),  activity_name: "Morning tea",     duration_minutes: 25, color: "#fde68a" }),
    rec({ timestamp: isoOffset(22, 16), activity_name: "Therapy session", duration_minutes: 50, color: "#7c3aed" }),
    rec({ timestamp: isoOffset(24, 19), activity_name: "Cooking",         duration_minutes: 60, color: "#65a30d" }),
    rec({ timestamp: isoOffset(25, 13), activity_name: "Game night",      duration_minutes: 140, color: "#a855f7" }),
    rec({ timestamp: isoOffset(27, 10), activity_name: "Long walk",       duration_minutes: 95, color: "#10b981" }),
  ];

  // Journals: neutral / meta ("how this feature works") — attributed to the
  // pages that document them. Reads as onboarding notes, not a diary.
  const journals = [
    rec({ created_date: isoOffset(0, 21), title: "How journal entries work",
      content: "<p><b>Journal entries</b> are long-form, dated, and optionally attached to one alter. Use them for end-of-day reflection, therapy homework, or any prose you want kept. This one is tagged <code>tutorial</code> — tags filter the Journals page. The body supports HTML: <b>bold</b>, <i>italic</i>, lists, links.</p>",
      tags: ["tutorial"], alter_id: M.welcome.id }),
    rec({ created_date: isoOffset(1, 22), title: "Picking an edit mode",
      content: "<p>If you've never written HTML, stay in <b>Plain</b> — the mini-toolbar covers bold, headings, lists, links, images. Jump to <b>Simple</b> for a couple of positioned images, <b>Blocks</b> when order matters, and <b>Raw</b> when you know exactly what you want.</p>",
      tags: ["tutorial"], alter_id: M.toolbar.id }),
    rec({ created_date: isoOffset(2, 22), title: "A bio is a tiny webpage",
      content: "<p>The animated card on the Raw HTML showcase page is just a small CSS keyframe inside a <code>&lt;style&gt;</code> block. Keep the keyframes scoped to a wrapper class so one profile's animation doesn't leak into another's.</p>",
      tags: ["design"], alter_id: M.raw.id }),
    rec({ created_date: isoOffset(4, 22), title: "Whispers inside a journal",
      content: "<p>You can hide part of an entry behind a whisper bar with <code>/w @name a secret</code> — only that alter reveals it. Handy for a private note inside a shared journal.</p>",
      tags: ["tutorial"], alter_id: M.fields.id }),
    rec({ created_date: isoOffset(7, 21), title: "Therapy notes — pacing the front",
      content: "<p>Talked about handing off sooner when we've been primary a while. Landed on a soft rule and logged it here so it's easy to find again.</p>",
      tags: ["therapy"], alter_id: M.welcome.id }),
    rec({ created_date: isoOffset(10, 22), title: "What theme presets do",
      content: "<p>Binding a palette to an alter so the whole app recolours when they take primary is a small thing that adds up — you can feel who's holding the front without reading the chip.</p>",
      tags: ["design", "themes"], alter_id: M.theme.id }),
  ];

  const checkIns = [
    rec({ created_date: isoOffset(0, 8),  mood: 7, communication_quality: 8, system_harmony: 8, note: "Easy morning. Two of us around." }),
    rec({ created_date: isoOffset(2, 21), mood: 6, communication_quality: 7, system_harmony: 7, note: "System meeting — talked about the week ahead." }),
    rec({ created_date: isoOffset(3, 21), mood: 6, communication_quality: 7, system_harmony: 7 }),
    rec({ created_date: isoOffset(5, 21), mood: 7, communication_quality: 8, system_harmony: 8, note: "Steady week." }),
    rec({ created_date: isoOffset(7, 20), mood: 5, communication_quality: 5, system_harmony: 5, note: "A bit tense — sorted it out." }),
    rec({ created_date: isoOffset(10, 21), mood: 6, communication_quality: 7, system_harmony: 7 }),
    rec({ created_date: isoOffset(11, 9), mood: 7, communication_quality: 8, system_harmony: 8, note: "Felt like a good team this morning." }),
  ];

  const statusNotes = [
    rec({ timestamp: isoOffset(0, 9),  note: "Exploring the guided example." }),
    rec({ timestamp: isoOffset(0, 16), note: "Afternoon — reading through the pages." }),
    rec({ timestamp: isoOffset(0, 21), note: "Tip: press and hold on a fronting alter's card to see more." }),
    rec({ timestamp: isoOffset(1, 15), note: "On calls today." }),
    rec({ timestamp: isoOffset(2, 10), note: "Creative morning." }),
    rec({ timestamp: isoOffset(2, 14), note: "Switching a fair bit. Tiring but okay." }),
    rec({ timestamp: isoOffset(3, 9),  note: "New month, fresh start." }),
    rec({ timestamp: isoOffset(5, 17), note: "Kitchen smells like cinnamon." }),
    rec({ timestamp: isoOffset(7, 21), note: "Therapy day. Heavy but contained." }),
    rec({ timestamp: isoOffset(9, 11), note: "Rare full-system check-in." }),
    rec({ timestamp: isoOffset(13, 9), note: "Rested. Steady." }),
  ];

  // Relationships between the member pages — demonstrates the lineage /
  // relationship map with neutral labels.
  const relationships = [
    rec({ alter_id_a: M.welcome.id, alter_id_b: M.toolbar.id, relationship_type: "Co-host" }),
    rec({ alter_id_a: M.welcome.id, alter_id_b: M.fields.id,  relationship_type: "Hands off to" }),
    rec({ alter_id_a: M.fields.id,  alter_id_b: M.theme.id,   relationship_type: "Trusts deeply" }),
    rec({ alter_id_a: M.raw.id,     alter_id_b: M.avatars.id, relationship_type: "Collaborates with" }),
    rec({ alter_id_a: M.theme.id,   alter_id_b: M.avatars.id, relationship_type: "Sibling-like" }),
  ];

  // Lineage events among the member pages (neutral causes).
  const systemEvents = [
    rec({ type: "emergence", date: new Date(2016, 8, 1).toISOString(), year_only: true, source_alter_ids: [], result_alter_ids: [M.fields.id], cause: "Capacity", notes: "Stepped forward when the system needed a co-host." }),
    rec({ type: "split", date: new Date(2018, 0, 1).toISOString(), year_only: true, source_alter_ids: [M.welcome.id], result_alter_ids: [M.toolbar.id, M.raw.id], cause: "Capacity", notes: "Two arrived the same year." }),
    rec({ type: "split", date: new Date(2020, 0, 1).toISOString(), year_only: true, source_alter_ids: [M.fields.id], result_alter_ids: [M.theme.id], cause: "Creativity" }),
    rec({ type: "return", date: new Date(2024, 5, 1).toISOString(), year_only: true, source_alter_ids: [], result_alter_ids: [M.welcome.id], cause: "Re-grounding", notes: "Stepped back into a guiding role after a quiet period." }),
  ];

  // ── Symptoms (real preset catalogue, mirrors utils/symptomDefaults.js) ──
  const symptoms = [
    rec({ label: "Overall mood",        category: "symptom", type: "rating",  is_positive: true,  color: "#8B5CF6", order: 0, is_default: true }),
    rec({ label: "Energy level",        category: "symptom", type: "rating",  is_positive: true,  color: "#F59E0B", order: 1, is_default: true }),
    rec({ label: "Self esteem",         category: "symptom", type: "rating",  is_positive: true,  color: "#A78BFA", order: 2, is_default: true }),
    rec({ label: "Anxiety",             category: "symptom", type: "rating",  is_positive: false, color: "#EF4444", order: 3, is_default: true }),
    rec({ label: "Depression",          category: "symptom", type: "rating",  is_positive: false, color: "#6366F1", order: 4, is_default: true }),
    rec({ label: "Feeling overwhelmed", category: "symptom", type: "rating",  is_positive: false, color: "#DC2626", order: 5, is_default: true }),
    rec({ label: "Trouble sleeping",    category: "symptom", type: "rating",  is_positive: false, color: "#1D4ED8", order: 6, is_default: true }),
    rec({ label: "Triggered switch",    category: "symptom", type: "boolean", is_positive: false, color: "#B45309", order: 7, is_default: true }),
    rec({ label: "Random switch",       category: "symptom", type: "boolean", is_positive: false, color: "#92400E", order: 8, is_default: true }),
    rec({ label: "Used coping skills",  category: "habit",   type: "boolean", is_positive: true,  color: "#06B6D4", order: 0, is_default: true }),
    rec({ label: "Attended therapy",    category: "habit",   type: "boolean", is_positive: true,  color: "#0891B2", order: 1, is_default: true }),
    rec({ label: "Self-care",           category: "habit",   type: "boolean", is_positive: true,  color: "#4ADE80", order: 2, is_default: true }),
  ];
  const symptomSessions = [
    rec({ symptom_id: symptoms[3].id, start_time: isoOffset(2, 14), end_time: isoOffset(2, 16), severity: 5 }),
    rec({ symptom_id: symptoms[5].id, start_time: isoOffset(7, 10), end_time: isoOffset(7, 12), severity: 6 }),
  ];
  const symptomCheckIns = [
    rec({ symptom_id: symptoms[0].id, timestamp: isoOffset(2, 14), severity: 7 }),
    rec({ symptom_id: symptoms[3].id, timestamp: isoOffset(2, 17), severity: 5 }),
    rec({ symptom_id: symptoms[5].id, timestamp: isoOffset(4, 11), severity: 6 }),
    rec({ symptom_id: symptoms[3].id, timestamp: isoOffset(7, 10), severity: 5 }),
    rec({ symptom_id: symptoms[6].id, timestamp: isoOffset(8, 22), severity: 4 }),
    rec({ symptom_id: symptoms[0].id, timestamp: isoOffset(11, 14), severity: 8 }),
  ];

  const settings = rec({
    ...pages.settings,
    is_anonymized: false,
  });

  // ── Bulletin board ─────────────────────────────────────────────────────
  // Worked examples of every bulletin feature, authored by the member pages.
  const bulletins = [
    rec({
      author_alter_id: M.welcome.id, author_alter_ids: [M.welcome.id],
      content: "📌 <b>Bulletin Board.</b> System-wide feed. Anyone can post. Type @ then an alter name to mention them. Pin a post to lock it to the top. React with emoji and tap a reaction's count to see who reacted. Comment threads collapse below each post.",
      mentioned_alter_ids: [], is_pinned: true,
      reactions: { "📌": [M.toolbar.id, M.fields.id, M.theme.id, M.raw.id, M.avatars.id] },
      created_date: isoOffset(0, 19),
    }),
    rec({
      author_alter_id: M.fields.id, author_alter_ids: [M.fields.id],
      content: "<b>Mention example.</b> @Profile · mini toolbar — this post @mentions another page; they'd get a notification and a \"you were mentioned\" banner.",
      mentioned_alter_ids: [M.toolbar.id], is_pinned: false,
      reactions: { "👍": [M.toolbar.id, M.welcome.id] },
      created_date: isoOffset(1, 11),
    }),
    rec({
      author_alter_id: M.theme.id, author_alter_ids: [M.theme.id],
      content: "<b>Reactions example.</b> Tap the smiley to react. Multiple alters can pick the same emoji. Tap an emoji's count to see exactly who reacted.",
      mentioned_alter_ids: [], is_pinned: false,
      reactions: { "💜": [M.fields.id, M.avatars.id, M.welcome.id], "✨": [M.raw.id, M.toolbar.id] },
      created_date: isoOffset(2, 14, 30),
    }),
    rec({
      author_alter_id: M.toolbar.id, author_alter_ids: [M.toolbar.id, M.fields.id],
      content: "<b>Co-author example.</b> A bulletin can be authored by more than one alter at once — the avatar list at compose time lets you tap anyone fronting.",
      mentioned_alter_ids: [], is_pinned: false,
      reactions: { "👥": [M.welcome.id, M.raw.id] },
      created_date: isoOffset(3, 12),
    }),
    rec({
      author_alter_id: M.raw.id, author_alter_ids: [M.raw.id],
      content: "<b>Long-form bulletin.</b> Bulletins support basic HTML — <b>bold</b>, <i>italic</i>, lists, links, paragraphs. Compare with Journal entries (long-form, alter-attached) and Status Notes (short, system-wide, immutable).",
      mentioned_alter_ids: [], is_pinned: false,
      reactions: { "📝": [M.fields.id, M.toolbar.id] },
      created_date: isoOffset(4, 14),
    }),
    rec({
      author_alter_id: M.avatars.id, author_alter_ids: [M.avatars.id],
      content: "<b>Casual example.</b> bulletins don't have to be Important.™ this is just a note that the kitchen smells like cinnamon and everyone's welcome to come up 🌙",
      mentioned_alter_ids: [], is_pinned: false,
      reactions: { "🥰": [M.fields.id, M.welcome.id, M.theme.id], "🌙": [M.toolbar.id] },
      created_date: isoOffset(5, 19),
    }),
    rec({
      author_alter_id: M.fields.id, author_alter_ids: [M.fields.id],
      content: "<b>Comments example.</b> Tap the speech bubble to expand the thread under any bulletin. Comments support @mentions too.",
      mentioned_alter_ids: [], is_pinned: false, reactions: {},
      created_date: isoOffset(6, 16),
    }),
    rec({
      author_alter_id: M.raw.id, author_alter_ids: [M.raw.id],
      content: "<b>Polls example.</b> Bulletins can carry a poll — see the next post. Members vote by tapping; everyone can see who voted for what once they've cast their own vote.",
      mentioned_alter_ids: [], is_pinned: false, reactions: {},
      created_date: isoOffset(2, 20),
    }),
  ];

  const bulletinComments = [
    rec({ bulletin_id: bulletins[0].id, author_alter_id: M.fields.id,  content: "Tip: comments support the same basic HTML formatting as posts.", created_date: isoOffset(0, 19, 30) }),
    rec({ bulletin_id: bulletins[0].id, author_alter_id: M.toolbar.id, content: "Tip 2: tap an emoji count and you see the reactor list for that emoji.", created_date: isoOffset(0, 20) }),
    rec({ bulletin_id: bulletins[0].id, author_alter_id: M.avatars.id, content: "Tip 3: long-press a bulletin to open the action menu (pin, delete, share, copy link).", created_date: isoOffset(0, 20, 30) }),
    rec({ bulletin_id: bulletins[2].id, author_alter_id: M.fields.id,  content: "Threads collapse after the first few replies and expand on tap.", created_date: isoOffset(2, 15) }),
    rec({ bulletin_id: bulletins[2].id, author_alter_id: M.raw.id,     content: "And nested replies indent. Try replying to this comment.", created_date: isoOffset(2, 15, 30) }),
    rec({ bulletin_id: bulletins[3].id, author_alter_id: M.welcome.id, content: "Co-authored posts show every author's avatar in the row.", created_date: isoOffset(3, 13) }),
    rec({ bulletin_id: bulletins[5].id, author_alter_id: M.fields.id,  content: "Joining you for the cinnamon. Bringing a book.", created_date: isoOffset(5, 19, 20) }),
  ];

  const polls = [
    rec({
      question: "Which bio mode should we use for the new profile?",
      options: [
        { label: "Plain — easiest to start", votes: [M.welcome.id, M.toolbar.id] },
        { label: "Simple — text + images",   votes: [M.fields.id] },
        { label: "Blocks — full layout",     votes: [M.avatars.id, M.theme.id] },
        { label: "Raw — go wild with CSS",   votes: [M.raw.id] },
      ],
      multi_choice: false, author_alter_id: M.fields.id, created_date: isoOffset(2, 21),
    }),
    rec({
      question: "Friday night plan?",
      options: [
        { label: "Game night",  votes: [M.raw.id, M.theme.id, M.avatars.id] },
        { label: "Movie night", votes: [M.fields.id, M.welcome.id] },
        { label: "Early bed",   votes: [M.toolbar.id] },
      ],
      multi_choice: false, author_alter_id: M.welcome.id, created_date: isoOffset(1, 18),
    }),
    rec({
      question: "Skills to focus on this week",
      options: [
        { label: "Grounding",    votes: [M.toolbar.id, M.avatars.id, M.welcome.id] },
        { label: "Journaling",   votes: [M.fields.id, M.theme.id] },
        { label: "Reaching out", votes: [M.raw.id] },
        { label: "Movement",     votes: [M.avatars.id, M.toolbar.id] },
      ],
      multi_choice: true, author_alter_id: M.toolbar.id, created_date: isoOffset(6, 9),
    }),
  ];

  // ── Tasks ──────────────────────────────────────────────────────────────
  const tasks = [
    rec({ title: "Refill prescriptions", completed: false, priority: "high", due_date: isoOffset(-2, 17), assigned_alter_ids: [M.welcome.id], is_urgent: true, pinned_to_dashboard: true, description: "Pharmacy down the block." }),
    rec({ title: "Call to reschedule Thursday", completed: false, priority: "high", due_date: isoOffset(-1, 12), assigned_alter_ids: [M.welcome.id], is_urgent: true }),
    rec({ title: "Draft a new profile in Blocks mode", completed: false, priority: "low", scheduled_at: isoOffset(-1, 20), assigned_alter_ids: [M.avatars.id] }),
    rec({ title: "Email therapist", completed: true, priority: "medium", completed_date: isoOffset(1, 11), assigned_alter_ids: [M.welcome.id] }),
    rec({ title: "Plan weekend hike", completed: false, priority: "low", due_date: isoOffset(-4, 9), assigned_alter_ids: [M.avatars.id] }),
    rec({ title: "Call a friend back", completed: false, priority: "medium" }),
    rec({ title: "Buy groceries", completed: true, priority: "medium", completed_date: isoOffset(2, 18), assigned_alter_ids: [M.fields.id] }),
    rec({ title: "Pick a theme preset for the rotation", completed: false, priority: "low", assigned_alter_ids: [M.theme.id] }),
    rec({ title: "Write a bulletin about the meeting", completed: true, priority: "medium", completed_date: isoOffset(2, 11), assigned_alter_ids: [M.fields.id] }),
    rec({ title: "Tidy the inner-world layout", completed: false, priority: "low", assigned_alter_ids: [M.raw.id] }),
    rec({ title: "Schedule next therapy appointment", completed: false, priority: "high", due_date: isoOffset(-3, 16), assigned_alter_ids: [M.welcome.id] }),
    rec({ title: "Replace bedroom lightbulb", completed: true, priority: "low", completed_date: isoOffset(3, 19) }),
  ];

  const dailyTaskTemplates = [
    rec({ title: "Morning meds", description: "On an empty stomach.", frequency: "daily", mode: "MANUAL", points: 3, is_active: true, sort_order: 0 }),
    rec({ title: "Brush teeth", frequency: "daily", mode: "MANUAL", points: 1, is_active: true, sort_order: 1 }),
    rec({ title: "Drink water", description: "Aim for 6 glasses.", frequency: "daily", mode: "MANUAL", points: 2, is_active: true, sort_order: 2 }),
    rec({ title: "Evening journal", description: "Five minutes — even one line counts.", frequency: "daily", mode: "MANUAL", points: 2, is_active: true, sort_order: 3 }),
    rec({ title: "Read 15 minutes", frequency: "daily", mode: "MANUAL", points: 2, is_active: true, sort_order: 4 }),
    rec({ title: "Stretch", frequency: "daily", mode: "MANUAL", points: 1, is_active: true, sort_order: 5 }),
    rec({ title: "System meeting", description: "Sunday roll-call.", frequency: "weekly", mode: "MANUAL", points: 5, is_active: true, sort_order: 0 }),
    rec({ title: "Laundry", frequency: "weekly", mode: "MANUAL", points: 4, is_active: true, sort_order: 1 }),
    rec({ title: "Long walk", frequency: "weekly", mode: "MANUAL", points: 4, is_active: true, sort_order: 2 }),
    rec({ title: "Plan the week", frequency: "weekly", mode: "MANUAL", points: 3, is_active: true, sort_order: 3 }),
  ];

  function sleepEntry(daysAgo, bedHour, bedMin, wakeHour, wakeMin, quality, extra = {}) {
    const wakeDate = new Date(Date.now() - daysAgo * DAY);
    wakeDate.setHours(wakeHour, wakeMin, 0, 0);
    const bedDate = new Date(wakeDate);
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
    sleepEntry(0, 23, 0, 7, 30, 8, { notes: "Steady night." }),
    sleepEntry(1, 23, 30, 7, 0, 6),
    sleepEntry(2, 22, 45, 6, 50, 9, { notes: "Out like a light." }),
    sleepEntry(3, 0, 15, 7, 45, 5, { notes: "Stayed up late.", is_interrupted: true, interruption_count: 2 }),
    sleepEntry(4, 22, 30, 6, 30, 9, { dreamed: true, notes: "Vivid dream about a garden." }),
    sleepEntry(5, 23, 15, 7, 15, 7),
    sleepEntry(6, 22, 0, 6, 45, 8),
    sleepEntry(7, 1, 0, 8, 30, 3, { notes: "Therapy night — slept badly.", had_nightmare: true }),
    sleepEntry(8, 23, 30, 7, 30, 7),
    sleepEntry(9, 22, 30, 7, 0, 9),
    sleepEntry(10, 23, 0, 7, 15, 8),
    sleepEntry(11, 23, 30, 7, 30, 7),
    sleepEntry(13, 22, 45, 6, 50, 8, { dreamed: true }),
    sleepEntry(14, 23, 15, 7, 30, 7),
  ];

  const reminders = [
    rec({ title: "Morning meds", body: "On an empty stomach.", category: "meds", trigger_type: "scheduled", trigger_config: { times: ["08:00"], days: [0, 1, 2, 3, 4, 5, 6] }, delivery_channels: ["in_app", "push"], inline_actions: [{ label: "Mark taken", action_type: "dismiss" }], is_active: true }),
    rec({ title: "Evening journal", body: "Five minutes — even one line counts.", category: "habit", trigger_type: "scheduled", trigger_config: { times: ["21:00"], days: [0, 1, 2, 3, 4, 5, 6] }, delivery_channels: ["in_app", "push"], inline_actions: [{ label: "Open journal", action_type: "open_journal" }], is_active: true }),
    rec({ title: "Therapy session", body: "Wednesday afternoon — check the safety plan beforehand.", category: "appointment", trigger_type: "scheduled", trigger_config: { times: ["16:00"], days: [3] }, delivery_channels: ["in_app", "push"], inline_actions: [{ label: "Open safety plan", action_type: "open_route", payload: { path: "/safety-plan" } }], is_active: true }),
    rec({ title: "Drink water", body: "A couple of glasses every few hours.", category: "habit", trigger_type: "interval", trigger_config: { minutes: 120, active_window: { start: "10:00", end: "20:00" } }, delivery_channels: ["in_app"], is_active: true }),
    rec({ title: "Weekly system meeting", body: "Sunday 7pm — quick roll-call + week ahead.", category: "check_in", trigger_type: "scheduled", trigger_config: { times: ["19:00"], days: [0] }, delivery_channels: ["in_app", "push"], inline_actions: [{ label: "Start meeting", action_type: "open_route", payload: { path: "/system-checkin" } }], is_active: true }),
    rec({ title: "Check in after a switch", body: "Quick grounding question — what's needed right now?", category: "grounding", trigger_type: "contextual", trigger_config: { on: "alter_fronts", delay_minutes: 5 }, delivery_channels: ["in_app"], inline_actions: [{ label: "Grounding exercise", action_type: "open_grounding" }, { label: "Quick check-in", action_type: "open_check_in" }], is_active: true }),
    rec({ title: "No front update for a while", body: "It's been 6 hours — anyone want to log who's around?", category: "check_in", trigger_type: "contextual", trigger_config: { on: "no_front_update", minutes: 360 }, delivery_channels: ["in_app"], inline_actions: [{ label: "Set fronters", action_type: "open_set_front" }], is_active: true }),
  ];

  const customEmotions = [
    rec({ label: "welcoming", color: "#38BDF8" }),
    rec({ label: "curious", color: "#0EA5E9" }),
    rec({ label: "creative", color: "#EC4899" }),
    rec({ label: "organised", color: "#DB2777" }),
    rec({ label: "soft", color: "#F59E0B" }),
    rec({ label: "scattered", color: "#94A3B8" }),
    rec({ label: "dissociative", color: "#A78BFA" }),
    rec({ label: "settled", color: "#10B981" }),
    rec({ label: "thoughtful", color: "#6366F1" }),
    rec({ label: "bright", color: "#FACC15" }),
    rec({ label: "heavy", color: "#475569" }),
  ];

  const triggerTypes = [
    rec({ label: "Time pressure", color: "#EF4444" }),
    rec({ label: "Loud rooms", color: "#F97316" }),
    rec({ label: "Late nights", color: "#06B6D4" }),
    rec({ label: "Family-of-origin", color: "#7C3AED" }),
    rec({ label: "Unexpected change", color: "#EAB308" }),
  ];

  const activityCategories = [
    rec({ name: "Creative", color: "#EC4899", parent_category_id: null }),
    rec({ name: "Movement", color: "#10B981", parent_category_id: null }),
    rec({ name: "Reading", color: "#0EA5E9", parent_category_id: null }),
    rec({ name: "Cooking", color: "#F59E0B", parent_category_id: null }),
    rec({ name: "Therapy", color: "#7C3AED", parent_category_id: null }),
    rec({ name: "Social", color: "#A855F7", parent_category_id: null }),
    rec({ name: "Self-care", color: "#22C55E", parent_category_id: null }),
    rec({ name: "Computer time", color: "#06B6D4", parent_category_id: null }),
  ];

  const activityGoals = [
    rec({ activity_name: "Walk", target_minutes_per_week: 90 }),
    rec({ activity_name: "Creative time", target_minutes_per_week: 240 }),
    rec({ activity_name: "Reading", target_minutes_per_week: 180 }),
    rec({ activity_name: "Self-care", target_minutes_per_week: 120 }),
  ];

  const groundingTechniques = [
    rec({ name: "5-4-3-2-1", category: "sensory", description: "Name 5 things you can see, 4 you can hear, 3 you can touch, 2 you can smell, 1 you can taste.", steps: ["5 see", "4 hear", "3 touch", "2 smell", "1 taste"], duration_seconds: 180, is_default: true, is_archived: false, order: 0 }),
    rec({ name: "Box breathing", category: "breath", description: "Breathe in 4, hold 4, out 4, hold 4. Loop until calm.", steps: ["In 4", "Hold 4", "Out 4", "Hold 4"], duration_seconds: 240, is_default: true, is_archived: false, order: 1 }),
    rec({ name: "Cold water on hands", category: "sensory", description: "Run cold water over your wrists or splash on your face. Activates the dive reflex.", steps: ["Cold water", "Hands or face", "30 seconds"], duration_seconds: 90, is_default: true, is_archived: false, order: 2 }),
    rec({ name: "Tea ritual", category: "comfort", description: "Boil water, choose a tea, breathe in the steam for one full minute before sipping.", steps: ["Boil water", "Choose tea", "Breathe in the steam", "Sip slowly"], duration_seconds: 360, is_default: false, is_archived: false, order: 3 }),
  ];
  const groundingPreferences = [
    rec({ alter_id: M.welcome.id, preferred_technique_ids: [groundingTechniques[0].id, groundingTechniques[1].id] }),
    rec({ alter_id: M.avatars.id, preferred_technique_ids: [groundingTechniques[3].id] }),
    rec({ alter_id: M.raw.id, preferred_technique_ids: [groundingTechniques[2].id, groundingTechniques[1].id] }),
  ];

  const innerWorldLocations = [
    rec({ name: "The Commons", description: "The central meeting space — where the system gathers. List the alters who attend as occupants so picking a meeting is one tap.", color: "#a78bfa", x: 200, y: 160, occupant_alter_ids: [M.welcome.id, M.toolbar.id, M.fields.id, M.theme.id, M.raw.id, M.avatars.id] }),
    rec({ name: "The Studio", description: "Where design and creative work tends to happen.", color: "#06b6d4", x: 330, y: 80, occupant_alter_ids: [M.raw.id, M.avatars.id] }),
    rec({ name: "The Hearth", description: "The warmest corner — candles, tea, quiet.", color: "#f59e0b", x: 340, y: 240, occupant_alter_ids: [M.theme.id] }),
    rec({ name: "The Library", description: "Somewhere for quiet, study, or solo work.", color: "#0ea5e9", x: 220, y: 50, occupant_alter_ids: [M.fields.id] }),
    rec({ name: "The Threshold", description: "A liminal space at the edge — where new arrivals find their footing.", color: "#38bdf8", x: 200, y: 290, occupant_alter_ids: [M.welcome.id] }),
    rec({ name: "Empty Field (no occupants)", description: "A location can exist without occupants — useful as a marker for places not currently in use.", color: "#64748b", x: 380, y: 160, occupant_alter_ids: [] }),
  ];

  const alterMessages = [
    rec({ alter_id: M.welcome.id, author_alter_id: M.fields.id, content: "New here? Tap into each profile — every one explains a different part of the app.", created_date: isoOffset(1, 10) }),
    rec({ alter_id: M.raw.id, author_alter_id: M.fields.id, content: "The gradient on your card is lovely. Mind writing a journal entry about how it works?", created_date: isoOffset(3, 14) }),
    rec({ alter_id: M.raw.id, author_alter_id: M.raw.id, content: "Done — filed under the 'design' tag.", created_date: isoOffset(3, 23) }),
    rec({ alter_id: M.theme.id, author_alter_id: M.welcome.id, content: "Love watching the whole app turn warm when you take primary.", created_date: isoOffset(5, 19) }),
  ];

  const alterNotes = [
    rec({ alter_id: M.welcome.id, content: "This is an example profile — feel free to imagine it's yours.", created_date: isoOffset(20, 12) }),
    rec({ alter_id: M.fields.id, content: "All system fields filled in here; per-alter fields show things only this profile cares about.", created_date: isoOffset(15, 18) }),
    rec({ alter_id: M.raw.id, content: "If you fork the Raw HTML, keep @keyframes inside the bio — global stylesheets won't apply.", created_date: isoOffset(8, 22) }),
  ];

  // ── Diary cards / progress / support journals ──────────────────────────
  const diaryTemplates = [
    rec({ name: "Standard daily", is_default: true, fields: [
      { id: "mood", label: "Mood", type: "rating", scale: 10 },
      { id: "anxiety", label: "Anxiety", type: "rating", scale: 10 },
      { id: "skills_used", label: "Skills used", type: "checkbox-list", options: ["grounding", "breathwork", "journaling", "reaching out", "movement"] },
      { id: "what", label: "What happened", type: "longtext" },
    ] }),
  ];
  const diaryCards = [
    rec({ date: new Date(Date.now() - 0 * DAY).toISOString().slice(0, 10), template_id: diaryTemplates[0].id, fields: { mood: 7, anxiety: 3, skills_used: ["grounding", "journaling"] }, notes: { what: "Good day exploring." } }),
    rec({ date: new Date(Date.now() - 1 * DAY).toISOString().slice(0, 10), template_id: diaryTemplates[0].id, fields: { mood: 5, anxiety: 6, skills_used: ["breathwork"] }, notes: { what: "Lots of switching. Tiring but not unsafe." } }),
    rec({ date: new Date(Date.now() - 2 * DAY).toISOString().slice(0, 10), template_id: diaryTemplates[0].id, fields: { mood: 6, anxiety: 4, skills_used: ["movement"] }, notes: { what: "Steady." } }),
    rec({ date: new Date(Date.now() - 4 * DAY).toISOString().slice(0, 10), template_id: diaryTemplates[0].id, fields: { mood: 3, anxiety: 8, skills_used: ["grounding", "reaching out"] }, notes: { what: "Hard day. Handed off for the evening." } }),
    rec({ date: new Date(Date.now() - 6 * DAY).toISOString().slice(0, 10), template_id: diaryTemplates[0].id, fields: { mood: 6, anxiety: 4, skills_used: ["journaling", "movement"] }, notes: { what: "Therapy." } }),
    rec({ date: new Date(Date.now() - 8 * DAY).toISOString().slice(0, 10), template_id: diaryTemplates[0].id, fields: { mood: 7, anxiety: 3, skills_used: ["grounding", "journaling", "movement"] }, notes: { what: "Good handoffs all day." } }),
  ];
  const dailyProgress = [
    rec({ date: new Date(Date.now() - 0 * DAY).toISOString().slice(0, 10), tasks_completed: 2, tasks_total: 5 }),
    rec({ date: new Date(Date.now() - 1 * DAY).toISOString().slice(0, 10), tasks_completed: 4, tasks_total: 4 }),
    rec({ date: new Date(Date.now() - 2 * DAY).toISOString().slice(0, 10), tasks_completed: 3, tasks_total: 3 }),
    rec({ date: new Date(Date.now() - 3 * DAY).toISOString().slice(0, 10), tasks_completed: 2, tasks_total: 4 }),
    rec({ date: new Date(Date.now() - 5 * DAY).toISOString().slice(0, 10), tasks_completed: 4, tasks_total: 5 }),
  ];

  const supportJournals = [
    rec({ title: "Being asked before a change", topic: "managers", content: "Someone wanted to redo the inner-world layout and asked first. Felt good to be consulted.", created_date: isoOffset(4, 22), tags: ["managers"] }),
    rec({ title: "After the scroll spiral", topic: "firefighters", content: "Three hours gone to scrolling. Not as a failure — as information.", created_date: isoOffset(6, 23), tags: ["firefighters"] }),
    rec({ title: "Noticing self-energy", topic: "self-energy", content: "A few minutes at the meeting where nobody was forward and yet it felt warm and unhurried.", created_date: isoOffset(11, 21), tags: ["self-energy"] }),
  ];
  const learningProgress = [
    rec({ topic: "managers", progress: 0.6, last_visited: isoOffset(4, 22) }),
    rec({ topic: "firefighters", progress: 0.3, last_visited: isoOffset(6, 23) }),
    rec({ topic: "self-energy", progress: 0.5, last_visited: isoOffset(11, 21) }),
  ];

  const reportTemplates = [
    rec({ name: "Weekly clinical summary", description: "For the Wednesday session — last 7 days of mood, dissociation, switches, key journal excerpts.", date_range_days: 7, sections: ["mood_chart", "dissociation_chart", "switch_count", "journal_excerpts", "status_notes"], default: true }),
    rec({ name: "Monthly overview", description: "Bigger picture — fronting time per alter, symptom patterns.", date_range_days: 30, sections: ["fronting_summary", "symptom_chart", "activities_summary", "relationships"], default: false }),
  ];
  const reportExports = [
    rec({ template_id: reportTemplates[0].id, exported_at: isoOffset(7, 16), format: "pdf", filename: "symphony-weekly.pdf" }),
    rec({ template_id: reportTemplates[0].id, exported_at: isoOffset(0, 17), format: "json", filename: "symphony-weekly.json" }),
  ];

  const mentionLogs = [
    rec({ mentioned_alter_id: M.toolbar.id, source_type: "bulletin", source_id: bulletins[1].id, source_label: "Bulletin Board", navigate_path: `/bulletin/${bulletins[1].id}`, read: false, created_date: isoOffset(1, 11) }),
  ];

  const locations = [
    rec({ timestamp: isoOffset(0, 8), name: "Home", category: "home", latitude: 40.7128, longitude: -74.0060, source: "gps", notes: "Morning coffee." }),
    rec({ timestamp: isoOffset(0, 14), name: "Co-working space", category: "work", latitude: 40.7150, longitude: -74.0035, source: "gps" }),
    rec({ timestamp: isoOffset(1, 10), name: "Riverside Park", category: "outdoor", latitude: 40.8000, longitude: -73.9728, source: "gps", notes: "Walk." }),
    rec({ timestamp: isoOffset(2, 16), name: "Therapist", category: "medical", source: "manual", notes: "Wednesday session." }),
    rec({ timestamp: isoOffset(3, 19), name: "Friend's apartment", category: "social", source: "manual", notes: "Movie night." }),
    rec({ timestamp: isoOffset(5, 11), name: "Farmers market", category: "outdoor", source: "manual" }),
    rec({ timestamp: isoOffset(7, 16), name: "Therapist", category: "medical", source: "manual" }),
    rec({ timestamp: isoOffset(9, 13), name: "Library", category: "outdoor", source: "manual" }),
    rec({ timestamp: isoOffset(11, 17), name: "Game café", category: "social", source: "manual", notes: "Game night." }),
  ];

  const relationshipTypes = [
    rec({ label: "Co-host", is_default: true, color: "#7c3aed" }),
    rec({ label: "Hands off to", is_default: false, color: "#38bdf8" }),
    rec({ label: "Trusts deeply", is_default: false, color: "#06b6d4" }),
    rec({ label: "Collaborates with", is_default: false, color: "#ec4899" }),
    rec({ label: "Sibling-like", is_default: false, color: "#f59e0b" }),
  ];

  // ── Contacts (external people) ─────────────────────────────────────────
  const contactCategories = [
    rec({ name: "Support", color: "#10b981", order: 0 }),
    rec({ name: "Friends", color: "#3b82f6", order: 1 }),
  ];
  const ccfHowMet = "ccf-howmet";
  const ccfBoundaries = "ccf-boundaries";
  const contactCustomFields = [
    rec({ id: ccfHowMet, name: "How we met", order: 0, type: "text" }),
    rec({ id: ccfBoundaries, name: "Boundaries", order: 1, type: "longtext" }),
  ];
  const contacts = [
    rec({ name: "Dr. Reyes", nickname: "", color: "#10b981", safety: "safe", awareness: "yes", category_id: contactCategories[0].id, is_emergency_support: true, support_priority: 0, contact_methods: [{ type: "phone", label: "Office", value: "555-0142" }], custom_fields: { [ccfHowMet]: "Referred by the clinic in 2023.", [ccfBoundaries]: "Wednesdays only; email between sessions is fine." } }),
    rec({ name: "Sam", nickname: "Sammy", color: "#3b82f6", safety: "safe", awareness: "yes", category_id: contactCategories[1].id, is_emergency_support: true, support_priority: 1, contact_methods: [{ type: "sms", label: "Mobile", value: "555-0199" }], custom_fields: { [ccfHowMet]: "Old friend from school." } }),
    rec({ name: "Jordan", nickname: "", color: "#8b5cf6", safety: "safe", awareness: "partial", category_id: contactCategories[1].id, contact_methods: [{ type: "instagram", value: "@jordanmakes" }] }),
    rec({ name: "Alex", nickname: "", color: "#f59e0b", safety: "caution", awareness: "no", contact_methods: [] , custom_fields: { [ccfBoundaries]: "Keep it light; don't over-share." } }),
    rec({ name: "The landlord", nickname: "", color: "#94a3b8", safety: "unknown", awareness: "no", contact_methods: [{ type: "email", value: "manager@example.com" }] }),
    rec({ name: "Riley", nickname: "", color: "#ef4444", safety: "unsafe", awareness: "no", contact_methods: [] }),
  ];
  const contactEncounters = [
    rec({ contact_id: contacts[1].id, start_time: new Date(Date.now() - 45 * 60000).toISOString(), end_time: null, is_active: true, kind: "session", note: "Coffee." }),
    rec({ contact_id: contacts[0].id, start_time: isoOffset(2, 16), end_time: isoOffset(2, 17), is_active: false, kind: "visit", note: "Therapy session." }),
    rec({ contact_id: contacts[2].id, start_time: isoOffset(3, 19), end_time: isoOffset(3, 22), is_active: false, kind: "session", note: "Movie night." }),
    rec({ contact_id: contacts[1].id, start_time: isoOffset(9, 13), end_time: isoOffset(9, 15), is_active: false, kind: "session" }),
  ];
  const contactNotes = [
    rec({ contact_id: contacts[0].id, content: "Asked us to bring the diary card to the next session.", timestamp: isoOffset(2, 17) }),
    rec({ contact_id: contacts[1].id, content: "Knows about the system and is easy about it. Safe person.", timestamp: isoOffset(9, 15) }),
    rec({ contact_id: contacts[3].id, content: "Doesn't know — keep boundaries. Fine in groups, tiring one-on-one.", timestamp: isoOffset(11, 10) }),
  ];
  const contactRelationshipTypes = [
    rec({ label: "Therapist", color: "#10b981", order: 0, is_default: true }),
    rec({ label: "Close friend", color: "#8b5cf6", order: 1, is_default: true }),
    rec({ label: "Friend", color: "#3b82f6", order: 2, is_default: true }),
    rec({ label: "Family", color: "#f59e0b", order: 3, is_default: true }),
    rec({ label: "Acquaintance", color: "#9ca3af", order: 4, is_default: true }),
  ];

  // ── System chat ────────────────────────────────────────────────────────
  const chatCategories = [
    rec({ name: "Channels", sort_order: 0, collapsed: false }),
  ];
  const chatChannels = [
    rec({ name: "general", description: "Where everyone talks.", sort_order: 0, is_archived: false, category_id: chatCategories[0].id }),
    rec({ name: "planning", description: "Week ahead, appointments, chores.", sort_order: 1, is_archived: false, category_id: chatCategories[0].id }),
    rec({ name: "design", description: "Profiles, themes, the inner world.", sort_order: 2, is_archived: false, category_id: chatCategories[0].id }),
  ];
  const msg = (channel, author, content, daysAgo, hour, extra = {}) => rec({
    channel_id: channel.id, author_alter_id: author.id, author_alter_ids: [author.id],
    content, timestamp: isoOffset(daysAgo, hour, 0), edited_at: null, deleted_at: null,
    reply_to_id: null, mentioned_alter_ids: [], is_whisper: false, whisper_to_ids: [],
    reactions: {}, thread_parent_id: null, is_pinned: false, ...extra,
  });
  const gen = chatChannels[0], plan = chatChannels[1], des = chatChannels[2];
  const chatMessages = [
    msg(gen, M.welcome, "morning everyone ☀️", 0, 8, { is_pinned: true, reactions: { "☀️": [M.fields.id, M.theme.id] } }),
    msg(gen, M.fields, "morning! who's got the front today?", 0, 8),
    msg(gen, M.welcome, "me for now, theme's co-fronting", 0, 8),
    msg(gen, M.avatars, "the kitchen smells amazing btw", 0, 9, { reactions: { "🥰": [M.welcome.id, M.fields.id] } }),
    msg(plan, M.fields, "therapy wed at 4 — adding a reminder", 1, 11),
    msg(plan, M.welcome, "thanks. i'll prep the diary card", 1, 11),
    msg(plan, M.toolbar, "laundry + groceries this weekend?", 2, 15),
    msg(des, M.raw, "redid the raw-html card, added a pulsing dot", 3, 14, { reactions: { "✨": [M.theme.id, M.avatars.id, M.fields.id] } }),
    msg(des, M.theme, "looks great. want to try a matching theme preset?", 3, 14),
    msg(des, M.raw, "already on it", 3, 15),
    msg(gen, M.fields, "psst — a quiet note, just for you", 4, 20, { is_whisper: true, whisper_to_ids: [M.welcome.id] }),
    msg(gen, M.welcome, "reply to keep threads tidy", 5, 10, { reply_to_id: null }),
  ];

  // ── Presences (not-yet-alters) ─────────────────────────────────────────
  const presences = [
    rec({ label: "Someone quiet", vibe: "watchful, gentle", color: "#c084fc", emoji: "🌙", notes: "Shows up in the evenings. No name yet.", associated_alter_ids: [], relationship_type: "", timestamp: isoOffset(3, 21), sightings: [isoOffset(3, 21), isoOffset(6, 22), isoOffset(10, 20)], resolved_alter_id: "" }),
    rec({ label: "A warm hum", vibe: "steady, protective", color: "#f59e0b", emoji: "🔥", notes: "More a feeling than a voice so far.", associated_alter_ids: [M.theme.id], relationship_type: "", timestamp: isoOffset(8, 15), sightings: [isoOffset(8, 15), isoOffset(12, 16)], resolved_alter_id: "" }),
  ];

  // ── Image assets (tiny inline SVGs so the library isn't empty) ─────────
  const svgAsset = (hex) => `data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='120'%20height='120'%3E%3Crect%20width='120'%20height='120'%20fill='%23${hex}'/%3E%3Ccircle%20cx='60'%20cy='60'%20r='34'%20fill='white'%20fill-opacity='0.35'/%3E%3C/svg%3E`;
  const imageAssets = [
    rec({ name: "Sky wash", folder: "Backgrounds", image_url: svgAsset("38bdf8"), is_gif: false, created_date: isoOffset(20, 12) }),
    rec({ name: "Berry wash", folder: "Backgrounds", image_url: svgAsset("db2777"), is_gif: false, created_date: isoOffset(20, 12) }),
    rec({ name: "Neon wash", folder: "Backgrounds", image_url: svgAsset("06b6d4"), is_gif: false, created_date: isoOffset(19, 12) }),
    rec({ name: "Avatar A", folder: "Rotation pool", image_url: svgAsset("6366f1"), is_gif: false, created_date: isoOffset(18, 12), owner_alter_id: M.avatars.id }),
    rec({ name: "Avatar B", folder: "Rotation pool", image_url: svgAsset("a855f7"), is_gif: false, created_date: isoOffset(18, 12), owner_alter_id: M.avatars.id }),
    rec({ name: "Avatar C", folder: "Rotation pool", image_url: svgAsset("ec4899"), is_gif: false, created_date: isoOffset(18, 12), owner_alter_id: M.avatars.id }),
  ];

  // ── Reminder inbox instances (a couple, mixed status) ──────────────────
  const reminderInstances = [
    rec({ reminder_id: reminders[0].id, scheduled_for: isoOffset(0, 8), status: "acted" }),
    rec({ reminder_id: reminders[1].id, scheduled_for: isoOffset(0, 21), status: "pending" }),
  ];

  // ── Group notes ────────────────────────────────────────────────────────
  const groupNotes = [
    rec({ group_id: pages.groups[1].id, content: "Start here if you're new — the showcase pages flex what a profile can look like.", created_date: isoOffset(1, 10) }),
    rec({ group_id: pages.groups[3].id, content: "Everything you log day-to-day lives in this group's pages.", created_date: isoOffset(2, 10) }),
  ];

  return {
    SystemSettings:    toMap([settings]),
    Alter:             toMap(pages.alters),
    Group:             toMap(pages.groups),
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
    GroundingTechnique: toMap(groundingTechniques),
    GroundingPreference: toMap(groundingPreferences),
    InnerWorldLocation: toMap(innerWorldLocations),
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
    CustomField:       toMap(pages.customFields),
    RelationshipType:  toMap(relationshipTypes),
    // ── Newer feature areas ──
    Contact:                 toMap(contacts),
    ContactCategory:         toMap(contactCategories),
    ContactEncounter:        toMap(contactEncounters),
    ContactNote:             toMap(contactNotes),
    ContactCustomField:      toMap(contactCustomFields),
    ContactRelationshipType: toMap(contactRelationshipTypes),
    SystemChatCategory:      toMap(chatCategories),
    SystemChatChannel:       toMap(chatChannels),
    SystemChatMessage:       toMap(chatMessages),
    Presence:                toMap(presences),
    ImageAsset:              toMap(imageAssets),
    ReminderInstance:        toMap(reminderInstances),
    GroupNote:               toMap(groupNotes),
    $themePresets:     pages.themePresets,
    $alterThemeLinks:  pages.alterThemeLinks,
  };
}

// ---------------------------------------------------------------------------

// Public registry — one guided example. All display metadata lives in
// previewMeta.js (tiny, static — safe for the banner / Settings card to
// import); this file only attaches the heavy `build` function. This module is
// LAZY-LOADED via dynamic import() in previewMode.js — never import it
// statically from UI code or the whole example content lands in the main
// bundle.
const BUILDERS = { guide: buildGuidedDemo };

export const PREVIEW_SYSTEMS = PREVIEW_SYSTEMS_META.map((m) => ({
  ...m,
  build: BUILDERS[m.key],
}));

export function getPreviewSystem(key) {
  return PREVIEW_SYSTEMS.find((s) => s.key === key) || null;
}
