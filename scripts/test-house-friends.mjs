#!/usr/bin/env node
// The house's Friends room (board 22-Friends): the shared words and payload
// readers both houses use, that the push's share mode and per-friend rule
// (now shared pure functions) give exactly what the old inline code gave,
// the room's model (which friend is open, the "right now they would see"
// words, the levels), that the room is drawn only on /friends with the old
// page gated, both frames mount it, the phone runs it edge to edge with its
// tools, it talks to the relay and writes only through the old page's hooks,
// every old function is still reachable, and its classes stay its own with
// thin edges. Pure: nothing is written anywhere and nothing is sent.
//
//   node scripts/test-house-friends.mjs

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

const src = pathToFileURL(new URL("../src/", import.meta.url).pathname).href;
register(`data:text/javascript,${encodeURIComponent(`
  export async function resolve(spec, ctx, next) {
    if (spec.startsWith("@/")) {
      let url = ${JSON.stringify(src)} + spec.slice(2);
      if (!/\\.[a-z]+$/.test(url)) url += ".js";
      return next(url, ctx);
    }
    return next(spec, ctx);
  }
`)}`);
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };

const V = await import("../src/lib/friendsView.js");
const FF = await import("../src/lib/friendFronters.js");
const M = await import("../src/house/friends/friendsModel.js");
const S = await import("../src/lib/houseSwitch.js");

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const terms = { alter: "part", Alter: "Part", alters: "parts", Alters: "Parts", fronting: "out", front: "outside", fronter: "outer", system: "crew" };
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// The push's per-friend code as it was before it was shared (v0.395.0,
// friendsApi.pushFrontStatus), kept verbatim to pin the shared functions.
function oldShareMode(rawFronters, shareMode) {
  return (rawFronters || []).map((f) => {
    const { pronouns, preferences, ...rest } = f;
    if (shareMode === "name_prefs") return { ...rest, pronouns: pronouns || "", preferences: preferences || [] };
    if (shareMode === "prefs_only") {
      const display = (pronouns || "").trim() || "?";
      return { ...rest, name: display, initial: display[0] || "?", pronouns: pronouns || "", preferences: preferences || [] };
    }
    return rest;
  });
}
function oldPerFriend(fronters, perFriendVisibility, levels, basePrivacy) {
  const perFriendFronters = {};
  for (const [friendId, vis] of Object.entries(perFriendVisibility)) {
    if (!vis) continue;
    if (vis.privacyOverride === "hidden" || (FF.friendUsesLevels(vis) && levels === null)) {
      perFriendFronters[friendId] = { fronters: [], privacyLevel: "hidden" };
      continue;
    }
    const theirs = FF.friendFrontersFor(fronters, vis, levels || []);
    if (vis.privacyOverride === "count_only") {
      perFriendFronters[friendId] = { fronters: theirs.map((f) => ({ ...f, name: "?", initial: "?", color: null, pronouns: undefined, preferences: undefined })), privacyLevel: "count_only" };
    } else if (FF.friendUsesLevels(vis) || (vis.hiddenAlterIds || []).length) {
      perFriendFronters[friendId] = { fronters: theirs, privacyLevel: vis.privacyOverride || basePrivacy };
    }
  }
  return perFriendFronters;
}

const alters = [
  { id: "a", name: "Ash", pronouns: "she/her", color: "#aa0000", privacy_levels: ["L0"] },
  { id: "b", name: "Bea", friends_visible: true, privacy_levels: ["L1"] },
  { id: "c", name: "Cy", friends_visible: false, pronouns: "" },
];
const sessions = ["a", "b", "c"].map((id, i) => ({ id: `s${i}`, alter_id: id, is_active: true, is_primary: i === 0 }));
const levels = [
  { id: "L0", number: 0, name: "Public", fields: { name: true, color: true, pronouns: true } },
  { id: "L1", number: 1, name: "Close", fields: { name: false, color: true, pronouns: false } },
];

test("the share mode and the per-friend rule are exactly the push's old code", () => {
  const raw = FF.buildFriendFronters({ activeSessions: sessions, alters, groups: [] });
  for (const mode of ["name", "name_prefs", "prefs_only", undefined]) {
    assert.deepEqual(FF.applyShareMode(raw, mode || "name"), oldShareMode(raw, mode || "name"), `share mode ${mode}`);
  }
  const vis = {
    none: undefined,
    hidden: { privacyOverride: "hidden" },
    count: { privacyOverride: "count_only" },
    names: { privacyOverride: "names" },
    hides: { hiddenAlterIds: ["a"] },
    lv0: { allowedLevelIds: ["L0"] },
    lv1count: { allowedLevelIds: ["L1"], privacyOverride: "count_only" },
    shown: { shownAlterIds: ["c"] },
  };
  for (const mode of ["name", "name_prefs", "prefs_only"]) {
    const fronters = FF.applyShareMode(raw, mode);
    for (const lv of [levels, null, []]) {
      for (const base of ["names", "count_only", "hidden"]) {
        const ours = {};
        for (const [id, v] of Object.entries(vis)) { const own = FF.perFriendView(fronters, v, lv, base); if (own) ours[id] = own; }
        assert.deepEqual(ours, oldPerFriend(fronters, vis, lv, base), `${mode} / ${lv === null ? "null" : lv.length} levels / ${base}`);
      }
    }
  }
  const api = read("src/lib/friendsApi.js");
  assert.ok(api.includes("applyShareMode(rawFronters,") && api.includes("perFriendView(fronters, vis, levels, basePrivacy)"), "the push runs the shared functions");
});

test("what a friend sees: their own entry, else the shared list at the global level", () => {
  const fronters = FF.applyShareMode(FF.buildFriendFronters({ activeSessions: sessions, alters, groups: [] }), "name");
  const plain = FF.whatFriendSees(fronters, undefined, levels, "names");
  assert.deepEqual(plain.fronters.map((f) => f.name), ["Ash", "Bea"], "Cy's switch is off");
  assert.equal(plain.privacyLevel, "names");
  assert.equal(FF.whatFriendSees(fronters, { privacyOverride: "names" }, levels, "count_only").privacyLevel, "count_only", "a names override alone follows the global level, as the push does");
  const lv = FF.whatFriendSees(fronters, { allowedLevelIds: ["L1"] }, levels, "names");
  assert.deepEqual(lv.fronters.map((f) => f.name), ["?"], "a level without names shows ?");
  assert.equal(M.seeWords(plain, terms), "Ash and Bea out (2)");
  assert.equal(M.seeWords(FF.whatFriendSees(fronters, { privacyOverride: "count_only" }, levels, "names"), terms), "2 out, no names");
  assert.equal(M.seeWords(FF.whatFriendSees(fronters, { privacyOverride: "hidden" }, levels, "names"), terms), "nothing about who's out");
  assert.equal(M.seeWords({ fronters: [], privacyLevel: "names" }, terms), "no one out");
});

test("the shared words and payload readers", () => {
  const ft = V.buildTermsFromFriend({ front: "out", alter: "part" });
  assert.equal(ft.fronting, "outing");
  assert.equal(ft.alters, "parts");
  assert.equal(V.buildTermsFromFriend(null).fronters, "fronters", "a missing payload falls back");
  assert.deepEqual(V.sharedGroupLabels({ groups: ["A", { name: "B" }, null] }), ["A", "B"]);
  assert.deepEqual(V.sharedGroupLabels({ groups: "Solo" }), ["Solo"]);
  assert.deepEqual(V.sharedCustomFieldPairs({ customFields: { k: "v" } }), [["k", "v"]]);
  assert.deepEqual(V.sharedCustomFieldPairs({ customFields: [{ name: "n", value: { x: 1 } }, ["a", "b"]] }), [["n", '{"x":1}'], ["a", "b"]]);
  assert.equal(V.friendFrontSummary({ front: { privacyLevel: "hidden" } }), "Fronting hidden");
  assert.equal(V.friendFrontSummary({ front: { privacyLevel: "count_only", fronters: [{}, {}] } }), "2 fronters");
  assert.equal(V.friendFrontSummary({ front: { fronters: [{ name: "L" }, { name: "E" }] } }), "L, E");
  assert.equal(V.friendFrontSummary({}), "No one fronting");
  assert.equal(V.frontLevelLabel("count_only"), "Count only");
  assert.equal(V.shareModeLabel("prefs_only"), "Pronouns and preferences only (no name)");
  const page = read("src/pages/Friends.jsx");
  assert.ok(page.includes('from "@/lib/friendsView"') && !/function buildTermsFromFriend|function sharedGroupLabels/.test(page), "the old page reads the same words");
});

test("the room's model: the open friend, the head line, the levels", () => {
  assert.equal(M.openFriendId({ friendView: "u1" }), "u1");
  assert.equal(M.openFriendId(null), null);
  assert.equal(M.openFriendId({ friendView: 3 }), null);
  const fs = [{ userId: "a" }, { userId: "b" }];
  assert.equal(M.shownFriend(fs, "b").userId, "b");
  assert.equal(M.shownFriend(fs, "zz").userId, "a", "a desktop always has one open");
  assert.equal(M.shownFriend(fs, null, { phone: true }), null, "a phone shows the list first");
  assert.equal(M.friendSinceWords({ systemName: "Moth", addedAt: "2026-10-02T10:00:00Z" }, { verified: true, dateWords: () => "2 Oct" }), "Moth · Friends since 2 Oct · verified");
  assert.equal(M.friendSinceWords({ addedAt: "nonsense" }, { dateWords: () => "x" }), "");
  assert.equal(M.effectiveLevel(null, "count_only"), "count_only");
  assert.ok(M.overrideWords(null, "names").startsWith("none, follows your default"));
  const rows = M.levelRows("count_only", terms);
  assert.deepEqual(rows.map((r) => r.id), ["hidden", "count_only", "names"]);
  assert.equal(rows.find((r) => r.isDefault).id, "count_only");
  assert.equal(rows[1].hint, '"2 out"', "in the person's words");
  const fa = (a) => a.name;
  assert.deepEqual(M.filterAltersByText([{ name: "Ash", alias: "Ember" }, { name: "Bea" }], "emb", fa).map((a) => a.name), ["Ash"]);
  assert.equal(M.theirLevelWords("count_only"), "they share a count only");
  assert.equal(M.friendRowSub("L", { notifyOnChange: true }), "L · notify on");
});

test("the room is drawn by the house only on /friends; the old page is gated", () => {
  assert.equal(S.houseFriendsRoom("/friends"), true);
  assert.equal(S.houseFriendsRoom("/friends/"), true);
  assert.ok(!S.houseFriendsRoom("/friendsx"));
  assert.equal(S.houseRebuiltRoom("/friends"), true);
  assert.match(read("src/App.jsx"), /path="\/friends" element=\{<HouseRoomGate><FriendsPage \/><\/HouseRoomGate>\}/);
});

test("both frames mount the room; the phone runs it edge to edge with its tools", () => {
  for (const f of ["src/house/frame/HouseFrame.jsx", "src/house/phone/HousePhoneFrame.jsx"]) {
    const t = read(f);
    assert.ok(t.includes("house/friends/HouseFriends"), `${f} loads the room`);
    assert.ok(/<HouseFriends /.test(t), `${f} mounts it`);
  }
  const phone = read("src/house/phone/HousePhoneFrame.jsx");
  assert.ok(/\|\| friendsRoom \? "px-0"/.test(phone), "the phone runs it edge to edge");
  assert.ok(/roomTools = [^;]*friendsRoom/.test(phone), "the phone frame reads the room's tools");
  assert.ok(/ownDocks[^;]*friendsRoom/.test(read("src/house/frame/HouseFrame.jsx")), "the room draws its own columns");
  const room = read("src/house/friends/HouseFriends.jsx");
  assert.ok(room.includes("useRoomTools") && room.includes('ariaLabel: "Add a friend"'), "the phone's + and ⋯ come from the room");
  assert.ok(room.includes('<h1 className="sr-only">Friends</h1>'), "the page name is a hidden heading on a computer");
  assert.ok(!/position:\s*fixed/.test(read("src/house/friends/friends.css")), "nothing floats over scrolling content");
  assert.ok(!/[?&]friend=|search:\s*`\?friend/.test(room) && room.includes("friendViewState("), "the open friend lives in the history entry, never the address");
});

test("network and writes only through the old page's hooks and write paths", () => {
  const room = read("src/house/friends/HouseFriends.jsx");
  const model = read("src/house/friends/friendsModel.js");
  for (const [f, text0] of [["HouseFriends.jsx", room], ["friendsModel.js", model]]) {
    const text = text0.replace(/\/\/.*$/gm, "");
    assert.ok(!/\bfetch\(|XMLHttpRequest|sendBeacon|WebSocket/.test(text), `${f} talks to a server itself`);
    assert.ok(!/from "@\/lib\/friendsApi"/.test(text), `${f} calls the relay directly (use the shared hooks)`);
    assert.ok(!/\.(create|update|delete|bulkDelete|bulkCreate)\(/.test(text), `${f} writes a record itself`);
    assert.ok(!/localStorage\.(setItem|removeItem)/.test(text), `${f} keeps state in localStorage`);
  }
  assert.ok(room.includes("useFriendsPage()") && room.includes("useFriendView("), "reads, effects and handlers are the old page's");
  assert.ok(room.includes("setAlterFields(a.id, { friends_visible: !on })") && room.includes("await confirm({"), "Show when fronting writes through alterEntry and asks before sharing more");
  assert.ok(room.includes("whatFriendSees(") && room.includes("applyShareMode("), "the preview is the push's own rule");
  const page = read("src/pages/Friends.jsx");
  assert.ok(page.includes("useFriendsPage()") && page.includes("useFriendView("), "the old page runs the same hooks");
  const hook = read("src/components/friends/useFriendView.js");
  assert.ok(hook.includes("await confirm({ title: `Remove ${friend.displayName"), "removing a friend still asks first");
  const ph = read("src/components/friends/useFriendsPage.js");
  for (const k of ["fetchFriendsList", "ensureKeyPair", "publishPublicKey", "pushAlterShares", "pushCurrentFront", "save-push-sub", "friends_front_snapshots", "respondToRequest", "removeFriend", "toggleNotify", "saveFriendVisibility", "setFriendVerified", "sendFriendRequest", "refetchInterval: 30_000", "push_only"]) {
    assert.ok(ph.includes(k), `the shared page hook keeps ${k}`);
  }
});

test("every old Friends function is reachable in the room", () => {
  const room = read("src/house/friends/HouseFriends.jsx");
  const doors = {
    "copy my code": "page.copyCode", "send a request": "page.adder.handleSend", "accept / decline": 'handleRespond(req.fromUserId, "approve")',
    "requests sent": "pendingSent.map", "profile (create, edit, delete)": "<ProfileSetupModal", "refresh": "refetchFriends()",
    "per-friend level": "handlePrivacyOverride", "back to the default": 'handlePrivacyOverride("global")', "notify on change": "handleNotify(",
    "levels slider": "<SliderRow", "pick specific levels": "Pick specific levels", "who they can see": "they can see",
    "hide from this friend": "toggleAlterHidden(", "their members": "sharedMembers", "safety number": "safetyNum", "verify": "setVerified(",
    "remove": "handleRemove", "relay explainer": "<PrivacyDisclaimer", "encryption card": "<E2EInfoCard", "not-shown notice": "<FrontShareNotice",
    "manage levels": "<PrivacyLevelsManager", "members of a level": "<LevelMembersModal", "levels per alter": "<PerAlterLevels", "their preferences": "PREF_LEVELS",
    "show me around": 'openPageTour("/friends")',
  };
  for (const [what, needle] of Object.entries(doors)) assert.ok(room.includes(needle), `the room has ${what}`);
  assert.ok(room.includes("useAlterLabel") && room.includes("useFrontersFirst"), "names are the person's labels, whoever's in front first");
  assert.ok(!/<select\b|type="(time|date|color)"/.test(room), "no browser-native pickers");
});

test("hfr- classes are the room's own and the CSS keeps thin edges", () => {
  const dir = new URL("../src/house/", import.meta.url);
  for (const d of readdirSync(dir)) {
    let fs = []; try { fs = readdirSync(new URL(`${d}/`, dir)); } catch { continue; }
    for (const f of fs) if (f.endsWith(".css") && !(d === "friends" && f === "friends.css")) {
      assert.ok(!/\.hfr-|\.hfr\b/.test(read(`src/house/${d}/${f}`)), `src/house/${d}/${f} has no hfr- classes`);
    }
  }
  const css = read("src/house/friends/friends.css");
  assert.ok(!/!important/.test(css));
  assert.ok(!/font-size:\s*\d+px/.test(css), "no px font sizes");
  assert.ok(!/(outline|border|box-shadow)[^;]*\b2px\b/.test(css), "edges are the thin pixel line, never a hard 2px");
  for (const sel of css.replace(/\/\*[\s\S]*?\*\//g, "").split("}").map((r) => r.split("{")[0]).filter((s) => s.trim() && !s.includes("@media"))) {
    for (const part of sel.split(/,(?![^(]*\))/)) assert.ok(/\.hfr[-\s.[:]|\.hfr$|\.hfr\b/.test(part), `"${part.trim()}" styles something outside the room`);
  }
  assert.ok(read("src/house/friends/HouseFriends.jsx").includes("friends/friends.css"), "the room imports its CSS (the phone needs it)");
  assert.ok(/\.hfr--phone \.hfr-floor \{[^}]*var\(--house-space-2/.test(css), "the phone keeps the slim gutter");
  for (const f of ["src/house/friends/HouseFriends.jsx", "src/house/friends/friendsModel.js"]) {
    assert.ok(!/#[0-9a-f]{6}\b/i.test(read(f).replace(/\/\/.*$/gm, "")), `${f}: house colours, not hex`);
  }
});

test("tour anchors the room adds have steps", () => {
  const tour = read("src/components/onboarding/FeatureTour.jsx");
  const room = read("src/house/friends/HouseFriends.jsx");
  for (const a of ["friends-code", "friends-list", "friends-what-they-see", "friends-levels", "friends-show-when", "friends-member-levels", "friends-how"]) {
    assert.ok(room.includes(`data-tour="${a}"`) || room.includes(`tour: "${a}"`), `the room has ${a}`);
    assert.ok(tour.includes(`"${a}"`), `the tour has a step for ${a}`);
  }
});

let failed = 0;
for (const t of tests) {
  try { await t.fn(); console.log(`ok   ${t.name}`); }
  catch (e) { failed += 1; console.log(`FAIL ${t.name}\n     ${e.message}`); }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`);
if (failed) process.exit(1);
