// "A press-and-hold gesture owns the finger right now."
//
// The level rail (and the alter hold rail) take over a touch that is
// already down and follow it sideways — "sole" and "options" are both
// sideways slides. Page-level swipe listeners (the widget board's page
// swipe, the edge swipe-back) saw the same touch from touchstart and
// fired first: sliding to "sole" flipped the home page, and a rail opened
// near the left edge navigated back. Those listeners check this flag and
// bow out for the rest of the touch.
//
// A counter, not a boolean, so two overlapping owners (the alter hold
// rail handing off to the level rail) can't clear each other.

let owners = 0;

export function beginHoldGesture() {
  owners += 1;
  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    owners = Math.max(0, owners - 1);
  };
}

export function holdGestureLive() {
  return owners > 0;
}
