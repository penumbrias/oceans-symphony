// One sound at a time. Every audio / video player (chat attachments, the Assets
// viewer, the home-screen song widget) registers its element here. When one
// starts playing, every other registered element is paused, so two tracks never
// talk over each other. Playback only — nothing is ever changed in the files.
//
// The song widget can also ask to be told when the app goes quiet
// (`subscribeIdle`) so its "play when there's no sound playing" option can
// start it once the other audio / video stops, pauses or ends.

const playing = new Set();
const all = new Set();
const idleListeners = new Set();

const notifyIdleIfQuiet = () => {
  if (playing.size) return;
  // Defer: a track ending and the next one starting in the same tick shouldn't
  // let the widget sneak in between.
  setTimeout(() => {
    if (playing.size) return;
    for (const fn of [...idleListeners]) { try { fn(); } catch { /* listener failed */ } }
  }, 250);
};

export function registerMedia(el, { exclusive = true } = {}) {
  if (!el) return () => {};
  all.add(el);
  const onPlay = () => {
    playing.add(el);
    if (!exclusive) return;
    for (const other of [...playing]) {
      if (other !== el) { try { other.pause(); } catch { /* already gone */ } }
    }
  };
  const onStop = () => { playing.delete(el); notifyIdleIfQuiet(); };
  el.addEventListener("play", onPlay);
  el.addEventListener("playing", onPlay);
  el.addEventListener("pause", onStop);
  el.addEventListener("ended", onStop);
  if (!el.paused) onPlay();
  return () => {
    el.removeEventListener("play", onPlay);
    el.removeEventListener("playing", onPlay);
    el.removeEventListener("pause", onStop);
    el.removeEventListener("ended", onStop);
    all.delete(el);
    if (playing.delete(el)) notifyIdleIfQuiet();
  };
}

// True when some registered element other than `except` is playing right now.
export const isOtherPlaying = (except) => [...playing].some((el) => el !== except);

// Called whenever everything has gone quiet. Returns an unsubscribe.
export function subscribeIdle(fn) {
  idleListeners.add(fn);
  return () => idleListeners.delete(fn);
}
