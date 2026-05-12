"use client";
import { useTheme } from "@/lib/ThemeContext"
import { Toaster as Sonner } from "sonner"

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

  return (
    (<Sonner
      theme={theme}
      className="toaster group"
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
