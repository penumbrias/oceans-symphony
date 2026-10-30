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


// How many Soundscape widgets are on screen. The floating "playing" pill
// (SoundscapeGlobalBar) steps aside while one is, since the widget has
// its own stop button and countdown.
let widgetCount = 0;
const presenceListeners = new Set();
const notifyPresence = () => presenceListeners.forEach((fn) => fn(widgetCount));
export function useSoundscapeWidgetMounted(counts = true) {
  useEffect(() => {
    if (!counts) return undefined;
    widgetCount += 1; notifyPresence();
    return () => { widgetCount -= 1; notifyPresence(); };
  }, [counts]);
}
export function useSoundscapeWidgetsOnScreen() {
  const [n, setN] = useState(widgetCount);
  useEffect(() => { presenceListeners.add(setN); setN(widgetCount); return () => presenceListeners.delete(setN); }, []);
  return n;
}
