import React from "react";
import { ArrowUpRight, ArrowDownRight, ArrowRight, HelpCircle } from "lucide-react";

// Direction chip for "vs your usual" comparisons.
//
// DELIBERATELY VALUE-NEUTRAL: up is sky, down is amber, flat is muted —
// never green/red. More switching or more distress logging is not "worse",
// so no direction is allowed to look like an alarm or an achievement.
// The label text is supplied by the caller so wording stays descriptive.
const STYLES = {
  up:      { Icon: ArrowUpRight,   cls: "text-sky-600 dark:text-sky-400 bg-sky-500/10" },
  down:    { Icon: ArrowDownRight, cls: "text-amber-600 dark:text-amber-400 bg-amber-500/10" },
  flat:    { Icon: ArrowRight,     cls: "text-muted-foreground bg-muted/40" },
  unknown: { Icon: HelpCircle,     cls: "text-muted-foreground/70 bg-muted/30" },
};

export default function TrendArrow({ direction = "unknown", label = null, className = "" }) {
  const { Icon, cls } = STYLES[direction] || STYLES.unknown;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[0.625rem] font-medium ${cls} ${className}`}>
      <Icon className="w-3 h-3" aria-hidden="true" />
      {label && <span>{label}</span>}
    </span>
  );
}
