#!/usr/bin/env node
// The house's Write room (boards 05-Journals and 14-ChatPhone): journal
// folders (saved list + entries, sub-folders, renames, removes), finding
// entries (folder, words, tags, authors, the fronter view; locked text is
// never searched), the by-line, who was in front then, word counts, the
// Info facts and "What this entry did"; the chat's speaker, the private
// gate, the channel order and rows. Also: the room is drawn only on
// /journals and /chat, the old pages are gated, both frames mount it, the
// phone runs it edge to edge, it writes only through the write paths, and
// its classes don't clash with the kit's. Pure: storage is an in-memory
// stand-in; nothing real is written.
//
//   node scripts/test-house-write.mjs

import assert from "node:assert/strict";
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { readFileSync, readdirSync } from "node:fs";

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

function memStore(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
}
globalThis.localStorage = memStore();
globalThis.sessionStorage = memStore();
globalThis.window = { dispatchEvent() {}, addEventListener() {}, removeEventListener() {} };
globalThis.CustomEvent = class { constructor(t) { this.type = t; } };

const M = await import("../src/house/write/writeModel.js");
const S = await import("../src/lib/houseSwitch.js");

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`ok  ${name}`); };
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const E = [
  { id: "e1", title: "A slow Friday", content: "<p>Tea helped. Foggy.</p>", folder: "Daily", author_alter_id: "river", co_author_alter_ids: ["ash"], tags: ["#Fog"] },
  { id: "e2", title: "Dream: the lighthouse", content: "lighthouse waves", folder: "Dreams/Lucid", author_alter_id: "pip" },
  { id: "e3", title: "Locked entry", content: "U2FsdGVkX1+secret", is_encrypted: true, author_alter_id: "sable" },
  { id: "e4", title: "After the switch", content: "who came", entry_type: "switch_log", author_alter_id: "ash" },
];
const altersById = { river: { id: "river", name: "River", color: "#c8c" }, ash: { id: "ash", name: "Ash", color: "#8bb" }, pip: { id: "pip", name: "Pip" }, sable: { id: "sable", name: "Sable" } };
const label = (a) => a.name;

test("folders: saved ones plus every entry's, with their parents, sorted", () => {
  assert.deepEqual(M.folderPaths(E, ["For therapy"]), ["Daily", "Dreams", "Dreams/Lucid", "For therapy"]);
  const rows = M.folderRows(M.folderPaths(E, []), E, []);
  const dreams = rows.find((r) => r.path === "Dreams");
  assert.equal(dreams.count, 1, "a folder counts its sub-folders' entries");
  assert.equal(dreams.hasKids, true);
  assert.equal(rows.find((r) => r.path === "Dreams/Lucid").depth, 1);
  assert.ok(!M.folderRows(M.folderPaths(E, []), E, ["Dreams"]).some((r) => r.path === "Dreams/Lucid"), "a folded folder hides its children");
});

test("saved folders: add, rename (with sub-folders), remove, all in the old page's key", () => {
  const store = memStore();
  assert.deepEqual(M.addSavedFolder(store, "Dreams/Lucid"), ["Dreams/Lucid"]);
  assert.equal(store.getItem(M.FOLDERS_KEY), JSON.stringify(["Dreams/Lucid"]));
  assert.deepEqual(M.addSavedFolder(store, "Dreams/Lucid"), ["Dreams/Lucid"], "no duplicates");
  assert.deepEqual(M.savedFoldersAfter(["Dreams", "Dreams/Lucid", "Daily"], { rename: { from: "Dreams", to: "Night" } }), ["Night", "Night/Lucid", "Daily"]);
  assert.deepEqual(M.savedFoldersAfter(["Dreams", "Dreams/Lucid", "Daily"], { remove: "Dreams" }), ["Daily"]);
  assert.deepEqual(M.readSavedFolders(memStore({ [M.FOLDERS_KEY]: "not json" })), [], "garbage reads as none, never throws");
});

test("finding entries: folder, words, tags, authors, the fronter view", () => {
  const ids = (o) => M.filterEntries(E, o).map((e) => e.id);
  assert.deepEqual(ids({}), ["e1", "e2", "e3", "e4"]);
  assert.deepEqual(ids({ folder: "Dreams" }), ["e2"], "a folder includes its sub-folders");
  assert.deepEqual(ids({ folder: M.SWITCH_FOLDER }), ["e4"]);
  assert.deepEqual(ids({ search: "foggy" }), ["e1"]);
  assert.deepEqual(ids({ search: "secret" }), [], "locked text is never searched");
  assert.deepEqual(ids({ search: "locked" }), ["e3"], "a locked entry's title still is");
  assert.deepEqual(ids({ tag: "Fog" }), ["e1"], "tags match as the old page does (the # dropped)");
  assert.deepEqual(ids({ authorId: "ash" }), ["e1", "e4"], "co-authors count");
  assert.deepEqual(ids({ fronterIds: ["pip"] }), ["e2"]);
  assert.deepEqual(ids({ fronterIds: [] }), [], "fronter view with nobody in front shows nothing");
  assert.deepEqual(M.allTags(E), ["Fog"]);
  assert.deepEqual(M.authorIdsOf(E).sort(), ["ash", "pip", "river", "sable"]);
});

test("an entry in words: by-line, words, facts, effects", () => {
  const by = M.byLine(E[0], { altersById, label, systemName: "Crew" });
  assert.equal(by.lead, "River"); assert.deepEqual(by.co, ["Ash"]); assert.equal(by.text, "River, Ash");
  assert.equal(M.byLine({ id: "x" }, { altersById, label, systemName: "Crew" }).lead, "Crew", "nobody signed: the system's name");
  assert.equal(M.wordCount(E[0]), 3);
  assert.equal(M.wordCount(E[2]), null, "a locked entry's words are never counted");
  const facts = M.entryFacts(E[2], { terms: { Fronting: "Out", Switch: "Shift" }, writtenBy: "Sable" });
  assert.ok(facts.some(([k]) => k === "Out then"), "the person's words");
  assert.ok(facts.some(([k, v]) => k === "Locked" && v === "With a password"));
  const fx = M.effectRows([
    { id: "n1", source_type: "journal", log_type: "mention", mentioned_alter_id: "ash", source_label: "Journal" },
    { id: "n2", source_type: "journal", log_type: "mention", mentioned_alter_id: "pip", source_label: "Whisper in Journal", preview_text: "the secret" },
    { id: "n3", source_type: "journal", log_type: "authored", author_alter_id: "river" },
    { id: "n4", source_type: "chat", log_type: "mention", mentioned_alter_id: "ash" },
  ], { altersById, label });
  assert.deepEqual(fx.map((r) => r.text), ["Let Ash know they were mentioned", "Sent a private whisper", "Signed the entry for River"]);
  assert.ok(!JSON.stringify(fx).includes("secret"), "a whisper never says what was whispered");
  assert.equal(M.pickEntry([], "x"), null);
  assert.equal(M.pickEntry(E, "gone").id, "e1", "a missing pick falls back to the newest");
});

test("who was in front then", () => {
  const at = Date.parse("2026-11-20T13:40:00Z");
  const sessions = [
    { alter_id: "river", is_primary: false, start_time: "2026-11-20T09:00:00Z", end_time: "2026-11-20T15:00:00Z" },
    { alter_id: "ash", is_primary: true, start_time: "2026-11-20T12:00:00Z" },
    { alter_id: "pip", start_time: "2026-11-20T14:00:00Z" },
    { alter_id: "sable", start_time: "2026-11-20T08:00:00Z", end_time: "2026-11-20T09:00:00Z" },
    { alter_id: "gone", start_time: "2026-11-20T08:00:00Z", removed_at: "x" },
  ];
  assert.deepEqual(M.frontingAt(sessions, at), ["ash", "river"], "primary first, ended and removed left out");
  assert.deepEqual(M.frontingAt(sessions, "nonsense"), []);
});

test("chat: speaker, private gate, order, rows", () => {
  const front = [{ alter_id: "ash", is_active: true }, { alter_id: "river", is_primary: true, is_active: true }];
  assert.deepEqual(M.frontIds(front).sort(), ["ash", "river"]);
  assert.equal(M.defaultSpeaker(front, []), "river");
  assert.equal(M.defaultSpeaker([], [{ id: "pip" }]), "pip");
  const priv = { id: "p", is_private: true, member_alter_ids: ["sable"] };
  assert.equal(M.privateVisible(priv, new Set(["ash"]), new Set()), false, "hidden while none of its members is in front");
  assert.equal(M.privateVisible(priv, new Set(["sable"]), new Set()), true);
  assert.equal(M.privateVisible(priv, new Set(), new Set(["p"])), true, "View anyway this visit");
  assert.equal(M.privateVisible({ id: "g" }, new Set(), new Set()), true);
  const cat = { id: "c1", name: "Plans", collapsed: false };
  const tree = { rootNodes: [{ category: cat, subNodes: [], channels: [{ id: "plans" }] }], uncategorized: [{ id: "general" }] };
  const channels = [{ id: "plans" }, { id: "general" }, { id: "p", is_private: true, sort_order: 1 }, { id: "q", is_private: true, is_archived: true }];
  assert.deepEqual(M.channelOrder(tree, channels).map((c) => c.id), ["plans", "general", "p"], "categories, then loose, then private; archived left out");
  assert.equal(M.pickChannel(M.channelOrder(tree, channels), "nope").id, "plans");
  assert.deepEqual(M.channelRows(tree).map((r) => `${r.kind}:${r.id}`), ["category:c1", "channel:plans", "channel:general"]);
  assert.deepEqual(M.channelRows({ ...tree, rootNodes: [{ ...tree.rootNodes[0], category: { ...cat, collapsed: true } }] }).map((r) => r.id), ["c1", "general"], "a folded category hides its channels");
  assert.equal(M.memberWords({ member_alter_ids: ["ash", "river", "ghost"] }, altersById, label), "Ash + River");
});

test("the Write room is drawn by the house only on /journals and /chat", () => {
  assert.equal(S.houseWriteRoom("/journals"), "journals");
  assert.equal(S.houseWriteRoom("/journals/"), "journals");
  assert.equal(S.houseWriteRoom("/chat"), "chat");
  assert.equal(S.houseWriteRoom("/chats"), null);
  assert.equal(S.houseWriteRoom("/journal"), null);
  assert.equal(S.houseRebuiltRoom("/journals"), true);
  assert.equal(S.houseRebuiltRoom("/chat"), true);
  assert.equal(M.writeRoomOf("/chat"), "chat");
  const app = read("src/App.jsx");
  assert.match(app, /path="\/journals" element=\{<HouseRoomGate><Journals \/><\/HouseRoomGate>\}/);
  assert.match(app, /path="\/chat" element=\{<HouseRoomGate><Chat \/><\/HouseRoomGate>\}/);
});

test("both frames mount both rooms; the phone runs them edge to edge", () => {
  for (const f of ["src/house/frame/HouseFrame.jsx", "src/house/phone/HousePhoneFrame.jsx"]) {
    const t = read(f);
    assert.ok(t.includes("house/write/HouseJournals") && t.includes("house/write/HouseChat"), `${f} loads the rooms`);
    assert.ok(/writeRoom === "journals"/.test(t) && /writeRoom === "chat"/.test(t), `${f} mounts them`);
  }
  assert.ok(/altersRoom \|\| writeRoom( \|\| notebookRoom)? \? "px-0"/.test(read("src/house/phone/HousePhoneFrame.jsx")));
  assert.ok(/ownDocks[^;]*writeRoom/.test(read("src/house/frame/HouseFrame.jsx")), "the room draws its own side panels");
});

test("the room writes only through the write paths", () => {
  const dir = "src/house/write";
  const files = readdirSync(new URL(`../${dir}`, import.meta.url)).filter((f) => /\.jsx?$/.test(f)).map((f) => `${dir}/${f}`);
  for (const f of files) {
    const text = read(f).replace(/\/\/.*$/gm, "");
    assert.ok(!/(entities|localEntities|base44)\b[^;]*\.(create|update|delete|bulkDelete)\(/.test(text), `${f} writes a record directly`);
    assert.ok(!/encryptContent|setItem\(\s*["'`]symphony_/.test(text), `${f} rewrites text or settings by hand`);
  }
  const j = read(`${dir}/HouseJournals.jsx`);
  for (const fn of ["trashJournalEntry", "updateJournalEntry", "moveEntriesOutOfFolder", "renameEntriesFolder", "trashWithUndo", "JournalEditorModal"]) assert.ok(j.includes(fn), `Journals uses ${fn}`);
  const c = read(`${dir}/HouseChat.jsx`);
  for (const fn of ["createDefaultChannel", "toggleChatCategoryCollapsed", "migrateLegacyChatCategories", "ChannelView", "ChannelDialog", "ChatChannelTree"]) assert.ok(c.includes(fn), `Chat uses ${fn}`);
  assert.ok(/channelsLoaded/.test(c) && /"general"/.test(c), "the first channel is made only once the list has loaded, never beside a general");
});

test("deep links and highlights survive", () => {
  const j = read("src/house/write/HouseJournals.jsx");
  for (const k of ['params.get("id")', 'params.get("folder")', 'params.get("author")', 'params.get("compose")', 'params.get("import")', "useMentionHighlight", "useHighlightScroll", "data-highlight-id", "item-${e.id}"]) assert.ok(j.includes(k), `Journals keeps ${k}`);
  const c = read("src/house/write/HouseChat.jsx");
  for (const k of ['params.get("channel")', 'params.get("message")', "focusMessageId", "onMessageFocused"]) assert.ok(c.includes(k), `Chat keeps ${k}`);
});

test("hw- classes are the room's own and the CSS is the room's", () => {
  for (const f of ["src/house/kit/frame/frameKit.css", "src/house/kit/panels.css", "src/house/kit/kit.css", "src/house/alters/alters.css"]) {
    let t = ""; try { t = read(f); } catch { continue; }
    assert.ok(!/\.hw-/.test(t), `${f} has no hw- classes`);
  }
  const css = read("src/house/write/write.css");
  assert.ok(!/!important/.test(css));
  assert.ok(!/font-size:\s*\d+px/.test(css), "no px font sizes");
  for (const sel of css.replace(/\/\*[\s\S]*?\*\//g, "").split("}").map((r) => r.split("{")[0])) {
    for (const part of sel.split(",")) if (part.includes(".px-chat")) assert.ok(/\.hw-c\b/.test(part), `"${part.trim()}" restyles the chat surface outside .hw-c`);
  }
  for (const f of ["HouseJournals.jsx", "HouseChat.jsx"]) assert.ok(read(`src/house/write/${f}`).includes("write/write.css"), `${f} imports its CSS (the phone needs it)`);
});

console.log(`\n${passed} passed.`);
