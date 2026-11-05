// A press-and-hold timer that only fires for a real, continuous hold.
//
// Two ways a quick tap used to count as a hold while the app was still
// loading (owner report: the home screen opened in edit mode after tapping
// a slow first screen):
//   · the finger lifted somewhere the hold's own element never heard about
//     (the screen re-drew under the finger, or a pop-up appeared), so
//     nothing cancelled the timer. Any finger lift anywhere now cancels it.
//   · the app was too busy to handle the lift before the timer ran. If the
//     timer runs noticeably late, the hold can't be trusted and is dropped;
//     a real hold on a responsive screen always fires on time.
const LATE_MS = 150;

export function startHoldTimer(onHold, ms = 600) {
  const armedAt = performance.now();
  let id = null;
  const stop = () => {
    clearTimeout(id);
    window.removeEventListener("pointerup", stop, true);
    window.removeEventListener("pointercancel", stop, true);
  };
  window.addEventListener("pointerup", stop, true);
  window.addEventListener("pointercancel", stop, true);
  id = setTimeout(() => {
    stop();
    if (performance.now() - armedAt > ms + LATE_MS) return;
    onHold();
  }, ms);
  return id;
}
