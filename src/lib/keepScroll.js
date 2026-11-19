// Measure an element at another size without moving the page (v0.374.8).
//
// Some measuring briefly gives an element a different height, reads its
// size, then puts the height back, all in one frame so nothing flickers.
// The browser's scroll anchoring still sees that brief change: when the
// element shrinks for the measurement, the scroll box shifts its position
// to keep what is on screen in place, and putting the height back does not
// shift it back. On a phone the page then jumped somewhere else each time
// the measuring ran, which for an opened widget was on every touch (#634:
// the feelings picker in the fronting panel kept throwing the page to the
// bottom).
//
// keepScroll(node, measure) records where every scroll box around the node
// stands, runs measure(), and puts each one back where it was.

export function keepScroll(node, measure) {
  const saved = [];
  for (let el = node?.parentElement; el; el = el.parentElement) {
    saved.push([el, el.scrollTop, el.scrollLeft]);
  }
  try {
    return measure();
  } finally {
    for (const [el, top, left] of saved) {
      if (el.scrollTop !== top) el.scrollTop = top;
      if (el.scrollLeft !== left) el.scrollLeft = left;
    }
  }
}
