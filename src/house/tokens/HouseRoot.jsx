// The new house's root (step 1.1): every new-house surface sits inside one.
// It carries [data-house] (so the token files apply only here), the look,
// and the person's paint as CSS custom properties. Nothing outside it
// changes.

import React, { createContext, useContext } from "react";
import { useHouseTokens } from "@/house/tokens/useHouseTokens";
import "@/house/tokens/tokens.css";
import "@/house/tokens/look-smooth.css";
import "@/house/tokens/look-pixel.css";

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
