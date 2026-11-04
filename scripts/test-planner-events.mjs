#!/usr/bin/env node
// Checks the planner events' date maths (src/lib/plannerEventDates.js):
// every-2-weeks paydays, yearly birthdays (Feb 29 too), month ends, until
// dates and skipped dates.
//
//   node scripts/test-planner-events.mjs

import assert from "node:assert/strict";
import {
  occurrencesBetween, eventsOnDay, nextOccurrence, upcomingOccurrences, occursOn,
  parseDayKey, dayKey, yearsSinceFirst, eventIsPast, eventReminderFires, reminderDaysOf,
} from "../src/lib/plannerEventDates.js";

let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log(`ok  ${name}`); };
const d = (s) => parseDayKey(s);
const keys = (list) => list.map((o) => o.key);

test("one-off event shows on its day only", () => {
  const ev = { title: "Dentist", date: "2026-11-10", repeat: "none" };
  assert.deepEqual(keys(occurrencesBetween(ev, d("2026-11-01"), d("2026-11-30"))), ["2026-11-10"]);
  assert.equal(occursOn(ev, d("2026-11-11")), false);
  assert.equal(occursOn(ev, new Date(2026, 10, 10, 23, 59)), true);
});

test("payday every 2 weeks runs on forever", () => {
  const ev = { title: "Payday", date: "2026-11-06", repeat: "biweekly" };
  assert.deepEqual(keys(occurrencesBetween(ev, d("2026-11-01"), d("2026-12-31"))),
    ["2026-11-06", "2026-11-20", "2026-12-04", "2026-12-18"]);
  // Years later, still on the right Friday.
  assert.equal(occursOn(ev, d("2030-01-11")), true);
  assert.equal(occursOn(ev, d("2030-01-04")), false);
});

test("nothing before the first date", () => {
  const ev = { title: "Payday", date: "2026-11-06", repeat: "weekly" };
  assert.deepEqual(keys(occurrencesBetween(ev, d("2026-10-01"), d("2026-11-06"))), ["2026-11-06"]);
});

test("yearly birthday, and a Feb 29 one", () => {
  const ev = { title: "Birthday", date: "1990-03-14", repeat: "yearly" };
  assert.deepEqual(keys(occurrencesBetween(ev, d("2026-01-01"), d("2027-12-31"))), ["2026-03-14", "2027-03-14"]);
  assert.equal(yearsSinceFirst(ev, d("2026-03-14")), 36);
  const leap = { title: "Leap", date: "2024-02-29", repeat: "yearly" };
  assert.deepEqual(keys(occurrencesBetween(leap, d("2025-01-01"), d("2028-12-31"))), ["2025-02-28", "2026-02-28", "2027-02-28", "2028-02-29"]);
});

test("monthly on the 31st clamps and comes back", () => {
  const ev = { title: "Rent", date: "2026-01-31", repeat: "monthly" };
  assert.deepEqual(keys(occurrencesBetween(ev, d("2026-01-01"), d("2026-05-31"))),
    ["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31"]);
});

test("until and skipped dates", () => {
  const ev = { title: "Class", date: "2026-11-02", repeat: "weekly", until: "2026-11-23", skipped_dates: ["2026-11-16"] };
  assert.deepEqual(keys(occurrencesBetween(ev, d("2026-11-01"), d("2026-12-31"))), ["2026-11-02", "2026-11-09", "2026-11-23"]);
  assert.equal(eventIsPast(ev, d("2026-11-24")), true);
  assert.equal(eventIsPast(ev, d("2026-11-20")), false);
});

test("next occurrence and the coming-up list", () => {
  const pay = { title: "Payday", date: "2026-11-06", repeat: "biweekly" };
  const bday = { title: "Birthday", date: "1990-11-08", repeat: "yearly" };
  assert.equal(nextOccurrence(pay, d("2026-11-07")).key, "2026-11-20");
  assert.equal(nextOccurrence(pay, d("2026-11-20")).key, "2026-11-20");
  const up = upcomingOccurrences([pay, bday], { from: d("2026-11-04"), to: d("2026-11-30") });
  assert.deepEqual(up.map((o) => `${o.key} ${o.event.title}`), ["2026-11-06 Payday", "2026-11-08 Birthday", "2026-11-20 Payday"]);
  assert.equal(upcomingOccurrences([pay, bday], { from: d("2026-11-04"), limit: 2 }).length, 2);
  assert.equal(eventsOnDay([pay, bday], d("2026-11-08")).length, 1);
});

test("broken records show nowhere and never throw", () => {
  for (const ev of [{}, { date: "soon" }, { date: "2026-13-45x" }, null]) {
    assert.deepEqual(occurrencesBetween(ev, d("2026-01-01"), d("2026-12-31")), []);
  }
  assert.equal(dayKey(new Date(2026, 0, 5)), "2026-01-05");
});

test("reminders: on the day, the day before, a week before", () => {
  const now = new Date(2026, 10, 4, 10, 0).getTime(); // Wed 4 Nov, 10:00
  const pay = { id: "p", title: "Payday", date: "2026-11-06", repeat: "biweekly", reminders: [0, 1], reminder_time: "08:30" };
  const fires = eventReminderFires([pay], { now, horizonDays: 15 });
  const fmt = (f) => `${dayKey(new Date(f.fireMs))} ${new Date(f.fireMs).getHours()}:${new Date(f.fireMs).getMinutes()} -${f.daysBefore}`;
  assert.deepEqual(fires.map(fmt), ["2026-11-05 8:30 -1", "2026-11-06 8:30 -0", "2026-11-19 8:30 -1"]);
  // Today's 08:30 has already passed; a date with no reminders never fires.
  const today = { id: "t", title: "Today", date: "2026-11-04", reminders: [0] };
  assert.equal(eventReminderFires([today, { id: "x", date: "2026-11-05" }], { now }).length, 0);
  // A week-before reminder for a date just past the horizon still fires inside it.
  const bday = { id: "b", title: "Birthday", date: "1990-11-20", repeat: "yearly", reminders: [7] };
  assert.deepEqual(eventReminderFires([bday], { now, horizonDays: 10 }).map((f) => dayKey(new Date(f.fireMs))), ["2026-11-13"]);
  assert.deepEqual(reminderDaysOf({ reminders: [7, "1", 3, 1] }), [1, 7]);
});

console.log(`\n${passed} passed`);
