import React from "react";
import { ChevronRight } from "lucide-react";

export default function SectionRow({ emoji, title, subtitle, value, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3.5 bg-card border border-border/50 rounded-xl hover:bg-muted/40 transition-colors text-left"
    >
      <span className="text-xl">{emoji}</span>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">{title}</p>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
        <span>{value}</span>
        <ChevronRight className="w-3.5 h-3.5" />
      </div>
    </button>
  );
}