// The phone's bottom bar (new house step 2.2, building code §5 zone 4):
// five places in the person's words, icon and label, never wrapping.
//
//   <PhoneBar places={resolvePlaces(…)} pathname={pathname} onSheet={(p) => …} openSheet="do" />
//
// Labels are already short (phonePlaces.shortLabel, 12 characters at most).
// When even those don't fit one line (a narrow phone at large text, or a
// wide font such as OpenDyslexic), the whole bar shows icons only and each
// place keeps its full name as its accessible name and tooltip (§8 allows
// icon-only buttons in the four zones). It goes back to labels once they
// fit again. Every place is a whole target (44 px at least).

import React, { useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Zap } from "lucide-react";
import HouseIcon from "@/house/tokens/HouseIcon";
import { placeIsCurrent } from "@/house/phone/phonePlaces";
import "@/house/kit/frame/phoneKit.css";

export default function PhoneBar({ places = [], pathname = "/", onSheet, openSheet = null, label = "Places" }) {
  const ref = useRef(null);
  const [iconsOnly, setIconsOnly] = useState(false);
  const need = useRef(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const check = () => {
      const cells = [...el.querySelectorAll(".hk-pbar-place")];
      const w = cells.length ? Math.min(...cells.map((c) => c.clientWidth)) : 0;
      if (!iconsOnly) {
        const over = [...el.querySelectorAll(".hk-pbar-label")].some((s) => s.scrollWidth > s.clientWidth + 1);
        if (over) { need.current = w + 8; setIconsOnly(true); }
      } else if (need.current && w >= need.current) {
        setIconsOnly(false);
      }
    };
    check();
    let ro;
    try { ro = new ResizeObserver(check); ro.observe(el); } catch { /* old engine */ }
    return () => ro?.disconnect();
  }, [iconsOnly, places]);

  return (
    <nav ref={ref} className="hk-pbar" aria-label={label} data-icons-only={iconsOnly || undefined}>
      {places.map((p) => {
        const current = p.sheet ? openSheet === p.sheet : placeIsCurrent(p, pathname);
        const body = (
          <>
            <span className="hk-pbar-icon"><HouseIcon icon={p.icon || Zap} page={p.page} size="frame" /></span>
            <span className={`hk-pbar-label${iconsOnly ? " hk-sr" : ""}`}>{p.label}</span>
          </>
        );
        const common = {
          className: "hk-pbar-place",
          "data-place": p.id,
          "data-current": current || undefined,
          title: p.full || p.name,
          "aria-label": p.full && p.full !== p.label ? p.full : undefined,
        };
        if (p.sheet) {
          return (
            <button key={p.id} type="button" {...common} aria-expanded={current} aria-haspopup="dialog" onClick={() => onSheet?.(p)}>
              {body}
            </button>
          );
        }
        return <Link key={p.id} {...common} to={p.path} aria-current={current ? "page" : undefined}>{body}</Link>;
      })}
    </nav>
  );
}
