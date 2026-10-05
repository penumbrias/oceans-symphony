import { useEffect, useState } from "react";

// A "current time" value that re-renders every `intervalMs` AND the moment
// the app comes back to the foreground. Android freezes a backgrounded web
// view's timers, so a plain setInterval clock can be hours stale on resume —
// a 5am plan opened at 8am read as "planned in 3 hours" because the filter
// still thought it was before 5.
export function useNowTick(intervalMs = 60_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const onVisible = () => { if (document.visibilityState !== "hidden") refresh(); };
    const id = setInterval(refresh, intervalMs);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", refresh);
    };
  }, [intervalMs]);
  return now;
}
