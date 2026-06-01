import React from "react";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";

// Full-bleed system banner that sits at the top of the scrollable content
// area, BEHIND the page's own elements (edge to edge, no extra padding).
// It scrolls away with the content like a profile banner. Height and the
// image's vertical position are user-configurable (Settings → System
// Profile); which pages it shows on is decided by the caller (AppLayout).
export default function SystemBanner({ url, height = 140, position = 50 }) {
  const resolved = useResolvedAvatarUrl(url);
  if (!resolved) return null;
  return (
    <div
      aria-hidden
      className="absolute top-0 left-0 right-0 z-0 overflow-hidden pointer-events-none"
      style={{ height }}
    >
      <img
        src={resolved}
        alt=""
        draggable={false}
        className="w-full h-full object-cover"
        style={{ objectPosition: `50% ${position}%` }}
      />
      {/* Fade the bottom edge into the page background so content blends in
          instead of meeting a hard image edge. Uses the live --color-bg so
          it adapts to the active theme (light or dark). */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 52%, var(--color-bg) 100%)",
        }}
      />
    </div>
  );
}
