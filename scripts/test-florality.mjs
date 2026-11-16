// Florality import parsing: node scripts/test-florality.mjs
import assert from "node:assert/strict";
import * as F from "../src/lib/florality.js";

const json = {
  privacy: [], privacyBuckets: [
    { id: "b-friends", name: "Regular friends", description: "Default visibility", color: 0 },
    { id: "b-none", name: "Complete privacy", description: "No friend access: see nothing", color: 0 },
  ],
  fields: [], customFields: [{ id: "f-role", name: "Roles", type: "tags" }],
  folders: [{ id: "fo-1", parentId: null, name: "Littles", description: "", emoji: "🌱", color: 0xff8800, sort: 0, privacy: [] }],
  members: [
    { id: "m-1", name: "Ash", pronouns: "they", avatar: "https://x.test/a.png", description: "hi", color: 0, archived: false, custom: false, sort: 0, folders: ["fo-1"], fields: { "f-role": ["host", "protector"] }, privacy: ["b-friends"] },
    { id: "m-2", name: "Bee", pronouns: "", avatar: "media/b.png", description: null, color: "#112233", archived: true, custom: false, sort: 1, folders: [], fields: {}, privacy: ["b-friends", "b-none"] },
    { id: "m-3", name: "Cy", folders: [], fields: {}, privacy: [] },
  ],
  polls: [{}], gallery: [],
};

assert.equal(F.isFloralityJson(json), true);
assert.equal(F.isFloralityJson({ members: [], customFields: [] }), false, "Simply Plural shape is not Florality");
const jm = F.normaliseFloralityJson(json);
assert.equal(jm.buckets.find((b) => b.id === "b-none").friendAccess, false);
assert.equal(jm.buckets.find((b) => b.id === "b-friends").friendAccess, null);
assert.equal(jm.fields[0].type, "list");
assert.equal(jm.folders[0].color, "#ff8800");
const ash = jm.members[0];
assert.equal(ash.fieldValues["f-role"], "host, protector");
assert.equal(ash.avatarUrl, "https://x.test/a.png");
assert.equal(jm.members[1].avatarUrl, "", "relative media paths are not used");
assert.equal(jm.members[1].archived, true);
assert.deepEqual(jm.notImported, { polls: 1 });

// Privacy: nothing is shared by default; a no-access bucket always wins.
const none = F.defaultSharedBuckets();
assert.equal(F.memberSharedWithFriends(ash, none, jm.buckets), false);
const share = new Set(["b-friends"]);
assert.equal(F.memberSharedWithFriends(ash, share, jm.buckets), true);
assert.equal(F.memberSharedWithFriends(jm.members[1], share, jm.buckets), false, "also in Complete privacy");
assert.equal(F.memberSharedWithFriends(jm.members[2], share, jm.buckets), false, "in no bucket");

// HTML data-export page.
const pre = (o) => `<pre>${JSON.stringify(o, null, 2).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;").replace(/("[^"]*":)/g, '<span class="tok-key">$1</span>')}</pre>`;
const section = (title, data) => `<section class="section"><div class="section-head"><h2>${title}</h2><p>x</p></div><details><summary>View raw data</summary>${pre(data)}</details></section>`;
const html = `<!doctype html><html><head><title>Floralites Data Export</title></head><body><h1>Floralites User Data Export</h1>
${section("Directories", { root: { _id: "root" }, list: [{ _id: "root", name: "Root" }, { _id: "d-1", name: "Inner <world>", parentId: "root", icon: "emoji:🌙" }] })}
${section("Groups", { list: [] })}
${section("Systems", { sideSystems: [{ _id: "s", name: "Our system" }] })}
${section("Members", { active: [{ _id: "m-1", name: "ash", displayName: "Ash", pronouns: "they", aboutTags: ["kind"], directoryId: "d-1", avatarUrl: null }], archived: [{ _id: "m-9", name: "Old" }],
  customFieldsByMember: { "m-1": [{ definitionId: "f-age", label: "Age", type: "text", value: "12" }] } })}
${section("Entries", { active: [{ id: "n-1", title: null, content: "A note", createdAt: 1794790602072, memberIds: [], memberId: "m-1" }, { id: "n-2", title: null, content: "", memberIds: [] }] })}
${section("Front state", { current: { sessions: { activeSessions: [{ _id: "s-2", memberId: "m-1", startedAt: 1794790856271, typeKey: "primary" }] } },
  history: [{ session: { _id: "s-2", memberId: "m-1", startedAt: 1794790856271, typeKey: "primary" } }, { session: { _id: "s-1", memberId: "m-1", startedAt: 1794729600000, endedAt: 1794790800000, note: "tired & <ok>" } }] })}
${section("Privacy buckets", { buckets: [{ _id: "b-friends", name: "Regular friends", friendPermissions: { members_view: "read" } }, { _id: "b-none", name: "Locked", friendPermissions: { members_view: "none" } }],
  assignmentsByBucket: { "b-friends": { memberIds: ["m-1"] }, "b-none": { memberIds: [] } } })}
${section("Member statuses", { definitions: [{ id: "x" }] })}
</body></html>`;

assert.equal(F.isFloralityHtml(html), true);
assert.equal(F.isFloralityHtml("<html><body>hello</body></html>"), false);
const hm = F.normaliseFloralityHtml(html);
assert.equal(hm.systemName, "Our system");
assert.equal(hm.folders.length, 1);
assert.equal(hm.folders[0].name, "Inner <world>");
assert.equal(hm.folders[0].emoji, "🌙");
assert.equal(hm.members.length, 2);
const hAsh = hm.members[0];
assert.equal(hAsh.name, "ash"); assert.equal(hAsh.alias, "Ash");
assert.deepEqual(hAsh.tags, ["kind"]);
assert.deepEqual(hAsh.folderIds, ["d-1"]);
assert.deepEqual(hAsh.bucketIds, ["b-friends"]);
assert.equal(hAsh.fieldValues["f-age"], "12");
assert.equal(hm.members[1].archived, true);
assert.equal(hm.buckets.find((b) => b.id === "b-friends").friendAccess, true);
assert.equal(hm.buckets.find((b) => b.id === "b-none").friendAccess, false);
assert.equal(hm.fronts.length, 2, "current + history share ids; each once");
assert.equal(hm.fronts[0].note, "tired & <ok>");
assert.equal(hm.fronts[1].end, null);
assert.equal(hm.notes.length, 1, "empty notes skipped");
assert.deepEqual(hm.notes[0].memberIds, ["m-1"]);
assert.deepEqual(hm.notImported, { statuses: 1 });

assert.equal(F.frontNotePayload("", "t"), "");
assert.deepEqual(JSON.parse(F.frontNotePayload("hi", "t")), [{ text: "hi", timestamp: "t" }]);

console.log("florality: all tests passed");
