// The one-tap sort switch that sits on alter lists. Tap cycles; the label
// says what you're looking at, so "how is this sorted?" never needs a
// menu. Pairs with useAlterSorter.

import React from "react";
import { ArrowDownAZ, ArrowUpAZ, TrendingUp, TrendingDown, Clock, ListOrdered } from "lucide-react";
import { useTerms } from "@/lib/useTerms";
import { applyTerms } from "@/lib/dailyTaskSystem";

const ICONS = {
  manual: ListOrdered,
  "alpha-asc": ArrowDownAZ,
  "alpha-desc": ArrowUpAZ,
  most: TrendingUp,
  least: TrendingDown,
  recent: Clock,
};

export default function AlterSortToggle({ sorter, className = "", showLabel = false }) {
  const terms = useTerms();
  const Icon = ICONS[sorter.mode] || ArrowDownAZ;
  const label = applyTerms(sorter.current.label, terms);
  return (
    <button
      type="button"
      onClick={sorter.cycle}
      title={`Sorted by ${label} — tap to change`}
      aria-label={`Sorted by ${label}. Tap to change the order.`}
      className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-border/50 text-muted-foreground hover:text-foreground transition-colors ${className}`}
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      {showLabel && <span className="text-xs truncate">{label}</span>}
    </button>
  );
}
