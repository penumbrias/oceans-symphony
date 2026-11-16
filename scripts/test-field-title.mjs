// Tests for src/lib/fieldTitle.js — a custom field's plain and formatted title.
import assert from "node:assert/strict";
import { plainTitleOf, hasFormatting, titlePatchFromMarkup, richTitleOf, editableTitleOf } from "../src/lib/fieldTitle.js";

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok", name); };

t("plain text stays plain", () => {
  assert.deepEqual(titlePatchFromMarkup("Favourite food"), { name: "Favourite food", name_rich: null });
  assert.deepEqual(titlePatchFromMarkup("<div>Likes</div>"), { name: "Likes", name_rich: null });
  assert.deepEqual(titlePatchFromMarkup("Tom &amp; Jerry"), { name: "Tom & Jerry", name_rich: null });
});
t("formatting is kept, name is its text", () => {
  const m = '<b>Big</b> <span style="color:red">likes</span>';
  assert.equal(hasFormatting(m), true);
  assert.deepEqual(titlePatchFromMarkup(m), { name: "Big likes", name_rich: m });
});
t("picture-only title gets a name", () => {
  assert.equal(plainTitleOf('<img src="/local-image/x" alt="Cat">'), "Cat");
  assert.equal(plainTitleOf('<img src="/local-image/x">'), "Picture");
});
t("empty title has no name", () => {
  assert.equal(titlePatchFromMarkup("<div><br></div>").name, "");
});
t("rich title shows only while it matches the name", () => {
  const f = { name: "Big likes", name_rich: "<b>Big</b> likes" };
  assert.equal(richTitleOf(f), f.name_rich);
  assert.equal(richTitleOf({ ...f, name: "Renamed" }), null);
  assert.equal(richTitleOf({ name: "x" }), null);
});
t("editing starts from the rich title or the escaped name", () => {
  assert.equal(editableTitleOf({ name: "a<b", name_rich: null }), "a&lt;b");
  assert.equal(editableTitleOf({ name: "Big likes", name_rich: "<b>Big</b> likes" }), "<b>Big</b> likes");
});
console.log(`${n} passed`);
