import React from "react";
import { useTheme } from "@/lib/ThemeContext";

// Small "tap to cycle light / dark / system" chip for the Theme SubSection
// header. Rendered inside the SubSection's header <button>, so it must NOT be a
// nested <button> (invalid HTML) — it's a role="button" span that stops the
// click from also toggling the section open/closed.
export default function ThemeModeChip() {
  const { themeMode, cycleThemeMode } = useTheme();
  const icon = { light: "☀️", dark: "🌙", system: "💻" }[themeMode] || "🌙";
  const label = themeMode === "system" ? "System" : themeMode;
  return (
    <span
      role="button"
      tabIndex={0}
      title="Tap to cycle light / dark / system"
      onClick={(e) => { e.stopPropagation(); cycleThemeMode(); }}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); e.preventDefault(); cycleThemeMode(); } }}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-border/60 bg-background hover:bg-muted/40 transition-colors text-[0.6875rem] font-medium capitalize text-foreground"
    >
      <span className="text-sm leading-none">{icon}</span>
      <span>{label}</span>
    </span>
  );
}
