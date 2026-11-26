// The new house's root (step 1.1): every new-house surface sits inside one.
// It carries [data-house] (so the token files apply only here), the look,
// and the person's paint as CSS custom properties. Nothing outside it
// changes.

import React, { createContext, useContext } from "react";
import { useHouseTokens } from "@/house/tokens/useHouseTokens";
import "@/house/tokens/tokens.css";
import "@/house/tokens/look-smooth.css";
import "@/house/tokens/look-pixel.css";
// The mockups' pixel recipe for the kit (panels, title bars, buttons, fields).
import "@/house/kit/pixel.css";

const HouseTokensContext = createContext(null);

// The tokens of the nearest HouseRoot (null outside the new house).
export function useHouse() {
  return useContext(HouseTokensContext);
}

export default function HouseRoot({ children, className, style, as: Tag = "div", ...rest }) {
  const tokens = useHouseTokens();
  return (
    <HouseTokensContext.Provider value={tokens}>
      <Tag
        data-house=""
        data-house-look={tokens.look}
        data-house-variant={tokens.variant}
        data-house-label={tokens.fonts.labelIsPixel ? "pixel" : "body"}
        className={className}
        style={{ ...tokens.vars, colorScheme: tokens.variant, ...(style || {}) }}
        {...rest}
      >
        {children}
      </Tag>
    </HouseTokensContext.Provider>
  );
}

// Several separate house roots sharing ONE reading of the paint (step 2.1).
// The frame's bars, rail and docks are house; the old page between them is
// not (the house's root rules would change its fonts and colours). The frame
// reads the tokens once (`useHouseTokens()`) and wraps each piece of chrome
// in a HouseScope, so every piece is a real [data-house] root without the
// page in the middle being one.
export function HouseScope({ tokens, children, className, style, as: Tag = "div", ...rest }) {
  return (
    <HouseTokensContext.Provider value={tokens}>
      <Tag
        data-house=""
        data-house-look={tokens.look}
        data-house-variant={tokens.variant}
        data-house-label={tokens.fonts.labelIsPixel ? "pixel" : "body"}
        className={className}
        style={{ ...tokens.vars, colorScheme: tokens.variant, ...(style || {}) }}
        {...rest}
      >
        {children}
      </Tag>
    </HouseTokensContext.Provider>
  );
}
