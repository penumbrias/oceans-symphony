import React from "react";

// value: undefined (not set) | number (0-5) | boolean (yes/no)
export default function SymptomItem({ label, type, value, onChange }) {
  const isUnset = value === undefined || value === null;

  return (
    <div className="bg-card border border-border/50 rounded-xl p-3 space-y-2.5">
      <p className="font-medium text-sm">{label}</p>
      <div className="flex items-center gap-2 flex-wrap">
        {/* Unset button */}
        <button
          onClick={() => onChange(undefined)}
          className={`w-7 h-7 rounded-full border flex items-center justify-center text-sm transition-all ${
            isUnset ? "border-yellow-500 text-yellow-500" : "border-border text-muted-foreground hover:border-border/80"
          }`}
        >
          –
        </button>

        {type === "rating" && (
          [0, 1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              onClick={() => onChange(n)}
              className={`w-8 h-8 rounded-full border text-sm font-medium transition-all ${
                value === n
                  ? "bg-primary border-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:border-primary/50"
              }`}
            >
              {n}
            </button>
          ))
        )}

        {type === "boolean" && (
          <>
            <button
              onClick={() => onChange(true)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-medium transition-all ${
                value === true
                  ? "bg-green-500/10 border-green-500/60 text-green-600"
                  : "border-border text-muted-foreground hover:border-green-500/40"
              }`}
            >
              <span>✅</span> Yes
            </button>
            <button
              onClick={() => onChange(false)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-medium transition-all ${
                value === false
                  ? "bg-red-500/10 border-red-500/60 text-red-600"
                  : "border-border text-muted-foreground hover:border-red-500/40"
              }`}
            >
              <span>❌</span> No
            </button>
          </>
        )}
      </div>
    </div>
  );
}