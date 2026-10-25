// Scratch pad → tilt: which way is "down" on the screen right now, from
// the phone's motion sensors, so particles can slide as the phone tilts.
//
// Uses deviceorientation (beta/gamma), not raw accelerometer values,
// because its signs are the same on Android and iOS. The vector is in
// screen terms (x right, y down), already turned for landscape, and runs
// from 0 (lying flat) to 1 (edge straight down).
//
// Two ways to use it:
//   "gravity" – down really is down: hold the phone up and they fall.
//   "nudge"   – only a CHANGE in tilt pushes them; hold still in any
//               position and they settle back to their own rules. The
//               resting position is learned over a couple of seconds.
//
// iOS asks permission, and only from a tap: call requestTiltPermission()
// inside the click handler that turns tilt on or opens full screen.

export const TILT_MODES = ["off", "nudge", "gravity"];

export const tiltSupported = () => typeof window !== "undefined" && "DeviceOrientationEvent" in window;

export async function requestTiltPermission() {
  try {
    const ask = window.DeviceOrientationEvent?.requestPermission;
    if (typeof ask !== "function") return true;
    return (await ask.call(window.DeviceOrientationEvent)) === "granted";
  } catch {
    return false;
  }
}

function screenAngle() {
  const a = window.screen?.orientation?.angle;
  if (Number.isFinite(a)) return a;
  const o = Number(window.orientation);
  return Number.isFinite(o) ? (o + 360) % 360 : 0;
}

// Calls onTilt({ x, y }) as the phone moves. Returns a stop function.
export function startTilt(mode, onTilt) {
  if (mode === "off" || !tiltSupported()) return () => {};
  let base = null;
  let lastT = 0;
  const onOrient = (e) => {
    if (e.beta == null || e.gamma == null) return;
    const b = (e.beta * Math.PI) / 180;
    const g = (e.gamma * Math.PI) / 180;
    // Gravity across the screen, in the phone's portrait frame.
    const px = Math.cos(b) * Math.sin(g);
    const py = Math.sin(b);
    // Turned into the screen's current frame.
    const th = (screenAngle() * Math.PI) / 180;
    let x = px * Math.cos(th) + py * Math.sin(th);
    let y = -px * Math.sin(th) + py * Math.cos(th);
    if (mode === "nudge") {
      const now = e.timeStamp || performance.now();
      const dt = lastT ? Math.min(0.5, Math.max(0, (now - lastT) / 1000)) : 0;
      lastT = now;
      if (!base) base = { x, y };
      const k = 1 - Math.exp(-dt / 1.8);
      base.x += (x - base.x) * k;
      base.y += (y - base.y) * k;
      x = (x - base.x) * 1.6;
      y = (y - base.y) * 1.6;
    }
    onTilt({ x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) });
  };
  window.addEventListener("deviceorientation", onOrient);
  return () => window.removeEventListener("deviceorientation", onOrient);
}
