// The pure half of setup (v0.369.0), kept free of imports so
// scripts/test-setup.mjs can run it in node.
//
//  - SETUP_STEPS / evaluateSetup: the one step list behind the setup card
//    and Settings → Setup. Each step is DONE because of something real (a
//    saved record, a setting, the onboarding record) — nobody ticks it.
//    A step: { id, group, label(t), state(facts, t) -> { done, value }, path }.
//  - mergeOnboarding: how a patch lands on SystemSettings.onboarding.

export const SETUP_GROUPS = [
  { id: "basics", label: "The basics" },
  { id: "safe", label: "Keep it safe" },
  { id: "hard", label: "For hard moments" },
];

const live = (rows) => (rows || []).filter((r) => r && !r.trashed_at && !r.is_archived);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export const SETUP_STEPS = [
  {
    id: "words", group: "basics",
    label: () => "Your words",
    state: (f, t) => {
      const done = f.onboarding.wordsChosen || !!f.settings?.term_system;
      return { done, value: done ? `${t.system} · ${t.alter}` : "Not chosen yet" };
    },
    path: "/settings#terms",
  },
  {
    id: "alters", group: "basics",
    label: () => "Who's here",
    state: (f, t) => {
      const n = live(f.alters).length;
      return { done: n > 0, value: n > 0 ? plural(n, t.alter, t.alters) : "Nobody added yet" };
    },
    path: "/Home",
  },
  {
    id: "checkin", group: "basics",
    label: () => "A first check-in",
    state: (f) => {
      const n = live(f.checkIns).length;
      return { done: n > 0 || !!f.onboarding.first_entry_at, value: n > 0 ? plural(n, "check-in", "check-ins") : "Not yet" };
    },
    path: "/?action=quick-checkin",
  },
  {
    id: "tracking", group: "basics",
    label: () => "What you track",
    state: (f) => {
      const n = live(f.symptoms).length;
      const chose = !!f.onboarding.packs || f.bundlesChosen;
      if (n > 0) return { done: true, value: plural(n, "thing", "things") };
      if (chose) return { done: true, value: "Nothing for now" };
      return { done: false, value: "Not chosen yet" };
    },
    path: "/settings#checkin-manager",
  },
  {
    id: "backup", group: "safe",
    label: () => "Backups",
    state: (f) => {
      if (f.backupMode === "auto") return { done: true, value: "Automatic" };
      if (f.backupMode === "reminder") return { done: true, value: "Reminders on" };
      if (f.backupLastAt) return { done: true, value: "Saved once" };
      return { done: false, value: "Not yet" };
    },
    path: "/settings#export",
  },
  {
    id: "safety-plan", group: "hard",
    label: () => "A safety plan",
    state: (f) => (f.safetyPlan ? { done: true, value: "Written" } : { done: false, value: "Not yet" }),
    path: "/safety-plan",
  },
  {
    id: "support-contacts", group: "hard",
    label: () => "People to call",
    state: (f) => {
      const n = f.supportContacts.length;
      return { done: n > 0, value: n > 0 ? plural(n, "person", "people") : "Not yet" };
    },
    path: "/contacts",
  },
];

// Pure: facts in, steps with their state out. Exported for tests.
export function evaluateSetup(facts, t) {
  return SETUP_STEPS.map((s) => {
    const st = s.state(facts, t);
    return { id: s.id, group: s.group, label: s.label(t), path: s.path, done: !!st.done, value: st.value };
  });
}

// Times that, once set, keep their first value: running setup a second
// time doesn't rewrite when the words were first chosen.
export const ONBOARDING_SET_ONCE = ["started_at", "words_at", "first_entry_at"];

export function mergeOnboarding(cur, patch, version) {
  const base = cur && typeof cur === "object" ? cur : {};
  const next = { ...base, version };
  for (const [k, v] of Object.entries(patch || {})) {
    if (v === undefined) continue;
    if (ONBOARDING_SET_ONCE.includes(k) && base[k]) continue;
    next[k] = v;
  }
  return next;
}
