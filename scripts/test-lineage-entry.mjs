#!/usr/bin/env node
// The lineage write path (src/lib/lineageEvents.js): recordLineageEvent for
// absorption (archive + merge onto a fresh read), new formation, split
// ("Split from" relationships) and a reformation rename; edit, hide, trash
// and restore, through the real entity proxy. Field lists are copied from
// RecordSystemChangeModal.jsx before the move (v0.380.4).
//
//   node scripts/test-lineage-entry.mjs

import assert from "node:assert/strict";
import { setupEntities, runner } from "./lib/entity-harness.mjs";

const h = await setupEntities({
  stubs: {
    "@/components/emotions/EmotionWheelPicker": "export const WHEEL = {}; export default function W() { return null; }",
  },
});
const { configureCommandTerms } = await import("../src/lib/commandTerms.js");
configureCommandTerms({});
const L = await import("../src/lib/lineageEvents.js");
const { restoreFromTrash } = await import("../src/lib/trash.js");
const { test, run } = runner();

const prepared = (content = "note") => ({ content, authorIds: [], recipientIds: [] });
async function seed() {
  const a = await h.E.Alter.create({ name: "Ash", description: "old desc" });
  const b = await h.E.Alter.create({ name: "Bea", description: "bea desc" });
  return { a, b, alters: [a, b] };
}

test("absorption: event fields, archive the absorbed, merge appends onto a fresh read", async () => {
  h.reset();
  const { a, b, alters } = await seed();
  await h.E.Alter.update(a.id, { description: "edited since" }); // the modal's copy is stale
  const ev = await L.recordLineageEvent({
    type: "fusion", fusionType: "absorption", sourceAlterIds: [a.id, b.id], absorptionTarget: a.id,
    year: "2020", cause: " stress ", archiveAbsorbed: true,
    mergeSelections: { description: [{ name: "Bea", value: "bea desc" }] }, prepared: prepared(), alters,
  });
  assert.deepEqual(h.written(ev), {
    type: "fusion", date: new Date(2020, 0, 1).toISOString(), year_only: true,
    source_alter_ids: [a.id, b.id], result_alter_ids: [a.id], fusion_type: "absorption",
    absorbed_into_alter_id: a.id, cause: "stress", notes: "note", author_alter_ids: [],
  });
  assert.equal((await h.E.Alter.get(b.id)).is_archived, true);
  assert.equal((await h.E.Alter.get(a.id)).is_archived, undefined, "the alter that persists is untouched");
  assert.equal((await h.E.Alter.get(a.id)).description, "edited since\n\nFrom Bea: bea desc");
  assert.equal((await h.E.Alter.list()).length, 2, "no alter is deleted");
});

test("new formation: a new alter, sources archived", async () => {
  h.reset();
  const { a, b, alters } = await seed();
  const ev = await L.recordLineageEvent({
    type: "fusion", fusionType: "new_formation", sourceAlterIds: [a.id, b.id], newAlter: { name: " Cy ", color: "#123456" },
    year: "2021", prepared: prepared(), alters,
  });
  const cy = await h.E.Alter.get(ev.result_alter_ids[0]);
  assert.equal(cy.name, "Cy");
  assert.equal(cy.color, "#123456");
  assert.equal(ev.absorbed_into_alter_id, null);
  for (const id of [a.id, b.id]) assert.equal((await h.E.Alter.get(id)).is_archived, true);
});

test("split: new + existing results, 'Split from' relationships, optional archive", async () => {
  h.reset();
  const { a, b, alters } = await seed();
  const ev = await L.recordLineageEvent({
    type: "split", sourceAlterIds: [a.id], splitResults: [{ type: "existing", id: b.id }, { type: "new", name: "Dee" }],
    year: "2019", archiveSource: true, prepared: prepared(), alters,
  });
  assert.equal(ev.result_alter_ids.length, 2);
  assert.equal(ev.fusion_type, null);
  const rels = await h.E.AlterRelationship.list();
  assert.equal(rels.length, 2);
  for (const r of rels) {
    assert.equal(r.alter_id_b, a.id);
    assert.deepEqual({ t: r.relationship_type, d: r.direction, s: r.strength, n: r.notes },
      { t: "Split from", d: "a_to_b", s: 3, n: "Auto-created from split event (2019)" });
  }
  assert.equal((await h.E.Alter.get(a.id)).is_archived, true);
  const dee = await h.E.Alter.get(ev.result_alter_ids[1]);
  assert.equal(dee.color, "#9333ea");
});

test("reformation: rename fields, and the profile renamed only when asked", async () => {
  h.reset();
  const { a, alters } = await seed();
  const ev = await L.recordLineageEvent({
    type: "reformation", sourceAlterIds: [a.id], year: "2022",
    reformation: { trigger: " move ", rename: true, oldName: "Ash", newName: " Ashe ", applyRename: false },
    prepared: prepared(), preparedChange: prepared("voice"), alters,
  });
  assert.equal(ev.cause, "move");
  assert.equal(ev.what_changed, "voice");
  assert.equal(ev.renamed, true);
  assert.equal(ev.previous_name, "Ash");
  assert.equal(ev.new_name, "Ashe");
  assert.equal((await h.E.Alter.get(a.id)).name, "Ash");
  await L.recordLineageEvent({
    type: "reformation", sourceAlterIds: [a.id], year: "2023",
    reformation: { rename: true, oldName: "Ash", newName: "Ashe", applyRename: true }, prepared: prepared(), alters,
  });
  assert.equal((await h.E.Alter.get(a.id)).name, "Ashe");
});

test("edit, hide, trash and restore", async () => {
  h.reset();
  const { a, alters } = await seed();
  const ev = await L.recordLineageEvent({ type: "dormancy", sourceAlterIds: [a.id], year: "2018", prepared: prepared(), alters });
  assert.deepEqual(ev.result_alter_ids, [a.id]);
  assert.equal(await L.editLineageEvent(ev.id, { cause: "x", notes: "new note" }, { alters }), true);
  assert.equal((await h.E.SystemChangeEvent.get(ev.id)).notes, "new note");
  await L.setLineageEventHidden(ev.id, true);
  assert.equal((await h.E.SystemChangeEvent.get(ev.id)).hidden, true);
  await L.deleteLineageEvent(ev.id);
  assert.equal(await h.E.SystemChangeEvent.get(ev.id), null);
  await restoreFromTrash([{ entity: "SystemChangeEvent", id: ev.id }]);
  assert.equal((await h.E.SystemChangeEvent.get(ev.id)).cause, "x");
});

await run();
