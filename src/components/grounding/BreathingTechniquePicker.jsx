import { BREATHING_PATTERNS } from "@/utils/groundingDefaults";
import { ChevronLeft } from "lucide-react";

export default function BreathingTechniquePicker({ onSelect, onBack }) {
  const techniques = Object.keys(BREATHING_PATTERNS);

  return (
    <div className="max-w-lg mx-auto p-4 space-y-4">
      <button
        onClick={onBack}
        className="text-xs text-muted-foreground hover:text-foreground mb-3 flex items-center gap-1 transition-colors"
      >
        <ChevronLeft className="w-3.5 h-3.5" /> Back
      </button>

      <div>
        <h2 className="text-lg font-semibold text-foreground mb-1">Choose a breathing technique</h2>
        <p className="text-sm text-muted-foreground">Pick one and we'll guide you through it</p>
      </div>

      <div className="space-y-2">
        {techniques.map((name) => {
          const pattern = BREATHING_PATTERNS[name];
          const isDefault = name === "Box breathing";
          return (
            <button
              key={name}
              onClick={() => onSelect(name)}
              className={`w-full text-left rounded-xl p-4 transition-all border ${
                isDefault
                  ? "bg-primary/10 border-primary/40 hover:border-primary/60 hover:bg-primary/15"
                  : "bg-card border-border/60 hover:border-primary/30 hover:bg-primary/5"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <p className="font-medium text-sm text-foreground">{name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{pattern.pattern}</p>
                </div>
                {isDefault && (
                  <span className="text-xs font-semibold text-primary bg-primary/20 px-2 py-1 rounded">
                    Recommended
                  </span>
                )}
                <span className="text-muted-foreground text-sm">→</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}