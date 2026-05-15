// Cross-platform geolocation helper. On native (Capacitor) it uses
// @capacitor/geolocation, which routes through Android's runtime
// permission system — so the first call triggers the OS permission
// dialog and subsequent denials surface as a typed error we can act
// on. On web/PWA it falls back to navigator.geolocation, which the
// browser prompts for natively.
//
// The three call sites that need a current position (Dashboard's Log
// Location quick action, QuickCheckInModal's GPS button, and Location
// History's Get GPS button) should call getCurrentPositionWithPrompt()
// instead of touching navigator.geolocation directly — it handles
// permission-not-granted gracefully with a clear toast message.

import { isNative } from "@/lib/platform";
import { toast } from "sonner";

// Resolves to { lat, lng } or null if the user cancelled / denied.
// Shows its own toasts on denial so call sites only need to handle
// the success case.
export async function getCurrentPositionWithPrompt({ timeout = 10000 } = {}) {
  if (isNative()) {
    try {
      const { Geolocation } = await import("@capacitor/geolocation");
      // checkPermissions first — if already granted, skip straight to
      // getCurrentPosition. If denied or prompt-needed, requestPermissions
      // surfaces Android's runtime dialog.
      let status;
      try { status = await Geolocation.checkPermissions(); }
      catch { status = { location: "prompt" }; }
      if (status.location !== "granted") {
        try {
          const req = await Geolocation.requestPermissions({ permissions: ["location"] });
          if (req.location !== "granted") {
            toast.error(
              req.location === "denied"
                ? "Location permission denied. Enable it in your device Settings → Apps → Oceans Symphony → Permissions to use this feature."
                : "Location permission is needed for this feature."
            );
            return null;
          }
        } catch (e) {
          toast.error("Couldn't request location permission: " + (e?.message || "unknown error"));
          return null;
        }
      }
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: false,
        timeout,
        maximumAge: 60000,
      });
      return { lat: pos.coords.latitude, lng: pos.coords.longitude };
    } catch (e) {
      toast.error("Could not get location: " + (e?.message || "unknown error"));
      return null;
    }
  }

  // Web / PWA path.
  if (!navigator.geolocation) {
    toast.error("GPS not available on this device");
    return null;
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        // Browser geolocation errors come back as PERMISSION_DENIED (1),
        // POSITION_UNAVAILABLE (2), or TIMEOUT (3). Make permission
        // denial actionable.
        if (err && err.code === 1) {
          toast.error("Location permission denied. Allow it in your browser's site settings to use this feature.");
        } else {
          toast.error("Could not get location: " + (err?.message || "unknown error"));
        }
        resolve(null);
      },
      { timeout, maximumAge: 60000 }
    );
  });
}
