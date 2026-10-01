// How a fronting alter is drawn: the per-level look (pinned_alters_config
// .levelStyles — shape / size / ring / colour) and the custom icon for the
// front button (SystemSettings.front_button_icon: { iconName } | { iconUrl }).
//
// Colour: a level's own colour, when set, overrides the alter's colour for
// the "is fronting" indication (ring, glow, front button). Otherwise the
// alter's colour. There is no special primary colour any more — the old
// gold "primary" treatment predates front levels.

import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useFrontLevels, getSessionLevel } from "@/lib/frontLevels";
import { pickPrimarySystemSettings } from "@/lib/systemSettingsSingleton";
import { isValidHexColor } from "@/lib/colorUtils";

export const DEFAULT_ALTER_COLOR = "#8b5cf6";

export function levelStylesFrom(settingsRow) {
  const ls = settingsRow?.pinned_alters_config?.levelStyles;
  return ls && typeof ls === "object" ? ls : {};
}

export function useFrontLook() {
  const levelCfg = useFrontLevels();
  const { data: rows = [] } = useQuery({ queryKey: ["systemSettings"], queryFn: () => base44.entities.SystemSettings.list() });
  const settings = pickPrimarySystemSettings(rows) || rows[0] || null;
  const levelStyles = levelStylesFrom(settings);
  const icon = settings?.front_button_icon;
  const frontButtonIcon = icon && (icon.iconName || icon.iconUrl) ? icon : null;

  // The level style for a session — legacy rows without front_level map
  // onto the spectrum the same way everywhere else does.
  const styleFor = (session) => {
    if (!session) return null;
    const level = getSessionLevel(session, levelCfg);
    return (level && levelStyles[level.id]) || null;
  };
  const activeColor = (alter, session) => {
    const c = styleFor(session)?.color;
    if (c && isValidHexColor(c)) return c;
    return isValidHexColor(alter?.color) ? alter.color : DEFAULT_ALTER_COLOR;
  };
  return { levelCfg, levelStyles, styleFor, activeColor, frontButtonIcon, settings };
}
