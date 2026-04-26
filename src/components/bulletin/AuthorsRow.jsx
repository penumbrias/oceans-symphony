import React, { useState } from "react";
import { Link } from "react-router-dom";
import { User } from "lucide-react";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";

function getContrastColor(hex) {
  if (!hex) return "#ffffff";
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.5 ? "#1a1a2e" : "#ffffff";
}

function AlterAvatar({ alter, size = "md" }) {
  const sz = size === "sm" ? "w-5 h-5" : "w-7 h-7";
  const iconSz = size === "sm" ? "w-3 h-3" : "w-4 h-4";
  const resolvedUrl = useResolvedAvatarUrl(alter?.avatar_url);
  const [imgError, setImgError] = useState(false);
  return (
    <div
      className={`${sz} rounded-full flex-shrink-0 flex items-center justify-center overflow-hidden border border-border/30`}
      style={{ backgroundColor: alter?.color || "hsl(var(--muted))" }}
      title={alter?.name}
    >
      {resolvedUrl && !imgError ? (
        <img src={resolvedUrl} alt={alter?.name} className="w-full h-full object-cover" onError={() => setImgError(true)} />
      ) : (
        <User className={iconSz} style={{ color: getContrastColor(alter?.color) }} />
      )}
    </div>
  );
}

// authorIds: IDs of alters to show as authors
// fallbackIds: used when authorIds is empty (e.g. frontingAlterIds)
export default function AuthorsRow({ authorIds = [], fallbackIds = [], alters = [], timestamp, showNames = true }) {
  const ids = authorIds.length > 0 ? authorIds : fallbackIds;
  if (ids.length === 0) {
    return (
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center">
          <User className="w-4 h-4 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground leading-tight">System</p>
          {timestamp && <p className="text-xs text-muted-foreground">{timestamp}</p>}
        </div>
      </div>
    );
  }

  const collapseToAvatars = ids.length > 2;
  const altersToShow = ids.map(id => alters.find(a => a.id === id)).filter(Boolean);

  if (collapseToAvatars || !showNames) {
    return (
      <div className="flex items-center gap-1.5">
        <div className="flex -space-x-1.5">
          {altersToShow.slice(0, 5).map((alter) => (
            <Link key={alter.id} to={`/alter/${alter.id}`}>
              <AlterAvatar alter={alter} size="sm" />
            </Link>
          ))}
          {altersToShow.length > 5 && (
            <div className="w-5 h-5 rounded-full bg-muted border border-border flex items-center justify-center">
              <span className="text-[9px] font-bold text-muted-foreground">+{altersToShow.length - 5}</span>
            </div>
          )}
        </div>
        <div>
          <p className="text-sm font-medium text-foreground leading-tight">
            {altersToShow.map(a => a.alias || a.name).join(", ")}
          </p>
          {timestamp && <p className="text-xs text-muted-foreground">{timestamp}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {altersToShow.map((alter) => (
        <Link key={alter.id} to={`/alter/${alter.id}`} className="flex items-center gap-1.5">
          <AlterAvatar alter={alter} />
          <div>
            <p className="text-sm font-medium text-foreground leading-tight">{alter.alias || alter.name}</p>
            {timestamp && altersToShow.indexOf(alter) === 0 && (
              <p className="text-xs text-muted-foreground">{timestamp}</p>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}