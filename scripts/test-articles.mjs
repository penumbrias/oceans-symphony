// node scripts/test-articles.mjs
import assert from "node:assert/strict";
import { an, An, article } from "../src/lib/articles.js";
const cases = {
  alter: "an", part: "a", member: "a", headmate: "a", "inner": "an", insider: "an",
  system: "a", collective: "a", "OSDD system": "an", fronting: "a", influencing: "an",
  "unit": "a", "user": "a", "usual": "a", "umbrella": "an", "ego state": "an",
  "hour": "an", "honest": "an", "one": "a", "eu-thing": "a", "": "a",
};
for (const [w, want] of Object.entries(cases)) assert.equal(article(w), want, `article(${JSON.stringify(w)})`);
assert.equal(an("alter"), "an alter");
assert.equal(An("part"), "A part");
assert.equal(An("alter"), "An alter");
console.log(`${Object.keys(cases).length + 3} article checks passed.`);
