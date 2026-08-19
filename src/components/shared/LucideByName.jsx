// Render any Lucide icon by its kebab name ("heart-handshake") — the
// whole icon set is loaded ONCE, lazily, the first time a custom icon is
// needed (one chunk; never in the main bundle). Used wherever the user can
// swap an icon: nav pages, quick-action keys, app shortcuts (v0.193.0).
import React, { useEffect, useState } from "react";

let _setPromise = null;
export function loadLucideSet() {
  if (!_setPromise) _setPromise = import("lucide-react").then((m) => m.icons || {});
  return _setPromise;
}
export function kebabToPascal(name) {
  return String(name || "").split("-").filter(Boolean).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("");
}
export function pascalToKebab(name) {
  return String(name || "").replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/([A-Z])([A-Z][a-z])/g, "$1-$2").toLowerCase();
}

// `name`: kebab or Pascal. Renders nothing until the set has loaded (a blink,
// once per app load), `fallback` meanwhile / for unknown names.
export default function LucideByName({ name, fallback = null, ...props }) {
  const [Icon, setIcon] = useState(null);
  useEffect(() => {
    let alive = true;
    if (!name) { setIcon(null); return undefined; }
    loadLucideSet().then((set) => {
      if (!alive) return;
      const key = name.includes("-") || /^[a-z]/.test(name) ? kebabToPascal(name) : name;
      setIcon(() => set[key] || null);
    });
    return () => { alive = false; };
  }, [name]);
  if (!Icon) return fallback;
  return <Icon {...props} />;
}

// An icon slot with a user override: { iconUrl } → image, { iconName } →
// Lucide by name, else the Default icon component.
export function IconSlot({ override, Default, className, style, alt = "" }) {
  const o = override || {};
  if (o.iconUrl) return <OverrideImage url={o.iconUrl} className={className} style={style} alt={alt} />;
  if (o.iconName) return <LucideByName name={o.iconName} className={className} style={style} fallback={Default ? <Default className={className} style={style} /> : null} />;
  return Default ? <Default className={className} style={style} /> : null;
}
function OverrideImage({ url, className, style, alt }) {
  // Lazy import keeps this file free of the resolver for non-image slots.
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let alive = true;
    import("@/lib/imageUrlResolver").then(({ resolveImageUrl }) => resolveImageUrl(url)).then((u) => { if (alive) setSrc(u); }).catch(() => {});
    return () => { alive = false; };
  }, [url]);
  if (!src) return null;
  return <img src={src} alt={alt} className={className} style={{ ...(style || {}), objectFit: "cover", borderRadius: "25%" }} />;
}
