// Single entry point for "open this URL outside the app".
//
// In a browser / TWA, `window.open(url, "_blank")` just works — the
// OS hands the URL to the default browser (or opens a new tab on
// desktop). Inside a Capacitor WebView there IS no separate "outside"
// — both target="_blank" anchor clicks AND window.open() resolve INSIDE
// the same WebView, trapping the user on whatever external page they
// tapped (GitHub releases, Google Maps, a Notion link, a friend's
// shared URL in a bulletin). They have no UI affordance to come back
// to Symphony short of killing the app.
//
// On native we route through @capacitor/browser, which opens an
// in-app Chrome Custom Tab on Android. The user gets a clean swipe-
// back gesture to return to the app, the URL renders in Chrome's
// renderer (so cookies / passwords / extensions etc all behave as
// the user expects), and we don't have to ship our own URL opener.
//
// Web/TWA path is unchanged — straight passthrough to window.open.

import { isNative } from "@/lib/platform";

export async function openExternalUrl(url) {
  if (!url) return;
  if (isNative()) {
    try {
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({ url });
      return;
    } catch (e) {
      console.warn("[openExternalUrl] Browser.open failed:", e?.message || e);
      // Fall through to window.open. On native this typically opens
      // inside the WebView, which is worse than the Browser path but
      // better than silently doing nothing.
    }
  }
  try {
    window.open(url, "_blank", "noopener,noreferrer");
  } catch (e) {
    console.warn("[openExternalUrl] window.open failed:", e?.message || e);
  }
}
