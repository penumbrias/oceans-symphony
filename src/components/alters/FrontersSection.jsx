import React from "react";
import { User, RefreshCw } from "lucide-react";
import { motion } from "framer-motion";

function getContrastColor(hex) {
  if (!hex) return "#ffffff";
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "#1a1a2e" : "#ffffff";
}

function FronterAvatar({ alter }) {
  const color = alter?.color || "";
  const textColor = color ? getContrastColor(color) : null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center gap-2 min-w-[80px]"
    >
      <div
        className="w-16 h-16 rounded-2xl overflow-hidden border-2 border-border/60 shadow-md flex items-center justify-center"
        style={{ backgroundColor: color || "hsl(var(--muted))" }}
      >
        {alter?.avatar_url ? (
          <img
            src={alter.avatar_url}
            alt={alter.name}
            className="w-full h-full object-cover"
            onError={(e) => { e.target.style.display = "none"; }}
          />
        ) : (
          <User className="w-7 h-7" style={{ color: textColor || "hsl(var(--muted-foreground))" }} />
        )}
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold text-foreground leading-tight">{alter?.name || "Unknown"}</p>
        {alter?.pronouns && (
          <p className="text-xs text-muted-foreground">{alter.pronouns}</p>
        )}
      </div>
    </motion.div>
  );
}

export default function FrontersSection({ fronters, alters, isLoading }) {
  const fronterAlters = (fronters?.members || []).map((f) => {
    const spId = f.memberId || f.id || (f.content && f.content.member);
    return alters.find((a) => a.sp_id === spId) || {
      name: f.content?.name || "Unknown",
      color: f.content?.color || "",
      avatar_url: f.content?.avatarUrl || "",
      pronouns: f.content?.pronouns || "",
    };
  });

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-5 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
          Currently Fronting
        </h2>
        {isLoading && <RefreshCw className="w-3 h-3 text-muted-foreground animate-spin ml-1" />}
      </div>

      {fronterAlters.length > 0 ? (
        <div className="flex flex-wrap gap-5">
          {fronterAlters.map((alter, i) => (
            <FronterAvatar key={i} alter={alter} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground italic">No one is currently fronting</p>
      )}
    </div>
  );
}