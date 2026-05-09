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
