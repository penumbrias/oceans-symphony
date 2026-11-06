// Code-splitting helpers (v0.357.0).
//
// lazyNamed: React.lazy for a NAMED export, so a big module (a widget body,
// a chart) is fetched the first time something renders it instead of being
// parsed at startup. Every lazy made from the same loader shares one fetch.
// Whatever renders one needs a <Suspense> above it — the home board and the
// widget library wrap every widget body in one (WidgetSuspense below).
//
// whenIdle: run work once the browser has nothing better to do, so jobs that
// don't change what's on screen (prefetching a page, best-effort tidy-ups)
// never compete with the first paint or a tap.
import React from "react";

export function lazyNamed(load, name) {
  return React.lazy(() => load().then((m) => ({ default: m[name] })));
}

export function whenIdle(fn, { timeout = 4000, delay = 0 } = {}) {
  let cancelled = false;
  let idleId = null;
  const run = () => {
    if (cancelled) return;
    try { fn(); } catch { /* best-effort */ }
  };
  const schedule = () => {
    if (cancelled) return;
    if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
      idleId = window.requestIdleCallback(run, { timeout });
    } else {
      idleId = setTimeout(run, 200);
    }
  };
  const delayId = delay > 0 ? setTimeout(schedule, delay) : (schedule(), null);
  return () => {
    cancelled = true;
    if (delayId) clearTimeout(delayId);
    if (idleId != null) {
      if (typeof window !== "undefined" && typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(idleId);
      clearTimeout(idleId);
    }
  };
}

// The placeholder a lazy widget body shows for the moment its code arrives:
// an empty box of the widget's own size, so nothing jumps.
export function WidgetSuspense({ children }) {
  return <React.Suspense fallback={<div style={{ minHeight: 24 }} aria-busy="true" data-launch-pending="" />}>{children}</React.Suspense>;
}
