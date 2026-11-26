#!/usr/bin/env node
// The house's Support rooms (plan step 3.1, boards 15, 38-41): the room's
// views and deep links, the Ground tiles, Learn's summary, the safety plan's
// zones and signs, the emergency rows and the unblend button's words, plus
// which routes are house rooms. Pure: nothing is stored.
//
//   node scripts/test-house-support.mjs

import assert from "node:assert/strict";
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

const M = await import("../src/house/support/supportModel.js");
const S = await import("../src/lib/houseSwitch.js");
let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`  ✓ ${name}`); };

t("routes: exact support paths are house rooms, sub-pages are not", () => {
  assert.equal(S.houseSupportRoom("/grounding"), "support");
  assert.equal(S.houseSupportRoom("/unblend"), "unblend");
  assert.equal(S.houseSupportRoom("/safety-plan/"), "safety");
  assert.equal(S.houseSupportRoom("/emergency"), "emergency");
  assert.equal(S.houseSupportRoom("/unblend/questions"), null);
  assert.equal(S.houseSupportRoom("/"), null);
});

t("views: old deep links still land", () => {
  assert.equal(M.supportView(""), "entry");
  assert.equal(M.supportView("?view=soundscape"), "soundscape");
  assert.equal(M.supportView("?view=scratchpad"), "scratchpad");
  assert.equal(M.supportView("?tab=learn&topic=m4_t3"), "learn");
  assert.equal(M.supportView("?states=anxiety"), "need");
  assert.equal(M.supportView("?view=bogus"), "entry");
  assert.equal(M.supportViewSearch("learn", { topic: "m4_t3" }), "?tab=learn&topic=m4_t3");
  assert.equal(M.supportViewSearch("entry"), "");
  assert.deepEqual(M.statesFrom("?states=anxiety,,bogus,anxiety", ["anxiety", "stuck"]), ["anxiety"]);
});

t("ground tiles: the board's six with no favourites, favourites first, no double", () => {
  const techs = [{ id: "a", name: "5-4-3-2-1 grounding" }, { id: "b", name: "Cold water" }, { id: "c", name: "Butterfly hug" }];
  const six = M.groundTiles({ techniques: techs, natureCount: 74 });
  assert.deepEqual(six.map((x) => x.name), ["Breathe", "5 4 3 2 1", "Help me unblend", "Nature sounds", "Cold water", "Check in"]);
  assert.equal(six[3].sub, "74 recordings");
  assert.equal(six[1].id, "a");
  const fav = M.groundTiles({ favourites: [techs[2], techs[1]], techniques: techs });
  assert.equal(fav[0].name, "Butterfly hug");
  assert.equal(fav.filter((x) => /cold water/i.test(x.name)).length, 1);
  const none = M.groundTiles({ techniques: [] });
  assert.equal(none[1].id, null); // opens the full list until the catalogue is seeded
});

t("learn: count, started first, then the next", () => {
  const topics = [{ id: "t1" }, { id: "t2" }, { id: "t3" }, { id: "t4" }];
  const s = M.learnSummary(topics, [{ topic_id: "t1", completed: true, updated_date: "2026-01-01" }, { topic_id: "t2", updated_date: "2026-02-01" }]);
  assert.equal(s.done, 1); assert.equal(s.total, 4);
  assert.deepEqual(s.rows.map((r) => [r.id, r.state]), [["t2", "in progress"], ["t1", "done"]]);
  assert.deepEqual(M.learnSummary(topics, []).rows.map((r) => r.id), ["t1"]);
});

t("safety plan: newest answers, all five zones, signs and cards", () => {
  const e = M.latestSafetyEntries([
    { exercise_id: "m7_t3_window_plan", created_date: "2026-01-01", responses: { level1_helps: "old" } },
    { exercise_id: "m7_t3_window_plan", created_date: "2026-03-01", responses: { level1_helps: "walk", level3_notice: "fast heart" } },
    { exercise_id: "m6_t2_coping_cards", created_date: "2026-01-01", responses: { card_one: "Breathe", empty: "" } },
  ]);
  const z = M.toleranceRows(e.window);
  assert.equal(z.length, 5);
  assert.equal(z[0].helps, "walk");
  assert.equal(z[2].label, "Highly activated"); assert.equal(z[2].notice, "fast heart");
  assert.equal(z[4].filled, false);
  assert.equal(M.toleranceRows(null).length, 5);
  assert.deepEqual(M.copingCards(e.cards).map((c) => c.title), ["card one"]);
  assert.equal(M.warningRows(null)[0].text, "");
  assert.equal(M.telHref("+44 (0)7700 900"), "tel:+4407700900");
  assert.equal(M.telHref(""), null);
});

t("emergency rows: every part, locked only when on, picked and filled", () => {
  const cs = [{ id: "allergies", label: "Allergies" }, { id: "contacts", label: "Emergency contacts" }, { id: "about", label: "About me" }];
  const rows = M.emergencyRows(cs, [{ id: "allergies", lines: ["Latex"] }, { id: "contacts", lines: [], contacts: [{ name: "Dana", phone: "1" }] }],
    { lockOn: true, lockFields: ["allergies", "about"] });
  assert.deepEqual(rows.map((r) => [r.id, r.text, r.locked]), [["allergies", "Latex", true], ["contacts", "Dana · 1", false], ["about", "", false]]);
  assert.equal(M.emergencyRows(cs, [{ id: "allergies", lines: ["Latex"] }], { lockOn: false, lockFields: ["allergies"] })[0].locked, false);
  assert.equal(M.stepCardSize("md", -1), "md"); assert.equal(M.stepCardSize("lg", 5), "xl");
});

t("unblend button: set when nobody's in front, add otherwise, in the person's words", () => {
  const terms = { front: "out", fronting: "out front" };
  assert.equal(M.frontButtonWords({ name: "River", terms }).label, "Set out to River");
  assert.equal(M.frontButtonWords({ name: "River", anyoneFronting: true, terms }).label, "Add River to out");
  assert.equal(M.frontButtonWords({ name: "River", fronting: true, terms }).done, true);
});

t("now playing words", () => {
  assert.equal(M.nowPlayingWords({}), null);
  const w = M.nowPlayingWords({ recording: { title: "Rain on a tin roof" }, nature: { sleep: { mode: "time", minutes: 30 } } });
  assert.deepEqual(w, { title: "Rain on a tin roof", detail: "Nature sounds  ·  sleep timer 30 min" });
});

console.log(`\nHouse Support: ${n} groups passed.`);
