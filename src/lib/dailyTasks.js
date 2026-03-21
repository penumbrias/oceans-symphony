// All tasks in the daily tasks system
// AUTO tasks are checked programmatically; MANUAL tasks require a toggle

export const DAILY_TASKS = [
  {
    id: "check_in",
    label: "Check in",
    description: "Open the app and get logged in.",
    type: "AUTO",
    xp: 3,
  },
  {
    id: "journal_entry",
    label: "Journal entry",
    description: "Create a journal entry today.",
    type: "AUTO",
    xp: 6,
  },
  {
    id: "card_entry",
    label: "Card entry",
    description: "Save a daily or weekly card entry.",
    type: "AUTO",
    xp: 5,
  },
  {
    id: "parts_checkin",
    label: "Parts check-in",
    description: "Gently notice any parts that want attention and what your body is feeling. No fixing, just noticing.",
    type: "MANUAL",
    xp: 4,
  },
  {
    id: "took_meds",
    label: "Took meds",
    description: "Take your prescribed meds.",
    type: "MANUAL",
    xp: 3,
  },
  {
    id: "ate_a_meal",
    label: "Ate a meal",
    description: "Eat at least one meal today.",
    type: "MANUAL",
    xp: 3,
  },
  {
    id: "drank_water",
    label: "Drank water",
    description: "Stay hydrated — drink at least a few glasses.",
    type: "MANUAL",
    xp: 2,
  },
  {
    id: "movement",
    label: "Movement",
    description: "Any kind of movement — a walk, stretch, or exercise.",
    type: "MANUAL",
    xp: 4,
  },
  {
    id: "self_care",
    label: "Self-care",
    description: "Did something kind for yourself today.",
    type: "MANUAL",
    xp: 3,
  },
];

export const TOTAL_POSSIBLE_XP = DAILY_TASKS.reduce((sum, t) => sum + t.xp, 0);

// XP thresholds per level (cumulative)
export function getLevelFromTotalXP(totalXP) {
  let level = 1;
  let xpForNext = 100;
  let accumulated = 0;
  while (totalXP >= accumulated + xpForNext) {
    accumulated += xpForNext;
    level++;
    xpForNext = Math.round(xpForNext * 1.3);
  }
  return {
    level,
    xpIntoLevel: totalXP - accumulated,
    xpForNextLevel: xpForNext,
    totalXP,
  };
}

export function getTodayString() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const today = `${yyyy}-${mm}-${dd}`;
  console.log("getTodayString() returning:", today);
  return today;
}