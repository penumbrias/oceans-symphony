import { useState, useCallback } from "react";

const KEY = "symphony_analyticsGrouping";

export function useAnalyticsGrouping() {
  const [mode, setModeState] = useState(() => {
    try { return localStorage.getItem(KEY) || "individual"; } catch { return "individual"; }
  });

  const setMode = useCallback((next) => {
    setModeState(next);
    try { localStorage.setItem(KEY, next); } catch {}
  }, []);

  return { mode, setMode, isGroupMode: mode === "group" };
}
