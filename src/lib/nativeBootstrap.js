// One-shot native-side boot for the Capacitor build target. Web and TWA
// builds hit the isNative() guard immediately and return — the dynamic
// imports below are tree-shaken out of those bundles.
//
// Per CLAUDE.md: native-only dependencies MUST be dynamically imported
// inside an isNative() branch so Vite never includes @capacitor/* in
// the web bundle.

import { isNative } from '@/lib/platform';

let started = false;

export async function initNativeShell() {
  if (started) return;
  started = true;
  if (!isNative()) return;

  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    // Stop the WebView from drawing under the system status bar so the
    // app header doesn't sit beneath the clock / signal icons.
    await StatusBar.setOverlaysWebView({ overlay: false });
    // App is dark-themed — Style.Light means light foreground content
    // (white icons/text), which is what we want on the dark backdrop.
    await StatusBar.setStyle({ style: Style.Light });
  } catch {
    // Non-fatal: an older Android WebView or a missing native plugin
    // shouldn't block the app from booting.
  }
}
