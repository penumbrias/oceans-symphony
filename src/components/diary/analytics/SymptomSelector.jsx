import React from "react";
import { Button } from "@/components/ui/button";

export default function SymptomSelector({ dateRange, onDateRangeChange, options = [7, 14, 30, 60, 90, 180, 365] }) {
  return (
    <div className="flex flex-wrap gap-2">
      <span className="text-sm font-medium text-foreground self-center">Show last:</span>
      {options.map((days) => (
        <Button
          key={days}
          variant={dateRange === days ? "default" : "outline"}
          size="sm"
          onClick={() => onDateRangeChange(days)}
          className="text-xs"
        >
          {days === 7 ? "Week" : days === 30 ? "Month" : days === 90 ? "3mo" : days === 180 ? "6mo" : days === 365 ? "Year" : `${days}d`}
        </Button>
      ))}
    </div>
  );
}