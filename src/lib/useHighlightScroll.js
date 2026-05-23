import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

// Generic "I just navigated here from a notification / pin / link —
// please show me where the source lives" hook. Reads `?highlight=<id>`
// from the URL, looks up `[data-highlight-id="<id>"]` on the page,
// scrolls it into view, pulses a 3-second halo, and strips the param
// so a refresh or back-nav doesn't re-trigger the highlight.
//
// Designed for the amnesia / context-switch case the user described:
// "navigating to places from notifications, such as @ mentions,
// navigating to plans/upcoming activities/anything the page should
// scroll to display the specific source of the notification and also
// similarly highlight it with a glowing halo for three seconds."
//
// Why a hook (and not e.g. a global side-effect on every route change):
//   - Pages know when their data is ready. The hook re-runs whenever
//     a passed-in `ready` dep changes — call sites pass query data so
//     the highlight fires AFTER the target element has been rendered.
//   - Per-page styling. The default class is `.scroll-highlight-halo`
//     but callers can override (e.g. round vs. rectangular targets).
//
// Usage:
//   useHighlightScroll([rowsLoaded]);                  // wait for rows
//   useHighlightScroll([rowsLoaded], { className: "..." });
//   useHighlightScroll([items.length > 0]);            // boolean ready
//
// Target rendering:
//   <div data-highlight-id={item.id} className="…">…</div>
export function useHighlightScroll(readyDeps = [], options = {}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const highlightId = searchParams.get("highlight");
  const className = options.className || "scroll-highlight-halo";
  const durationMs = options.durationMs ?? 3000;

  useEffect(() => {
    if (!highlightId) return;
    // Defer one tick so React commits + the browser paints before we
    // try to find the element. Without this, a freshly-navigated
    // route's targets aren't in the DOM yet on the very first effect
    // run.
    const findTimer = setTimeout(() => {
      const el = document.querySelector(`[data-highlight-id="${CSS.escape(highlightId)}"]`);
      if (!el) return;
      try {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      } catch {
        // older browsers — fall back to instant scroll
        el.scrollIntoView();
      }
      el.classList.add(className);
      const clearTimer = setTimeout(() => el.classList.remove(className), durationMs);
      // Strip the param so back-nav / refresh doesn't re-fire.
      const next = new URLSearchParams(searchParams);
      next.delete("highlight");
      setSearchParams(next, { replace: true });
      cleanupRef.current = () => clearTimeout(clearTimer);
    }, 120);
    const cleanupRef = { current: null };
    return () => {
      clearTimeout(findTimer);
      cleanupRef.current?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightId, ...readyDeps]);
}

// Convenience: build a navigation path with a `highlight` query param
// appended (preserving any existing query). Used by notification click
// handlers to pass the source id through to the destination page.
export function withHighlightParam(path, id) {
  if (!id) return path;
  if (!path) return `/?highlight=${encodeURIComponent(id)}`;
  const [base, query] = path.split("?");
  const params = new URLSearchParams(query || "");
  params.set("highlight", id);
  return `${base}?${params.toString()}`;
}
