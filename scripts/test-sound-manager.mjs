#!/usr/bin/env node
// Checks the sound manager's rules (src/lib/soundSchedule.js): time windows
// (including ones past midnight and on picked days), quiet hours, which song
// plays when, and the volume order window → profile → song default → 100.
//
//   node scripts/test-sound-manager.mjs

import assert from "node:assert/strict";
import {
  readSoundManager, inWindow, quietNow, resolveSong, hasAnySong, songKey,
  alterSongOf, ownSongOf, profilesWithSongs, songCatalogue, formatDays,
} from "../src/lib/soundSchedule.js";

let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log(`ok  ${name}`); };
// 2026-11-04 is a Wednesday (day 3).
const at = (h, m = 0, day = 4) => new Date(2026, 10, day, h, m);

test("empty settings read as nothing set", () => {
  const sm = readSoundManager({});
  assert.deepEqual(sm.quiet, []);
  assert.equal(sm.quietMode, "wait");
});

test("bad stored values are cleaned", () => {
  const sm = readSoundManager({ sound_manager: { songs: { a: { volume: 250 }, b: { volume: "x" } }, quiet: [null, { start: "99:00", end: "07:00", days: [9, 1] }], quietMode: "loud" } });
  assert.equal(sm.songs.a.volume, 100);
  assert.equal(sm.songs.b, undefined);
  assert.equal(sm.quiet.length, 1);
  assert.equal(sm.quiet[0].start, "22:00");
  assert.deepEqual(sm.quiet[0].days, [1]);
  assert.equal(sm.quietMode, "wait");
});

test("a daytime window", () => {
  const w = { start: "06:00", end: "12:00", days: [] };
  assert.equal(inWindow(w, at(6)), true);
  assert.equal(inWindow(w, at(11, 59)), true);
  assert.equal(inWindow(w, at(12)), false);
  assert.equal(inWindow(w, at(5, 59)), false);
});

test("a window past midnight belongs to the day it started", () => {
  const w = { start: "22:00", end: "07:00", days: [3] }; // Wednesday nights
  assert.equal(inWindow(w, at(23, 0, 4)), true);  // Wed 11pm
  assert.equal(inWindow(w, at(3, 0, 5)), true);   // Thu 3am, still Wed night
  assert.equal(inWindow(w, at(3, 0, 4)), false);  // Wed 3am = Tue night
  assert.equal(inWindow(w, at(12, 0, 4)), false);
});

test("same start and end means all day", () => {
  assert.equal(inWindow({ start: "00:00", end: "00:00", days: [] }, at(15)), true);
});

const sm = readSoundManager({ sound_manager: {
  songs: { "song-1": { volume: 40 } },
  quiet: [{ id: "q", start: "22:00", end: "07:00" }],
  quietMode: "wait",
  windows: [{ id: "morning", name: "Morning", start: "06:00", end: "12:00" }, { id: "night", name: "Night", start: "20:00", end: "23:00" }],
} });

const profileSong = { ref: "/local-image/song-1", title: "Main", windows: { morning: { ref: "https://x/m.mp3", title: "Morning", volume: 70 }, night: { ref: "/local-image/song-2", title: "Night" } } };

test("the profile song plays outside its windows, at the song's default volume", () => {
  const r = resolveSong(profileSong, sm, at(15));
  assert.equal(r.song.ref, "/local-image/song-1");
  assert.equal(r.song.volume, 40);
  assert.equal(r.quiet, false);
});

test("a time window's song plays instead, with its own volume", () => {
  const r = resolveSong(profileSong, sm, at(8));
  assert.equal(r.song.title, "Morning");
  assert.equal(r.song.volume, 70);
  assert.equal(r.windowId, "morning");
});

test("the profile's own volume wins over the song default", () => {
  const r = resolveSong({ ...profileSong, volume: 55 }, sm, at(21));
  assert.equal(r.song.ref, "/local-image/song-2");
  assert.equal(r.song.volume, 55);
});

test("quiet hours stop songs starting on their own", () => {
  const r = resolveSong(profileSong, sm, at(22, 30));
  assert.equal(r.quiet, true);
  assert.equal(quietNow(sm, at(23)), true);
});

test("quiet hours 'quieter' caps the volume and lets it start", () => {
  const q = { ...sm, quietMode: "quieter", quietVolume: 20 };
  const r = resolveSong({ ref: "/local-image/song-9", volume: 90 }, q, at(23, 30));
  assert.equal(r.quiet, false);
  assert.equal(r.song.volume, 20);
});

test("a profile with only a time-of-day song", () => {
  const only = { windows: { morning: { ref: "https://x/m.mp3" } } };
  assert.equal(hasAnySong(only), true);
  assert.equal(resolveSong(only, sm, at(15)).song, null);
  assert.equal(resolveSong(only, sm, at(9)).song.ref, "https://x/m.mp3");
});

test("song keys ignore how a stored file is written", () => {
  assert.equal(songKey("/local-image/song-1"), "song-1");
  assert.equal(songKey("local-image://song-1"), "song-1");
});

test("an alter's own Profile style song wins over the older field and the defaults", () => {
  const own = { ref: "a" }; const legacy = { ref: "b" }; const def = { ref: "c" };
  assert.equal(alterSongOf({ custom_fields: { _profile_song: own }, profile_song: legacy }, { _profile_song: def }), own);
  assert.equal(alterSongOf({ profile_song: legacy }, { _profile_song: def }), legacy);
  assert.equal(alterSongOf({}, { _profile_song: def }), def);
  assert.equal(ownSongOf("alter", {}), null);
});

test("the catalogue lists each song once with every profile on it", () => {
  const profiles = profilesWithSongs({
    alters: [{ id: "a1", name: "Ash", custom_fields: { _profile_song: profileSong } }, { id: "a2", name: "Bee", profile_song: { ref: "local-image://song-1" } }, { id: "a3", name: "Old", is_archived: true, profile_song: { ref: "x" } }],
    groups: [{ id: "g1", name: "Choir", custom_fields: { _profile_song: { ref: "https://x/m.mp3" } } }],
  });
  assert.equal(profiles.length, 3);
  const songs = songCatalogue({ profiles, assets: [{ kind: "audio", image_url: "/local-image/song-7", name: "Spare" }, { kind: "audio", nature_sound: true, image_url: "/local-image/nature-1" }] });
  const one = songs.find((s) => s.key === "song-1");
  assert.deepEqual(one.uses.map((u) => u.name).sort(), ["Ash", "Bee"]);
  assert.equal(songs.find((s) => s.key === "https://x/m.mp3").uses.length, 2);
  assert.equal(songs.find((s) => s.key === "song-7").uses.length, 0);
  assert.equal(songs.some((s) => s.key === "nature-1"), false);
});

test("days read nicely", () => {
  assert.equal(formatDays([]), "Every day");
  assert.equal(formatDays([1, 2, 3, 4, 5]), "Weekdays");
  assert.equal(formatDays([0, 6]), "Weekends");
});

console.log(`\n${passed} sound manager checks passed.`);
