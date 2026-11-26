// The one icon resolver of the new house (building code §8, step 1.1).
// Every icon is a Lucide glyph drawn through here, so the person's own
// icons ("My icon pack", ui_v2.icons) override it by page or key, and the
// size comes from the scale: inline 1 em, control 1.25 rem, bar 1.5 rem.
//
//   <HouseIcon icon={CalendarDays} page="planner" size="bar" />
//   <HouseIcon icon={Trash2} label="Delete Walk" />   (a meaningful icon)
//
// Decorative by default (aria-hidden). Pass `label` only when the icon IS
// the content; an icon-only button names itself on the button instead.

import React from "react";
import { IconSlot } from "@/components/shared/LucideByName";
import { useHouse } from "@/house/tokens/HouseRoot";

const SIZE_VAR = { inline: "var(--house-icon-inline)", control: "var(--house-icon-control)", bar: "var(--house-icon-bar)", frame: "var(--house-frame-icon)" };

export default function HouseIcon({ icon, page, iconKey, size = "control", label, className, style }) {
  const house = useHouse();
  const icons = house?.paint?.overrides?.icons || null;
  const override = (page && icons?.pages?.[page]) || (iconKey && icons?.keys?.[iconKey]) || null;
  const dim = SIZE_VAR[size] || SIZE_VAR.control;
  return (
    <span
      className={className}
      role={label ? "img" : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
      style={{ display: "inline-flex", width: dim, height: dim, flexShrink: 0, ...(style || {}) }}
    >
      <IconSlot override={override} Default={icon} style={{ width: "100%", height: "100%", strokeWidth: "var(--house-icon-stroke)" }} />
    </span>
  );
}
