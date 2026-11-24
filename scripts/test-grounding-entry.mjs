#!/usr/bin/env node
// The grounding technique write path (src/lib/groundingEntry.js): custom
// techniques, seeding built-ins, and folding duplicate built-ins into the
// trash (never the person's own), through the real entity proxy.
//
//   node scripts/test-grounding-entry.mjs

import assert from "node:assert/strict";
import { setupEntities, runner } from "./lib/entity-harness.mjs";

const h = await setupEntities();
const G = await import("../src/lib/groundingEntry.js");
const { restoreFromTrash } = await import("../src/lib/trash.js");
const { test, run } = runner();

test("a custom technique: same fields as CustomTechniqueForm wrote", async () => {
  h.reset();
  const t = await G.createCustomTechnique({ name: " Walk ", description: " outside ", category: "physical", steps: ["a", " ", "b"], durationMinutes: "5", suggestedFor: ["anxious"] });
  assert.deepEqual(h.written(t), {
    name: "Walk", description: "outside", category: "physical", steps: ["a", "b"], duration_seconds: 300,
    suggested_for: ["anxious"], is_default: false, is_archived: false, order: 100,
  });
  const n = await G.createCustomTechnique({ name: "x", category: "c" });
  assert.equal(n.duration_seconds, null);
});

test("seeding adds missing built-ins only, and folds duplicate built-ins into the trash", async () => {
  h.reset();
  const defaults = [{ name: "Box", is_default: true }, { name: "5-4-3-2-1", is_default: true }];
  assert.equal(await G.seedDefaultTechniques(defaults), 2);
  assert.equal(await G.seedDefaultTechniques(defaults), 0, "nothing added twice");
  const extra = await h.E.GroundingTechnique.create({ name: "Box", is_default: true });
  const mine = await h.E.GroundingTechnique.create({ name: "Box", is_default: false });
  await G.seedDefaultTechniques(defaults);
  const live = await h.E.GroundingTechnique.list();
  assert.equal(live.filter((t) => t.name === "Box" && t.is_default).length, 1);
  assert.ok(live.some((t) => t.id === mine.id), "the person's own technique is never touched");
  assert.ok(h.raw("GroundingTechnique", extra.id).trashed_at, "the duplicate is in the trash, not gone");
  await restoreFromTrash([{ entity: "GroundingTechnique", id: extra.id }]);
  assert.ok(await h.E.GroundingTechnique.get(extra.id));
});

test("the oldest duplicate is the one kept", () => {
  const rows = [
    { id: "new", name: "Box", is_default: true, created_date: "2026-02-01T00:00:00Z" },
    { id: "old", name: "Box", is_default: true, created_date: "2025-01-01T00:00:00Z" },
    { id: "own", name: "Box", is_default: false },
  ];
  assert.deepEqual(G.duplicateDefaultTechniques(rows, [{ name: "Box" }]).map((r) => r.id), ["new"]);
});

await run();
