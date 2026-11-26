#!/usr/bin/env node
// The house's Reminders room (boards 23-RemindersPhone and
// 24-ReminderEditorPhone): the shared reminder form both houses edit
// through (defaults, kinds, what is saved, the heads-ups, the words), the
// inbox's lists and the notification link, the room's address and filter,
// and that the room is drawn only on /reminders with the old page gated,
// both frames mount it, the phone runs it edge to edge with its tools, it
// writes only through the old page's write paths, every option of the old
// editor is drawn, and its classes stay its own with thin edges. Pure:
// nothing is written anywhere.
//
//   node scripts/test-house-reminders.mjs

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const F = await import("../src/lib/reminderForm.js");
const M = await import("../src/house/reminders/remindersModel.js");
const S = await import("../src/lib/houseSwitch.js");

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const terms = { alter: "part", Alter: "Part", alters: "parts", fronts: "is out", fronting: "out", front: "outside", Front: "Outside", system: "crew", System: "Crew" };
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test("a new reminder starts as the old editor's did (push on, every day at 9)", () => {
  const f = F.formFromReminder(null);
  assert.deepEqual(f.delivery_channels, ["in_app", "push"]);
  assert.equal(f.trigger_type, "scheduled");
  assert.deepEqual(f.trigger_config, { times: ["09:00"], days: [0, 1, 2, 3, 4, 5, 6] });
  assert.equal(f.quiet_hours_respect, true);
  assert.deepEqual(f.snooze_options, [10, 60, 240, "tomorrow"]);
  const e = F.formFromReminder({ id: "r1", title: "Meds", trigger_type: "interval", trigger_config: { every_minutes: 30 } });
  assert.equal(e.title, "Meds");
  assert.equal(e.category, "custom", "missing fields fall back to the defaults");
  assert.notEqual(F.formFromReminder(null), F.DEFAULT_FORM, "a copy, never the shared default");
});

test("the kinds: every trigger and every contextual 'on' the old editor offers", () => {
  const kinds = F.reminderKinds(terms).map((k) => k.id);
  for (const t of ["scheduled", "interval", "event"]) assert.ok(kinds.includes(t), t);
  for (const c of F.CONTEXTUAL_ON_BASE) assert.ok(kinds.includes(`ctx:${c.value}`), c.value);
  assert.equal(F.reminderKinds(terms).find((k) => k.id === "ctx:alter_fronts").label, "Part is out", "in the person's words");
  assert.equal(F.reminderKindOf({ trigger_type: "contextual", trigger_config: {} }), "ctx:no_front_update");
  assert.deepEqual(F.kindPatch("ctx:symptom_logged"), { trigger_type: "contextual", trigger_config: { on: "symptom_logged" } });
  assert.deepEqual(F.kindPatch("ctx:no_front_update"), { trigger_type: "contextual", trigger_config: { on: "no_front_update", threshold_minutes: 120 } });
  assert.deepEqual(F.kindPatch("interval"), { trigger_type: "interval", trigger_config: F.TRIGGER_DEFAULTS.interval });
});

test("what is saved: push-only gets the in-app banner when push is off; scope and clearing as before", () => {
  const base = { ...F.DEFAULT_FORM, title: "x", delivery_channels: ["push"] };
  assert.deepEqual(F.reminderSaveData(base, { pushOn: false }).delivery_channels, ["push", "in_app"]);
  assert.deepEqual(F.reminderSaveData(base, { pushOn: true }).delivery_channels, ["push"]);
  const scoped = F.reminderSaveData({ ...base, alter_id: "a1", alter_scope: null, alter_scope_catchup: true }, {});
  assert.equal(scoped.alter_scope, "always");
  assert.equal(scoped.alter_scope_catchup, false, "catch-up only with 'when fronting'");
  const none = F.reminderSaveData({ ...base, alter_id: "", alter_scope: "when_fronting" }, {});
  assert.equal(none.alter_id, null);
  assert.equal(none.alter_scope, null);
  assert.equal(F.reminderSaveData({ ...base, auto_resolve_rule: { on: "check_in" } }, { hasAutoResolve: false }).auto_resolve_rule, null);
  assert.equal(F.reminderFormProblem({ title: " ", delivery_channels: ["push"] }), "Title is required");
  assert.equal(F.reminderFormProblem({ title: "x", delivery_channels: [] }), "Choose at least one delivery channel");
  assert.equal(F.reminderFormProblem({ title: "x", delivery_channels: ["in_app"] }), null);
});

test("the heads-ups about who it's for", () => {
  const alters = [{ id: "a1", name: "Ash" }, { id: "a2", name: "River" }];
  const w = F.alterScopeWarnings({ alter_id: "a1", alter_scope: "when_fronting", trigger_type: "contextual", trigger_config: { on: "alter_fronts", alter_id: "a1" } }, alters, terms);
  assert.equal(w.length, 1);
  assert.ok(w[0].includes("Ash's out"));
  assert.equal(F.alterScopeWarnings({ alter_id: "a1", trigger_type: "contextual", trigger_config: { on: "alter_fronts", alter_id: "a2" } }, alters, terms, (a) => a.name.toUpperCase()).length, 1);
  assert.ok(F.alterScopeWarnings({ alter_id: "a1", alter_scope: "when_fronting", trigger_type: "event", trigger_config: {} }, alters, terms)[0].includes("event"));
  assert.deepEqual(F.alterScopeWarnings({ alter_id: null }, alters, terms), []);
});

test("a reminder's 'when' in words (board 23's second line)", () => {
  const clock = (t) => t;
  assert.equal(F.reminderWhenWords({ trigger_type: "scheduled", trigger_config: { times: ["09:00"], days: [0, 1, 2, 3, 4, 5, 6] } }, { terms, clock }), "Every day at 09:00");
  assert.equal(F.reminderWhenWords({ trigger_type: "scheduled", trigger_config: { times: ["18:00"], days: [1, 4] } }, { terms, clock }), "Mon and Thu at 18:00");
  assert.equal(F.reminderWhenWords({ trigger_type: "interval", trigger_config: { every_minutes: 120, active_window: { start: "09:00", end: "21:00" } } }, { terms, clock }), "Every 2 h, 09:00 to 21:00");
  assert.equal(F.reminderWhenWords({ trigger_type: "contextual", trigger_config: { on: "emotion_logged", delay_minutes: 30 } }, { terms }), "30 min after a feeling is logged");
  assert.equal(F.reminderWhenWords({ trigger_type: "contextual", trigger_config: { on: "no_front_update", threshold_minutes: 240 } }, { terms }), "No outside update for 4 h");
  assert.equal(F.reminderWhenWords({ trigger_type: "contextual", trigger_config: { on: "alter_fronts" } }, { terms }), "When any part is out");
  assert.equal(F.reminderWhenWords({ trigger_type: "contextual", trigger_config: { on: "alter_fronts", delay_minutes: 5 } }, { terms, alterName: "Ash" }), "5 min after Ash is out");
  assert.equal(F.reminderWhenWords({ trigger_type: "event", trigger_config: {} }, { terms }), "On a date (not set yet)");
  assert.equal(F.daysWords([1, 2, 3, 4, 5]), "Weekdays");
  assert.equal(F.resolveWords({ on: "front_update" }, terms), "the outside is updated");
  assert.equal(F.resolveWords(null, terms), "off");
  assert.equal(F.formatSnoozeLabel(90), "1h 30m");
  assert.equal(F.snoozeMinutes("2", "hours"), 120);
  assert.equal(F.snoozeMinutes("x"), null);
});

test("the inbox: due (fired, pending, snoozed; newest first) and the last week's handled", () => {
  const now = Date.parse("2026-11-26T12:00:00Z");
  const inst = [
    { id: "a", status: "fired", fired_at: "2026-11-26T10:00:00Z" },
    { id: "b", status: "snoozed", scheduled_for: "2026-11-26T11:00:00Z" },
    { id: "c", status: "acted", updated_date: "2026-11-25T10:00:00Z" },
    { id: "d", status: "dismissed", updated_date: "2026-11-01T10:00:00Z" },
    { id: "e", status: "pending", scheduled_for: "2026-11-26T09:00:00Z" },
  ];
  const { due, handled } = F.inboxBuckets(inst, now);
  assert.deepEqual(due.map((i) => i.id), ["b", "a", "e"]);
  assert.deepEqual(handled.map((i) => i.id), ["c"]);
  assert.deepEqual(F.effectiveActionsFor({ category: "check_in" }), [{ label: "Check In", action_type: "open_check_in" }]);
  assert.deepEqual(F.effectiveActionsFor({ category: "meds" }), []);
  assert.equal(F.actionRoute({ action_type: "open_route", payload: { path: "/" } }), null, "a route to / is no route");
  assert.equal(F.actionRoute({ action_type: "open_diary" }), "/checkin-log");
  assert.deepEqual(F.reminderDeepLink("?act=i1&action=dismiss"), { instanceId: "i1", actionType: "dismiss", status: "dismissed" });
  assert.equal(F.reminderDeepLink("?act=i1&action=open_check_in").status, "acted");
  assert.equal(F.reminderDeepLink("?act=i1"), null);
});

test("the room's address, filter and words", () => {
  assert.deepEqual(M.editorOf("?edit=r1"), { mode: "edit", id: "r1" });
  assert.deepEqual(M.editorOf("?new=1"), { mode: "new", id: null });
  assert.equal(M.editorOf(""), null);
  assert.equal(M.editorHref({ id: "r 1" }), "/reminders?edit=r%201");
  assert.equal(M.editorHref(null), "/reminders?new=1");
  const rs = [{ id: 1 }, { id: 2, alter_id: "a" }, { id: 3, alter_id: "b" }];
  assert.equal(M.filterReminders(rs, "all").length, 3);
  assert.deepEqual(M.filterReminders(rs, "system").map((r) => r.id), [1]);
  assert.equal(M.filterReminders(rs, "per_alter").length, 2);
  assert.deepEqual(M.filterReminders(rs, "b").map((r) => r.id), [3]);
  assert.deepEqual(M.scopedAlterIds(rs), ["a", "b"]);
  assert.deepEqual(M.filterOptions(terms).map((o) => o.label), ["All", "Crew-wide", "Per part"]);
  assert.equal(M.quietWords({ enabled: true, start: "22:00", end: "08:00" }, (t) => t), "quiet 22:00 to 08:00");
  assert.equal(M.quietWords({ enabled: false }, (t) => t), "");
  const fa = (a) => a.name;
  assert.equal(M.whoWords({}, null, { terms, formatAlter: fa }), "everyone");
  assert.equal(M.whoWords({ alter_id: "a", alter_scope: "when_fronting" }, { name: "Ash" }, { terms, formatAlter: fa }), "Ash · when out");
  assert.equal(M.whoWords({ alter_id: "a" }, { name: "Ash", is_archived: true }, { terms, formatAlter: fa }), "archived part");
  assert.equal(M.reminderOn({ is_active: true }, { is_archived: true }), false);
  assert.equal(M.statusWords({ reminders: [1, 2], onCount: 1, dueCount: 0 }), "2 reminders · 1 on");
  const now = Date.parse("2026-11-26T12:00:00Z");
  assert.equal(M.dueWhenWords({ fired_at: "2026-11-26T11:59:40Z" }, { now, clockOf: () => "x" }), "now");
  assert.equal(M.dueWhenWords({ fired_at: "2026-11-26T11:00:00Z" }, { now, clockOf: () => "11" }), "11, 1 h ago");
  const { day, time } = M.eventParts(M.eventIso("2026-12-03", "14:30"));
  assert.deepEqual([day, time], ["2026-12-03", "14:30"], "the event's date and time round-trip");
  assert.equal(M.eventIso(null, "10:00"), null);
});

test("the room is drawn by the house only on /reminders; the old page is gated", () => {
  assert.equal(S.houseRemindersRoom("/reminders"), true);
  assert.equal(S.houseRemindersRoom("/reminders/"), true);
  assert.ok(!S.houseRemindersRoom("/remindersx"));
  assert.equal(S.houseRebuiltRoom("/reminders"), true);
  assert.match(read("src/App.jsx"), /path="\/reminders" element=\{<HouseRoomGate><Reminders \/><\/HouseRoomGate>\}/);
});

test("both frames mount the room; the phone runs it edge to edge with its tools", () => {
  for (const f of ["src/house/frame/HouseFrame.jsx", "src/house/phone/HousePhoneFrame.jsx"]) {
    const t = read(f);
    assert.ok(t.includes("house/reminders/HouseReminders"), `${f} loads the room`);
    assert.ok(/<HouseReminders /.test(t), `${f} mounts it`);
  }
  const phone = read("src/house/phone/HousePhoneFrame.jsx");
  assert.ok(/\|\| remindersRoom \? "px-0"/.test(phone), "the phone runs it edge to edge");
  assert.ok(/roomTools = [^;]*remindersRoom/.test(phone), "the phone frame reads the room's tools");
  assert.ok(/ownDocks[^;]*remindersRoom/.test(read("src/house/frame/HouseFrame.jsx")), "the room draws its own toolbar and status line");
  const room = read("src/house/reminders/HouseReminders.jsx");
  assert.ok(room.includes("useRoomTools") && room.includes('label: "New reminder"'), "the phone's + and ⋯ come from the room");
  assert.ok(!/position:\s*fixed/.test(read("src/house/reminders/reminders.css")), "nothing floats over scrolling content");
});

test("writes go only through the old page's write paths", () => {
  const room = read("src/house/reminders/HouseReminders.jsx");
  const ed = read("src/house/reminders/ReminderEditor.jsx");
  for (const f of ["src/house/reminders/HouseReminders.jsx", "src/house/reminders/ReminderEditor.jsx", "src/house/reminders/remindersModel.js"]) {
    const text = read(f).replace(/\/\/.*$/gm, "");
    assert.ok(!/\.(create|update|delete|bulkDelete|bulkCreate)\(/.test(text), `${f} writes a record itself`);
    assert.ok(!/localStorage\.(setItem|removeItem)/.test(text), `${f} keeps state in localStorage`);
  }
  assert.ok(ed.includes("saveReminder(existing, reminderSaveData("), "the editor saves through saveReminder with the shared save data");
  assert.ok(room.includes("setReminderActive(") && room.includes("deleteReminder(") && room.includes("trashWithUndo("), "pause and delete through reminderEntry; delete to the trash with Undo");
  assert.ok(room.includes("useReminderActions(") && room.includes("applyReminderDeepLink("), "answers and the notification link are the old inbox's");
  assert.ok(room.includes("<RemindersOnboarding"), "the first-reminder suggestions are still offered");
  const inbox = read("src/components/reminders/RemindersInbox.jsx");
  assert.ok(inbox.includes("useReminderActions(") && inbox.includes("inboxBuckets("), "the old inbox answers through the same hook");
  const modal = read("src/components/reminders/ReminderEditorModal.jsx");
  assert.ok(modal.includes("reminderSaveData(") && modal.includes("formFromReminder("), "the old editor saves the same data");
  assert.ok(read("src/pages/Reminders.jsx").includes("applyReminderDeepLink("), "the old page answers the link the same way");
  assert.ok(room.includes("useAlterLabel") && room.includes("useTerms") && ed.includes("useAlterLabel"), "names and words are the person's");
});

test("every option of the old editor is drawn in the house editor", () => {
  const ed = read("src/house/reminders/ReminderEditor.jsx");
  const fields = ["title", "body", "category", "delivery_channels", "quiet_hours_respect", "alter_scope", "alter_scope_catchup", "inline_actions", "auto_resolve_rule", "snooze_options"];
  for (const f of fields) assert.ok(ed.includes(`"${f}"`), `the editor sets ${f}`);
  for (const k of ["times", "days", "every_minutes", "after_last", "active_window", "threshold_minutes", "matches", "delay_minutes", "alter_id", "symptom_ids", "when", "pre_alerts"]) {
    assert.ok(ed.includes(`"${k}"`), `the editor sets trigger_config.${k}`);
  }
  for (const k of ["symptom_id", "category_id", "lookback_minutes"]) assert.ok(ed.includes(k), `clearing itself sets ${k}`);
  assert.ok(ed.includes("DISTRESS_EMOTIONS") && ed.includes('"next_week"') && ed.includes('"tomorrow"') && ed.includes("DEFAULT_SNOOZE_OPTIONS"), "presets and snooze choices");
  assert.ok(ed.includes("flattenCategoryTree") && ed.includes("NestedPicker"), "activity categories in a nesting-aware picker");
  assert.ok(!/<select\b|type="(time|date|datetime-local|color)"/.test(ed), "no browser-native pickers");
  assert.ok(ed.includes("alterScopeWarnings(") && ed.includes("NotificationStatusCard"), "the heads-ups and the notification check");
});

test("hrm- classes are the room's own and the CSS keeps thin edges", () => {
  const dir = new URL("../src/house/", import.meta.url);
  for (const d of readdirSync(dir)) {
    let fs = []; try { fs = readdirSync(new URL(`${d}/`, dir)); } catch { continue; }
    for (const f of fs) if (f.endsWith(".css") && !(d === "reminders" && f === "reminders.css")) {
      assert.ok(!/\.hrm-|\.hrm\b/.test(read(`src/house/${d}/${f}`)), `src/house/${d}/${f} has no hrm- classes`);
    }
  }
  const css = read("src/house/reminders/reminders.css");
  assert.ok(!/!important/.test(css));
  assert.ok(!/font-size:\s*\d+px/.test(css), "no px font sizes");
  assert.ok(!/(outline|border|box-shadow)[^;]*\b2px\b/.test(css), "edges are the thin pixel line, never a hard 2px");
  for (const sel of css.replace(/\/\*[\s\S]*?\*\//g, "").split("}").map((r) => r.split("{")[0]).filter((s) => s.trim() && !s.includes("@media"))) {
    for (const part of sel.split(/,(?![^(]*\))/)) assert.ok(/\.hrm[-\s.[:]|\.hrm$|\.hrm\b/.test(part), `"${part.trim()}" styles something outside the room`);
  }
  assert.ok(read("src/house/reminders/HouseReminders.jsx").includes("reminders/reminders.css"), "the room imports its CSS (the phone needs it)");
  assert.ok(/\.hrm--phone \.hrm-floor \{[^}]*var\(--house-space-2/.test(css), "the phone keeps the slim gutter");
  for (const f of ["src/house/reminders/HouseReminders.jsx", "src/house/reminders/ReminderEditor.jsx"]) {
    assert.ok(!/#[0-9a-f]{6}\b/i.test(read(f).replace(/\/\/.*$/gm, "")), `${f}: house colours, not hex`);
  }
});

test("tour anchors the room adds have steps", () => {
  const tour = read("src/components/onboarding/FeatureTour.jsx");
  const room = read("src/house/reminders/HouseReminders.jsx") + read("src/house/reminders/ReminderEditor.jsx");
  for (const a of ["reminders-inbox", "reminders-new", "reminders-filter", "reminders-when", "reminders-editor"]) {
    assert.ok(room.includes(`data-tour="${a}"`) || room.includes(`tour: "${a}"`), `the room has ${a}`);
    assert.ok(tour.includes(`"${a}"`), `the tour has a step for ${a}`);
  }
  for (const a of ["reminders-list", "reminders-inbox-tab", "reminders-manage-tab"]) assert.ok(room.includes(a), `the room keeps the old anchor ${a}`);
});

let failed = 0;
for (const t of tests) {
  try { await t.fn(); console.log(`ok   ${t.name}`); }
  catch (e) { failed += 1; console.log(`FAIL ${t.name}\n     ${e.message}`); }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`);
if (failed) process.exit(1);
