// Which widget boards are on screen right now, by their event scope
// ("os-classic", "os-v2", "os-profile"…). ExperimentalDashboard announces
// itself while mounted, so a tool outside the page (the pixel look's tool
// rail) can offer "Edit page" only where there is a page to edit.
// Nothing here is saved; it is the live screen only.
import { useEffect, useState } from "react";

const counts = new Map();
const EVENT = "os-board-presence";

export function announceBoard(scope) {
  counts.set(scope, (counts.get(scope) || 0) + 1);
  try { window.dispatchEvent(new CustomEvent(EVENT)); } catch { /* SSR */ }
  return () => {
    const n = (counts.get(scope) || 1) - 1;
    if (n > 0) counts.set(scope, n); else counts.delete(scope);
    try { window.dispatchEvent(new CustomEvent(EVENT)); } catch { /* SSR */ }
  };
}

export function boardOnScreen(scope) {
  return (counts.get(scope) || 0) > 0;
}

/** The scopes with a board on screen, kept live. */
export function useBoardsOnScreen() {
  const read = () => [...counts.keys()].sort().join(" ");
  const [key, setKey] = useState(read);
  useEffect(() => {
    const on = () => setKey(read());
    on();
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return key ? key.split(" ") : [];
}
