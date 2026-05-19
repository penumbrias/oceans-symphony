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
  {
    id: "dominant_feel",
    prompt: "What's the dominant feeling?",
    kind: "choice",
    options: [
      { id: "safe",     label: "Safe",     tags: ["safe", "regulated"] },
      { id: "unsafe",   label: "Unsafe / on guard", tags: ["protector", "hypervigilant", "scared"] },
      { id: "sad",      label: "Sad",      tags: ["sad", "grief", "depressed"] },
      { id: "angry",    label: "Angry",    tags: ["angry", "protector"] },
      { id: "playful",  label: "Playful",  tags: ["playful", "child"] },
      { id: "tired",    label: "Tired",    tags: ["tired", "shut-down"] },
      { id: "curious",  label: "Curious",  tags: ["curious"] },
      { id: "numb",     label: "Numb",     tags: ["numb", "shut-down", "dissociated"] },
    ],
    score: (alter, ans) => matchTags(alter, ans?.tags),
  },
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
