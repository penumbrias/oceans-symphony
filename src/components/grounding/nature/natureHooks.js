import { useEffect, useState } from "react";
import { subscribeNature, getNatureState } from "@/lib/natureSounds/naturePlayer";
import { subscribeNaturePrefs, readNaturePrefs } from "@/lib/natureSounds/naturePrefs";
import { subscribeNatureOffline, getNatureOffline, refreshSavedSounds } from "@/lib/natureSounds/natureOffline";

export function useNatureState() {
  const [s, setS] = useState(getNatureState);
  useEffect(() => subscribeNature(setS), []);
  return s;
}

export function useNaturePrefs() {
  const [p, setP] = useState(readNaturePrefs);
  useEffect(() => subscribeNaturePrefs(setP), []);
  return p;
}

export function useNatureOffline() {
  const [o, setO] = useState(getNatureOffline);
  useEffect(() => {
    const off = subscribeNatureOffline(setO);
    if (getNatureOffline().saved == null) refreshSavedSounds();
    return off;
  }, []);
  return o;
}

// 3725 → "1:02:05", 65 → "1:05".
export function fmtLength(secs) {
  const t = Math.max(0, Math.floor(Number(secs) || 0));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = String(t % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}
