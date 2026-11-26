// The stepped pixel wave behind the frame's header (boards 01-Main and
// 08-Phone): the mockups' own path, drawn in the person's wave colour
// (--house-wave, from their wave setting or theme) at 45%, drifting
// slowly; still under reduced motion. Decorative only. A profile that is
// open may recolour it (board 12: the wave in the alter's own colour)
// through the shared page-wave override (src/lib/pageWaveOverride.js).

import React, { useSyncExternalStore } from "react";
import { getPageWaveOverride, subscribePageWaveOverride } from "@/lib/pageWaveOverride";
import "./headerWave.css";

function wavePath() {
  let d = "M0 0 H2560 ";
  for (let x = 2560; x > 0; x -= 8) {
    const y = 4 * Math.round((22 + 7 * Math.sin((2 * Math.PI * x) / 320)) / 4);
    d += `V${y} H${x - 8} `;
  }
  return `${d}Z`;
}
const PATH = wavePath();

export default function HeaderWave() {
  const override = useSyncExternalStore(subscribePageWaveOverride, getPageWaveOverride, () => null);
  return (
    <svg className="hk-wave" style={override ? { "--house-wave": override } : undefined} width="2560" height="40" viewBox="0 0 2560 40" shapeRendering="crispEdges" aria-hidden="true" focusable="false">
      <path d={PATH} />
    </svg>
  );
}
