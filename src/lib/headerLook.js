// The profile header's look, read once for the alter cards (v0.320.0): the
// header picture, its colour, text colour and font are the alter's
// "display" everywhere — the lists and the alters page show the same
// header look as the profile, not a plain row.
//
// On by default; the list toolbar's picture button turns it off (the old
// "header as card background" switch, same localStorage key, so an
// existing choice to keep cards plain is kept).

import { useEffect, useState } from "react";
import { PS, readProfileBg } from "@/lib/profileStyle";
import { fontStackFor } from "@/lib/profileFonts";
import { resolveImageUrl } from "@/lib/imageUrlResolver";

export const HEADER_LOOK_LS_KEY = "alter_card_header_bg";

export function headerLookOnCards() {
  try { return localStorage.getItem(HEADER_LOOK_LS_KEY) !== "false"; } catch { return true; }
}
export function setHeaderLookOnCards(on) {
  try { localStorage.setItem(HEADER_LOOK_LS_KEY, on ? "true" : "false"); } catch { /* storage off */ }
}

export function readHeaderLook(alter) {
  const cf = alter?.custom_fields || {};
  const bg = readProfileBg(cf);
  const o = Number(bg.headerOpacity);
  return {
    image: bg.headerImage || "",
    imageOpacity: Number.isFinite(o) ? Math.min(1, Math.max(0, o)) : 0.45,
    bgColor: bg.headerBgColorWithAlpha || cf[PS.HEADER_BG] || "",
    textColor: cf[PS.HEADER_TEXT] || "",
    font: fontStackFor(cf[PS.HEADER_FONT]) || "",
  };
}

// Resolves the header picture (local-image:// can't feed <img>/CSS raw).
export function useHeaderLook(alter, enabled = true) {
  const look = readHeaderLook(alter);
  const [image, setImage] = useState("");
  useEffect(() => {
    if (!enabled || !look.image) { setImage(""); return; }
    let live = true;
    resolveImageUrl(look.image).then((r) => { if (live) setImage(r || ""); }).catch(() => { if (live) setImage(""); });
    return () => { live = false; };
  }, [look.image, enabled]);
  if (!enabled) return { active: false, image: "", bgColor: "", textColor: "", font: "", imageOpacity: 0 };
  return { ...look, image, active: !!(image || look.bgColor || look.textColor || look.font) };
}
