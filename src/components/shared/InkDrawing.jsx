import React from "react";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";

// An ink drawing from the drawing pad, shown in the line like a word (v0.332.0).
// The saved picture is black on nothing; here it is used as a mask over the
// text colour, so it takes whatever colour the words around it have (dark
// on a light theme, light on a dark one, coloured inside coloured text).
// `style` carries the em size the pad wrote.
export default function InkDrawing({ src, alt = "Drawing", style }) {
  const resolved = useResolvedAvatarUrl(src);
  const url = resolved || (/^(https?:|data:image\/|blob:)/i.test(src || "") ? src : null);
  const mask = url ? `url("${String(url).replace(/"/g, "%22")}")` : undefined;
  return (
    <span role="img" aria-label={alt}
      style={{
        display: "inline-block",
        verticalAlign: "middle",
        maxWidth: "100%",
        ...style,
        // Size from the saved style; never the picture's own box.
        height: "auto",
        backgroundColor: "currentColor",
        WebkitMaskImage: mask, maskImage: mask,
        WebkitMaskSize: "100% 100%", maskSize: "100% 100%",
        WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat",
        borderRadius: 0,
      }} />
  );
}
