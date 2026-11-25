// The Support rooms' pure rules (new house step 3.1, "the fire exit";
// boards 15-SupportPhone, 38-UnblendPhone, 39-SafetyPlanPhone,
// 40-EmergencyPhone, 41-EmergencyCardPhone). No storage, no React: the
// rooms read records through the existing queries and hand them in here.
// Tested in scripts/test-house-support.mjs.

// ── Support (board 15) ───────────────────────────────────────────────

// The views of the Support room, chosen with ?view= so the phone's back
// gesture steps out of a run back to the room instead of leaving Support.
// The old page's deep links keep working: ?view=soundscape|nature|
// scratchpad, ?tab=learn&topic=…, ?states=a,b (the check-in prompt).
export const SUPPORT_VIEWS = Object.freeze([
  "need", "suggestions", "all", "breathing", "guided", "soundscape", "nature", "scratchpad", "learn",
]);

export function supportView(search) {
  let q;
  try { q = new URLSearchParams(search || ""); } catch { q = new URLSearchParams(); }
  const v = q.get("view");
  if (SUPPORT_VIEWS.includes(v)) return v;
  if (q.get("tab") === "learn") return "learn";
  if (q.get("states")) return "need";
  return "entry";
}

/** The search string for a view (keeps nothing else: a view is a fresh step). */
export function supportViewSearch(view, extra = {}) {
  if (!view || view === "entry") return "";
  const q = new URLSearchParams();
  if (view === "learn") q.set("tab", "learn"); else q.set("view", view);
  for (const [k, v] of Object.entries(extra)) if (v != null && v !== "") q.set(k, String(v));
  return `?${q.toString()}`;
}

/** The states a ?states= link (or the suggestions step) carries, valid ids only. */
export function statesFrom(search, validIds = []) {
  let raw = "";
  try { raw = new URLSearchParams(search || "").get("states") || ""; } catch { /* bad search */ }
  const ok = new Set(validIds);
  return [...new Set(raw.split(",").map((s) => s.trim()).filter((s) => s && (!ok.size || ok.has(s))))];
}

// The Ground panel's tiles: the person's favourites first (board 15 says
// "favourites first"), then the six the board draws. A tile that names a
// technique opens it when the catalogue has it, else the full list.
export const GROUND_DEFAULTS = Object.freeze([
  { key: "breathe", kind: "breathe", pattern: "Box breathing", name: "Breathe", sub: "box breathing, 4 min" },
  { key: "54321", kind: "technique", match: "5-4-3-2-1 grounding", name: "5 4 3 2 1", sub: "notice around you" },
  { key: "unblend", kind: "go", path: "/unblend", name: "Help me unblend", sub: "gentle questions" },
  { key: "nature", kind: "nature", name: "Nature sounds", sub: "{n} recordings" },
  { key: "cold", kind: "technique", match: "Cold water", name: "Cold water", sub: "quick reset" },
  { key: "checkin", kind: "checkin", name: "Check in", sub: "how is everyone" },
]);
export const MAX_FAVOURITE_TILES = 4;

const norm = (s) => String(s || "").trim().toLowerCase();

export function groundTiles({ favourites = [], techniques = [], natureCount = 0, categoryLabel = () => "favourite" } = {}) {
  const fav = (favourites || []).filter(Boolean).slice(0, MAX_FAVOURITE_TILES);
  const favNames = new Set(fav.map((t) => norm(t.name)));
  const out = fav.map((t) => ({ key: `fav-${t.id}`, kind: "technique", id: t.id, name: t.name, sub: categoryLabel(t), favourite: true }));
  for (const d of GROUND_DEFAULTS) {
    if (d.kind === "technique" && favNames.has(norm(d.match))) continue;
    const tile = { ...d, sub: d.sub.replace("{n}", String(natureCount)) };
    if (d.kind === "technique") {
      const t = (techniques || []).find((x) => norm(x.name) === norm(d.match) && !x.is_archived);
      tile.id = t ? t.id : null;
    }
    out.push(tile);
  }
  return out;
}

/** The Learn panel: "N of M topics", the started lessons (newest first, two) and the next one. */
export function learnSummary(topics = [], progress = []) {
  const by = new Map((progress || []).filter((p) => p?.topic_id).map((p) => [p.topic_id, p]));
  const done = topics.filter((t) => by.get(t.id)?.completed).length;
  const started = topics.filter((t) => by.has(t.id))
    .sort((a, b) => String(by.get(b.id)?.updated_date || by.get(b.id)?.created_date || "").localeCompare(String(by.get(a.id)?.updated_date || by.get(a.id)?.created_date || "")))
    .slice(0, 2);
  const next = topics.find((t) => !by.get(t.id)?.completed);
  const rows = [...started];
  if (next && !rows.some((t) => t.id === next.id)) rows.push(next);
  return {
    done,
    total: topics.length,
    rows: rows.map((t) => ({ ...t, state: by.get(t.id)?.completed ? "done" : by.has(t.id) ? "in progress" : "next" })),
  };
}

/** The suggestions after "What do I need?": three techniques for the states, no breathing ones. */
export function suggestFor(techniques = [], states = [], { exclude = [] } = {}) {
  const skip = new Set(exclude);
  return (techniques || []).filter((t) => !t.is_archived && t.category !== "breathing"
    && (t.suggested_for || []).some((s) => states.includes(s)) && !skip.has(t.id));
}

/** The sleep timer and source, in words, for the now-playing bar. */
export function nowPlayingWords({ recording, nature = {}, soundscape = {}, remaining = null, clock = (s) => `${s}s` } = {}) {
  const title = recording ? recording.title : soundscape.playing ? "Soundscape" : null;
  if (!title) return null;
  const bits = [];
  if (recording) bits.push(recording.mine ? "Your sounds" : "Nature sounds");
  if (recording && soundscape.playing) bits.push("with the Soundscape");
  const sl = nature.sleep;
  if (sl?.mode === "time" && sl.minutes) bits.push(`sleep timer ${sl.minutes} min`);
  else if (sl?.mode === "track") bits.push("stops after this sound");
  else if (sl?.mode === "queue") bits.push("stops when Up next ends");
  if (!recording && remaining != null) bits.push(`${clock(remaining)} left`);
  return { title, detail: bits.join("  ·  ") };
}

// ── Safety plan (board 39) ───────────────────────────────────────────

export const SAFETY_LESSONS = Object.freeze({ plan: "m4_t3", cards: "m6_t2", window: "m7_t3" });
export const SAFETY_EXERCISES = Object.freeze({ plan: "m4_t3_safety_plan", cards: "m6_t2_coping_cards", window: "m7_t3_window_plan" });
export const lessonPath = (topic) => `/grounding?tab=learn&topic=${topic}`;

// The window of tolerance, top to bottom, as board 39 names and colours
// them. `n` is the lesson's level number its answers are stored under.
export const TOLERANCE_ZONES = Object.freeze([
  { n: 1, label: "Calm & regulated", color: "#86b88f" },
  { n: 2, label: "Alert & focused", color: "#8fb8e0" },
  { n: 3, label: "Highly activated", color: "#e3c16f" },
  { n: 4, label: "Coping needed", color: "#d98f5b" },
  { n: 5, label: "Crisis", color: "#ef8a6a" },
]);

export const WARNING_SIGNS = Object.freeze([
  { id: "earliest", label: "Earliest warning signs", sign: "earliest_signs", act: "earliest_response", color: "#e3c16f", doLabel: "What I will do" },
  { id: "increased", label: "Increased risk signs", sign: "increased_signs", act: "increased_response", color: "#d98f5b", doLabel: "What I will do" },
  { id: "emergency", label: "Emergency signs", sign: "emergency_signs", act: "emergency_response", color: "#ef8a6a", doLabel: "What I will do" },
]);

const stamp = (e) => String(e?.updated_date || e?.created_date || "");

/** The newest saved answers for each safety-plan exercise (list() is oldest first). */
export function latestSafetyEntries(entries = []) {
  const pick = (id) => [...(entries || [])].filter((e) => e && !e.trashed_at && e.exercise_id === id)
    .sort((a, b) => stamp(b).localeCompare(stamp(a)))[0] || null;
  return { plan: pick(SAFETY_EXERCISES.plan), cards: pick(SAFETY_EXERCISES.cards), window: pick(SAFETY_EXERCISES.window) };
}

/** Each zone with what the person wrote for it (empty when they haven't yet). */
export function toleranceRows(windowEntry) {
  const r = windowEntry?.responses || {};
  return TOLERANCE_ZONES.map((z) => {
    const notice = String(r[`level${z.n}_notice`] || "").trim();
    const helps = String(r[`level${z.n}_helps`] || "").trim();
    return { ...z, notice, helps, filled: !!(notice || helps) };
  });
}

export function warningRows(planEntry) {
  const r = planEntry?.responses || {};
  return WARNING_SIGNS.map((s) => ({ ...s, text: String(r[s.sign] || "").trim(), action: String(r[s.act] || "").trim() }));
}

/** Coping cards as [{ key, title, text }], empty answers left out. */
export function copingCards(cardsEntry) {
  return Object.entries(cardsEntry?.responses || {})
    .filter(([, v]) => String(v || "").trim())
    .map(([k, v]) => ({ key: k, title: k.replace(/_/g, " "), text: String(v) }));
}

/** The first emergency contact with a number to call, or null. */
export function firstCallable(contacts = []) {
  return (contacts || []).find((c) => c && c.phone) || null;
}

/** A tel: link for a number as people type it. */
export function telHref(phone) {
  const n = String(phone || "").replace(/[^\d+]/g, "");
  return n ? `tel:${n}` : null;
}

// ── Emergency info (boards 40 and 41) ────────────────────────────────

/** A card section as one block of text (lines, then contacts). */
export function sectionText(s) {
  if (!s) return "";
  const lines = [...(s.lines || [])];
  for (const c of s.contacts || []) lines.push([c.name, c.phone].filter(Boolean).join(" · "));
  return lines.join("\n");
}

/** Every part the card can hold, filled or not, with whether the unlock screen shows it. */
export function emergencyRows(cardSections = [], sections = [], { lockOn = false, lockFields = [] } = {}) {
  const by = new Map((sections || []).map((s) => [s.id, s]));
  const picked = new Set(Array.isArray(lockFields) ? lockFields : []);
  return (cardSections || []).map((c) => {
    const text = sectionText(by.get(c.id));
    return { id: c.id, label: c.label, text, locked: !!(lockOn && picked.has(c.id) && text) };
  });
}

export const CARD_SIZES = Object.freeze(["md", "lg", "xl"]);
export function stepCardSize(size, by) {
  const i = Math.max(0, CARD_SIZES.indexOf(size));
  return CARD_SIZES[Math.min(CARD_SIZES.length - 1, Math.max(0, i + by))];
}

// ── Help me unblend (board 38) ───────────────────────────────────────

/** The big button's words: set when nobody is in front, add otherwise. */
export function frontButtonWords({ name, fronting = false, anyoneFronting = false, terms = {} }) {
  const front = terms.front || "front";
  if (!name) return null;
  if (fronting) return { label: `${name} is ${terms.fronting || "fronting"}`, done: true };
  return { label: anyoneFronting ? `Add ${name} to ${front}` : `Set ${front} to ${name}`, done: false };
}
