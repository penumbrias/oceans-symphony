// node scripts/test-timeline-layers.mjs
import assert from "node:assert/strict";
import { applyTimelineLayers, hiddenLayersOf } from "../src/lib/timelineLayers.js";

const day = { sessions: [1], activities: [2], emotions: [], checkIns: [], locations: [3], statusNotes: [], dailyProgress: null, hasData: true };
assert.equal(applyTimelineLayers(day, []), day, "nothing hidden → same object");
const a = applyTimelineLayers(day, ["fronting"]);
assert.deepEqual(a.sessions, []);
assert.deepEqual(a.activities, [2]);
assert.equal(a.hasData, true);
const b = applyTimelineLayers(day, ["fronting", "activities", "places"]);
assert.equal(b.hasData, false);
assert.deepEqual(day.sessions, [1], "input untouched");
assert.deepEqual(hiddenLayersOf({ hiddenLayers: ["sleep", "nope"] }), ["sleep"]);
assert.deepEqual(hiddenLayersOf({}), []);
console.log("timeline layers: ok");
