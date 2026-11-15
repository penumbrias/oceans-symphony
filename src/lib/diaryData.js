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

// ── Reading a saved card back as rows (v0.371.8) ──
// Every place that SHOWS a diary card — the Check-in log, the therapy
// report — reads it through this, so a field the person added in Manage
// check-in (a Text box, a whole new group) is shown like the built-in
// ones. Those used to be saved but never drawn anywhere except the edit
// dialog. Fields come in the template's order; anything saved under a key
// the template no longer has is still shown (under its key), never hidden.
//
// `groups` is the template's groups (DiaryTemplate.groups, or the
// defaults). Returns [{ id, label, rows: [{ key, label, type, value, max,
// isPositive }] }], only groups and rows that hold a value.
const hasValue = (v) => v !== undefined && v !== null && v !== "";
const prettyKey = (k) => String(k).replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

export function diaryCardRows(card, groups = []) {
  const data = diaryCardToData(card);
  const out = [];
  const seenGroups = new Set();
  const ordered = [...(groups || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
  for (const g of ordered) {
    if (!g?.id) continue;
    seenGroups.add(g.id);
    const values = data[g.id] || {};
    const seenKeys = new Set();
    const rows = [];
    for (const f of [...(g.fields || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
      const key = f.data_key || f.id;
      if (!key) continue;
      seenKeys.add(key);
      if (!hasValue(values[key])) continue;
      rows.push({ key, label: f.label || prettyKey(key), type: f.type || "number", value: values[key], max: f.max, isPositive: !!f.is_positive });
    }
    for (const [key, value] of Object.entries(values)) {
      if (seenKeys.has(key) || !hasValue(value)) continue;
      rows.push({ key, label: prettyKey(key), type: typeof value === "boolean" ? "boolean" : typeof value === "number" ? "number" : "text", value });
    }
    if (rows.length) out.push({ id: g.id, label: g.label || prettyKey(g.id), rows });
  }
  for (const [gid, values] of Object.entries(data)) {
    if (seenGroups.has(gid) || !plain(values)) continue;
    const rows = Object.entries(values).filter(([, v]) => hasValue(v)).map(([key, value]) => ({
      key, label: prettyKey(key), type: typeof value === "boolean" ? "boolean" : typeof value === "number" ? "number" : "text", value,
    }));
    if (rows.length) out.push({ id: gid, label: prettyKey(gid), rows });
  }
  return out;
}

// One row as plain text ("Joy: 4/5", "Rx meds taken: Yes", "Note: …").
export function diaryRowText(row) {
  if (row.type === "boolean") return `${row.label}: ${row.value ? "Yes" : "No"}`;
  if (row.type === "rating" && row.max) return `${row.label}: ${row.value}/${row.max}`;
  return `${row.label}: ${row.value}`;
}
