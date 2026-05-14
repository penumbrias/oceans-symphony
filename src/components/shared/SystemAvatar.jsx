import React, { useState } from "react";
import { Globe } from "lucide-react";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { useSystemIdentity } from "@/lib/useSystemIdentity";

/**
 * Small circular avatar that renders the user's system-wide picture
 * (set in Settings → System Name section). Falls back to a Globe icon
 * when no avatar is uploaded yet — matches the "System-wide" tile in
 * the Polls voter picker so the system reads as the same entity
 * everywhere.
 *
 * Props:
 *   size: "sm" | "md" — pixel size of the circle (default md = w-7 h-7)
 */
export default function SystemAvatar({ size = "md", className = "" }) {
  const { name, avatarUrl } = useSystemIdentity();
  const resolvedUrl = useResolvedAvatarUrl(avatarUrl);
  const [imgError, setImgError] = useState(false);
  const sz = size === "sm" ? "w-5 h-5" : size === "lg" ? "w-10 h-10" : "w-7 h-7";
  const iconSz = size === "sm" ? "w-3 h-3" : size === "lg" ? "w-5 h-5" : "w-4 h-4";
  return (
    <div
      className={`${sz} rounded-full flex-shrink-0 flex items-center justify-center overflow-hidden border border-border/30 bg-muted ${className}`}
      title={name}
    >
      {resolvedUrl && !imgError ? (
        <img
          src={resolvedUrl}
          alt={name}
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        <Globe className={`${iconSz} text-muted-foreground`} />
      )}
    </div>
  );
}
