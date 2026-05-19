// "Help me unblend" — preset question library.
//
// Each question has:
//   - id          : stable string for shuffle / "answered" tracking
//   - prompt      : the question shown to the user
//   - kind        : "color" | "choice" — drives the input UI
//   - options[]   : for "choice" questions, the answer pills the user picks
//                   from. Each option has { id, label } plus optional
//                   tags / age / energy hints used by score().
//   - score(alter, answer)
//                 : returns a single number — positive means this alter
//                   matches the answer better, negative means worse,
//                   zero means we have no signal.
//
// The page applies score() to every active alter when the user picks
// an answer, then folds the deltas into the running totals.
//
// Questions are deliberately gentle and customisable. Tone: "help me
// reconnect", never interrogation. Most score functions return 0 (no
// signal) when an alter doesn't have the relevant field — better to
// stay quiet than to penalise an alter for missing data.

import { colorDistance, ANSWER_DELTA, ANSWER_PENALTY } from "./unblendScoring";

// ───────────────────────────────────────────────────────────────────
// Helper: read a custom-field value off an alter, case-insensitive.
function readCustom(alter, fieldName) {
  const map = alter?.alter_custom_fields;
  if (!map || typeof map !== "object") return null;
  const lower = fieldName.toLowerCase();
  for (const [k, v] of Object.entries(map)) {
    if (k.toLowerCase() === lower) return v;
  }
  return null;
}

// ───────────────────────────────────────────────────────────────────
// PRESET QUESTIONS — broad → specific. Color first since "what
// colour feels present" is usually the easiest signal.
export const PRESET_QUESTIONS = [
  {
    id: "color",
    prompt: "What colour feels most present right now?",
    kind: "color",
    score: (alter, answerColor) => {
      if (!alter?.color || !answerColor) return 0;
      const d = colorDistance(alter.color, answerColor);
      // 0–60 distance → strong match (+ANSWER_DELTA)
      // 60–150 → mild match
      // >150 → mild penalty (different vibe)
      if (d < 60) return ANSWER_DELTA;
      if (d < 150) return ANSWER_DELTA * 0.4;
      return ANSWER_PENALTY * 0.5;
    },
  },
  {
    id: "energy",
    prompt: "What energy do you feel?",
    kind: "choice",
    options: [
      { id: "high",  label: "High / wired",   tags: ["high-energy", "manic", "playful"] },
      { id: "calm",  label: "Calm / settled", tags: ["calm", "grounded", "regulated"] },
      { id: "low",   label: "Low / heavy",    tags: ["low-energy", "depressed", "tired", "shut-down"] },
      { id: "anxious", label: "Anxious / jittery", tags: ["anxious", "hypervigilant", "scared"] },
    ],
    score: (alter, ans) => matchTags(alter, ans?.tags),
  },
  {
    id: "age_range",
    prompt: "Roughly how young or old do you feel?",
    kind: "choice",
    options: [
      { id: "child",   label: "Younger / child",  ageMax: 12 },
      { id: "teen",    label: "Teen-ish",         ageMin: 13, ageMax: 19 },
      { id: "adult",   label: "Adult",            ageMin: 20 },
      { id: "unsure",  label: "Not sure",         skipScoring: true },
    ],
    score: (alter, ans) => {
      if (!ans || ans.skipScoring) return 0;
      const age = Number(alter?.age);
      if (!Number.isFinite(age)) return 0;
      const min = ans.ageMin ?? -Infinity;
      const max = ans.ageMax ?? Infinity;
      if (age >= min && age <= max) return ANSWER_DELTA;
      return ANSWER_PENALTY * 0.5;
    },
  },
  {
    id: "body_or_head",
    prompt: "More in your body, or more in your head?",
    kind: "choice",
    options: [
      { id: "body",  label: "In my body",   tags: ["embodied", "grounded", "physical"] },
      { id: "head",  label: "In my head",   tags: ["dissociated", "intellectual", "thinker"] },
      { id: "both",  label: "Both / mixed", tags: [] },
      { id: "numb",  label: "Numb / neither", tags: ["numb", "dissociated", "shut-down"] },
    ],
    score: (alter, ans) => matchTags(alter, ans?.tags),
  },
  // NOTE: The dominant-feeling question used to live here as a
  // static curated list. It's now generated dynamically from the
  // user's actual EmotionCheckIn history via
  // buildDominantFeelingQuestion(emotionCheckIns, alters) so the
  // options reflect emotions they've really logged and the score
  // comes from per-alter frequency. See HelpMeUnblend.jsx for the
  // call site.
  {
    id: "role_lean",
    prompt: "Does this feel like… a younger part, a protector, a caretaker, an everyday part, or something else?",
    kind: "choice",
    options: [
      { id: "younger",  label: "Younger part",  tags: ["child", "little"], roles: ["little", "child"] },
      { id: "protector", label: "Protector",    tags: ["protector", "fight"], roles: ["protector"] },
      { id: "caretaker", label: "Caretaker",    tags: ["caretaker", "nurturer"], roles: ["caretaker"] },
      { id: "host",     label: "Everyday / host", tags: ["host", "daily"], roles: ["host", "core"] },
      { id: "other",    label: "Something else", skipScoring: true },
    ],
    score: (alter, ans) => {
      if (!ans || ans.skipScoring) return 0;
      const fromTags = matchTags(alter, ans?.tags);
      const fromRole = matchRole(alter, ans?.roles);
      return Math.max(fromTags, fromRole);
    },
  },
];

// ───────────────────────────────────────────────────────────────────
// ───────────────────────────────────────────────────────────────────
// Builds extra questions from the actual data the user has filled in
// about their alters. Anything we can compare exactly (pronouns,
// gender, body, vibe, role-tag custom fields, …) becomes a quick
// multi-choice question whose options are the unique values across
// the alter set. We only emit a question when at least two alters
// have the field set AND at least two distinct values exist —
// otherwise the answer has zero discrimination power.
//
// Field-name → human-readable prompt mapping. Anything not in this
// map falls back to "What's the [fieldname]?".
const PROMPT_OVERRIDES = {
  pronouns: "What pronouns feel right?",
  gender:   "What gender feels closest?",
  age:      "How old does this feel?",
  vibe:     "What vibe is this?",
  energy:   "What energy is this?",
  role:     "What role does this feel like?",
};

const PROMPT_PREFIX_OVERRIDES = {
  favorite: "What's the favourite",
  favourite: "What's the favourite",
};

function humanisePrompt(fieldName) {
  const lower = String(fieldName || "").trim().toLowerCase();
  if (!lower) return "What is this?";
  if (PROMPT_OVERRIDES[lower]) return PROMPT_OVERRIDES[lower];
  // Heuristic for "favourite food" / "favourite colour" style fields.
  for (const [prefix, prompt] of Object.entries(PROMPT_PREFIX_OVERRIDES)) {
    if (lower.startsWith(prefix)) return `${prompt} ${lower.slice(prefix.length).trim()}?`;
  }
  return `What's the ${lower}?`;
}

function uniqueStringValues(values) {
  const seen = new Map();
  for (const v of values) {
    if (typeof v !== "string") continue;
    const trimmed = v.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) seen.set(key, trimmed); // preserve original casing
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

/**
 * Build the "What's the dominant feeling?" question from the user's
 * actual EmotionCheckIn history. Options are the top N most-frequently
 * logged emotions (preserving original casing). Scoring rewards the
 * alter who's logged that emotion most often: a perfect match gets
 * ANSWER_DELTA, scaled proportionally for other alters; a never-felt
 * emotion gives a mild negative signal.
 *
 * Returns null when the user has no emotion data yet — the question
 * has no signal to provide, so it's omitted from the queue entirely
 * rather than asked as a placeholder.
 */
export function buildDominantFeelingQuestion(emotionCheckIns, { topN = 16 } = {}) {
  if (!Array.isArray(emotionCheckIns) || emotionCheckIns.length === 0) return null;

  const totals = new Map();              // lowercase key → count
  const labelByKey = new Map();          // lowercase key → preserved-casing label
  const byEmotionByAlter = new Map();    // lowercase key → Map<alterId, count>

  for (const ci of emotionCheckIns) {
    const list = Array.isArray(ci?.emotions) ? ci.emotions : [];
    const alterId = ci?.alter_id || null;
    for (const raw of list) {
      if (!raw || typeof raw !== "string") continue;
      const trimmed = raw.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      totals.set(key, (totals.get(key) || 0) + 1);
      if (!labelByKey.has(key)) labelByKey.set(key, trimmed);
      if (alterId) {
        if (!byEmotionByAlter.has(key)) byEmotionByAlter.set(key, new Map());
        const m = byEmotionByAlter.get(key);
        m.set(alterId, (m.get(alterId) || 0) + 1);
      }
    }
  }

  if (totals.size === 0) return null;

  const top = [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([key]) => key);

  return {
    id: "dyn_dominant_feeling",
    prompt: "What's the dominant feeling?",
    kind: "choice",
    options: top.map((key) => ({
      id: key,
      label: labelByKey.get(key) || key,
      value: key,
    })),
    score: (alter, ans) => {
      if (!ans?.value) return 0;
      const perAlter = byEmotionByAlter.get(ans.value);
      // No-one's ever logged this emotion against any alter → no
      // signal (e.g. the user logs emotions without picking a
      // fronter). Returning 0 keeps the question useful for the
      // baseline ranking instead of penalising everyone.
      if (!perAlter || perAlter.size === 0) return 0;
      const count = perAlter.get(alter.id) || 0;
      const max = Math.max(...perAlter.values());
      if (count === 0) return ANSWER_PENALTY * 0.3;
      return (count / Math.max(1, max)) * ANSWER_DELTA;
    },
  };
}

export function buildDynamicQuestions(alters) {
  if (!Array.isArray(alters) || alters.length === 0) return [];
  const active = alters.filter((a) => a && !a.is_archived);
  const questions = [];

  // 1) Pronouns — first-class field on Alter.
  const pronounSet = new Map();
  for (const a of active) {
    if (typeof a.pronouns === "string" && a.pronouns.trim()) {
      pronounSet.set(a.id, a.pronouns.trim());
    }
  }
  const pronounOptions = uniqueStringValues([...pronounSet.values()]);
  if (pronounSet.size >= 2 && pronounOptions.length >= 2) {
    questions.push({
      id: "dyn_pronouns",
      prompt: "What pronouns feel right?",
      kind: "choice",
      options: pronounOptions.map((p) => ({ id: p, label: p, value: p })),
      score: (alter, ans) => {
        if (!ans || typeof alter?.pronouns !== "string") return 0;
        return alter.pronouns.trim().toLowerCase() === ans.value.toLowerCase()
          ? ANSWER_DELTA
          : 0;
      },
    });
  }

  // 2) Role (already a free-text Alter field). If at least 2 alters
  // have it set with at least 2 distinct values, offer it.
  const roleSet = new Map();
  for (const a of active) {
    if (typeof a.role === "string" && a.role.trim()) roleSet.set(a.id, a.role.trim());
  }
  const roleOptions = uniqueStringValues([...roleSet.values()]);
  if (roleSet.size >= 2 && roleOptions.length >= 2 && roleOptions.length <= 12) {
    questions.push({
      id: "dyn_role",
      prompt: "Which role feels closest right now?",
      kind: "choice",
      options: roleOptions.map((r) => ({ id: r, label: r, value: r })),
      score: (alter, ans) => {
        if (!ans || typeof alter?.role !== "string") return 0;
        return alter.role.trim().toLowerCase() === ans.value.toLowerCase()
          ? ANSWER_DELTA
          : 0;
      },
    });
  }

  // 3) Custom fields. Each field becomes a question if 2+ alters have
  // it set with 2+ distinct values (and at most 12, so the option
  // list stays scannable).
  const customFieldValues = {};
  for (const a of active) {
    const map = a.alter_custom_fields;
    if (!map || typeof map !== "object") continue;
    for (const [k, v] of Object.entries(map)) {
      const value = typeof v === "string" ? v.trim() : "";
      if (!value) continue;
      if (!customFieldValues[k]) customFieldValues[k] = new Map();
      customFieldValues[k].set(a.id, value);
    }
  }
  for (const [field, valuesByAlter] of Object.entries(customFieldValues)) {
    const options = uniqueStringValues([...valuesByAlter.values()]);
    if (valuesByAlter.size < 2 || options.length < 2 || options.length > 12) continue;
    questions.push({
      id: `dyn_field_${field}`,
      prompt: humanisePrompt(field),
      kind: "choice",
      options: options.map((v) => ({ id: v, label: v, value: v })),
      score: (alter, ans) => {
        if (!ans) return 0;
        const v = readCustom(alter, field);
        if (typeof v !== "string" || !v.trim()) return 0;
        return v.trim().toLowerCase() === ans.value.toLowerCase()
          ? ANSWER_DELTA
          : 0;
      },
    });
  }

  return questions;
}

// Generic matchers. Each returns a number in roughly the range
// [ANSWER_PENALTY * 0.5, ANSWER_DELTA].
function matchTags(alter, wantedTags) {
  if (!Array.isArray(wantedTags) || wantedTags.length === 0) return 0;
  const alterTags = collectTags(alter).map((t) => t.toLowerCase());
  if (alterTags.length === 0) return 0;
  const wanted = wantedTags.map((t) => t.toLowerCase());
  const hits = wanted.filter((w) => alterTags.includes(w)).length;
  if (hits > 0) return Math.min(ANSWER_DELTA, hits * ANSWER_DELTA);
  return 0;
}

function matchRole(alter, wantedRoles) {
  if (!Array.isArray(wantedRoles) || wantedRoles.length === 0) return 0;
  const role = (alter?.role || "").toLowerCase();
  if (!role) return 0;
  return wantedRoles.some((r) => role.includes(r.toLowerCase())) ? ANSWER_DELTA : 0;
}

function collectTags(alter) {
  const out = [];
  if (Array.isArray(alter?.tags)) out.push(...alter.tags);
  if (alter?.role) out.push(alter.role);
  // Read a couple of conventional custom fields if the user has them.
  for (const fname of ["vibe", "tags", "energy"]) {
    const v = readCustom(alter, fname);
    if (typeof v === "string") {
      out.push(...v.split(/[,;]/).map((s) => s.trim()).filter(Boolean));
    } else if (Array.isArray(v)) {
      out.push(...v.filter((x) => typeof x === "string"));
    }
  }
  return out;
}
