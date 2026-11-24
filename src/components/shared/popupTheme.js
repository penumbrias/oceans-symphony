// A look for the shared pickers' own pop-ups (new house step 1.3).
//
// AlterSearchSelect, SearchableSelect, ColorPicker, IconPicker and
// AssetPickerModal portal their pop-ups to <body>, outside whatever page
// opened them. The new house wraps them in <PopupTheme value={…}>; each
// pop-up then reads usePopupTheme(name) and spreads the result on its own
// root, which carries the house's attributes and colour variables so the
// house's CSS (src/house/kit/sharedPops.css) can dress it.
//
// ADDITIVE ONLY: with no PopupTheme above it (every old-house screen) the
// hook returns empty attrs and an empty style, so the old house's DOM and
// look are exactly what they were. Context crosses portals, so the theme
// follows the pop-up to <body>.
import React, { createContext, useContext } from "react";

const PopupThemeContext = createContext(null);
const EMPTY = Object.freeze({ attrs: null, style: null });

// `value`: { attrs: { "data-house": "", … }, style: { "--house-…": … } }.
export function PopupTheme({ value, children }) {
  return React.createElement(PopupThemeContext.Provider, { value: value || null }, children);
}

// For a pop-up root: `{...pt.attrs}` and `style={{ ...pt.style, ...own }}`.
export function usePopupTheme(name) {
  const theme = useContext(PopupThemeContext);
  if (!theme) return EMPTY;
  return { attrs: { ...(theme.attrs || {}), "data-shared-pop": name }, style: theme.style || null };
}
