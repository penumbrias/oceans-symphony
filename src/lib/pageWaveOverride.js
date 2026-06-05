// Tiny shared store so a profile page (alter / group) can recolour the APP
// HEADER wave (HeaderWaveBlock) for just the time that profile is open.
//
// The header lives in AppLayout, OUTSIDE the profile's `.os-pf` CSS scope, so a
// per-profile `--color-*` override can't reach it. Instead the profile publishes
// its chosen wave colour here on mount and clears it on unmount; HeaderWaveBlock
// subscribes and, when an override is present, paints the wave that colour (and
// shows it even if the global wave is set to "off"). Module-level singleton —
// only one page is "current" at a time.

let _value = null;
const _subs = new Set();

export function getPageWaveOverride() {
  return _value;
}

export function setPageWaveOverride(v) {
  const next = v || null;
  if (next === _value) return;
  _value = next;
  _subs.forEach((cb) => { try { cb(_value); } catch { /* ignore subscriber errors */ } });
}

export function subscribePageWaveOverride(cb) {
  _subs.add(cb);
  return () => _subs.delete(cb);
}
