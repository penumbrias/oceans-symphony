// The sound manager (v0.354.0) — Settings → Profile songs.
//
// What it keeps, on SystemSettings.sound_manager:
//   songs:      { [songKey]: { volume } }   a song's own default volume,
//               used wherever it plays unless that place set its own.
//   quiet:      [{ id, start: "HH:MM", end: "HH:MM", days: [0..6] }]
//               quiet hours (empty days = every day; an end before the
//               start runs past midnight).
//   quietMode:  "wait" (songs don't start on their own, a tap still plays
//               them) | "quieter" (they start, no louder than quietVolume).
//   quietVolume 0–100.
//   windows:    [{ id, name, start, end, days }] named times of day a
//               profile can give a song of its own.
//
// A profile's song stays where it always was (the PS.SONG look key, or an
// alter's older top-level profile_song). It can now also carry
//   windows: { [windowId]: { ref, title, volume? } }
// — the song that plays instead during that time window. Nothing here
// deletes a song: removing a window leaves the profiles' picks in place,
// they just stop being used.
//
// Volume, most specific first: the time window's own volume → the profile's
// volume → the song's default volume → 100. Quiet hours "quieter" then caps it.

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { pickPrimarySystemSettings } from "@/lib/systemSettingsSingleton";
import { PS } from "@/lib/profileStyle";
import { readSoundManager, hasAnySong, clampVol, SOUND_MANAGER_FIELD } from "@/lib/soundSchedule";

export * from "@/lib/soundSchedule";

export function useSoundManager() {
  const { data: rows = [] } = useQuery({ queryKey: ["systemSettings"], queryFn: () => base44.entities.SystemSettings.list() });
  const row = pickPrimarySystemSettings(rows) || null;
  return useMemo(() => readSoundManager(row), [row]);
}

// Writes some top-level keys of sound_manager on a fresh settings row.
// `changes` is { songs?, quiet?, quietMode?, quietVolume?, windows? }; a
// function gets the current value and returns the changes.
export async function patchSoundManager(changes) {
  const rows = await base44.entities.SystemSettings.list();
  const row = pickPrimarySystemSettings(rows);
  const current = row?.[SOUND_MANAGER_FIELD] && typeof row[SOUND_MANAGER_FIELD] === "object" ? row[SOUND_MANAGER_FIELD] : {};
  const delta = typeof changes === "function" ? changes(readSoundManager(row)) : changes;
  const next = { ...current, ...(delta || {}) };
  if (row?.id) return base44.entities.SystemSettings.update(row.id, { [SOUND_MANAGER_FIELD]: next });
  return base44.entities.SystemSettings.create({ [SOUND_MANAGER_FIELD]: next });
}

export async function setSongDefaultVolume(key, volume) {
  if (!key) return null;
  return patchSoundManager((sm) => {
    const songs = { ...sm.songs };
    const vol = clampVol(volume);
    if (vol === null) delete songs[key]; else songs[key] = { volume: vol };
    return { songs };
  });
}

// Re-renders once a minute, on the minute, so time windows and quiet hours
// take effect without reopening the page.
export function useMinuteTick(active = true) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!active) return undefined;
    let timer = null;
    const schedule = () => {
      const d = new Date();
      timer = setTimeout(() => { setNow(new Date()); schedule(); }, 60000 - d.getSeconds() * 1000 - d.getMilliseconds() + 50);
    };
    schedule();
    return () => clearTimeout(timer);
  }, [active]);
  return now;
}

// Sets (or with null removes) a profile's own song. An alter's older
// top-level song moves into Profile style the first time it's changed here,
// so there is one place it lives from then on.
export async function setProfileSong(type, id, song) {
  const { patchProfileLook } = await import("@/lib/lookSubject");
  if (type === "alter") {
    const fresh = await base44.entities.Alter.get(id);
    if (fresh?.profile_song && hasAnySong(fresh.profile_song) && !hasAnySong(fresh.custom_fields?.[PS.SONG])) {
      const { setAlterFields } = await import("@/lib/alterEntry");
      await patchProfileLook({ type, id }, { [PS.SONG]: song || undefined });
      await setAlterFields(id, { profile_song: null });
      return;
    }
  }
  return patchProfileLook({ type, id }, { [PS.SONG]: song || undefined });
}
