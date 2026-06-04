import React, { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { User } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import SystemAvatar from "@/components/shared/SystemAvatar";
import { useSystemIdentity } from "@/lib/useSystemIdentity";
import { getAlterIdsByGroupFlag } from "@/lib/subsystemUtils";

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

// authorIds: IDs of alters to show as authors (the saved authors on the
// record). If empty, the post renders as "System" rather than falling
// back to the current front — authors are fixed to whoever wrote the
// post, never the live front state.
export default function AuthorsRow({ authorIds = [], alters = [], timestamp, showNames = true }) {
  const systemIdentity = useSystemIdentity();
  const { data: groups = [] } = useQuery({ queryKey: ["groups"], queryFn: () => base44.entities.Group.list() });
  // Group config: members of a group flagged "hide_from_authorship" are
  // dropped from the byline (if that leaves none, it renders as the system).
  const hidden = useMemo(() => getAlterIdsByGroupFlag(groups, alters, "hide_from_authorship"), [groups, alters]);
  const ids = authorIds.filter((id) => !hidden.has(id));
  if (ids.length === 0) {
    return (
      <div className="flex items-center gap-2">
        <SystemAvatar />
        <div>
          <p className="text-sm font-medium text-foreground leading-tight">{systemIdentity.name}</p>
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
              <span className="text-[0.5625rem] font-bold text-muted-foreground">+{altersToShow.length - 5}</span>
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