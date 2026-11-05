// Widgets that open up push the page down (v0.353.0).
//
// A widget's size is the person's choice — "What's new" as a thin strip, a
// list cut to three rows. But some widgets open something when tapped (an
// expanding list, a "show more", a details panel), and inside a fixed box
// that new content was cut off, with the rest of the page sitting on top
// of it. This hook notices that and reports how tall the widget wants to
// be, so the board can show it taller — display only, nothing is saved —
// and let everything below move down. When it closes again, the widget
// goes back to the size it was given.
//
// "Opened" is told apart from "was always cut off" by the person: only a
// widget they just pressed or typed in can grow, and only by what it gained
// after that press. A widget cropped on purpose stays cropped; one that
// finishes loading on its own never jumps.
//
// How tall it wants to be: the widget is measured at the size it was given
// (`data-base-h` on its cell, set by the board), as that size plus the
// most any scroll box inside it is hiding. Forcing the size, reading and
// restoring all happen in one frame, so nothing flickers.

import { useEffect, useRef, useState } from "react";

const ARM_MS = 4000; // how long after a press growth still counts as "opened"
const SLACK = 8; // px of change that isn't worth moving the page for
const RECHECK_MS = [120, 360, 900, 1800]; // catch opening animations

function hiddenBelow(content) {
  let most = Math.max(0, content.scrollHeight - content.clientHeight);
  for (const el of content.querySelectorAll("*")) {
    const extra = el.scrollHeight - el.clientHeight;
    if (extra <= most || el.clientHeight === 0) continue;
    const { overflowY } = getComputedStyle(el);
    if (overflowY === "auto" || overflowY === "scroll" || overflowY === "hidden" || overflowY === "clip") most = extra;
  }
  return most;
}

// The height this cell would need, measured at the size it was given.
function measureNeed(host) {
  const base = Number(host.getAttribute("data-base-h"));
  const content = host.querySelector("[data-widget-content]");
  if (!base || !content) return null;
  const prev = host.style.height;
  host.style.height = `${base}px`;
  const hidden = hiddenBelow(content);
  host.style.height = prev;
  return { base, hidden };
}

export function useExpandingWidgets(gridRef, enabled, resetKey) {
  const [grown, setGrown] = useState(() => new Map()); // instanceId → px
  const armed = useRef(new Map()); // instanceId → { at, hidden }

  useEffect(() => {
    armed.current = new Map();
    setGrown((cur) => (cur.size ? new Map() : cur));
    const grid = gridRef.current;
    if (!enabled || !grid || typeof MutationObserver === "undefined") return undefined;

    let raf = 0;
    const timers = new Set();
    const hostFor = (id) => [...grid.querySelectorAll(":scope > [data-widget-id]")]
      .find((n) => n.getAttribute("data-widget-id") === id);

    const recompute = () => {
      raf = 0;
      if (!armed.current.size) return;
      const now = Date.now();
      const updates = new Map();
      for (const [id, arm] of armed.current) {
        const host = hostFor(id);
        const m = host ? measureNeed(host) : null;
        if (!m) { armed.current.delete(id); updates.set(id, null); continue; }
        const gained = m.hidden - arm.hidden;
        if (gained > SLACK) {
          arm.open = true;
          // Only what opening added: a widget cut short on purpose shows
          // the new part, not everything it was already hiding.
          updates.set(id, m.base + gained);
        } else {
          updates.set(id, null);
          // Closed again, or the press opened nothing: stop watching once
          // the window has passed.
          if (arm.open || now - arm.at > ARM_MS) armed.current.delete(id);
        }
      }
      // Our own measuring touched the cells' style — not a change to react to.
      mo.takeRecords();
      setGrown((cur) => {
        let next = null;
        for (const [id, px] of updates) {
          const have = cur.get(id);
          if (px == null ? have == null : have != null && Math.abs(have - px) <= 1) continue;
          next = next || new Map(cur);
          if (px == null) next.delete(id); else next.set(id, px);
        }
        return next || cur;
      });
    };
    const queue = () => { if (!raf) raf = requestAnimationFrame(recompute); };
    const later = () => {
      for (const ms of RECHECK_MS) {
        const t = setTimeout(() => { timers.delete(t); queue(); }, ms);
        timers.add(t);
      }
    };

    const onPress = (e) => {
      const host = e.target?.closest?.("[data-widget-id]");
      if (!host || host.parentElement !== grid) return;
      const id = host.getAttribute("data-widget-id");
      const have = armed.current.get(id);
      if (have?.open) { have.at = Date.now(); later(); return; }
      const m = measureNeed(host);
      if (!m) return;
      armed.current.set(id, { at: Date.now(), hidden: m.hidden, open: false });
      later();
    };

    const mo = new MutationObserver(queue);
    mo.observe(grid, { childList: true, subtree: true, characterData: true });
    grid.addEventListener("pointerdown", onPress, true);
    grid.addEventListener("keydown", onPress, true);
    return () => {
      mo.disconnect();
      grid.removeEventListener("pointerdown", onPress, true);
      grid.removeEventListener("keydown", onPress, true);
      if (raf) cancelAnimationFrame(raf);
      for (const t of timers) clearTimeout(t);
    };
  }, [gridRef, enabled, resetKey]);

  return grown;
}
