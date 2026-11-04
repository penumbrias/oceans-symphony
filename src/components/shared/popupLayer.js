// Pop-up layering for the shared text tools (v0.347.2).
//
// The text box's pop-ups (MentionTextarea's @ / - / ~ list, MiniToolbar's
// colour / link / help / mention / draw modals, the font list and the
// above-keyboard dock) are portaled to <body> with fixed z-indexes in the
// 130–240 range. That's above every ordinary page and sheet — but a surface
// that sits far higher (the lists overlay is z-9999) would hide them. Such a
// surface wraps its content in <PopupLayer lift={…}> and every pop-up inside
// adds the lift to its own z-index. Context crosses portals, so the lift
// follows the pop-ups to <body>.
import React, { createContext, useContext } from "react";

const PopupLayerContext = createContext(0);

export function PopupLayer({ lift = 0, children }) {
  const outer = useContext(PopupLayerContext);
  return React.createElement(PopupLayerContext.Provider, { value: outer + lift }, children);
}

// z-index for a pop-up whose normal layer is `base`.
export function usePopupZ(base) {
  return base + useContext(PopupLayerContext);
}
