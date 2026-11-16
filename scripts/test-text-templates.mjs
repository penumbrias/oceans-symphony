#!/usr/bin/env node
// Checks the pure text-template helpers (src/lib/textTemplateModel.js):
// titles from the first line, plain-box ↔ HTML round trips, the folder tree
// (loops, self-parents and missing parents never hide a folder), search,
// and resolving a typed name for ~template:load.
//
//   node scripts/test-text-templates.mjs

import assert from "node:assert/strict";
import {
  templatePlainText, firstLine, templateTitle, fieldTextToHtml, htmlToFieldText, isBlankContent,
  childFolders, flattenFolderTree, folderPath, wouldNestFolder, descendantFolderIds, templatesIn,
  countTemplatesUnder, searchTemplates, resolveTemplateByName, effectiveParentId, indexFolders,
} from "../src/lib/textTemplateModel.js";

let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log(`ok  ${name}`); };
const ids = (list) => list.map((x) => x.id);

test("first line is the default title", () => {
  assert.equal(firstLine("<div><b>Morning</b> check</div><div>second</div>"), "Morning check");
  assert.equal(firstLine("\n\n  hello there\nmore"), "hello there");
  assert.equal(firstLine("Morning check-in<div>How did we sleep?</div>"), "Morning check-in");
  assert.equal(templateTitle({ title: "  ", content: "<p>From text</p>" }), "From text");
  assert.equal(templateTitle({ title: "Mine", content: "x" }), "Mine");
  assert.equal(templateTitle({ content: "" }), "Untitled template");
  assert.ok(firstLine("a".repeat(200)).length <= 80);
});

test("plain text drops tags, keeps lines and decodes entities", () => {
  assert.equal(templatePlainText("a<br>b &amp; c&nbsp;d"), "a\nb & c d");
  assert.equal(templatePlainText("<style>.x{}</style>hi"), "hi");
});

test("plain box text round-trips through HTML", () => {
  const box = "<strong>Hi</strong>\nline two\n\nline four";
  const html = fieldTextToHtml(box);
  assert.equal(html, "<strong>Hi</strong><br>line two<br><br>line four");
  assert.equal(htmlToFieldText(html), box);
  assert.equal(htmlToFieldText("<div>one</div><div>two</div>"), "one\ntwo");
  assert.equal(htmlToFieldText('<div style="color:red">kept</div>'), '<div style="color:red">kept</div>');
});

test("blank content is blank, pictures are not", () => {
  assert.ok(isBlankContent("<div><br></div>"));
  assert.ok(isBlankContent("   "));
  assert.ok(!isBlankContent('<img src="x">'));
  assert.ok(!isBlankContent("hi"));
});

const folders = [
  { id: "a", name: "Daily", parent_id: null, sort_order: 1 },
  { id: "b", name: "Mornings", parent_id: "a", sort_order: 1 },
  { id: "c", name: "Deep", parent_id: "b", sort_order: 1 },
  { id: "d", name: "Orphan", parent_id: "gone", sort_order: 2 },
  { id: "e", name: "Self", parent_id: "e", sort_order: 3 },
  { id: "f", name: "LoopF", parent_id: "g", sort_order: 4 },
  { id: "g", name: "LoopG", parent_id: "f", sort_order: 5 },
];

test("broken parents show at the top level", () => {
  const top = ids(childFolders(null, folders));
  for (const id of ["a", "d", "e", "f", "g"]) assert.ok(top.includes(id), `${id} at top`);
  assert.deepEqual(ids(childFolders("a", folders)), ["b"]);
  assert.equal(effectiveParentId(folders[4], indexFolders(folders)), null);
});

test("the flattened tree holds every folder once, with depth", () => {
  const flat = flattenFolderTree(folders);
  assert.equal(flat.length, folders.length);
  assert.equal(flat.find((x) => x.folder.id === "c").depth, 2);
});

test("folder paths and nesting checks", () => {
  assert.deepEqual(folderPath("c", folders), ["Daily", "Mornings", "Deep"]);
  assert.deepEqual(folderPath("e", folders), ["Self"]);
  assert.ok(wouldNestFolder("a", "c", folders));
  assert.ok(wouldNestFolder("a", "a", folders));
  assert.ok(!wouldNestFolder("c", "a", folders));
  assert.deepEqual([...descendantFolderIds("a", folders)].sort(), ["b", "c"]);
});

const templates = [
  { id: "t1", title: "Morning check", content: "How did we sleep?", folder_id: "b" },
  { id: "t2", title: "Therapy prep", content: "<b>Things</b> to bring up", folder_id: null },
  { id: "t3", title: "", content: "Grocery run<br>milk", folder_id: "gone" },
  { id: "t4", title: "Morning check", content: "dup", folder_id: "a" },
];

test("templates in a folder; a lost folder means the top level", () => {
  assert.deepEqual(ids(templatesIn(null, templates, folders)).sort(), ["t2", "t3"]);
  assert.deepEqual(ids(templatesIn("b", templates, folders)), ["t1"]);
  assert.equal(countTemplatesUnder("a", templates, folders), 2);
});

test("search matches every word across title, folder and text", () => {
  assert.deepEqual(ids(searchTemplates("bring", templates, folders).templates), ["t2"]);
  assert.deepEqual(ids(searchTemplates("mornings sleep", templates, folders).templates), ["t1"]);
  assert.deepEqual(ids(searchTemplates("grocery", templates, folders).templates), ["t3"]);
  assert.deepEqual(ids(searchTemplates("daily", templates, folders).folders), ["a"]);
  assert.deepEqual(searchTemplates("", templates, folders).templates, []);
});

test("a typed name resolves only when it means exactly one template", () => {
  assert.equal(resolveTemplateByName("therapy prep", templates, folders)?.id, "t2");
  assert.equal(resolveTemplateByName("Grocery run", templates, folders)?.id, "t3");
  assert.equal(resolveTemplateByName("morning check", templates, folders), null); // two of them
  assert.equal(resolveTemplateByName("Daily/Mornings/Morning check", templates, folders)?.id, "t1");
  assert.equal(resolveTemplateByName("Daily:Morning check", templates, folders)?.id, "t4");
  assert.equal(resolveTemplateByName("nope", templates, folders), null);
});

console.log(`\n${passed} passed`);
