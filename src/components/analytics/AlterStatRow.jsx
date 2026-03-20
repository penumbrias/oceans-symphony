import React from "react";
import { User } from "lucide-react";

function getContrastColor(hex) {
  if (!hex) return "#ffffff";
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "#1a1a2e" : "#ffffff";
}

function formatDur(ms) {
  if (ms <= 0) return "0 Minutes";
  const totalMins = Math.floor(ms / 60000);
  const days = Math.floor(totalMins / 1440);
  const hours = Math.floor((totalMins % 1440) / 60);
  const mins = totalMins % 60;
  const parts = [];
  if (days > 0) parts.push(`${days} Day${days !== 1 ? "s" : ""}`);
  if (hours > 0) parts.push(`${hours} Hour${hours !== 1 ? "s" : ""}`);
  if (mins > 0 && days === 0) parts.push(`${mins} Minute${mins !== 1 ? "s" : ""}`);
  return parts.join(" ") || "< 1 Minute";
}

export default function AlterStatRow({ alter, stat, mode, maxStat }) {
  const bg = alter?.color || null;
  const text = bg ? getContrastColor(bg) : null;
  const barWidth = maxStat > 0 ? (stat / maxStat) * 100 : 0;

  let label = "";
  if (mode === "total") label = `Fronted for ${formatDur(stat)}`;
  else if (mode === "average") label = `Fronted on average for ${formatDur(stat)}`;
  else if (mode === "max") label = `Fronted at most ${formatDur(stat)}`;
  else if (mode === "min") label = `Fronted for at least ${formatDur(stat)}`;
  else if (mode === "count") label = `Fronted ${stat} time${stat !== 1 ? "s" : ""}`;

  return (
    <div className="relative flex items-center gap-3 px-4 py-3 bg-card rounded-xl border border-border/40 overflow-hidden">
      {/* Progress bar background */}
      <div
        className="absolute left-0 top-0 h-full opacity-10 transition-all"
        style={{
          width: `${barWidth}%`,
          backgroundColor: bg || "hsl(var(--primary))",
        }}
      />
      {/* Color accent stripe on right */}
      {bg && (
        <div className="absolute right-0 top-0 w-1 h-full rounded-r-xl" style={{ backgroundColor: bg }} />
      )}

      {/* Avatar */}
      <div
        className="w-11 h-11 rounded-xl flex-shrink-0 flex items-center justify-center overflow-hidden border border-border/30 relative z-10"
        style={{ backgroundColor: bg || "hsl(var(--muted))" }}
      >
        {alter?.avatar_url ? (
          <img src={alter.avatar_url} alt={alter?.name} className="w-full h-full object-cover" />
        ) : (
          <User className="w-5 h-5" style={{ color: text || "hsl(var(--muted-foreground))" }} />
        )}
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0 relative z-10">
        <p className="text-sm font-semibold text-foreground truncate">
          {alter?.name || "Unknown"}
          {alter?.pronouns ? ` ‹ ${alter.pronouns} ›` : ""}
        </p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}