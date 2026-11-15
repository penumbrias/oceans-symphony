// node scripts/test-diary-rows.mjs — every saved diary value is read back.
import assert from "node:assert/strict";
import { diaryCardRows, diaryRowText } from "../src/lib/diaryData.js";

const groups = [
  { id: "body_mind", label: "Body + Mind", order: 1, fields: [
    { id: "joy", data_key: "joy", label: "Joy", type: "rating", max: 5, order: 2 },
    { id: "em", data_key: "emotional_misery", label: "Emotional misery", type: "rating", max: 5, order: 1 },
  ] },
  { id: "g_custom", label: "Evening", order: 2, fields: [
    { id: "f1", data_key: "what_helped", label: "What helped", type: "text" },
    { id: "f2", data_key: "walked", label: "Walked", type: "boolean" },
  ] },
];
const card = {
  body_mind: { joy: 4, emotional_misery: 2, old_field: 3 },
  custom_groups: {
    g_custom: { what_helped: "tea", walked: false },
    g_gone: { leftover: "still here" },
  },
  skills_practiced: 5,
};
const out = diaryCardRows(card, groups);
assert.deepEqual(out.map((g) => g.id), ["body_mind", "g_custom", "g_gone", "skills"].filter((id) => out.some((g) => g.id === id)));
const bm = out.find((g) => g.id === "body_mind");
assert.deepEqual(bm.rows.map((r) => r.key), ["emotional_misery", "joy", "old_field"], "template order, then unknown keys");
const ev = out.find((g) => g.id === "g_custom");
assert.equal(ev.rows.length, 2, "false is a value");
assert.equal(diaryRowText(ev.rows[0]), "What helped: tea");
assert.equal(diaryRowText(ev.rows[1]), "Walked: No");
assert.ok(out.find((g) => g.id === "g_gone"), "group missing from the template still shown");
assert.ok(out.find((g) => g.id === "skills"), "built-in group missing from the template still shown");
assert.deepEqual(diaryCardRows({}, groups), []);
console.log("diary rows: ok");
