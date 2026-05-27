import { useEffect, useRef, useState } from "react";

// Drives the analytics SystemMap's layout via a Web Worker so the
// O(n²) bumper + cofronting compute doesn't freeze the main thread on
// very large systems. Each new `input` reference spawns a fresh
// worker; the previous one is terminated to free any in-flight
// compute (the worker has no cooperative cancel — termination is the
// only way to actually stop a running loop).
//
// Caller contract:
//   - Pass a memoized `input` object. A new reference triggers a
//     compute, so the caller should useMemo it on the real
//     dependencies (frontingSessions, alters, timeMode, etc.).
//   - `input === null` means "don't compute" (e.g. tab inactive or
//     data not loaded yet). The hook stays in 'idle'.
//
// Return shape:
//   state   — 'idle' | 'computing' | 'ready' | 'error'
//   result  — { frontingTime, frontingTimeAll, cofrontingTime,
//              cofrontingTimeAll, nodePositions } once ready
//   error   — string when state === 'error'
//   restart — () => kick a fresh compute (useful after a worker crash
//             where the user wants to retry without re-toggling
//             filters)
//
// Why no in-memory cache here: the analytics tab is usually opened
// once per session and recomputes are cheap to re-issue if the user
// flips back. Adding a cache opens questions about invalidation that
// aren't worth the complexity for this surface.
export default function useSystemMapLayout(input) {
  const workerRef = useRef(null);
  const [state, setState] = useState("idle");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [restartTick, setRestartTick] = useState(0);

  useEffect(() => {
    if (input == null) {
      setState("idle");
      setResult(null);
      setError(null);
      return;
    }

    // Terminate any previous worker so its in-flight compute stops
    // burning CPU. Web Workers have no cooperative cancel — `terminate`
    // is the only escape from a hot loop.
    if (workerRef.current) {
      try { workerRef.current.terminate(); } catch { /* already dead */ }
      workerRef.current = null;
    }

    let cancelled = false;
    setState("computing");
    setError(null);

    let worker;
    try {
      worker = new Worker(
        new URL("../workers/systemMapLayout.worker.js", import.meta.url),
        { type: "module" }
      );
    } catch (err) {
      // Worker construction failure (rare — old WebView, CSP block, etc.).
      // Surface to caller so it can fall back to the main-thread path or
      // show the "too large" message.
      setError(err && err.message ? err.message : String(err));
      setState("error");
      return;
    }
    workerRef.current = worker;

    worker.onmessage = (event) => {
      if (cancelled) return;
      const data = event.data || {};
      if (data.type === "result") {
        setResult(data.result);
        setState("ready");
      } else if (data.type === "error") {
        setError(data.error);
        setState("error");
      }
      // 'progress' events are intentionally ignored — the spinner
      // doesn't need fine-grained phase data and chatty progress
      // postMessages from a worker mid-compute can themselves jank the
      // main thread.
    };
    worker.onerror = (err) => {
      if (cancelled) return;
      setError(err && err.message ? err.message : "Worker crashed");
      setState("error");
    };

    worker.postMessage({ type: "compute", input });

    return () => {
      cancelled = true;
      try { worker.terminate(); } catch { /* ignore */ }
      if (workerRef.current === worker) workerRef.current = null;
    };
  }, [input, restartTick]);

  return {
    state,
    result,
    error,
    restart: () => setRestartTick((t) => t + 1),
  };
}
