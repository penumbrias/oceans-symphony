import React from "react";

export default function RatingRow({ emoji, label, max = 5, value, onChange }) {
  const options = Array.from({ length: max + 1 }, (_, i) => i);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium flex items-center gap-1.5">
          <span>{emoji}</span> {label}
        </span>
        <span className="text-xs text-muted-foreground">0-{max}</span>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {options.map((n) => (
          <button
            key={n}
            onClick={() => onChange(n)}
            className={`w-8 h-8 rounded-full text-sm font-medium border transition-all ${
              value === n
                ? "bg-primary border-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:border-primary/50"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}