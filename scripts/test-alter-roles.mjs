// Tests for src/lib/alterRoles.js — several roles in one Alter.role string.
// Run: node scripts/test-alter-roles.mjs
import assert from "node:assert/strict";
import { splitRoles, alterRoles, joinRoles, rolesText, hasRole } from "../src/lib/alterRoles.js";

assert.deepEqual(splitRoles("Protector"), ["Protector"]);
assert.deepEqual(splitRoles(" Protector ,  Caretaker,,"), ["Protector", "Caretaker"]);
assert.deepEqual(splitRoles("Host; Gatekeeper | Little"), ["Host", "Gatekeeper", "Little"]);
assert.deepEqual(splitRoles("Host, host, HOST"), ["Host"]);
assert.deepEqual(splitRoles(null), []);
assert.deepEqual(splitRoles(42), []);
assert.deepEqual(alterRoles({}), []);
assert.deepEqual(alterRoles({ role: "" }), []);
assert.equal(joinRoles(["Protector", " caretaker ", "protector", ""]), "Protector, caretaker");
assert.equal(joinRoles([]), "");
assert.equal(rolesText({ role: "A;B" }), "A, B");
assert.ok(hasRole({ role: "Protector, Caretaker" }, "caretaker"));
assert.ok(!hasRole({ role: "Protector, Caretaker" }, "Care"));
assert.ok(!hasRole({ role: "Protector" }, ""));
console.log("alterRoles: all tests passed");
