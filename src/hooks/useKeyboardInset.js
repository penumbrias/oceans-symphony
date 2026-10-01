import { useEffect, useState } from "react";

// Returns the height (in px) currently obscured by the on-screen keyboard,
// using the visualViewport API. 0 when no keyboard is open or the API is
// unavailable. Used to keep modals centered in the visible viewport.
export default function useKeyboardInset() {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return;
    const vv = window.visualViewport;
    const update = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setInset(kb);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return inset;
}

// Is the on-screen keyboard up, and how far above the layout bottom does
// its top edge sit?
//
// Two platforms report it two ways:
//   • browsers (and iOS): the layout viewport keeps its height and the
//     VISUAL viewport shrinks — `inset` is the keyboard height;
//   • the Android app: the whole WebView is resized to the space above
//     the keyboard, so innerHeight shrinks with it and `inset` is ~0.
// Docks that only trusted `inset` decided "no keyboard" on Android and
// parked above the bottom nav instead — a bar-high gap between the
// toolbar and the keyboard. So a viewport that is much shorter than the
// tallest one seen at this width also counts as "keyboard open"; the dock
// then sits at the bottom of the (already shrunk) viewport.
export function useKeyboardState() {
  const [state, setState] = useState({ open: false, inset: 0 });
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const vv = window.visualViewport;
    let tallest = 0;
    let width = window.innerWidth;
    const update = () => {
      if (window.innerWidth !== width) { width = window.innerWidth; tallest = 0; } // rotation
      const visible = vv ? vv.height : window.innerHeight;
      tallest = Math.max(tallest, window.innerHeight, visible);
      const inset = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
      // A shorter viewport only means "keyboard" while something editable
      // has focus — on desktop, a window dragged smaller is just smaller.
      const el = document.activeElement;
      const editing = !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
      const shrunk = editing && tallest - visible > 120;
      const open = inset > 40 || shrunk;
      setState((s) => (s.open === open && s.inset === inset ? s : { open, inset }));
    };
    update();
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    return () => {
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
    };
  }, []);
  return state;
}
