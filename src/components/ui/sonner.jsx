"use client";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "@/lib/ThemeContext"
import { Toaster as Sonner } from "sonner"
import { base44 } from "@/api/base44Client";
import { readNotificationPrefs, setActivePrefs, installNotificationFilter } from "@/lib/notificationPrefs";

const Toaster = ({
  ...props
}) => {
  // Pull from our own ThemeContext so toasts follow the same dark/light
  // pick as the rest of the app. The previous import was next-themes, but
  // next-themes isn't wired up anywhere — its useTheme always defaulted
  // to "system" and the toaster could end up dark while the page was
  // light (or vice-versa) on OS-mismatched devices.
  const { themeMode } = useTheme()
  const theme = themeMode === "system" ? "system" : (themeMode === "dark" ? "dark" : "light")

  // Pull notification prefs from the same systemSettings cache the rest
  // of the app shares (useTerms / useAccessibility / useAlterLabel).
  const { data: list = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  const prefs = readNotificationPrefs(list?.[0]);

  // Patch toast.success / info / warning once, then re-sync the module-
  // level cache every time the prefs object changes. The patched
  // methods read the cache on every call so they always see the latest
  // user preference without re-patching.
  useEffect(() => { installNotificationFilter(); }, []);
  useEffect(() => { setActivePrefs(prefs); }, [prefs.showSuccess, prefs.showInfo, prefs.showWarning]);

  // Sonner only takes a single numeric/string `offset` and applies it
  // to whichever edge the chosen position anchors against. We feed it
  // a safe-area-aware value so toasts never slide under the device
  // status bar / Spotify pill at the top, or the gesture-area chin at
  // the bottom. `position` is read off prefs above.
  const isTop = prefs.position.startsWith("top-");
  const offset = isTop
    ? "calc(env(safe-area-inset-top, 0px) + 16px)"
    : "calc(env(safe-area-inset-bottom, 0px) + 16px)";

  return (
    // Force remount when `position` changes — Sonner's `position`
    // prop is documented as reactive but in v2.0.1 the rendered
    // portal sticks to the position it had at first mount. Keying
    // on position guarantees a fresh container at the new corner.
    // `{...props}` is spread FIRST so the prefs-driven position / duration
    // / offset below always win. A stray `position="top-center"` passed by
    // the App.jsx mount used to land after these and silently override the
    // user's chosen corner — which is why the "where they appear" setting
    // appeared to do nothing.
    (<Sonner
      key={prefs.position}
      theme={theme}
      className="toaster group"
      {...props}
      position={prefs.position}
      duration={prefs.durationMs}
      offset={offset}
      mobileOffset={offset}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }} />)
  );
}

export { Toaster }
