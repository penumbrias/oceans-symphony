// While anything scrolls, <body data-os-scrolling> is set, and cleared a
// moment after it stops. Decorative motion (the header wave) pauses on it,
// so a phone spends every frame of a scroll on the scroll itself instead of
// also redrawing an animation (v0.371.6, "the app feels low-framerate").
//
// One passive capture listener for the whole app; it never blocks a scroll
// and only touches the DOM when scrolling starts and stops.

const SETTLE_MS = 180;

export function installScrollingFlag() {
  if (typeof document === "undefined" || installScrollingFlag.done) return () => {};
  installScrollingFlag.done = true;
  let timer = 0;
  let on = false;
  const stop = () => {
    timer = 0;
    on = false;
    delete document.body.dataset.osScrolling;
  };
  const onScroll = () => {
    if (!on) {
      on = true;
      document.body.dataset.osScrolling = "";
    }
    if (timer) clearTimeout(timer);
    timer = setTimeout(stop, SETTLE_MS);
  };
  document.addEventListener("scroll", onScroll, { capture: true, passive: true });
  return () => {
    document.removeEventListener("scroll", onScroll, { capture: true });
    if (timer) clearTimeout(timer);
    stop();
    installScrollingFlag.done = false;
  };
}
