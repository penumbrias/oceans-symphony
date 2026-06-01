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
      {/* Top readability wash — a translucent layer of the page background
          so page titles/headers sitting over the banner stay legible.
          Strongest at the very top, fading out so the image still shows
          through below. Element-opacity (not an rgba gradient) keeps it a
          plain --color-bg wash that works in any theme without color-mix. */}
      <div
        className="absolute inset-x-0 top-0"
        style={{
          height: "62%",
          background: "linear-gradient(to bottom, var(--color-bg), rgba(0,0,0,0))",
          opacity: 0.6,
        }}
      />
      {/* Fade the bottom edge into the page background so content blends in
          instead of meeting a hard image edge. */}
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
