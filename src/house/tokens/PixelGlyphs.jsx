// The mockups' own pixel icons (boards 01-Main and 08-Phone), drawn on a
// 10 × 10 grid with crisp edges. Each one is a component with the same
// shape as a Lucide icon (className + style), so HouseIcon draws it and the
// person's own icon pack still overrides it by page or key.
//
// Use them in the house's chrome (the tool rail, the phone bar, panel
// heads). Everything else keeps the Lucide set.

import React from "react";

function glyph(d, name) {
  const G = ({ className, style }) => (
    <svg viewBox="0 0 10 10" shapeRendering="crispEdges" aria-hidden="true" focusable="false"
      className={className} style={{ ...(style || {}), strokeWidth: undefined }}>
      <path fill="currentColor" d={d} />
    </svg>
  );
  G.displayName = `Pixel${name}`;
  return G;
}

export const PixelHeart = glyph("M1 2h3v1h1V2h3v1h1v3H8v1H7v1H6v1H4V8H3V7H2V6H1z", "Heart");
export const PixelSwitch = glyph("M1 3h6V1h1v1h1v2H8v1H7V4H1zM9 7H3v2H2V8H1V6h1V5h1v1h6z", "Switch");
export const PixelCalendar = glyph("M1 2h8v7H1zm1 2v4h6V4zM3 1h1v2H3zm3 0h1v2H6z", "Calendar");
export const PixelPerson = glyph("M4 1h2v2H4zM3 4h4v1H6v4H5V7H4v2H3z", "Person");
export const PixelPen = glyph("M7 1h1v1h1v1H8v1H7v1H6v1H5v1H4v1H2V7h1V6h1V5h1V4h1V3h1z", "Pen");
export const PixelBubble = glyph("M1 1h8v6H5L3 9V7H1zm1 1v4h6V2z", "Bubble");
export const PixelPlus = glyph("M4 1h2v3h3v2H6v3H4V6H1V4h3z", "Plus");
export const PixelGrid = glyph("M1 1h3v3H1zm5 0h3v3H6zM1 6h3v3H1zm5 0h3v3H6z", "Grid");
export const PixelGear = glyph("M4 0h2v2h1v1h2v2H7v1H6v1H4V6H3V5H1V3h2V2h1zm0 3v2h2V3zM4 8h2v2H4z", "Gear");
export const PixelHome = glyph("M5 1h1v1h1v1h1v1h1v1H8v4H6V7H4v2H2V5H1V4h1V3h1V2h1V1z", "Home");
export const PixelAlters = glyph("M3 1h2v3H3zM2 5h4v4H2zM7 2h2v2H7zM6 5h3v3H6z", "Alters");
export const PixelTimeline = glyph("M1 1h1v8H1zm2 1h5v2H3zm0 3h3v2H3z", "Timeline");
export const PixelSupport = glyph("M3 1h4v1h1v1h1v4H8v1H7v1H3V8H2V7H1V3h1V2h1zm1 2v1H3v2h1v1h2V6h1V4H6V3z", "Support");
export const PixelSearch = glyph("M2 1h3v1h1v1h1v3H6v1H5v1H2V7H1V6H0V3h1V2h1zm0 2v3h3V3zM7 7h1v1h1v1H8V8H7z", "Search");
export const PixelBack = glyph("M6 1h2v1H7v1H6v1H5v2h1v1h1v1h1v1H6V8H5V7H4V6H3V4h1V3h1V2h1z", "Back");
export const PixelDots = glyph("M1 4h2v2H1zm3 0h2v2H4zm3 0h2v2H7z", "Dots");
export const PixelEye = glyph("M3 2h4v1h1v1h1v2H8v1H7v1H3V7H2V6H1V4h1V3h1zm1 2v2h2V4z", "Eye");
export const PixelEyeOff = glyph("M1 4h8v2H1z", "EyeOff");
