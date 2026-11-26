#!/usr/bin/env node
// The house's check-in sheets (boards 16-CheckInPhone, 17-CheckInWhoPhone
// and 47-SetFrontPhone): where each sheet sits (phone, keyboard up,
// computer), board 17's row notes and closing line, the tick; that the old
// sheets draw the boards only inside the house (a bare context, null
// outside it), that both frames carry the look to the app-wide hosts too,
// that the Quick check-in still never closes on a press outside or Escape,
// that the sheets write only through the write paths, and that the hcs-
// classes are the sheets' own. Pure: nothing real is written.
//
//   node scripts/test-house-checkin.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

globalThis.window = { dispatchEvent() {}, addEventListener() {}, removeEventListener() {} };
globalThis.CustomEvent = class { constructor(t) { this.type = t; } };

const M = await import("../src/house/checkin/checkinModel.js");

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`ok  ${name}`); };
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
// Split a selector list at its top-level commas (not those inside :is()).
function topLevelParts(sel) {
  const out = []; let depth = 0; let cur = "";
  for (const ch of sel) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { out.push(cur); cur = ""; } else cur += ch;
  }
  out.push(cur);
  return out;
}
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("placement: a phone sheet fills the screen down to the bottom zone, or to the keyboard", () => {
  const p = M.sheetPlacement("checkin", { phone: true });
  assert.equal(p.bottom, "var(--house-sheet-bottom, 0px)", "Support stays one tap away");
  assert.equal(p.left, 0); assert.equal(p.right, 0); assert.equal(p.transform, "none");
  const k = M.sheetPlacement("checkin", { phone: true, keyboard: 320.4 });
  assert.equal(k.bottom, "320px", "the keyboard never covers Save or the note");
  assert.equal(M.sheetPlacement("front", { phone: true }).top, 0, "board 47 draws its own header at the top");
  const who = M.sheetPlacement("who", { phone: true });
  assert.match(who.top, /34dvh/, "board 17 leaves the check-in showing above");
  assert.match(M.sheetPlacement("who", { phone: true, keyboard: 200 }).top, /safe-area/, "with the keyboard up the search stays on screen");
});

test("placement: on a computer each sheet is a centred panel of its own width", () => {
  assert.match(M.sheetPlacement("checkin").width, /30rem/);
  assert.match(M.sheetPlacement("who").width, /26rem/);
  const f = M.sheetPlacement("front");
  assert.match(f.width, /32rem/); assert.ok(f.height, "Set front keeps a height so its list scrolls");
  assert.match(M.sheetPlacement("checkin", { keyboard: 100 }).maxHeight, /100px/);
});

test("board 17: row notes in the person's words, the lead without a level", () => {
  const terms = { fronting: "out" };
  const levelOf = (id) => ({ river: "Co-con", ash: "Lead" })[id];
  const args = { fronting: new Set(["river", "ash"]), levelOf, topLevel: "Lead", terms };
  assert.equal(M.whoRowNote("river", args), "out, co-con");
  assert.equal(M.whoRowNote("ash", args), "out");
  assert.equal(M.whoRowNote("pip", args), null, "not in the check-in: no note");
  assert.equal(M.whoRowNote("river", { ...args, levelOf: null }), "out", "no levels: just the word");
});

test("board 17: the closing line says whose a feeling is right now", () => {
  const terms = { fronting: "out" };
  assert.match(M.whoFooter({ defaultIds: ["a", "b"], frontingIds: ["a", "b"], names: {}, terms }), /\(now: everyone out\)/);
  assert.match(M.whoFooter({ defaultIds: ["a"], frontingIds: ["a", "b"], names: { a: "River" }, terms }), /\(now: River\)/);
  assert.match(M.whoFooter({ defaultIds: [], frontingIds: ["a"], names: {}, terms }), /\(now: nobody\)/);
  assert.match(M.whoFooter({ defaultIds: ["a"], frontingIds: ["a"], names: { a: "River" }, terms }), /\(now: River\)/, "one person is named, not 'everyone'");
});

test("ticks are ✓, never × (building code §16.4)", () => {
  assert.equal(M.HOUSE_TICK, "✓");
});

test("outside the house the sheets draw as before: a bare context, null by default", () => {
  const s = read("src/lib/houseSwitch.js");
  assert.match(s, /export const HouseSheetContext = createContext\(null\)/);
  assert.match(s, /export function useHouseSheet\(\)/);
  assert.ok(!/from "@\/house\//.test(s), "houseSwitch.js pulls nothing of src/house into the old house");
  for (const f of ["src/components/emotions/QuickCheckInModal.jsx", "src/components/shared/AlterAssignChip.jsx", "src/components/emotions/EmotionWheelPicker.jsx", "src/components/emotions/RatingMeter.jsx", "src/components/fronting/SetFrontSheet.jsx"]) {
    const t = read(f);
    assert.ok(t.includes('import { useHouseSheet } from "@/lib/houseSwitch"'), `${f} reads the house's sheet look`);
    assert.ok(!/from "@\/house\//.test(t), `${f} imports nothing from src/house`);
  }
});

test("both frames wrap everything, the app-wide hosts too, in the sheet look", () => {
  for (const f of ["src/house/frame/HouseFrame.jsx", "src/house/phone/HousePhoneFrame.jsx"]) {
    const t = read(f);
    assert.ok(t.includes('import HouseSheets from "@/house/checkin/HouseSheets"'), `${f} loads the sheet look`);
    assert.match(t, /<HouseSheets tokens=\{tokens\} size=/);
    assert.match(t, /\{tail\}\s*<\/HouseSheets>/, `${f} puts the tail hosts inside it`);
  }
  assert.match(read("src/components/layout/AppLayout.jsx"), /<Frame mainRef=\{houseMainRef\} tail=\{renderTailHosts\(true\)\}>/);
  assert.ok(read("src/house/checkin/HouseSheets.jsx").includes('import "@/house/checkin/checkin.css"'), "the sheets' CSS comes with the provider (the phone loads no frameKit.css)");
});

test("the Quick check-in never closes on a press outside or Escape; edits update", () => {
  const q = read("src/components/emotions/QuickCheckInModal.jsx");
  assert.match(q, /onPointerDownOutside=\{\(e\) => e\.preventDefault\(\)\}/);
  assert.match(q, /onInteractOutside=\{\(e\) => e\.preventDefault\(\)\}/);
  assert.match(q, /onEscapeKeyDown=\{\(e\) => e\.preventDefault\(\)\}/);
  assert.match(q, /editEmotionCheckIn/, "edit mode updates through checkinEntry.js");
  assert.match(q, /MentionTextarea/); assert.match(q, /prepareAuthoredText/);
  // All eight sections are still there and still hideable.
  for (const id of ["feeling", "fronting", "activity", "symptoms", "diary", "note", "contacts", "location"]) assert.ok(q.includes(`id: "${id}"`), `section ${id}`);
  assert.match(q, /enabledCheckinSectionIds/);
});

test("the sheets write only through the write paths", () => {
  const sheets = [
    "src/components/emotions/QuickCheckInModal.jsx", "src/components/fronting/SetFrontSheet.jsx",
    "src/components/fronting/SetFrontSheetPixel.jsx", "src/components/shared/AlterAssignChip.jsx",
    "src/components/emotions/EmotionWheelPicker.jsx", "src/components/emotions/RatingMeter.jsx",
    "src/components/presences/PresencePicker.jsx", "src/components/presences/PresenceForm.jsx",
    "src/house/checkin/HouseSheets.jsx", "src/house/checkin/checkinModel.js",
  ];
  for (const f of sheets) {
    const t = code(f);
    assert.ok(!/\b(EmotionCheckIn|SymptomCheckIn|SymptomSession|FrontingSession|Presence|DiaryCard|Location)\.(create|update|delete|bulkDelete)\(/.test(t), `${f} writes a check-in, front or presence row directly`);
  }
  for (const f of ["src/house/checkin/HouseSheets.jsx", "src/house/checkin/checkinModel.js"]) {
    const t = code(f);
    assert.ok(!/(entities|localEntities|base44)\b[^;]*\.(create|update|delete|bulkDelete)\(/.test(t), `${f} writes a record`);
    assert.ok(!/setItem\(/.test(t), `${f} writes storage`);
  }
  const q = read("src/components/emotions/QuickCheckInModal.jsx");
  assert.match(q, /from "@\/lib\/checkinEntry"/);
  assert.match(q, /from "@\/lib\/setFront"/);
  const f = read("src/components/fronting/SetFrontSheet.jsx");
  assert.match(f, /applyFrontSelection\(/); assert.match(f, /reconcileActiveFront\(/);
  assert.match(read("src/components/presences/PresencePicker.jsx"), /notePresenceSighting\(/);
  assert.match(read("src/components/presences/PresenceForm.jsx"), /createPresence\(/);
  assert.match(read("src/components/presences/PresenceForm.jsx"), /updatePresence\(/);
  assert.match(read("src/lib/presenceEntry.js"), /Presence\.get\(id\)/, "a sighting is appended onto a fresh read");
});

test("hcs- classes are the sheets' own, and their CSS is house CSS", () => {
  for (const f of ["src/house/kit/frame/frameKit.css", "src/house/kit/panels.css", "src/house/kit/kit.css", "src/house/kit/pixel.css", "src/house/write/write.css", "src/house/alters/alters.css", "src/house/phone/phone.css", "src/house/frame/frame.css"]) {
    let t = ""; try { t = read(f); } catch { continue; }
    assert.ok(!/\.hcs-/.test(t), `${f} has no hcs- classes`);
  }
  const css = read("src/house/checkin/checkin.css");
  assert.ok(!/!important/.test(css));
  assert.ok(!/font-size:\s*\d+px/.test(css), "no px font sizes");
  for (const sel of css.replace(/\/\*[\s\S]*?\*\//g, "").split("}").map((r) => r.split("{")[0].trim()).filter(Boolean)) {
    if (sel.startsWith("@")) continue;
    for (const part of topLevelParts(sel)) {
      assert.ok(/\[data-house\][^ ]*\.hcs-(ci|who|sf|head)\b/.test(part), `"${part.trim()}" reaches outside the sheets`);
    }
  }
});

console.log(`\n${passed} passed.`);
