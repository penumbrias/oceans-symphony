// The diary-card data shape, in one place (v0.279.2).
//
// DiarySection edits { groupKey: { fieldKey: value } }. A saved DiaryCard
// stores the built-in groups in their own fields (urges, body_mind, and the
// "skills" group split into skills_practiced + medication_safety) and every
// group the person added to their template in custom_groups. These helpers
// convert between the two; every writer goes through diaryDataToPatch so no
// door drops a field the editor showed.

const BUILTIN_DIARY_GROUPS = new Set(["urges", "body_mind", "skills"]);
const plain = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);
const groupHasData = (group) => !!group && typeof group === "object"
  && Object.values(group).some(v => v !== undefined && v !== null && v !== "");

// Any diary field has data — including groups the user added to their
// template (those used to render but never save).
export function hasDiaryData(data) {
  return Object.values(data || {}).some(groupHasData);
}

// The user-added template groups with data, keyed by group id, for the
// DiaryCard's `custom_groups` field. Null when there are none.
export function extraDiaryGroups(data) {
  const out = {};
  for (const [key, group] of Object.entries(data || {})) {
    if (!BUILTIN_DIARY_GROUPS.has(key) && groupHasData(group)) out[key] = group;
  }
  return Object.keys(out).length ? out : null;
}

// Saved card → the shape DiarySection edits.
export function diaryCardToData(card) {
  if (!card) return {};
  const data = {};
  for (const [key, group] of Object.entries(plain(card.custom_groups) || {})) {
    if (plain(group)) data[key] = { ...group };
  }
  if (plain(card.urges)) data.urges = { ...card.urges };
  if (plain(card.body_mind)) data.body_mind = { ...card.body_mind };
  const skills = { ...(plain(card.medication_safety) || {}) };
  if (card.skills_practiced !== undefined && card.skills_practiced !== null) skills.skills_practiced = card.skills_practiced;
  if (Object.keys(skills).length) data.skills = skills;
  return data;
}

// DiarySection data → the DiaryCard's diary fields. Only diary fields.
export function diaryDataToPatch(data) {
  const d = data || {};
  const skills = plain(d.skills);
  let medication = null;
  if (skills) {
    const { skills_practiced: _sp, ...rest } = skills;
    medication = Object.keys(rest).length ? rest : null;
  }
  return {
    urges: plain(d.urges) ? { ...d.urges } : null,
    body_mind: plain(d.body_mind) ? { ...d.body_mind } : null,
    skills_practiced: skills?.skills_practiced ?? null,
    medication_safety: medication,
    custom_groups: extraDiaryGroups(d),
  };
}
