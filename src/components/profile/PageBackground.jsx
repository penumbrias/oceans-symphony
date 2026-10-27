// Full-screen background for a profile page (group, location; the alter
// page draws its own because its image can rotate). The background image +
// colour + opacity are page-wide and sit behind ALL the content. Rendered as
// the first, absolutely positioned child of a `relative` page wrapper; the
// content alongside it must be `relative z-10` so it paints on top. With an
// image, the colour is painted as a SOLID base layer UNDER it so lowering
// the image opacity reveals the colour (and the profile's bg colour wins
// over the app page bg here). The surfaces are tinted via profileSurfaceCss.
import React, { useState, useEffect } from "react";
import { resolveImageUrl } from "@/lib/imageUrlResolver";

export default function PageBackground({ bgColor, bgImage, bgOpacity }) {
  const [resolvedBg, setResolvedBg] = useState(null);
  useEffect(() => {
    if (bgImage) resolveImageUrl(bgImage).then(setResolvedBg).catch(() => setResolvedBg(null));
    else setResolvedBg(null);
  }, [bgImage]);
  if (!bgColor && !bgImage) return null;
  const hasImage = !!(bgImage && resolvedBg);
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0" aria-hidden>
      {hasImage ? (
        <>
          {bgColor && <div className="absolute inset-0" style={{ backgroundColor: bgColor }} />}
          <div className="absolute inset-0" style={{ backgroundImage: `url("${resolvedBg}")`, backgroundSize: "cover", backgroundPosition: "center", opacity: bgOpacity }} />
        </>
      ) : (
        bgColor && <div className="absolute inset-0" style={{ backgroundColor: bgColor, opacity: bgOpacity }} />
      )}
    </div>
  );
}
