import { useEffect, useState } from "react";
import { subscribeSoundscape, getSoundscapeState } from "@/lib/soundscape/engine";

export function useSoundscapeState() {
  const [s, setS] = useState(getSoundscapeState);
  useEffect(() => subscribeSoundscape(setS), []);
  return s;
}

export function useRemaining(endsAt) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!endsAt) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [endsAt]);
  if (!endsAt) return null;
  return Math.max(0, Math.round((endsAt - now) / 1000));
}

export const fmtClock = (secs) => {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
};

