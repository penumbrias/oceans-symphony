// The house's check-in sheets (boards 16, 17 and 47). The frames wrap
// everything in this: Quick check-in, "Who feels …?" and Set front read it
// through useHouseSheet() (src/lib/houseSwitch.js) and draw the boards'
// layout with the house's paint on their portaled roots. It also hands them
// the house's own phone header (board 47's "‹ Set front"). It never writes:
// the sheets save through checkinEntry.js, symptomSessions.js, setFront.js
// and presenceEntry.js, exactly as they do in the old house.
//
// The sheets' CSS is imported here, so both frames (the phone does not load
// frameKit.css) carry it, and only while the new house is on.

import React, { useMemo } from "react";
import { PixelBack } from "@/house/tokens/PixelGlyphs";
import { HouseSheetContext } from "@/lib/houseSwitch";
import { houseAttrs } from "@/house/kit/KitLayer";
import { IconButton } from "@/house/kit/Button";
import HeaderWave from "@/house/kit/frame/HeaderWave";
import { sheetPlacement, whoFooter, whoRowNote, HOUSE_TICK } from "@/house/checkin/checkinModel";
import "@/house/kit/kit.css";
import "@/house/checkin/checkin.css";

// Board 47's header: the phone frame's own header, drawn at the top of the
// full-screen sheet (Back closes the sheet; it never leaves the page).
function SheetHead({ title, onBack, backLabel = "Back", tokens }) {
  const h = houseAttrs(tokens);
  return (
    <header {...h.attrs} style={h.style} data-house-size="phone" className="hp-head hcs-head">
      {tokens?.paint?.tokens?.waveOff ? null : <HeaderWave />}
      <IconButton icon={PixelBack} rank="secondary" label={backLabel} onClick={onBack} />
      <div className="hp-titles"><span className="hp-title house-label">{title}</span></div>
    </header>
  );
}

export default function HouseSheets({ tokens, size, children }) {
  const value = useMemo(() => {
    const h = houseAttrs(tokens);
    const phone = size === "phone";
    return {
      attrs: { ...h.attrs, "data-house-size": size, "data-house-sheet": "" },
      style: h.style,
      size,
      phone,
      tick: HOUSE_TICK,
      place: (kind, keyboard) => sheetPlacement(kind, { phone, keyboard }),
      whoFooter,
      whoRowNote,
      Head: (props) => <SheetHead tokens={tokens} {...props} />,
    };
  }, [tokens, size]);
  return <HouseSheetContext.Provider value={value}>{children}</HouseSheetContext.Provider>;
}
