import React, { useState } from "react";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { cn } from "@/lib/utils";

const SIZE_CLASSES = {
  xs:  "w-5 h-5 text-[8px]",
  sm:  "w-6 h-6 text-[9px]",
  md:  "w-8 h-8 text-xs",
  lg:  "w-10 h-10 text-sm",
  xl:  "w-14 h-14 text-base",
  "2xl": "w-20 h-20 text-lg",
};

/**
 * AlterAvatar
 *
 * Renders an alter's avatar image. Falls back to a colour circle with
 * the alter's initial when the image is missing or fails to load.
 *
 * Props:
 *   alter       – object with { avatar_url?, color?, name? }
 *   size        – one of: xs | sm | md | lg | xl | 2xl   (default "md")
 *                 OR a Tailwind string like "w-12 h-12"
 *   className   – extra classes merged onto the root element
 *   rounded     – "full" (default) | "lg" | "md" | "none"
 */
export default function AlterAvatar({ alter, size = "md", className, rounded = "full" }) {
  const [imgError, setImgError] = useState(false);
  const resolvedUrl = useResolvedAvatarUrl(alter?.avatar_url);

  const sizeClass = SIZE_CLASSES[size] ?? size;
  const roundedClass = {
    full: "rounded-full",
    lg:   "rounded-xl",
    md:   "rounded-lg",
    none: "",
  }[rounded] ?? "rounded-full";

  const base = cn(sizeClass, roundedClass, "flex-shrink-0 object-cover", className);

  if (resolvedUrl && !imgError) {
    return (
      <img
        src={resolvedUrl}
        alt={alter?.name ?? ""}
        className={base}
        onError={() => setImgError(true)}
        loading="lazy"
      />
    );
  }

  // Colour placeholder with initial
  const initial = alter?.name?.[0]?.toUpperCase() ?? "?";
  const bg = alter?.color || "#334155";

  return (
    <div
      className={cn(sizeClass, roundedClass, "flex-shrink-0 flex items-center justify-center select-none", className)}
      style={{ background: bg }}
      aria-label={alter?.name ?? "System member"}
    >
      <span className="font-bold text-white leading-none" style={{ fontSize: "38%" }}>
        {initial}
      </span>
    </div>
  );
}
