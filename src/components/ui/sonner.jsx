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

  return (
    (<Sonner
      theme={theme}
      className="toaster group"
      position={prefs.position}
      duration={prefs.durationMs}
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
      }}
      {...props} />)
  );
}

export { Toaster }
