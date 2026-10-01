import { useEffect, useState } from "react";

// True at the `lg:` breakpoint (≥1024px) — where the classic layout swaps
// the phone header and bottom bar for the desktop sidebar, and the v2
// chrome swaps its bottom bar for the side rail. Reactive, so a window
// dragged across the breakpoint re-renders.
export const WIDE_QUERY = "(min-width: 1024px)";

export function useIsWide() {
  const [wide, setWide] = useState(
    () => typeof window !== "undefined" && window.matchMedia(WIDE_QUERY).matches
  );
  useEffect(() => {
    const mq = window.matchMedia(WIDE_QUERY);
    const on = (e) => setWide(e.matches);
    mq.addEventListener("change", on);
    setWide(mq.matches);
    return () => mq.removeEventListener("change", on);
  }, []);
  return wide;
}

export default useIsWide;
