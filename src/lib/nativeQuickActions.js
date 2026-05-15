// JS bridge to QuickActionsPlugin (Android Java) — pushes the user's
// in-app QuickAction list to the OS launcher's long-press menu via
// ShortcutManager.setDynamicShortcuts. Long-pressing the app icon
// then shows each configured quick action as a tappable shortcut;
// tapping a shortcut opens MainActivity with a VIEW intent at
// /?quickAction=<id>, the Dashboard reads that param on mount and
// runs the same executeQuickAction() the in-app menu uses.
//
// No-ops on web/TWA (no ShortcutManager) and on Android < 7.1 (the
// Java plugin guards there too).

import { isNative } from "@/lib/platform";
import { registerPlugin } from "@capacitor/core";
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

// registerPlugin returns a proxy that lazily calls into the native
// plugin — safe to construct at module load even on web (the proxy
// only ever bridges on isNative()).
const NativeQuickActions = registerPlugin("QuickActions");

// Hand the OS launcher a fresh shortcut list. Cap at 4 because most
// Android launchers display at most 4 long-press shortcuts; the
// native plugin also enforces ShortcutManager.maxShortcutCountPerActivity
// so we don't lose information by trimming here, but skipping the
// extra round-trip is cheap.
const MAX_SHORTCUTS = 4;

async function pushNativeQuickActions(items) {
  if (!isNative()) return null;
  try {
    return await NativeQuickActions.setQuickActions({ items: items.slice(0, MAX_SHORTCUTS) });
  } catch (e) {
    console.warn("[nativeQuickActions] setQuickActions failed:", e?.message || e);
    return null;
  }
}

export async function clearNativeQuickActions() {
  if (!isNative()) return;
  try { await NativeQuickActions.clearQuickActions(); }
  catch { /* non-fatal */ }
}

// Hook: keeps the OS shortcut list in sync with the user's QuickAction
// records. Mounted in AuthenticatedApp so it runs everywhere, not
// just on the Dashboard. On web the effect short-circuits at the
// isNative() guard inside pushNativeQuickActions.
//
// Trims to the first MAX_SHORTCUTS by `order` (matching the in-app
// menu's display order). Includes the QuickAction.id in the deep-link
// URL so the Dashboard can find and execute the exact same record.
export function useNativeQuickActionsSync() {
  const lastSigRef = useRef(null);
  const { data: quickActions = [] } = useQuery({
    queryKey: ["quickActions"],
    queryFn: () => base44.entities.QuickAction.list("order"),
  });

  useEffect(() => {
    if (!isNative()) return;
    // Sort + slice to the same set the Dashboard surfaces. Stable sig
    // so we don't re-push on every render when nothing meaningful
    // changed.
    const ordered = [...quickActions].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const trimmed = ordered.slice(0, MAX_SHORTCUTS);
    const sig = JSON.stringify(trimmed.map(qa => [qa.id, qa.label, qa.type, qa.order]));
    if (sig === lastSigRef.current) return;
    lastSigRef.current = sig;

    if (trimmed.length === 0) {
      clearNativeQuickActions();
      return;
    }
    const items = trimmed.map(qa => ({
      id: qa.id,
      // Truncate to fit Android's recommendation (~10 chars) without
      // hard-cutting longer ones — we set both short and long labels
      // and Android picks based on context.
      label: (qa.label || "Action").slice(0, 25),
      longLabel: qa.label || "Action",
      url: `https://app.local.oceans-symphony/?quickAction=${encodeURIComponent(qa.id)}`,
    }));
    pushNativeQuickActions(items);
  }, [quickActions]);
}
