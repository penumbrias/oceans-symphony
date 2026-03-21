import React from "react";
import { Users } from "lucide-react";

export default function AlterSelector({ alters, selected, onChange }) {
  const toggle = (id) => {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  };

  const activeAlters = alters.filter((a) => !a.is_archived);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Users className="w-3.5 h-3.5" />
        <span>Fronting alters</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {activeAlters.map((a) => (
          <button
            key={a.id}
            onClick={() => toggle(a.id)}
            className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
              selected.includes(a.id)
                ? "border-primary/60 bg-primary/10 text-primary"
                : "border-border/50 text-muted-foreground hover:border-border"
            }`}
          >
            {a.name}
          </button>
        ))}
      </div>
    </div>
  );
}