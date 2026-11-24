// The signing swatch at the top of the tool rail (plan §3): who entries are
// signed by right now. Up to three colour squares for who's in front (the
// primary first), or the system's own mark when front isn't tracked or
// nobody is in front. Pressing it opens the existing front picker.
//
//   <SigningSwatch label="Signing as River and Ash. Set front"
//     colours={["#7a5cff", "#2fa37a"]} initials="R" onClick={open} />
//
// Colours are the alters' own (they always win, plan §5); each square gets
// an outline in the text colour, so a colour too close to the panel still
// shows its edge.

import React from "react";
import HouseIcon from "@/house/tokens/HouseIcon";
import "@/house/kit/frame/frameKit.css";

export default function SigningSwatch({ label, colours = [], initials = "", icon, more = 0, onClick }) {
  const shown = colours.slice(0, 3);
  return (
    <button type="button" className="hk-swatch" aria-label={label} title={label} onClick={onClick}>
      {shown.length ? (
        <span className="hk-swatch-stack" aria-hidden="true">
          {shown.map((c, i) => <span key={i} className="hk-swatch-chip" style={{ background: c }} />)}
        </span>
      ) : (
        <span className="hk-swatch-system" aria-hidden="true">
          {icon ? <HouseIcon icon={icon} /> : <span className="hk-swatch-initial">{initials || "·"}</span>}
        </span>
      )}
      {more > 0 ? <span className="hk-swatch-more" aria-hidden="true">+{more}</span> : null}
    </button>
  );
}

export { SigningSwatch };
