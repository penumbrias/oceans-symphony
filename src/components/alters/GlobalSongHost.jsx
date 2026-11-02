// Plays a Song widget's track outside the widget pages — silently, with no
// popup (the widget itself is where you control it). Which song: the automatic
// one from the widget page opened last, else the one set to play on every page. Yields to any page that has a song of its own, and (via
// the shared one-sound-at-a-time rule) to chat videos / audio, then picks back
// up once those stop.
import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import ProfileSongPlayer from "@/components/alters/ProfileSongPlayer";
import { pickPrimarySystemSettings } from "@/lib/systemSettingsSingleton";
import { findAppWideSong, pageSongCount, subscribePageSongs, subscribeLastAutoSong } from "@/lib/songPresence";

export default function GlobalSongHost() {
  const { data: settingsList = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  const [pageSongs, setPageSongs] = useState(pageSongCount());
  const [, bump] = useState(0);
  useEffect(() => subscribePageSongs(setPageSongs), []);
  useEffect(() => subscribeLastAutoSong(() => bump((n) => n + 1)), []);
  const song = findAppWideSong(pickPrimarySystemSettings(settingsList));
  if (!song || pageSongs > 0) return null;
  return <ProfileSongPlayer everywhere song={song} />;
}
