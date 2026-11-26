// The writes behind Settings → Display options → Look in the new house
// (src/house/settings/DisplayLook.jsx). Each one goes through the one
// SystemSettings writer (settingsWriter.js: fresh read, one queue, ui_pixel
// merged key by key), so the room itself writes nothing. The pixel-look keys
// on their own go through usePixelLook().write (uiLook.js), as everywhere.

import { writeSettings } from "@/lib/settingsWriter";
import { nextHouseSwatches } from "@/house/settings/lookModel";

const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);

// Pixel or Smooth (SystemSettings.ui_look, read by both houses).
export function writeUiLook(look, opts = {}) {
  return writeSettings({ ui_look: look === "smooth" ? "smooth" : "pixel" }, opts);
}

// One house colour no theme colour fills (ui_pixel.swatches[key]); an empty
// value goes back to the house's own. Built on the fresh row, so the other
// swatches and every other ui_pixel key are kept.
export function writeHouseSwatch(key, hex, opts = {}) {
  return writeSettings((fresh) => {
    const cur = isObj(fresh?.ui_pixel) ? fresh.ui_pixel : {};
    const swatches = nextHouseSwatches(cur.swatches, key, hex);
    const next = { ...cur, swatches };
    if (!Object.keys(swatches).length) delete next.swatches;
    return { ui_pixel: next };
  }, opts);
}

// The header wave's own colour (wave_color_custom, the old wave picker's
// field); empty goes back to the palette colour.
export function writeWaveColour(hex, opts = {}) {
  return writeSettings({ wave_color_custom: hex || null }, opts);
}

// Reset the look: clear the given ui_pixel keys (lookResetPatch's `clear`)
// and the wave colour. `restoreLook` puts back what a reset took (its
// `undo` and the wave colour it had).
export function writeLookReset(clear, opts = {}) {
  return writeSettings({ ui_pixel: clear, wave_color_custom: null }, opts);
}
export function restoreLook(undo, waveColour, opts = {}) {
  return writeSettings({ ui_pixel: undo, wave_color_custom: waveColour ?? null }, opts);
}
