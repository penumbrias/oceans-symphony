import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EMOTIONAL_STATES } from "@/utils/groundingDefaults";

export default function StateCheckFlow({ onComplete, onBack }) {
  const [selected, setSelected] = useState([]);

  const toggle = (id) => {
    setSelected(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <button onClick={onBack} className="text-xs text-muted-foreground hover:text-foreground mb-3 flex items-center gap-1 transition-colors">
          ← Back
        </button>
        <h2 className="text-lg font-semibold text-foreground">What's happening right now?</h2>
        <p className="text-sm text-muted-foreground mt-1">Select anything that feels true. You can choose more than one.</p>
      </div>

      <div className="grid grid-cols-1 gap-2.5">
        {EMOTIONAL_STATES.map(state => {
          const isSelected = selected.includes(state.id);
          return (
            <button
              key={state.id}
              onClick={() => toggle(state.id)}
              className={`text-left px-4 py-3 rounded-xl border transition-all ${
                isSelected
                  ? "bg-primary/10 border-primary/40 text-primary"
                  : "bg-card border-border/60 hover:border-primary/20 hover:bg-primary/5"
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-xl flex-shrink-0">{state.emoji}</span>
                <div>
                  <p className={`font-medium text-sm ${isSelected ? "text-primary" : "text-foreground"}`}>
                    {state.label}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{state.description}</p>
                </div>
                {isSelected && (
                  <div className="ml-auto w-5 h-5 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-xs font-bold">✓</span>
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <Button
        disabled={selected.length === 0}
        onClick={() => onComplete(selected)}
        className="w-full"
      >
        Show me what might help
      </Button>
    </div>
  );
}