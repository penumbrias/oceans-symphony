import React from "react";
import { Folder } from "lucide-react";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { isValidHexColor } from "@/lib/colorUtils";

// Renders a group / subsystem's icon: its own avatar image when one is set
// (resolving local-image:// / SW paths), otherwise a colour-tinted folder.
// Use this EVERYWHERE a group folder icon would otherwise render so custom
// group images show consistently.
//
//  - inline:  <GroupIcon group={g} className="w-4 h-4" />
//  - boxed:   <GroupIcon group={g} boxed className="w-9 h-9" boxClassName="rounded-xl" />
//             (square container; avatar fills it, else tinted bg + folder)
export default function GroupIcon({ group, className = "w-4 h-4", boxed = false, boxClassName = "", iconClassName = "w-4 h-4" }) {
  const resolved = useResolvedAvatarUrl(group?.avatar_url);
  const color = isValidHexColor(group?.color) ? group.color : undefined;

  if (boxed) {
    return (
      <span
        className={`${className} ${boxClassName} flex items-center justify-center overflow-hidden flex-shrink-0`}
        style={{ backgroundColor: resolved ? "transparent" : (color ? `${color}20` : "hsl(var(--muted))") }}
      >
        {resolved
          ? <img src={resolved} alt="" className="w-full h-full object-cover" />
          : <Folder className={iconClassName} style={{ color: color || "hsl(var(--muted-foreground))" }} />}
      </span>
    );
  }

  if (resolved) {
    return <img src={resolved} alt="" className={`${className} object-cover rounded-md flex-shrink-0`} />;
  }
  return <Folder className={`${className} flex-shrink-0`} style={{ color: color || "hsl(var(--muted-foreground))" }} />;
}
